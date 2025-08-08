import apiInstance, { typedApi } from "@/utils/api";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CreateScheduledActionRequest,
	ScheduledActionHistoryListRequest,
	ScheduledActionHistoryListResponse,
	UpdateScheduledActionRequest,
} from "split-expense-shared-types";

export function useScheduledActionsList() {
	return useQuery({
		queryKey: ["scheduled-actions", "list"],
		queryFn: async () => typedApi.get("/scheduled-actions/list"),
	});
}

export function useInfiniteScheduledActionsList(limit: number = 25) {
	return useInfiniteQuery({
		queryKey: ["scheduled-actions", "list", "infinite", limit],
		initialPageParam: 0 as number, // offset
		queryFn: async ({ pageParam }) => {
			const params = new URLSearchParams();
			params.set("offset", String(pageParam));
			params.set("limit", String(limit));
			const resp = await apiInstance.get<
				import("split-expense-shared-types").ScheduledActionListResponse
			>(`/scheduled-actions/list?${params.toString()}`);
			return resp.data;
		},
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage.hasMore) return undefined;
			const accumulated = allPages.reduce(
				(sum, p) => sum + p.scheduledActions.length,
				0,
			);
			return accumulated;
		},
	});
}

export function useCreateScheduledAction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (data: CreateScheduledActionRequest) =>
			typedApi.post("/scheduled-actions", data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["scheduled-actions"] });
		},
	});
}

export function useUpdateScheduledAction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (data: UpdateScheduledActionRequest) =>
			typedApi.post("/scheduled-actions/update", data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["scheduled-actions"] });
		},
	});
}

export function useDeleteScheduledAction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (data: { id: string }) =>
			typedApi.delete("/scheduled-actions/delete", { id: data.id }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["scheduled-actions"] });
		},
	});
}

export function useScheduledActionHistory(
	filters?: ScheduledActionHistoryListRequest,
) {
	const params = new URLSearchParams();
	if (filters?.offset != null) params.set("offset", String(filters.offset));
	if (filters?.limit != null) params.set("limit", String(filters.limit));
	if (filters?.scheduledActionId)
		params.set("scheduledActionId", filters.scheduledActionId);
	if (filters?.executionStatus)
		params.set("executionStatus", filters.executionStatus);

	return useQuery<ScheduledActionHistoryListResponse>({
		queryKey: ["scheduled-actions", "history", filters],
		queryFn: async () => {
			const resp = await apiInstance.get<ScheduledActionHistoryListResponse>(
				`/scheduled-actions/history?${params.toString()}`,
			);
			return resp.data;
		},
		placeholderData: (prev) => prev,
	});
}

export function useScheduledActionDetails(id?: string) {
	return useQuery({
		queryKey: ["scheduled-actions", "details", id],
		enabled: !!id,
		queryFn: async () => {
			const resp = await apiInstance.get(
				`/scheduled-actions/details?id=${encodeURIComponent(id || "")}`,
			);
			return resp.data;
		},
	});
}

export function useScheduledActionHistoryDetails(id?: string) {
	return useQuery({
		queryKey: ["scheduled-actions", "history", "details", id],
		enabled: !!id,
		queryFn: async () => {
			const resp = await apiInstance.get(
				`/scheduled-actions/history/details?id=${encodeURIComponent(id || "")}`,
			);
			return resp.data;
		},
	});
}
