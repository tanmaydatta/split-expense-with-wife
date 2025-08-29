import { typedApi } from "@/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
	ApiOperationResponses,
	BudgetRequest,
	DashboardUser,
	SplitNewRequest,
} from "split-expense-shared-types";

export interface ExpenseFormData {
	amount: number;
	description: string;
	currency: string;
	paidBy: string;
	users: DashboardUser[];
}

export interface BudgetFormData {
	amount: number;
	description: string;
	budgetId: string;
	currency: string;
	creditDebit: "Credit" | "Debit";
	groupId: string;
}

export interface DashboardFormData {
	expense?: ExpenseFormData;
	budget?: BudgetFormData;
	addExpense: boolean;
	updateBudget: boolean;
}

// Hook for creating expense
export function useCreateExpense() {
	const queryClient = useQueryClient();

	return useMutation<{ message: string; transactionId: string }, Error, ExpenseFormData>({
		mutationFn: async (data) => {
			const splits = data.users.map((u) => ({
				ShareUserId: u.Id,
				SharePercentage: u.percentage || 0,
			}));

			const payload: SplitNewRequest = {
				amount: data.amount,
				description: data.description,
				paidByShares: { [data.paidBy]: data.amount },
				splitPctShares: Object.fromEntries(
					splits.map((s) => [s.ShareUserId.toString(), s.SharePercentage])
				),
				currency: data.currency,
			};

			return typedApi.post("/split_new", payload);
		},
		onSuccess: () => {
			// Invalidate related queries
			queryClient.invalidateQueries({ queryKey: ["transactions"] });
			queryClient.invalidateQueries({ queryKey: ["balances"] });
		},
	});
}

// Hook for updating budget
export function useUpdateBudget() {
	const queryClient = useQueryClient();

	return useMutation<{ message: string }, Error, BudgetFormData>({
		mutationFn: async (data) => {
			const budgetPayload: BudgetRequest = {
				amount: data.creditDebit === "Debit" ? -data.amount : data.amount,
				description: data.description,
				budgetId: data.budgetId,
				groupid: data.groupId,
				currency: data.currency,
			};

			return typedApi.post("/budget", budgetPayload);
		},
		onSuccess: () => {
			// Invalidate budget related queries
			queryClient.invalidateQueries({ queryKey: ["budget"] });
		},
	});
}

// Combined hook for dashboard form submission
export function useDashboardSubmit() {
	const createExpense = useCreateExpense();
	const updateBudget = useUpdateBudget();

	return useMutation<ApiOperationResponses, Error, DashboardFormData>({
		mutationFn: async (formData) => {
			const responses: ApiOperationResponses = {};

			if (formData.addExpense && formData.expense) {
				responses.expense = await createExpense.mutateAsync(formData.expense);
			}

			if (formData.updateBudget && formData.budget) {
				responses.budget = await updateBudget.mutateAsync(formData.budget);
			}

			return responses;
		},
		onSuccess: (_responses) => {
			// Both mutations already handle their own cache invalidation
			// We can add additional logic here if needed
		},
	});
}

// Hook that provides loading states for individual operations
export function useDashboardState() {
	const createExpense = useCreateExpense();
	const updateBudget = useUpdateBudget();

	return {
		createExpense: {
			mutate: createExpense.mutate,
			mutateAsync: createExpense.mutateAsync,
			isLoading: createExpense.isPending,
			error: createExpense.error,
			isSuccess: createExpense.isSuccess,
			reset: createExpense.reset,
		},
		updateBudget: {
			mutate: updateBudget.mutate,
			mutateAsync: updateBudget.mutateAsync,
			isLoading: updateBudget.isPending,
			error: updateBudget.error,
			isSuccess: updateBudget.isSuccess,
			reset: updateBudget.reset,
		},
		isLoading: createExpense.isPending || updateBudget.isPending,
	};
}