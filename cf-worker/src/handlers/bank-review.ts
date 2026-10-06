import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { SplitRequest } from "../../../shared-types";
import type { getDb } from "../db";
import { bankConnections, bankTransactions, transactions } from "../db/schema/schema";
import { createErrorResponse, createJsonResponse, withAuth } from "../utils";
import { createSplitTransactionFromRequest } from "../utils/scheduled-action-execution";
import { currencyScale } from "../utils/bank-provider";
import { bankingEnabled, bankProvider } from "../utils/bank-registry";

type Db = ReturnType<typeof getDb>;
const BankId = z.object({ bankTransactionId: z.string().min(1).max(500), sourceVersion: z.string().optional() });
const MatchInput = BankId.extend({ transactionId: z.string().min(1).max(200) });
const CreateInput = BankId.extend({
	description: z.string().trim().min(1).max(255),
	splitPctShares: z.record(z.string(), z.number().min(0).max(100)),
	allowPossibleDuplicate: z.boolean().optional(),
});

function unavailable(request: Request, env: Env): Response {
	return createErrorResponse("Bank imports are not configured", 503, request, env);
}

async function ownedBankRow(db: Db, bankTransactionId: string, userId: string, env: Env) {
	const row = (await db.select().from(bankTransactions).where(and(eq(bankTransactions.id, bankTransactionId), eq(bankTransactions.userId, userId))).limit(1))[0];
 if (!row) return undefined;
 const connection = (await db.select().from(bankConnections).where(eq(bankConnections.id, row.connectionId)).limit(1))[0];
 return connection && bankProvider(connection.provider).enabled(env) ? row : undefined;
}

async function belongsToCurrentGroup(db: Db, connectionId: string, groupId: string): Promise<boolean> {
	const rows = await db.select({ id: bankConnections.id }).from(bankConnections)
		.where(and(eq(bankConnections.id, connectionId), eq(bankConnections.groupId, groupId))).limit(1);
	return rows.length > 0;
}

function canReview(row: typeof bankTransactions.$inferSelect | undefined): row is typeof bankTransactions.$inferSelect {
	return !!row && !row.pending && !row.removedAt && !row.linkedTransactionId && row.amountMinor > 0 && row.reviewStatus === "unreviewed";
}

function bankMajor(amountMinor: number, currency: string): number {
	return amountMinor / currencyScale(currency);
}

export async function handleBankCandidates(request: Request, env: Env): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const bankTransactionId = new URL(request.url).searchParams.get("bankTransactionId") ?? "";
		const bank = await ownedBankRow(db, bankTransactionId, session.user.id, env);
		if (!canReview(bank) || !session.group || !await belongsToCurrentGroup(db, bank.connectionId, session.group.groupid)) return createErrorResponse("Bank activity cannot be reviewed in this group", 400, request, env);
		const rows = await db.select({ id: transactions.transactionId, description: transactions.description,
			amount: transactions.amount, currency: transactions.currency, date: transactions.createdAt })
			.from(transactions).where(and(eq(transactions.groupId, session.group.groupid), eq(transactions.currency, bank.currency), isNull(transactions.deleted)))
			.orderBy(desc(transactions.createdAt)).limit(200);
		const candidates = rows.filter(row => Math.round(row.amount * currencyScale(bank.currency)) === bank.amountMinor)
			.map(row => ({ ...row, scheduled: /_\d{4}-\d{2}-\d{2}$/.test(row.id), suggested:
				Math.abs(Date.parse(row.date) - Date.parse(bank.date)) <= 7 * 86400000 &&
				row.description.toLowerCase().includes((bank.merchantName ?? bank.name).toLowerCase().slice(0, 5)) }));
		return createJsonResponse({ candidates }, 200, {}, request, env);
	});
}

