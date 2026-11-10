import type {
	LedgerListRequest,
	LedgerListResponse,
	RecordCategory,
	UnifiedLedgerRow,
} from "split-expense-shared-types";
import { readRecordCategories } from "../utils/categories";
import {
	createErrorResponse,
	createJsonResponse,
	withAuth,
} from "../utils";

interface RawLedgerRow {
	id: string;
	kind: "purchase" | "budget_adjustment" | "transfer";
	timestamp: string;
	description: string;
	currency: string;
	amount: number;
	transaction_id: string | null;
	transfer_id: string | null;
	standalone_budget_entry_id: string | null;
	standalone_budget_id: string | null;
	source_budget_id: string | null;
	destination_budget_id: string | null;
	metadata: string | null;
}

interface TxLinks {
	budgetEntryIds: string[];
	budgetIds: string[];
}

function extractPayer(metadataStr: string | null): string | undefined {
	if (!metadataStr) return undefined;
	try {
		const meta = typeof metadataStr === "string" ? JSON.parse(metadataStr) : metadataStr;
		if (meta?.paidByShares && typeof meta.paidByShares === "object") {
			const payers = Object.entries(meta.paidByShares).filter(([_, amount]) => Number(amount) > 0);
			if (payers.length > 0) return payers[0][0];
		}
	} catch {
		// Ignore JSON parse errors in metadata
	}
	return undefined;
}

async function fetchRawLedgerRows(
	env: Env,
	groupId: string,
	limit: number,
): Promise<RawLedgerRow[]> {
	const unionQuery = `
		SELECT
			'tx:' || t.transaction_id AS id,
			'purchase' AS kind,
			t.created_at AS timestamp,
			t.description AS description,
			t.currency AS currency,
			-t.amount AS amount,
			t.transaction_id AS transaction_id,
			NULL AS transfer_id,
			NULL AS standalone_budget_entry_id,
			NULL AS standalone_budget_id,
			NULL AS source_budget_id,
			NULL AS destination_budget_id,
			t.metadata AS metadata
		FROM transactions t
		WHERE t.group_id = ? AND t.deleted IS NULL

		UNION ALL

		SELECT
			'be:' || be.budget_entry_id AS id,
			'budget_adjustment' AS kind,
			be.added_time AS timestamp,
			be.description AS description,
			be.currency AS currency,
			be.amount AS amount,
			NULL AS transaction_id,
			NULL AS transfer_id,
			be.budget_entry_id AS standalone_budget_entry_id,
			be.budget_id AS standalone_budget_id,
			NULL AS source_budget_id,
			NULL AS destination_budget_id,
			NULL AS metadata
		FROM budget_entries be
		JOIN group_budgets gb ON gb.id = be.budget_id
		WHERE gb.group_id = ? AND be.deleted IS NULL
			AND be.budget_entry_id NOT IN (SELECT budget_entry_id FROM expense_budget_links WHERE group_id = ?)
			AND be.budget_entry_id NOT IN (SELECT entry_id FROM budget_transfer_entries)

		UNION ALL

		SELECT
			'transfer:' || bt.id AS id,
			'transfer' AS kind,
			bt.added_time AS timestamp,
			CASE WHEN bt.note != '' THEN bt.note ELSE 'Transfer' END AS description,
			bt.currency AS currency,
			bt.amount AS amount,
			NULL AS transaction_id,
			bt.id AS transfer_id,
			NULL AS standalone_budget_entry_id,
			NULL AS standalone_budget_id,
			bt.source_budget_id AS source_budget_id,
			bt.destination_budget_id AS destination_budget_id,
			NULL AS metadata
		FROM budget_transfers bt
		WHERE bt.group_id = ? AND bt.deleted IS NULL

		ORDER BY timestamp DESC, id DESC
		LIMIT ?
	`;

	const res = await env.DB.prepare(unionQuery)
		.bind(groupId, groupId, groupId, groupId, limit)
		.all<RawLedgerRow>();

	return res.results || [];
}

async function fetchTxLinksMap(
	env: Env,
	groupId: string,
	txIds: string[],
): Promise<Map<string, TxLinks>> {
	const map = new Map<string, TxLinks>();
	if (!txIds.length) return map;

	const placeholders = txIds.map(() => "?").join(",");
	const linksQuery = `
		SELECT ebl.transaction_id, ebl.budget_entry_id, be.budget_id
		FROM expense_budget_links ebl
		JOIN budget_entries be ON be.budget_entry_id = ebl.budget_entry_id AND be.deleted IS NULL
		WHERE ebl.group_id = ? AND ebl.transaction_id IN (${placeholders})
	`;
	const results = await env.DB.prepare(linksQuery)
		.bind(groupId, ...txIds)
		.all<{ transaction_id: string; budget_entry_id: string; budget_id: string }>();

	for (const link of results.results || []) {
		let entry = map.get(link.transaction_id);
		if (!entry) {
			entry = { budgetEntryIds: [], budgetIds: [] };
			map.set(link.transaction_id, entry);
		}
		if (!entry.budgetEntryIds.includes(link.budget_entry_id)) {
			entry.budgetEntryIds.push(link.budget_entry_id);
		}
		if (!entry.budgetIds.includes(link.budget_id)) {
			entry.budgetIds.push(link.budget_id);
		}
	}
	return map;
}

