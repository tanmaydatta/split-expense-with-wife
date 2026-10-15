import { render, screen, within, configure } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { theme } from "@/components/theme";
import { MemoryRouter } from "react-router-dom";
import type { BudgetEntry } from "split-expense-shared-types";
import BudgetTable from "./BudgetTable";
import type { BulkCategories } from "@/components/BulkCategories";
beforeAll(() => configure({ testIdAttribute: "data-test-id" }));
afterAll(() => configure({ testIdAttribute: "data-testid" }));
const mockUseBudgetEntry = jest.fn();
jest.mock("@/hooks/useBudgetEntry", () => ({
	useBudgetEntry: (id: string) => mockUseBudgetEntry(id),
}));
jest.mock("@/hooks/useCategories", () => ({
	useCategories: () => ({
		data: {
			enabled: true,
			categories: [{ id: "groceries", name: "Groceries", slug: "groceries" }],
		},
	}),
}));
jest.mock("@/utils/api", () => ({ __esModule: true, default: { post: jest.fn() } }));
const entry: BudgetEntry = {
	id: "entry",
	description: "Synthetic groceries debit",
	name: "Household",
	addedTime: "2026-10-12",
	price: "-42.00",
	amount: -42,
	currency: "GBP",
	groupid: "home",
	categoryId: "groceries",
	categoryName: "Groceries",
};
it("renders category icon and name in loaded desktop rows and mobile cards without detail fetches", () => {
	render(
		<ThemeProvider theme={theme}>
			<MemoryRouter>
				<BudgetTable
					entries={[entry]}
					bulk={{ enabled: false } as BulkCategories}
					onDelete={jest.fn()}
				/>
			</MemoryRouter>
		</ThemeProvider>,
	);
	const desktop = within(screen.getByTestId("desktop-table"));
	expect(desktop.getByText("Groceries")).toBeVisible();
	expect(desktop.getByText("🛒")).toBeInTheDocument();
	const mobile = within(screen.getByTestId("mobile-cards"));
	expect(mobile.getByText("Groceries")).toBeInTheDocument();
	expect(mobile.getByText("🛒")).toBeInTheDocument();
	expect(mockUseBudgetEntry).not.toHaveBeenCalled();
	expect(desktop.getByText("Synthetic groceries debit")).toBeInTheDocument();
	expect(desktop.getByText("-£42.00")).toBeInTheDocument();
});
