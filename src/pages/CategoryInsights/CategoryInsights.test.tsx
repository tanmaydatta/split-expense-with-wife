import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CategoryInsightsResponse } from "split-expense-shared-types";
import { InsightsContent, budgetCategoryUrl } from "./index";
jest.mock("@/hooks/useCategoryInsights", () => ({ useCategoryInsights: jest.fn() }));
jest.mock("@/hooks/useCategories", () => ({ useCategories: jest.fn() }));
jest.mock("recharts", () => ({
	ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
	BarChart: () => null,
	Bar: () => null,
	CartesianGrid: () => null,
	XAxis: () => null,
	YAxis: () => null,
	Tooltip: () => null,
}));
const data: CategoryInsightsResponse = {
	dateFrom: "2026-01-01",
	dateTo: "2026-02-28",
	budgetId: null,
	currency: "GBP",
	currencies: ["GBP"],
	count: 3,
	spending: 500,
	credits: 500,
	net: 0,
	excluded: { count: 0, spending: 0, credits: 0, net: 0, categories: [] },
	categories: [
		{
			id: "grocery",
			name: "Groceries",
			spending: 500,
			credits: 0,
			percentage: 100,
			count: 2,
			budgets: [
				{ id: "food", name: "Food", spending: 300, credits: 0, count: 1 },
				{ id: "house", name: "Household", spending: 200, credits: 0, count: 1 },
			],
		},
		{
			id: null,
			name: "Uncategorised",
			spending: 0,
			credits: 500,
			percentage: 0,
			count: 1,
			budgets: [{ id: "food", name: "Food", spending: 0, credits: 500, count: 1 }],
		},
	],
	months: [
		{ month: "2026-01", spending: 500, categories: { grocery: 500 } },
		{ month: "2026-02", spending: 0, categories: {} },
	],
};
it("shows budget debit spending, credits and net movement without income assumptions", () => {
	render(
		<MemoryRouter>
			<InsightsContent data={data} />
		</MemoryRouter>,
	);
	expect(screen.getByRole("heading", { name: "Credits" })).toBeInTheDocument();
	expect(screen.getByRole("heading", { name: "Net budget movement" })).toBeInTheDocument();
	expect(screen.getByText("100.0%")).toBeInTheDocument();
	expect(screen.queryByText("Net expenses")).not.toBeInTheDocument();
});
it("All scope offers truthful per-budget category links rather than a first-budget or expense redirect", () => {
	render(
		<MemoryRouter>
			<InsightsContent data={data} />
		</MemoryRouter>,
	);
	fireEvent.click(screen.getAllByText("View budget entries")[0]);
	const link = screen.getByRole("link", { name: /Food.*£300/ });
	expect(link).toHaveAttribute(
		"href",
		"/budget?budget=food&categoryId=grocery&dateFrom=2026-01-01&dateTo=2026-02-28&currency=GBP",
	);
	expect(screen.getByRole("link", { name: /Household.*£200/ })).toHaveAttribute(
		"href",
		expect.stringContaining("budget=house"),
	);
	expect(screen.queryByRole("link", { name: "Groceries" })).not.toBeInTheDocument();
});
it("single budget scope links directly to its correctly filtered budget list", () => {
	render(
		<MemoryRouter>
			<InsightsContent data={{ ...data, budgetId: "food" }} />
		</MemoryRouter>,
	);
	expect(screen.getAllByRole("link", { name: "Groceries" })[0]).toHaveAttribute(
		"href",
		expect.stringContaining("/budget?budget=food&categoryId=grocery"),
	);
});
it("keeps excluded-only reports usable and labels excluded credits and debits as budget entries", () => {
	render(
		<MemoryRouter>
			<InsightsContent
				data={{
					...data,
					count: 0,
					categories: [],
					excluded: { count: 2, spending: 500, credits: 500, net: 0, categories: ["Transfers"] },
				}}
			/>
		</MemoryRouter>,
	);
	expect(screen.getByText("2 budget entries excluded: Transfers")).toBeInTheDocument();
	expect(screen.getByText(/No included budget entries/)).toBeInTheDocument();
});
it("has a credits-only state with no misleading spending chart", () => {
	render(
		<MemoryRouter>
			<InsightsContent
				data={{
					...data,
					spending: 0,
					credits: 500,
					net: 500,
					categories: [{ ...data.categories[1] }],
				}}
			/>
		</MemoryRouter>,
	);
	expect(screen.getByText(/No budget debits to chart/)).toBeInTheDocument();
	expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("encodes budget/category identifiers and retains date and currency scope", () =>
	expect(budgetCategoryUrl("food & home", "custom & category", data)).toBe(
		"/budget?budget=food+%26+home&categoryId=custom+%26+category&dateFrom=2026-01-01&dateTo=2026-02-28&currency=GBP",
	));
