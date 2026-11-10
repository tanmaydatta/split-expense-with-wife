import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import { legacy_createStore as createStore } from "redux";
import type { LedgerListResponse, ReduxState } from "split-expense-shared-types";
import { useInfiniteLedger, useLedger } from "./useLedger";

jest.mock("@/utils/api", () => ({
	typedApi: {
		post: jest.fn(),
	},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { typedApi } = require("@/utils/api") as {
	typedApi: { post: jest.Mock };
};

function createMockStore(initialState: ReduxState) {
	return createStore((state = initialState) => state);
}

function makeWrapper(queryClient: QueryClient, store: ReturnType<typeof createMockStore>) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return (
			<Provider store={store}>
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			</Provider>
		);
	};
}

describe("useLedger hooks", () => {
	const mockSession: ReduxState = {
		value: {
			user: {
				id: "u-1",
				name: "User One",
				email: "u1@example.com",
				emailVerified: true,
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				username: "user1",
				displayUsername: "user1",
				groupid: "grp-1",
				firstName: "User",
				lastName: "One",
			},
			session: {
				id: "s-1",
				expiresAt: new Date(Date.now() + 3600000),
				token: "tok-1",
				createdAt: new Date(),
				updatedAt: new Date(),
				ipAddress: null,
				userAgent: null,
				userId: "u-1",
			},
			extra: {
				currentUser: {
					id: "u-1",
					name: "User One",
					email: "u1@example.com",
					emailVerified: true,
					image: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					username: "user1",
					displayUsername: "user1",
					groupid: "grp-1",
					firstName: "User",
					lastName: "One",
				},
				usersById: {},
				group: {
					groupid: "grp-1",
					budgets: [],
					userids: ["u-1"],
					metadata: { defaultShare: {}, defaultCurrency: "GBP" },
				},
			},
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("fetches ledger page using typedApi and passes filters", async () => {
		const mockResponse: LedgerListResponse = {
			rows: [
				{
					id: "tx:1",
					kind: "purchase",
					timestamp: "2026-03-01T12:00:00Z",
					description: "Coffee",
					currency: "GBP",
					amount: -3.5,
					budgetEntryIds: [],
					budgetIds: [],
				},
			],
			nextCursor: null,
		};
		typedApi.post.mockResolvedValueOnce(mockResponse);

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const store = createMockStore(mockSession);

		const { result } = renderHook(() => useLedger({ currency: "GBP" }), {
			wrapper: makeWrapper(queryClient, store),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(typedApi.post).toHaveBeenCalledWith("/ledger_list", { currency: "GBP" });
		expect(result.current.data?.rows).toHaveLength(1);
		expect(result.current.data?.rows[0].id).toBe("tx:1");
	});

	it("supports infinite scrolling with nextCursor", async () => {
		const mockPage1: LedgerListResponse = {
			rows: [
				{
					id: "tx:1",
					kind: "purchase",
					timestamp: "2026-03-01T12:00:00Z",
					description: "Lunch",
					currency: "GBP",
					amount: -15.0,
					budgetEntryIds: [],
					budgetIds: [],
				},
			],
			nextCursor: "cursor-page-2",
		};
		typedApi.post.mockResolvedValueOnce(mockPage1);

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const store = createMockStore(mockSession);

		const { result } = renderHook(() => useInfiniteLedger({ limit: 1 }), {
			wrapper: makeWrapper(queryClient, store),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasNextPage).toBe(true);
		expect(result.current.data?.pages[0].nextCursor).toBe("cursor-page-2");
	});
});
