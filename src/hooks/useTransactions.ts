import { typedApi } from "@/utils/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	BudgetEntry,
	FrontendTransaction,
	SplitDeleteRequest,
	TransactionMetadata,
	TransactionsListRequest,
	TransactionsListResponse,
	TransactionUser,
} from "split-expense-shared-types";

// Helper function to process transaction data
export function processTransactionData(
	response: TransactionsListResponse,
	userId?: string,
): FrontendTransaction[] {
	return response.transactions.map((e) => {
		let totalOwed = 0.0;
		const txnDetails =
			(response.transactionDetails[e.transaction_id] as TransactionUser[]) ||
			[];

		txnDetails.forEach((txn) => {
			if (userId === txn.owed_to_user_id) {
				totalOwed += txn.amount;
			}
			if (userId === txn.user_id) {
				totalOwed -= txn.amount;
			}
		});

		const metadata = (JSON.parse(e.metadata) as TransactionMetadata) || {
			owedAmounts: {},
			paidByShares: {},
			owedToAmounts: {},
		};

		return {
			transactionId: e.transaction_id,
			description: e.description as string,
			totalAmount: e.amount,
			date: e.created_at,
			amountOwed: metadata.owedAmounts,
			paidBy: metadata.paidByShares,
			owedTo: metadata.owedToAmounts,
			totalOwed: totalOwed,
			currency: e.currency,
			linkedBudgetEntryIds: e.linkedBudgetEntryIds,
		};
	});
}

// Hook for fetching transactions with pagination
export function useTransactionsList(
	offset: number = 0,
	userId?: string,
	q?: string,
) {
	return useQuery({
		queryKey: ["transactions", "list", offset, q ?? ""],
		queryFn: async () => {
			const request: TransactionsListRequest = {
				offset,
				...(q ? { q } : {}),
			};
			const response: TransactionsListResponse = await typedApi.post(
				"/transactions_list",
				request,
			);
			return processTransactionData(response, userId);
		},
		staleTime: 2 * 60 * 1000,
		placeholderData: (prev) => prev,
	});
}

// Hook for infinite loading transactions
export function useInfiniteTransactionsList(userId?: string, q?: string) {
	const queryClient = useQueryClient();
	const cacheKey = ["transactions", "infinite", q ?? ""] as const;

	return {
		transactions:
			queryClient.getQueryData<FrontendTransaction[]>(cacheKey) || [],

		loadMore: async (currentTransactions: FrontendTransaction[]) => {
			const offset = currentTransactions.length;
			const request: TransactionsListRequest = {
				offset,
				...(q ? { q } : {}),
			};
			const response: TransactionsListResponse = await typedApi.post(
				"/transactions_list",
				request,
			);
			const newTransactions = processTransactionData(response, userId);
			queryClient.setQueryData<FrontendTransaction[]>(cacheKey, [
				...currentTransactions,
				...newTransactions,
			]);
			return newTransactions;
		},

		reset: async () => {
			const request: TransactionsListRequest = {
				offset: 0,
				...(q ? { q } : {}),
			};
			const response: TransactionsListResponse = await typedApi.post(
				"/transactions_list",
				request,
			);
			const transactions = processTransactionData(response, userId);
			queryClient.setQueryData<FrontendTransaction[]>(cacheKey, transactions);
			return transactions;
		},
	};
}

// Hook for deleting transactions
export function useDeleteTransaction() {
	const queryClient = useQueryClient();

	return useMutation<{ message: string }, Error, string>({
		mutationFn: async (id: string) => {
			const request: SplitDeleteRequest = { id: id.toString() };
			return typedApi.post("/split_delete", request);
		},
		onSuccess: (_, deletedId) => {
			// Invalidate transaction queries to refresh data
			queryClient.invalidateQueries({ queryKey: ["transactions"] });

			// Optimistically remove the deleted transaction from cache
			queryClient.setQueriesData<FrontendTransaction[]>(
				{ queryKey: ["transactions"] },
				(oldData) => {
					if (!oldData) return oldData;
					return oldData.filter(
						(transaction) => transaction.transactionId !== deletedId,
					);
				},
			);

			// Cascade cache invalidation for the deleted transaction's detail page
			queryClient.invalidateQueries({ queryKey: ["transaction", deletedId] });

			// Also invalidate budget caches (the cascade soft-deleted linked BEs)
			queryClient.invalidateQueries({ queryKey: ["budget"] });

			// If we have the linked BE IDs in budget list cache, invalidate each detail entry
			// The transactions list cache stores FrontendTransaction[] which doesn't carry linkedBudgetEntryIds,
			// so we scan the budget history cache (BudgetEntry[]) for entries that reference this transaction.
			const allBudgetCaches = queryClient.getQueriesData<BudgetEntry[]>({
				queryKey: ["budget", "history"],
			});
			const linkedBeIds = new Set<string>();
			for (const [, entries] of allBudgetCaches) {
				if (!entries) continue;
				for (const entry of entries) {
					if (entry.linkedTransactionIds?.includes(deletedId)) {
						linkedBeIds.add(entry.id);
					}
				}
			}
			for (const beId of Array.from(linkedBeIds)) {
				queryClient.invalidateQueries({ queryKey: ["budgetEntry", beId] });
			}
		},
	});
}
