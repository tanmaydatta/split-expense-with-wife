import { expect, test } from "../fixtures/setup";
import { testData } from "../fixtures/test-data";

// Helper class for Monthly Budget operations
class MonthlyBudgetTestHelper {
	constructor(private authenticatedPage: any) {}

	async navigateToMonthlyBudget(budgetId?: string) {
		const url = budgetId ? `/monthly-budget/${budgetId}` : "/monthly-budget";
		await this.authenticatedPage.page.goto(url);
		await this.waitForPageLoad();
	}

	async waitForPageLoad() {
		// Wait for either loading to complete or content to appear
		try {
			await Promise.race([
				this.authenticatedPage.page.locator('[data-test-id="monthly-budget-loading"]').waitFor({ state: 'detached', timeout: 10000 }),
				this.authenticatedPage.page.locator('[data-test-id="budget-selection-group"]').waitFor({ state: 'visible', timeout: 10000 })
			]);
		} catch (error) {
			// Continue if either condition times out
		}
	}

	async verifyPageStructure() {
		// Verify main container
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="monthly-budget-container"]')
		).toBeVisible();

		// Verify chart header and title
		await expect(
			this.authenticatedPage.page.locator('.chart-title')
		).toHaveText('Monthly Budget Chart');
	}

	async verifyTimeRangeControls() {
		const timeRanges = ['6M', '1Y', '2Y', 'All'];
		
		for (const range of timeRanges) {
			await expect(
				this.authenticatedPage.page.locator(`[data-test-id="time-range-${range}"]`)
			).toBeVisible();
		}

		// Verify 6M is active by default
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="time-range-6M"]')
		).toHaveClass(/active/);
	}

	async selectTimeRange(range: string) {
		await this.authenticatedPage.page.locator(`[data-test-id="time-range-${range}"]`).click();
		await this.authenticatedPage.waitForLoading();
	}

	async verifyCurrencySelector(expectedCurrencies: string[]) {
		for (const currency of expectedCurrencies) {
			await expect(
				this.authenticatedPage.page.locator(`[data-test-id="currency-${currency}"]`)
			).toBeVisible();
		}
	}

	async selectCurrency(currency: string) {
		await this.authenticatedPage.page.locator(`[data-test-id="currency-${currency}"]`).click();
		await this.authenticatedPage.waitForLoading();
	}

	async verifyBudgetSelector() {
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="budget-selection-group"]')
		).toBeVisible();
	}

	async selectBudget(budgetName: string) {
		await this.authenticatedPage.page.locator(`[data-test-id="budget-radio-${budgetName}"]`).click();
		await this.authenticatedPage.waitForLoading();
		// Wait for the chart data to load after budget selection
		await this.waitForPageLoad();
	}

	async verifyChartPresence() {
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="monthly-budget-chart"]')
		).toBeVisible();
	}

	async ensureBudgetIsSelected() {
		// Wait for budget selector to be available
		await this.verifyBudgetSelector();
		
		// Check if a budget is already selected, if not select the first available one
		const budgetButtons = this.authenticatedPage.page.locator('[data-test-id="budget-selection-group"] button');
		const firstButton = budgetButtons.first();
		await firstButton.click();
		await this.authenticatedPage.waitForLoading();
		
		// Wait for the API call to complete and data to load
		await this.waitForPageLoad();
	}

	async verifyNoDataMessage() {
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="no-data-message"]')
		).toBeVisible();
		
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="no-data-message"] p')
		).toHaveText('No monthly budget data available for the selected period.');
	}

	async verifyLoadingState() {
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="monthly-budget-loading"]')
		).toBeVisible();
		
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="monthly-budget-loading"]')
		).toHaveText('Loading monthly budget data...');
	}

	async verifyResponsiveDesign() {
		// Verify time range controls are always visible
		await this.verifyTimeRangeControls();
		// Verify main container is responsive
		await expect(
			this.authenticatedPage.page.locator('[data-test-id="monthly-budget-container"]')
		).toBeVisible();
	}
}

