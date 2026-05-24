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
});
