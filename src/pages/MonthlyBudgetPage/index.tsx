import { Card } from "@/components/Card";
import { SelectBudget } from "@/SelectBudget";
import { useMonthlyBudget } from "@/hooks/useMonthlyBudget";
import getSymbolFromCurrency from "currency-symbol-map";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import type { ReduxState } from "split-expense-shared-types";
import { BudgetChart } from "./ChartComponents";
import { useWindowSize, getTimeRangeMapping } from "./helpers";
import { useBudgetData } from "@/hooks/useBudgetData";
import "./index.css";

type TimeRange = "6M" | "1Y" | "2Y" | "All";

export const MonthlyBudgetPage: React.FC = () => {
	const { budgetId } = useParams<{ budgetId: string }>();
	const [budget, setBudget] = useState(budgetId || "");
	const [selectedCurrency, setSelectedCurrency] = useState<string>("GBP");
	const [timeRange, setTimeRange] = useState<TimeRange>("6M");

	// Get session data from Redux store
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	// React Query hook for monthly budget data
	const timeRangeMapping = getTimeRangeMapping();

	const monthlyBudgetQuery = useMonthlyBudget({
		budgetId: budget,
		timeRange: timeRangeMapping[timeRange] || "Last 6 months",
		selectedCurrency,
	});

	// Use custom hook for budget data processing
	const { chartData, averageExpense, currency } = useBudgetData(
		monthlyBudgetQuery,
		selectedCurrency,
	);

	// Initialize budget with first available budget from session if budgetId param is invalid
	useEffect(() => {
		if (budgets.length > 0) {
			// If budgetId param exists and is valid, use it
			const validBudget = budgets.find((b) => b.id === budgetId);
			if (validBudget) {
				setBudget(budgetId!);
			} else {
				// Otherwise, use first available budget if current budget is empty or invalid
				const currentBudgetIsValid = budgets.find((b) => b.id === budget);
				if (!currentBudgetIsValid) {
					setBudget(budgets[0].id);
				}
			}
		}
	}, [budgets, budgetId, budget]);
	const navigate = useNavigate();
	// Using JavaScript-based responsive design instead of CSS media queries
	// because Recharts component props (margin, height, etc.) need JS values
	const { width } = useWindowSize();

	const handleChangeBudget = useCallback(
		(val: string) => {
			setBudget(val);
			navigate(`/monthly-budget/${val}`);
		},
		[navigate],
	);

	const handleTimeRangeChange = (range: TimeRange) => {
		setTimeRange(range);
		// Trigger data fetch with new timeRange
	};

	const handleCurrencyChange = (newCurrency: string) => {
		setSelectedCurrency(newCurrency);
	};

	useEffect(() => {
		if (budgetId) {
			setBudget(budgetId);
		}
	}, [budgetId]);

	if (
		monthlyBudgetQuery.isLoading ||
		(!!budget && budget.length > 0 && !monthlyBudgetQuery.data)
	) {
		return (
			<div
				className="monthly-budget-container"
				data-test-id="monthly-budget-container"
			>
				<Card>
					<p data-test-id="monthly-budget-loading">
						Loading monthly budget data...
					</p>
				</Card>
			</div>
		);
	}

	return (
		<div
			className="monthly-budget-container"
			data-test-id="monthly-budget-container"
		>
			<Card>
				{/* Header Section */}
				<div className="chart-header">
					<h2 className="chart-title">Monthly Budget Chart</h2>
					<div className="time-range-controls">
						{(["6M", "1Y", "2Y", "All"] as TimeRange[]).map((range) => (
							<button
								key={range}
								className={`time-range-btn ${timeRange === range ? "active" : ""}`}
								data-test-id={`time-range-${range}`}
								onClick={() => handleTimeRangeChange(range)}
							>
								{range}
							</button>
						))}
					</div>
				</div>

				{/* Currency Selector */}
				<div className="currency-selector">
					{(monthlyBudgetQuery.data?.availableCurrencies || []).map(
						(curr: string) => (
							<button
								key={curr}
								className={`currency-btn ${selectedCurrency === curr ? "active" : ""}`}
								data-test-id={`currency-${curr}`}
								onClick={() => handleCurrencyChange(curr)}
							>
								{getSymbolFromCurrency(curr)} {curr}
							</button>
						),
					)}
				</div>

				{/* Budget Selector */}
				<div className="budget-selector-section">
					<SelectBudget
						budgetId={budget}
						handleChangeBudget={handleChangeBudget}
					/>
				</div>

				{/* Chart Section */}
				{chartData.length > 0 ? (
					<div className="chart-wrapper" data-test-id="monthly-budget-chart">
						<BudgetChart
							chartData={chartData}
							averageExpense={averageExpense}
							currency={currency}
							windowWidth={width}
						/>
					</div>
				) : (
					<div className="no-data" data-test-id="no-data-message">
						<p>No monthly budget data available for the selected period.</p>
					</div>
				)}
			</Card>
		</div>
	);
};