export async function handleBankMatch(request: Request, env: Env): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: owner, amount, currency and uniqueness checks protect a confirmed match
	return withAuth(request, env, async (session, db) => {
		const parsed = MatchInput.safeParse(await request.json());
		if (!parsed.success || !session.group) return createErrorResponse("Invalid match", 400, request, env);
		const bank = await ownedBankRow(db, parsed.data.bankTransactionId, session.user.id, env);
		if (!canReview(bank) || (parsed.data.sourceVersion && parsed.data.sourceVersion !== bank.updatedAt)) return createErrorResponse("Bank activity changed or was already reviewed", 409, request, env);
		if (!await belongsToCurrentGroup(db, bank.connectionId, session.group.groupid)) return createErrorResponse("Bank activity belongs to another group", 400, request, env);
		const app = (await db.select().from(transactions).where(and(eq(transactions.transactionId, parsed.data.transactionId), eq(transactions.groupId, session.group.groupid), isNull(transactions.deleted))).limit(1))[0];
		if (!app || app.currency !== bank.currency || Math.round(app.amount * currencyScale(bank.currency)) !== bank.amountMinor) {
			return createErrorResponse("Expense amount and currency must match the bank charge", 400, request, env);
		}
		const alreadyLinked = (await db.select({ id: bankTransactions.id }).from(bankTransactions).where(eq(bankTransactions.linkedTransactionId, app.transactionId)).limit(1))[0];
		if (alreadyLinked) return createErrorResponse("Expense is already matched to bank activity", 409, request, env);
		try {
			const updated = await db.update(bankTransactions).set({ linkedTransactionId: app.transactionId, reviewStatus: "matched", updatedAt: new Date().toISOString() })
				.where(and(eq(bankTransactions.id, bank.id), eq(bankTransactions.reviewStatus, "unreviewed"), eq(bankTransactions.amountMinor, bank.amountMinor), eq(bankTransactions.currency, bank.currency), eq(bankTransactions.pending, false), isNull(bankTransactions.removedAt), isNull(bankTransactions.linkedTransactionId))).returning({ id: bankTransactions.id });
			if (!updated.length) return createErrorResponse("Bank activity was already reviewed", 409, request, env);
			return createJsonResponse({ transactionId: app.transactionId }, 200, {}, request, env);
		} catch {
			return createErrorResponse("Expense is already matched to bank activity", 409, request, env);
		}
	});
}

export async function handleBankIgnore(request: Request, env: Env): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const parsed = BankId.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid bank activity", 400, request, env);
		const bank = await ownedBankRow(db, parsed.data.bankTransactionId, session.user.id, env);
		if (!canReview(bank) || (parsed.data.sourceVersion && parsed.data.sourceVersion !== bank.updatedAt)) return createErrorResponse("Bank activity changed or was already reviewed", 409, request, env);
		const updated = await db.update(bankTransactions).set({ reviewStatus: "ignored", updatedAt: new Date().toISOString() })
			.where(and(eq(bankTransactions.id, bank.id), eq(bankTransactions.reviewStatus, "unreviewed"), eq(bankTransactions.amountMinor, bank.amountMinor), eq(bankTransactions.currency, bank.currency), eq(bankTransactions.pending, false), isNull(bankTransactions.removedAt), isNull(bankTransactions.linkedTransactionId))).returning({ id: bankTransactions.id });
		if (!updated.length) return createErrorResponse("Bank activity was already reviewed", 409, request, env);
		return createJsonResponse({ status: "ignored" }, 200, {}, request, env);
	});
}

export async function handleBankRestore(request: Request, env: Env): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const parsed = BankId.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid bank activity", 400, request, env);
		const bank = await ownedBankRow(db, parsed.data.bankTransactionId, session.user.id, env);
		if (!bank || bank.reviewStatus !== "ignored") return createErrorResponse("Ignored bank activity not found", 404, request, env);
		await db.update(bankTransactions).set({ reviewStatus: "unreviewed", updatedAt: new Date().toISOString() }).where(eq(bankTransactions.id, bank.id));
		return createJsonResponse({ status: "unreviewed" }, 200, {}, request, env);
	});
}

