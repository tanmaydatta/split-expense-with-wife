import { z } from "zod";
import { ulid } from "ulid";
import { createErrorResponse, createJsonResponse, withAuth } from "../utils";
import { bankingEnabled, bankProviders } from "../utils/bank-registry";
import { currencyScale } from "../utils/bank-provider";
import { acquireBankLease, releaseBankLease } from "../utils/bank-sync";
import { searchCandidates } from "./bank-review";

const activity = `
 SELECT b.id,b.connection_id AS connectionId,b.account_id AS accountId,b.user_id AS userId,
 b.date,b.name,b.merchant_name AS merchantName,b.amount_minor AS amountMinor,b.currency,b.pending,
 b.linked_transaction_id AS linkedTransactionId,b.linked_budget_entry_id AS linkedBudgetEntryId,
 b.review_status AS reviewStatus,b.source_changed AS sourceChanged,b.removed_at AS removedAt,
 b.row_version AS rowVersion,b.updated_at AS updatedAt,0 AS readonlySnapshot,0 AS noLongerPending
 FROM bank_transactions b WHERE NOT (b.removed_at IS NOT NULL AND EXISTS(SELECT 1 FROM bank_review_drafts d WHERE d.bank_row_id=b.id AND d.status='active'))
 UNION ALL
 SELECT p.id,p.connection_id,p.account_id,p.user_id,p.date,p.name,p.merchant_name,p.amount_minor,p.currency,1,
 NULL,NULL,'unreviewed',0,NULL,0,p.created_at,1,0
 FROM bank_pending_snapshots p JOIN bank_accounts a ON a.id=p.account_id AND a.pending_snapshot_id=p.snapshot_id
 UNION ALL
 SELECT d.bank_row_id,d.connection_id,d.account_id,d.user_id,d.date,d.name,NULL,d.amount_minor,d.currency,1,
 NULL,NULL,'unreviewed',0,NULL,d.source_version,d.updated_at,1,1
 FROM bank_review_drafts d WHERE d.status='active'
 AND NOT EXISTS(SELECT 1 FROM bank_transactions b WHERE b.id=d.bank_row_id AND b.removed_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM bank_pending_snapshots p JOIN bank_accounts a ON a.id=p.account_id AND a.pending_snapshot_id=p.snapshot_id WHERE p.id=d.bank_row_id)
`;
function scope(env: Env, userId: string, groupId: string) {
	const providers = Object.values(bankProviders)
		.filter((p) => p.enabled(env))
		.map((p) => p.id);
	return {
		sql: `x.userId=? AND c.group_id=? AND a.selected=1 AND c.status<>'disconnected' AND c.provider IN (${providers.map(() => "?").join(",") || "NULL"})`,
		args: [userId, groupId, ...providers],
	};
}
const select = `SELECT x.*,a.name AS accountName,a.institution_name AS institutionName,c.provider,
 d.id AS draftId,CASE WHEN d.status='active' THEN d.transaction_id END AS provisionalTransactionId,CASE WHEN d.status='active' THEN d.budget_entry_id END AS provisionalBudgetEntryId,d.version AS draftVersion,d.status AS draftStatus,CASE WHEN d.status='active' AND (d.amount_minor<>x.amountMinor OR d.currency<>x.currency) THEN 1 ELSE 0 END AS provisionalSourceChanged,
 t.description AS expenseDescription,b.description AS budgetDescription
 FROM (${activity}) x JOIN bank_accounts a ON a.id=x.accountId JOIN bank_connections c ON c.id=x.connectionId
 LEFT JOIN bank_review_drafts d ON d.bank_row_id=x.id AND d.user_id=x.userId AND d.status<>'confirmed'
 LEFT JOIN transactions t ON t.transaction_id=x.linkedTransactionId AND t.group_id=c.group_id AND t.deleted IS NULL
 LEFT JOIN budget_entries b ON b.budget_entry_id=x.linkedBudgetEntryId`;
