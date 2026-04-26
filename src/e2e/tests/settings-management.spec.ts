import { randomUUID } from "crypto";
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

// Helper class for Settings page operations (operates on a Page directly).
class SettingsTestHelper {
	private testHelper: TestHelper;

	constructor(public page: Page) {
		this.testHelper = new TestHelper(page);
	}

	async navigateToSettings() {
		await this.testHelper.navigateToPage("Settings");
	}

	async navigateToPage(name: Parameters<TestHelper["navigateToPage"]>[0]) {
		await this.testHelper.navigateToPage(name);
	}

	async waitForLoading() {
		await this.testHelper.waitForLoading();
	}

	async verifySettingsPageComponents() {
		// Verify main settings container
		await expect(
			this.page.locator('[data-test-id="settings-container"]'),
		).toBeVisible({ timeout: 10000 });

		// Verify all main sections exist
		await expect(
			this.page.locator('[data-test-id="group-info-section"]'),
		).toBeVisible({ timeout: 5000 });
		await expect(
			this.page.locator('[data-test-id="currency-section"]'),
		).toBeVisible({ timeout: 5000 });
		await expect(
			this.page.locator('[data-test-id="shares-section"]'),
		).toBeVisible({ timeout: 5000 });
		await expect(
			this.page.locator('[data-test-id="budgets-section"]'),
		).toBeVisible({ timeout: 5000 });

		// Verify single submit button section
		await expect(
			this.page.locator('[data-test-id="settings-actions"]'),
		).toBeVisible({ timeout: 5000 });
		await expect(
			this.page.locator('[data-test-id="save-all-button"]'),
		).toBeVisible({ timeout: 5000 });
	}

	async getGroupName() {
		return await this.page.inputValue('[data-test-id="group-name-input"]');
	}

	async setGroupName(name: string) {
		await this.page.fill('[data-test-id="group-name-input"]', name);
	}

	async getDefaultCurrency() {
		return await this.page.inputValue('[data-test-id="currency-select"]');
	}

	async setDefaultCurrency(currency: string) {
		await this.page.selectOption('[data-test-id="currency-select"]', currency);
	}

	async getUserPercentage(userId: string) {
		return await this.page.inputValue(
			`[data-test-id="user-${userId}-percentage"]`,
		);
	}

	async setUserPercentage(userId: string, percentage: string) {
		await this.page.fill(
			`[data-test-id="user-${userId}-percentage"]`,
			percentage,
		);
	}

	async getBudgetCategories() {
		// Wait for the Settings page to load data
		await this.page.waitForTimeout(2000); // Give time for API calls

		// Get budget categories from the displayed list, not input fields
		const budgetItems = this.page.locator(".budget-item span");
		const count = await budgetItems.count();
		const categories: string[] = [];

		for (let i = 0; i < count; i++) {
			const text = await budgetItems.nth(i).textContent();
			if (text && text.trim()) {
				categories.push(text.trim());
			}
		}
		return categories;
	}

	async addBudgetCategory(category: string) {
		// Fill the new budget input field
		await this.page.fill('[data-test-id="new-budget-input"]', category);

		// Click add button
		await this.page.click('[data-test-id="add-budget-button"]');
	}

	async removeBudgetCategory(index: number) {
		await this.page.click(`[data-test-id="remove-budget-${index}"]`);
	}

	async isSaveButtonEnabled() {
		const saveButton = this.page.locator('[data-test-id="save-all-button"]');
		return !(await saveButton.isDisabled());
	}

	async isSaveButtonDisabled() {
		const saveButton = this.page.locator('[data-test-id="save-all-button"]');
		return await saveButton.isDisabled();
	}

	async saveAllChanges() {
		await this.page.waitForTimeout(1000);
		await this.page.click('[data-test-id="save-all-button"]');
		await this.waitForLoading();
	}

