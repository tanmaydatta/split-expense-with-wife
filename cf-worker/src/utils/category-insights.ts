import type {
	CategoryInsightBucket,
	CategoryInsightsRequest,
	CategoryInsightsResponse,
} from "split-expense-shared-types";
export const INSIGHTS_RECORD_LIMIT = 5000;
export const INSIGHTS_READ_LIMIT = 40000;
export const INSIGHTS_BUDGET_LIMIT = 100;
// Verified unique budget IDs drive bounded date-index ranges. No global ORDER BY:
// a top-K sort across budgets could scan all matching entries before LIMIT.
export const CATEGORY_INSIGHTS_SQL = `WITH selected AS MATERIALIZED (
 SELECT e.budget_entry_id,e.amount,e.currency,e.added_time,b.id AS budgetId,b.budget_name AS budgetName
 FROM json_each(?) scope
 CROSS JOIN group_budgets b ON b.id=scope.value AND b.group_id=? AND b.deleted IS NULL
 CROSS JOIN budget_entries e INDEXED BY budget_entries_monthly_aggregation_idx
 WHERE e.budget_id=b.id AND e.deleted IS NULL AND e.added_time>=? AND e.added_time<?
 LIMIT 5001
) SELECT e.amount,e.currency,substr(e.added_time,1,7) AS month,e.budgetId,e.budgetName,c.id AS categoryId,c.name AS categoryName,c.exclude_from_insights AS excluded,te.transfer_id AS transferId
 FROM selected e
 LEFT JOIN budget_transfer_entries te ON te.entry_id=e.budget_entry_id
 LEFT JOIN record_categories r ON r.group_id=? AND r.record_kind='budget' AND r.record_id=e.budget_entry_id
 LEFT JOIN group_categories c ON c.group_id=r.group_id AND c.id=r.category_id`;
interface Row {
	amount: number;
	currency: string;
	month: string;
	budgetId: string;
	budgetName: string;
	categoryId: string | null;
	categoryName: string | null;
	excluded: number | null;
 transferId:string|null;
}
export class InsightsError extends Error {
	constructor(
		message: string,
		public status = 422,
	) {
		super(message);
	}
}
const money = (value: number) =>
	Math.round((value + Number.EPSILON) * 100) / 100;
