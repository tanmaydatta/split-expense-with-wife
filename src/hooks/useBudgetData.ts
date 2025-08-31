import { useState, useEffect } from "react";

interface ChartDataPoint {
	month: string;
	expenses: number;
	currency: string;
}

export function useBudgetData(
	monthlyBudgetQuery: any,
	selectedCurrency: string,
) {
	const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
	const [averageExpense, setAverageExpense] = useState<number>(0);
	const [currency, setCurrency] = useState<string>(selectedCurrency);

	// Process monthly budget data from React Query
	useEffect(() => {
		if (monthlyBudgetQuery.data) {
			const { monthlyBudgets, availableCurrencies, defaultCurrency } =
				monthlyBudgetQuery.data;

			// Update currencies
			const currentCurrency = availableCurrencies.includes(selectedCurrency)
				? selectedCurrency
				: defaultCurrency;

			setCurrency(currentCurrency);

			// Process data for chart display for the selected currency
			const processedChartData: ChartDataPoint[] = monthlyBudgets.map(
				(monthData: any) => {
					const monthAmount = monthData.amounts.find(
						(amount: any) => amount.currency === currentCurrency,
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

	return {
		chartData,
		averageExpense,
		currency,
		setChartData,
		setAverageExpense,
		setCurrency,
	};
}
