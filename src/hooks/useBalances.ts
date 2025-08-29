import { typedApi } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";

export type BalanceData = Map<string, Map<string, number>>;
export type BalanceResponse = Record<string, Record<string, number>>;

// Helper function to convert API response to Map structure
export function processBalanceData(response: BalanceResponse): BalanceData {
	const localBalances = new Map<string, Map<string, number>>();
	
	Object.keys(response).forEach((userName) => {
		const currencyBalances = new Map<string, number>();
		Object.keys(response[userName]).forEach((currency) => {
			currencyBalances.set(currency, response[userName][currency]);
		});
		localBalances.set(userName, currencyBalances);
	});
	
	return localBalances;
}

// Hook for fetching balances
export function useBalances() {
	return useQuery({
		queryKey: ["balances"],
		queryFn: async (): Promise<BalanceData> => {
			const response: BalanceResponse = await typedApi.post("/balances", {});
			return processBalanceData(response);
		},
		staleTime: 2 * 60 * 1000, // 2 minutes - balances change when transactions are created/deleted
		refetchOnWindowFocus: true, // Refresh when user returns to tab
	});
}