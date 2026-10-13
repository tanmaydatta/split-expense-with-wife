import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { SplitRequest } from "../../../shared-types";
import type { getDb } from "../db";
import {
	bankConnections,
	bankTransactions,
	transactions,
} from "../db/schema/schema";
import { createErrorResponse, createJsonResponse, withAuth } from "../utils";
import { currencyScale } from "../utils/bank-provider";
import {
	bankingEnabled,
	bankProvider,
	bankProviders,
} from "../utils/bank-registry";
import { acquireBankLease, releaseBankLease } from "../utils/bank-sync";
import { createSplitTransactionFromRequest } from "../utils/scheduled-action-execution";

type Db = ReturnType<typeof getDb>;
const BankId = z.object({
	bankTransactionId: z.string().min(1).max(500),
	sourceVersion: z.number().int().nonnegative().optional(),
});
const MatchInput = BankId.extend({
	transactionId: z.string().min(1).max(200).optional(),
	budgetEntryId: z.string().min(1).max(200).optional(),
	draftId: z.string().min(1).max(200).optional(),
	draftVersion: z.number().int().nonnegative().optional(),
}).refine((value) => value.transactionId || value.budgetEntryId);
const CreateInput = BankId.extend({
	description: z.string().trim().min(1).max(255),
	splitPctShares: z.record(z.string(), z.number().min(0).max(100)),
	allowPossibleDuplicate: z.boolean().optional(),
});

function unavailable(request: Request, env: Env): Response {
	return createErrorResponse(
		"Bank imports are not configured",
		503,
		request,
		env,
	);
}

async function ownedBankRow(
	db: Db,
	bankTransactionId: string,
	userId: string,
	env: Env,
) {
	const row = (
		await db
			.select()
			.from(bankTransactions)
			.where(
				and(
					eq(bankTransactions.id, bankTransactionId),
					eq(bankTransactions.userId, userId),
				),
			)
			.limit(1)
	)[0];
	if (!row) return undefined;
	const connection = (
		await db
			.select()
			.from(bankConnections)
			.where(eq(bankConnections.id, row.connectionId))
			.limit(1)
	)[0];
	return connection && bankProvider(connection.provider).enabled(env)
		? row
		: undefined;
}

async function belongsToCurrentGroup(
	db: Db,
	connectionId: string,
	groupId: string,
): Promise<boolean> {
	const rows = await db
		.select({ id: bankConnections.id })
		.from(bankConnections)
		.where(
			and(
				eq(bankConnections.id, connectionId),
				eq(bankConnections.groupId, groupId),
			),
		)
		.limit(1);
	return rows.length > 0;
}

function canReview(
	row: typeof bankTransactions.$inferSelect | undefined,
): row is typeof bankTransactions.$inferSelect {
	return (
		!!row &&
		!row.pending &&
		!row.removedAt &&
		!row.linkedTransactionId &&
		!row.linkedBudgetEntryId &&
		row.amountMinor > 0 &&
		row.reviewStatus === "unreviewed"
	);
}

function bankMajor(amountMinor: number, currency: string): number {
	return amountMinor / currencyScale(currency);
}

function canAssociate(
	row: typeof bankTransactions.$inferSelect | undefined,
): row is typeof bankTransactions.$inferSelect {
	return (
		!!row && !row.pending && !row.removedAt && row.reviewStatus !== "ignored"
	);
}

