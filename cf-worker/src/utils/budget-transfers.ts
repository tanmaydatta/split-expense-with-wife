import { ulid } from "ulid";
import type {
	BudgetTransferRequest,
	BudgetTransferResponse,
} from "../../../shared-types";
import { formatSQLiteTime, isValidCurrency } from "../utils";
export class TransferError extends Error {
	constructor(
		message: string,
		public status = 400,
	) {
		super(message);
	}
}
interface TransferRow {
	id: string;
	group_id: string;
	actor_id: string;
	request_id: string;
	source_budget_id: string;
	destination_budget_id: string;
	amount: number;
	currency: string;
	added_time: string;
	note: string;
	deleted: string | null;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: strict bounded validation precedes every financial write.
export function validateTransfer(value: unknown): BudgetTransferRequest {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TransferError("Choose two budgets, amount, currency and date.");
	const v = value as Record<string, unknown>;
	if (
		Object.keys(v).some(
			(k) =>
				![
					"requestId",
					"sourceBudgetId",
					"destinationBudgetId",
					"amount",
					"currency",
					"date",
					"note",
				].includes(k),
		)
	)
		throw new TransferError("Unsupported transfer fields.");
	if (
		typeof v.requestId !== "string" ||
		!/^[A-Za-z0-9_-]{8,100}$/.test(v.requestId)
	)
		throw new TransferError("Invalid request identity.");
	for (const key of ["sourceBudgetId", "destinationBudgetId"])
		if (typeof v[key] !== "string" || !v[key] || String(v[key]).length > 100)
			throw new TransferError("Choose two active budgets.");
	if (v.sourceBudgetId === v.destinationBudgetId)
		throw new TransferError("Choose different source and destination budgets.");
	if (
		typeof v.amount !== "number" ||
		!Number.isFinite(v.amount) ||
		v.amount <= 0 ||
		Math.round(v.amount * 100) <= 0 ||
		v.amount > 1e9 ||
		Math.abs(v.amount * 100 - Math.round(v.amount * 100)) > 0.00001
	)
		throw new TransferError(
			"Use a positive amount with at most two decimal places.",
		);
	if (typeof v.currency !== "string" || !isValidCurrency(v.currency))
		throw new TransferError("Choose a supported currency.");
	if (
		typeof v.date !== "string" ||
		!/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
		!Number.isFinite(Date.parse(v.date)) ||
		new Date(v.date).toISOString().slice(0, 10) !== v.date ||
		v.date > new Date().toISOString().slice(0, 10)
	)
		throw new TransferError("Choose a valid UTC date today or earlier.");
	if (
		v.note !== undefined &&
		(typeof v.note !== "string" || v.note.length > 200)
	)
		throw new TransferError("Keep the note within 200 characters.");
	return {
		...v,
		amount: Math.round(v.amount * 100) / 100,
		note: typeof v.note === "string" ? v.note.trim() : "",
	} as unknown as BudgetTransferRequest;
}
function result(row: TransferRow): BudgetTransferResponse {
	return {
		message: row.deleted ? "Transfer was already deleted" : "Transfer recorded",
		transferId: row.id,
		sourceEntryId: `${row.id}_source`,
		destinationEntryId: `${row.id}_destination`,
		deleted: !!row.deleted,
	};
}
function same(row: TransferRow, input: BudgetTransferRequest) {
	return (
		row.source_budget_id === input.sourceBudgetId &&
		row.destination_budget_id === input.destinationBudgetId &&
		row.amount === input.amount &&
		row.currency === input.currency &&
		row.added_time === `${input.date} 00:00:00` &&
		row.note === (input.note ?? "")
	);
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one idempotent pair batch gates all entries and total deltas on the fresh header identity.
export async function createTransfer(
	env: Pick<Env, "DB">,
	group: string,
	actor: string,
	input: BudgetTransferRequest,
) {
	const existing = await env.DB.prepare(
		"SELECT * FROM budget_transfers WHERE group_id=? AND actor_id=? AND request_id=?",
	)
		.bind(group, actor, input.requestId)
		.first<TransferRow>();
	if (existing) {
		if (!same(existing, input))
			throw new TransferError(
				"This request was already used for another transfer.",
				409,
			);
		return result(existing);
	}
	const id = `btr_${ulid()}`,
		now = formatSQLiteTime(),
		date = `${input.date} 00:00:00`;
	const statements = [
		env.DB.prepare(`INSERT INTO budget_transfers(id,group_id,actor_id,request_id,source_budget_id,destination_budget_id,amount,currency,added_time,note,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=? AND groupid=? AND signup_complete=1)
 AND EXISTS(SELECT 1 FROM group_budgets WHERE id=? AND group_id=? AND deleted IS NULL)
 AND EXISTS(SELECT 1 FROM group_budgets WHERE id=? AND group_id=? AND deleted IS NULL)
 ON CONFLICT(group_id,actor_id,request_id) DO NOTHING`).bind(
			id,
			group,
			actor,
			input.requestId,
			input.sourceBudgetId,
			input.destinationBudgetId,
			input.amount,
			input.currency,
			date,
			input.note ?? "",
			now,
			actor,
			group,
			input.sourceBudgetId,
			group,
			input.destinationBudgetId,
			group,
		),
	];
	for (const role of ["source", "destination"] as const) {
		const entryId = `${id}_${role}`,
			budget =
				role === "source" ? input.sourceBudgetId : input.destinationBudgetId,
			amount = role === "source" ? -input.amount : input.amount;
		statements.push(
			env.DB.prepare(
				`INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT ?,?,?,?,?,? FROM budget_transfers WHERE id=?`,
			).bind(
				entryId,
				budget,
				input.note || "Budget transfer",
				amount,
				input.currency,
				date,
				id,
			),
		);
		statements.push(
			env.DB.prepare(
				`INSERT INTO budget_transfer_entries(entry_id,transfer_id,role) SELECT ?,?,? FROM budget_transfers WHERE id=?`,
			).bind(entryId, id, role, id),
		);
		statements.push(
			env.DB.prepare(
				`INSERT INTO budget_totals(budget_id,currency,total_amount,updated_at) SELECT ?,?,?,? FROM budget_transfers WHERE id=? ON CONFLICT(budget_id,currency) DO UPDATE SET total_amount=budget_totals.total_amount+excluded.total_amount,updated_at=excluded.updated_at`,
			).bind(budget, input.currency, amount, now, id),
		);
	}
	await env.DB.batch(statements);
	const saved = await env.DB.prepare(
		"SELECT * FROM budget_transfers WHERE group_id=? AND actor_id=? AND request_id=?",
	)
		.bind(group, actor, input.requestId)
		.first<TransferRow>();
	if (!saved)
		throw new TransferError(
			"Choose two active budgets in your current household.",
			403,
		);
	if (!same(saved, input))
		throw new TransferError(
			"This request was already used for another transfer.",
			409,
		);
	return result(saved);
}
// Entry PK -> transfer PK -> exactly two role rows; never a household transfer scan.
export async function deleteTransferForEntry(
	env: Pick<Env, "DB">,
	group: string,
	actor: string,
	entry: string,
	confirmed = false,
): Promise<boolean> {
	const row = await env.DB.prepare(
		"SELECT t.* FROM budget_transfer_entries e JOIN budget_transfers t ON t.id=e.transfer_id WHERE e.entry_id=? AND t.group_id=?",
	)
		.bind(entry, group)
		.first<TransferRow>();
	if (!row) return false;
	if (row.deleted) return true;
	if (!confirmed)
		throw new TransferError(
			"Refresh the page and confirm deleting both transfer entries.",
			409,
		);
	const token = ulid(),
		now = formatSQLiteTime();
	const statements = [
		env.DB.prepare(
			`UPDATE budget_transfers SET deleted=?,deletion_token=? WHERE id=? AND group_id=? AND deleted IS NULL AND EXISTS(SELECT 1 FROM user WHERE id=? AND groupid=? AND signup_complete=1)`,
		).bind(now, token, row.id, group, actor, group),
	];
	for (const role of ["source", "destination"]) {
		const budget =
				role === "source" ? row.source_budget_id : row.destination_budget_id,
			delta = role === "source" ? row.amount : -row.amount;
		statements.push(
			env.DB.prepare(
				`UPDATE budget_totals SET total_amount=total_amount+?,updated_at=? WHERE budget_id=? AND currency=? AND EXISTS(SELECT 1 FROM budget_transfers WHERE id=? AND deletion_token=?)`,
			).bind(delta, now, budget, row.currency, row.id, token),
		);
		statements.push(
			env.DB.prepare(
				`UPDATE budget_entries SET deleted=? WHERE budget_entry_id=? AND EXISTS(SELECT 1 FROM budget_transfers WHERE id=? AND deletion_token=?)`,
			).bind(now, `${row.id}_${role}`, row.id, token),
		);
	}
	await env.DB.batch(statements);
	const deleted = await env.DB.prepare(
		"SELECT deleted FROM budget_transfers WHERE id=?",
	)
		.bind(row.id)
		.first<{ deleted: string | null }>();
	if (!deleted?.deleted)
		throw new TransferError(
			"Your household membership changed. Refresh and try again.",
			403,
		);
	return true;
}
export { readTransferInfo } from "./budget-transfer-info";
