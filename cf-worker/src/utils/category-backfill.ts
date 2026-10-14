import { classifyCategory } from "./category-ai";
import { CATEGORY_COMPONENT_SQL, normalizeCategoryText } from "./categories";
import type {
	CategorySource,
	GroupCategory,
	RecordKind,
} from "../../../shared-types";
export type BackfillRecord = {
	kind: RecordKind;
	id: string;
	description: string;
	categoryId: string | null;
	source: CategorySource | null;
	version: number;
	scheduledChoices?: Array<string | null>;
};
export type BackfillSnapshot = Omit<
	BackfillRecord,
	"description" | "scheduledChoices"
> & { descriptionHash: string };
export type BackfillDecision = {
	categoryId: string;
	source: "linked" | "scheduled" | "rule" | "ai";
};
export type BackfillPlan = {
	id: string;
	status:
		| "proposed"
		| "protected-clear"
		| "already-classified"
		| "conflict"
		| "abstained"
		| "oversized";
	records: BackfillSnapshot[];
	decision?: BackfillDecision;
	categoryName?: string;
	reason?: string;
};
export type BackfillRule = {
	kind: "merchant" | "description";
	pattern: string;
	categoryId: string;
};
const key = (record: { kind: RecordKind; id: string }) =>
	`${record.kind}:${record.id}`;
export function backfillEligible(
	record: Pick<BackfillRecord, "categoryId" | "source">,
): boolean {
	return (
		record.categoryId === null &&
		(record.source === null || record.source === "uncategorised")
	);
}
export async function descriptionHash(description: string): Promise<string> {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(description),
	);
	return Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
