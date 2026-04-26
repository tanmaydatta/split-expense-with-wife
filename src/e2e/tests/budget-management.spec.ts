import type { Page } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	expect,
	factories,
	skipIfRemoteBackend,
	test,
} from "../fixtures/setup";
import { TestHelper } from "../utils/test-utils";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

// Helper functions for budget operations (operates on a Page directly).
class BudgetTestHelper {
	private testHelper: TestHelper;

	constructor(public page: Page) {
		this.testHelper = new TestHelper(page);
	}

	async navigateToPage(name: Parameters<TestHelper["navigateToPage"]>[0]) {
		await this.testHelper.navigateToPage(name);
	}

	async waitForLoading() {
		await this.testHelper.waitForLoading();
	}

	async isMobile() {
		return this.testHelper.isMobile();
	}

	async addBudgetEntry(
		budget: { name: string; amount: number; currency: string },
		type: "Credit" | "Debit",
	) {
		const budgetForm = this.page.locator("form");

		// Generate random description to avoid edge cases
		const randomId = Math.random().toString(36).substring(2, 8);
		const timestamp = Date.now().toString().slice(-6);
		const description = `${type} for ${budget.name} ${randomId}${timestamp}`;
		// Fill the form
		await budgetForm
			.locator(`[data-test-id="budget-radio-${budget.name}"]`)
			.click();
		await budgetForm
			.locator(`[data-test-id="${type.toLowerCase()}-radio"]`)
			.click();
		await this.page.fill('[data-test-id="description-input"]', description);
		await this.page.fill(
			'[data-test-id="amount-input"]',
			budget.amount.toString(),
		);
		await this.page.selectOption(
			'[data-test-id="currency-select"]',
			budget.currency,
		);

		// Submit and wait for response
		await budgetForm.locator('[data-test-id="submit-button"]').click();
		await this.waitForLoading();

		// Wait for and verify success message appears
		await this.page.waitForSelector('[data-test-id="success-container"]', {
			timeout: 10000,
		});
		const successMessage = await this.page
			.locator('[data-test-id="success-message"]')
			.textContent();

		return { description, successMessage };
	}

	async verifyBudgetPageComponents() {
		await expect(this.page).toHaveURL("/budget");
		await expect(
			this.page.locator('[data-test-id="budget-container"]'),
		).toBeVisible();

		await expect(
			this.page.locator('[data-test-id="budget-selection-group"]'),
		).toBeVisible();

		const budgetButtons = this.page.locator(
			'[data-test-id="budget-selection-group"] button',
		);
		await expect(budgetButtons.first()).toBeVisible();
	}

	async selectBudgetCategory(category: string) {
		await this.page
			.locator(`[data-test-id="budget-radio-${category}"]`)
			.click();
		await this.waitForLoading();
	}

	async verifyBudgetDataDisplay() {
		const isMobile = await this.isMobile();

		if (isMobile) {
			const mobileContainer = this.page.locator(
				'[data-test-id="mobile-cards"]',
			);
			await expect(mobileContainer).toBeVisible();
			return mobileContainer;
		} else {
			const desktopContainer = this.page.locator(
				'[data-test-id="desktop-table"] table',
			);
			await expect(desktopContainer).toBeVisible();
			return desktopContainer;
		}
	}

	async verifyBudgetTotals() {
		const budgetTotals = this.page.locator('[data-test-id="amount-grid"]');
		await expect(budgetTotals).toBeVisible();

		const amountItems = budgetTotals.locator('[data-test-id="amount-item"]');
		await expect(amountItems.first()).toBeVisible();

		return budgetTotals;
	}

	async getBudgetTotals(): Promise<Record<string, number>> {
		const totals: Record<string, number> = {};
		const amountItems = await this.page
			.locator('[data-test-id="amount-item"]')
			.all();

		for (const item of amountItems) {
			const text = await item.textContent();
			if (text) {
				const match = text.match(
					/([+-.])(?:(C|US|AU|HK|SG|NZ|TW|MXN)\$|€|£|¥)?([\d,]+\.\d{2})/,
				);
				if (match) {
					const sign = match[1] === "-" ? -1 : 1;
					const currency = match[2]
						? `${match[2]}$`
						: text.replace(/[^$€£¥]/g, "");
					const amount = parseFloat(match[3].replace(/,/g, ""));
					totals[currency] = sign * amount;
				}
			}
		}
		return totals;
	}

