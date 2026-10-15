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
export function expenseCategoryUrl(
	id: string | null,
	data: CategoryInsightsResponse,
) {
	const params = new URLSearchParams({
		categoryId: id ?? "uncategorised",
		dateFrom: data.dateFrom,
		dateTo: data.dateTo,
		...(data.currency ? { currency: data.currency } : {}),
	});
	return `/expenses?${params}`;
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
				Positive shared expense amounts in {data.currency}.{" "}
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
								{s.id !== undefined ? (
									<Link
										className="insights-legend-link"
										to={expenseCategoryUrl(s.id, data)}
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
				<p>No positive spending to chart. Adjustments are listed above.</p>
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
				{data.excluded.count === 1 ? "expense excluded" : "expenses excluded"}:{" "}
				{data.excluded.categories.join(", ")}
			</p>
			<p className="insights-help">
				These categories are excluded explicitly in Settings. Their activity is
				absent from spending, adjustments, net expenses, counts and charts.
			</p>
			<details>
				<summary>Excluded amounts ({data.currency})</summary>
				<dl>
					<dt>Positive amounts</dt>
					<dd>{money(data.excluded.spending, data.currency)}</dd>
					<dt>Negative adjustments</dt>
					<dd>{money(data.excluded.negativeAdjustments, data.currency)}</dd>
					<dt>Net amount</dt>
					<dd>{money(data.excluded.net, data.currency)}</dd>
				</dl>
			</details>
		</Surface>
	);
}
export function InsightsContent({ data }: { data: CategoryInsightsResponse }) {
	if (!data.count)
		return (
			<>
				{" "}
				<ExcludedActivity data={data} />
				<Surface>
					<p>
						No included shared expenses in this date range
						{data.currency ? ` for ${data.currency}` : ""}. Try another range or
						currency.
					</p>
				</Surface>
			</>
		);
	return (
		<>
			{" "}
			<ExcludedActivity data={data} />
			<div className="insights-totals" aria-label="Shared expense totals">
				<Surface>
					<h2>Spending</h2>
					<strong>{money(data.spending, data.currency)}</strong>
				</Surface>
				<Surface>
					<h2>Adjustments</h2>
					<strong>{money(data.negativeAdjustments, data.currency)}</strong>
				</Surface>
				<Surface>
					<h2>Net expenses</h2>
					<strong>{money(data.net, data.currency)}</strong>
				</Surface>
			</div>
			<Surface>
				<h2>Spending by category</h2>
				<p className="insights-help">
					Percentages use positive spending only. Adjustments are shown
					separately and do not reduce the bars.
				</p>
				<div className="insights-breakdown">
					{data.categories.map((category) => (
						<Link
							className="insights-category"
							key={category.id ?? "uncategorised"}
							to={expenseCategoryUrl(category.id, data)}
						>
							<div className="insights-category-heading">
								<span>{category.name}</span>
								<strong>{money(category.spending, data.currency)}</strong>
								<span>{category.percentage.toFixed(1)}%</span>
							</div>
							<div className="insights-track" aria-hidden="true">
								<div
									style={{
										width: `${category.percentage}%`,
										background:
											colors[
												data.categories
													.filter((c) => c.spending > 0)
													.findIndex((c) => c.id === category.id)
											] ?? colors[7],
									}}
								/>
							</div>
							<small>
								{category.count} {category.count === 1 ? "expense" : "expenses"}
								{category.negativeAdjustments !== 0
									? ` · Adjustments ${money(category.negativeAdjustments, data.currency)}`
									: ""}
							</small>
						</Link>
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
export default function CategoryInsights() {
	const [params, setParams] = useSearchParams();
	const {
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
	} = useInsightDates(params);
	const query = useCategoryInsights(
		{ dateFrom, dateTo, ...(currency ? { currency } : {}) },
		valid,
	);
	return (
		<main className="category-insights">
			<header>
				<UiPageTitle>Category insights</UiPageTitle>
				<UiPageDescription>
					Explore your household’s shared expenses. Each expense counts once,
					including those linked to a budget.
				</UiPageDescription>
			</header>
			<Surface>
				<form
					className="insights-controls"
					onSubmit={(event) => {
						event.preventDefault();
						setParams({
							dateFrom: from,
							dateTo: to,
							...(currency ? { currency } : {}),
							preset: "custom",
						});
					}}
				>
					<label>
						Period
						<select
							aria-label="Period"
							value={preset}
							onChange={(event) => {
								const next = event.target.value as InsightPreset;
								const range = insightPresetRange(next, today);
								setParams({
									...(range ?? { dateFrom, dateTo }),
									...(currency ? { currency } : {}),
									preset: next,
								});
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
							value={from}
							required
							onChange={(event) => {
								setFrom(event.target.value);
							}}
						/>
					</label>
					<label>
						Date to (UTC)
						<input
							type="date"
							value={to}
							required
							onChange={(event) => setTo(event.target.value)}
						/>
					</label>
					<label>
						Currency
						<select
							aria-label="Currency"
							value={currency || query.data?.currency || ""}
							onChange={(event) =>
								setParams({
									dateFrom,
									dateTo,
									currency: event.target.value,
									preset,
								})
							}
						>
							<option value="" disabled>
								Choose currency
							</option>
							{Array.from(
								new Set([
									...(query.data?.currencies ?? []),
									...(currency ? [currency] : []),
								]),
							).map((code) => (
								<option key={code} value={code}>
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
					Shared expenses only; private bank activity and budget copies are
					excluded. Currencies stay separate with no conversion. Up to 366 days
					and 5,000 expenses across currencies per range. Negative amounts are
					adjustments, not assumed income. Net expenses combine spending and
					those negative adjustments.
				</p>
			</Surface>
			{!valid ? (
				<p role="alert">
					Choose valid dates within 366 days and a valid currency.
				</p>
			) : query.isLoading ? (
				<p role="status">Loading category insights…</p>
			) : query.isError ? (
				<Surface>
					<p role="alert">
						{query.error instanceof Error
							? query.error.message
							: "Could not load category insights"}
					</p>
					<UiButton onClick={() => query.refetch()}>Try again</UiButton>
				</Surface>
			) : query.data ? (
				<InsightsContent data={query.data} />
			) : null}
		</main>
	);
}