export async function handleBankCandidates(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const params = new URL(request.url).searchParams;
		const bank = await ownedBankRow(
			db,
			params.get("bankTransactionId") ?? "",
			session.user.id,
			env,
		);
		if (
			!bank ||
			bank.removedAt ||
			!session.group ||
			!(await belongsToCurrentGroup(
				db,
				bank.connectionId,
				session.group.groupid,
			))
		)
			return createErrorResponse(
				"Bank activity cannot be reviewed in this group",
				400,
				request,
				env,
			);
		return searchCandidates(
			request,
			env,
			session.group.groupid,
			bank.amountMinor,
			bank.currency,
		);
	});
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded candidate filters use explicit kind and financial direction.
export async function searchCandidates(
	request: Request,
	env: Env,
	groupId: string,
	amount: number,
	currency: string,
): Promise<Response> {
	const params = new URL(request.url).searchParams;
	const budget = params.get("kind") === "budget";
	const offset = Math.max(
		0,
		Math.min(100000, Number(params.get("offset")) || 0),
	);
	const q = (params.get("q") ?? "").slice(0, 255);
	const from = params.get("from") ?? "";
	const to = params.get("to") ?? "9999";
	if (!budget && amount <= 0)
		return createJsonResponse(
			{ candidates: [], hasMore: false },
			200,
			{},
			request,
			env,
		);
	const table = budget
		? "budget_entries r JOIN group_budgets g ON g.id = r.budget_id"
		: "transactions r";
	const id = budget ? "r.budget_entry_id" : "r.transaction_id";
	const date = budget ? "r.added_time" : "r.created_at";
	const owner = budget
		? "g.group_id = ? AND g.deleted IS NULL"
		: "r.group_id = ?";
	const query = `SELECT ${id} AS id, r.description, r.amount, r.currency, ${date} AS date
 FROM ${table} WHERE ${owner} AND r.deleted IS NULL AND r.currency = ?
 AND round(r.amount * ?) = ? AND instr(lower(r.description),lower(?)) > 0
 AND substr(${date},1,10) >= ? AND substr(${date},1,10) <= ? ORDER BY ${date} DESC, ${id} LIMIT 51 OFFSET ?`;
	const result = await env.DB.prepare(query)
		.bind(
			groupId,
			currency,
			currencyScale(currency),
			budget ? -amount : amount,
			q,
			from,
			to,
			offset,
		)
		.all();
	return createJsonResponse(
		{
			candidates: result.results.slice(0, 50),
			hasMore: result.results.length > 50,
			offset,
		},
		200,
		{},
		request,
		env,
	);
}

