import { render, screen, fireEvent, configure } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "styled-components";
import { theme } from "@/components/theme";
import Dashboard from "./index";

jest.mock("@/utils/api", () => ({
	__esModule: true,
	default: {
		get: jest.fn().mockResolvedValue({ data: {} }),
		post: jest.fn().mockResolvedValue({ data: {} }),
	},
	typedApi: {
		get: jest.fn().mockResolvedValue({}),
		post: jest.fn().mockResolvedValue({}),
	},
}));

function renderDashboard(budgets = [{ id: "b1", budgetName: "House", name: "House" }]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});

	const store = configureStore({
		reducer: () => ({
			value: {
				user: { id: "u1" },
				extra: {
					currentUser: { id: "u1", firstName: "Alice" },
					group: {
						groupid: "g1",
						budgets,
						metadata: {
							defaultCurrency: "GBP",
							defaultShare: { u1: 100 },
						},
					},
					usersById: {
						u1: { id: "u1", firstName: "Alice" },
						u2: { id: "u2", firstName: "Bob" },
					},
				},
			},
		}),
	});

	return render(
		<Provider store={store}>
			<ThemeProvider theme={theme}>
				<QueryClientProvider client={queryClient}>
					<MemoryRouter>
						<Dashboard />
					</MemoryRouter>
				</QueryClientProvider>
			</ThemeProvider>
		</Provider>,
	);
}

describe("Dashboard - Purchase-first transaction entry", () => {
	beforeAll(() => configure({ testIdAttribute: "data-test-id" }));
	afterAll(() => configure({ testIdAttribute: "data-testid" }));

	it("renders purchase-first UI without legacy Add Expense / Update Budget checkboxes", async () => {
		renderDashboard();

		// Header reflects transaction entry
		expect(
			await screen.findByRole("heading", { name: /Add a transaction|Add an expense/i }),
		).toBeInTheDocument();

		// Legacy checkboxes should NOT exist in the normal transaction form
		expect(
			screen.queryByTestId("add-expense-checkbox"),
		).not.toBeInTheDocument();
		expect(
			screen.queryByTestId("update-budget-checkbox"),
		).not.toBeInTheDocument();

		// Purchase form core fields are visible
		expect(screen.getByTestId("description-input")).toBeInTheDocument();
		expect(screen.getByTestId("amount-input")).toBeInTheDocument();
		expect(screen.getByTestId("currency-select")).toBeInTheDocument();
		expect(screen.getByTestId("paid-by-select")).toBeInTheDocument();
		expect(screen.getByTestId("submit-button")).toBeInTheDocument();

		// Mode selector or other actions control is present
		expect(screen.getByTestId("transaction-mode-selector")).toBeInTheDocument();
	});

	it("switches to split-only mode and hides budget fields", async () => {
		renderDashboard();

		const modeSelector = await screen.findByTestId("transaction-mode-selector");
		fireEvent.change(modeSelector, { target: { value: "split_only" } });

		expect(screen.getByTestId("paid-by-select")).toBeInTheDocument();
		expect(screen.queryByTestId("budget-selector")).not.toBeInTheDocument();
	});

	it("switches to budget adjustment mode and hides split fields", async () => {
		renderDashboard();

		const modeSelector = await screen.findByTestId("transaction-mode-selector");
		fireEvent.change(modeSelector, { target: { value: "budget_adjustment" } });

		// Budget selection and Credit/Debit toggle should be visible
		expect(screen.getByTestId("credit-debit-toggle")).toBeInTheDocument();
		// Split-only fields should be hidden
		expect(screen.queryByTestId("paid-by-select")).not.toBeInTheDocument();
	});

	it("switches to transfer mode and renders transfer form", async () => {
		renderDashboard([
			{ id: "b1", budgetName: "House", name: "House" },
			{ id: "b2", budgetName: "Vacation", name: "Vacation" },
		]);

		const modeSelector = await screen.findByTestId("transaction-mode-selector");
		fireEvent.change(modeSelector, { target: { value: "transfer" } });

		// Transfer container and Transfer form are visible
		expect(
			await screen.findByTestId("dashboard-transfer-container"),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Transfer/i }),
		).toBeInTheDocument();
	});
});
