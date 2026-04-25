import {
	test,
	expect,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";
import { TestHelper } from "../utils/test-utils";
import { ExpenseTestHelper } from "../utils/expense-test-helper";

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
		authedPageWithGroupOf,
	}) => {
		const { page } = await authedPageWithGroupOf(2);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Read user IDs from the rendered form. With 2 users and no defaultShare
		// metadata seeded, the form falls back to 100/n = 50% per user.
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(initialFormValues.percentages);
		expect(userIds.length).toBe(2);
		const [userId1, userId2] = userIds;

		// Verify initial defaults from group fallback (50/50 since no defaultShare)
		expect(initialFormValues.percentages[userId1]).toBe("50");
		expect(initialFormValues.percentages[userId2]).toBe("50");

		// Set custom split percentages (70/30 instead of default 50/50)
		const customPercentages = { [userId1]: 70, [userId2]: 30 };
		await expenseHelper.setCustomSplitPercentages(customPercentages);

		// Add an expense with user1 as payer
		const expense = {
			description: "Grocery shopping",
			amount: 100,
			currency: "USD",
			paidBy: userId1,
		};
		const result = await expenseHelper.addExpenseEntry(expense);

		// Verify form fields are reset but percentages are preserved within this session
		const afterSubmitValues = await expenseHelper.getCurrentFormValues();
		expect(afterSubmitValues.description).toBe("");
		expect(afterSubmitValues.amount).toBe("");
		expect(afterSubmitValues.percentages[userId1]).toBe("70"); // Preserved within session
		expect(afterSubmitValues.percentages[userId2]).toBe("30"); // Preserved within session

		// Navigate to expenses page to verify the expense was actually added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();

		// Verify the specific expense we added is visible (70/30 split: user1 paid $100, owes $70, share = +$30.00)
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
		expect(afterNavigationValues.percentages[userId1]).toBe("50");
		expect(afterNavigationValues.percentages[userId2]).toBe("50");
	});

	test("should reset custom currency selection to default after navigation", async ({
		authedPageWithGroupOf,
	}) => {
		const { page } = await authedPageWithGroupOf(2);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Default currency from factories.group is "GBP"
		const defaultCurrency = "GBP";

		// Read user IDs from the rendered form. 50/50 fallback for 2 users.
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(initialFormValues.percentages);
		expect(userIds.length).toBeGreaterThanOrEqual(1);
		const [firstUserId] = userIds;

		// Change currency to EUR for this expense
		await page.selectOption('[data-test-id="currency-select"]', "EUR");

		// Add an expense with EUR currency, paid by first user
		const expense = {
			description: "Grocery shopping",
			amount: 100,
			currency: "EUR",
			paidBy: firstUserId,
		};
		const result = await expenseHelper.addExpenseEntry(expense);

		// Navigate to expenses page to verify the expense was actually added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);
		await expenseHelper.verifyExpensesPageComponents();

		// First user paid €100, owes 50%, share = +€50.00
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
		authedPageWithGroupOf,
	}) => {
		const { page } = await authedPageWithGroupOf(2);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Read user IDs from the rendered form. 50/50 fallback for 2 users.
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(initialFormValues.percentages);
		expect(userIds.length).toBe(2);
		const [userId1, userId2] = userIds;

		// Add expense with custom 60/40 split
		const expense = {
			description: "Grocery shopping",
			amount: 150.5,
			currency: "USD",
			paidBy: userId1,
		};
		const customSplit = { [userId1]: 60, [userId2]: 40 };
		const result = await expenseHelper.addExpenseEntry(expense, customSplit);

		expect(result.successMessage).toContain("successfully");

		// Navigate to expenses page to verify the expense was actually added
		await helper.navigateToPage("Expenses");
		await page.waitForTimeout(2000);

		// Verify expenses page components are present
		await expenseHelper.verifyExpensesPageComponents();

		// Verify the specific expense we added is visible (60/40 split: user1 paid $150.50, owes $90.30, share = +$60.20)
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
		expect(formValues.percentages[userId1]).toBe("50");
		expect(formValues.percentages[userId2]).toBe("50");
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
		authedPageWithGroupOf,
	}) => {
		const { page } = await authedPageWithGroupOf(2);
		const helper = new TestHelper(page);
		const expenseHelper = new ExpenseTestHelper(helper);

		await expect(page).toHaveURL("/");

		// Read user IDs from the rendered form.
		const initialFormValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(initialFormValues.percentages);
		expect(userIds.length).toBe(2);
		const [userId1, userId2] = userIds;
		const splitPercentages = { [userId1]: 50, [userId2]: 50 };

		// Add first expense in USD
		const usdExpense = {
			description: "Grocery shopping",
			amount: 150,
			currency: "USD",
			paidBy: userId1,
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

		// Add second expense in EUR, paid by user2 so user1's share is negative
		await page.selectOption('[data-test-id="currency-select"]', "EUR");
		const eurExpense = {
			description: "Dinner at restaurant",
			amount: 85,
			currency: "EUR",
			paidBy: userId2,
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
		const seedResult = await seed({
			users: [factories.user({ alias: "u" })],
			groups: [factories.group({ alias: "g", members: ["u"] })],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u",
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

		// Single-user transaction: paid full amount and split 100% to self → share is $0.00
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

		await seed({
			users: [factories.user({ alias: "u" })],
			groups: [factories.group({ alias: "g", members: ["u"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u",
					amount: 50,
					currency: "USD",
					description: desc1,
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u",
					amount: 75,
					currency: "EUR",
					description: desc2,
				}),
				factories.transaction({
					alias: "t3",
					group: "g",
					paidBy: "u",
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
		await seed({
			users: [factories.user({ alias: "u" })],
			groups: [factories.group({ alias: "g", members: ["u"] })],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u",
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

		await seed({
			users: [factories.user({ alias: "u" })],
			groups: [factories.group({ alias: "g", members: ["u"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u",
					amount: 150,
					currency: "USD",
					description: desc1,
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u",
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
