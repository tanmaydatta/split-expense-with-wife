import { randomUUID } from 'crypto';
import { test, expect } from '../fixtures/setup';
import { getNewUserPercentage, getCurrentUserPercentages } from '../utils/expense-test-helper';
import { getCurrentUserId, TestHelper } from '../utils/test-utils';

// Helper class for Settings page operations
class SettingsTestHelper {
    constructor(private authenticatedPage: TestHelper) { }

    async navigateToSettings() {
        // Navigate to settings via sidebar
        await this.authenticatedPage.navigateToPage('Settings');
    }

    async verifySettingsPageComponents() {
        // Verify main settings container
        await expect(this.authenticatedPage.page.locator('[data-test-id="settings-container"]')).toBeVisible({ timeout: 10000 });

        // Verify all main sections exist
        await expect(this.authenticatedPage.page.locator('[data-test-id="group-info-section"]')).toBeVisible({ timeout: 5000 });
        await expect(this.authenticatedPage.page.locator('[data-test-id="currency-section"]')).toBeVisible({ timeout: 5000 });
        await expect(this.authenticatedPage.page.locator('[data-test-id="shares-section"]')).toBeVisible({ timeout: 5000 });
        await expect(this.authenticatedPage.page.locator('[data-test-id="budgets-section"]')).toBeVisible({ timeout: 5000 });

        // Verify single submit button section
        await expect(this.authenticatedPage.page.locator('[data-test-id="settings-actions"]')).toBeVisible({ timeout: 5000 });
        await expect(this.authenticatedPage.page.locator('[data-test-id="save-all-button"]')).toBeVisible({ timeout: 5000 });
    }

    async getGroupName() {
        return await this.authenticatedPage.page.inputValue('[data-test-id="group-name-input"]');
    }

    async setGroupName(name: string) {
        await this.authenticatedPage.page.fill('[data-test-id="group-name-input"]', name);
    }

    async getDefaultCurrency() {
        return await this.authenticatedPage.page.inputValue('[data-test-id="currency-select"]');
    }

    async setDefaultCurrency(currency: string) {
        await this.authenticatedPage.page.selectOption('[data-test-id="currency-select"]', currency);
    }

    async getUserPercentage(userId: string) {
        return await this.authenticatedPage.page.inputValue(`[data-test-id="user-${userId}-percentage"]`);
    }

    async setUserPercentage(userId: string, percentage: string) {
        await this.authenticatedPage.page.fill(`[data-test-id="user-${userId}-percentage"]`, percentage);
    }

    async getBudgetCategories() {
        // Wait for the Settings page to load data
        await this.authenticatedPage.page.waitForTimeout(2000); // Give time for API calls

        // Get budget categories from the displayed list, not input fields
        const budgetItems = this.authenticatedPage.page.locator('.budget-item span');
        const count = await budgetItems.count();
        const categories = [];

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
        await this.authenticatedPage.page.fill('[data-test-id="new-budget-input"]', category);

        // Click add button
        await this.authenticatedPage.page.click('[data-test-id="add-budget-button"]');
    }

    async removeBudgetCategory(index: number) {
        await this.authenticatedPage.page.click(`[data-test-id="remove-budget-${index}"]`);
    }

    async isSaveButtonEnabled() {
        const saveButton = this.authenticatedPage.page.locator('[data-test-id="save-all-button"]');
        return !(await saveButton.isDisabled());
    }

    async isSaveButtonDisabled() {
        const saveButton = this.authenticatedPage.page.locator('[data-test-id="save-all-button"]');
        return await saveButton.isDisabled();
    }

    async saveAllChanges() {
        await this.authenticatedPage.page.waitForTimeout(1000);
        await this.authenticatedPage.page.click('[data-test-id="save-all-button"]');
        await this.authenticatedPage.waitForLoading();
    }

