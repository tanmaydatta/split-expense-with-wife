import type {
	CategoryInsightBucket,
	CategoryInsightsRequest,
	CategoryInsightsResponse,
} from "split-expense-shared-types";
export const INSIGHTS_RECORD_LIMIT = 5000;
export const INSIGHTS_READ_LIMIT = 40000;
// LIMIT is inside the materialized indexed range, before category enrichment.
// Currency filtering follows this bound so sparse currencies cannot scan unlimited history.
export const CATEGORY_INSIGHTS_SQL = `WITH selected AS MATERIALIZED (
 SELECT transaction_id, amount, currency, created_at FROM transactions
 INDEXED BY transactions_group_id_deleted_created_at_idx
 WHERE group_id=? AND deleted IS NULL AND created_at>=? AND created_at<?
 ORDER BY created_at LIMIT 5001
) SELECT t.amount,t.currency,substr(t.created_at,1,7) AS month,c.id AS categoryId,c.name AS categoryName,c.exclude_from_insights AS excluded
 FROM selected t
 LEFT JOIN record_categories r ON r.group_id=? AND r.record_kind='expense' AND r.record_id=t.transaction_id
 LEFT JOIN group_categories c ON c.group_id=r.group_id AND c.id=r.category_id`;
interface Row {
	excluded: number;
	amount: number;
	currency: string;
	month: string;
	categoryId: string | null;
	categoryName: string | null;
}
export function validateInsightsRequest(
	value: unknown,
): CategoryInsightsRequest | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	if (
		Object.keys(input).some(
			(key) => !["dateFrom", "dateTo", "currency"].includes(key),
		)
	)
		return null;
	const { dateFrom, dateTo, currency } = input;
	const validDate = (d: unknown): d is string =>
		typeof d === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(d) &&
		Number.isFinite(Date.parse(d)) &&
		new Date(d).toISOString().slice(0, 10) === d;
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
	return {
		dateFrom,
		dateTo,
		...(currency ? { currency: currency as string } : {}),
	};
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded per-currency aggregation keeps spending, adjustments and monthly category totals together.
export async function readCategoryInsights(
	env: Pick<Env, "DB">,
	group: string,
	input: CategoryInsightsRequest,
): Promise<CategoryInsightsResponse> {
	const end = new Date(Date.parse(input.dateTo) + 86400000)
		.toISOString()
		.slice(0, 10);
	const result = await env.DB.prepare(CATEGORY_INSIGHTS_SQL)
		.bind(group, input.dateFrom, end, group)
		.all<Row>();
	const reads = result.meta?.rows_read;
	if (!Number.isSafeInteger(reads) || reads < 0 || reads > INSIGHTS_READ_LIMIT)
		throw new InsightsError(
			"Insights read budget exceeded. Choose a shorter date range.",
			503,
		);
	if (result.results.length > INSIGHTS_RECORD_LIMIT)
		throw new InsightsError(
			"More than 5,000 shared expenses in this range. Choose a shorter date range.",
		);
	const currencies = [
		...new Set(result.results.map((row) => row.currency)),
	].sort();
	const currency =
		input.currency ??
		(currencies.includes("GBP") ? "GBP" : (currencies[0] ?? null));
	const currencyRows = result.results.filter(
		(row) => row.currency === currency,
	);
	const excludedRows = currencyRows.filter((row) => row.excluded === 1);
	const excludedSpending = excludedRows.reduce(
		(total, row) => total + (row.amount > 0 ? row.amount : 0),
		0,
	);
	const excludedAdjustments = excludedRows.reduce(
		(total, row) => total + (row.amount < 0 ? row.amount : 0),
		0,
	);
	const excluded = {
		count: excludedRows.length,
		spending: money(excludedSpending),
		negativeAdjustments: money(excludedAdjustments),
		net: money(excludedSpending + excludedAdjustments),
		categories: [
			...new Set(
				excludedRows.map((row) => row.categoryName ?? "Uncategorised"),
			),
		].sort(),
	};
	const rows = currencyRows.filter((row) => row.excluded !== 1);
	const buckets = new Map<string, CategoryInsightBucket>();
	const months = new Map<string, CategoryInsightsResponse["months"][number]>();
	const start = new Date(`${input.dateFrom.slice(0, 7)}-01T00:00:00Z`);
	for (
		let date = start;
		date.toISOString().slice(0, 7) <= input.dateTo.slice(0, 7);
		date.setUTCMonth(date.getUTCMonth() + 1)
	) {
		const month = date.toISOString().slice(0, 7);
		months.set(month, { month, spending: 0, categories: {} });
	}
	let spending = 0,
		negativeAdjustments = 0;
	for (const row of rows) {
		if (!Number.isFinite(row.amount))
			throw new InsightsError(
				"Invalid saved amount. Insights unavailable.",
				503,
			);
		const key = row.categoryId ?? "uncategorised";
		const bucket = buckets.get(key) ?? {
			id: row.categoryId,
			name: row.categoryName ?? "Uncategorised",
			spending: 0,
			negativeAdjustments: 0,
			percentage: 0,
			count: 0,
		};
		bucket.count++;
		if (row.amount > 0) {
			spending += row.amount;
			bucket.spending += row.amount;
			const month = months.get(row.month);
			if (!month)
				throw new InsightsError(
					"Invalid saved date. Insights unavailable.",
					503,
				);
			month.spending += row.amount;
			month.categories[key] = (month.categories[key] ?? 0) + row.amount;
		} else {
			negativeAdjustments += row.amount;
			bucket.negativeAdjustments += row.amount;
		}
		buckets.set(key, bucket);
	}
	const categories = [...buckets.values()]
		.map((bucket) => ({
			...bucket,
			spending: money(bucket.spending),
			negativeAdjustments: money(bucket.negativeAdjustments),
			percentage: spending > 0 ? (bucket.spending / spending) * 100 : 0,
		}))
		.sort((a, b) => b.spending - a.spending || a.name.localeCompare(b.name));
	return {
		...input,
		currency,
		currencies,
		count: rows.length,
		excluded,
		spending: money(spending),
		negativeAdjustments: money(negativeAdjustments),
		net: money(spending + negativeAdjustments),
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
