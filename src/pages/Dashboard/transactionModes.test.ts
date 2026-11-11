import {
	defaultTransactionMode,
	toExistingSubmitPayload,
} from "./transactionModes";
import type { DashboardFormInput } from "split-expense-shared-types";

describe("transactionModes", () => {
	const sampleFormInput: DashboardFormInput = {
		addExpense: true,
		updateBudget: true,
		amount: 42.5,
		description: "Groceries",
		currency: "GBP",
		paidBy: "user-1",
		users: [
			{ FirstName: "Alice", Id: "user-1", percentage: 50 },
			{ FirstName: "Bob", Id: "user-2", percentage: 50 },
		],
		budgetId: "budget-house",
		creditDebit: "Debit",
	};

	describe("defaultTransactionMode", () => {
		it("defaults to purchase when at least one budget is available", () => {
			expect(defaultTransactionMode(true)).toBe("purchase");
		});

		it("defaults to split_only when no budget is available", () => {
			expect(defaultTransactionMode(false)).toBe("split_only");
		});
	});

	describe("toExistingSubmitPayload", () => {
		it("maps purchase to both expense and budget within a single request", () => {
			const payload = toExistingSubmitPayload(sampleFormInput, "purchase", {
				groupId: "group-123",
				categoryId: "cat-groceries",
			});

			expect(payload).not.toBeNull();
			expect(payload?.addExpense).toBe(true);
			expect(payload?.updateBudget).toBe(true);
			expect(payload?.categoryId).toBe("cat-groceries");

			expect(payload?.expense).toEqual({
				amount: 42.5,
				description: "Groceries",
				currency: "GBP",
				paidBy: "user-1",
				users: sampleFormInput.users,
			});

			expect(payload?.budget).toEqual({
				amount: 42.5,
				description: "Groceries",
				budgetId: "budget-house",
				currency: "GBP",
				creditDebit: "Debit",
				groupId: "group-123",
			});
		});

		it("maps split_only to expense only with zero budget impact", () => {
			const payload = toExistingSubmitPayload(sampleFormInput, "split_only", {
				groupId: "group-123",
			});

			expect(payload).not.toBeNull();
			expect(payload?.addExpense).toBe(true);
			expect(payload?.updateBudget).toBe(false);
			expect(payload?.expense).toBeDefined();
			expect(payload?.expense?.amount).toBe(42.5);
			expect(payload?.budget).toBeUndefined();
		});

		it("maps budget_adjustment credit (funding) to budget only with zero debt impact", () => {
			const fundingInput: DashboardFormInput = {
				...sampleFormInput,
				description: "Monthly budget allowance",
				creditDebit: "Credit",
			};

			const payload = toExistingSubmitPayload(
				fundingInput,
				"budget_adjustment",
				{
					groupId: "group-123",
				},
			);

			expect(payload).not.toBeNull();
			expect(payload?.addExpense).toBe(false);
			expect(payload?.updateBudget).toBe(true);
			expect(payload?.expense).toBeUndefined();
			expect(payload?.budget).toEqual({
				amount: 42.5,
				description: "Monthly budget allowance",
				budgetId: "budget-house",
				currency: "GBP",
				creditDebit: "Credit",
				groupId: "group-123",
			});
		});

		it("maps budget_adjustment debit to budget only", () => {
			const debitInput: DashboardFormInput = {
				...sampleFormInput,
				description: "Cash withdrawal from budget",
				creditDebit: "Debit",
			};

			const payload = toExistingSubmitPayload(debitInput, "budget_adjustment", {
				groupId: "group-123",
			});

			expect(payload).not.toBeNull();
			expect(payload?.addExpense).toBe(false);
			expect(payload?.updateBudget).toBe(true);
			expect(payload?.expense).toBeUndefined();
			expect(payload?.budget?.creditDebit).toBe("Debit");
		});

		it("returns null for transfer so it does not call the expense/dashboard write API", () => {
			const payload = toExistingSubmitPayload(sampleFormInput, "transfer", {
				groupId: "group-123",
			});

			expect(payload).toBeNull();
		});
	});
});
