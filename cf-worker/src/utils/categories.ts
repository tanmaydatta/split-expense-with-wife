import { sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";
import type {
	CategorySource,
	GroupCategory,
	RecordCategory,
	RecordKind,
} from "../../../shared-types";

export const DEFAULT_CATEGORIES = [
	["groceries", "Groceries"],
	["eating_out", "Eating out"],
	["transport", "Transport"],
	["housing", "Housing"],
	["utilities", "Utilities"],
	["shopping", "Shopping"],
	["health", "Health"],
	["entertainment", "Entertainment"],
	["income", "Income"],
	["other", "Other"],
] as const;
export type CategoryDecision = {
	categoryId: string | null;
	source: CategorySource;
	linkedFrom?: { kind: RecordKind; id: string };
};
export function categoriesEnabled(env: Env): boolean {
	return String(env.CATEGORIES_ENABLED) === "true";
}
function missingSchema(error: unknown): boolean {
	return /no such table.*(group_categories|record_categories|category_rules)/i.test(
		String(error),
	);
}

/** Default taxonomy is lazy, bounded, group-specific and race-safe. No records are reclassified. */
export async function listCategories(
	env: Env,
	groupId: string,
): Promise<{ enabled: boolean; categories: GroupCategory[] }> {
	if (!categoriesEnabled(env)) return { enabled: false, categories: [] };
	try {
		const query = env.DB.prepare(
			"SELECT id,name,slug,archived_at AS archivedAt FROM group_categories WHERE group_id=? ORDER BY name,id",
		).bind(groupId);
		let result = await query.all<GroupCategory>();
		// Probe remaining sidecars before seeding; migration mistakes never affect financial saves.
		await env.DB.prepare("SELECT 1 FROM record_categories LIMIT 1").first();
		await env.DB.prepare("SELECT 1 FROM category_rules LIMIT 1").first();
		const missing = DEFAULT_CATEGORIES.filter(
			([slug]) => !result.results.some((c) => c.slug === slug),
		);
		if (missing.length) {
			await env.DB.batch(
				missing.map(([slug, name]) =>
					env.DB.prepare(
						"INSERT INTO group_categories(id,group_id,name,slug) VALUES(?,?,?,?) ON CONFLICT(group_id,slug) DO NOTHING",
					).bind(`gc_${groupId}_${slug}`, groupId, name, slug),
				),
			);
			result = await query.all<GroupCategory>();
		}
		return { enabled: true, categories: result.results };
	} catch (error) {
		if (missingSchema(error)) return { enabled: false, categories: [] };
		throw error;
	}
}
export async function validateCategory(
	env: Env,
	groupId: string,
	categoryId: string | null,
): Promise<void> {
	if (categoryId === null) return;
	const found = await env.DB.prepare(
		"SELECT 1 FROM group_categories WHERE id=? AND group_id=? AND archived_at IS NULL",
	)
		.bind(categoryId, groupId)
		.first();
	if (!found) throw new Error("Choose an active category in this group");
}
export function normalizeCategoryText(value: string): string {
	return value
		.trim()
		.toLocaleLowerCase("en-GB")
		.replace(/\s+/g, " ")
		.slice(0, 160);
}

/** Server-only provenance: callers may supply a manual choice, never claim an AI/rule source. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit ordered category precedence preserves manual clear and saved recurring defaults.
export async function resolveCategory(
	env: Env,
	groupId: string,
	input: {
		categoryId?: string | null;
		scheduledCategoryId?: string | null;
		description: string;
		merchant?: string;
		providerCategory?: string;
	},
): Promise<CategoryDecision | undefined> {
	const taxonomy = await listCategories(env, groupId);
	if (!taxonomy.enabled) return undefined;
	if (input.categoryId !== undefined) {
		await validateCategory(env, groupId, input.categoryId);
		return { categoryId: input.categoryId, source: "manual" };
	}
	if (input.scheduledCategoryId !== undefined) {
		// Archived recurring defaults remain valid saved choices; missing defaults fall through.
		const saved =
			input.scheduledCategoryId === null ||
			taxonomy.categories.some((c) => c.id === input.scheduledCategoryId);
		if (saved)
			return { categoryId: input.scheduledCategoryId, source: "scheduled" };
	}
	const rules = await env.DB.prepare(
		"SELECT r.pattern,r.match_kind AS kind,r.category_id AS categoryId FROM category_rules r JOIN group_categories c ON c.id=r.category_id AND c.group_id=r.group_id WHERE r.group_id=? AND c.archived_at IS NULL ORDER BY CASE r.match_kind WHEN 'merchant' THEN 0 ELSE 1 END,length(r.pattern) DESC,r.id LIMIT 100",
	)
		.bind(groupId)
		.all<{ pattern: string; kind: string; categoryId: string }>();
	const merchant = normalizeCategoryText(input.merchant ?? "");
	const description = normalizeCategoryText(input.description);
	const rule = rules.results.find((r) =>
		r.kind === "merchant"
			? merchant !== "" && merchant === r.pattern
			: description.includes(r.pattern),
	);
	if (rule) return { categoryId: rule.categoryId, source: "rule" };
	if (input.providerCategory) {
		const slug = normalizeCategoryText(input.providerCategory);
		const category = taxonomy.categories.find(
			(c) => !c.archivedAt && c.slug === slug,
		);
		if (category) return { categoryId: category.id, source: "provider" };
	}
	return { categoryId: null, source: "uncategorised" };
}

/** One bounded read per page; never one request/query for each visible record. */
export async function readRecordCategories(
	env: Env,
	groupId: string,
	kind: RecordKind,
	ids: string[],
): Promise<Map<string, RecordCategory>> {
	const result = new Map<string, RecordCategory>();
	if (!categoriesEnabled(env) || !ids.length) return result;
	try {
		for (let offset = 0; offset < ids.length; offset += 50) {
			const page = ids.slice(offset, offset + 50);
			const rows = await env.DB.prepare(
				`SELECT r.record_id AS id,r.category_id AS categoryId,c.name AS categoryName,r.source AS categorySource,r.version AS categoryVersion FROM record_categories r LEFT JOIN group_categories c ON c.id=r.category_id AND c.group_id=r.group_id WHERE r.group_id=? AND r.record_kind=? AND r.record_id IN (${page.map(() => "?").join(",")})`,
			)
				.bind(groupId, kind, ...page)
				.all<RecordCategory & { id: string }>();
			for (const row of rows.results) result.set(row.id, row);
		}
	} catch (error) {
		if (!missingSchema(error)) throw error;
	}
	return result;
}
export function assignmentStatement(
	env: Env,
	groupId: string,
	kind: RecordKind,
	recordId: string,
	decision: CategoryDecision,
): D1PreparedStatement {
	return env.DB.prepare(
		"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,?,?,?,?) ON CONFLICT(group_id,record_kind,record_id) DO NOTHING",
	).bind(groupId, kind, recordId, decision.categoryId, decision.source);
}

// A bipartite connected component, not just the first sibling. UNION terminates cycles.
export const CATEGORY_COMPONENT_SQL = `WITH RECURSIVE component(kind,id) AS (
 SELECT ?,? UNION
 SELECT CASE component.kind WHEN 'expense' THEN 'budget' ELSE 'expense' END,
 CASE component.kind WHEN 'expense' THEN l.budget_entry_id ELSE l.transaction_id END
 FROM component JOIN expense_budget_links l ON l.group_id=? AND
 ((component.kind='expense' AND l.transaction_id=component.id) OR (component.kind='budget' AND l.budget_entry_id=component.id))
 JOIN transactions t ON t.transaction_id=l.transaction_id AND t.group_id=l.group_id AND t.deleted IS NULL
 JOIN budget_entries b ON b.budget_entry_id=l.budget_entry_id AND b.deleted IS NULL
 JOIN group_budgets g ON g.id=b.budget_id AND g.group_id=l.group_id AND g.deleted IS NULL
 LIMIT 1001
)`;
const VALID_RECORD = `EXISTS(SELECT 1 FROM transactions WHERE ?='expense' AND transaction_id=? AND group_id=? AND deleted IS NULL)
 OR EXISTS(SELECT 1 FROM budget_entries b JOIN group_budgets g ON g.id=b.budget_id WHERE ?='budget' AND b.budget_entry_id=? AND g.group_id=? AND b.deleted IS NULL AND g.deleted IS NULL)`;

/** Explicit edit is atomic across all active linked records, with optimistic root version. */
export async function editRecordCategory(
	env: Env,
	groupId: string,
	kind: RecordKind,
	id: string,
	categoryId: string | null,
	version: number,
): Promise<boolean> {
	await validateCategory(env, groupId, categoryId);
	const component = await env.DB.prepare(
		`${CATEGORY_COMPONENT_SQL} SELECT count(*) AS count FROM component`,
	)
		.bind(kind, id, groupId)
		.first<{ count: number }>();
	if ((component?.count ?? 0) > 1000)
		throw new Error("This category edit spans more than 1000 linked records");
	const token = ulid();
	const validArgs = [kind, id, groupId, kind, id, groupId];
	const claim =
		env.DB.prepare(`${CATEGORY_COMPONENT_SQL} INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source,version,mutation_id)
 SELECT ?,?,?,?,'manual',1,? WHERE (${VALID_RECORD}) AND ?=0 AND (SELECT count(*) FROM component)<=1000 AND (? IS NULL OR EXISTS(SELECT 1 FROM group_categories WHERE id=? AND group_id=? AND archived_at IS NULL))
 ON CONFLICT(group_id,record_kind,record_id) DO UPDATE SET category_id=excluded.category_id,source='manual',version=record_categories.version+1,mutation_id=excluded.mutation_id WHERE record_categories.version=? AND (${VALID_RECORD})`).bind(
			kind,
			id,
			groupId,
			groupId,
			kind,
			id,
			categoryId,
			token,
			...validArgs,
			version,
			categoryId,
			categoryId,
			groupId,
			version,
			...validArgs,
		);
	// Existing rows require an UPDATE claim because an INSERT SELECT with version>0 yields no row.
	const update = env.DB.prepare(
		`${CATEGORY_COMPONENT_SQL} UPDATE record_categories SET category_id=?,source='manual',version=version+1,mutation_id=? WHERE group_id=? AND record_kind=? AND record_id=? AND version=? AND ?>0 AND (${VALID_RECORD}) AND (SELECT count(*) FROM component)<=1000 AND (? IS NULL OR EXISTS(SELECT 1 FROM group_categories WHERE id=? AND group_id=? AND archived_at IS NULL))`,
	).bind(
		kind,
		id,
		groupId,
		categoryId,
		token,
		groupId,
		kind,
		id,
		version,
		version,
		...validArgs,
		categoryId,
		categoryId,
		groupId,
	);
	const propagate = env.DB.prepare(`${CATEGORY_COMPONENT_SQL}
 INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source,version,mutation_id)
 SELECT ?,kind,id,?,'manual',1,? FROM component WHERE NOT(kind=? AND id=?)
 AND EXISTS(SELECT 1 FROM record_categories WHERE group_id=? AND record_kind=? AND record_id=? AND mutation_id=?)
 ON CONFLICT(group_id,record_kind,record_id) DO UPDATE SET category_id=excluded.category_id,source='manual',version=record_categories.version+1,mutation_id=excluded.mutation_id`).bind(
		kind,
		id,
		groupId,
		groupId,
		categoryId,
		token,
		kind,
		id,
		groupId,
		kind,
		id,
		token,
	);
	const results = await env.DB.batch([claim, update, propagate]);
	return Number(results[0].meta.changes) + Number(results[1].meta.changes) > 0;
}

export async function categoryFilterCondition(
	env: Env,
	groupId: string,
	kind: RecordKind,
	id: AnySQLiteColumn,
	categoryId?: string,
): Promise<SQL | undefined> {
	if (!categoryId || !(await listCategories(env, groupId)).enabled)
		return undefined;
	if (categoryId === "uncategorised")
		return sql`NOT EXISTS(SELECT 1 FROM record_categories rc WHERE rc.group_id=${groupId} AND rc.record_kind=${kind} AND rc.record_id=${id} AND rc.category_id IS NOT NULL)`;
	return sql`EXISTS(SELECT 1 FROM record_categories rc WHERE rc.group_id=${groupId} AND rc.record_kind=${kind} AND rc.record_id=${id} AND rc.category_id=${categoryId})`;
}

export class CategoryConflictError extends Error {
	constructor(
		public choices: Array<{ categoryId: string | null; name: string }>,
	) {
		super(
			"Linked records have different categories. Choose a shared category before confirming.",
		);
	}
}
function categoryComponentQuery(
	kind: RecordKind,
	id: string,
	groupId: string,
): SQL {
	return sql`WITH RECURSIVE component(kind,id) AS (
 SELECT ${kind},${id} UNION
 SELECT CASE component.kind WHEN 'expense' THEN 'budget' ELSE 'expense' END,
 CASE component.kind WHEN 'expense' THEN l.budget_entry_id ELSE l.transaction_id END
 FROM component JOIN expense_budget_links l ON l.group_id=${groupId} AND
 ((component.kind='expense' AND l.transaction_id=component.id) OR (component.kind='budget' AND l.budget_entry_id=component.id))
 JOIN transactions t ON t.transaction_id=l.transaction_id AND t.group_id=l.group_id AND t.deleted IS NULL
 JOIN budget_entries b ON b.budget_entry_id=l.budget_entry_id AND b.deleted IS NULL
 JOIN group_budgets g ON g.id=b.budget_id AND g.group_id=l.group_id AND g.deleted IS NULL LIMIT 1001)`;
}
export type CategoryLinkPlan = {
	decision?: CategoryDecision;
	guards: SQL[];
	updates: SQL[];
};
/** Plan only; callers execute guards/updates in their existing financial bank/link batch. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linked category consensus and explicit override are guarded as one plan.
export async function planCategoryLink(
	env: Env,
	groupId: string,
	roots: Array<{ kind: RecordKind; id: string; existing?: boolean }>,
	manualCategoryId?: string | null,
	expectedVersions?: Record<string, number>,
): Promise<CategoryLinkPlan> {
	if (!(await listCategories(env, groupId)).enabled)
		return { guards: [], updates: [] };
	const choices = new Map<
		string,
		{ categoryId: string | null; name: string }
	>();
	const guards: SQL[] = [];
	for (const root of roots) {
		const rows = await env.DB.prepare(
			`${CATEGORY_COMPONENT_SQL} SELECT component.kind,component.id,r.category_id AS categoryId,r.source,r.version,c.name FROM component LEFT JOIN record_categories r ON r.group_id=? AND r.record_kind=component.kind AND r.record_id=component.id LEFT JOIN group_categories c ON c.group_id=r.group_id AND c.id=r.category_id`,
		)
			.bind(root.kind, root.id, groupId, groupId)
			.all<{
				kind: RecordKind;
				id: string;
				categoryId: string | null;
				source: CategorySource | null;
				version: number | null;
				name: string | null;
			}>();
		if (rows.results.length > 1000)
			throw new Error("This association spans more than 1000 linked records");
		for (const row of rows.results) {
			if (
				row.categoryId !== null ||
				row.source === "manual" ||
				row.source === "scheduled" ||
				row.source === "linked"
			)
				choices.set(String(row.categoryId), {
					categoryId: row.categoryId,
					name: row.name ?? "Uncategorised",
				});
		}
		const current = rows.results.find(
			(row) => row.kind === root.kind && row.id === root.id,
		);
		const version = current?.version ?? 0;
		const expected = expectedVersions?.[`${root.kind}:${root.id}`];
		if (
			manualCategoryId !== undefined &&
			root.existing !== false &&
			expected === undefined
		)
			throw new Error(
				"Refresh record categories before changing this association.",
			);
		if (expected !== undefined && expected !== version)
			throw new Error("Category changed. Refresh and try again.");
		if (root.existing !== false)
			guards.push(
				sql`SELECT CASE WHEN COALESCE((SELECT version FROM record_categories WHERE group_id=${groupId} AND record_kind=${root.kind} AND record_id=${root.id}),0)=${version} THEN 1 ELSE json('category-version-changed') END`,
			);
	}
	let decision: CategoryDecision | undefined;
	if (manualCategoryId !== undefined) {
		await validateCategory(env, groupId, manualCategoryId);
		guards.push(
			sql`SELECT CASE WHEN ${manualCategoryId} IS NULL OR EXISTS(SELECT 1 FROM group_categories WHERE id=${manualCategoryId} AND group_id=${groupId} AND archived_at IS NULL) THEN 1 ELSE json('category-unavailable') END`,
		);
		decision = { categoryId: manualCategoryId, source: "manual" };
	} else if (choices.size > 1)
		throw new CategoryConflictError([...choices.values()]);
	else if (choices.size)
		decision = {
			categoryId: [...choices.values()][0].categoryId,
			source: "linked",
		};
	if (!decision) return { guards, updates: [] };
	const token = ulid();
	const updates = roots.slice(0, 1).map(
		(root) => sql`${categoryComponentQuery(root.kind, root.id, groupId)}
 INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source,version,mutation_id)
 SELECT ${groupId},kind,id,${decision.categoryId},${decision.source},1,${token} FROM component WHERE CASE WHEN (SELECT count(*) FROM component)<=1000 THEN 1 ELSE json('category-component-too-large') END
 ON CONFLICT(group_id,record_kind,record_id) DO UPDATE SET category_id=excluded.category_id,
 source=CASE WHEN ${decision.source}='manual' OR record_categories.category_id IS NOT excluded.category_id THEN excluded.source ELSE record_categories.source END,
 version=record_categories.version+1,mutation_id=excluded.mutation_id
 WHERE record_categories.category_id IS NOT excluded.category_id OR (${decision.source}='manual' AND record_categories.source<>'manual')`,
	);
	return { decision, guards, updates };
}
