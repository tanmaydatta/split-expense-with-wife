import { fireEvent, render, screen } from "@testing-library/react";
import { BudgetSummaryCard } from "./BudgetSummaryCard";
import { BudgetOverview } from "./BudgetOverview";
import type { BudgetTotal, GroupBudgetData } from "split-expense-shared-types";

jest.mock("@/utils/api", () => ({ typedApi: { post: jest.fn() } }));

describe("BudgetSummaryCard", () => {
	it("renders budget name, available label, and positive lifetime balance", () => {
		const onOpen = jest.fn();
		const totals: BudgetTotal[] = [{ currency: "GBP", amount: 116.27 }];

		render(
			<BudgetSummaryCard
				budgetId="b_house"
				name="Household"
				totals={totals}
				onOpen={onOpen}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Household" })).toBeInTheDocument();
		expect(screen.getByText("Available")).toBeInTheDocument();
		expect(screen.getByText("+£116.27")).toBeInTheDocument();
		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
	});

	it("renders signed negative lifetime balance and preserves deficit without resetting", () => {
		const onOpen = jest.fn();
		const totals: BudgetTotal[] = [{ currency: "GBP", amount: -21.18 }];

		render(
			<BudgetSummaryCard
				budgetId="b_personal"
				name="Personal"
				totals={totals}
				onOpen={onOpen}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Personal" })).toBeInTheDocument();
		expect(screen.getByText("-£21.18")).toBeInTheDocument();
	});

	it("renders zero balance correctly", () => {
		const onOpen = jest.fn();
		const totals: BudgetTotal[] = [{ currency: "GBP", amount: 0 }];

		render(
			<BudgetSummaryCard
				budgetId="b_vacation"
				name="Vacation"
				totals={totals}
				onOpen={onOpen}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Vacation" })).toBeInTheDocument();
		expect(screen.getByText("£0.00")).toBeInTheDocument();
	});

	it("displays distinct totals for multiple currencies without summing across them", () => {
		const onOpen = jest.fn();
		const totals: BudgetTotal[] = [
			{ currency: "GBP", amount: 116.27 },
			{ currency: "USD", amount: -50.0 },
		];

		render(
			<BudgetSummaryCard
				budgetId="b_multi"
				name="Travel"
				totals={totals}
				onOpen={onOpen}
			/>,
		);

		expect(screen.getByText("+£116.27")).toBeInTheDocument();
		expect(screen.getByText("-$50.00")).toBeInTheDocument();
	});

	it("triggers onOpen callback when clicking view details button or card", () => {
		const onOpen = jest.fn();
		const totals: BudgetTotal[] = [{ currency: "GBP", amount: 50.0 }];

		render(
			<BudgetSummaryCard
				budgetId="b_house"
				name="Household"
				totals={totals}
				onOpen={onOpen}
			/>,
		);

		const viewButton = screen.getByRole("button", {
			name: /view details/i,
		});
		fireEvent.click(viewButton);

		expect(onOpen).toHaveBeenCalledWith("b_house");

		// Also verify clicking the card directly
		onOpen.mockClear();
		const card = screen.getByTestId("budget-summary-card-b_house");
		fireEvent.click(card);
		expect(onOpen).toHaveBeenCalledWith("b_house");
	});
});

describe("BudgetOverview", () => {
	const activeBudgets: GroupBudgetData[] = [
		{ id: "b_house", budgetName: "House", description: null },
		{ id: "b_personal", budgetName: "Personal", description: null },
		{ id: "b_vacation", budgetName: "Vacation", description: null },
	];

	const totalsMap: Record<string, BudgetTotal[]> = {
		b_house: [{ currency: "GBP", amount: 116.27 }],
		b_personal: [{ currency: "GBP", amount: -21.18 }],
		b_vacation: [{ currency: "GBP", amount: 0 }],
	};

	it("renders active budget cards with their names and signed balances", () => {
		const onOpenBudget = jest.fn();

		render(
			<BudgetOverview
				budgets={activeBudgets}
				getTotals={(id) => totalsMap[id] ?? []}
				onOpenBudget={onOpenBudget}
			/>,
		);

		expect(screen.getByRole("heading", { name: "House" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Personal" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Vacation" })).toBeInTheDocument();

		expect(screen.getByText("+£116.27")).toBeInTheDocument();
		expect(screen.getByText("-£21.18")).toBeInTheDocument();
		expect(screen.getByText("£0.00")).toBeInTheDocument();
	});

	it("omits archived / deleted budgets from the overview cards", () => {
		const onOpenBudget = jest.fn();
		const budgetsWithArchived = [
			...activeBudgets,
			{
				id: "b_old",
				budgetName: "Old Renovations",
				description: null,
				deleted: "2026-01-01T00:00:00Z",
			},
		] as (GroupBudgetData & { deleted?: string | null })[];

		render(
			<BudgetOverview
				budgets={budgetsWithArchived}
				getTotals={(id) => totalsMap[id] ?? []}
				onOpenBudget={onOpenBudget}
			/>,
		);

		expect(screen.queryByText("Old Renovations")).not.toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "House" })).toBeInTheDocument();
	});

	it("renders an accessible empty state when no active budgets exist", () => {
		const onOpenBudget = jest.fn();

		render(
			<BudgetOverview
				budgets={[]}
				getTotals={() => []}
				onOpenBudget={onOpenBudget}
			/>,
		);

		expect(screen.getByText(/no active budgets/i)).toBeInTheDocument();
	});
});