export async function handleBankMatch(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one atomic confirmation validates owner, source, existing ledger records and compatible pairs.
	return withAuth(request, env, async (session, db) => {
		const parsed = MatchInput.safeParse(await request.json());
		if (!parsed.success || !session.group)
			return createErrorResponse("Invalid match", 400, request, env);
		const bank = await ownedBankRow(
			db,
			parsed.data.bankTransactionId,
			session.user.id,
			env,
		);
		if (
			!canAssociate(bank) ||
			(parsed.data.sourceVersion !== undefined &&
				parsed.data.sourceVersion !== bank.rowVersion)
		)
			return createErrorResponse(
				"Bank activity changed. Refresh and confirm again.",
				409,
				request,
				env,
			);
		const groupId = session.group.groupid;
		if (!(await belongsToCurrentGroup(db, bank.connectionId, groupId)))
			return createErrorResponse(
				"Bank activity belongs to another group",
				400,
				request,
				env,
			);
		const transactionId = parsed.data.transactionId ?? bank.linkedTransactionId;
		const budgetEntryId = parsed.data.budgetEntryId ?? bank.linkedBudgetEntryId;
		if (
			(bank.linkedTransactionId &&
				transactionId !== bank.linkedTransactionId) ||
			(bank.linkedBudgetEntryId && budgetEntryId !== bank.linkedBudgetEntryId)
		)
			return createErrorResponse(
				"Existing confirmed links cannot be replaced",
				409,
				request,
				env,
			);
		if (
			transactionId === bank.linkedTransactionId &&
			budgetEntryId === bank.linkedBudgetEntryId
		)
			return createErrorResponse(
				"These records are already associated",
				409,
				request,
				env,
			);
		const lease = await acquireBankLease(db, bank.connectionId).catch(
			() => null,
		);
		if (!lease)
			return createErrorResponse(
				"Bank sync is in progress. Try again shortly.",
				409,
				request,
				env,
			);
		try {
			const expense = transactionId
				? await env.DB.prepare(
						`SELECT transaction_id FROM transactions WHERE transaction_id = ? AND group_id = ? AND deleted IS NULL AND currency = ? AND round(amount * ?) = ?`,
					)
						.bind(
							transactionId,
							groupId,
							bank.currency,
							currencyScale(bank.currency),
							bank.amountMinor,
						)
						.first()
				: null;
			const budget = budgetEntryId
				? await env.DB.prepare(
						`SELECT b.budget_entry_id FROM budget_entries b JOIN group_budgets g ON g.id = b.budget_id WHERE b.budget_entry_id = ? AND g.group_id = ? AND b.deleted IS NULL AND g.deleted IS NULL AND b.currency = ? AND round(b.amount * ?) = ?`,
					)
						.bind(
							budgetEntryId,
							groupId,
							bank.currency,
							currencyScale(bank.currency),
							-bank.amountMinor,
						)
						.first()
				: null;
			if (
				(transactionId && (!expense || bank.amountMinor <= 0)) ||
				(budgetEntryId && !budget)
			)
				return createErrorResponse(
					"Selected records must match currency, amount and direction",
					400,
					request,
					env,
				);
			// Existing exact pairs remain compatible even when historical records have other links.
			const pairGuard =
				transactionId && budgetEntryId
					? `AND (EXISTS (SELECT 1 FROM expense_budget_links WHERE transaction_id = ? AND budget_entry_id = ? AND group_id = ?) OR NOT EXISTS (SELECT 1 FROM expense_budget_links WHERE transaction_id = ? OR budget_entry_id = ?))`
					: "";
			const args: Array<string | number | null> = [
				transactionId,
				budgetEntryId,
				new Date().toISOString(),
				bank.id,
				session.user.id,
				bank.rowVersion,
				bank.linkedTransactionId,
				bank.linkedBudgetEntryId,
				bank.connectionId,
				lease.syncLock,
				session.user.id,
				groupId,
			];
			if (pairGuard)
				args.push(
					transactionId,
					budgetEntryId,
					groupId,
					transactionId,
					budgetEntryId,
				);
			const ledgerGuard = `${transactionId ? "AND EXISTS (SELECT 1 FROM transactions WHERE transaction_id=? AND group_id=? AND deleted IS NULL AND currency=? AND round(amount * ?)=?)" : ""}
    ${budgetEntryId ? "AND EXISTS (SELECT 1 FROM budget_entries b JOIN group_budgets g ON g.id=b.budget_id WHERE b.budget_entry_id=? AND g.group_id=? AND b.deleted IS NULL AND g.deleted IS NULL AND b.currency=? AND round(b.amount * ?)=?)" : ""}`;
			if (transactionId)
				args.push(
					transactionId,
					groupId,
					bank.currency,
					currencyScale(bank.currency),
					bank.amountMinor,
				);
			if (budgetEntryId)
				args.push(
					budgetEntryId,
					groupId,
					bank.currency,
					currencyScale(bank.currency),
					-bank.amountMinor,
				);
			if (parsed.data.draftId) {
				const draft = await env.DB.prepare(
					"SELECT id FROM bank_review_drafts WHERE id=? AND user_id=? AND connection_id=? AND account_id=? AND status='active' AND amount_minor=? AND currency=? AND transaction_id IS ? AND budget_entry_id IS ?",
				)
					.bind(
						parsed.data.draftId,
						session.user.id,
						bank.connectionId,
						bank.accountId,
						bank.amountMinor,
						bank.currency,
						transactionId,
						budgetEntryId,
					)
					.first();
				if (!draft)
					return createErrorResponse(
						"Provisional choice changed. Choose compatible records again.",
						409,
						request,
						env,
					);
			}
			const claim =
				env.DB.prepare(`UPDATE bank_transactions SET linked_transaction_id = ?, linked_budget_entry_id = ?, review_status = CASE WHEN review_status = 'created' THEN 'created' ELSE 'matched' END, row_version = row_version + 1, updated_at = ?
    WHERE id = ? AND user_id = ? AND row_version = ? AND linked_transaction_id IS ? AND linked_budget_entry_id IS ? AND pending = 0 AND removed_at IS NULL AND review_status <> 'ignored'
    AND EXISTS (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ? AND user_id = ? AND group_id = ? AND status <> 'disconnected') ${pairGuard} ${ledgerGuard}`).bind(
					...args,
				);
			const statements = [
				claim,
				env.DB.prepare(
					"SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('bank-review-claim-failed') END",
				),
			];
			if (transactionId && budgetEntryId)
				statements.push(
					env.DB.prepare(
						`INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM expense_budget_links WHERE transaction_id = ? AND budget_entry_id = ?)`,
					).bind(
						ulid(),
						transactionId,
						budgetEntryId,
						groupId,
						new Date().toISOString(),
						transactionId,
						budgetEntryId,
					),
				);
			if (parsed.data.draftId) {
				statements.push(
					env.DB.prepare(`UPDATE bank_review_drafts SET status='confirmed',version=version+1,updated_at=?
                WHERE id=? AND user_id=? AND connection_id=? AND account_id=? AND status='active' AND version=?
                AND transaction_id IS ? AND budget_entry_id IS ? AND amount_minor=? AND currency=?`).bind(
						new Date().toISOString(),
						parsed.data.draftId,
						session.user.id,
						bank.connectionId,
						bank.accountId,
						parsed.data.draftVersion ?? 0,
						transactionId,
						budgetEntryId,
						bank.amountMinor,
						bank.currency,
					),
				);
				statements.push(
					env.DB.prepare(
						"SELECT CASE WHEN changes()=1 THEN 1 ELSE json('stale-provisional-confirmation') END",
					),
				);
			}
			await env.DB.batch(statements);
			return createJsonResponse(
				{ transactionId, budgetEntryId },
				200,
				{},
				request,
				env,
			);
		} catch {
			return createErrorResponse(
				"Records already matched, conflicting expense–budget links, or activity changed. Refresh and choose compatible records.",
				409,
				request,
				env,
			);
		} finally {
			await releaseBankLease(db, lease);
		}
	});
}

