import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReduxState, ScheduledAction } from "split-expense-shared-types";
import { ThemeProvider } from "styled-components";
import { theme } from "@/components/theme";
import { ActionCard } from "./ActionCard";

const session = {
  extra: {
    usersById: {
      u1: { id: "u1", firstName: "Alex", lastName: "Morgan" },
      u2: { id: "u2", firstName: "Sam", lastName: "Lee" },
    },
    group: { budgets: [{ id: "groceries", budgetName: "Groceries" }] },
  },
} as unknown as ReduxState["value"];

const baseAction = {
  id: "action-1",
  userId: "u1",
  frequency: "monthly",
  startDate: "2026-01-01",
  isActive: true,
  nextExecutionDate: "2026-10-01",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
} as const;

function renderAction(action: ScheduledAction) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <ActionCard
          sa={action}
          session={session}
          busyId={null}
          setBusyId={jest.fn()}
          updateAction={{ mutateAsync: jest.fn().mockResolvedValue({}) }}
          requestDelete={jest.fn()}
          confirmOpen={false}
          pendingDeleteId={null}
          confirmDelete={jest.fn()}
          closeConfirm={jest.fn()}
        />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("ActionCard detail-first layout", () => {
  it("shows expense payer and split before opening More setup", () => {
    const action: ScheduledAction = {
      ...baseAction,
      actionType: "add_expense",
      actionData: {
        description: "Monthly rent",
        amount: 2400,
        currency: "GBP",
        paidByUserId: "u1",
        splitPctShares: { u1: 50, u2: 50 },
      },
    };
    renderAction(action);
    const primary = screen.getByRole("group", { name: "Monthly rent setup" });
    expect(primary).toHaveTextContent("Paid by");
    expect(primary).toHaveTextContent("Alex Morgan");
    expect(primary).toHaveTextContent("Sam Lee: 50%");
    expect(screen.getByText("2,400.00")).toBeVisible();

    const button = screen.getByRole("button", { name: "More setup" });
    const secondary = screen.getByRole("region", { hidden: true });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", secondary.getAttribute("id"));
    expect(secondary).not.toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(secondary).toBeVisible();
    expect(secondary).toHaveTextContent("Starts");
    expect(secondary).toHaveTextContent("2026-01-01");
    expect(secondary).not.toHaveTextContent("Amount");
    fireEvent.click(screen.getByRole("button", { name: "Hide setup" }));
    expect(secondary).not.toBeVisible();
  });

  it("shows the named budget and entry direction before opening More setup", () => {
    const action: ScheduledAction = {
      ...baseAction,
      id: "action-2",
      actionType: "add_budget",
      actionData: {
        description: "Grocery fund",
        amount: 150,
        currency: "GBP",
        budgetId: "groceries",
        type: "Credit",
      },
    };
    renderAction(action);
    const primary = screen.getByRole("group", { name: "Grocery fund setup" });
    expect(primary).toHaveTextContent("Budget");
    expect(primary).toHaveTextContent("Groceries");
    expect(primary).toHaveTextContent("Entry type");
    expect(primary).toHaveTextContent("Credit");
    expect(screen.getByText("Next: 2026-10-01")).toBeVisible();
    expect(screen.getByRole("button", { name: "History" })).toBeVisible();
  });
});