async function fetchTransferEntriesMap(
	env: Env,
	transferIds: string[],
): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (!transferIds.length) return map;

	const placeholders = transferIds.map(() => "?").join(",");
	const query = `
		SELECT transfer_id, entry_id
		FROM budget_transfer_entries
		WHERE transfer_id IN (${placeholders})
	`;
	const results = await env.DB.prepare(query)
		.bind(...transferIds)
		.all<{ transfer_id: string; entry_id: string }>();

	for (const entry of results.results || []) {
		let list = map.get(entry.transfer_id);
		if (!list) {
			list = [];
			map.set(entry.transfer_id, list);
		}
		list.push(entry.entry_id);
	}
	return map;
}

function buildPurchaseRow(
	raw: RawLedgerRow,
	linksMap: Map<string, TxLinks>,
	expenseCatMap: Map<string, RecordCategory>,
): UnifiedLedgerRow {
	const txId = raw.transaction_id ?? "";
	const links = linksMap.get(txId);
	const cat = expenseCatMap.get(txId);

	return {
		id: raw.id,
		kind: "purchase",
		timestamp: raw.timestamp,
		description: raw.description,
		currency: raw.currency,
		amount: raw.amount,
		transactionId: raw.transaction_id ?? undefined,
		budgetEntryIds: links?.budgetEntryIds ?? [],
		budgetIds: links?.budgetIds ?? [],
		categoryId: cat?.categoryId ?? null,
		categoryName: cat?.categoryName ?? null,
		paidByUserId: extractPayer(raw.metadata),
	};
}

function buildBudgetAdjustmentRow(
	raw: RawLedgerRow,
	budgetCatMap: Map<string, RecordCategory>,
): UnifiedLedgerRow {
	const beId = raw.standalone_budget_entry_id ?? "";
	const cat = budgetCatMap.get(beId);
	const budgetIds = raw.standalone_budget_id ? [raw.standalone_budget_id] : [];

	return {
		id: raw.id,
		kind: "budget_adjustment",
		timestamp: raw.timestamp,
		description: raw.description,
		currency: raw.currency,
		amount: raw.amount,
		budgetEntryIds: beId ? [beId] : [],
		budgetIds,
		categoryId: cat?.categoryId ?? null,
		categoryName: cat?.categoryName ?? null,
	};
}

function buildTransferRow(
	raw: RawLedgerRow,
	transferEntriesMap: Map<string, string[]>,
): UnifiedLedgerRow {
	const transferId = raw.transfer_id ?? "";
	const budgetIds: string[] = [];
	if (raw.source_budget_id) budgetIds.push(raw.source_budget_id);
	if (raw.destination_budget_id && !budgetIds.includes(raw.destination_budget_id)) {
		budgetIds.push(raw.destination_budget_id);
	}

	return {
		id: raw.id,
		kind: "transfer",
		timestamp: raw.timestamp,
		description: raw.description,
		currency: raw.currency,
		amount: raw.amount,
		budgetEntryIds: transferEntriesMap.get(transferId) ?? [],
		budgetIds,
		categoryId: null,
		categoryName: null,
		transferId: raw.transfer_id ?? undefined,
	};
}

function toUnifiedLedgerRow(
	raw: RawLedgerRow,
	txLinksMap: Map<string, TxLinks>,
	transferEntriesMap: Map<string, string[]>,
	expenseCatMap: Map<string, RecordCategory>,
	budgetCatMap: Map<string, RecordCategory>,
): UnifiedLedgerRow {
	if (raw.kind === "purchase") {
		return buildPurchaseRow(raw, txLinksMap, expenseCatMap);
	}
	if (raw.kind === "budget_adjustment") {
		return buildBudgetAdjustmentRow(raw, budgetCatMap);
	}
	return buildTransferRow(raw, transferEntriesMap);
}

export async function handleLedgerList(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	try {
		return withAuth(request, env, async (session, _db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const groupId = String(session.group.groupid);
			let body: LedgerListRequest = {};
			try {
				const text = await request.text();
				if (text) {
					body = JSON.parse(text);
				}
			} catch {
				return createErrorResponse("Invalid JSON", 400, request, env);
			}

			const limit = Math.min(Math.max(body.limit ?? 25, 1), 50);
			const rawRows = await fetchRawLedgerRows(env, groupId, limit);

			const txIds = rawRows
				.filter((r) => r.kind === "purchase" && r.transaction_id)
				.map((r) => r.transaction_id as string);

			const beIds = rawRows
				.filter((r) => r.kind === "budget_adjustment" && r.standalone_budget_entry_id)
				.map((r) => r.standalone_budget_entry_id as string);

			const transferIds = rawRows
				.filter((r) => r.kind === "transfer" && r.transfer_id)
				.map((r) => r.transfer_id as string);

			const [txLinksMap, transferEntriesMap, expenseCatMap, budgetCatMap] = await Promise.all([
				fetchTxLinksMap(env, groupId, txIds),
				fetchTransferEntriesMap(env, transferIds),
				readRecordCategories(env, groupId, "expense", txIds),
				readRecordCategories(env, groupId, "budget", beIds),
			]);

			const rows = rawRows.map((raw) =>
				toUnifiedLedgerRow(raw, txLinksMap, transferEntriesMap, expenseCatMap, budgetCatMap),
			);

			const response: LedgerListResponse = {
				rows,
				nextCursor: null,
			};

			return createJsonResponse(response, 200, {}, request, env);
		});
	} catch (error) {
		console.error("handleLedgerList error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
