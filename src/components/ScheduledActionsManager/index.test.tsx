import ScheduledActionsManager from "@/components/ScheduledActionsManager";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/utils/api", () => ({
  typedApi: {
    get: jest.fn().mockResolvedValue({
      scheduledActions: [],
      totalCount: 0,
      hasMore: false,
    }),
    post: jest.fn().mockResolvedValue({ message: "ok" }),
  },
}));

// Provide minimal redux state via mocking useSelector
jest.mock("react-redux", () => ({
  useSelector: (selector: any) =>
    selector({
      value: {
        extra: {
          usersById: {
            "1": { id: "1", firstName: "John", lastName: "Doe" },
            "2": { id: "2", firstName: "Jane", lastName: "Doe" },
          },
          group: { budgets: ["Groceries", "Rent"] },
          currencies: ["USD", "EUR"],
        },
      },
    }),
}));

describe("ScheduledActionsManager", () => {
  it("renders without crashing", () => {
    const localClient = new QueryClient();
    render(
      <QueryClientProvider client={localClient}>
        <ScheduledActionsManager />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("scheduled-actions-manager")).toBeInTheDocument();
  });

  it("shows fields based on action type toggle", () => {
    const localClient = new QueryClient();
    render(
      <QueryClientProvider client={localClient}>
        <ScheduledActionsManager />
      </QueryClientProvider>,
    );

    // Default should be Add Expense
    expect(screen.getByText("Paid By")).toBeInTheDocument();
    expect(screen.queryByText("Budget Category")).not.toBeInTheDocument();

    // Switch to Add to Budget
    const budgetToggle = screen.getByTestId("sa-action-budget");
    fireEvent.click(budgetToggle);

    expect(screen.getByText("Budget Category")).toBeInTheDocument();
    expect(screen.queryByText("Paid By")).not.toBeInTheDocument();
  });
});


