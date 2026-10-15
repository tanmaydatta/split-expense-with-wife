import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TransactionCard } from "@/components/TransactionCard";
import { BudgetCard } from "@/components/BudgetCard";
import { buildFrontendTransaction } from "@/utils/transaction";
import type { BudgetEntry, Transaction } from "split-expense-shared-types";
// Category editing is covered separately; this fixture exercises shared card navigation and balances.
jest.mock("@/components/Categories",()=>({CategoryBadge:()=>null,CategoryEditor:()=>null}));
const mockUseTransaction = jest.fn();
beforeEach(() => mockUseTransaction.mockReturnValue({ data: undefined }));
jest.mock("@/hooks/useTransaction", () => ({ useTransaction: (id: string) => mockUseTransaction(id) }));
jest.mock("./BankRecordLinks", () => ({ BankRecordLinks: () => <p>Private bank source</p> }));
const budget: BudgetEntry = { id: "budget", description: "Groceries debit", name: "Household", addedTime: "2026-10-12", amount: -42, price: "-42.00", currency: "GBP", groupid: "home" };
const transaction: Transaction = { transaction_id: "expense", description: "Groceries", amount: 42, currency: "GBP", created_at: "2026-10-12", group_id: "home", metadata: JSON.stringify({ paidByShares: { owner: 42 }, owedAmounts: { partner: 21 }, owedToAmounts: { owner: 21 } }) };
const frontend = buildFrontendTransaction(transaction, [{ transaction_id: "expense", user_id: "partner", owed_to_user_id: "owner", amount: 21, currency: "GBP", group_id: "home" }], "owner");
it("uses real current-user balance and metadata", () => {
 expect(frontend.totalOwed).toBe(21);
 expect(frontend.paidBy).toEqual({ owner: 42 });
 expect(buildFrontendTransaction(transaction, [{ transaction_id: "expense", user_id: "partner", owed_to_user_id: "owner", amount: 21, currency: "GBP", group_id: "home" }], "partner").totalOwed).toBe(-21);
});
it("selection suppresses navigation, deletion, expansion and private-source fetches", () => {
 render(<MemoryRouter><TransactionCard selectionMode isSelected expanded transaction={frontend} onDelete={jest.fn()} /><BudgetCard selectionMode entry={budget} onDelete={jest.fn()} /></MemoryRouter>);
 expect(screen.queryByRole("link")).not.toBeInTheDocument();
 expect(screen.queryByRole("button")).not.toBeInTheDocument();
 expect(screen.queryByText("Private bank source")).not.toBeInTheDocument();
 expect(mockUseTransaction).toHaveBeenLastCalledWith(undefined);
 expect(screen.getByText("+£21.00")).toBeInTheDocument();
});
it("ordinary budget keeps its detail link and delete action", () => {
 render(<MemoryRouter><BudgetCard entry={budget} onDelete={jest.fn()} /></MemoryRouter>);
 expect(screen.getByRole("link")).toHaveAttribute("href", "/budget-entry/budget");
 expect(screen.getByRole("button", { name: "Delete budget entry" })).toBeInTheDocument();
});
it("only expanded expenses mount private source lookup", () => {
 const { rerender } = render(<MemoryRouter><TransactionCard transaction={frontend} /></MemoryRouter>);
 expect(screen.queryByText("Private bank source")).not.toBeInTheDocument();
 rerender(<MemoryRouter><TransactionCard transaction={frontend} expanded /></MemoryRouter>);
 expect(screen.getByText("Private bank source")).toBeInTheDocument();
});