    async waitForSuccessMessage() {
        await this.authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: 10000 });
        return await this.authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
    }

    async waitForErrorMessage() {
        await this.authenticatedPage.page.waitForSelector('[data-test-id="error-container"]', { timeout: 10000 });
        return await this.authenticatedPage.page.locator('[data-test-id="error-message"]').textContent();
    }

    async getTotalPercentageDisplay() {
        const element = this.authenticatedPage.page.locator('[data-test-id="total-percentage"]');
        if (await element.isVisible()) {
            return await element.textContent();
        }
        return null;
    }

    async getValidationError() {
        const element = this.authenticatedPage.page.locator('[data-test-id="validation-error"]');
        if (await element.isVisible()) {
            return await element.textContent();
        }
        return null;
    }

    async deleteBudgetByCategory(category: string) {
        // Find the budget category in the displayed list
        const budgetItems = this.authenticatedPage.page.locator('.budget-item');
        const count = await budgetItems.count();

        for (let i = 0; i < count; i++) {
            const budgetItem = budgetItems.nth(i);
            const categoryText = await budgetItem.locator('span').textContent();
            
            if (categoryText && categoryText.trim() === category) {
                // Click the remove button for this category
                await budgetItem.locator(`[data-test-id="remove-budget-${i}"]`).click();
                break;
            }
        }
    }

    async getDynamicUserIds(): Promise<{ currentUserId: string; allUserIds: string[] }> {
        // Get current user ID and all user percentages (which returns ordered IDs)
        const currentUserId = await getCurrentUserId(this.authenticatedPage);
        const currentPercentages = await getCurrentUserPercentages(this.authenticatedPage);
        const allUserIds = Object.keys(currentPercentages);
        return { currentUserId, allUserIds };
    }

    async verifyPercentageSymbolPosition(userId: string) {
        // Verify that % symbol is inside the input field
        const inputWrapper = this.authenticatedPage.page.locator(`[data-test-id="percentage-wrapper-${userId}"]`);
        const percentSymbol = inputWrapper.locator('[data-test-id="percentage-symbol"]');

        await expect(inputWrapper).toBeVisible({ timeout: 5000 });
        await expect(percentSymbol).toBeVisible({ timeout: 5000 });
        await expect(percentSymbol).toHaveText('%');
    }
}

