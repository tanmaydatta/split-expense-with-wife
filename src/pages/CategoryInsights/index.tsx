import { useSelector } from "react-redux";
import { useCategories } from "@/hooks/useCategories";
import type {
	ReduxState,
	CategoryInsightBucket,
} from "split-expense-shared-types";
import {
	TemporaryExclusions,
	temporaryCategoryIds,
	applyTemporaryExclusions,
} from "./TemporaryExclusions";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { CategoryInsightsResponse } from "split-expense-shared-types";
import {
	Surface,
	UiButton,
	UiPageDescription,
	UiPageTitle,
} from "@/components/ui";
import { useCategoryInsights } from "@/hooks/useCategoryInsights";
import {
	insightPresets,
	insightPresetRange,
	type InsightPreset,
} from "./presets";
import "./index.css";
const colors = [
	"#2459c5",
	"#1f8476",
	"#9b5caa",
	"#c67b1c",
	"#bf4a62",
	"#517c3d",
	"#6f6bc0",
	"#64748b",
];
const money = (amount: number, currency: string | null) =>
	new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency: currency ?? "GBP",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
export function budgetCategoryUrl(
	budgetId: string,
	id: string | null,
	data: CategoryInsightsResponse,
) {
	const params = new URLSearchParams({
		budget: budgetId,
		categoryId: id ?? "uncategorised",
		dateFrom: data.dateFrom,
		dateTo: data.dateTo,
		...(data.currency ? { currency: data.currency } : {}),
	});
	return `/budget?${params}`;
}
function MonthlySpending({ data }: { data: CategoryInsightsResponse }) {
	const top = data.categories.filter((c) => c.spending > 0).slice(0, 7);
	const topKeys = top.map((c) => c.id ?? "uncategorised");
	const extra = data.categories.some(
		(c) => c.spending > 0 && !topKeys.includes(c.id ?? "uncategorised"),
	);
	const series = [
		...top.map((c, i) => ({
			key: `c${i}`,
			name: c.name,
			color: colors[i],
			id: c.id,
		})),
		...(extra
			? [
					{
						key: "other",
						name: "Other categories",
						color: colors[7],
						id: undefined,
					},
				]
			: []),
	];
	const chartData = data.months.map((month) => ({
		month: month.month,
		...Object.fromEntries(
			topKeys.map((key, i) => [`c${i}`, month.categories[key] ?? 0]),
		),
		other: Object.entries(month.categories).reduce(
			(total, [key, value]) => total + (topKeys.includes(key) ? 0 : value),
			0,
		),
	}));
	return (
		<Surface>
			<h2>Monthly spending</h2>
			<p className="insights-help">
				Budget debit spending in {data.currency}.{" "}
				{extra
					? "The seven largest categories are shown individually; the rest form Other categories."
					: ""}
			</p>
			{data.spending > 0 ? (
				<>
					<div
						className="insights-chart"
						role="img"
						aria-label={`Monthly stacked spending by category in ${data.currency}; monthly category amounts follow below`}
					>
						<ResponsiveContainer width="100%" height={280}>
							<BarChart
								data={chartData}
								margin={{ top: 10, right: 8, left: 0, bottom: 8 }}
							>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="month" tick={{ fontSize: 12 }} />
								<YAxis width={60} tick={{ fontSize: 12 }} />
								<Tooltip
									formatter={(value: number) => money(value, data.currency)}
								/>
								{series.map((s) => (
									<Bar
										key={s.key}
										dataKey={s.key}
										name={s.name}
										stackId="spending"
										fill={s.color}
										isAnimationActive={false}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>
					<ul className="insights-legend">
						{series.map((s) => (
							<li className="insights-legend-item" key={s.key}>
								{s.id !== undefined && data.budgetId ? (
									<Link
										className="insights-legend-link"
										to={budgetCategoryUrl(data.budgetId, s.id, data)}
									>
										<span
											className="insights-legend-swatch"
											aria-hidden="true"
											style={{ background: s.color }}
										/>
										<span className="insights-legend-text">{s.name}</span>
									</Link>
								) : (
									<span className="insights-legend-static">
										<span
											className="insights-legend-swatch"
											aria-hidden="true"
											style={{ background: s.color }}
										/>
										<span className="insights-legend-text">{s.name}</span>
									</span>
								)}
							</li>
						))}
					</ul>
				</>
			) : (
				<p>No budget debits to chart. Credits are listed above.</p>
			)}
			<details>
				<summary>Monthly spending totals</summary>
				{data.months.map((month) => (
					<section className="insights-month-detail" key={month.month}>
						<h3>
							{month.month} · {money(month.spending, data.currency)}
						</h3>
						<ul className="insights-months">
							{data.categories
								.filter(
									(category) =>
										(month.categories[category.id ?? "uncategorised"] ?? 0) > 0,
								)
								.map((category) => (
									<li key={category.id ?? "uncategorised"}>
										<span>{category.name}</span>
										<strong>
											{money(
												month.categories[category.id ?? "uncategorised"],
												data.currency,
											)}
										</strong>
									</li>
								))}
						</ul>
					</section>
				))}
			</details>
		</Surface>
	);
}
function ExcludedActivity({ data }: { data: CategoryInsightsResponse }) {
	if (!data.excluded.count) return null;
	return (
		<Surface className="insights-excluded">
			<p>
				{data.excluded.count}{" "}
				{data.excluded.count === 1
					? "budget entry excluded"
					: "budget entries excluded"}
				: {data.excluded.categories.join(", ")}
			</p>
			<p className="insights-help">
				Internal budget transfers are always excluded. Saved category exclusions and this view’s temporary exclusions apply
				together. Excluded entries are absent from all included totals, counts
				and charts.
			</p>
			<details>
				<summary>Excluded amounts ({data.currency})</summary>
				<dl>
					{(data.excluded.transfers?.count??0)>0&&<><dt>Internal transfer entries</dt><dd>{data.excluded.transfers!.count} · Debits {money(data.excluded.transfers!.spending,data.currency)} · Credits {money(data.excluded.transfers!.credits,data.currency)}</dd></>}
					<dt>Debit spending</dt>
					<dd>{money(data.excluded.spending, data.currency)}</dd>
					<dt>Credits</dt>
					<dd>{money(data.excluded.credits, data.currency)}</dd>
					<dt>Net budget movement</dt>
					<dd>{money(data.excluded.net, data.currency)}</dd>
				</dl>
			</details>
		</Surface>
	);
}
function CategoryBreakdown({
	category,
	data,
	color,
}: {
	category: CategoryInsightBucket;
	data: CategoryInsightsResponse;
	color: string;
}) {
	return (
		<section className="insights-category">
			<div className="insights-category-heading">
				{data.budgetId ? (
					<Link to={budgetCategoryUrl(data.budgetId, category.id, data)}>
						{category.name}
					</Link>
				) : (
					<span>{category.name}</span>
				)}
				<strong>{money(category.spending, data.currency)}</strong>
				<span>{category.percentage.toFixed(1)}%</span>
			</div>
			<div className="insights-track" aria-hidden="true">
				<div style={{ width: `${category.percentage}%`, background: color }} />
			</div>
			<small>
				{category.count}{" "}
				{category.count === 1 ? "budget entry" : "budget entries"} · Credits{" "}
				{money(category.credits, data.currency)}
			</small>
			{!data.budgetId && (
				<details className="insights-entry-links">
					<summary>View budget entries</summary>
					<ul>
						{category.budgets.map((budget) => (
							<li key={budget.id}>
								<Link to={budgetCategoryUrl(budget.id, category.id, data)}>
									{budget.name} · Spending{" "}
									{money(budget.spending, data.currency)} · Credits{" "}
									{money(budget.credits, data.currency)}
								</Link>
							</li>
						))}
					</ul>
				</details>
			)}
		</section>
	);
}
export function InsightsContent({ data }: { data: CategoryInsightsResponse }) {
	if (!data.count)
		return (
			<>
				<ExcludedActivity data={data} />
				<Surface>
					<p>
						No included budget entries in this date range
						{data.currency ? ` for ${data.currency}` : ""}. Try another range,
						budget, currency or temporary filter.
					</p>
				</Surface>
			</>
		);
	return (
		<>
			<ExcludedActivity data={data} />
			<div className="insights-totals" aria-label="Budget entry totals">
				<Surface>
					<h2>Spending</h2>
					<strong>{money(data.spending, data.currency)}</strong>
				</Surface>
				<Surface>
					<h2>Credits</h2>
					<strong>{money(data.credits, data.currency)}</strong>
				</Surface>
				<Surface>
					<h2>Net budget movement</h2>
					<strong>{money(data.net, data.currency)}</strong>
				</Surface>
			</div>
			<Surface>
				<h2>Spending by category</h2>
				<p className="insights-help">
					Spending and percentages use budget debit magnitudes only. Credits are
					separate, not assumed income. Net budget movement is credits minus
					spending.
				</p>
				<div className="insights-breakdown">
					{data.categories.map((category, i) => (
						<CategoryBreakdown
							key={category.id ?? "uncategorised"}
							category={category}
							data={data}
							color={colors[i] ?? colors[7]}
						/>
					))}
				</div>
			</Surface>
			<MonthlySpending data={data} />
		</>
	);
}
function useInsightDates(params: URLSearchParams) {
	const today = new Date().toISOString().slice(0, 10),
		month = today.slice(0, 7) + "-01";
	const rawPreset = params.get("preset");
	const preset: InsightPreset = rawPreset
		? insightPresets.some(([value]) => value === rawPreset)
			? (rawPreset as InsightPreset)
			: "custom"
		: params.has("dateFrom") || params.has("dateTo")
			? "custom"
			: "thisMonth";
	const presetRange = insightPresetRange(preset, today);
	const dateFrom = presetRange?.dateFrom ?? params.get("dateFrom") ?? month,
		dateTo = presetRange?.dateTo ?? params.get("dateTo") ?? today,
		currency = params.get("currency") ?? "";
	const [from, setFrom] = useState(dateFrom),
		[to, setTo] = useState(dateTo);
	useEffect(() => {
		setFrom(dateFrom);
		setTo(dateTo);
	}, [dateFrom, dateTo]);
	const days = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000;
	const valid =
		Number.isFinite(days) &&
		days >= 0 &&
		days <= 365 &&
		[dateFrom, dateTo].every(
			(date) =>
				/^\d{4}-\d{2}-\d{2}$/.test(date) &&
				new Date(date).toISOString().slice(0, 10) === date,
		) &&
		(!currency || /^[A-Z]{3}$/.test(currency));
	return {
		dateFrom,
		dateTo,
		currency,
		preset,
		from,
		to,
		setFrom,
		setTo,
		valid,
		today,
	};
}
function BudgetInsightControls({
	dates,
	budgets,
	budgetId,
	currencies,
	selectedCurrency,
	update,
}: {
	dates: ReturnType<typeof useInsightDates>;
	budgets: import("split-expense-shared-types").GroupBudgetData[];
	budgetId: string;
	currencies: string[];
	selectedCurrency?: string | null;
	update: (values: Record<string, string | undefined>) => void;
}) {
	const {
		dateFrom,
		dateTo,
		currency,
		preset,
		from,
		to,
		setFrom,
		setTo,
		today,
	} = dates;
	return (
		<Surface>
			<form
				className="insights-controls"
				onSubmit={(event) => {
					event.preventDefault();
					update({ dateFrom: from, dateTo: to, preset: "custom" });
				}}
			>
				<label>
					Budget
					<select
						aria-label="Budget scope"
						value={budgetId}
						onChange={(event) =>
							update({ budget: event.target.value || undefined })
						}
					>
						<option value="">All active budgets</option>
						{budgets.map((budget) => (
							<option value={budget.id} key={budget.id}>
								{budget.budgetName}
							</option>
						))}
					</select>
				</label>
				<label>
					Period
					<select
						aria-label="Period"
						value={preset}
						onChange={(event) => {
							const next = event.target.value as InsightPreset;
							const range = insightPresetRange(next, today);
							update({ ...(range ?? { dateFrom, dateTo }), preset: next });
						}}
					>
						{insightPresets.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label>
					Date from (UTC)
					<input
						type="date"
						required
						value={from}
						onChange={(event) => setFrom(event.target.value)}
					/>
				</label>
				<label>
					Date to (UTC)
					<input
						type="date"
						required
						value={to}
						onChange={(event) => setTo(event.target.value)}
					/>
				</label>
				<label>
					Currency
					<select
						aria-label="Currency"
						value={currency || selectedCurrency || ""}
						onChange={(event) => update({ currency: event.target.value })}
					>
						<option value="" disabled>
							Choose currency
						</option>
						{Array.from(
							new Set([...(currencies ?? []), ...(currency ? [currency] : [])]),
						).map((code) => (
							<option value={code} key={code}>
								{code}
							</option>
						))}
					</select>
				</label>
				<UiButton type="submit" $tone="primary">
					Apply dates
				</UiButton>
			</form>
			<p className="insights-help">
				Debits are spending; credits are budget funding or other positive
				movements, not assumed income. No currency conversion. Up to 366
				inclusive UTC days, 5,000 entries across currencies and exclusions, and
				100 active budgets for All. Future-dated entries are excluded, matching
				the Budget page.
			</p>
		</Surface>
	);
}
export default function CategoryInsights() {
	const [params, setParams] = useSearchParams();
	const dates = useInsightDates(params);
	const { dateFrom, dateTo, currency, valid } = dates;
	const budgets = useSelector(
			(state: ReduxState) => state.value?.extra?.group?.budgets ?? [],
		),
		taxonomy = useCategories();
	const budgetId = params.get("budget") ?? "",
		excludedCategoryIds = temporaryCategoryIds(params);
	const query = useCategoryInsights(
		{
			dateFrom,
			dateTo,
			...(currency ? { currency } : {}),
			...(budgetId ? { budgetId } : {}),
			...(excludedCategoryIds.length ? { excludedCategoryIds } : {}),
		},
		valid,
	);
	const update = (values: Record<string, string | undefined>) =>
		setParams((previous) => {
			const next = new URLSearchParams(previous);
			Object.entries(values).forEach(([key, value]) =>
				value ? next.set(key, value) : next.delete(key),
			);
			return next;
		});
	return (
		<main className="category-insights">
			<header>
				<UiPageTitle>Budget category insights</UiPageTitle>
				<UiPageDescription>
					Budget entries only, across all active household budgets or one
					selected budget. Shared expenses and private bank activity are
					excluded.
				</UiPageDescription>
			</header>
			<BudgetInsightControls
				dates={dates}
				budgets={budgets}
				budgetId={budgetId}
				currencies={query.data?.currencies ?? []}
				selectedCurrency={query.data?.currency}
				update={update}
			/>
			<TemporaryExclusions
				categories={taxonomy.data?.categories ?? []}
				applied={excludedCategoryIds}
				onApply={(ids) =>
					setParams((previous) => applyTemporaryExclusions(previous, ids))
				}
			/>
			{!valid ? (
				<p role="alert">
					Choose valid dates within 366 days and a valid currency.
				</p>
			) : query.isLoading ? (
				<p role="status">Loading budget category insights…</p>
			) : query.isError ? (
				<Surface>
					<p role="alert">
						{query.error instanceof Error
							? query.error.message
							: "Could not load budget insights"}
					</p>
					<UiButton onClick={() => query.refetch()}>Try again</UiButton>
				</Surface>
			) : query.data ? (
				<>
					<p className="insights-scope">
						Scope:{" "}
						{budgetId
							? (budgets.find((b) => b.id === budgetId)?.budgetName ??
								"Selected budget")
							: "All active household budgets"}
					</p>
					<InsightsContent data={query.data} />
				</>
			) : null}
		</main>
	);
}
