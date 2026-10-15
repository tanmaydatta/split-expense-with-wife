import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCategoryInsights } from "./useCategoryInsights";
import { typedApi } from "@/utils/api";
let mockState = {
	value: {
		session: { id: "session-one" },
		extra: { currentUser: { id: "owner" }, group: { groupid: "home" } },
	},
};
jest.mock("react-redux", () => ({ useSelector: (selector: any) => selector(mockState) }));
jest.mock("@/utils/api", () => ({ typedApi: { post: jest.fn() } }));
it("caches applied queries while isolating household and authentication sessions", async () => {
	(typedApi.post as jest.Mock).mockResolvedValue({ count: 0 });
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const range = { dateFrom: "2026-01-01", dateTo: "2026-01-31" };
	const { rerender } = renderHook(({ valid }) => useCategoryInsights(range, valid), {
		initialProps: { valid: false },
		wrapper,
	});
	expect(typedApi.post).not.toHaveBeenCalled();
	rerender({ valid: true });
	await waitFor(() => expect(typedApi.post).toHaveBeenCalledTimes(1));
	rerender({ valid: true });
	expect(typedApi.post).toHaveBeenCalledTimes(1);
	mockState = {
		value: {
			session: { id: "session-two" },
			extra: { currentUser: { id: "owner" }, group: { groupid: "home" } },
		},
	};
	rerender({ valid: true });
	await waitFor(() => expect(typedApi.post).toHaveBeenCalledTimes(2));
	mockState = {
		value: {
			session: { id: "session-two" },
			extra: { currentUser: { id: "owner" }, group: { groupid: "other-home" } },
		},
	};
	rerender({ valid: true });
	await waitFor(() => expect(typedApi.post).toHaveBeenCalledTimes(3));
	client.clear();
});
