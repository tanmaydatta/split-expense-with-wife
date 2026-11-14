import React, { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import getSymbolFromCurrency from "currency-symbol-map";
import type { ReduxState, BudgetTotal, GroupBudgetData } from "split-expense-shared-types";
import { useBudgetTotal } from "@/hooks/useBudget";
import { useMonthlyBudget } from "@/hooks/useMonthlyBudget";
import { useBudgetData } from "@/hooks/useBudgetData";
import { useWindowSize, getTimeRangeMapping } from "@/pages/MonthlyBudgetPage/helpers";
import { BudgetChart } from "@/pages/MonthlyBudgetPage/ChartComponents";
import TransferForm from "./TransferForm";
import { SelectBudget } from "@/SelectBudget";
import { AmountGrid } from "@/components/AmountGrid";
import { Card } from "@/components/Card";
import { UiButton, UiPageTitle, UiPageDescription } from "@/components/ui";

type TimeRange = "6M" | "1Y" | "2Y" | "All";

const BudgetNotFound: React.FC<{ onBack: () => void }> = ({ onBack }) => (
	<div className="budget-container" data-test-id="budget-detail-not-found">
		<UiButton
			type="button"
			$tone="quiet"
			onClick={onBack}
			className="budget-detail-back"
		>
			← All budgets
		</UiButton>
		<div className="budget-overview-empty">
			<p>Budget not found in this household.</p>
		</div>
	</div>
);

const BudgetDetailHeader: React.FC<{
	budget: GroupBudgetData & { deleted?: string | null };
	onBack: () => void;
}> = ({ budget, onBack }) => (
	<div className="budget-detail-header">
		<UiButton
			type="button"
			$tone="quiet"
			onClick={onBack}
			className="budget-detail-back"
			data-test-id="back-to-budgets-button"
		>
			← All budgets
		</UiButton>

		<header>
			<UiPageTitle>
				{budget.budgetName}
				{budget.deleted ? " (archived)" : ""}
			</UiPageTitle>
			<UiPageDescription>
				{budget.description ||
					"Rolling money pool and monthly spending trends."}
			</UiPageDescription>
		</header>
	</div>
);

const BudgetTrendsSection: React.FC<{
	timeRange: TimeRange;
	setTimeRange: (range: TimeRange) => void;
	selectedCurrency: string;
	setSelectedCurrency: (curr: string) => void;
	availableCurrencies: string[];
	chartData: ReturnType<typeof useBudgetData>["chartData"];
	averageExpense: number;
	currency: string;
	width: number;
	isLoading: boolean;
}> = ({
	timeRange,
	setTimeRange,
	selectedCurrency,
	setSelectedCurrency,
	availableCurrencies,
	chartData,
	averageExpense,
	currency,
	width,
	isLoading,
}) => (
	<div data-test-id="monthly-budget-container" className="monthly-budget-container">
		<Card className="budget-card" data-test-id="budget-trends-section">
			<div className="budget-trends-header chart-header">
				<h3 className="chart-title">Trends</h3>
				<div className="budget-trends-controls time-range-controls">
					{(["6M", "1Y", "2Y", "All"] as TimeRange[]).map((range) => (
						<button
							key={range}
							type="button"
							className={`budget-time-range-btn time-range-btn ${timeRange === range ? "active" : ""}`}
							onClick={() => setTimeRange(range)}
							data-test-id={`time-range-${range}`}
						>
							{range}
						</button>
					))}
				</div>
			</div>

			<div className="currency-selector" style={{ display: "flex", gap: "8px", margin: "12px 0", flexWrap: "wrap" }}>
				{availableCurrencies.map((curr) => (
					<button
						key={curr}
						type="button"
						className={`currency-btn ${selectedCurrency === curr ? "active" : ""}`}
						data-test-id={`currency-${curr}`}
						onClick={() => setSelectedCurrency(curr)}
					>
						{getSymbolFromCurrency(curr)} {curr}
					</button>
				))}
			</div>

			{isLoading && (
				<p data-test-id="monthly-budget-loading">
					Loading monthly budget data...
				</p>
			)}

			<div className="chart-wrapper" data-test-id="monthly-budget-chart">
				<BudgetChart
					chartData={chartData}
					averageExpense={averageExpense}
					currency={currency}
					windowWidth={width}
				/>
			</div>

			{!isLoading && chartData.length === 0 && (
				<div className="no-data" data-test-id="no-data-message">
					<p>No monthly budget data available for the selected period.</p>
				</div>
			)}
		</Card>
	</div>
);

export const BudgetDetail: React.FC = () => {
	const { budgetId } = useParams<{ budgetId: string }>();
	const navigate = useNavigate();

	const [timeRange, setTimeRange] = useState<TimeRange>("6M");
	const [selectedCurrency, setSelectedCurrency] = useState<string>("GBP");

	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() =>
			(data?.extra?.group?.budgets || []) as (GroupBudgetData & {
				deleted?: string | null;
			})[],
		[data?.extra?.group?.budgets],
	);
	const currencies = useMemo(
		() => data?.extra?.currencies ?? ["GBP", "USD", "EUR"],
		[data?.extra?.currencies],
	);

	const currentBudget = useMemo(() => {
		return (
			budgets.find(
				(b) =>
					b.id === budgetId ||
					b.budgetName.toLowerCase() === budgetId?.toLowerCase(),
			) || null
		);
	}, [budgets, budgetId]);
	const actualBudgetId = currentBudget?.id ?? budgetId ?? "";

	const budgetTotalQuery = useBudgetTotal(actualBudgetId);

	const timeRangeMapping = getTimeRangeMapping();
	const monthlyBudgetQuery = useMonthlyBudget({
		budgetId: actualBudgetId,
		timeRange: timeRangeMapping[timeRange] || "Last 6 months",
		selectedCurrency,
	});

	const { chartData, averageExpense, currency } = useBudgetData(
		monthlyBudgetQuery,
		selectedCurrency,
	);

	const { width } = useWindowSize();

	const availableTotals: BudgetTotal[] = useMemo(() => {
		if (budgetTotalQuery.data && budgetTotalQuery.data.length > 0) {
			return budgetTotalQuery.data;
		}
		return [{ currency: "GBP", amount: 0 }];
	}, [budgetTotalQuery.data]);

	if (!currentBudget) {
		return <BudgetNotFound onBack={() => navigate("/budget")} />;
	}

	return (
		<div className="budget-container" data-test-id="budget-detail-container">
			<BudgetDetailHeader
				budget={currentBudget}
				onBack={() => navigate("/budget")}
			/>

			<SelectBudget
				budgetId={actualBudgetId}
				handleChangeBudget={(newId) => navigate(`/budget/${newId}`)}
			/>

			{/* Available lifetime balance */}
			<Card className="budget-card" data-test-id="budget-available-card">
				<h3>Available</h3>
				<p className="finance-filter-help">
					Lifetime total · unaffected by date-range filters
				</p>
				<AmountGrid amounts={availableTotals} />
			</Card>

			{/* Monthly Trends */}
			<BudgetTrendsSection
				timeRange={timeRange}
				setTimeRange={setTimeRange}
				selectedCurrency={selectedCurrency}
				setSelectedCurrency={setSelectedCurrency}
				availableCurrencies={monthlyBudgetQuery.data?.availableCurrencies || currencies}
				chartData={chartData}
				averageExpense={averageExpense}
				currency={currency}
				width={width}
				isLoading={monthlyBudgetQuery.isLoading}
			/>

			{/* Transfer Form shortcut */}
			<TransferForm
				budgets={budgets}
				sourceBudgetId={actualBudgetId}
				currencies={currencies}
				onCreated={() => {
					void budgetTotalQuery.refetch();
					void monthlyBudgetQuery.refetch();
				}}
			/>

			{/* Link to unified transactions ledger */}
			<div className="view-transactions-banner">
				<span>Review chronological ledger activity for this budget.</span>
				<Link
					to={`/transactions?budget=${actualBudgetId}`}
					data-test-id="view-transactions-link"
				>
					View transactions in this budget →
				</Link>
			</div>
		</div>
	);
};