export async function handleBankIgnore(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ownership, source-version and lease checks guard one private review action.
	return withAuth(request, env, async (session, db) => {
		const parsed = BankId.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse("Invalid bank activity", 400, request, env);
		const bank = await ownedBankRow(
			db,
			parsed.data.bankTransactionId,
			session.user.id,
			env,
		);
		if (
			!bank ||
			bank.pending ||
			bank.removedAt ||
			bank.linkedTransactionId ||
			bank.linkedBudgetEntryId ||
			bank.reviewStatus !== "unreviewed" ||
			(parsed.data.sourceVersion !== undefined &&
				parsed.data.sourceVersion !== bank.rowVersion)
		)
			return createErrorResponse(
				"Bank activity changed or was already reviewed",
				409,
				request,
				env,
			);
		const lease = await acquireBankLease(db, bank.connectionId).catch(
			() => null,
		);
		if (!lease)
			return createErrorResponse(
				"Bank sync is in progress. Refresh and confirm again shortly.",
				409,
				request,
				env,
			);
		try {
			const updated = await db
				.update(bankTransactions)
				.set({
					rowVersion: sql`${bankTransactions.rowVersion} + 1`,
					reviewStatus: "ignored",
					updatedAt: new Date().toISOString(),
				})
				.where(
					and(
						eq(bankTransactions.id, bank.id),
						eq(bankTransactions.reviewStatus, "unreviewed"),
						eq(bankTransactions.rowVersion, bank.rowVersion),
						eq(bankTransactions.updatedAt, bank.updatedAt),
						eq(bankTransactions.amountMinor, bank.amountMinor),
						eq(bankTransactions.currency, bank.currency),
						eq(bankTransactions.pending, false),
						isNull(bankTransactions.removedAt),
						isNull(bankTransactions.linkedTransactionId),
					),
				)
				.returning({ id: bankTransactions.id });
			if (!updated.length)
				return createErrorResponse(
					"Bank activity was already reviewed",
					409,
					request,
					env,
				);
			return createJsonResponse({ status: "ignored" }, 200, {}, request, env);
		} finally {
			await releaseBankLease(db, lease);
		}
	});
}

export async function handleBankRestore(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const parsed = BankId.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse("Invalid bank activity", 400, request, env);
		const bank = await ownedBankRow(
			db,
			parsed.data.bankTransactionId,
			session.user.id,
			env,
		);
		if (!bank || bank.reviewStatus !== "ignored")
			return createErrorResponse(
				"Ignored bank activity not found",
				404,
				request,
				env,
			);
		await db
			.update(bankTransactions)
			.set({
				rowVersion: sql`${bankTransactions.rowVersion} + 1`,
				reviewStatus: "unreviewed",
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(bankTransactions.id, bank.id),
					eq(bankTransactions.rowVersion, bank.rowVersion),
				),
			);
		return createJsonResponse({ status: "unreviewed" }, 200, {}, request, env);
	});
}

