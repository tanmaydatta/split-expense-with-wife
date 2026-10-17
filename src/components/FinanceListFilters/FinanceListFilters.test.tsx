import { fireEvent, render, screen } from "@testing-library/react";
import { FinanceListFilters } from "./index";
import type { useFinanceListFilters } from "@/hooks/useFinanceListFilters";
jest.mock("@/hooks/useCategories", () => ({
	useCategories: () => ({ data: { enabled: false } }),
}));
const state = {
	filters: {},
	params: new URLSearchParams(),
	activeCount: 0,
	error: "",
	update: jest.fn(),
	clear: jest.fn(),
} as unknown as ReturnType<typeof useFinanceListFilters>;
for (const desktop of [true, false]) {
	it(`starts Budget filters collapsed on ${desktop ? "desktop" : "mobile"} and supports toggling`, () => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: jest.fn(() => ({ matches: desktop })),
		});
		render(
			<FinanceListFilters state={state} currencies={["GBP"]} kind="budget" />,
		);
		expect(screen.getByLabelText("Date from (UTC)")).not.toBeVisible();
		fireEvent.click(screen.getByText("Filters", { exact: true }));
		expect(screen.getByLabelText("Date from (UTC)")).toBeVisible();
		fireEvent.click(screen.getByText("Filters", { exact: true }));
		expect(screen.getByLabelText("Date from (UTC)")).not.toBeVisible();
	});
}

it("preserves Expenses desktop default", () => {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: jest.fn(() => ({ matches: true })),
	});
	render(
		<FinanceListFilters state={state} currencies={["GBP"]} kind="expenses" />,
	);
	expect(screen.getByLabelText("Date from (UTC)")).toBeVisible();
});

it("preserves Expenses mobile default", () => {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: jest.fn(() => ({ matches: false })),
	});
	render(
		<FinanceListFilters state={state} currencies={["GBP"]} kind="expenses" />,
	);
	expect(screen.getByLabelText("Date from (UTC)")).not.toBeVisible();
});

it("keeps active URL filters applied and counted while Budget controls are collapsed", () => {
	const update = jest.fn();
	const params = new URLSearchParams("currency=GBP&dateFrom=2026-01-01");
	render(
		<FinanceListFilters
			state={{
				...state,
				params,
				filters: { currency: "GBP", dateFrom: "2026-01-01" },
				activeCount: 2,
				update,
			}}
			currencies={["GBP"]}
			kind="budget"
		/>,
	);
	expect(screen.getByText("Filters · 2 active")).toBeVisible();
	expect(screen.getByLabelText("Date from (UTC)")).not.toBeVisible();
	fireEvent.click(screen.getByText("Filters · 2 active"));
	expect(screen.getByLabelText("Date from (UTC)")).toHaveValue("2026-01-01");
	expect(params.toString()).toBe("currency=GBP&dateFrom=2026-01-01");
	expect(update).not.toHaveBeenCalled();
});