async function ownedActivity(
	env: Env,
	id: string,
	userId: string,
	groupId: string,
) {
	const guard = scope(env, userId, groupId);
	return env.DB.prepare(`${select} WHERE ${guard.sql} AND x.id=? LIMIT 1`)
		.bind(...guard.args, id)
		.first<Record<string, unknown>>();
}
export async function handleBankInbox(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env))
		return createErrorResponse(
			"Bank imports are not configured",
			503,
			request,
			env,
		);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: owner-scoped filters and bounded paging share one SQL predicate.
	return withAuth(request, env, async (session) => {
		const params = new URL(request.url).searchParams;
		const guard = scope(env, session.user.id, session.group?.groupid ?? "");
		const filters = [guard.sql];
		const args: Array<string | number> = [...guard.args];
		for (const [param, column] of [
			["provider", "c.provider"],
			["connectionId", "x.connectionId"],
			["accountId", "x.accountId"],
		]) {
			const value = params.get(param);
			if (value) {
				filters.push(`${column}=?`);
				args.push(value);
			}
		}
		const status = params.get("status") ?? "posted";
		if (
			!["all", "pending", "posted", "reviewed", "unreviewed"].includes(status)
		)
			return createErrorResponse("Invalid status filter", 400, request, env);
		if (status === "pending")
			filters.push("x.pending=1 AND x.removedAt IS NULL");
		if (status === "posted" || status === "unreviewed")
			filters.push(
				"x.pending=0 AND x.reviewStatus='unreviewed' AND x.removedAt IS NULL",
			);
		if (status === "reviewed") filters.push("x.reviewStatus<>'unreviewed'");
		const q = (params.get("q") ?? "").slice(0, 255);
		if (q) {
			filters.push(
				"instr(lower(x.name || ' ' || coalesce(x.merchantName,'') || ' ' || a.name),lower(?))>0",
			);
			args.push(q);
		}
		const offset = Math.max(
			0,
			Math.min(100000, Number(params.get("offset")) || 0),
		);
		const where = filters.join(" AND ");
		const [rows, count] = await Promise.all([
			env.DB.prepare(
				`${select} WHERE ${where} ORDER BY x.date DESC,x.id LIMIT 51 OFFSET ?`,
			)
				.bind(...args, offset)
				.all(),
			env.DB.prepare(
				`SELECT count(*) AS total FROM (${activity}) x JOIN bank_accounts a ON a.id=x.accountId JOIN bank_connections c ON c.id=x.connectionId WHERE ${where}`,
			)
				.bind(...args)
				.first<{ total: number }>(),
		]);
		return createJsonResponse(
			{
				transactions: rows.results.slice(0, 50),
				hasMore: rows.results.length > 50,
				total: count?.total ?? 0,
				offset,
			},
			200,
			{},
			request,
			env,
		);
	});
}
export async function handleBankTransactionGet(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env))
		return createErrorResponse(
			"Bank imports are not configured",
			503,
			request,
			env,
		);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: owner-scoped detail may include an explicit provisional choice and uncertain settlement suggestions.
	return withAuth(request, env, async (session) => {
		const params = new URL(request.url).searchParams;
		const id = params.get("id") ?? "";
		const row = await ownedActivity(
			env,
			id,
			session.user.id,
			session.group?.groupid ?? "",
		);
		if (!row)
			return createErrorResponse(
				"Bank activity unavailable. Return to the inbox and refresh.",
				404,
				request,
				env,
			);
		const requestedDraft = params.get("draftId");
		if (requestedDraft) {
			const draft = await env.DB.prepare(
				"SELECT id,transaction_id,budget_entry_id,version,amount_minor,currency,status FROM bank_review_drafts WHERE id=? AND user_id=? AND connection_id=? AND account_id=? AND status<>'cancelled'",
			)
				.bind(requestedDraft, session.user.id, row.connectionId, row.accountId)
				.first();
			if (!draft)
				return createErrorResponse(
					"Provisional selection unavailable",
					404,
					request,
					env,
				);
			if (draft.status === "confirmed")
				return createJsonResponse(
					{ transaction: row, settlementCandidates: [] },
					200,
					{},
					request,
					env,
				);
			row.draftId = draft.id;
			row.provisionalTransactionId = draft.transaction_id;
			row.provisionalBudgetEntryId = draft.budget_entry_id;
			row.draftVersion = draft.version;
			row.draftStatus = draft.status;
			row.provisionalSourceChanged =
				draft.amount_minor !== row.amountMinor ||
				draft.currency !== row.currency;
		}
		let settlementCandidates: unknown[] = [];
		if (row.noLongerPending && row.draftId) {
			const guard = scope(env, session.user.id, session.group?.groupid ?? "");
			const rows = await env.DB.prepare(
				`${select} WHERE ${guard.sql} AND x.accountId=? AND x.pending=0 AND x.removedAt IS NULL AND x.reviewStatus='unreviewed' AND x.currency=? AND x.amountMinor=? AND abs(julianday(x.date)-julianday(?))<=7 ORDER BY x.date DESC LIMIT 20`,
			)
				.bind(
					...guard.args,
					row.accountId,
					row.currency,
					row.amountMinor,
					row.date,
				)
				.all();
			settlementCandidates = rows.results;
		}
		return createJsonResponse(
			{ transaction: row, settlementCandidates },
			200,
			{},
			request,
			env,
		);
	});
}