export async function handleBankCreateExpense(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation and atomic ledger linking form one confirmed action
	return withAuth(request, env, async (session, db) => {
		const parsed = CreateInput.safeParse(await request.json());
		if (!parsed.success || !session.group)
			return createErrorResponse("Invalid expense", 400, request, env);
		const bank = await ownedBankRow(
			db,
			parsed.data.bankTransactionId,
			session.user.id,
			env,
		);
		if (
			!canReview(bank) ||
			(parsed.data.sourceVersion !== undefined &&
				parsed.data.sourceVersion !== bank.rowVersion)
		)
			return createErrorResponse(
				"Bank activity changed or was already reviewed",
				409,
				request,
				env,
			);
		if (
			!(await belongsToCurrentGroup(
				db,
				bank.connectionId,
				session.group.groupid,
			))
		)
			return createErrorResponse(
				"Bank activity belongs to another group",
				400,
				request,
				env,
			);
		const lease = await acquireBankLease(db, bank.connectionId).catch(
			() => null,
		);
		if (!lease)
			return createErrorResponse(
				"Bank sync is in progress. Refresh and confirm again shortly.",
				409,
				request,
				env,
			);
		try {
			const members = new Set(session.group.userids);
			const shares = parsed.data.splitPctShares;
			if (
				Object.keys(shares).length === 0 ||
				Object.keys(shares).some((id) => !members.has(id)) ||
				Math.abs(
					Object.values(shares).reduce((sum, value) => sum + value, 0) - 100,
				) > 0.001
			) {
				return createErrorResponse(
					"Split shares must total 100% across group members",
					400,
					request,
					env,
				);
			}
			// A scheduled expense for the same charge must be matched rather than recreated.
			const nearby = await db
				.select({
					id: transactions.transactionId,
					amount: transactions.amount,
					date: transactions.createdAt,
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.groupId, session.group.groupid),
						eq(transactions.currency, bank.currency),
						isNull(transactions.deleted),
					),
				)
				.orderBy(desc(transactions.createdAt))
				.limit(200);
			const scheduledDuplicate = nearby.find(
				(row) =>
					/_\d{4}-\d{2}-\d{2}$/.test(row.id) &&
					Math.round(row.amount * currencyScale(bank.currency)) ===
						bank.amountMinor &&
					Math.abs(Date.parse(row.id.slice(-10)) - Date.parse(bank.date)) <=
						3 * 86400000,
			);
			if (scheduledDuplicate && !parsed.data.allowPossibleDuplicate)
				return createErrorResponse(
					"A scheduled expense has the same amount near this date. Match it, or confirm Add anyway if this is a separate purchase",
					409,
					request,
					env,
				);
			const amount = bankMajor(bank.amountMinor, bank.currency);
			const split: SplitRequest = {
				amount,
				description: parsed.data.description,
				currency: bank.currency,
				paidByShares: { [session.user.id]: amount },
				splitPctShares: shares,
			};
			const transactionId = `tx_bank_${bank.id}`;
			try {
				const result = await createSplitTransactionFromRequest(
					split,
					session.group.groupid,
					db,
					env,
					transactionId,
				);
				if (!result.statements.length)
					return createErrorResponse(
						"Expense already exists for this bank activity",
						409,
						request,
						env,
					);
				// Claim and ledger creation share one atomic D1 batch. A zero-row CAS aborts all writes.
				const claim = db
					.update(bankTransactions)
					.set({
						rowVersion: sql`${bankTransactions.rowVersion} + 1`,
						linkedTransactionId: transactionId,
						reviewStatus: "created",
						updatedAt: new Date().toISOString(),
					})
					.where(
						and(
							eq(bankTransactions.id, bank.id),
							eq(bankTransactions.reviewStatus, "unreviewed"),
							eq(bankTransactions.rowVersion, bank.rowVersion),
							eq(bankTransactions.updatedAt, bank.updatedAt),
							eq(bankTransactions.date, bank.date),
							eq(bankTransactions.name, bank.name),
							bank.merchantName === null
								? isNull(bankTransactions.merchantName)
								: eq(bankTransactions.merchantName, bank.merchantName),
							eq(bankTransactions.amountMinor, bank.amountMinor),
							eq(bankTransactions.currency, bank.currency),
							eq(bankTransactions.pending, false),
							isNull(bankTransactions.removedAt),
							isNull(bankTransactions.linkedTransactionId),
							sql`EXISTS (SELECT 1 FROM bank_connections WHERE id = ${bank.connectionId} AND sync_lock = ${lease.syncLock})`,
						),
					);
				// SQLite CASE evaluates only its selected branch; invalid JSON raises and rolls back the batch on failed claim.
				// Keep this immediately after claim: changes() is the previous statement's affected-row count.
				const assertClaim = db.run(
					sql.raw(
						"SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('bank-review-claim-failed') END AS bank_review_claim",
					),
				);
				await db.batch([
					claim,
					assertClaim,
					...result.statements.map((statement) => statement.query),
				]);

				return createJsonResponse({ transactionId }, 201, {}, request, env);
			} catch {
				console.error("Bank expense creation failed");
				return createErrorResponse(
					"Could not create expense from bank activity",
					409,
					request,
					env,
				);
			}
		} finally {
			await releaseBankLease(db, lease);
		}
	});
}

export async function handleBankLinkedIds(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const rows = await db
			.select({ id: bankTransactions.linkedTransactionId })
			.from(bankTransactions)
			.innerJoin(
				bankConnections,
				eq(bankTransactions.connectionId, bankConnections.id),
			)
			.where(
				and(
					eq(bankTransactions.userId, session.user.id),
					isNotNull(bankTransactions.linkedTransactionId),
					inArray(
						bankConnections.provider,
						Object.values(bankProviders)
							.filter((provider) => provider.enabled(env))
							.map((provider) => provider.id),
					),
				),
			);
		return createJsonResponse(
			{ transactionIds: rows.map((row) => row.id) },
			200,
			{},
			request,
			env,
		);
	});
}
