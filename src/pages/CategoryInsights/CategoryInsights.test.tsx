import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CategoryInsightsResponse } from "split-expense-shared-types";
import { InsightsContent, expenseCategoryUrl } from "./index";
jest.mock("@/hooks/useCategoryInsights", () => ({ useCategoryInsights: jest.fn() }));
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
 excluded:{count:0,spending:0,negativeAdjustments:0,net:0,categories:[]},
	dateFrom: "2026-01-01",
	dateTo: "2026-02-28",
	currency: "GBP",
	currencies: ["GBP", "EUR"],
	count: 3,
	spending: 150,
	negativeAdjustments: -100,
	net: 50,
	categories: [
		{
			id: "groceries",
			name: "Groceries",
			spending: 100,
			negativeAdjustments: -100,
			percentage: (100 / 150) * 100,
			count: 2,
		},
		{
			id: null,
			name: "Uncategorised",
			spending: 50,
			negativeAdjustments: 0,
			percentage: (50 / 150) * 100,
			count: 1,
		},
	],
	months: [
		{ month: "2026-01", spending: 100, categories: { groceries: 100 } },
		{ month: "2026-02", spending: 50, categories: { uncategorised: 50 } },
	],
};
it("shows spending percentages with separate negative adjustments and scoped expense links", () => {
	render(
		<MemoryRouter>
			<InsightsContent data={data} />
		</MemoryRouter>,
	);
	expect(screen.getByRole("link", { name: /Groceries.*£/ })).toHaveAttribute(
		"href",
		"/expenses?categoryId=groceries&dateFrom=2026-01-01&dateTo=2026-02-28&currency=GBP",
	);
	expect(screen.getByRole("link", { name: /Uncategorised.*£/ })).toHaveAttribute(
		"href",
		expect.stringContaining("categoryId=uncategorised"),
	);
	expect(screen.getByText("66.7%")).toBeInTheDocument();
	expect(screen.getByText("Spending")).toBeInTheDocument();
	expect(screen.getByText("Adjustments")).toBeInTheDocument();
	expect(screen.getByRole("heading", { name: "Monthly spending" })).toBeInTheDocument();
});
it("shows an honest empty state without percentages or a chart", () => {
	render(
		<MemoryRouter>
			<InsightsContent
				data={{ ...data, count: 0, spending: 0, negativeAdjustments: 0, net: 0, categories: [] }}
			/>
		</MemoryRouter>,
	);
	expect(screen.getByText(/No included shared expenses/)).toBeInTheDocument();
	expect(screen.queryByRole("heading", { name: "Monthly spending" })).not.toBeInTheDocument();
});
it("escapes category IDs while preserving range and currency", () =>
	expect(expenseCategoryUrl("custom & category", data)).toContain(
		"categoryId=custom+%26+category",
	));

it("explains negative-only activity without creating a misleading percentage or chart", () => {
	render(
		<MemoryRouter>
			<InsightsContent
				data={{
					...data,
					spending: 0,
					negativeAdjustments: -100,
					net: -100,
					categories: [
						{
							id: null,
							name: "Uncategorised",
							spending: 0,
							negativeAdjustments: -100,
							percentage: 0,
							count: 1,
						},
					],
				}}
			/>
		</MemoryRouter>,
	);
	expect(screen.getByText("0.0%")).toBeInTheDocument();
	expect(screen.getByText(/No positive spending to chart/)).toBeInTheDocument();
	expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("discloses all excluded activity even when there are no included expenses",()=>{
 render(<MemoryRouter><InsightsContent data={{...data,count:0,categories:[],excluded:{count:2,spending:100,negativeAdjustments:-20,net:80,categories:["Household movements"]}}}/></MemoryRouter>);
 expect(screen.getByText("2 expenses excluded: Household movements")).toBeInTheDocument();expect(screen.getByText(/No included shared expenses/)).toBeInTheDocument();expect(screen.getByText("£80.00")).toBeInTheDocument();
});
