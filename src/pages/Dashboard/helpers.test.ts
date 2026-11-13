import { DashboardFormSchema } from "split-expense-shared-types";
import { buildDefaultFormValues, getDefaultCurrency } from "./helpers";

describe("Dashboard helpers", () => {
	it("honours INR as a supported group default currency", () => {
		expect(getDefaultCurrency("INR")).toBe("INR");

		const values = buildDefaultFormValues(
			{
				extra: {
					currentUser: { id: "user-1" },
					usersById: {
						"user-1": {
							id: "user-1",
							firstName: "Alice",
						},
					},
					group: {
						metadata: {
							defaultCurrency: "INR",
							defaultShare: { "user-1": 100 },
						},
					},
				},
			} as any,
			[],
		);

		expect(values.currency).toBe("INR");
	});

	it("validates dashboard submissions with any supported currency", () => {
		const result = DashboardFormSchema.safeParse({
			addExpense: true,
			updateBudget: false,
			amount: 100,
			description: "Dinner",
			currency: "INR",
			paidBy: "user-1",
			users: [{ Id: "user-1", FirstName: "Alice", percentage: 100 }],
		});

		expect(result.success).toBe(true);
	});

	it("sets split_only mode defaults when no budgets exist", () => {
		const values = buildDefaultFormValues(
			{
				extra: {
					currentUser: { id: "user-1" },
					usersById: {
						"user-1": { id: "user-1", firstName: "Alice" },
					},
				},
			} as any,
			[],
		);

		expect(values.addExpense).toBe(true);
		expect(values.updateBudget).toBe(false);
	});

	it("sets purchase mode defaults when budgets are present", () => {
		const values = buildDefaultFormValues(
			{
				extra: {
					currentUser: { id: "user-1" },
					usersById: {
						"user-1": { id: "user-1", firstName: "Alice" },
					},
				},
			} as any,
			[{ id: "budget-1", name: "House" }],
		);

		expect(values.addExpense).toBe(true);
		expect(values.updateBudget).toBe(true);
		expect(values.budgetId).toBe("budget-1");
		expect(values.creditDebit).toBe("Debit");
	});

	it("honours explicit mode in buildDefaultFormValues", () => {
		const values = buildDefaultFormValues(
			{
				extra: {
					currentUser: { id: "user-1" },
					usersById: {
						"user-1": { id: "user-1", firstName: "Alice" },
					},
				},
			} as any,
			[{ id: "budget-1", name: "House" }],
			"budget_adjustment",
		);

		expect(values.addExpense).toBe(false);
		expect(values.updateBudget).toBe(true);
		expect(values.creditDebit).toBe("Credit");
	});
});