const validDate = (value: unknown): value is string =>
	typeof value === "string" &&
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	Number.isFinite(Date.parse(value)) &&
	new Date(value).toISOString().slice(0, 10) === value;
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reject unknown inputs and validate each bounded optional report filter before any database read.
export function validateInsightsRequest(
	value: unknown,
): CategoryInsightsRequest | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	if (input.source !== "budget") return null;
	if (
		Object.keys(input).some(
			(key) =>
				![
					"source",
					"dateFrom",
					"dateTo",
					"currency",
					"budgetId",
					"excludedCategoryIds",
				].includes(key),
		)
	)
		return null;
	const { dateFrom, dateTo, currency, budgetId, excludedCategoryIds } = input;
	if (
		!validDate(dateFrom) ||
		!validDate(dateTo) ||
		dateFrom > dateTo ||
		Date.parse(dateTo) - Date.parse(dateFrom) > 365 * 86400000
	)
		return null;
	if (
		currency !== undefined &&
		(typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
	)
		return null;
	if (
		budgetId !== undefined &&
		(typeof budgetId !== "string" ||
			budgetId.length < 1 ||
			budgetId.length > 100)
	)
		return null;
	if (
		excludedCategoryIds !== undefined &&
		(!Array.isArray(excludedCategoryIds) ||
			excludedCategoryIds.length > 100 ||
			excludedCategoryIds.some(
				(id) => typeof id !== "string" || !id || id.length > 200,
			))
	)
		return null;
	return {
		source: "budget",
		dateFrom,
		dateTo,
		...(currency ? { currency: currency as string } : {}),
		...(budgetId ? { budgetId: budgetId as string } : {}),
		...(excludedCategoryIds
			? { excludedCategoryIds: [...new Set(excludedCategoryIds as string[])] }
			: {}),
	};
}
function summarize(rows: Row[]) {
	const spending = rows.reduce(
			(total, row) => total + (row.amount < 0 ? -row.amount : 0),
			0,
		),
		credits = rows.reduce(
			(total, row) => total + (row.amount > 0 ? row.amount : 0),
			0,
		);
	return {
		count: rows.length,
		spending: money(spending),
		credits: money(credits),
		net: money(credits - spending),
	};
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded authenticated budget discovery, filter ownership, metering and per-category/month/budget aggregation share one read-only report.
export async function readCategoryInsights(
	env: Pick<Env, "DB">,
	group: string,
	input: CategoryInsightsRequest,
): Promise<CategoryInsightsResponse> {
	let reads = 0;
	async function measured<T>(sql: string, values: (string | number)[]) {
		const result = await env.DB.prepare(sql)
			.bind(...values)
			.all<T>();
		const cost = result.meta?.rows_read;
		if (!Number.isSafeInteger(cost) || cost < 0)
			throw new InsightsError(
				"Insights read budget unavailable. Try again later.",
				503,
			);
		reads += cost;
		if (reads > INSIGHTS_READ_LIMIT)
			throw new InsightsError(
				"Insights read budget exceeded. Choose a shorter date range.",
				503,
			);
		return result.results;
	}
	const budgets = input.budgetId
		? await measured<{ id: string; name: string }>(
				"SELECT id,budget_name AS name FROM group_budgets WHERE id=? AND group_id=? AND deleted IS NULL LIMIT 1",
				[input.budgetId, group],
			)
		: await measured<{ id: string; name: string }>(
				"SELECT id,budget_name AS name FROM group_budgets INDEXED BY group_budgets_group_id_deleted_idx WHERE group_id=? AND deleted IS NULL LIMIT 101",
				[group],
			);
	if (input.budgetId && !budgets.length)
		throw new InsightsError("Budget unavailable", 404);
	if (budgets.length > INSIGHTS_BUDGET_LIMIT)
		throw new InsightsError(
			"All budgets supports at most 100 active budgets. Choose one budget.",
		);
	const temporary = new Set(input.excludedCategoryIds ?? []),
		ids = [...temporary].filter((id) => id !== "uncategorised");
	if (ids.length) {
		const owned = await measured<{ id: string }>(
			"SELECT c.id FROM json_each(?) selected JOIN group_categories c ON c.id=selected.value AND c.group_id=?",
			[JSON.stringify(ids), group],
		);
		if (owned.length !== ids.length)
			throw new InsightsError(
				"A temporary exclusion category is unavailable in this household.",
				400,
			);
	}
	const selectedEnd = new Date(Date.parse(input.dateTo) + 86400000)
		.toISOString()
		.slice(0, 10);
	// Budget list includes through the current UTC second; an exclusive next-second cutoff is equivalent.
	const currentEnd = new Date(Math.floor(Date.now() / 1000) * 1000 + 1000)
		.toISOString()
		.slice(0, 19)
		.replace("T", " ");
	const end = selectedEnd < currentEnd ? selectedEnd : currentEnd;
	const records = budgets.length
		? await measured<Row>(CATEGORY_INSIGHTS_SQL, [
				JSON.stringify(budgets.map((b) => b.id)),
				group,
				input.dateFrom,
				end,
				group,
			])
		: [];
	if (records.length > INSIGHTS_RECORD_LIMIT)
		throw new InsightsError(
			"More than 5,000 budget entries in this range. Choose a shorter date range or one budget.",
		);
	if (records.some((row) => !Number.isFinite(row.amount)))
		throw new InsightsError("Invalid saved amount. Insights unavailable.", 503);
	const currencies = [...new Set(records.map((row) => row.currency))].sort(),
		currency =
			input.currency ??
			(currencies.includes("GBP") ? "GBP" : (currencies[0] ?? null));
	const currencyRows = records.filter((row) => row.currency === currency),
		isExcluded = (row: Row) =>
			!!row.transferId || row.excluded === 1 || temporary.has(row.categoryId ?? "uncategorised");
	const excludedRows = currencyRows.filter(isExcluded),
		rows = currencyRows.filter((row) => !isExcluded(row));
	const excluded = {
		...summarize(excludedRows),
 transfers:summarize(excludedRows.filter(row=>!!row.transferId)),
		categories: [
			...new Set(
				excludedRows.map((row) => row.transferId?"Internal budget transfers":row.categoryName ?? "Uncategorised"),
			),
		].sort(),
	};
	const totals = summarize(rows),
		buckets = new Map<string, CategoryInsightBucket>(),
		months = new Map<string, CategoryInsightsResponse["months"][number]>();
	const date = new Date(`${input.dateFrom.slice(0, 7)}-01T00:00:00Z`);
	for (
		;
		date.toISOString().slice(0, 7) <= input.dateTo.slice(0, 7);
		date.setUTCMonth(date.getUTCMonth() + 1)
	) {
		const month = date.toISOString().slice(0, 7);
		months.set(month, { month, spending: 0, categories: {} });
	}
	for (const row of rows) {
		const key = row.categoryId ?? "uncategorised",
			bucket = buckets.get(key) ?? {
				id: row.categoryId,
				name: row.categoryName ?? "Uncategorised",
				spending: 0,
				credits: 0,
				percentage: 0,
				count: 0,
				budgets: [],
			};
		bucket.count++;
		const budget = bucket.budgets.find((b) => b.id === row.budgetId) ?? {
			id: row.budgetId,
			name: row.budgetName,
			spending: 0,
			credits: 0,
			count: 0,
		};
		if (!bucket.budgets.includes(budget)) bucket.budgets.push(budget);
		budget.count++;
		if (row.amount < 0) {
			const spending = -row.amount;
			bucket.spending += spending;
			budget.spending += spending;
			const month = months.get(row.month);
			if (!month)
				throw new InsightsError(
					"Invalid saved date. Insights unavailable.",
					503,
				);
			month.spending += spending;
			month.categories[key] = (month.categories[key] ?? 0) + spending;
		} else {
			bucket.credits += row.amount;
			budget.credits += row.amount;
		}
		buckets.set(key, bucket);
	}
	const categories = [...buckets.values()]
		.map((bucket) => ({
			...bucket,
			spending: money(bucket.spending),
			credits: money(bucket.credits),
			percentage:
				totals.spending > 0 ? (bucket.spending / totals.spending) * 100 : 0,
			budgets: bucket.budgets
				.map((b) => ({
					...b,
					spending: money(b.spending),
					credits: money(b.credits),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		}))
		.sort((a, b) => b.spending - a.spending || a.name.localeCompare(b.name));
	return {
		dateFrom: input.dateFrom,
		dateTo: input.dateTo,
		budgetId: input.budgetId ?? null,
		currency,
		currencies,
		...totals,
		excluded,
		categories,
		months: [...months.values()].map((month) => ({
			...month,
			spending: money(month.spending),
			categories: Object.fromEntries(
				Object.entries(month.categories).map(([key, value]) => [
					key,
					money(value),
				]),
			),
		})),
	};
}
