import { useState, useEffect } from "react";

interface ChartDataPoint {
	month: string;
	expenses: number;
	currency: string;
}

type TimeRange = "6M" | "1Y" | "2Y" | "All";

// Custom hook for window size
export const useWindowSize = () => {
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

export function getTimeRangeMapping(): Record<
	TimeRange,
	"All" | "Last 6 months" | "Last 12 months"
> {
	return {
		"6M": "Last 6 months",
		"1Y": "Last 12 months",
		"2Y": "Last 12 months",
		All: "All",
	};
}

export function processMonthlyBudgetData(
	data: any,
	selectedCurrency: string,
): { chartData: ChartDataPoint[]; averageExpense: number; currency: string } {
	if (!data?.data) {
		return { chartData: [], averageExpense: 0, currency: selectedCurrency };
	}

	const chartData: ChartDataPoint[] = data.data.map((entry: any) => ({
		month: entry.month,
		expenses: Math.abs(entry.totalAmount),
		currency: entry.currency || selectedCurrency,
	}));

	const averageExpense =
		chartData.length > 0
			? chartData.reduce((sum, item) => sum + item.expenses, 0) /
				chartData.length
			: 0;

	const currency =
		chartData.length > 0 ? chartData[0].currency : selectedCurrency;

	return { chartData, averageExpense, currency };
}