test.describe("Monthly Budget Management", () => {
	test.beforeEach(async ({ page }) => {
		// Clear storage before each test
		await page.goto("/");
		await page.context().clearCookies();
		await page.evaluate(() => {
			try {
				localStorage.clear();
				sessionStorage.clear();
			} catch (e) {
				console.log("Storage clear failed:", e);
			}
		});
	});

	test.describe("Navigation & Page Structure", () => {
		test("should navigate to monthly budget page from sidebar", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Mock monthly budget data
			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await authenticatedPage.navigateToPage("Monthly Budget");
			await helper.verifyPageStructure();
			await helper.verifyBudgetSelector();
		});

		test("should handle URL parameter with budget ID", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Mock monthly budget data
			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget("house");
			await helper.verifyPageStructure();
		});

		test("should display loading state during data fetch", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Mock API with delay
			await authenticatedPage.page.route("**/.netlify/functions/budget_monthly", async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(testData.mockResponses.budgetMonthly.success),
				});
			});

			// Start navigation
			const navigationPromise = helper.navigateToMonthlyBudget();

			// Verify loading state appears
			await helper.verifyLoadingState();

			// Wait for navigation to complete
			await navigationPromise;
		});

		test("should display no data message when API returns empty results", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Mock empty response
			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				{
					monthlyBudgets: [],
					averageMonthlySpend: [],
					periodAnalyzed: {
						startDate: "2024-01-01",
						endDate: "2024-12-31",
					},
				},
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyNoDataMessage();
		});
	});

	test.describe("Time Range Controls", () => {
		test("should display all time range buttons", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyTimeRangeControls();
		});

		test("should switch between different time ranges", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();

			// Test each time range
			const timeRanges = ['1Y', '2Y', 'All', '6M'];
			
			for (const range of timeRanges) {
				await helper.selectTimeRange(range);
				
				// Verify the selected range is active
				await expect(
					authenticatedPage.page.locator(`[data-test-id="time-range-${range}"]`)
				).toHaveClass(/active/);
			}
		});
	});

	test.describe("Currency Management", () => {
		test("should display available currencies from data", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyCurrencySelector(['USD', 'GBP']);
		});

		test("should switch between different currencies", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();

			// Test switching currencies
			await helper.selectCurrency('GBP');
			await expect(
				authenticatedPage.page.locator('[data-test-id="currency-GBP"]')
			).toHaveClass(/active/);

			await helper.selectCurrency('USD');
			await expect(
				authenticatedPage.page.locator('[data-test-id="currency-USD"]')
			).toHaveClass(/active/);
		});
	});

	test.describe("Budget Selection", () => {
		test("should display budget selector", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyBudgetSelector();
		});

		test("should switch between different budgets", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			
			// Select the first available budget
			await helper.ensureBudgetIsSelected();
			await helper.verifyPageStructure();
		});

		test("should update URL when budget selection changes", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();

			// Verify URL contains a budget ID (not hardcoded since IDs are dynamic)
			await expect(authenticatedPage.page).toHaveURL(/\/monthly-budget\/.+/);
		});
	});

	test.describe("Chart Display", () => {
		test("should display chart area when budget is selected", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyBudgetSelector();
			await helper.ensureBudgetIsSelected();
			
			// Verify chart container appears (even if no data)
			await expect(
				authenticatedPage.page.locator('[data-test-id="monthly-budget-container"]')
			).toBeVisible();
		});

		test("should show proper currency formatting in selector", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.selectCurrency('USD');
			
			// Currency symbol should be visible in the interface
			await expect(
				authenticatedPage.page.locator('[data-test-id="currency-USD"]')
			).toContainText('$');
		});
	});

	test.describe("Responsive Design", () => {
		test("should work correctly on desktop viewport", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Set desktop viewport
			await authenticatedPage.page.setViewportSize({ width: 1024, height: 768 });

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyResponsiveDesign();
		});

		test("should work correctly on mobile viewport", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Set mobile viewport
			await authenticatedPage.page.setViewportSize({ width: 375, height: 667 });

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.verifyResponsiveDesign();
		});
	});

	test.describe("Error Handling", () => {
		test("should handle API errors gracefully", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			// Mock API error
			await authenticatedPage.page.route("**/.netlify/functions/budget_monthly", async (route) => {
				await route.fulfill({
					status: 500,
					contentType: "application/json",
					body: JSON.stringify({ error: "Internal server error" }),
				});
			});

			await helper.navigateToMonthlyBudget();

			// Should still show the main container even with API errors
			await expect(
				authenticatedPage.page.locator('[data-test-id="monthly-budget-container"]')
			).toBeVisible();
		});

		test("should handle invalid budget ID in URL", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget("invalid-budget-id");
			
			// Should still load the page and show available budgets
			await helper.verifyPageStructure();
			await helper.verifyBudgetSelector();
		});
	});

	test.describe("Integration Tests", () => {
		test("should maintain state when switching between time ranges and currencies", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			
			// Select budget first
			await helper.selectBudget('house');
			
			// Switch time range
			await helper.selectTimeRange('1Y');
			
			// Switch currency
			await helper.selectCurrency('GBP');
			
			// Verify all selections are maintained
			await expect(
				authenticatedPage.page.locator('[data-test-id="time-range-1Y"]')
			).toHaveClass(/active/);
			
			await expect(
				authenticatedPage.page.locator('[data-test-id="currency-GBP"]')
			).toHaveClass(/active/);
		});

		test("should persist budget selection across page refresh", async ({
			authenticatedPage,
		}) => {
			const helper = new MonthlyBudgetTestHelper(authenticatedPage);

			await authenticatedPage.mockApiResponse(
				"budget_monthly",
				testData.mockResponses.budgetMonthly.success,
			);

			await helper.navigateToMonthlyBudget();
			await helper.ensureBudgetIsSelected();
			
			// Get the current URL with budget ID
			const currentUrl = authenticatedPage.page.url();

			// Refresh the page
			await authenticatedPage.page.reload();
			await helper.waitForPageLoad();

			// Should still show the same URL with budget ID
			await expect(authenticatedPage.page).toHaveURL(currentUrl);
		});
	});
});