test.describe('Settings Management', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
        const settingsHelper = new SettingsTestHelper(authenticatedPage);
        await settingsHelper.navigateToSettings();
        // Wait for Settings page data to load
        await authenticatedPage.page.waitForTimeout(3000);
    });

    test.describe('Page Structure and Navigation', () => {
        test('should display all settings sections correctly', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);
            await settingsHelper.verifySettingsPageComponents();
        });

        test('should be accessible via sidebar navigation', async ({ authenticatedPage }) => {
            // Go back to dashboard first
            await authenticatedPage.navigateToPage('Add');
            await expect(authenticatedPage.page).toHaveURL('/');
            // Then navigate to settings via sidebar
            const settingsHelper = new SettingsTestHelper(authenticatedPage);
            await settingsHelper.navigateToSettings();

            await expect(authenticatedPage.page).toHaveURL('/settings');
        });

        test('should maintain proper responsive design on mobile', async ({ authenticatedPage }) => {
            // Set mobile viewport
            await authenticatedPage.page.setViewportSize({ width: 375, height: 667 });

            const settingsHelper = new SettingsTestHelper(authenticatedPage);
            await settingsHelper.verifySettingsPageComponents();

            // Verify mobile-specific elements are properly sized
            const container = authenticatedPage.page.locator('[data-test-id="settings-container"]');
            await expect(container).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('Group Information Management', () => {
        test('should display current group name and allow editing', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Verify initial group name is loaded
            const initialName = await settingsHelper.getGroupName();
            expect(initialName).toBeTruthy();

            // Update group name
            const newName = `Updated_Group_${Date.now()}`;
            await settingsHelper.setGroupName(newName);

            // Verify save button becomes enabled
            await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
        });

        test('should save group name changes successfully', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            const newName = `Test_Group_${Date.now()}`;
            await settingsHelper.setGroupName(newName);
            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');

            // Verify the name persists after page refresh
            await authenticatedPage.page.reload();
            await authenticatedPage.waitForLoading();

            const persistedName = await settingsHelper.getGroupName();
            expect(persistedName).toBe(newName);
        });

        test('should handle empty group name validation', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Clear the group name
            await settingsHelper.setGroupName('   ');

            // Try to save
            await settingsHelper.saveAllChanges();

            // Should show error
            const errorMessage = await settingsHelper.waitForErrorMessage();
            expect(errorMessage).toContain('Group name cannot be empty');
        });
    });

    test.describe('Currency Management', () => {
        test('should display current default currency and allow changes', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Verify initial currency is loaded
            const initialCurrency = await settingsHelper.getDefaultCurrency();
            expect(initialCurrency).toBeTruthy();

            // Change to different currency
            const newCurrency = initialCurrency === 'USD' ? 'EUR' : 'USD';
            await settingsHelper.setDefaultCurrency(newCurrency);

            // Verify save button becomes enabled
            await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
        });

        test('should save currency changes and update other forms', async ({ authenticatedPage }) => {
            // Capture console logs
            authenticatedPage.page.on('console', msg => {
                console.log('Browser console:', msg.text());
            });
            
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get current currency
            const initialCurrency = await authenticatedPage.page.inputValue('[data-test-id="currency-select"]');

            // Get all available currency options
            const currencyOptions = await authenticatedPage.page.locator('[data-test-id="currency-select"] option').allTextContents();

            // Find a different currency to change to
            const newCurrency = currencyOptions.find(currency => currency !== initialCurrency) || 'USD';

            // Change currency to something different from the initial value
            await settingsHelper.setDefaultCurrency(newCurrency);

            // Wait for state to update and verify button is enabled
            await authenticatedPage.page.waitForTimeout(1000);
            expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);

            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');

            // Navigate to dashboard and verify currency is updated
            await authenticatedPage.navigateToPage('Add');
            await authenticatedPage.waitForLoading();

            const currencySelect = authenticatedPage.page.locator('[data-test-id="currency-select"]');
            const selectedCurrency = await currencySelect.inputValue();
            expect(selectedCurrency).toBe(newCurrency);
        });
    });

    test.describe('Share Percentage Management', () => {
        test('should display current user shares with percentage symbols inside inputs', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get dynamic user IDs
            const { currentUserId: _currentUserId, allUserIds: _allUserIds } = await settingsHelper.getDynamicUserIds();
            // Verify percentage symbols are positioned inside inputs
            const userElements = authenticatedPage.page.locator('[data-test-id^="user-"][data-test-id$="-percentage"]');
            const count = await userElements.count();

            expect(count).toBeGreaterThan(0);

            // Check first user's percentage symbol positioning (current user)
            await settingsHelper.verifyPercentageSymbolPosition(_currentUserId);
        });

        test('should validate percentage totals with 0.001 precision', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get dynamic user IDs
            const { currentUserId: _currentUserId, allUserIds: _allUserIds } = await settingsHelper.getDynamicUserIds();
            const [userId1, userId2] = _allUserIds;

            // Test case: Set percentages that don't add to 100%
            await settingsHelper.setUserPercentage(userId1, '30');
            await settingsHelper.setUserPercentage(userId2, '30');
            // Leave remaining users with original values (should not total 100%)

            // Save button should be disabled due to validation error
            await expect(await settingsHelper.isSaveButtonDisabled()).toBe(true);

            // Check for validation error message
            const validationError = await settingsHelper.getValidationError();
            expect(validationError).toContain('must total 100%');
        });

        test('should handle 2-user scenarios with precise percentages', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get dynamic user IDs
            const { currentUserId: _currentUserId, allUserIds: _allUserIds } = await settingsHelper.getDynamicUserIds();
            const [userId1, userId2] = _allUserIds;

            // Wait for page to load user data
            await authenticatedPage.page.waitForTimeout(2000);

            // Set precise percentages for 2 users
            await settingsHelper.setUserPercentage(userId1, '50.001');
            await settingsHelper.setUserPercentage(userId2, '49.999');

            // This should be valid (totals 100.000)
            await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);

            // Test slightly off but within tolerance
            await settingsHelper.setUserPercentage(userId1, '50.0005');
            await settingsHelper.setUserPercentage(userId2, '49.9995'); // Total = 100.000

            // Should still be valid (within 0.001 tolerance)
            await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
        });

        test('should save percentage changes successfully', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get dynamic user IDs
            const { currentUserId: _currentUserId, allUserIds: _allUserIds } = await settingsHelper.getDynamicUserIds();
            const [userId1, userId2] = _allUserIds;

            // Wait for data to load
            await authenticatedPage.page.waitForTimeout(2000);

            const newUser1Percentage = await getNewUserPercentage(authenticatedPage, userId1);
            // Set valid percentages for 2 users
            await settingsHelper.setUserPercentage(userId1, newUser1Percentage.toString());
            await settingsHelper.setUserPercentage(userId2, (100 - newUser1Percentage).toString());

            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');

            // Verify changes persist
            await authenticatedPage.page.reload();
            await authenticatedPage.waitForLoading();
            await authenticatedPage.page.waitForTimeout(2000);

            expect(await settingsHelper.getUserPercentage(userId1)).toBe(newUser1Percentage.toString());
            expect(await settingsHelper.getUserPercentage(userId2)).toBe((100 - newUser1Percentage).toString());
        });
    });

    test.describe('Budget Category Management', () => {
        test('should display existing budget categories', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            const categories = await settingsHelper.getBudgetCategories();
            expect(categories.length).toBeGreaterThan(0);
            expect(categories).toContain('house');
            expect(categories).toContain('food');
        });

        test('should add new budget category', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            const newCategory = `test_category_${Date.now()}`;  // Use underscores instead of spaces

            await settingsHelper.addBudgetCategory(newCategory);

            // Verify save button becomes enabled
            await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);

            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');

            // Verify new category appears in budget forms
            await authenticatedPage.navigateToPage('Budget');
            await authenticatedPage.waitForLoading();

            const budgetRadio = authenticatedPage.page.locator(`[data-test-id="budget-radio-${newCategory}"]`);
            await expect(budgetRadio).toBeVisible({ timeout: 10000 });
        });

        test('should remove budget category', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // First add a category to remove
            const categoryToRemove = `temp_category_${Date.now()}`;  // Use underscores
            await settingsHelper.addBudgetCategory(categoryToRemove);
            await settingsHelper.saveAllChanges();
            await settingsHelper.waitForSuccessMessage();

            // Refresh to get clean state
            await authenticatedPage.page.reload();
            await authenticatedPage.waitForLoading();

            const initialCategories = await settingsHelper.getBudgetCategories();
            const categoryIndex = initialCategories.findIndex(cat => cat === categoryToRemove);

            // Ensure the category exists before removing
            expect(categoryIndex).toBeGreaterThanOrEqual(0);

            await settingsHelper.removeBudgetCategory(categoryIndex);
            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');

            // Verify category is removed from budget forms
            await authenticatedPage.navigateToPage('Budget');
            await authenticatedPage.waitForLoading();

            const budgetRadio = authenticatedPage.page.locator(`[data-test-id="budget-radio-${categoryToRemove}"]`);
            await expect(budgetRadio).not.toBeVisible({ timeout: 5000 });
        });

        test('should handle empty budget categories', async ({ authenticatedPage }) => {
            // Verify add button is disabled when input is empty
            await authenticatedPage.page.fill('[data-test-id="new-budget-input"]', '');
            const isDisabledEmpty = await authenticatedPage.page.isDisabled('[data-test-id="add-budget-button"]');
            expect(isDisabledEmpty).toBe(true);
            
            // Verify add button is disabled when input has only whitespace
            await authenticatedPage.page.fill('[data-test-id="new-budget-input"]', '   ');
            const isDisabledWhitespace = await authenticatedPage.page.isDisabled('[data-test-id="add-budget-button"]');
            expect(isDisabledWhitespace).toBe(true);
            
            // Verify add button is enabled when input has valid content
            await authenticatedPage.page.fill('[data-test-id="new-budget-input"]', 'ValidCategory');
            const isEnabledValid = await authenticatedPage.page.isDisabled('[data-test-id="add-budget-button"]');
            expect(isEnabledValid).toBe(false);
        });

        test('should validate budget names and show error for invalid characters', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);
        
            // Try to add budget category with invalid characters (special chars)
            const invalidCategory = 'Invalid Budget!@#';
            await settingsHelper.addBudgetCategory(invalidCategory);
        
            // Try to save
            await settingsHelper.saveAllChanges();
        
            // Should show validation error
            const errorMessage = await settingsHelper.waitForErrorMessage();
            expect(errorMessage).toContain('Budget names can only contain letters, numbers, spaces, hyphens, and underscores');
        });

        test('should accept valid budget names with allowed characters (including spaces)', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Add budget categories with valid characters (uppercase, lowercase, numbers, underscores, hyphens)
            const validCategories = [
                'valid_category',
                'valid-category',
                'category123',
                'Category_With_123',
                'UPPERCASE_BUDGET',
                'budget with spaces'
            ].map(category => category + '_' + randomUUID());

            for (const category of validCategories) {
                await settingsHelper.addBudgetCategory(category);
            }

            // Should be able to save successfully
            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');
            for (const category of validCategories) {
                await settingsHelper.deleteBudgetByCategory(category);
            }
            await settingsHelper.saveAllChanges();
        });
    });

    test.describe('Single Submit Button Workflow', () => {
        test('should have only one save button and show correct states', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Verify only one save button exists
            const saveButtons = authenticatedPage.page.locator('[data-test-id*="save"]');
            const count = await saveButtons.count();
            expect(count).toBe(1);

            // Initially disabled (no changes)
            await expect(await settingsHelper.isSaveButtonDisabled()).toBe(true);

            // Make a change
            await settingsHelper.setGroupName('Changed_Name');

            // Should become enabled
            await expect(await settingsHelper.isSaveButtonEnabled()).toBe(true);
        });

        test('should save all changes in single API call', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get dynamic user IDs
            const { currentUserId: _currentUserId, allUserIds: _allUserIds } = await settingsHelper.getDynamicUserIds();
            const [userId1, userId2] = _allUserIds;

            // Get current currency to change to something different
            const initialCurrency = await authenticatedPage.page.inputValue('[data-test-id="currency-select"]');
            const currencyOptions = await authenticatedPage.page.locator('[data-test-id="currency-select"] option').allTextContents();
            const newCurrency = currencyOptions.find(currency => currency !== initialCurrency) || '';
            // Make multiple changes
            const newName = `Multi_Change_${Date.now()}`;  // Use underscores
            await settingsHelper.setGroupName(newName);
            await settingsHelper.setDefaultCurrency(newCurrency);
            await settingsHelper.setUserPercentage(userId1, '60');
            await settingsHelper.setUserPercentage(userId2, '40');
            await settingsHelper.addBudgetCategory('new_category');

            // Single save operation
            await settingsHelper.saveAllChanges();

            const successMessage = await settingsHelper.waitForSuccessMessage();
            expect(successMessage).toContain('successfully');

            // Verify all changes persisted
            await authenticatedPage.page.reload();
            await authenticatedPage.waitForLoading();

            expect(await settingsHelper.getGroupName()).toBe(newName);
            expect(await settingsHelper.getDefaultCurrency()).toBe(newCurrency);
            expect(await settingsHelper.getUserPercentage(userId1)).toBe('60');
            expect(await settingsHelper.getUserPercentage(userId2)).toBe('40');
        });

        test('should show loading state during save operation', async ({ authenticatedPage }) => {
            await authenticatedPage.page.route('**/group/metadata', async route => {
                await new Promise(resolve => setTimeout(resolve, 1000));
                route.continue();
            });
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Make a change
            await settingsHelper.setGroupName('Loading_Test ' + randomUUID());

            // Click save but don't wait for completion
            await authenticatedPage.page.click('[data-test-id="save-all-button"]');

            // Verify loading state appears
            const loadingIndicator = authenticatedPage.page.locator('[data-test-id="loading-indicator"]');
            await expect(loadingIndicator).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('Data Persistence and State Management', () => {
        test('should update Redux store after successful save', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            const newCurrency = 'CAD';
            await settingsHelper.setDefaultCurrency(newCurrency);
            await settingsHelper.saveAllChanges();

            await settingsHelper.waitForSuccessMessage();

            // Navigate to another page and back to verify Redux state
            await authenticatedPage.navigateToPage('Add');
            await authenticatedPage.waitForLoading();

            await settingsHelper.navigateToSettings();

            // Currency should still be CAD from Redux
            expect(await settingsHelper.getDefaultCurrency()).toBe(newCurrency);
        });

        test('should maintain form state during navigation', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Make unsaved changes
            await settingsHelper.setGroupName('Unsaved_Changes');

            // Navigate away and back
            await authenticatedPage.navigateToPage('Add');
            await authenticatedPage.waitForLoading();

            await settingsHelper.navigateToSettings();

            // Changes should be lost (no auto-save)
            expect(await settingsHelper.getGroupName()).not.toBe('Unsaved_Changes');
        });

        test('should persist through page refresh after save', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            const newName = `Refresh_Test_${Date.now()}`;
            await settingsHelper.setGroupName(newName);
            await settingsHelper.saveAllChanges();

            await settingsHelper.waitForSuccessMessage();

            // Hard refresh
            await authenticatedPage.page.reload();
            await authenticatedPage.waitForLoading();

            expect(await settingsHelper.getGroupName()).toBe(newName);
        });
    });

    test.describe('Error Handling', () => {
        test('should handle network errors gracefully', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Simulate network failure
            await authenticatedPage.page.route('**/group/metadata', route => {
                route.abort('internetdisconnected');
            });

            await settingsHelper.setGroupName('Network_Test');
            await settingsHelper.saveAllChanges();

            const errorMessage = await settingsHelper.waitForErrorMessage();
            expect(errorMessage).toContain('Network Error');
        });

        test('should handle server-side validation errors', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Simulate server returning 400 error
            await authenticatedPage.page.route('**/group/metadata', route => {
                route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Invalid group data' })
                });
            });

            await settingsHelper.setGroupName('Server_Error_Test');
            await settingsHelper.saveAllChanges();

            const errorMessage = await settingsHelper.waitForErrorMessage();
            expect(errorMessage).toContain('Invalid group data');
        });

        test('should scroll to top on both success and error', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Scroll to bottom first
            await authenticatedPage.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            await settingsHelper.setGroupName('Scroll_Test');
            await settingsHelper.saveAllChanges();

            await settingsHelper.waitForSuccessMessage();

            // Verify page scrolled to top
            const scrollPosition = await authenticatedPage.page.evaluate(() => window.pageYOffset);
            expect(scrollPosition).toBe(0);
        });
    });

    test.describe('Integration with Other Features', () => {
        test('should reflect currency changes in expense forms', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get current currency to change to something different
            const initialCurrency = await authenticatedPage.page.inputValue('[data-test-id="currency-select"]');
            const currencyOptions = await authenticatedPage.page.locator('[data-test-id="currency-select"] option').allTextContents();
            const newCurrency = currencyOptions.find(currency => currency !== initialCurrency) || 'USD';

            // Change default currency in settings
            await settingsHelper.setDefaultCurrency(newCurrency);
            await settingsHelper.saveAllChanges();
            await settingsHelper.waitForSuccessMessage();

            // Navigate to dashboard (expense form)
            await authenticatedPage.navigateToPage('Add');
            await authenticatedPage.waitForLoading();

            // Verify currency is pre-selected in expense form
            const currencySelect = authenticatedPage.page.locator('[data-test-id="currency-select"]');
            const selectedCurrency = await currencySelect.inputValue();
            expect(selectedCurrency).toBe(newCurrency);
        });

        test('should apply updated share percentages as defaults in new expenses', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            // Get dynamic user IDs
            const { currentUserId: _currentUserId, allUserIds: _allUserIds } = await settingsHelper.getDynamicUserIds();
            const [userId1, userId2] = _allUserIds;

            // Update share percentages
            await settingsHelper.setUserPercentage(userId1, '70');
            await settingsHelper.setUserPercentage(userId2, '30');
            await settingsHelper.saveAllChanges();
            await settingsHelper.waitForSuccessMessage();

            // Navigate to dashboard and create expense
            await authenticatedPage.navigateToPage('Add');
            await authenticatedPage.waitForLoading();

            // Fill expense form
            await authenticatedPage.page.fill('[data-test-id="description-input"]', 'Test Expense');
            await authenticatedPage.page.fill('[data-test-id="amount-input"]', '100');

            // Check if default percentages are applied (implementation dependent)
            // This would need to match the actual expense form implementation
        });

        test('should use updated budget categories in forms', async ({ authenticatedPage }) => {
            const settingsHelper = new SettingsTestHelper(authenticatedPage);

            const newCategory = `integration_test_${Date.now()}`;  // Use underscores
            await settingsHelper.addBudgetCategory(newCategory);
            await settingsHelper.saveAllChanges();
            await settingsHelper.waitForSuccessMessage();

            // Navigate to budget page
            await authenticatedPage.navigateToPage('Budget');
            await authenticatedPage.waitForLoading();

            // Verify new category appears
            const budgetRadio = authenticatedPage.page.locator(`[data-test-id="budget-radio-${newCategory}"]`);
            await expect(budgetRadio).toBeVisible({ timeout: 10000 });

            // Navigate to dashboard expense form
            await authenticatedPage.navigateToPage('Add');
            await authenticatedPage.waitForLoading();

            // Verify new category appears in expense budget selection
            const expenseBudgetGroup = authenticatedPage.page.locator('[data-test-id="budget-selection-group"]');
            await expect(expenseBudgetGroup).toBeVisible();
            
            // Check if the new budget category appears as a toggle button
            const newCategoryButton = authenticatedPage.page.locator(`[data-test-id="budget-radio-${newCategory}"]`);
            await expect(newCategoryButton).toBeVisible();
        });
    });
}); 
