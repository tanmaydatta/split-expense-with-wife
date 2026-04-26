import { typedApi } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import type {
	BudgetEntryGetRequest,
	BudgetEntryGetResponse,
} from "split-expense-shared-types";

export function useBudgetEntry(id: string | undefined) {
	return useQuery<BudgetEntryGetResponse, Error>({
		queryKey: ["budgetEntry", id],
		enabled: !!id,
		queryFn: async () => {
			return typedApi.post("/budget_entry_get", {
				id,
			} as BudgetEntryGetRequest);
		},
	});
}
