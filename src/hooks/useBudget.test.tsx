import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import type { BudgetEntry } from "split-expense-shared-types";
import { useDeleteBudgetEntry } from "./useBudget";

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

const deletedBeId = "be-to-delete";
const linkedTxId = "tx-linked-1";
const anotherLinkedTxId = "tx-linked-2";

const deletedBudgetEntry: BudgetEntry = {
  id: deletedBeId,
  description: "Budget entry to delete",
  addedTime: "2024-01-01T00:00:00Z",
  price: "100",
  amount: 100,
  name: "Food",
  groupid: "grp-1",
  currency: "USD",
  linkedTransactionIds: [linkedTxId, anotherLinkedTxId],
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

describe("useDeleteBudgetEntry — cascading cache invalidation", () => {
  beforeEach(() => {
    typedApi.post.mockReset();
  });

  it("invalidates [budget], [budgetEntry, deletedId], [transactions], [balances] on success", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "deleted" });

    const queryClient = freshClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteBudgetEntry(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(deletedBeId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    expect(calledKeys).toContainEqual(["budget"]);
    expect(calledKeys).toContainEqual(["budgetEntry", deletedBeId]);
    expect(calledKeys).toContainEqual(["transactions"]);
    expect(calledKeys).toContainEqual(["balances"]);
  });

  it("invalidates [transaction, txId] for each linked transaction found via budget cache", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "deleted" });

    const queryClient = freshClient();

    // Pre-seed the budget history cache with the entry being deleted
    // so the hook can discover its linkedTransactionIds
    queryClient.setQueryData<BudgetEntry[]>(
      ["budget", "history", "food-budget", 0],
      [deletedBudgetEntry, unrelatedBudgetEntry],
    );

    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteBudgetEntry(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(deletedBeId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    // Both linked transactions should be individually invalidated
    expect(calledKeys).toContainEqual(["transaction", linkedTxId]);
    expect(calledKeys).toContainEqual(["transaction", anotherLinkedTxId]);
    // Unrelated transaction from unrelated entry should NOT be invalidated
    expect(calledKeys).not.toContainEqual(["transaction", "tx-other"]);
  });

  it("does not invalidate any transaction when no linked transactions are found in cache", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "deleted" });

    const queryClient = freshClient();

    // Pre-seed budget cache but without the entry being deleted
    queryClient.setQueryData<BudgetEntry[]>(
      ["budget", "history", "food-budget", 0],
      [unrelatedBudgetEntry],
    );

    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteBudgetEntry(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(deletedBeId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    const transactionDetailInvalidations = calledKeys.filter(
      (key) =>
        Array.isArray(key) && key[0] === "transaction" && key.length === 2,
    );
    expect(transactionDetailInvalidations).toHaveLength(0);
  });
});