/** Preview contains IDs/labels/hashes only. Descriptions remain ephemeral and never enter the report. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep protected-choice precedence explicit and reviewable before inference.
export async function planBackfillComponent(
	env: Env,
	categories: GroupCategory[],
	rules: BackfillRule[],
	records: BackfillRecord[],
): Promise<BackfillPlan> {
	const ordered = [...records].sort((a, b) => key(a).localeCompare(key(b)));
	if (!ordered.length) throw Error("Empty component");
	const snapshots = await Promise.all(
		ordered.map(
			async ({ description, scheduledChoices: _choices, ...record }) => ({
				...record,
				descriptionHash: await descriptionHash(description),
			}),
		),
	);
	const plan: BackfillPlan = {
		id: key(ordered[0]),
		status: "abstained",
		records: snapshots,
	};
	if (ordered.length > 1000) return { ...plan, status: "oversized" };
	const eligible = ordered.filter(backfillEligible);
	const saved = new Set(
		ordered
			.filter((record) => !backfillEligible(record))
			.map((record) => record.categoryId),
	);
	if (saved.size > 1)
		return {
			...plan,
			status: "conflict",
			reason: "Saved category choices differ",
		};
	if (saved.has(null)) return { ...plan, status: "protected-clear" };
	if (!eligible.length) return { ...plan, status: "already-classified" };
	let decision: BackfillDecision | undefined;
	if (saved.size)
		decision = { categoryId: [...saved][0] as string, source: "linked" };
	else {
		const defaults = new Set(
			ordered.flatMap((record) => record.scheduledChoices ?? []),
		);
		if (defaults.size > 1)
			return {
				...plan,
				status: "conflict",
				reason: "Recurring defaults differ",
			};
		if (defaults.has(null))
			return {
				...plan,
				status: "protected-clear",
				reason: "Recurring default is Uncategorised",
			};
		if (defaults.size)
			decision = {
				categoryId: [...defaults][0] as string,
				source: "scheduled",
			};
	}
	const selectedDescription =
		ordered.find((record) => record.kind === "expense")?.description ??
		ordered[0].description;
	if (!decision) {
		const description = normalizeCategoryText(selectedDescription);
		const rule = rules
			.filter(
				(r) =>
					r.kind === "description" &&
					categories.some((c) => c.id === r.categoryId && !c.archivedAt),
			)
			.sort(
				(a, b) =>
					b.pattern.length - a.pattern.length ||
					a.categoryId.localeCompare(b.categoryId),
			)
			.find((r) => description.includes(normalizeCategoryText(r.pattern)));
		if (rule) decision = { categoryId: rule.categoryId, source: "rule" };
	}
	if (!decision) {
		const slug = await classifyCategory(env, "", selectedDescription);
		const category = categories.find((c) => c.slug === slug && !c.archivedAt);
		if (category) decision = { categoryId: category.id, source: "ai" };
	}
	const category = categories.find((c) => c.id === decision?.categoryId);
	return decision && category
		? { ...plan, status: "proposed", decision, categoryName: category.name }
		: plan;
}
// Drive every financial lookup from the bounded component, never the household.
const LIVE_COMPONENT_SQL = `SELECT c.kind,c.id,t.description FROM component c
 CROSS JOIN transactions t ON t.transaction_id=c.id AND t.group_id=c.group_id AND t.deleted IS NULL WHERE c.kind='expense'
 UNION ALL SELECT c.kind,c.id,b.description FROM component c
 CROSS JOIN budget_entries b ON b.budget_entry_id=c.id AND b.deleted IS NULL
 CROSS JOIN group_budgets g ON g.id=b.budget_id AND g.group_id=c.group_id AND g.deleted IS NULL WHERE c.kind='budget'`;
export async function readBackfillComponent(
	env: Env,
	groupId: string,
	root: { kind: RecordKind; id: string },
): Promise<BackfillRecord[]> {
	const result =
		await env.DB.prepare(`${CATEGORY_COMPONENT_SQL},live AS (${LIVE_COMPONENT_SQL})
 SELECT c.kind,c.id,l.description,r.category_id AS categoryId,r.source,COALESCE(r.version,0) AS version FROM component c JOIN live l ON l.kind=c.kind AND l.id=c.id LEFT JOIN record_categories r ON r.group_id=? AND r.record_kind=c.kind AND r.record_id=c.id ORDER BY c.kind,c.id`)
			.bind(root.kind, root.id, groupId, groupId)
			.all<BackfillRecord>();
	return result.results;
}
export type BackfillRecurringIndex = Record<
	string,
	{ choices: Array<string | null> }
>;
/** Read each current-group owner's history once per job. No descriptions or raw action JSON. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep reliable identity and saved-default precedence together in the bounded one-time loader.
export async function loadBackfillRecurringIndex(
	env: Env,
	groupId: string,
): Promise<BackfillRecurringIndex> {
	const index: BackfillRecurringIndex = {};
	const owners = await env.DB.prepare("SELECT id FROM user WHERE groupid=?")
		.bind(groupId)
		.all<{ id: string }>();
	for (const owner of owners.results) {
		{
			const rows =
				await env.DB.prepare(`SELECT h.id,h.scheduled_action_id AS actionId,h.action_type AS kind,h.executed_at AS executed,
    json_extract(CASE WHEN json_valid(h.result_data) THEN h.result_data ELSE '{}' END,'$.transactionId') AS transactionId,
    CASE WHEN json_type(CASE WHEN json_valid(h.action_data) THEN h.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL THEN json_extract(h.action_data,'$.categoryId') ELSE json_extract(CASE WHEN json_valid(a.action_data) THEN a.action_data ELSE '{}' END,'$.categoryId') END AS categoryId,
    CASE WHEN json_type(CASE WHEN json_valid(h.action_data) THEN h.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL OR json_type(CASE WHEN json_valid(a.action_data) THEN a.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL THEN 1 ELSE 0 END AS hasDefault
    FROM scheduled_action_history h INDEXED BY scheduled_action_history_user_executed_idx
    CROSS JOIN scheduled_actions a ON a.id=h.scheduled_action_id
    CROSS JOIN user action_owner ON action_owner.id=a.user_id AND action_owner.groupid=?
    WHERE h.user_id=? AND h.execution_status='success'
    LIMIT 5001`)
					.bind(groupId, owner.id)
					.all<{
						id: string;
						actionId: string;
						kind: string;
						executed: string;
						transactionId: string | null;
						categoryId: string | null;
						hasDefault: number;
					}>();
			if (rows.results.length > 5000)
				throw Error(
					"Recurring history exceeds the per-owner 5000-row maintenance limit",
				);
			for (const row of rows.results) {
				const kind =
					row.kind === "add_expense"
						? "expense"
						: row.kind === "add_budget"
							? "budget"
							: null;
				if (!kind) continue;
				const ids = new Set<string>();
				if (kind === "expense" && row.transactionId) ids.add(row.transactionId);
				const date = row.id.slice(-10);
				if (
					/^\d{4}-\d{2}-\d{2}$/.test(date) &&
					row.id === `hist_${row.actionId}-${date}`
				)
					ids.add(
						`${kind === "expense" ? "tx" : "bge"}_${row.actionId}_${date}`,
					);
				for (const recordId of ids) {
					const recordKey = `${kind}:${recordId}`;
					index[recordKey] ??= { choices: [] };
					const entry = index[recordKey];
					if (row.hasDefault) entry.choices.push(row.categoryId);
				}
			}
		}
	}
	return index;
}
/** Matching is in memory against the once-loaded scoped history index. */
export async function recurringBackfillChoices(
	env: Env,
	groupId: string,
	records: BackfillRecord[],
	providedIndex?: BackfillRecurringIndex,
): Promise<{
	mapped: Set<string>;
	choices: Map<string, Array<string | null>>;
}> {
	const index =
		providedIndex ?? (await loadBackfillRecurringIndex(env, groupId));
	const mapped = new Set<string>(),
		choices = new Map<string, Array<string | null>>();
	for (const record of records) {
		const id = key(record),
			entry = index[id];
		if (!entry) continue;
		mapped.add(id);
		if (entry.choices.length) choices.set(id, entry.choices);
	}
	return { mapped, choices };
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Review snapshot, replay and atomic CAS guards together to prevent partial metadata writes.
export async function applyBackfillComponent(
	env: Env,
	groupId: string,
	plan: BackfillPlan,
): Promise<"applied" | "already-applied" | "stale" | "skipped"> {
	if (
		plan.status !== "proposed" ||
		!plan.decision ||
		!plan.records.length ||
		plan.records.length > 1000
	)
		return "skipped";
	const current = await readBackfillComponent(env, groupId, plan.records[0]);
	if (current.length !== plan.records.length) return "stale";
	const expected = new Map(plan.records.map((record) => [key(record), record]));
	let unchanged = true,
		alreadyApplied = true;
	for (const row of current) {
		const old = expected.get(key(row));
		if (
			!old ||
			(await descriptionHash(row.description)) !== old.descriptionHash
		)
			return "stale";
		const same =
			row.version === old.version &&
			row.source === old.source &&
			row.categoryId === old.categoryId;
		unchanged &&= same;
		const applied = backfillEligible(old)
			? row.version === old.version + 1 &&
				row.source === plan.decision.source &&
				row.categoryId === plan.decision.categoryId
			: same;
		alreadyApplied &&= applied;
	}
	if (alreadyApplied) return "already-applied";
	if (!unchanged) return "stale";
	// The fresh descriptions are ephemeral. Hashes matched the reviewed preview;
	// binding exact text below also catches edits after this reread, without a D1 hash function.
	const snapshot = JSON.stringify(current);
	const result =
		await env.DB.prepare(`${CATEGORY_COMPONENT_SQL},live AS (${LIVE_COMPONENT_SQL}),expected AS (
 SELECT json_extract(value,'$.kind') AS kind,json_extract(value,'$.id') AS id,json_extract(value,'$.description') AS description,json_extract(value,'$.version') AS version,json_extract(value,'$.source') AS source,json_extract(value,'$.categoryId') AS category_id FROM json_each(?))
 INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source,version)
 SELECT ?,c.kind,c.id,?,?,1 FROM component c JOIN live l ON l.kind=c.kind AND l.id=c.id LEFT JOIN record_categories r ON r.group_id=? AND r.record_kind=c.kind AND r.record_id=c.id
 WHERE (r.category_id IS NULL AND (r.source IS NULL OR r.source='uncategorised'))
 AND (SELECT count(*) FROM component)=(SELECT count(*) FROM expected) AND (SELECT count(*) FROM component)<=1000
 AND NOT EXISTS(SELECT 1 FROM expected e LEFT JOIN component c2 ON c2.kind=e.kind AND c2.id=e.id LEFT JOIN live l2 ON l2.kind=e.kind AND l2.id=e.id LEFT JOIN record_categories r2 ON r2.group_id=? AND r2.record_kind=e.kind AND r2.record_id=e.id WHERE c2.id IS NULL OR l2.id IS NULL OR l2.description IS NOT e.description OR COALESCE(r2.version,0)<>e.version OR r2.source IS NOT e.source OR r2.category_id IS NOT e.category_id)
 AND EXISTS(SELECT 1 FROM group_categories WHERE id=? AND group_id=? AND (? IN ('linked','scheduled') OR archived_at IS NULL))
 ON CONFLICT(group_id,record_kind,record_id) DO UPDATE SET category_id=excluded.category_id,source=excluded.source,version=record_categories.version+1
 WHERE record_categories.category_id IS NULL AND (record_categories.source IS NULL OR record_categories.source='uncategorised')`)
			.bind(
				plan.records[0].kind,
				plan.records[0].id,
				groupId,
				snapshot,
				groupId,
				plan.decision.categoryId,
				plan.decision.source,
				groupId,
				groupId,
				plan.decision.categoryId,
				groupId,
				plan.decision.source,
			)
			.run();
	return result.meta.changes ? "applied" : "stale";
}

/** Discovery uses IDs only; descriptions are loaded only for a bounded component. */
export async function readBackfillCandidates(
	env: Env,
	groupId: string,
	cursor: { kind: RecordKind; id: string } | null,
): Promise<Array<{ kind: RecordKind; id: string }>> {
	const rows: Array<{ kind: RecordKind; id: string }> = [];
	if (cursor?.kind !== "expense") {
		const budgets = await env.DB.prepare(
			"SELECT id FROM group_budgets WHERE group_id=? AND deleted IS NULL LIMIT 101",
		)
			.bind(groupId)
			.all<{ id: string }>();
		if (budgets.results.length > 100)
			throw Error("Household exceeds the 100-budget maintenance limit");
		for (const budget of budgets.results) {
			const result =
				await env.DB.prepare(`SELECT 'budget' AS kind,budget_entry_id AS id FROM budget_entries
    WHERE budget_id=? AND deleted IS NULL AND budget_entry_id>? ORDER BY budget_entry_id LIMIT 100`)
					.bind(budget.id, cursor?.id ?? "")
					.all<{ kind: RecordKind; id: string }>();
			rows.push(...result.results);
		}
		rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		if (rows.length >= 100) return rows.slice(0, 100);
	}
	const result =
		await env.DB.prepare(`SELECT 'expense' AS kind,transaction_id AS id FROM transactions
  WHERE transaction_id>? AND group_id=? AND deleted IS NULL ORDER BY transaction_id LIMIT ?`)
			.bind(
				cursor?.kind === "expense" ? cursor.id : "",
				groupId,
				100 - rows.length,
			)
			.all<{ kind: RecordKind; id: string }>();
	return [...rows, ...result.results];
}