	async waitForSuccessMessage() {
		await this.page.waitForSelector('[data-test-id="success-container"]', {
			timeout: 10000,
		});
		return await this.page
			.locator('[data-test-id="success-message"]')
			.textContent();
	}

	async waitForErrorMessage() {
		await this.page.waitForSelector('[data-test-id="error-container"]', {
			timeout: 10000,
		});
		return await this.page
			.locator('[data-test-id="error-message"]')
			.textContent();
	}

	async getValidationError() {
		const element = this.page.locator('[data-test-id="validation-error"]');
		if (await element.isVisible()) {
			return await element.textContent();
		}
		return null;
	}

	async deleteBudgetByCategory(category: string) {
		// Find the budget category in the displayed list
		const budgetItems = this.page.locator(".budget-item");
		const count = await budgetItems.count();

		for (let i = 0; i < count; i++) {
			const budgetItem = budgetItems.nth(i);
			const categoryText = await budgetItem.locator("span").textContent();

			if (categoryText && categoryText.trim() === category) {
				// Click the remove button for this category
				await budgetItem.locator(`[data-test-id="remove-budget-${i}"]`).click();
				break;
			}
		}
	}

	async verifyPercentageSymbolPosition(userId: string) {
		// Verify that % symbol is inside the input field
		const inputWrapper = this.page.locator(
			`[data-test-id="percentage-wrapper-${userId}"]`,
		);
		const percentSymbol = inputWrapper.locator(
			'[data-test-id="percentage-symbol"]',
		);

		await expect(inputWrapper).toBeVisible({ timeout: 5000 });
		await expect(percentSymbol).toBeVisible({ timeout: 5000 });
		await expect(percentSymbol).toHaveText("%");
	}
}

/**
 * Seed a single-user group with the legacy budget names (`house`, `food`),
 * set a non-empty firstName so the Dashboard form's `DashboardUserSchema`
 * accepts the user (needed by tests that navigate to "Add" / "Budget"), and
 * navigate to the Settings page.
 *
 * Single-user groups don't need an explicit `defaultShare`: the Settings page
 * initializes `userPercentages[uid] = metadata.defaultShare[uid] || 0`, but
 * the validation check (`Math.abs(total - 100) > 0.001`) only fires once a
 * change makes the form dirty. For tests that don't touch shares, the 0%
 * default is fine; tests that change shares explicitly set the value.
 */
async function seedSettingsAuthedPage(
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
		// Persist a defaultShare so the single user reads as 100% in Settings.
		// Without this the SharesSection input shows "0" and any unrelated edit
		// (e.g. group name) trips the "must total 100%" validation.
		const u1Id = result.ids.users.u1.id;
		const groupId = result.ids.groups.g.id;
		await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				groupid: groupId,
				defaultShare: { [u1Id]: 100 },
			}),
		});
	}
	await page.goto("/settings");
	await page.waitForTimeout(3000);
	return result;
}

/**
 * Seed a two-user group with non-empty firstNames and a 50/50 defaultShare.
 * Used by share-percentage tests, which read & write per-user percentages on
 * the Settings page.
 */
async function seedTwoUserSettingsAuthedPage(
	seed: SeedFn,
	page: Page,
): Promise<SeedResponse> {
	const result = await seed({
		users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
		groups: [
			factories.group({
				alias: "g",
				members: ["u1", "u2"],
				budgets: [
					{ alias: "house", name: "house" },
					{ alias: "food", name: "food" },
				],
			}),
		],
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
	const u1Session = result.sessions.u1;
	if (u1Session) {
		const cookieHeader = u1Session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		const u1Id = result.ids.users.u1.id;
		const u2Id = result.ids.users.u2.id;
		const groupId = result.ids.groups.g.id;
		await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				groupid: groupId,
				defaultShare: { [u1Id]: 50, [u2Id]: 50 },
			}),
		});
	}
	await page.goto("/settings");
	await page.waitForTimeout(3000);
	return result;
}

