import { Card } from "@/components/Card";
import { SelectBudget } from "@/SelectBudget";
import { typedApi } from "@/utils/api";
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
import type {
	BudgetMonthlyResponse,
	MonthlyBudget,
	ReduxState,
} from "split-expense-shared-types";
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
	const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [timeRange, setTimeRange] = useState<TimeRange>("6M");

	// Get session data from Redux store
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
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
		setCurrency(newCurrency);
	};

	const computeTargetMonths = useCallback(
		(range: TimeRange, periods: Array<{ periodMonths: number }>): number => {
			switch (range) {
				case "6M":
					return 6;
				case "1Y":
					return 12;
				case "2Y":
					return 24;
				case "All":
					return periods.length > 0
						? Math.max(...periods.map((p) => p.periodMonths))
						: 6;
				default:
					return 6;
			}
		},
		[],
	);

	const findAverageForCurrency = useCallback(
		(
			periods: Array<{
				periodMonths: number;
				averages: Array<{ currency: string; averageMonthlySpend: number }>;
			}>,
			targetMonths: number,
			curr: string,
		): number | null => {
			const target = periods.find((p) => p.periodMonths === targetMonths);
			if (!target) return null;
			const avg = target.averages.find((a) => a.currency === curr);
			return avg ? avg.averageMonthlySpend : null;
		},
		[],
	);

	const findFallbackAverageForCurrency = useCallback(
		(
			periods: Array<{
				periodMonths: number;
				averages: Array<{ currency: string; averageMonthlySpend: number }>;
			}>,
			curr: string,
		): number | null => {
			for (const p of periods) {
				const avg = p.averages.find((a) => a.currency === curr);
				if (avg) return avg.averageMonthlySpend;
			}
			return null;
		},
		[],
	);

	const fetchMonthlyData = useCallback(async () => {
		// Don't fetch if budget is empty
		if (!budget) {
			return;
		}

		setLoading(true);
		try {
			const response: BudgetMonthlyResponse = await typedApi.post(
				"/budget_monthly",
				{
					budgetId: budget,
				},
			);

			// Collect all available currencies from the data
			const allCurrencies = new Set<string>();
			response.monthlyBudgets.forEach((monthData) => {
				monthData.amounts.forEach((amount) => {
					allCurrencies.add(amount.currency);
				});
			});

			// Convert to array and sort (GBP first, then others)
			const currencyList = Array.from(allCurrencies).sort((a, b) => {
				if (a === "GBP") return -1;
				if (b === "GBP") return 1;
				return a.localeCompare(b);
			});

			// Set available currencies and ensure selected currency is valid
			setAvailableCurrencies(currencyList);

			// Use selectedCurrency if available, otherwise default to first currency
			const currentCurrency = currencyList.includes(selectedCurrency)
				? selectedCurrency
				: currencyList[0] || "GBP";
			if (currentCurrency !== selectedCurrency) {
				setSelectedCurrency(currentCurrency);
			}
			setCurrency(currentCurrency);

			// Filter monthlyBudgets based on timeRange
			let filteredMonthlyBudgets = response.monthlyBudgets;

			if (timeRange !== "All") {
				let monthsToShow: number;
				switch (timeRange) {
					case "6M":
						monthsToShow = 6;
						break;
					case "1Y":
						monthsToShow = 12;
						break;
					case "2Y":
						monthsToShow = 24;
						break;
					default:
						monthsToShow = 6;
				}

				// Take only the first N months (data is already sorted by newest first)
				filteredMonthlyBudgets = response.monthlyBudgets.slice(0, monthsToShow);
			}

			// Process filtered monthly budgets into chart data for selected currency only
			const processedData: ChartDataPoint[] = filteredMonthlyBudgets
				.map((monthData: MonthlyBudget) => {
					// Format month label (e.g., "Feb 2025")
					const monthLabel = `${monthData.month} ${monthData.year}`;

					// Find amount for selected currency
					const currencyAmount = monthData.amounts.find(
						(amount) => amount.currency === currentCurrency,
					);
					const totalExpenses = currencyAmount
						? Math.abs(currencyAmount.amount)
						: 0;

					return {
						month: monthLabel,
						expenses: totalExpenses,
						currency: currentCurrency,
					};
				})
				.reverse(); // Reverse to show oldest to newest (left to right ascending)

			setChartData(processedData);

			const targetMonths = computeTargetMonths(
				timeRange,
				response.averageMonthlySpend,
			);
			const directAvg = findAverageForCurrency(
				response.averageMonthlySpend,
				targetMonths,
				currentCurrency,
			);
			const fallbackAvg =
				directAvg ??
				findFallbackAverageForCurrency(
					response.averageMonthlySpend,
					currentCurrency,
				);
			setAverageExpense(Math.abs(fallbackAvg ?? 0));
		} catch (e: any) {
			console.log(e);
			// Note: 401 errors are now handled globally by API interceptor
		} finally {
			setLoading(false);
		}
	}, [
		budget,
		timeRange,
		selectedCurrency,
		computeTargetMonths,
		findAverageForCurrency,
		findFallbackAverageForCurrency,
	]);

	useEffect(() => {
		fetchMonthlyData();
	}, [fetchMonthlyData]);

	useEffect(() => {
		if (budgetId) {
			setBudget(budgetId);
		}
	}, [budgetId]);

	if (loading) {
		return (
			<div
				className="monthly-budget-container"
				data-test-id="monthly-budget-container"
			>
				<Card>
					<p>Loading monthly budget data...</p>
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
								onClick={() => handleTimeRangeChange(range)}
							>
								{range}
							</button>
						))}
					</div>
				</div>

				{/* Currency Selector */}
				<div className="currency-selector">
					{availableCurrencies.map((curr) => (
						<button
							key={curr}
							className={`currency-btn ${selectedCurrency === curr ? "active" : ""}`}
							onClick={() => handleCurrencyChange(curr)}
						>
							{getSymbolFromCurrency(curr)} {curr}
						</button>
					))}
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
					<div className="chart-wrapper">
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
					<div className="no-data">
						<p>No monthly budget data available for the selected period.</p>
					</div>
				)}
			</Card>
		</div>
	);
};
