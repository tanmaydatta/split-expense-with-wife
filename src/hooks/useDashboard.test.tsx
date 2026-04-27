import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { useDashboardSubmit } from "./useDashboard";

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

const minimalFormData: import("./useDashboard").DashboardFormData = {
  addExpense: true,
  updateBudget: false,
  expense: {
    amount: 100,
    description: "Dinner",
    currency: "USD",
    paidBy: "user1",
    users: [{ Id: "user1", percentage: 100, FirstName: "Alice" }],
  },
};

describe("useDashboardSubmit", () => {
  beforeEach(() => {
    typedApi.post.mockReset();
  });

  it("sends exactly one POST to /dashboard_submit", async () => {
    const response = {
      message: "ok",
      transactionId: "tx-1",
      budgetEntryId: "be-1",
      linkId: "lnk-1",
    };
    typedApi.post.mockResolvedValueOnce(response);

    const queryClient = freshClient();
    const { result } = renderHook(() => useDashboardSubmit(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(minimalFormData);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(typedApi.post).toHaveBeenCalledTimes(1);
    expect(typedApi.post).toHaveBeenCalledWith(
      "/dashboard_submit",
      expect.any(Object),
    );
  });

  it("surfaces all response fields to the caller on success", async () => {
    const response = {
      message: "created",
      transactionId: "tx-abc",
      budgetEntryId: "be-xyz",
      linkId: "lnk-99",
    };
    typedApi.post.mockResolvedValueOnce(response);

    const queryClient = freshClient();
    const { result } = renderHook(() => useDashboardSubmit(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(minimalFormData);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.message).toBe("created");
    expect(result.current.data?.transactionId).toBe("tx-abc");
    expect(result.current.data?.budgetEntryId).toBe("be-xyz");
    expect(result.current.data?.linkId).toBe("lnk-99");
  });

  it("enters error state when server returns 500", async () => {
    typedApi.post.mockRejectedValueOnce(new Error("Internal Server Error"));

    const queryClient = freshClient();
    const { result } = renderHook(() => useDashboardSubmit(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(minimalFormData);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("Internal Server Error");
  });

  it("invalidates transactions, balances, and budget caches on success", async () => {
    typedApi.post.mockResolvedValueOnce({ message: "ok" });

    const queryClient = freshClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDashboardSubmit(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate(minimalFormData);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );

    expect(calledKeys).toContainEqual(["transactions"]);
    expect(calledKeys).toContainEqual(["balances"]);
    expect(calledKeys).toContainEqual(["budget"]);
  });
});
