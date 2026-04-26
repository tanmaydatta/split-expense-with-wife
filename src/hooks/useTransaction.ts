import { typedApi } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import type {
	TransactionGetRequest,
	TransactionGetResponse,
} from "split-expense-shared-types";

export function useTransaction(id: string | undefined) {
	return useQuery<TransactionGetResponse, Error>({
		queryKey: ["transaction", id],
		enabled: !!id,
		queryFn: async () => {
			return typedApi.post("/transaction_get", { id } as TransactionGetRequest);
		},
	});
}
