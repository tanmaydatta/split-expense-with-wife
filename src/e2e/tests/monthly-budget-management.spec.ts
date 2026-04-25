import type { Page } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	expect,
	factories,
	skipIfRemoteBackend,
	test,
} from "../fixtures/setup";
import { TestHelper } from "../utils/test-utils";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

// Helper class for Monthly Budget operations
class MonthlyBudgetTestHelper {
	constructor(private page: Page) {}

	async navigateToMonthlyBudget(budgetId?: string) {
		const url = budgetId ? `/monthly-budget/${budgetId}` : "/monthly-budget";
		await this.page.goto(url);
		await this.waitForPageLoad();
	}

	async waitForPageLoad() {
		// Wait for either loading to complete or content to appear
		try {
			await Promise.race([
				this.page
					.locator('[data-test-id="monthly-budget-loading"]')
					.waitFor({ state: "detached", timeout: 10000 }),
				this.page
					.locator('[data-test-id="budget-selection-group"]')
					.waitFor({ state: "visible", timeout: 10000 }),
			]);
		} catch {
			// Continue if either condition times out
		}
	}

	async waitForLoading() {
		await this.page.waitForFunction(
			() => !document.querySelector(".loader"),
			undefined,
			{ timeout: 10000 },
		);
		await this.page.waitForTimeout(500);
	}

	async verifyPageStructure() {
		// Verify main container
		await expect(
			this.page.locator('[data-test-id="monthly-budget-container"]'),
		).toBeVisible();

		// Verify chart header and title
		await expect(this.page.locator(".chart-title")).toHaveText(
			"Monthly Budget Chart",
		);
	}

	async verifyTimeRangeControls() {
		const timeRanges = ["6M", "1Y", "2Y", "All"];

		for (const range of timeRanges) {
			await expect(
				this.page.locator(`[data-test-id="time-range-${range}"]`),
			).toBeVisible();
		}

		// Verify 6M is active by default
		await expect(
			this.page.locator('[data-test-id="time-range-6M"]'),
		).toHaveClass(/active/);
	}

	async selectTimeRange(range: string) {
		await this.page.locator(`[data-test-id="time-range-${range}"]`).click();
		await this.waitForLoading();
	}

	async verifyCurrencySelector(expectedCurrencies: string[]) {
		for (const currency of expectedCurrencies) {
			await expect(
				this.page.locator(`[data-test-id="currency-${currency}"]`),
			).toBeVisible();
		}
	}

	async selectCurrency(currency: string) {
		await this.page.locator(`[data-test-id="currency-${currency}"]`).click();
		await this.waitForLoading();
	}

	async verifyBudgetSelector() {
		await expect(
			this.page.locator('[data-test-id="budget-selection-group"]'),
		).toBeVisible();
	}

	async selectBudgetByName(budgetName: string) {
		await this.page
			.locator(`[data-test-id="budget-radio-${budgetName}"]`)
			.click();
		await this.waitForLoading();
		// Wait for the chart data to load after budget selection
		await this.waitForPageLoad();
	}

	async ensureBudgetIsSelected() {
		// Wait for budget selector to be available
		await this.verifyBudgetSelector();

		// Select the first available budget
		const budgetButtons = this.page.locator(
			'[data-test-id="budget-selection-group"] button',
		);
		const firstButton = budgetButtons.first();
		await firstButton.click();
		await this.waitForLoading();

		// Wait for the API call to complete and data to load
		await this.waitForPageLoad();
	}

	async verifyResponsiveDesign() {
		// Verify time range controls are always visible
		await this.verifyTimeRangeControls();
		// Verify main container is responsive
		await expect(
			this.page.locator('[data-test-id="monthly-budget-container"]'),
		).toBeVisible();
	}
}

/**
 * Seed a single-user group with a budget named "House" and a small number of
 * negative budget entries (debits) in USD and GBP so the monthly chart has
 * data to render. The handler aggregates only entries with amount < 0 for the
 * monthly chart, hence the explicit negative amounts here.
 *
 * The seed handler ignores `addedTime` on budget entries (entries are inserted
 * with the current timestamp), so all seeded entries land in the current
 * month — sufficient for verifying chart presence, currency selectors, and
 * navigation flows. Tests that require multi-month data or empty datasets are
 * skipped with TODOs.
 */
async function seedMonthlyBudgetPage(
	seed: SeedFn,
	page: Page,
): Promise<SeedResponse> {
	const result = await seed({
		users: [factories.user({ alias: "u1" })],
		groups: [
			factories.group({
				alias: "g",
				members: ["u1"],
				budgets: [{ alias: "house", name: "House" }],
			}),
		],
		budgetEntries: [
			factories.budgetEntry({
				alias: "be1",
				group: "g",
				budget: "house",
				amount: -100,
				currency: "USD",
				description: "USD entry 1",
			}),
			factories.budgetEntry({
				alias: "be2",
				group: "g",
				budget: "house",
				amount: -50,
				currency: "GBP",
				description: "GBP entry 1",
			}),
		],
		authenticate: ["u1"],
	});
	await page.goto("/");
	return result;
}

