import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BillCreateInput, BillMonthResponse, BillUpdateInput } from "split-expense-shared-types";
import type { TransactionsListResponse } from "split-expense-shared-types";
import { typedApi } from "@/utils/api";

export function useBillMonth(month: string) {
	return useQuery({
		queryKey: ["bills", "month", month],
		queryFn: () => typedApi.get("/bills/month", { queryParams: { month } }),
	});
}

function useBillMutation<T>(mutate: (input: T) => Promise<unknown>) {
	const client = useQueryClient();
	return useMutation({ mutationFn: mutate, onSuccess: () => client.invalidateQueries({ queryKey: ["bills"] }) });
}

export function useCreateBill() {
	return useBillMutation((input: BillCreateInput) => typedApi.post("/bills", input));
}

export function useUpdateBill() {
	return useBillMutation((input: BillUpdateInput) => typedApi.post("/bills/update", input));
}

export function useStopBill() {
	return useBillMutation((input: { id: string }) => typedApi.delete("/bills/delete", input));
}

export function useSetBillPayment() {
	return useBillMutation((input: { occurrenceId: string; paid: boolean; linkedTransactionId?: string }) => typedApi.post("/bills/payment", input));
}

export function useBillReminders() {
	return useQuery({ queryKey: ["bills", "reminders"], queryFn: () => typedApi.get("/bills/reminders") });
}

export function useReadBillReminder() {
	return useBillMutation((input: { id: string }) => typedApi.post("/bills/reminders/read", input));
}

export function useRecentExpenses(enabled: boolean) {
	return useQuery({
		queryKey: ["bills", "recent-expenses"],
		enabled,
		queryFn: () => typedApi.post("/transactions_list", { offset: 0 }) as Promise<TransactionsListResponse>,
	});
}

export type { BillMonthResponse };