export async function handleBankRecordLink(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env))
		return createJsonResponse({ links: [] }, 200, {}, request, env);
	return withAuth(request, env, async (session) => {
		const params = new URL(request.url).searchParams;
		const expense = params.get("transactionId");
		const budget = params.get("budgetEntryId");
		if (Boolean(expense) === Boolean(budget))
			return createErrorResponse("Choose one record", 400, request, env);
		const guard = scope(env, session.user.id, session.group?.groupid ?? "");
		const column = expense ? "x.linkedTransactionId" : "x.linkedBudgetEntryId";
		const provisional = expense ? "d.transaction_id" : "d.budget_entry_id";
		const rows = await env.DB.prepare(
			`${select} WHERE ${guard.sql} AND (${column}=? OR (${provisional}=? AND d.status='active'))`,
		)
			.bind(...guard.args, expense ?? budget, expense ?? budget)
			.all();
		return createJsonResponse(
			{
				links: rows.results.map((row) => ({
					id: row.id,
					name: row.name,
					pending: Boolean(row.pending),
					provisional: row[column.split(".")[1]] !== (expense ?? budget),
					noLongerPending: Boolean(row.noLongerPending),
				})),
			},
			200,
			{},
			request,
			env,
		);
	});
}
const DraftInput = z
	.object({
		bankTransactionId: z.string().min(1).max(500),
		sourceVersion: z.number().int().nonnegative(),
		draftVersion: z.number().int().nonnegative().optional(),
		transactionId: z.string().min(1).max(200).optional(),
		budgetEntryId: z.string().min(1).max(200).optional(),
	})
	.refine((v) => v.transactionId || v.budgetEntryId);
