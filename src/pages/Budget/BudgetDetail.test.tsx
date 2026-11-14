import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { BudgetDetail } from "./BudgetDetail";

jest.mock("@/utils/api", () => ({ typedApi: { post: jest.fn() } }));
jest.mock("./TransferForm", () => {
	return function MockTransferForm(props: any) {
		return (
			<div data-testid="transfer-form-mock" data-test-id="transfer-form-mock">
				TransferForm for {props.sourceBudgetId}
			</div>
		);
	};
});
jest.mock("@/pages/MonthlyBudgetPage/ChartComponents", () => ({
	BudgetChart: () => (
		<div data-testid="budget-chart-mock" data-test-id="budget-chart-mock">
			BudgetChart
		</div>
	),
}));

const mockBudgets = [
	{ id: "b_house", budgetName: "House", description: "Shared household costs" },
	{ id: "b_food", budgetName: "Food", description: "Groceries and dining" },
];

function createMockStore() {
	return configureStore({
		reducer: {
			value: () => ({
				extra: {
					group: {
						groupid: "test-group",
						budgets: mockBudgets,
					},
					currencies: ["GBP", "USD"],
				},
			}),
		},
	});
}

function renderBudgetDetail(budgetId: string) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const store = createMockStore();

	return render(
		<Provider store={store}>
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={[`/budget/${budgetId}`]}>
					<Routes>
						<Route path="/budget/:budgetId" element={<BudgetDetail />} />
						<Route path="/budget" element={<div>All budgets overview</div>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>
		</Provider>,
	);
}

describe("BudgetDetail", () => {
	it("renders budget header, available lifetime balance, and trends section", async () => {
		renderBudgetDetail("b_house");

		expect(screen.getByRole("heading", { name: "House" })).toBeInTheDocument();
		expect(screen.getByText("Shared household costs")).toBeInTheDocument();
		expect(screen.getByText("Available")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Trends" })).toBeInTheDocument();
		expect(screen.getByTestId("budget-chart-mock")).toBeInTheDocument();
	});

	it("renders time range selector buttons and currency options for trends", async () => {
		renderBudgetDetail("b_house");

		expect(screen.getByRole("button", { name: "6M" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "1Y" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
	});

	it("renders transfer form and view transactions link", async () => {
		renderBudgetDetail("b_house");

		expect(screen.getByTestId("transfer-form-mock")).toBeInTheDocument();
		const link = screen.getByRole("link", { name: /view transactions/i });
		expect(link).toHaveAttribute("href", "/transactions?budget=b_house");
	});

	it("renders back to budgets button that navigates back to /budget", async () => {
		renderBudgetDetail("b_house");

		const backBtn = screen.getByRole("button", { name: /all budgets/i });
		fireEvent.click(backBtn);

		expect(screen.getByText("All budgets overview")).toBeInTheDocument();
	});

	it("renders not found state when budgetId does not match group budgets", async () => {
		renderBudgetDetail("b_nonexistent");

		expect(screen.getByText(/budget not found/i)).toBeInTheDocument();
	});
});
