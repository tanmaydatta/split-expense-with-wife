import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type {
	CategoryInsightsRequest,
	ReduxState,
} from "split-expense-shared-types";
import { typedApi } from "@/utils/api";
export function useCategoryInsights(
	input: CategoryInsightsRequest,
	valid: boolean,
) {
	const identity = useSelector(
		(state: ReduxState) =>
			`${state.value?.extra?.currentUser?.id ?? ""}:${state.value?.extra?.group?.groupid ?? ""}:${state.value?.session?.id ?? ""}`,
	);
	const allowed = useSelector((state: ReduxState) =>
		Boolean(
			state.value?.extra?.currentUser?.id && state.value?.extra?.group?.groupid,
		),
	);
	return useQuery({
		queryKey: ["category-insights", identity, input],
		enabled: valid && allowed,
		staleTime: 60000,
		retry: false,
		queryFn: () => typedApi.post("/category-insights", input),
	});
}
