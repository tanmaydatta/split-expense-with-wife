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

			// Scan for linked transaction IDs BEFORE removing the entry from cache
			const allBudgetCaches = queryClient.getQueriesData<BudgetEntry[]>({
				queryKey: ["budget", "history"],
			});
			const linkedTxIds = new Set<string>();
			for (const [, entries] of allBudgetCaches) {
				if (!entries) continue;
				const entry = entries.find((e) => e.id === deletedId);
				if (entry?.linkedTransactionIds) {
					for (const txId of entry.linkedTransactionIds) {
						linkedTxIds.add(txId);
					}
				}
			}

			// Optimistically remove the deleted entry from cache
			queryClient.setQueriesData<BudgetEntry[]>(
				{ queryKey: ["budget", "history"] },
				(oldData) => {
					if (!oldData) return oldData;
					return oldData.filter((entry) => entry.id !== deletedId);
				},
			);

			// Cascade cache invalidation for the deleted budget entry's detail page
			queryClient.invalidateQueries({ queryKey: ["budgetEntry", deletedId] });

			// Also invalidate transaction caches (the cascade soft-deleted linked transactions)
			queryClient.invalidateQueries({ queryKey: ["transactions"] });
			queryClient.invalidateQueries({ queryKey: ["balances"] });

			// Invalidate each linked transaction's detail page
			for (const txId of Array.from(linkedTxIds)) {
				queryClient.invalidateQueries({ queryKey: ["transaction", txId] });
			}
		},
	});
}

// Hook for infinite loading budget history (for "Load More" functionality)
export function useInfiniteBudgetHistory(
	budgetId?: string,
	q?: string,
	_limit: number = 25,
) {
	return useQuery({
		queryKey: ["budget", "history", "infinite", budgetId, q ?? ""],
		queryFn: async () => {
			if (!budgetId) {
				return [];
			}
			const request: BudgetListRequest = {
				budgetId,
				offset: 0,
				...(q ? { q } : {}),
			};
			return typedApi.post("/budget_list", request);
		},
		enabled: !!budgetId,
		staleTime: 1 * 60 * 1000,
	});
}

// Helper function to load more budget entries
export function useLoadMoreBudgetHistory() {
	const queryClient = useQueryClient();

	return async (budgetId: string, currentHistory: BudgetEntry[], q?: string) => {
		const offset = currentHistory.length;
		const request: BudgetListRequest = {
			budgetId,
			offset,
			...(q ? { q } : {}),
		};
		const newEntries: BudgetEntry[] = await typedApi.post(
			"/budget_list",
			request,
		);
		queryClient.setQueryData<BudgetEntry[]>(
			["budget", "history", "infinite", budgetId, q ?? ""],
			[...currentHistory, ...newEntries],
		);
		return newEntries;
	};
}
