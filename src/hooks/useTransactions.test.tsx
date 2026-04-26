import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import type { BudgetEntry } from "split-expense-shared-types";
import { useDeleteTransaction } from "./useTransactions";

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

const deletedTxId = "tx-to-delete";
const linkedBeId = "be-linked-1";

const linkedBudgetEntry: BudgetEntry = {
  id: linkedBeId,
  description: "Linked budget entry",
  addedTime: "2024-01-01T00:00:00Z",
  price: "100",
  amount: 100,
  name: "Food",
  groupid: "grp-1",
  currency: "USD",
  linkedTransactionIds: [deletedTxId],
};

const unrelatedBudgetEntry: BudgetEntry = {
  id: "be-unrelated",
  description: "Unrelated entry",
  addedTime: "2024-01-01T00:00:00Z",
  price: "50",
  amount: 50,
  name: "Transport",
  groupid: "grp-1",
  currency: "USD",
  linkedTransactionIds: ["tx-other"],
};

describe("useDeleteTransaction — cascading cache invalidation", () => {
  beforeEach(() => {
    typedApi.post.mockReset();
  });

  it("invalidates [transactions], [balances], [transaction, deletedId], [budget] on success", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "deleted" });

    const queryClient = freshClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTransaction(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(deletedTxId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    expect(calledKeys).toContainEqual(["transactions"]);
    expect(calledKeys).toContainEqual(["transaction", deletedTxId]);
    expect(calledKeys).toContainEqual(["budget"]);
  });

  it("invalidates [budgetEntry, linkedBeId] for each linked BE found in budget cache", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "deleted" });

    const queryClient = freshClient();

    // Pre-seed the budget history cache with a BudgetEntry whose
    // linkedTransactionIds includes the transaction being deleted
    queryClient.setQueryData<BudgetEntry[]>(
      ["budget", "history", "food-budget", 0],
      [linkedBudgetEntry, unrelatedBudgetEntry],
    );

    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTransaction(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(deletedTxId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    // Should invalidate the linked budget entry detail
    expect(calledKeys).toContainEqual(["budgetEntry", linkedBeId]);
    // Should NOT invalidate unrelated budget entry
    expect(calledKeys).not.toContainEqual(["budgetEntry", "be-unrelated"]);
  });

  it("does not invalidate any budgetEntry when budget cache has no linked entries", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "deleted" });

    const queryClient = freshClient();

    // Pre-seed budget history with entries that do NOT link to deletedTxId
    queryClient.setQueryData<BudgetEntry[]>(
      ["budget", "history", "food-budget", 0],
      [unrelatedBudgetEntry],
    );

    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTransaction(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(deletedTxId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    const budgetEntryInvalidations = calledKeys.filter(
      (key) => Array.isArray(key) && key[0] === "budgetEntry",
    );
    expect(budgetEntryInvalidations).toHaveLength(0);
  });
});
