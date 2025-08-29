import { typedApi } from "@/utils/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	BudgetDeleteRequest,
	BudgetEntry,
	BudgetListRequest,
	BudgetTotalRequest,
} from "split-expense-shared-types";

// Hook for fetching budget totals
export function useBudgetTotal(budgetId?: string) {
	return useQuery({
		queryKey: ["budget", "total", budgetId],
		queryFn: async () => {
			if (!budgetId) {
				return [];
			}
			const request: BudgetTotalRequest = { budgetId };
			return typedApi.post("/budget_total", request);
		},
		enabled: !!budgetId,
		staleTime: 2 * 60 * 1000, // 2 minutes
	});
}

// Hook for fetching budget history with pagination
export function useBudgetHistory(budgetId?: string, offset: number = 0) {
	return useQuery({
		queryKey: ["budget", "history", budgetId, offset],
		queryFn: async () => {
			if (!budgetId) {
				return [];
			}
			const request: BudgetListRequest = { budgetId, offset };
			return typedApi.post("/budget_list", request);
		},
		enabled: !!budgetId,
		staleTime: 1 * 60 * 1000, // 1 minute
		placeholderData: (prev) => prev, // Keep previous data while fetching
	});
}

// Hook for deleting budget entries
export function useDeleteBudgetEntry() {
	const queryClient = useQueryClient();

	return useMutation<{ message: string }, Error, string>({
		mutationFn: async (id: string) => {
			const request: BudgetDeleteRequest = { id };
			return typedApi.post("/budget_delete", request);
		},
		onSuccess: (_, deletedId) => {
			// Invalidate budget queries to refresh data
			queryClient.invalidateQueries({ queryKey: ["budget"] });
			
			// Optimistically remove the deleted entry from cache
			queryClient.setQueriesData<BudgetEntry[]>(
				{ queryKey: ["budget", "history"] },
				(oldData) => {
					if (!oldData) return oldData;
					return oldData.filter((entry) => entry.id !== deletedId);
				}
			);
		},
	});
}

// Hook for infinite loading budget history (for "Load More" functionality)
export function useInfiniteBudgetHistory(budgetId?: string, _limit: number = 25) {
	return useQuery({
		queryKey: ["budget", "history", "infinite", budgetId],
		queryFn: async () => {
			if (!budgetId) {
				return [];
			}
			
			// For initial load, get first batch
			const request: BudgetListRequest = { budgetId, offset: 0 };
			return typedApi.post("/budget_list", request);
		},
		enabled: !!budgetId,
		staleTime: 1 * 60 * 1000,
	});
}

// Helper function to load more budget entries
export function useLoadMoreBudgetHistory() {
	const queryClient = useQueryClient();
	
	return async (budgetId: string, currentHistory: BudgetEntry[]) => {
		const offset = currentHistory.length;
		const request: BudgetListRequest = { budgetId, offset };
		
		try {
			const newEntries: BudgetEntry[] = await typedApi.post("/budget_list", request);
			
			// Update cache with combined data
			queryClient.setQueryData<BudgetEntry[]>(
				["budget", "history", "infinite", budgetId],
				[...currentHistory, ...newEntries]
			);
			
			return newEntries;
		} catch (error) {
			throw error;
		}
	};
}