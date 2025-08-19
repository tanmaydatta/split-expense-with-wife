import { typedApi } from "@/utils/api";
import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	UpdateGroupMetadataRequest,
	UpdateGroupMetadataResponse,
} from "split-expense-shared-types";

// Hook for fetching group details with optional force refresh
export function useGroupDetails(forceRefresh?: boolean) {
	return useQuery({
		queryKey: ["group", "details", { forceRefresh }],
		queryFn: async () => {
			return typedApi.get("/group/details", {
				queryParams: forceRefresh ? { forceRefresh: "true" } : undefined,
			});
		},
		staleTime: 5 * 60 * 1000, // 5 minutes - matches session cache duration
		refetchOnWindowFocus: false,
	});
}

// Hook for updating group metadata
export function useUpdateGroupMetadata() {
	const queryClient = useQueryClient();
	
	return useMutation<
		UpdateGroupMetadataResponse,
		Error,
		UpdateGroupMetadataRequest
	>({
		mutationFn: async (data: UpdateGroupMetadataRequest) =>
			typedApi.post("/group/metadata", data),
		onSuccess: () => {
			// Invalidate all group queries to force fresh data
			queryClient.invalidateQueries({ queryKey: ["group"] });
		},
	});
}

// Helper function to manually refetch group details with force refresh
export function useRefreshGroupDetails() {
	const queryClient = useQueryClient();
	
	return async () => {
		// Manually refetch with force refresh bypassing cache
		return queryClient.fetchQuery({
			queryKey: ["group", "details", { forceRefresh: true }],
			queryFn: async () => {
				return typedApi.get("/group/details", {
					queryParams: { forceRefresh: "true" },
				});
			},
			staleTime: 0, // Force fresh fetch
		});
	};
}