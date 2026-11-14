import React, { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import type { ReduxState, BudgetTotal, GroupBudgetData } from "split-expense-shared-types";
import { useBudgetTotal } from "@/hooks/useBudget";
import { useMonthlyBudget } from "@/hooks/useMonthlyBudget";
import { useBudgetData } from "@/hooks/useBudgetData";
import { useWindowSize, getTimeRangeMapping } from "@/pages/MonthlyBudgetPage/helpers";
import { BudgetChart } from "@/pages/MonthlyBudgetPage/ChartComponents";
import TransferForm from "./TransferForm";
import { AmountGrid } from "@/components/AmountGrid";
import { Card } from "@/components/Card";
import { UiButton, UiPageTitle, UiPageDescription } from "@/components/ui";

type TimeRange = "6M" | "1Y" | "2Y" | "All";

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

	const currentBudget = budgets.find((b) => b.id === budgetId);

	const budgetTotalQuery = useBudgetTotal(budgetId);

	const timeRangeMapping = getTimeRangeMapping();
	const monthlyBudgetQuery = useMonthlyBudget({
		budgetId: budgetId || "",
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
		return (
			<div
				className="budget-container"
				data-test-id="budget-detail-not-found"
			>
				<UiButton
					type="button"
					$tone="quiet"
					onClick={() => navigate("/budget")}
					className="budget-detail-back"
				>
					← All budgets
				</UiButton>
				<div className="budget-overview-empty">
					<p>Budget not found in this household.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="budget-container" data-test-id="budget-detail-container">
			<div className="budget-detail-header">
				<UiButton
					type="button"
					$tone="quiet"
					onClick={() => navigate("/budget")}
					className="budget-detail-back"
					data-test-id="back-to-budgets-button"
				>
					← All budgets
				</UiButton>

				<header>
					<UiPageTitle>
						{currentBudget.budgetName}
						{currentBudget.deleted ? " (archived)" : ""}
					</UiPageTitle>
					<UiPageDescription>
						{currentBudget.description ||
							"Rolling money pool and monthly spending trends."}
					</UiPageDescription>
				</header>
			</div>

			{/* Available lifetime balance */}
			<Card className="budget-card" data-test-id="budget-available-card">
				<h3>Available</h3>
				<p className="finance-filter-help">
					Lifetime total · unaffected by date-range filters
				</p>
				<AmountGrid amounts={availableTotals} />
			</Card>

			{/* Monthly Trends */}
			<Card className="budget-card" data-test-id="budget-trends-section">
				<div className="budget-trends-header">
					<h3>Trends</h3>
					<div className="budget-trends-controls">
						{(["6M", "1Y", "All"] as TimeRange[]).map((range) => (
							<button
								key={range}
								type="button"
								className={`budget-time-range-btn ${timeRange === range ? "active" : ""}`}
								onClick={() => setTimeRange(range)}
								data-test-id={`time-range-${range}`}
							>
								{range}
							</button>
						))}
						{currencies.length > 1 && (
							<select
								value={selectedCurrency}
								onChange={(e) => setSelectedCurrency(e.target.value)}
								className="form-select"
								data-test-id="budget-trend-currency-select"
								style={{ padding: "4px 8px", fontSize: "13px" }}
							>
								{currencies.map((curr: string) => (
									<option key={curr} value={curr}>
										{curr}
									</option>
								))}
							</select>
						)}
					</div>
				</div>

				<BudgetChart
					chartData={chartData}
					averageExpense={averageExpense}
					currency={currency}
					windowWidth={width}
				/>
			</Card>

			{/* Transfer Form shortcut */}
			<TransferForm
				budgets={budgets}
				sourceBudgetId={budgetId || ""}
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
					to={`/transactions?budget=${budgetId}`}
					data-test-id="view-transactions-link"
				>
					View transactions in this budget →
				</Link>
			</div>
		</div>
	);
};
