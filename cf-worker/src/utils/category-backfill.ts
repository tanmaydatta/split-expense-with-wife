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
const LIVE_RECORDS_SQL = `SELECT 'expense' AS kind,transaction_id AS id,description FROM transactions WHERE group_id=? AND deleted IS NULL
 UNION ALL SELECT 'budget',b.budget_entry_id,b.description FROM budget_entries b JOIN group_budgets g ON g.id=b.budget_id WHERE g.group_id=? AND b.deleted IS NULL AND g.deleted IS NULL`;
export async function readBackfillComponent(
	env: Env,
	groupId: string,
	root: { kind: RecordKind; id: string },
): Promise<BackfillRecord[]> {
	const result =
		await env.DB.prepare(`${CATEGORY_COMPONENT_SQL},live AS (${LIVE_RECORDS_SQL})
 SELECT c.kind,c.id,l.description,r.category_id AS categoryId,r.source,COALESCE(r.version,0) AS version FROM component c JOIN live l ON l.kind=c.kind AND l.id=c.id LEFT JOIN record_categories r ON r.group_id=? AND r.record_kind=c.kind AND r.record_id=c.id ORDER BY c.kind,c.id`)
			.bind(root.kind, root.id, groupId, groupId, groupId, groupId)
			.all<BackfillRecord>();
	return result.results;
}
/** Reliable history identity only: explicit result ID or the processor's history/date ID contract. */
export async function recurringBackfillChoices(
	env: Env,
	groupId: string,
	records: BackfillRecord[],
): Promise<{
	mapped: Set<string>;
	choices: Map<string, Array<string | null>>;
}> {
	const rows =
		await env.DB.prepare(`WITH wanted AS (SELECT json_extract(value,'$.kind') AS kind,json_extract(value,'$.id') AS id FROM json_each(?))
 SELECT w.kind,w.id,
 CASE WHEN json_type(CASE WHEN json_valid(h.action_data) THEN h.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL THEN json_extract(h.action_data,'$.categoryId') ELSE json_extract(CASE WHEN json_valid(a.action_data) THEN a.action_data ELSE '{}' END,'$.categoryId') END AS categoryId,
 CASE WHEN json_type(CASE WHEN json_valid(h.action_data) THEN h.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL OR json_type(CASE WHEN json_valid(a.action_data) THEN a.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL THEN 1 ELSE 0 END AS hasDefault
 FROM wanted w JOIN scheduled_action_history h ON h.execution_status='success' AND h.action_type=CASE w.kind WHEN 'expense' THEN 'add_expense' ELSE 'add_budget' END AND (
 (w.kind='expense' AND json_extract(CASE WHEN json_valid(h.result_data) THEN h.result_data ELSE '{}' END,'$.transactionId')=w.id)
 OR (h.id='hist_'||h.scheduled_action_id||'-'||substr(h.id,-10) AND substr(h.id,-10) GLOB '????-??-??' AND w.id=CASE w.kind WHEN 'expense' THEN 'tx_' ELSE 'bge_' END||h.scheduled_action_id||'_'||substr(h.id,-10)))
 JOIN user history_owner ON history_owner.id=h.user_id AND history_owner.groupid=?
 JOIN scheduled_actions a ON a.id=h.scheduled_action_id JOIN user action_owner ON action_owner.id=a.user_id AND action_owner.groupid=?`)
			.bind(
				JSON.stringify(records.map(({ kind, id }) => ({ kind, id }))),
				groupId,
				groupId,
			)
			.all<{
				kind: RecordKind;
				id: string;
				categoryId: string | null;
				hasDefault: number;
			}>();
	const mapped = new Set<string>(),
		choices = new Map<string, Array<string | null>>();
	for (const row of rows.results) {
		const id = key(row);
		mapped.add(id);
		if (row.hasDefault) {
			const list = choices.get(id) ?? [];
			list.push(row.categoryId);
			choices.set(id, list);
		}
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
		await env.DB.prepare(`${CATEGORY_COMPONENT_SQL},live AS (${LIVE_RECORDS_SQL}),expected AS (
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
				groupId,
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
	const result = await env.DB.prepare(
		`WITH live AS (${LIVE_RECORDS_SQL}) SELECT kind,id FROM live WHERE (? IS NULL OR kind>? OR (kind=? AND id>?)) ORDER BY kind,id LIMIT 100`,
	)
		.bind(
			groupId,
			groupId,
			cursor?.kind ?? null,
			cursor?.kind ?? null,
			cursor?.kind ?? null,
			cursor?.id ?? null,
		)
		.all<{ kind: RecordKind; id: string }>();
	return result.results;
}