	async verifySpecificBudgetEntry(
		description: string,
		amount: string,
		_currency: string,
		date: string,
	) {
		const isMobile = await this.isMobile();

		if (isMobile) {
			const entryCard = this.page
				.locator('[data-test-id="budget-entry-card"]')
				.filter({ hasText: description });
			await expect(entryCard).toBeVisible();
			await expect(entryCard).toContainText(amount.toString());
			await expect(entryCard).toContainText(date);
		} else {
			const entryRow = this.page
				.locator("tbody tr")
				.filter({ hasText: description });
			await expect(entryRow).toBeVisible();
			await expect(entryRow.locator("td").nth(2)).toContainText(
				amount.toString(),
			);
			await expect(entryRow.locator("td").nth(0)).toContainText(date);
		}
	}

	async verifyBudgetEntryNotPresent(description: string) {
		const isMobile = await this.isMobile();

		if (isMobile) {
			const entryCards = await this.page
				.locator('[data-test-id="budget-entry-card"]')
				.filter({ hasText: description })
				.count();
			expect(entryCards).toBe(0);
		} else {
			const entryRows = await this.page
				.locator("tbody tr")
				.filter({ hasText: description })
				.count();
			expect(entryRows).toBe(0);
		}
	}

	async deleteBudgetEntry(description: string) {
		try {
			const isMobile = await this.isMobile();
			let deleteButton;

			if (isMobile) {
				const entryCard = this.page
					.locator('[data-test-id="budget-entry-card"]')
					.filter({ hasText: description });
				try {
					await entryCard.waitFor({ state: "visible", timeout: 2000 });
					deleteButton = entryCard.locator('[data-test-id="delete-button"]');
				} catch (_e) {
					return false;
				}
			} else {
				const entryRow = this.page
					.locator("tbody tr")
					.filter({ hasText: description });
				try {
					await entryRow.waitFor({ state: "visible", timeout: 2000 });
					deleteButton = entryRow.locator('[data-test-id="delete-button"]');
				} catch (_e) {
					return false;
				}
			}

			if (deleteButton) {
				try {
					await deleteButton.waitFor({ state: "visible", timeout: 2000 });
					await deleteButton.click();
				} catch (_e) {
					return false;
				}

				await this.waitForLoading();
				await this.page.waitForSelector(
					'[data-test-id="success-container"]',
					{ timeout: 10000 },
				);
				await this.page.waitForTimeout(1000);
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}
}

/**
 * Seed a single-user group with budgets named "house", "food", and "transport"
 * (matching the legacy testData.budgets fixtures), set a non-empty firstName so
 * the Dashboard form's `DashboardUserSchema` accepts the user, and navigate to
 * the home page.
 *
 * The Dashboard split logic falls back to `100 / users.length` when no
 * `defaultShare` is set in group metadata, so a single-user seed renders 100%
 * for that user without explicit defaultShare wiring.
 */
async function seedBudgetAuthedPage(
	seed: SeedFn,
	page: Page,
): Promise<SeedResponse> {
	const result = await seed({
		users: [factories.user({ alias: "u1" })],
		groups: [
			factories.group({
				alias: "g",
				members: ["u1"],
				budgets: [
					{ alias: "house", name: "house" },
					{ alias: "food", name: "food" },
					{ alias: "transport", name: "transport" },
				],
			}),
		],
		authenticate: ["u1"],
	});
	const session = result.sessions.u1;
	if (session) {
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: "u1" }),
		});
	}
	await page.goto("/");
	return result;
}

