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

interface DecodedCursor {
	groupId: string;
	timestamp: string;
	id: string;
}

export function decodeCursor(
	cursorStr: string | undefined,
	expectedGroupId: string,
): DecodedCursor | null {
	if (!cursorStr) return null;
	try {
		const json = Buffer.from(cursorStr, "base64").toString("utf-8");
		const parsed = JSON.parse(json);
		if (
			typeof parsed !== "object" ||
			!parsed ||
			parsed.groupId !== expectedGroupId ||
			typeof parsed.timestamp !== "string" ||
			typeof parsed.id !== "string"
		) {
			return null;
		}
		return parsed as DecodedCursor;
	} catch {
		return null;
	}
}

export function encodeCursor(
	groupId: string,
	timestamp: string,
	id: string,
): string {
	const payload: DecodedCursor = { groupId, timestamp, id };
	return Buffer.from(JSON.stringify(payload)).toString("base64");
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

function buildPurchaseArm(groupId: string, f: LedgerListRequest) {
	let sql = `
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
	`;
	const params: unknown[] = [groupId];

	if (f.currency) {
		sql += " AND t.currency = ?";
		params.push(f.currency);
	}
	if (f.q) {
		sql += " AND LOWER(t.description) LIKE ?";
		params.push(`%${f.q.toLowerCase()}%`);
	}
	if (f.dateFrom) {
		sql += " AND t.created_at >= ?";
		params.push(f.dateFrom);
	}
	if (f.dateTo) {
		sql += " AND t.created_at <= ?";
		params.push(f.dateTo);
	}
	if (f.budgetId) {
		sql += " AND t.transaction_id IN (SELECT ebl.transaction_id FROM expense_budget_links ebl JOIN budget_entries be ON be.budget_entry_id = ebl.budget_entry_id WHERE ebl.group_id = ? AND be.budget_id = ?)";
		params.push(groupId, f.budgetId);
	}
	if (f.categoryId) {
		sql += " AND t.transaction_id IN (SELECT record_id FROM record_categories WHERE group_id = ? AND record_kind = 'expense' AND category_id = ?)";
		params.push(groupId, f.categoryId);
	}

	return { query: sql, params };
}

function buildBudgetAdjustmentArm(groupId: string, f: LedgerListRequest) {
	let sql = `
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
	`;
	const params: unknown[] = [groupId, groupId];

	if (f.currency) {
		sql += " AND be.currency = ?";
		params.push(f.currency);
	}
	if (f.q) {
		sql += " AND LOWER(be.description) LIKE ?";
		params.push(`%${f.q.toLowerCase()}%`);
	}
	if (f.dateFrom) {
		sql += " AND be.added_time >= ?";
		params.push(f.dateFrom);
	}
	if (f.dateTo) {
		sql += " AND be.added_time <= ?";
		params.push(f.dateTo);
	}
	if (f.budgetId) {
		sql += " AND be.budget_id = ?";
		params.push(f.budgetId);
	}
	if (f.categoryId) {
		sql += " AND be.budget_entry_id IN (SELECT record_id FROM record_categories WHERE group_id = ? AND record_kind = 'budget' AND category_id = ?)";
		params.push(groupId, f.categoryId);
	}

	return { query: sql, params };
}

function buildTransferArm(groupId: string, f: LedgerListRequest) {
	let sql = `
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
	`;
	const params: unknown[] = [groupId];

	if (f.currency) {
		sql += " AND bt.currency = ?";
		params.push(f.currency);
	}
	if (f.q) {
		sql += " AND LOWER(CASE WHEN bt.note != '' THEN bt.note ELSE 'Transfer' END) LIKE ?";
		params.push(`%${f.q.toLowerCase()}%`);
	}
	if (f.dateFrom) {
		sql += " AND bt.added_time >= ?";
		params.push(f.dateFrom);
	}
	if (f.dateTo) {
		sql += " AND bt.added_time <= ?";
		params.push(f.dateTo);
	}
	if (f.budgetId) {
		sql += " AND (bt.source_budget_id = ? OR bt.destination_budget_id = ?)";
		params.push(f.budgetId, f.budgetId);
	}

	return { query: sql, params };
}

function selectActiveArms(groupId: string, f: LedgerListRequest) {
	const arms: Array<{ query: string; params: unknown[] }> = [];

	if (!f.kinds || f.kinds.includes("purchase")) {
		arms.push(buildPurchaseArm(groupId, f));
	}
	if (!f.kinds || f.kinds.includes("budget_adjustment")) {
		arms.push(buildBudgetAdjustmentArm(groupId, f));
	}
	if (!f.categoryId && (!f.kinds || f.kinds.includes("transfer"))) {
		arms.push(buildTransferArm(groupId, f));
	}

	return arms;
}

async function fetchRawLedgerRows(
	env: Env,
	groupId: string,
	filters: LedgerListRequest,
	cursor: DecodedCursor | null,
	limit: number,
): Promise<RawLedgerRow[]> {
	const activeArms = selectActiveArms(groupId, filters);
	if (!activeArms.length) {
		return [];
	}

	const unionQuery = activeArms.map((a) => a.query).join("\n UNION ALL \n");
	let sql = `
		SELECT * FROM (
			${unionQuery}
		) AS unified
		WHERE id IS NOT NULL
	`;
	const params: unknown[] = [];
	for (const arm of activeArms) {
		params.push(...arm.params);
	}

	if (cursor) {
		sql += " AND (timestamp < ? OR (timestamp = ? AND id < ?))";
		params.push(cursor.timestamp, cursor.timestamp, cursor.id);
	}

	sql += " ORDER BY timestamp DESC, id DESC LIMIT ?";
	params.push(limit);

	const res = await env.DB.prepare(sql)
		.bind(...params)
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

async function fetchAndEnrichLedger(
	env: Env,
	groupId: string,
	body: LedgerListRequest,
	cursor: DecodedCursor | null,
): Promise<LedgerListResponse> {
	const limit = Math.min(Math.max(body.limit ?? 25, 1), 50);
	const rawRows = await fetchRawLedgerRows(env, groupId, body, cursor, limit + 1);

	const hasMore = rawRows.length > limit;
	const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;

	const txIds = pageRows
		.filter((r) => r.kind === "purchase" && r.transaction_id)
		.map((r) => r.transaction_id as string);

	const beIds = pageRows
		.filter((r) => r.kind === "budget_adjustment" && r.standalone_budget_entry_id)
		.map((r) => r.standalone_budget_entry_id as string);

	const transferIds = pageRows
		.filter((r) => r.kind === "transfer" && r.transfer_id)
		.map((r) => r.transfer_id as string);

	const [txLinksMap, transferEntriesMap, expenseCatMap, budgetCatMap] = await Promise.all([
		fetchTxLinksMap(env, groupId, txIds),
		fetchTransferEntriesMap(env, transferIds),
		readRecordCategories(env, groupId, "expense", txIds),
		readRecordCategories(env, groupId, "budget", beIds),
	]);

	const rows = pageRows.map((raw) =>
		toUnifiedLedgerRow(raw, txLinksMap, transferEntriesMap, expenseCatMap, budgetCatMap),
	);

	let nextCursor: string | null = null;
	if (hasMore && rows.length > 0) {
		const lastRow = rows[rows.length - 1];
		nextCursor = encodeCursor(groupId, lastRow.timestamp, lastRow.id);
	}

	return { rows, nextCursor };
}

async function parseRequestBody(request: Request): Promise<LedgerListRequest | null> {
	try {
		const text = await request.text();
		return text ? JSON.parse(text) : {};
	} catch {
		return null;
	}
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
			const body = await parseRequestBody(request);
			if (!body) {
				return createErrorResponse("Invalid JSON", 400, request, env);
			}

			const cursor = decodeCursor(body.cursor, groupId);
			if (body.cursor && !cursor) {
				return createErrorResponse("Invalid cursor", 400, request, env);
			}

			const response = await fetchAndEnrichLedger(env, groupId, body, cursor);
			return createJsonResponse(response, 200, {}, request, env);
		});
	} catch (error) {
		console.error("handleLedgerList error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
