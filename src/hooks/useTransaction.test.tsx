import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import type { TransactionGetResponse } from "split-expense-shared-types";
import { useTransaction } from "./useTransaction";

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

const mockTransactionResponse: TransactionGetResponse = {
  transaction: {
    transaction_id: "tx-1",
    description: "Groceries",
    amount: 50,
    created_at: "2024-01-01T00:00:00Z",
    metadata: "{}",
    currency: "USD",
    group_id: "grp-1",
    linkedBudgetEntryIds: ["be-1"],
  },
  transactionUsers: [
    {
      transaction_id: "tx-1",
      user_id: "user-1",
      amount: 25,
      owed_to_user_id: "user-2",
      group_id: "grp-1",
      currency: "USD",
    },
  ],
  linkedBudgetEntry: {
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
};

describe("useTransaction", () => {
  beforeEach(() => {
    typedApi.post.mockReset();
  });

  it("uses queryKey [transaction, id]", async () => {
    typedApi.post.mockResolvedValueOnce(mockTransactionResponse);

    const queryClient = freshClient();
    const getQueryDataSpy = jest.spyOn(queryClient, "getQueryData");

    const { result } = renderHook(() => useTransaction("tx-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify the query is stored under the expected key
    const cached = queryClient.getQueryData(["transaction", "tx-1"]);
    expect(cached).toEqual(mockTransactionResponse);
    getQueryDataSpy.mockRestore();
  });

  it("does not fetch when id is undefined", async () => {
    const queryClient = freshClient();
    const { result } = renderHook(() => useTransaction(undefined), {
      wrapper: makeWrapper(queryClient),
    });

    // Should remain in idle/pending state without fetching
    expect(result.current.fetchStatus).toBe("idle");
    expect(typedApi.post).not.toHaveBeenCalled();
  });

  it("returns transaction, transactionUsers, and linkedBudgetEntry on success", async () => {
    typedApi.post.mockResolvedValueOnce(mockTransactionResponse);

    const queryClient = freshClient();
    const { result } = renderHook(() => useTransaction("tx-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.transaction.transaction_id).toBe("tx-1");
    expect(result.current.data?.transactionUsers).toHaveLength(1);
    expect(result.current.data?.linkedBudgetEntry?.id).toBe("be-1");
  });

  it("surfaces error when server returns 404", async () => {
    typedApi.post.mockRejectedValueOnce(new Error("Not Found"));

    const queryClient = freshClient();
    const { result } = renderHook(() => useTransaction("tx-missing"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Not Found");
  });

  it("posts to /transaction_get endpoint", async () => {
    typedApi.post.mockResolvedValueOnce(mockTransactionResponse);

    const queryClient = freshClient();
    const { result } = renderHook(() => useTransaction("tx-42"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(typedApi.post).toHaveBeenCalledWith("/transaction_get", {
      id: "tx-42",
    });
  });
});