test.describe("Budget Management", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("should display budget form on home page", async ({ seed, page }) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		await budgetHelper.navigateToPage("Add");
		await page.waitForTimeout(2000);
		await expect(page).toHaveURL("/");

		// Verify budget form elements are present (single form on the page)
		const mainForm = page.locator("form");
		await expect(mainForm).toBeVisible();

		// Verify "Update Budget" checkbox is checked by default
		const updateBudgetCheckbox = mainForm.locator(
			'[data-test-id="update-budget-checkbox"]',
		);
		await expect(updateBudgetCheckbox).toBeChecked();

		// Verify budget-related elements are visible when "Update Budget" is checked
		await expect(
			mainForm.locator('[data-test-id="credit-radio"]'),
		).toBeVisible();
		await expect(
			mainForm.locator('[data-test-id="debit-radio"]'),
		).toBeVisible();
		await expect(
			mainForm.locator('[data-test-id="budget-selection-group"]'),
		).toBeVisible();
		await expect(
			mainForm.locator('[data-test-id="submit-button"]'),
		).toBeVisible();
	});

	test("should successfully add a budget credit entry", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		await budgetHelper.navigateToPage("Add");

		// Add credit entry and verify success
		const budget = { name: "house", amount: 500, currency: "USD" };
		await budgetHelper.addBudgetEntry(budget, "Credit");

		// Verify form was reset after successful submission
		await expect(page.locator('[data-test-id="amount-input"]')).toHaveValue("");

		// Verify we're still on the home page
		await expect(page).toHaveURL("/");
	});

	test("should successfully add a budget debit entry", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		await budgetHelper.navigateToPage("Add");

		// Add debit entry and verify success
		const budget = { name: "house", amount: 200, currency: "USD" };
		await budgetHelper.addBudgetEntry(budget, "Debit");

		// Verify form was reset after successful submission
		await expect(page.locator('[data-test-id="amount-input"]')).toHaveValue("");

		// Verify we're still on the home page
		await expect(page).toHaveURL("/");
	});

	test("should navigate to budget page and display budget information", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// First add some budget entries
		await budgetHelper.navigateToPage("Add");

		// Add a credit entry for house budget
		const creditBudget = { name: "house", amount: 500, currency: "USD" };
		const creditResult = await budgetHelper.addBudgetEntry(
			creditBudget,
			"Credit",
		);
		await page.waitForTimeout(2000);

		// Add a debit entry for food budget
		const debitBudget = { name: "food", amount: 150, currency: "USD" };
		const debitResult = await budgetHelper.addBudgetEntry(debitBudget, "Debit");
		await page.waitForTimeout(2000);

		// Navigate to budget page
		await budgetHelper.navigateToPage("Budget");
		await page.waitForTimeout(2000);
		await page.reload();

		// Verify budget page components
		await budgetHelper.verifyBudgetPageComponents();

		// Select house budget category to load its data
		await budgetHelper.selectBudgetCategory("house");

		// Verify budget data is displayed
		await budgetHelper.verifyBudgetDataDisplay();

		// Verify the specific house credit entry we added is visible
		const todayDate = new Date().toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "2-digit",
			year: "numeric",
		});
		await budgetHelper.verifySpecificBudgetEntry(
			creditResult.description,
			"500",
			"$",
			todayDate,
		);

		// Verify budget totals are shown
		await budgetHelper.verifyBudgetTotals();

		// Switch to food budget category and verify the debit entry we added
		await budgetHelper.selectBudgetCategory("food");
		await budgetHelper.verifyBudgetDataDisplay();

		await budgetHelper.verifySpecificBudgetEntry(
			debitResult.description,
			"150",
			"$",
			todayDate,
		);
		await budgetHelper.verifyBudgetTotals();
		await expect(page).toHaveURL("/budget");
	});

	test("should display budget totals grouped by currency", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// Add a budget entry to have data to display
		await budgetHelper.navigateToPage("Add");
		const usdBudget = { name: "house", amount: 500, currency: "USD" };
		await budgetHelper.addBudgetEntry(usdBudget, "Credit");

		// Navigate to budget page
		await budgetHelper.navigateToPage("Budget");

		await budgetHelper.verifyBudgetPageComponents();
		await budgetHelper.selectBudgetCategory("house");
		await budgetHelper.verifyBudgetTotals();
	});

	test("should show loading state during budget submission", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// Mock a delayed budget submission to assert the loading-state DOM appears.
		// The dashboard form now posts to /dashboard_submit (single endpoint that
		// can carry expense and/or budget); the legacy /budget path is kept for
		// callers outside the dashboard.
		await page.route("**/*", async (route) => {
			const url = route.request().url();
			if (
				url.includes("/.netlify/functions/dashboard_submit") ||
				url.includes("/.netlify/functions/budget")
			) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						message: "Budget submission successful",
						budgetEntryId: "be_test_123",
					}),
				});
			} else {
				route.continue();
			}
		});

		// Navigate to Add page
		await budgetHelper.navigateToPage("Add");

		const budget = { name: "transport", amount: 150, currency: "USD" };

		// Fill the form but don't submit yet
		const budgetForm = page.locator("form");
		const randomId = Math.random().toString(36).substring(2, 8);
		const timestamp = Date.now().toString().slice(-6);
		const description = `Debit for ${budget.name} ${randomId}${timestamp}`;

		// Uncheck "Add Expense" to test only budget submission
		const addExpenseCheckbox = page.locator(
			'[data-test-id="add-expense-checkbox"]',
		);
		await addExpenseCheckbox.uncheck();

		// Ensure "Update Budget" is checked
		const updateBudgetCheckbox = page.locator(
			'[data-test-id="update-budget-checkbox"]',
		);
		await updateBudgetCheckbox.check();

		await budgetForm
			.locator(`[data-test-id="budget-radio-${budget.name}"]`)
			.click();
		await budgetForm.locator('[data-test-id="debit-radio"]').click();
		await page.fill('[data-test-id="description-input"]', description);
		await page.fill('[data-test-id="amount-input"]', budget.amount.toString());
		await page.selectOption(
			'[data-test-id="currency-select"]',
			budget.currency,
		);

		// Verify initial button state
		const submitButton = budgetForm.locator('[data-test-id="submit-button"]');
		await expect(submitButton).toHaveText("Submit");
		await expect(submitButton).not.toBeDisabled();

		// Submit the form and immediately check for loading state
		await submitButton.click();

		// Check that button text changes to "Processing..."
		await expect(submitButton).toHaveText("Processing...", { timeout: 3000 });

		// Wait for submission to complete and verify success
		await page.waitForSelector('[data-test-id="success-container"]', {
			timeout: 10000,
		});
		const successMessage = await page
			.locator('[data-test-id="success-message"]')
			.textContent();
		expect(successMessage).toBeTruthy();

		// Verify button returns to normal state after completion
		await expect(submitButton).toHaveText("Submit");
		await expect(submitButton).not.toBeDisabled();

		// Verify form was reset after successful submission
		await expect(page.locator('[data-test-id="amount-input"]')).toHaveValue("");

		// Verify we're still on the home page
		await expect(page).toHaveURL("/");
	});

	test("should navigate to monthly budget page", async ({ seed, page }) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// Navigate to monthly budget page
		await budgetHelper.navigateToPage("Monthly Budget");

		// Wait for page to finish loading (either loading indicator disappears or budget selector appears)
		const loadingPromise = page
			.locator('[data-test-id="monthly-budget-loading"]')
			.waitFor({ state: "detached", timeout: 10000 });
		const selectorPromise = page
			.locator('[data-test-id="budget-selection-group"]')
			.waitFor({ state: "visible", timeout: 10000 });

		try {
			await Promise.race([loadingPromise, selectorPromise]);
		} catch {
			// Continue if either condition times out
		}

		await expect(
			page.locator('[data-test-id="budget-selection-group"]'),
		).toBeVisible();

		// Click a budget toggle button
		await page.locator('[data-test-id="budget-radio-house"]').click();
		await budgetHelper.waitForLoading();
	});

	test("should display monthly budget breakdown chart", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		await budgetHelper.navigateToPage("Monthly Budget");

		// Click a budget toggle button
		await page.locator('[data-test-id="budget-radio-house"]').click();
		await budgetHelper.waitForLoading();

		// Just verify the page loads
		await expect(
			page.locator('[data-test-id="monthly-budget-container"]'),
		).toBeVisible();
	});

	test("should handle budget deletion", async ({ seed, page }) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// First create a budget entry to delete
		await budgetHelper.navigateToPage("Add");
		const budget = { name: "house", amount: 500, currency: "USD" };
		const budgetResult = await budgetHelper.addBudgetEntry(budget, "Credit");

		// Navigate to budget page
		await budgetHelper.navigateToPage("Budget");
		await page.waitForTimeout(2000);
		await page.reload();
		await budgetHelper.verifyBudgetPageComponents();

		await budgetHelper.selectBudgetCategory("house");
		await budgetHelper.verifyBudgetDataDisplay();

		const todayDate2 = new Date().toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "2-digit",
			year: "numeric",
		});
		await budgetHelper.verifySpecificBudgetEntry(
			budgetResult.description,
			"500",
			"$",
			todayDate2,
		);

		// Attempt to delete the budget entry
		const deleteSuccess = await budgetHelper.deleteBudgetEntry(
			budgetResult.description,
		);
		expect(deleteSuccess).toBe(true);

		// Verify we're still on the budget page
		await expect(page).toHaveURL("/budget");

		// Wait for the UI to update after deletion and reload the page to ensure fresh data
		await page.waitForTimeout(1000);
		await page.reload();
		await page.waitForTimeout(2000);

		// Re-select the budget category after reload
		await budgetHelper.selectBudgetCategory("house");

		// Verify the specific entry is no longer visible
		await budgetHelper.verifyBudgetEntryNotPresent(budgetResult.description);

		await budgetHelper.verifyBudgetDataDisplay();
	});

	test("should handle budget page navigation with URL parameters", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// First add some budget data to have real data to display
		await budgetHelper.navigateToPage("Add");
		const budget = { name: "house", amount: 500, currency: "USD" };
		await budgetHelper.addBudgetEntry(budget, "Credit");

		// Navigate directly to monthly budget page with budget parameter
		await page.goto("/monthly-budget/house");

		await expect(
			page.locator('[data-test-id="monthly-budget-container"]'),
		).toBeVisible();

		await expect(
			page.locator('[data-test-id="budget-selection-group"]'),
		).toBeVisible();

		// Verify we can navigate to regular budget page as well
		await page.goto("/budget");
		await budgetHelper.verifyBudgetPageComponents();
	});

	test("should calculate budget totals correctly across multiple currencies", async ({
		seed,
		page,
	}) => {
		await seedBudgetAuthedPage(seed, page);
		const budgetHelper = new BudgetTestHelper(page);

		// 1. Navigate to the budget page and select a category
		await budgetHelper.navigateToPage("Budget");
		await budgetHelper.verifyBudgetPageComponents();
		await budgetHelper.selectBudgetCategory("house");

		// 2. Fetch the initial budget totals
		const initialTotals = await budgetHelper.getBudgetTotals();

		// 3. Add a new budget entry with a specific currency
		await budgetHelper.navigateToPage("Add");
		const newBudgetEntry = { name: "house", amount: 75.5, currency: "EUR" };
		await budgetHelper.addBudgetEntry(newBudgetEntry, "Credit");

		// 4. Navigate back to the budget page to see the updated totals
		await budgetHelper.navigateToPage("Budget");
		await budgetHelper.selectBudgetCategory("house");

		// 5. Fetch the updated budget totals
		const updatedTotals = await budgetHelper.getBudgetTotals();

		// 6. Assert that the balance for the specific currency has been updated
		const initialEurBalance = initialTotals["€"] || 0;
		const expectedEurBalance = initialEurBalance + newBudgetEntry.amount;

		expect(updatedTotals["€"]).toBeCloseTo(expectedEurBalance, 2);
	});
});
