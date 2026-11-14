import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ThemeProvider } from "styled-components";
import { theme } from "@/components/theme";
import { MonthlyBudgetRedirect } from "@/pages/Budget/BudgetRouting";
import { Budget } from "@/pages/Budget";
import { BudgetDetail } from "@/pages/Budget/BudgetDetail";

jest.mock("@/utils/api", () => ({ typedApi: { post: jest.fn() } }));
jest.mock("./TransferForm", () => () => <div>TransferForm Mock</div>);
jest.mock("@/pages/MonthlyBudgetPage/ChartComponents", () => ({
	BudgetChart: () => <div>BudgetChart Mock</div>,
}));

const mockBudgets = [
	{ id: "b_house", budgetName: "House", description: null },
	{ id: "b_food", budgetName: "Food", description: null },
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
					currencies: ["GBP"],
				},
			}),
		},
	});
}

function renderRoutes(initialPath: string) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const store = createMockStore();

	return render(
		<ThemeProvider theme={theme}>
			<Provider store={store}>
				<QueryClientProvider client={queryClient}>
					<MemoryRouter initialEntries={[initialPath]}>
						<Routes>
							<Route path="/budget" element={<Budget />} />
							<Route path="/budget/:budgetId" element={<BudgetDetail />} />
							<Route
								path="/monthly-budget/:budgetId"
								element={<MonthlyBudgetRedirect />}
							/>
							<Route
								path="/monthly-budget"
								element={<MonthlyBudgetRedirect />}
							/>
						</Routes>
					</MemoryRouter>
				</QueryClientProvider>
			</Provider>
		</ThemeProvider>,
	);
}

describe("Budget Routing and Compatibility", () => {
	it("redirects /monthly-budget/:budgetId to /budget/:budgetId with trends section", () => {
		renderRoutes("/monthly-budget/b_house");
		expect(screen.getByRole("heading", { name: "House" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Trends" })).toBeInTheDocument();
	});

	it("resolves legacy /monthly-budget/:budgetName by case-insensitive name", () => {
		renderRoutes("/monthly-budget/house");
		expect(screen.getByRole("heading", { name: "House" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Trends" })).toBeInTheDocument();
	});

	it("redirects /monthly-budget to /budget overview", () => {
		renderRoutes("/monthly-budget");
		expect(screen.getByRole("heading", { name: "Budgets" })).toBeInTheDocument();
	});

	it("renders not found state when unknown budget is requested", () => {
		renderRoutes("/monthly-budget/unknown-budget-id");
		expect(
			screen.getByText("Budget not found in this household."),
		).toBeInTheDocument();
	});
});