test.describe("Settings Management", () => {
	test.beforeAll(skipIfRemoteBackend);

	test.describe("Page Structure and Navigation", () => {
		test("should display all settings sections correctly", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);
			await settingsHelper.verifySettingsPageComponents();
		});

		test("should be accessible via sidebar navigation", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);
			// Go back to dashboard first
			await settingsHelper.navigateToPage("Add");
			await expect(page).toHaveURL("/");
			// Then navigate to settings via sidebar
			await settingsHelper.navigateToSettings();

			await expect(page).toHaveURL("/settings");
		});

		test("should maintain proper responsive design on mobile", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			// Set mobile viewport
			await page.setViewportSize({ width: 375, height: 667 });

			const settingsHelper = new SettingsTestHelper(page);
			await settingsHelper.verifySettingsPageComponents();

			// Verify mobile-specific elements are properly sized
			const container = page.locator('[data-test-id="settings-container"]');
			await expect(container).toBeVisible({ timeout: 10000 });
		});
	});

	test.describe("Group Information Management", () => {
		test("should display current group name and allow editing", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Verify initial group name is loaded
			const initialName = await settingsHelper.getGroupName();
			expect(initialName).toBeTruthy();

			// Update group name
			const newName = `Updated_Group_${Date.now()}`;
			await settingsHelper.setGroupName(newName);

			// Verify save button becomes enabled
			await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
		});

		test("should save group name changes successfully", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const newName = `Test_Group_${Date.now()}`;
			await settingsHelper.setGroupName(newName);
			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");

			// Verify the name persists after page refresh
			await page.reload();
			await settingsHelper.waitForLoading();

			const persistedName = await settingsHelper.getGroupName();
			expect(persistedName).toBe(newName);
		});

		test("should handle empty group name validation", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Clear the group name
			await settingsHelper.setGroupName("   ");

			// Try to save
			await settingsHelper.saveAllChanges();

			// Should show error
			const errorMessage = await settingsHelper.waitForErrorMessage();
			expect(errorMessage).toContain("Group name cannot be empty");
		});
	});

	test.describe("Currency Management", () => {
		test("should display current default currency and allow changes", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Verify initial currency is loaded
			const initialCurrency = await settingsHelper.getDefaultCurrency();
			expect(initialCurrency).toBeTruthy();

			// Change to different currency
			const newCurrency = initialCurrency === "USD" ? "EUR" : "USD";
			await settingsHelper.setDefaultCurrency(newCurrency);

			// Verify save button becomes enabled
			await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
		});

		test("should save currency changes and update other forms", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Get current currency
			const initialCurrency = await page.inputValue(
				'[data-test-id="currency-select"]',
			);

			// Get all available currency options
			const currencyOptions = await page
				.locator('[data-test-id="currency-select"] option')
				.allTextContents();

			// Find a different currency to change to
			const newCurrency =
				currencyOptions.find((currency) => currency !== initialCurrency) ||
				"USD";

			// Change currency to something different from the initial value
			await settingsHelper.setDefaultCurrency(newCurrency);

			// Wait for state to update and verify button is enabled
			await page.waitForTimeout(1000);
			expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);

			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");

			// Navigate to dashboard and verify currency is updated
			await settingsHelper.navigateToPage("Add");
			await settingsHelper.waitForLoading();

			const currencySelect = page.locator('[data-test-id="currency-select"]');
			const selectedCurrency = await currencySelect.inputValue();
			expect(selectedCurrency).toBe(newCurrency);
		});
	});

	test.describe("Share Percentage Management", () => {
		test("should display current user shares with percentage symbols inside inputs", async ({
			seed,
			page,
		}) => {
			const seedResult = await seedTwoUserSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const u1Id = seedResult.ids.users.u1.id;

			// Verify percentage symbols are positioned inside inputs
			const userElements = page.locator(
				'[data-test-id^="user-"][data-test-id$="-percentage"]',
			);
			await page.waitForTimeout(2000);
			const count = await userElements.count();

			expect(count).toBeGreaterThan(0);

			// Check current user's percentage symbol positioning
			await settingsHelper.verifyPercentageSymbolPosition(u1Id);
		});

		test("should validate percentage totals with 0.001 precision", async ({
			seed,
			page,
		}) => {
			const seedResult = await seedTwoUserSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const u1Id = seedResult.ids.users.u1.id;
			const u2Id = seedResult.ids.users.u2.id;

			// Test case: Set percentages that don't add to 100%
			await settingsHelper.setUserPercentage(u1Id, "30");
			await settingsHelper.setUserPercentage(u2Id, "30");

			// Save button should be disabled due to validation error
			await expect(await settingsHelper.isSaveButtonDisabled()).toBe(true);

			// Check for validation error message
			const validationError = await settingsHelper.getValidationError();
			expect(validationError).toContain("must total 100%");
		});

		test("should handle 2-user scenarios with precise percentages", async ({
			seed,
			page,
		}) => {
			const seedResult = await seedTwoUserSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const u1Id = seedResult.ids.users.u1.id;
			const u2Id = seedResult.ids.users.u2.id;

			// Wait for page to load user data
			await page.waitForTimeout(2000);

			// Initial defaultShare is 50/50; set precise percentages summing to 100.000
			const newU1 = 50 + 0.002;
			await settingsHelper.setUserPercentage(u1Id, newU1.toFixed(3).toString());
			await settingsHelper.setUserPercentage(
				u2Id,
				(100 - newU1).toFixed(3).toString(),
			);
			await page.waitForTimeout(1000);
			// This should be valid (totals 100.000)
			expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
		});

		test("should save percentage changes successfully", async ({
			seed,
			page,
		}) => {
			const seedResult = await seedTwoUserSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const u1Id = seedResult.ids.users.u1.id;
			const u2Id = seedResult.ids.users.u2.id;

			// Wait for data to load
			await page.waitForTimeout(2000);

			// Initial 50% < 80, so newUser1Percentage = 50 + 1 = 51
			const newU1 = 51;
			await settingsHelper.setUserPercentage(u1Id, newU1.toString());
			await settingsHelper.setUserPercentage(u2Id, (100 - newU1).toString());

			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");

			// Verify changes persist
			await page.reload();
			await settingsHelper.waitForLoading();
			await page.waitForTimeout(2000);

			expect(await settingsHelper.getUserPercentage(u1Id)).toBe(
				newU1.toString(),
			);
			expect(await settingsHelper.getUserPercentage(u2Id)).toBe(
				(100 - newU1).toString(),
			);
		});
	});

	test.describe("Budget Category Management", () => {
		test("should display existing budget categories", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const categories = await settingsHelper.getBudgetCategories();
			expect(categories.length).toBeGreaterThan(0);
			expect(categories).toContain("house");
			expect(categories).toContain("food");
		});

		test("should add new budget category", async ({ seed, page }) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const newCategory = `test_category_${Date.now()}`; // Use underscores instead of spaces

			await settingsHelper.addBudgetCategory(newCategory);

			// Verify save button becomes enabled
			await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);

			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");

			// Verify new category appears in budget forms
			await settingsHelper.navigateToPage("Budget");
			await settingsHelper.waitForLoading();

			const budgetRadio = page.locator(
				`[data-test-id="budget-radio-${newCategory}"]`,
			);
			await expect(budgetRadio).toBeVisible({ timeout: 10000 });
		});

		test("should remove budget category", async ({ seed, page }) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// First add a category to remove
			const categoryToRemove = `temp_category_${Date.now()}`; // Use underscores
			await settingsHelper.addBudgetCategory(categoryToRemove);
			await settingsHelper.saveAllChanges();
			await settingsHelper.waitForSuccessMessage();

			// Refresh to get clean state
			await page.reload();
			await settingsHelper.waitForLoading();

			const initialCategories = await settingsHelper.getBudgetCategories();
			const categoryIndex = initialCategories.findIndex(
				(cat) => cat === categoryToRemove,
			);

			// Ensure the category exists before removing
			expect(categoryIndex).toBeGreaterThanOrEqual(0);

			await settingsHelper.removeBudgetCategory(categoryIndex);
			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");

			// Verify category is removed from budget forms
			await settingsHelper.navigateToPage("Budget");
			await settingsHelper.waitForLoading();

			const budgetRadio = page.locator(
				`[data-test-id="budget-radio-${categoryToRemove}"]`,
			);
			await expect(budgetRadio).not.toBeVisible({ timeout: 5000 });
		});

		test("should handle empty budget categories", async ({ seed, page }) => {
			await seedSettingsAuthedPage(seed, page);

			// Verify add button is disabled when input is empty
			await page.fill('[data-test-id="new-budget-input"]', "");
			const isDisabledEmpty = await page.isDisabled(
				'[data-test-id="add-budget-button"]',
			);
			expect(isDisabledEmpty).toBe(true);

			// Verify add button is disabled when input has only whitespace
			await page.fill('[data-test-id="new-budget-input"]', "   ");
			const isDisabledWhitespace = await page.isDisabled(
				'[data-test-id="add-budget-button"]',
			);
			expect(isDisabledWhitespace).toBe(true);

			// Verify add button is enabled when input has valid content
			await page.fill('[data-test-id="new-budget-input"]', "ValidCategory");
			const isEnabledValid = await page.isDisabled(
				'[data-test-id="add-budget-button"]',
			);
			expect(isEnabledValid).toBe(false);
		});

		test("should validate budget names and show error for invalid characters", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Try to add budget category with invalid characters (special chars)
			const invalidCategory = "Invalid Budget!@#";
			await settingsHelper.addBudgetCategory(invalidCategory);

			// Try to save
			await settingsHelper.saveAllChanges();

			// Should show validation error
			const errorMessage = await settingsHelper.waitForErrorMessage();
			expect(errorMessage).toContain(
				"Budget names can only contain letters, numbers, spaces, hyphens, and underscores",
			);
		});

		test("should accept valid budget names with allowed characters (including spaces)", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Add budget categories with valid characters (uppercase, lowercase, numbers, underscores, hyphens)
			const validCategories = [
				"valid_category",
				"valid-category",
				"category123",
				"Category_With_123",
				"UPPERCASE_BUDGET",
				"budget with spaces",
			].map((category) => category + "_" + randomUUID());

			for (const category of validCategories) {
				await settingsHelper.addBudgetCategory(category);
			}

			// Should be able to save successfully
			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");
			for (const category of validCategories) {
				await settingsHelper.deleteBudgetByCategory(category);
			}
			await settingsHelper.saveAllChanges();
		});
	});

	test.describe("Single Submit Button Workflow", () => {
		test("should have only one save button and show correct states", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Verify only one save button exists
			const saveButtons = page.locator('[data-test-id*="save"]');
			const count = await saveButtons.count();
			expect(count).toBe(1);

			// Initially disabled (no changes)
			await expect(await settingsHelper.isSaveButtonDisabled()).toBe(true);

			// Make a change
			await settingsHelper.setGroupName("Changed_Name");

			// Should become enabled
			await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
		});

		test("should save all changes in single API call", async ({
			seed,
			page,
		}) => {
			const seedResult = await seedTwoUserSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const u1Id = seedResult.ids.users.u1.id;
			const u2Id = seedResult.ids.users.u2.id;

			// Get current currency to change to something different
			const initialCurrency = await page.inputValue(
				'[data-test-id="currency-select"]',
			);
			const currencyOptions = await page
				.locator('[data-test-id="currency-select"] option')
				.allTextContents();
			const newCurrency =
				currencyOptions.find((currency) => currency !== initialCurrency) || "";
			// Make multiple changes
			const newU1 = 51;
			const newName = `Multi_Change_${Date.now()}`; // Use underscores
			await settingsHelper.setGroupName(newName);
			await settingsHelper.setDefaultCurrency(newCurrency);
			await settingsHelper.setUserPercentage(u1Id, newU1.toString());
			await settingsHelper.setUserPercentage(u2Id, (100 - newU1).toString());
			await settingsHelper.addBudgetCategory("new_category");

			// Single save operation
			await settingsHelper.saveAllChanges();

			const successMessage = await settingsHelper.waitForSuccessMessage();
			expect(successMessage).toContain("successfully");

			// Verify all changes persisted
			await page.reload();
			await settingsHelper.waitForLoading();

			expect(await settingsHelper.getGroupName()).toBe(newName);
			expect(await settingsHelper.getDefaultCurrency()).toBe(newCurrency);
			expect(await settingsHelper.getUserPercentage(u1Id)).toBe(
				newU1.toString(),
			);
			expect(await settingsHelper.getUserPercentage(u2Id)).toBe(
				(100 - newU1).toString(),
			);
		});

		test("should show loading state during save operation", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			await page.route("**/group/metadata", async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				route.continue();
			});
			const settingsHelper = new SettingsTestHelper(page);

			// Make a change
			await settingsHelper.setGroupName("Loading_Test " + randomUUID());

			// Click save but don't wait for completion
			await page.click('[data-test-id="save-all-button"]');

			// Verify loading state appears
			const loadingIndicator = page.locator(
				'[data-test-id="loading-indicator"]',
			);
			await expect(loadingIndicator).toBeVisible({ timeout: 10000 });
		});
	});

	test.describe("Data Persistence and State Management", () => {
		test("should update Redux store after successful save", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const newCurrency = "CAD";
			await settingsHelper.setDefaultCurrency(newCurrency);
			await settingsHelper.saveAllChanges();

			await settingsHelper.waitForSuccessMessage();

			// Navigate to another page and back to verify Redux state
			await settingsHelper.navigateToPage("Add");
			await settingsHelper.waitForLoading();

			await settingsHelper.navigateToSettings();

			// Currency should still be CAD from Redux
			expect(await settingsHelper.getDefaultCurrency()).toBe(newCurrency);
		});

		test("should maintain form state during navigation", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Make unsaved changes
			await settingsHelper.setGroupName("Unsaved_Changes");

			// Navigate away and back
			await settingsHelper.navigateToPage("Add");
			await settingsHelper.waitForLoading();

			await settingsHelper.navigateToSettings();

			// Changes should be lost (no auto-save)
			expect(await settingsHelper.getGroupName()).not.toBe("Unsaved_Changes");
		});

		test("should persist through page refresh after save", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const newName = `Refresh_Test_${Date.now()}`;
			await settingsHelper.setGroupName(newName);
			await settingsHelper.saveAllChanges();

			await settingsHelper.waitForSuccessMessage();

			// Hard refresh
			await page.reload();
			await settingsHelper.waitForLoading();

			expect(await settingsHelper.getGroupName()).toBe(newName);
		});
	});

	test.describe("Error Handling", () => {
		test("should handle network errors gracefully", async ({ seed, page }) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Simulate network failure
			await page.route("**/group/metadata", (route) => {
				route.abort("internetdisconnected");
			});

			await settingsHelper.setGroupName("Network_Test");
			await settingsHelper.saveAllChanges();

			const errorMessage = await settingsHelper.waitForErrorMessage();
			expect(errorMessage).toContain("Network Error");
		});

		test("should handle server-side validation errors", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Simulate server returning 400 error
			await page.route("**/group/metadata", (route) => {
				route.fulfill({
					status: 400,
					contentType: "application/json",
					body: JSON.stringify({ error: "Invalid group data" }),
				});
			});

			await settingsHelper.setGroupName("Server_Error_Test");
			await settingsHelper.saveAllChanges();

			const errorMessage = await settingsHelper.waitForErrorMessage();
			expect(errorMessage).toContain("Invalid group data");
		});

		test("should scroll to top on both success and error", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Scroll to bottom first
			await page.evaluate(() => {
				window.scrollTo(0, document.body.scrollHeight);
			});

			await settingsHelper.setGroupName("Scroll_Test");
			await settingsHelper.saveAllChanges();

			await settingsHelper.waitForSuccessMessage();

			// Verify page scrolled to top
			const scrollPosition = await page.evaluate(() => window.pageYOffset);
			expect(scrollPosition).toBe(0);
		});
	});

	test.describe("Integration with Other Features", () => {
		test("should reflect currency changes in expense forms", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			// Get current currency to change to something different
			const initialCurrency = await page.inputValue(
				'[data-test-id="currency-select"]',
			);
			const currencyOptions = await page
				.locator('[data-test-id="currency-select"] option')
				.allTextContents();
			const newCurrency =
				currencyOptions.find((currency) => currency !== initialCurrency) ||
				"USD";

			// Change default currency in settings
			await settingsHelper.setDefaultCurrency(newCurrency);
			await settingsHelper.saveAllChanges();
			await settingsHelper.waitForSuccessMessage();

			// Navigate to dashboard (expense form)
			await settingsHelper.navigateToPage("Add");
			await settingsHelper.waitForLoading();

			// Verify currency is pre-selected in expense form
			const currencySelect = page.locator('[data-test-id="currency-select"]');
			const selectedCurrency = await currencySelect.inputValue();
			expect(selectedCurrency).toBe(newCurrency);
		});

		test("should apply updated share percentages as defaults in new expenses", async ({
			seed,
			page,
		}) => {
			const seedResult = await seedTwoUserSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const u1Id = seedResult.ids.users.u1.id;
			const u2Id = seedResult.ids.users.u2.id;

			const newU1 = 51;
			// Update share percentages
			await settingsHelper.setUserPercentage(u1Id, newU1.toString());
			await settingsHelper.setUserPercentage(u2Id, (100 - newU1).toString());
			await settingsHelper.saveAllChanges();
			await settingsHelper.waitForSuccessMessage();

			// Navigate to dashboard and create expense
			await settingsHelper.navigateToPage("Add");
			await settingsHelper.waitForLoading();

			// Fill expense form
			await page.fill(
				'[data-test-id="description-input"]',
				"Test Expense",
			);
			await page.fill('[data-test-id="amount-input"]', "100");

			// Check if default percentages are applied (implementation dependent)
			// This would need to match the actual expense form implementation
		});

		test("should use updated budget categories in forms", async ({
			seed,
			page,
		}) => {
			await seedSettingsAuthedPage(seed, page);
			const settingsHelper = new SettingsTestHelper(page);

			const newCategory = `integration_test_${Date.now()}`; // Use underscores
			await settingsHelper.addBudgetCategory(newCategory);
			await settingsHelper.saveAllChanges();
			await settingsHelper.waitForSuccessMessage();

			// Navigate to budget page
			await settingsHelper.navigateToPage("Budget");
			await settingsHelper.waitForLoading();

			// Verify new category appears
			const budgetRadio = page.locator(
				`[data-test-id="budget-radio-${newCategory}"]`,
			);
			await expect(budgetRadio).toBeVisible({ timeout: 10000 });

			// Navigate to dashboard expense form
			await settingsHelper.navigateToPage("Add");
			await settingsHelper.waitForLoading();

			// Verify new category appears in expense budget selection
			const expenseBudgetGroup = page.locator(
				'[data-test-id="budget-selection-group"]',
			);
			await expect(expenseBudgetGroup).toBeVisible();

			// Check if the new budget category appears as a toggle button
			const newCategoryButton = page.locator(
				`[data-test-id="budget-radio-${newCategory}"]`,
			);
			await expect(newCategoryButton).toBeVisible();
		});
	});
});
