import { typedApi } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import type {
	BudgetMonthlyResponse,
	MonthlyBudget,
} from "split-expense-shared-types";

export interface MonthlyBudgetFilters {
	budgetId: string;
	timeRange?: "All" | "Last 6 months" | "Last 12 months";
	selectedCurrency?: string;
}

export interface ProcessedMonthlyBudgetData {
	monthlyBudgets: MonthlyBudget[];
	availableCurrencies: string[];
	defaultCurrency: string;
}

// Helper function to process monthly budget data
export function processMonthlyBudgetData(
	response: BudgetMonthlyResponse,
	filters: MonthlyBudgetFilters
): ProcessedMonthlyBudgetData {
	// Collect all available currencies from the data
	const allCurrencies = new Set<string>();
	response.monthlyBudgets.forEach((monthData) => {
		monthData.amounts.forEach((amount) => {
			allCurrencies.add(amount.currency);
		});
	});

	// Convert to array and sort (GBP first, then others)
	const availableCurrencies = Array.from(allCurrencies).sort((a, b) => {
		if (a === "GBP") return -1;
		if (b === "GBP") return 1;
		return a.localeCompare(b);
	});

	// Determine default currency
	const defaultCurrency = availableCurrencies.includes(filters.selectedCurrency || "")
		? filters.selectedCurrency!
		: availableCurrencies[0] || "GBP";

	// Filter monthlyBudgets based on timeRange
	let filteredMonthlyBudgets = response.monthlyBudgets;

	if (filters.timeRange && filters.timeRange !== "All") {
		const monthsToShow = filters.timeRange === "Last 6 months" ? 6 : 12;
		
		// Get current date
		const currentDate = new Date();
		const cutoffDate = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth() - monthsToShow,
			1
		);

		// Filter based on month-year
		filteredMonthlyBudgets = response.monthlyBudgets.filter((monthData) => {
			const year = monthData.year;
			
			// Convert month name to month number (1-12)
			const monthNames = [
				'January', 'February', 'March', 'April', 'May', 'June',
				'July', 'August', 'September', 'October', 'November', 'December'
			];
			
			let month;
			if (monthData.month.includes("-")) {
				// Format like "2024-01"
				[, month] = monthData.month.split("-").map(Number);
			} else {
				// Month is a month name like "August"
				month = monthNames.indexOf(monthData.month) + 1;
			}
			
			const monthDate = new Date(year, month - 1, 1);
			return monthDate >= cutoffDate;
		});
	}

	// Sort monthly budgets in chronological order (oldest to newest)
	filteredMonthlyBudgets.sort((a, b) => {
		const monthNames = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
		];
		
		// Get year and month for sorting
		const getYearMonth = (monthData: any) => {
			const year = monthData.year;
			let month;
			if (monthData.month.includes("-")) {
				[, month] = monthData.month.split("-").map(Number);
			} else {
				month = monthNames.indexOf(monthData.month) + 1;
			}
			return year * 12 + month; // Convert to a comparable number
		};
		
		return getYearMonth(a) - getYearMonth(b);
	});

	return {
		monthlyBudgets: filteredMonthlyBudgets,
		availableCurrencies,
		defaultCurrency,
	};
}

// Hook for fetching monthly budget data
export function useMonthlyBudget(filters: MonthlyBudgetFilters) {
	return useQuery({
		queryKey: ["budget", "monthly", filters.budgetId, filters.timeRange, filters.selectedCurrency],
		queryFn: async (): Promise<ProcessedMonthlyBudgetData> => {
			const response: BudgetMonthlyResponse = await typedApi.post("/budget_monthly", {
				budgetId: filters.budgetId,
			});

			return processMonthlyBudgetData(response, filters);
		},
		enabled: !!filters.budgetId && filters.budgetId.length > 0,
		staleTime: 5 * 60 * 1000, // 5 minutes - monthly data doesn't change frequently
		placeholderData: (prev) => prev, // Keep previous data while fetching
	});
}

// Hook for getting available currencies from monthly budget data
export function useMonthlyBudgetCurrencies(budgetId?: string) {
	const { data } = useMonthlyBudget({ 
		budgetId: budgetId || "", 
		timeRange: "All" 
	});
	
	return {
		currencies: data?.availableCurrencies || [],
		defaultCurrency: data?.defaultCurrency || "GBP",
	};
}