test.describe("Monthly Budget Management", () => {
	test.beforeAll(skipIfRemoteBackend);

	test.describe("Navigation & Page Structure", () => {
		test("should navigate to monthly budget page from sidebar", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);
			const testHelper = new TestHelper(page);

			await testHelper.navigateToPage("Monthly Budget");
			await helper.verifyPageStructure();
			await helper.verifyBudgetSelector();
		});

		test("should handle URL parameter with budget ID", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			// Navigate by name route — even with no matching id the page falls back
			// to first available budget from session metadata.
			await helper.navigateToMonthlyBudget("house");
			await helper.verifyPageStructure();
		});

		// TODO(fixtures): The legacy version mocked a 1-second delayed API
		// response to assert the loading-state DOM appears. With the seed-based
		// fixtures the backend responds normally; we have no hook to inject a
		// per-request delay. Re-enable when seed-time API delays are supported.
		test.skip("should display loading state during data fetch", async () => {});

		// TODO(fixtures): The legacy version mocked an empty `monthlyBudgets`
		// array to force the no-data branch. The real handler always generates
		// month rows from the oldest entry (or 2 years back as a default), so
		// `monthlyBudgets` is never empty in practice. Re-enable if the handler
		// changes to return an empty array when no entries exist.
		test.skip(
			"should display no data message when API returns empty results",
			async () => {},
		);
	});

	test.describe("Time Range Controls", () => {
		test("should display all time range buttons", async ({ seed, page }) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.verifyTimeRangeControls();
		});

		test("should switch between different time ranges", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();

			// Test each time range
			const timeRanges = ["1Y", "2Y", "All", "6M"];

			for (const range of timeRanges) {
				await helper.selectTimeRange(range);

				// Verify the selected range is active
				await expect(
					page.locator(`[data-test-id="time-range-${range}"]`),
				).toHaveClass(/active/);
			}
		});
	});

	test.describe("Currency Management", () => {
		test("should display available currencies from data", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();
			// Both USD and GBP entries are seeded above; both should appear in the
			// currency selector once the budget is active.
			await helper.verifyCurrencySelector(["USD", "GBP"]);
		});

		test("should switch between different currencies", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();

			// Test switching currencies
			await helper.selectCurrency("GBP");
			await expect(
				page.locator('[data-test-id="currency-GBP"]'),
			).toHaveClass(/active/);

			await helper.selectCurrency("USD");
			await expect(
				page.locator('[data-test-id="currency-USD"]'),
			).toHaveClass(/active/);
		});
	});

	test.describe("Budget Selection", () => {
		test("should display budget selector", async ({ seed, page }) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.verifyBudgetSelector();
		});

		test("should switch between different budgets", async ({ seed, page }) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();

			// Select the first available budget
			await helper.ensureBudgetIsSelected();
			await helper.verifyPageStructure();
		});

		test("should update URL when budget selection changes", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();

			// Verify URL contains a budget ID (not hardcoded since IDs are dynamic)
			await expect(page).toHaveURL(/\/monthly-budget\/.+/);
		});
	});

	test.describe("Chart Display", () => {
		test("should display chart area when budget is selected", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.verifyBudgetSelector();
			await helper.ensureBudgetIsSelected();

			// Verify chart container appears (even if no data)
			await expect(
				page.locator('[data-test-id="monthly-budget-container"]'),
			).toBeVisible();
		});

		test("should show proper currency formatting in selector", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();
			await helper.selectCurrency("USD");

			// Currency symbol should be visible in the interface
			await expect(
				page.locator('[data-test-id="currency-USD"]'),
			).toContainText("$");
		});
	});

	test.describe("Responsive Design", () => {
		test("should work correctly on desktop viewport", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			// Set desktop viewport
			await page.setViewportSize({ width: 1024, height: 768 });

			await helper.navigateToMonthlyBudget();
			await helper.verifyResponsiveDesign();
		});

		test("should work correctly on mobile viewport", async ({ seed, page }) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			// Set mobile viewport
			await page.setViewportSize({ width: 375, height: 667 });

			await helper.navigateToMonthlyBudget();
			await helper.verifyResponsiveDesign();
		});
	});

	test.describe("Error Handling", () => {
		// TODO(fixtures): The legacy version mocked a 500 from the budget_monthly
		// endpoint to assert graceful UI handling. The seed-based flow has no
		// per-test failure injection hook. Re-enable if seed supports forced
		// errors, or convert to a unit test of the page component.
		test.skip("should handle API errors gracefully", async () => {});

		test("should handle invalid budget ID in URL", async ({ seed, page }) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget("invalid-budget-id");

			// Should still load the page and show available budgets
			await helper.verifyPageStructure();
			await helper.verifyBudgetSelector();
		});
	});

	test.describe("Integration Tests", () => {
		test("should maintain state when switching between time ranges and currencies", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();

			// Select budget first (use the seeded "House" budget)
			await helper.selectBudgetByName("House");

			// Switch time range
			await helper.selectTimeRange("1Y");

			// Switch currency
			await helper.selectCurrency("GBP");

			// Verify all selections are maintained
			await expect(
				page.locator('[data-test-id="time-range-1Y"]'),
			).toHaveClass(/active/);

			await expect(
				page.locator('[data-test-id="currency-GBP"]'),
			).toHaveClass(/active/);
		});

		test("should persist budget selection across page refresh", async ({
			seed,
			page,
		}) => {
			await seedMonthlyBudgetPage(seed, page);
			const helper = new MonthlyBudgetTestHelper(page);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();

			// Get the current URL with budget ID
			const currentUrl = page.url();

			// Refresh the page
			await page.reload();
			await helper.waitForPageLoad();

			// Should still show the same URL with budget ID
			await expect(page).toHaveURL(currentUrl);
		});
	});
});
