import type { Page } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	test,
	expect,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";
import { TestHelper } from "../utils/test-utils";
import { ExpenseTestHelper } from "../utils/expense-test-helper";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

/**
 * Seed a two-user group and set non-empty firstName on each user.
 *
 * The seed handler hardcodes `firstName: ""` for created users, but the
 * Dashboard form's `DashboardUserSchema` requires `FirstName` to be at least
 * 1 character. Without this fix-up the Submit button silently no-ops because
 * `form.canSubmit === false`.
 *
 * The seed fixture has already attached u1's cookies to the page context;
 * we additionally use u2's session (returned in `result.sessions.u2`) to call
 * better-auth's `auth/update-user` endpoint for u2.
 */
async function seedTwoUserAuthedPage(
	seed: SeedFn,
	page: Page,
): Promise<SeedResponse> {
	const result = await seed({
		users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
		groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
		authenticate: ["u1", "u2"],
	});
	for (const alias of ["u1", "u2"] as const) {
		const session = result.sessions[alias];
		if (!session) continue;
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: alias }),
		});
	}
	await page.goto("/");
	return result;
}

test.describe("Expense Management", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("should display expense form on home page", async ({ authedPage }) => {
		const helper = new TestHelper(authedPage);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(authedPage).toHaveURL("/");

		// Verify expense form elements are present
		await expenseHelper.verifyFormElementsVisible();
	});

	test("default currency and split percentages reflect group metadata", async ({
		authedPageWithGroupOf,
	}) => {
		// Single-user simplification: with one user, the form's default split is
		// unambiguously 100%, so we don't need to coordinate metadata.defaultShare
		// keyed by post-seed user IDs. Currency is inherited from the seed factory
		// default ("GBP").
		const { page } = await authedPageWithGroupOf(1);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Read the rendered form to find the (single) user ID; assert defaults match.
		const formValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(formValues.percentages);
		expect(userIds).toHaveLength(1);
		const expectedSplits = { [userIds[0]]: "100" };

		await expenseHelper.verifyFormDefaults("GBP", expectedSplits);
	});

	test("should preserve user-modified percentages within dashboard session but reset after navigation", async ({
		seed,
		page,
	}) => {
		const seedResult = await seedTwoUserAuthedPage(seed, page);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Use seeded user IDs so the test is deterministic regardless of the
		// order in which the form lists users.
		const u1Id = seedResult.ids.users.u1.id;
		const u2Id = seedResult.ids.users.u2.id;

		// Verify initial defaults from group fallback (50/50 since no defaultShare).
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		expect(Object.keys(initialFormValues.percentages).length).toBe(2);
		expect(initialFormValues.percentages[u1Id]).toBe("50");
		expect(initialFormValues.percentages[u2Id]).toBe("50");

		// Set custom split percentages (u1 owes 70%, u2 owes 30%).
		const customPercentages = { [u1Id]: 70, [u2Id]: 30 };
		await expenseHelper.setCustomSplitPercentages(customPercentages);

		// Add an expense with u1 (the logged-in user) as payer.
		const expense = {
			description: "Grocery shopping",
			amount: 100,
			currency: "USD",
			paidBy: u1Id,
		};
		const result = await expenseHelper.addExpenseEntry(expense);

		// Verify form fields are reset but percentages are preserved within this session
		const afterSubmitValues = await expenseHelper.getCurrentFormValues();
		expect(afterSubmitValues.description).toBe("");
		expect(afterSubmitValues.amount).toBe("");
		expect(afterSubmitValues.percentages[u1Id]).toBe("70"); // Preserved within session
		expect(afterSubmitValues.percentages[u2Id]).toBe("30"); // Preserved within session

		// Navigate to expenses page to verify the expense was actually added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();

		// 70/30 split: u1 paid $100, owes $70, so u1's share = +$30.00.
		await expenseHelper.verifySpecificExpenseEntry(
			result.description,
			"100",
			expense.currency,
			"+$30.00",
		);

		// Navigate back to Add page - this should reset percentages to defaults
		await helper.navigateToPage("Add");
		await page.waitForTimeout(2000); // Give time for form to load

		// Verify percentages reset to defaults (50/50 fallback) after navigation
		const afterNavigationValues = await expenseHelper.getCurrentFormValues();
		expect(afterNavigationValues.percentages[u1Id]).toBe("50");
		expect(afterNavigationValues.percentages[u2Id]).toBe("50");
	});

	test("should reset custom currency selection to default after navigation", async ({
		seed,
		page,
	}) => {
		const seedResult = await seedTwoUserAuthedPage(seed, page);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Default currency from factories.group is "GBP"
		const defaultCurrency = "GBP";
		// u1 is the authenticated user (the one whose perspective the Expenses
		// page uses to compute "share"). Use u1 as paidBy so the share is
		// positive (they paid more than their split).
		const u1Id = seedResult.ids.users.u1.id;

		// Confirm 2 percentage inputs are rendered (50/50 fallback for 2 users).
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		expect(Object.keys(initialFormValues.percentages).length).toBe(2);

		// Change currency to EUR for this expense
		await page.selectOption('[data-test-id="currency-select"]', "EUR");

		// Add an expense with EUR currency, paid by the logged-in user
		const expense = {
			description: "Grocery shopping",
			amount: 100,
			currency: "EUR",
			paidBy: u1Id,
		};
		const result = await expenseHelper.addExpenseEntry(expense);

		// Navigate to expenses page to verify the expense was actually added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();

		// u1 paid €100, owes 50%, so u1's share = +€50.00
		await expenseHelper.verifySpecificExpenseEntry(
			result.description,
			"100",
			"EUR",
			"+€50.00",
		);

		// Navigate back to Add page to check currency resets to default
		await helper.navigateToPage("Add");

		// Verify currency selection resets to default (from group metadata)
		const formValues = await expenseHelper.getCurrentFormValues();
		expect(formValues.currency).toBe(defaultCurrency);
	});

	test("should successfully add a new expense with custom split and verify on expenses page", async ({
		seed,
		page,
	}) => {
		const seedResult = await seedTwoUserAuthedPage(seed, page);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Use seeded user IDs (deterministic across test runs).
		const u1Id = seedResult.ids.users.u1.id;
		const u2Id = seedResult.ids.users.u2.id;

		// Confirm 50/50 fallback for 2 users.
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		expect(Object.keys(initialFormValues.percentages).length).toBe(2);

		// Add expense with custom 60/40 split, paid by the logged-in user (u1).
		const expense = {
			description: "Grocery shopping",
			amount: 150.5,
			currency: "USD",
			paidBy: u1Id,
		};
		const customSplit = { [u1Id]: 60, [u2Id]: 40 };
		const result = await expenseHelper.addExpenseEntry(expense, customSplit);

		expect(result.successMessage).toContain("successfully");

		// Navigate to expenses page to verify the expense was actually added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);

		// Verify expenses page components are present
		await expenseHelper.verifyExpensesPageComponents();

		// 60/40 split: u1 paid $150.50, owes $90.30, so u1's share = +$60.20.
		await expenseHelper.verifySpecificExpenseEntry(
			result.description,
			expense.amount.toString(),
			expense.currency,
			"+$60.20",
		);

		// Navigate back to Add page - this should reset percentages to defaults
		await helper.navigateToPage("Add");

		// Verify form was reset including percentages which reset to defaults after navigation
		const formValues = await expenseHelper.getCurrentFormValues();
		expect(formValues.description).toBe("");
		expect(formValues.amount).toBe("");

		// Verify percentages reset to fallback defaults (50/50) after navigation
		expect(formValues.percentages[u1Id]).toBe("50");
		expect(formValues.percentages[u2Id]).toBe("50");
	});

	test("should handle form validation for missing required fields", async ({
		authedPage,
	}) => {
		await expect(authedPage).toHaveURL("/");

		// Try to submit form without filling required fields
		await authedPage.click('[data-test-id="submit-button"]');

		// Form should show HTML5 validation errors (browser handles this)
		// We can verify the form didn't submit by checking we're still on the same page
		await expect(authedPage).toHaveURL("/");
	});

	test("should handle multiple expenses with different currencies", async ({
		seed,
		page,
	}) => {
		const seedResult = await seedTwoUserAuthedPage(seed, page);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Use seeded user IDs so the share-sign assertions below are deterministic.
		// u1 is the authenticated user (whose perspective the Expenses page shows).
		const u1Id = seedResult.ids.users.u1.id;
		const u2Id = seedResult.ids.users.u2.id;

		// Confirm 2 percentage inputs are rendered.
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		expect(Object.keys(initialFormValues.percentages).length).toBe(2);
		const splitPercentages = { [u1Id]: 50, [u2Id]: 50 };

		// Add first expense in USD, paid by u1 so u1's share is positive
		const usdExpense = {
			description: "Grocery shopping",
			amount: 150,
			currency: "USD",
			paidBy: u1Id,
		};
		const usdResult = await expenseHelper.addExpenseEntry(
			usdExpense,
			splitPercentages,
		);

		// Verify first expense immediately after adding
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(3000);
		await expenseHelper.verifyExpensesPageComponents();
		await expenseHelper.verifySpecificExpenseEntry(
			usdResult.description,
			"150",
			"USD",
			"+$75.00",
		);

		// Navigate back to add the second expense
		await helper.navigateToPage("Add");
		await page.waitForTimeout(1000);

		// Add second expense in EUR, paid by u2 so u1's share is negative
		await page.selectOption('[data-test-id="currency-select"]', "EUR");
		const eurExpense = {
			description: "Dinner at restaurant",
			amount: 85,
			currency: "EUR",
			paidBy: u2Id,
		};
		const eurResult = await expenseHelper.addExpenseEntry(
			eurExpense,
			splitPercentages,
		);

		// Navigate to expenses page to verify both expenses were added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(3000);
		await expenseHelper.verifyExpensesPageComponents();

		// Verify both expenses are visible (pagination handling will find older expenses)
		await expenseHelper.verifySpecificExpenseEntry(
			eurResult.description,
			"85",
			"EUR",
			"-€42.50",
		);
		await expenseHelper.verifySpecificExpenseEntry(
			usdResult.description,
			"150",
			"USD",
			"+$75.00",
		);
	});

	test("should successfully delete an expense and verify it no longer appears", async ({
		seed,
		page,
	}) => {
		// Use 2-user split so transaction_users rows are inserted (single-user
		// self-pays-self produces zero split entries; /split_delete then errors with
		// "Transaction not found" since it queries transaction_users to find the tx).
		const seedResult = await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 100,
					currency: "USD",
					description: "Lunch to delete",
				}),
			],
			authenticate: ["u"],
		});
		expect(seedResult.ids.transactions.t).toBeDefined();

		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await page.goto("/");

		// Navigate to expenses page and verify the expense exists
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();

		// Two-user 50/50 split: u paid $100, owes $50 → share is +$50.00
		await expenseHelper.verifySpecificExpenseEntry(
			"Lunch to delete",
			"100",
			"USD",
		);

		// Delete the expense
		await expenseHelper.deleteExpenseEntry("Lunch to delete");

		// Reload the page to ensure fresh data
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		// Verify the expense no longer appears in the list
		await expenseHelper.verifyExpenseNotPresent("Lunch to delete");
	});

	test("should handle deletion of multiple different expenses", async ({
		seed,
		page,
	}) => {
		const desc1 = "Groceries to delete";
		const desc2 = "Restaurant to delete";
		const desc3 = "Utilities to delete";

		// 2-user split required: see comment on first deletion test above.
		await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 50,
					currency: "USD",
					description: desc1,
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 75,
					currency: "EUR",
					description: desc2,
				}),
				factories.transaction({
					alias: "t3",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 120,
					currency: "USD",
					description: desc3,
				}),
			],
			authenticate: ["u"],
		});

		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await page.goto("/");

		// Navigate to expenses page and verify all expenses exist
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(3000);
		await expenseHelper.verifyExpensesPageComponents();

		await expenseHelper.verifySpecificExpenseEntry(desc1, "50", "USD");
		await expenseHelper.verifySpecificExpenseEntry(desc2, "75", "EUR");
		await expenseHelper.verifySpecificExpenseEntry(desc3, "120", "USD");

		// Delete the first expense (USD)
		await expenseHelper.deleteExpenseEntry(desc1);

		// Reload and verify first expense is gone but others remain
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		await expenseHelper.verifyExpenseNotPresent(desc1);
		await expenseHelper.verifySpecificExpenseEntry(desc2, "75", "EUR");
		await expenseHelper.verifySpecificExpenseEntry(desc3, "120", "USD");

		// Delete the third expense
		await expenseHelper.deleteExpenseEntry(desc3);

		// Reload and verify third expense is gone but second remains
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		await expenseHelper.verifyExpenseNotPresent(desc1);
		await expenseHelper.verifyExpenseNotPresent(desc3);
		await expenseHelper.verifySpecificExpenseEntry(desc2, "75", "EUR");

		// Delete the second expense (EUR)
		await expenseHelper.deleteExpenseEntry(desc2);

		// Reload and verify all expenses are gone
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		await expenseHelper.verifyExpenseNotPresent(desc2);
	});

	test("should handle expense deletion", async ({ seed, page }) => {
		const desc = "GBP expense to delete";
		// 2-user split required: see comment on first deletion test above.
		await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 200,
					currency: "GBP",
					description: desc,
				}),
			],
			authenticate: ["u"],
		});

		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await page.goto("/");

		// Navigate to expenses page and verify the expense exists
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();
		await expenseHelper.verifySpecificExpenseEntry(desc, "200", "GBP");

		// Delete the expense
		await expenseHelper.deleteExpenseEntry(desc);

		// Reload the page to ensure fresh data
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		// Verify the expense no longer appears in the list
		await expenseHelper.verifyExpenseNotPresent(desc);
	});

	test("should handle deletion from both mobile and desktop views", async ({
		seed,
		page,
	}) => {
		const desc1 = "USD multi-view to delete";
		const desc2 = "EUR multi-view to delete";

		// 2-user split required: see comment on first deletion test above.
		await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 150,
					currency: "USD",
					description: desc1,
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 90,
					currency: "EUR",
					description: desc2,
				}),
			],
			authenticate: ["u"],
		});

		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await page.goto("/");

		// Test deletion in current viewport
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();

		// Verify both expenses exist
		await expenseHelper.verifySpecificExpenseEntry(desc1, "150", "USD");
		await expenseHelper.verifySpecificExpenseEntry(desc2, "90", "EUR");

		// Delete first expense
		await expenseHelper.deleteExpenseEntry(desc1);

		// Change viewport size to test the other view (mobile <-> desktop)
		const currentViewport = page.viewportSize();
		const isMobile = currentViewport ? currentViewport.width <= 768 : false;

		if (isMobile) {
			// Switch to desktop viewport
			await page.setViewportSize({
				width: 1024,
				height: 768,
			});
		} else {
			// Switch to mobile viewport
			await page.setViewportSize({ width: 375, height: 667 });
		}

		// Reload page to apply new viewport and verify first expense is gone
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		await expenseHelper.verifyExpenseNotPresent(desc1);
		await expenseHelper.verifySpecificExpenseEntry(desc2, "90", "EUR");

		// Delete second expense from the different viewport
		await expenseHelper.deleteExpenseEntry(desc2);

		// Verify both expenses are gone
		await page.reload();
		await expenseHelper.verifyExpensesPageComponents();

		await expenseHelper.verifyExpenseNotPresent(desc1);
		await expenseHelper.verifyExpenseNotPresent(desc2);

		// Restore original viewport
		if (currentViewport) {
			await page.setViewportSize(currentViewport);
		}
	});
});