export async function handleBankProvisionalSave(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env))
		return createErrorResponse(
			"Bank imports are not configured",
			503,
			request,
			env,
		);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: saving private choices validates pending source and eligible records, without financial mutations.
	return withAuth(request, env, async (session, db) => {
		const parsed = DraftInput.safeParse(await request.json());
		if (!parsed.success || !session.group)
			return createErrorResponse(
				"Invalid provisional selection",
				400,
				request,
				env,
			);
		const input = parsed.data;
		const row = await ownedActivity(
			env,
			input.bankTransactionId,
			session.user.id,
			session.group.groupid,
		);
		if (
			!row ||
			!row.pending ||
			row.noLongerPending ||
			row.removedAt ||
			row.rowVersion !== input.sourceVersion
		)
			return createErrorResponse(
				"Pending activity changed. Refresh before saving.",
				409,
				request,
				env,
			);
		const lease = await acquireBankLease(db, String(row.connectionId)).catch(
			() => null,
		);
		if (!lease)
			return createErrorResponse("Bank sync is in progress", 409, request, env);
		try {
			const scale = currencyScale(String(row.currency));
			if (input.transactionId) {
				const record = await env.DB.prepare(
					"SELECT transaction_id FROM transactions WHERE transaction_id=? AND group_id=? AND deleted IS NULL AND currency=? AND round(amount * ?)=?",
				)
					.bind(
						input.transactionId,
						session.group.groupid,
						row.currency,
						scale,
						row.amountMinor,
					)
					.first();
				if (!record || Number(row.amountMinor) <= 0)
					return createErrorResponse(
						"Expense amount and currency must match",
						400,
						request,
						env,
					);
			}
			if (input.budgetEntryId) {
				const record = await env.DB.prepare(
					"SELECT b.budget_entry_id FROM budget_entries b JOIN group_budgets g ON g.id=b.budget_id WHERE b.budget_entry_id=? AND g.group_id=? AND g.deleted IS NULL AND b.deleted IS NULL AND b.currency=? AND round(b.amount * ?)=?",
				)
					.bind(
						input.budgetEntryId,
						session.group.groupid,
						row.currency,
						scale,
						-Number(row.amountMinor),
					)
					.first();
				if (!record)
					return createErrorResponse(
						"Budget amount, currency and direction must match",
						400,
						request,
						env,
					);
			}
			const now = new Date().toISOString();
			const id = String(row.draftId ?? ulid());
			const sourceGuard = row.readonlySnapshot
				? `EXISTS (SELECT 1 FROM bank_pending_snapshots p JOIN bank_accounts a ON a.id=p.account_id AND a.pending_snapshot_id=p.snapshot_id WHERE p.id=? AND p.amount_minor=? AND p.currency=?)`
				: `EXISTS (SELECT 1 FROM bank_transactions WHERE id=? AND row_version=? AND pending=1 AND removed_at IS NULL)`;
			const sourceArgs = row.readonlySnapshot
				? [row.id, row.amountMinor, row.currency]
				: [row.id, row.rowVersion];
			const write =
				env.DB.prepare(`INSERT INTO bank_review_drafts(id,user_id,connection_id,account_id,bank_row_id,source_version,date,name,amount_minor,currency,transaction_id,budget_entry_id,status,version,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'active',0,?,? WHERE ${sourceGuard} AND EXISTS(SELECT 1 FROM bank_connections WHERE id=? AND sync_lock=?)
    ON CONFLICT(user_id,bank_row_id) DO UPDATE SET transaction_id=excluded.transaction_id,budget_entry_id=excluded.budget_entry_id,status='active',version=bank_review_drafts.version+1,source_version=excluded.source_version,amount_minor=excluded.amount_minor,currency=excluded.currency,date=excluded.date,name=excluded.name,updated_at=excluded.updated_at
    WHERE bank_review_drafts.version=? AND bank_review_drafts.status<>'confirmed'`).bind(
					id,
					session.user.id,
					row.connectionId,
					row.accountId,
					row.id,
					row.rowVersion,
					row.date,
					row.name,
					row.amountMinor,
					row.currency,
					input.transactionId ?? null,
					input.budgetEntryId ?? null,
					now,
					now,
					...sourceArgs,
					row.connectionId,
					lease.syncLock,
					input.draftVersion ?? 0,
				);
			await env.DB.batch([
				write,
				env.DB.prepare(
					"SELECT CASE WHEN changes()=1 THEN 1 ELSE json('stale-pending-selection') END",
				),
			]);
			return createJsonResponse({ draftId: id }, 200, {}, request, env);
		} catch {
			return createErrorResponse(
				"Pending selection changed. Refresh and try again.",
				409,
				request,
				env,
			);
		} finally {
			await releaseBankLease(db, lease);
		}
	});
}
export async function handleBankProvisionalCancel(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session) => {
		const input = z
			.object({
				draftId: z.string().min(1),
				draftVersion: z.number().int().nonnegative(),
			})
			.safeParse(await request.json());
		if (!input.success)
			return createErrorResponse("Invalid selection", 400, request, env);
		const result = await env.DB.prepare(
			"UPDATE bank_review_drafts SET status='cancelled',version=version+1,updated_at=? WHERE id=? AND user_id=? AND status='active' AND version=?",
		)
			.bind(
				new Date().toISOString(),
				input.data.draftId,
				session.user.id,
				input.data.draftVersion,
			)
			.run();
		return result.meta.changes
			? createJsonResponse({ status: "cancelled" }, 200, {}, request, env)
			: createErrorResponse("Selection changed", 409, request, env);
	});
}
export async function handleBankDraftCandidates(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env))
		return createErrorResponse(
			"Bank imports are not configured",
			503,
			request,
			env,
		);
	return withAuth(request, env, async (session) => {
		const row = await ownedActivity(
			env,
			new URL(request.url).searchParams.get("bankTransactionId") ?? "",
			session.user.id,
			session.group?.groupid ?? "",
		);
		if (!row || row.removedAt)
			return createErrorResponse(
				"Bank activity unavailable",
				404,
				request,
				env,
			);
		return searchCandidates(
			request,
			env,
			session.group?.groupid ?? "",
			Number(row.amountMinor),
			String(row.currency),
		);
	});
}
