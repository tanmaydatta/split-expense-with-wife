import { test, expect } from '../fixtures/setup';
import { createTestExpenses } from '../fixtures/test-data';
import { ExpenseTestHelper, getCurrentUserPercentages, createTestExpensesWithCurrentUser, getCurrentCurrencyFromSettings } from '../utils/expense-test-helper';

test.describe('Expense Management', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test - navigate to page first to avoid security errors
    await page.goto('/');
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        // Ignore security errors in restrictive environments
        console.log('Storage clear failed:', e);
      }
    });
  });

  test('should display expense form on home page', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Verify expense form elements are present
    await expenseHelper.verifyFormElementsVisible();
  });

  test('should set default currency and split percentages from login metadata', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);

    // Get the actual default currency from Settings page (not from Dashboard)
    const currentCurrency = await getCurrentCurrencyFromSettings(authenticatedPage);

    // Since authenticatedPage uses real login data, verify the defaults are set correctly
    await expenseHelper.verifyFormDefaults(currentCurrency, currentPercentages);
  });

  test('should preserve user-modified percentages within dashboard session but reset after navigation', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);

    // Get the actual user IDs dynamically (current user first)
    const dynamicExpenses = await createTestExpensesWithCurrentUser(authenticatedPage);
    const userIds = Object.keys(currentPercentages);
    expect(userIds.length).toBeGreaterThanOrEqual(2); // Ensure we have at least 2 users
    const [userId1, userId2] = userIds;

    // Verify initial default percentages (from user metadata)
    const initialFormValues = await expenseHelper.getCurrentFormValues();
    expect(initialFormValues.percentages[userId1]).toBe(currentPercentages[userId1]);
    expect(initialFormValues.percentages[userId2]).toBe(currentPercentages[userId2]);

    // Set custom split percentages (70/30 instead of default 50/50)
    const customPercentages = { [userId1]: 70, [userId2]: 30 };
    await expenseHelper.setCustomSplitPercentages(customPercentages);

    // Add an expense using dynamic test data with current user as payer
    const expense = { ...dynamicExpenses.groceries, amount: 100 };
    const result = await expenseHelper.addExpenseEntry(expense);

    // Verify form fields are reset but percentages are preserved within this session
    const afterSubmitValues = await expenseHelper.getCurrentFormValues();
    expect(afterSubmitValues.description).toBe('');
    expect(afterSubmitValues.amount).toBe('');
    expect(afterSubmitValues.percentages[userId1]).toBe('70'); // Preserved within session
    expect(afterSubmitValues.percentages[userId2]).toBe('30'); // Preserved within session

    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();

    // Verify the specific expense we added is visible (70/30 split: first user paid $100, owes $70, share = +$30.00)
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', expense.currency, '+$30.00');

    // Navigate back to Add page - this should reset percentages to defaults
    await authenticatedPage.navigateToPage('Add');
    await authenticatedPage.page.waitForTimeout(2000); // Give time for form to load

    // Verify percentages reset to defaults from user metadata after navigation
    const afterNavigationValues = await expenseHelper.getCurrentFormValues();
    expect(afterNavigationValues.percentages[userId1]).toBe(currentPercentages[userId1]);
    expect(afterNavigationValues.percentages[userId2]).toBe(currentPercentages[userId2]);
  });

  test('should reset custom currency selection to default after navigation', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);

    // Get the current default currency from Settings page before changing it
    const defaultCurrency = await getCurrentCurrencyFromSettings(authenticatedPage);

    // Get the actual user IDs dynamically
    const userIds = Object.keys(currentPercentages);
    expect(userIds.length).toBeGreaterThanOrEqual(1); // Ensure we have at least 1 user
    const firstUserId = userIds[0];

    // Change currency to EUR for this expense
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', 'EUR');

    // Create dynamic test expenses with current user first and add one with EUR currency
    const dynamicExpenses = await createTestExpensesWithCurrentUser(authenticatedPage);
    const expense = { ...dynamicExpenses.groceries, amount: 100, currency: 'EUR' };
    const result = await expenseHelper.addExpenseEntry(expense);

    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();

    // Calculate expected share based on current percentages
    // First user paid €100, owes based on their percentage, share = amount - what they owe
    const user1Percentage = parseFloat(currentPercentages[firstUserId]);
    const user1Owes = (expense.amount * user1Percentage) / 100;
    const user1Share = expense.amount - user1Owes;

    // Verify the specific expense we added is visible with EUR currency
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', 'EUR', `+€${user1Share.toFixed(2)}`);

    // Navigate back to Add page to check currency resets to default
    await authenticatedPage.navigateToPage('Add');

    // Verify currency selection resets to default (from user metadata)
    const formValues = await expenseHelper.getCurrentFormValues();
    expect(formValues.currency).toBe(defaultCurrency);
  });

  test('should successfully add a new expense with custom split and verify on expenses page', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);

    // Get the actual user IDs dynamically
    const userIds = Object.keys(currentPercentages);
    expect(userIds.length).toBeGreaterThanOrEqual(2); // Ensure we have at least 2 users
    const [userId1, userId2] = userIds;

    // Create dynamic test expenses with current user first and add expense with custom 60/40 split
    const dynamicExpenses = await createTestExpensesWithCurrentUser(authenticatedPage);
    const expense = dynamicExpenses.groceries;
    const customSplit = { [userId1]: 60, [userId2]: 40 };
    const result = await expenseHelper.addExpenseEntry(expense, customSplit);

    expect(result.successMessage).toContain('successfully');

    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);

    // Verify expenses page components are present
    await expenseHelper.verifyExpensesPageComponents();

    // Verify the specific expense we added is visible (60/40 split: first user paid $150.50, owes $90.30, share = +$60.20)
    await expenseHelper.verifySpecificExpenseEntry(result.description, expense.amount.toString(), expense.currency, '+$60.20');

    // Navigate back to Add page - this should reset percentages to defaults
    await authenticatedPage.navigateToPage('Add');

    // Verify form was reset including percentages which reset to defaults after navigation
    const formValues = await expenseHelper.getCurrentFormValues();
    expect(formValues.description).toBe('');
    expect(formValues.amount).toBe('');

    // Verify percentages reset to defaults from user metadata after navigation
    expect(formValues.percentages[userId1]).toBe(currentPercentages[userId1]);
    expect(formValues.percentages[userId2]).toBe(currentPercentages[userId2]);
  });

  test('should handle form validation for missing required fields', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.page).toHaveURL('/');

    // Try to submit form without filling required fields
    await authenticatedPage.page.click('[data-test-id="submit-button"]');

    // Form should show HTML5 validation errors (browser handles this)
    // We can verify the form didn't submit by checking we're still on the same page
    await expect(authenticatedPage.page).toHaveURL('/');
  });

  test('should handle multiple expenses with different currencies', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);

    // Get the actual user IDs dynamically
    const userIds = Object.keys(currentPercentages);
    expect(userIds.length).toBeGreaterThanOrEqual(2); // Ensure we have at least 2 users
    const [userId1, userId2] = userIds;
    const splitPercentages = { [userId1]: 50, [userId2]: 50 };

    // Create dynamic test expenses with current user first
    const dynamicExpenses = await createTestExpensesWithCurrentUser(authenticatedPage);

    // Add first expense in USD
    const usdExpense = { ...dynamicExpenses.groceries, amount: 150, currency: 'USD' };
    const usdResult = await expenseHelper.addExpenseEntry(usdExpense, splitPercentages);

    // Verify first expense immediately after adding
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(3000);
    await expenseHelper.verifyExpensesPageComponents();
    await expenseHelper.verifySpecificExpenseEntry(usdResult.description, '150', 'USD', '+$75.00');

    // Navigate back to add the second expense
    await authenticatedPage.navigateToPage('Add');
    await authenticatedPage.page.waitForTimeout(1000);

    // Add second expense in EUR
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', 'EUR');
    const eurExpense = { ...dynamicExpenses.restaurant, amount: 85, currency: 'EUR' };
    const eurResult = await expenseHelper.addExpenseEntry(eurExpense, splitPercentages);

    // Navigate to expenses page to verify both expenses were added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(3000);
    await expenseHelper.verifyExpensesPageComponents();

    // Verify both expenses are visible (pagination handling will find older expenses)
    await expenseHelper.verifySpecificExpenseEntry(eurResult.description, '85', 'EUR', '-€42.50');
    await expenseHelper.verifySpecificExpenseEntry(usdResult.description, '150', 'USD', '+$75.00');
  });

  test('should successfully delete an expense and verify it no longer appears', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page to create dynamic expenses
    const deleteTestPercentages = await getCurrentUserPercentages(authenticatedPage);
    const deleteTestUserIds = Object.keys(deleteTestPercentages);
    expect(deleteTestUserIds.length).toBeGreaterThanOrEqual(1);
    const dynamicExpenses = await createTestExpensesWithCurrentUser(authenticatedPage);

    // Create a test expense to delete
    const expense = { ...dynamicExpenses.groceries, amount: 100, currency: 'USD' };
    const result = await expenseHelper.addExpenseEntry(expense);

    // Navigate to expenses page and verify the expense exists
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();

    // Use the first user ID from our dynamic expenses
    const firstUserId = deleteTestUserIds[0];

    const user1Percentage = parseFloat(deleteTestPercentages[firstUserId]);
    const user1Owes = (expense.amount * user1Percentage) / 100;
    const user1Share = expense.amount - user1Owes;
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', 'USD', `+$${user1Share.toFixed(2)}`);
    // Delete the expense
    await expenseHelper.deleteExpenseEntry(result.description);

    // Reload the page to ensure fresh data
    await authenticatedPage.page.reload();
    await expenseHelper.verifyExpensesPageComponents();

    // Verify the expense no longer appears in the list
    await expenseHelper.verifyExpenseNotPresent(result.description);
  });

  test('should handle deletion of multiple different expenses', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page to create dynamic expenses
    const multiTestPercentages = await getCurrentUserPercentages(authenticatedPage);
    const multiTestUserIds = Object.keys(multiTestPercentages);
    expect(multiTestUserIds.length).toBeGreaterThanOrEqual(2);
    const [userId1, userId2] = multiTestUserIds;
    const dynamicExpenses = createTestExpenses(multiTestUserIds);

    // Create multiple test expenses to delete
    const expense1 = { ...dynamicExpenses.groceries, amount: 50, currency: 'USD' };
    const result1 = await expenseHelper.addExpenseEntry(expense1, { [userId1]: 50, [userId2]: 50 });

    const expense2 = { ...dynamicExpenses.restaurant, amount: 75, currency: 'EUR' };
    const result2 = await expenseHelper.addExpenseEntry(expense2, { [userId1]: 50, [userId2]: 50 });

    const expense3 = { ...dynamicExpenses.utilities, amount: 120, currency: 'USD' };
    const result3 = await expenseHelper.addExpenseEntry(expense3, { [userId1]: 70, [userId2]: 30 });

    // Navigate to expenses page and verify all expenses exist
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(3000);
    await expenseHelper.verifyExpensesPageComponents();

    await expenseHelper.verifySpecificExpenseEntry(result1.description, '50', 'USD', '+$25.00');
    await expenseHelper.verifySpecificExpenseEntry(result2.description, '75', 'EUR', '-€37.50');
    await expenseHelper.verifySpecificExpenseEntry(result3.description, '120', 'USD', '+$36.00');

    // Delete the first expense (USD)
    await expenseHelper.deleteExpenseEntry(result1.description);

    // Reload and verify first expense is gone but others remain
    await authenticatedPage.page.reload();
    await expenseHelper.verifyExpensesPageComponents();

    await expenseHelper.verifyExpenseNotPresent(result1.description);
    await expenseHelper.verifySpecificExpenseEntry(result2.description, '75', 'EUR', '-€37.50');
    await expenseHelper.verifySpecificExpenseEntry(result3.description, '120', 'USD', '+$36.00');

    // Delete the third expense (USD with custom split)
    await expenseHelper.deleteExpenseEntry(result3.description);

    // Reload and verify third expense is gone but second remains
    await authenticatedPage.page.reload();
    await expenseHelper.verifyExpensesPageComponents();

    await expenseHelper.verifyExpenseNotPresent(result1.description);
    await expenseHelper.verifyExpenseNotPresent(result3.description);
    await expenseHelper.verifySpecificExpenseEntry(result2.description, '75', 'EUR', '-€37.50');

    // Delete the second expense (EUR)
    await expenseHelper.deleteExpenseEntry(result2.description);

    // Reload and verify all expenses are gone
    await authenticatedPage.page.reload();
    // Wait for expenses page to load instead of fixed timeout
    await expenseHelper.verifyExpensesPageComponents();

    await expenseHelper.verifyExpenseNotPresent(result2.description);
  });

  test('should handle expense deletion', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page to create dynamic expenses
    const deletePercentages = await getCurrentUserPercentages(authenticatedPage);
    const deleteUserIds = Object.keys(deletePercentages);
    expect(deleteUserIds.length).toBeGreaterThanOrEqual(2);
    const [userId1, userId2] = deleteUserIds;
    const dynamicExpenses = createTestExpenses(deleteUserIds);

    // Create a test expense to delete
    const expense = { ...dynamicExpenses.groceries, amount: 200, currency: 'GBP' };
    const result = await expenseHelper.addExpenseEntry(expense, { [userId1]: 50, [userId2]: 50 });

    // Navigate to expenses page and verify the expense exists
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();
    await expenseHelper.verifySpecificExpenseEntry(result.description, '200', 'GBP', '+£100.00');

    // Delete the expense
    await expenseHelper.deleteExpenseEntry(result.description);

    // Reload the page to ensure fresh data
    await authenticatedPage.page.reload();
    await expenseHelper.verifyExpensesPageComponents();

    // Verify the expense no longer appears in the list
    await expenseHelper.verifyExpenseNotPresent(result.description);
  });

  test('should handle deletion from both mobile and desktop views', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);

    await expect(authenticatedPage.page).toHaveURL('/');

    // Get current default percentages from Settings page to create dynamic expenses
    const viewTestPercentages = await getCurrentUserPercentages(authenticatedPage);
    const viewTestUserIds = Object.keys(viewTestPercentages);
    expect(viewTestUserIds.length).toBeGreaterThanOrEqual(2);
    const [userId1, userId2] = viewTestUserIds;
    const dynamicExpenses = createTestExpenses(viewTestUserIds);

    // Create test expenses to delete from different views
    const expense1 = { ...dynamicExpenses.groceries, amount: 150, currency: 'USD' };
    const result1 = await expenseHelper.addExpenseEntry(expense1, { [userId1]: 50, [userId2]: 50 });

    const expense2 = { ...dynamicExpenses.restaurant, amount: 90, currency: 'EUR' };
    const result2 = await expenseHelper.addExpenseEntry(expense2, { [userId1]: 50, [userId2]: 50 });

    // Test deletion in current viewport
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();

    // Verify both expenses exist
    await expenseHelper.verifySpecificExpenseEntry(result1.description, '150', 'USD', '+$75.00');
    await expenseHelper.verifySpecificExpenseEntry(result2.description, '90', 'EUR', '-€45.00');

    // Delete first expense
    await expenseHelper.deleteExpenseEntry(result1.description);

    // Change viewport size to test the other view (mobile <-> desktop)
    const currentViewport = authenticatedPage.page.viewportSize();
    const isMobile = currentViewport ? currentViewport.width <= 768 : false;

    if (isMobile) {
      // Switch to desktop viewport
      await authenticatedPage.page.setViewportSize({ width: 1024, height: 768 });
    } else {
      // Switch to mobile viewport
      await authenticatedPage.page.setViewportSize({ width: 375, height: 667 });
    }

    // Reload page to apply new viewport and verify first expense is gone
    await authenticatedPage.page.reload();
    await expenseHelper.verifyExpensesPageComponents();

    await expenseHelper.verifyExpenseNotPresent(result1.description);
    await expenseHelper.verifySpecificExpenseEntry(result2.description, '90', 'EUR', '-€45.00');

    // Delete second expense from the different viewport
    await expenseHelper.deleteExpenseEntry(result2.description);

    // Verify both expenses are gone
    await authenticatedPage.page.reload();
    await expenseHelper.verifyExpensesPageComponents();

    await expenseHelper.verifyExpenseNotPresent(result1.description);
    await expenseHelper.verifyExpenseNotPresent(result2.description);

    // Restore original viewport
    if (currentViewport) {
      await authenticatedPage.page.setViewportSize(currentViewport);
    }
  });
}); 