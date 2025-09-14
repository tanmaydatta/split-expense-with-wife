import getSymbolFromCurrency from "currency-symbol-map";
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

interface ChartDataPoint {
	month: string;
	expenses: number;
	currency: string;
}

export const CustomTooltip = ({ active, payload, label }: any) => {
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

interface BudgetChartProps {
	chartData: ChartDataPoint[];
	averageExpense: number;
	currency: string;
	windowWidth: number;
}

export function BudgetChart({
	chartData,
	averageExpense,
	currency,
	windowWidth,
}: BudgetChartProps) {
	const chartHeight = windowWidth < 768 ? 300 : 400;
	const margin =
		windowWidth < 768
			? { top: 20, right: 80, left: 10, bottom: 60 }
			: { top: 20, right: 120, left: 20, bottom: 5 };

	return (
		<ResponsiveContainer width="100%" height={chartHeight}>
			<BarChart data={chartData} margin={margin}>
				<CartesianGrid strokeDasharray="3 3" />
				<XAxis
					dataKey="month"
					angle={windowWidth < 768 ? -45 : 0}
					textAnchor={windowWidth < 768 ? "end" : "middle"}
					height={windowWidth < 768 ? 80 : 30}
					fontSize={windowWidth < 768 ? 12 : 14}
				/>
				<YAxis
					fontSize={windowWidth < 768 ? 12 : 14}
					tickFormatter={(value) =>
						`${getSymbolFromCurrency(currency)}${value.toLocaleString()}`
					}
				/>
				<Tooltip content={<CustomTooltip />} />
				<Legend />
				<Bar
					dataKey="expenses"
					fill="var(--color-danger)"
					name="Monthly Expenses"
					radius={[4, 4, 0, 0]}
				/>
				<ReferenceLine
					y={averageExpense}
					stroke="#ff7300"
					strokeDasharray="5 5"
					strokeWidth={2}
					label={{
						value: `Avg: ${getSymbolFromCurrency(currency)}${Math.round(averageExpense).toLocaleString()}`,
						position: "right",
						style: {
							fontSize: windowWidth <= 480 ? "10px" : "12px",
							fontWeight: "600",
							fill: "var(--color-danger)",
						},
					}}
				/>
			</BarChart>
		</ResponsiveContainer>
	);
}
