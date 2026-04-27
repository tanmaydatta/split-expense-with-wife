import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import type { BudgetEntryGetResponse } from "split-expense-shared-types";
import { useBudgetEntry } from "./useBudgetEntry";

jest.mock("utils/api", () => ({
  typedApi: {
    post: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { typedApi } = require("utils/api") as {
  typedApi: { post: jest.Mock };
};

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const mockBudgetEntryResponse: BudgetEntryGetResponse = {
  budgetEntry: {
    id: "be-1",
    description: "Groceries budget",
    addedTime: "2024-01-01T00:00:00Z",
    price: "50",
    amount: 50,
    name: "Food",
    groupid: "grp-1",
    currency: "USD",
    linkedTransactionIds: ["tx-1"],
  },
  linkedTransaction: {
    transaction_id: "tx-1",
    description: "Groceries",
    amount: 50,
    created_at: "2024-01-01T00:00:00Z",
    metadata: "{}",
    currency: "USD",
    group_id: "grp-1",
  },
  linkedTransactionUsers: [
    {
      transaction_id: "tx-1",
      user_id: "user-1",
      amount: 25,
      owed_to_user_id: "user-2",
      group_id: "grp-1",
      currency: "USD",
    },
  ],
};

describe("useBudgetEntry", () => {
  beforeEach(() => {
    typedApi.post.mockReset();
  });

  it("uses queryKey [budgetEntry, id]", async () => {
    typedApi.post.mockResolvedValueOnce(mockBudgetEntryResponse);

    const queryClient = freshClient();

    const { result } = renderHook(() => useBudgetEntry("be-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData(["budgetEntry", "be-1"]);
    expect(cached).toEqual(mockBudgetEntryResponse);
  });

  it("does not fetch when id is undefined", async () => {
    const queryClient = freshClient();
    const { result } = renderHook(() => useBudgetEntry(undefined), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(typedApi.post).not.toHaveBeenCalled();
  });

  it("returns budgetEntry, linkedTransaction, and linkedTransactionUsers on success", async () => {
    typedApi.post.mockResolvedValueOnce(mockBudgetEntryResponse);

    const queryClient = freshClient();
    const { result } = renderHook(() => useBudgetEntry("be-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.budgetEntry.id).toBe("be-1");
    expect(result.current.data?.linkedTransaction?.transaction_id).toBe("tx-1");
    expect(result.current.data?.linkedTransactionUsers).toHaveLength(1);
  });

  it("surfaces error when server returns 404", async () => {
    typedApi.post.mockRejectedValueOnce(new Error("Not Found"));

    const queryClient = freshClient();
    const { result } = renderHook(() => useBudgetEntry("be-missing"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Not Found");
  });

  it("posts to /budget_entry_get endpoint", async () => {
    typedApi.post.mockResolvedValueOnce(mockBudgetEntryResponse);

    const queryClient = freshClient();
    const { result } = renderHook(() => useBudgetEntry("be-42"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(typedApi.post).toHaveBeenCalledWith("/budget_entry_get", {
      id: "be-42",
    });
  });
});
