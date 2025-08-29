import { Card } from "@/components/Card";
import { SelectBudget } from "@/SelectBudget";
import { useMonthlyBudget } from "@/hooks/useMonthlyBudget";
import getSymbolFromCurrency from "currency-symbol-map";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ReduxState } from "split-expense-shared-types";
import "./index.css";

interface ChartDataPoint {
	month: string;
	expenses: number;
	currency: string;
}

type TimeRange = "6M" | "1Y" | "2Y" | "All";

// Custom hook for window size
const useWindowSize = () => {
	const [windowSize, setWindowSize] = useState({
		width: typeof window !== "undefined" ? window.innerWidth : 1024,
	});

	useEffect(() => {
		if (typeof window === "undefined") return;

		const handleResize = () => {
			setWindowSize({
				width: window.innerWidth,
			});
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return windowSize;
};

const CustomTooltip = ({ active, payload, label }: any) => {
	if (active && payload && payload.length) {
		const data = payload[0].payload;
		return (
			<div className="custom-tooltip">
				<p className="tooltip-label">{label}</p>
				<p className="tooltip-value">
					Expenses: {getSymbolFromCurrency(data.currency)}
					{data.expenses.toLocaleString()}
				</p>
			</div>
		);
	}
	return null;
};

export const MonthlyBudgetPage: React.FC = () => {
	const { budgetId } = useParams<{ budgetId: string }>();
	const [budget, setBudget] = useState(budgetId || "");
	const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
	const [averageExpense, setAverageExpense] = useState<number>(0);
	const [currency, setCurrency] = useState<string>("GBP");
	const [selectedCurrency, setSelectedCurrency] = useState<string>("GBP");
	const [timeRange, setTimeRange] = useState<TimeRange>("6M");

	// Get session data from Redux store
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	// React Query hook for monthly budget data
	const timeRangeMapping: Record<
		TimeRange,
		"All" | "Last 6 months" | "Last 12 months"
	> = {
		"6M": "Last 6 months",
		"1Y": "Last 12 months",
		"2Y": "Last 12 months", // Treat 2Y same as 1Y for now
		All: "All",
	};

	const monthlyBudgetQuery = useMonthlyBudget({
		budgetId: budget,
		timeRange: timeRangeMapping[timeRange] || "Last 6 months",
		selectedCurrency,
	});

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
		setCurrency(newCurrency);
	};

	// Process monthly budget data from React Query
	useEffect(() => {
		if (monthlyBudgetQuery.data) {
			const { monthlyBudgets, availableCurrencies, defaultCurrency } =
				monthlyBudgetQuery.data;

			// Update currencies
			const currentCurrency = availableCurrencies.includes(selectedCurrency)
				? selectedCurrency
				: defaultCurrency;

			if (currentCurrency !== selectedCurrency) {
				setSelectedCurrency(currentCurrency);
			}
			setCurrency(currentCurrency);

			// Process data for chart display for the selected currency
			const processedChartData: ChartDataPoint[] = monthlyBudgets.map(
				(monthData) => {
					const monthAmount = monthData.amounts.find(
						(amount) => amount.currency === currentCurrency,
					);

					return {
						month: monthData.month,
						expenses: Math.abs(monthAmount?.amount || 0),
						currency: currentCurrency,
					};
				},
			);

			// Calculate average for the selected currency only
			const validAmounts = processedChartData
				.map((item) => item.expenses)
				.filter((amount) => amount > 0);

			const average =
				validAmounts.length > 0
					? validAmounts.reduce((sum, amount) => sum + amount, 0) /
						validAmounts.length
					: 0;

			setChartData(processedChartData);
			setAverageExpense(average);
		}
	}, [monthlyBudgetQuery.data, selectedCurrency]);

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
						<ResponsiveContainer
							width="100%"
							height={width <= 480 ? 300 : width <= 768 ? 350 : 400}
						>
							<BarChart
								data={chartData}
								// Note: Cannot use CSS media queries for Recharts margin prop
								// because Recharts components expect JavaScript values for layout props
								// like margin, width, height. CSS media queries only affect DOM styling,
								// not React component props passed to third-party libraries.
								margin={
									width <= 480
										? { top: 20, right: 60, left: 10, bottom: 5 }
										: width <= 768
											? { top: 25, right: 70, left: 15, bottom: 5 }
											: { top: 30, right: 80, left: 20, bottom: 5 }
								}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
								<XAxis
									dataKey="month"
									axisLine={false}
									tickLine={false}
									tick={{ fontSize: width <= 480 ? 10 : 12, fill: "#666" }}
									angle={width <= 480 ? -45 : 0}
									textAnchor={width <= 480 ? "end" : "middle"}
									height={width <= 480 ? 60 : 30}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{ fontSize: width <= 480 ? 10 : 12, fill: "#666" }}
									tickFormatter={(value) => {
										const symbol = getSymbolFromCurrency(currency);
										if (width <= 480) {
											// On small screens, use shorter format
											return value >= 1000
												? `${symbol}${(value / 1000).toFixed(0)}k`
												: `${symbol}${value}`;
										}
										return `${symbol}${value.toLocaleString()}`;
									}}
								/>
								<Tooltip content={<CustomTooltip />} />
								<Legend wrapperStyle={{ paddingTop: "20px" }} iconType="rect" />
								<Bar
									dataKey="expenses"
									fill="#dc3545"
									radius={[4, 4, 0, 0]}
									label={{
										position: "top",
										formatter: (value: number) =>
											value > 0
												? `${getSymbolFromCurrency(currency)}${Math.round(value).toLocaleString()}`
												: "",
										style: {
											fontSize: "12px",
											fontWeight: "600",
											fill: "#333",
										},
									}}
									name="Expenses"
								/>
								{averageExpense > 0 && (
									<ReferenceLine
										y={averageExpense}
										stroke="#ff8c42"
										strokeDasharray="5 5"
										strokeWidth={2}
										label={{
											value:
												width <= 480
													? `Avg: ${getSymbolFromCurrency(currency)}${Math.round(averageExpense) >= 1000 ? `${(Math.round(averageExpense) / 1000).toFixed(0)}k` : Math.round(averageExpense)}`
													: `Avg: ${getSymbolFromCurrency(currency)}${Math.round(averageExpense).toLocaleString()}`,
											position: "right",
											style: {
												fontSize: width <= 480 ? "10px" : "12px",
												fontWeight: "600",
												fill: "#ff7300",
											},
										}}
									/>
								)}
							</BarChart>
						</ResponsiveContainer>
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