export async function handleBankCreateExpense(request: Request, env: Env): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation and atomic ledger linking form one confirmed action
	return withAuth(request, env, async (session, db) => {
		const parsed = CreateInput.safeParse(await request.json());
		if (!parsed.success || !session.group) return createErrorResponse("Invalid expense", 400, request, env);
		const bank = await ownedBankRow(db, parsed.data.bankTransactionId, session.user.id, env);
		if (!canReview(bank) || (parsed.data.sourceVersion && parsed.data.sourceVersion !== bank.updatedAt)) return createErrorResponse("Bank activity changed or was already reviewed", 409, request, env);
		if (!await belongsToCurrentGroup(db, bank.connectionId, session.group.groupid)) return createErrorResponse("Bank activity belongs to another group", 400, request, env);
		const members = new Set(session.group.userids);
		const shares = parsed.data.splitPctShares;
		if (Object.keys(shares).length === 0 || Object.keys(shares).some(id => !members.has(id)) || Math.abs(Object.values(shares).reduce((sum, value) => sum + value, 0) - 100) > 0.001) {
			return createErrorResponse("Split shares must total 100% across group members", 400, request, env);
		}
		// A scheduled expense for the same charge must be matched rather than recreated.
		const nearby = await db.select({ id: transactions.transactionId, amount: transactions.amount, date: transactions.createdAt })
			.from(transactions).where(and(eq(transactions.groupId, session.group.groupid), eq(transactions.currency, bank.currency), isNull(transactions.deleted)))
			.orderBy(desc(transactions.createdAt)).limit(200);
		const scheduledDuplicate = nearby.find(row => /_\d{4}-\d{2}-\d{2}$/.test(row.id) &&
			Math.round(row.amount * currencyScale(bank.currency)) === bank.amountMinor &&
			Math.abs(Date.parse(row.id.slice(-10)) - Date.parse(bank.date)) <= 3 * 86400000);
		if (scheduledDuplicate && !parsed.data.allowPossibleDuplicate) return createErrorResponse("A scheduled expense has the same amount near this date. Match it, or confirm Add anyway if this is a separate purchase", 409, request, env);
		const amount = bankMajor(bank.amountMinor, bank.currency);
		const split: SplitRequest = { amount, description: parsed.data.description, currency: bank.currency,
			paidByShares: { [session.user.id]: amount }, splitPctShares: shares };
		const transactionId = `tx_bank_${bank.id}`;
		let claimed = false;
		try {
			const result = await createSplitTransactionFromRequest(split, session.group.groupid, db, env, transactionId);
			if (!result.statements.length) return createErrorResponse("Expense already exists for this bank activity", 409, request, env);
			// Claim the bank row before writing ledger entries so a concurrent Match cannot win.
			const claim = await db.update(bankTransactions).set({ linkedTransactionId: transactionId, updatedAt: new Date().toISOString() })
				.where(and(eq(bankTransactions.id, bank.id), eq(bankTransactions.reviewStatus, "unreviewed"), eq(bankTransactions.amountMinor, bank.amountMinor), eq(bankTransactions.currency, bank.currency), eq(bankTransactions.pending, false), isNull(bankTransactions.removedAt), isNull(bankTransactions.linkedTransactionId)))
				.returning({ id: bankTransactions.id });
			if (!claim.length) return createErrorResponse("Bank activity was already reviewed", 409, request, env);
			claimed = true;
			const link = db.update(bankTransactions).set({ reviewStatus: "created" as const, updatedAt: new Date().toISOString() })
				.where(and(eq(bankTransactions.id, bank.id), eq(bankTransactions.reviewStatus, "unreviewed"), eq(bankTransactions.linkedTransactionId, transactionId)));
			await db.batch([result.statements[0].query, ...result.statements.slice(1).map(statement => statement.query), link]);
			return createJsonResponse({ transactionId }, 201, {}, request, env);
		} catch (error) {
			if (claimed) await db.update(bankTransactions).set({ linkedTransactionId: null })
				.where(and(eq(bankTransactions.id, bank.id), eq(bankTransactions.reviewStatus, "unreviewed"), eq(bankTransactions.linkedTransactionId, transactionId)));
			console.error("Bank expense creation failed", error instanceof Error ? error.message : "unknown");
			return createErrorResponse("Could not create expense from bank activity", 409, request, env);
		}
	});
}

export async function handleBankLinkedIds(request: Request, env: Env): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuth(request, env, async (session, db) => {
		const rows = await db.select({ id: bankTransactions.linkedTransactionId }).from(bankTransactions)
			.where(and(eq(bankTransactions.userId, session.user.id), isNotNull(bankTransactions.linkedTransactionId)));
		return createJsonResponse({ transactionIds: rows.map(row => row.id) }, 200, {}, request, env);
	});
}
