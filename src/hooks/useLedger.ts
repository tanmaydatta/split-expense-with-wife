import { typedApi } from "@/utils/api";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type {
	LedgerListRequest,
	LedgerListResponse,
	ReduxState,
} from "split-expense-shared-types";

export function useLedger(filters: LedgerListRequest = {}, enabled = true) {
	const userSession = useSelector((state: ReduxState) => state.value);
	const userId = userSession?.user?.id;
	const groupId = userSession?.extra?.group?.groupid;

	return useQuery<LedgerListResponse, Error>({
		queryKey: ["ledger", "list", groupId, userId, filters],
		queryFn: async () => {
			return await typedApi.post("/ledger_list", filters);
		},
		enabled: enabled && !!groupId,
		staleTime: 60 * 1000,
	});
}

export function useInfiniteLedger(
	filters: Omit<LedgerListRequest, "cursor"> = {},
	enabled = true,
) {
	const userSession = useSelector((state: ReduxState) => state.value);
	const userId = userSession?.user?.id;
	const groupId = userSession?.extra?.group?.groupid;

	return useInfiniteQuery<LedgerListResponse, Error>({
		queryKey: ["ledger", "infinite", groupId, userId, filters],
		queryFn: async ({ pageParam }) => {
			const req: LedgerListRequest = {
				...filters,
				...(pageParam ? { cursor: pageParam as string } : {}),
			};
			return await typedApi.post("/ledger_list", req);
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		enabled: enabled && !!groupId,
		staleTime: 60 * 1000,
	});
}
