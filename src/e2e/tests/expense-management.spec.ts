import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';
import { ExpenseTestHelper, getCurrentUserPercentages } from '../utils/expense-test-helper';

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
    
    // Since authenticatedPage uses real login data, verify the defaults are set correctly
    await expenseHelper.verifyFormDefaults('USD', currentPercentages);
  });

  test('should preserve user-modified percentages within dashboard session but reset after navigation', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);
    
    // Verify initial default percentages (from user metadata)
    const initialFormValues = await expenseHelper.getCurrentFormValues();
    expect(initialFormValues.percentages['1']).toBe(currentPercentages['1']);
    expect(initialFormValues.percentages['2']).toBe(currentPercentages['2']);
    
    // Set custom split percentages (70/30 instead of default 50/50)
    await expenseHelper.setCustomSplitPercentages({ '1': 70, '2': 30 });
    
    // Add an expense
    const expense = { ...testData.expenses.groceries, amount: 100 };
    const result = await expenseHelper.addExpenseEntry(expense);
    
    // Verify form fields are reset but percentages are preserved within this session
    const afterSubmitValues = await expenseHelper.getCurrentFormValues();
    expect(afterSubmitValues.description).toBe('');
    expect(afterSubmitValues.amount).toBe('');
    expect(afterSubmitValues.pin).toBe('');
    expect(afterSubmitValues.percentages['1']).toBe('70'); // Preserved within session
    expect(afterSubmitValues.percentages['2']).toBe('30'); // Preserved within session
    
    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();
    
    // Verify the specific expense we added is visible (70/30 split: User 1 paid $100, owes $70, share = +$30.00)
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', expense.currency, '+$30.00');
    
    // Navigate back to Add page - this should reset percentages to defaults
    await authenticatedPage.navigateToPage('Add');
    await authenticatedPage.page.waitForTimeout(2000); // Give time for form to load
    
    // Verify percentages reset to defaults from user metadata after navigation
    const afterNavigationValues = await expenseHelper.getCurrentFormValues();
    expect(afterNavigationValues.percentages['1']).toBe(currentPercentages['1']);
    expect(afterNavigationValues.percentages['2']).toBe(currentPercentages['2']);
  });

  test('should reset custom currency selection to default after navigation', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);
    
    // Change currency to EUR for this expense
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', 'EUR');
    
    // Add an expense with EUR currency
    const expense = { ...testData.expenses.groceries, amount: 100, currency: 'EUR' };
    const result = await expenseHelper.addExpenseEntry(expense);
    
    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();
    
    // Calculate expected share based on current percentages
    // User 1 paid €100, owes based on their percentage, share = amount - what they owe
    const user1Percentage = parseFloat(currentPercentages['1']);
    const user1Owes = (expense.amount * user1Percentage) / 100;
    const user1Share = expense.amount - user1Owes;
    
    // Verify the specific expense we added is visible with EUR currency
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', 'EUR', `+€${user1Share.toFixed(2)}`);
    
    // Navigate back to Add page to check currency resets to default
    await authenticatedPage.navigateToPage('Add');
    
    // Verify currency selection resets to default (USD from user metadata)
    const formValues = await expenseHelper.getCurrentFormValues();
    expect(formValues.currency).toBe('USD');
  });

  test('should successfully add a new expense with custom split and verify on expenses page', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Get current default percentages from Settings page
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);
    
    // Add expense with custom 60/40 split
    const expense = testData.expenses.groceries;
    const result = await expenseHelper.addExpenseEntry(expense, { '1': 60, '2': 40 });
    
    expect(result.successMessage).toContain('successfully');
    
    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    
    // Verify expenses page components are present
    await expenseHelper.verifyExpensesPageComponents();
    
    // Verify the specific expense we added is visible (60/40 split: User 1 paid $150.50, owes $90.30, share = +$60.20)
    await expenseHelper.verifySpecificExpenseEntry(result.description, expense.amount.toString(), expense.currency, '+$60.20');
    
    // Navigate back to Add page - this should reset percentages to defaults
    await authenticatedPage.navigateToPage('Add');
    
    // Verify form was reset including percentages which reset to defaults after navigation
    const formValues = await expenseHelper.getCurrentFormValues();
    expect(formValues.description).toBe('');
    expect(formValues.amount).toBe('');
    expect(formValues.pin).toBe('');
    
    // Verify percentages reset to defaults from user metadata after navigation
    expect(formValues.percentages['1']).toBe(currentPercentages['1']);
    expect(formValues.percentages['2']).toBe(currentPercentages['2']);
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
    
    // Add first expense in USD
    const usdExpense = { ...testData.expenses.groceries, amount: 150, currency: 'USD' };
    const usdResult = await expenseHelper.addExpenseEntry(usdExpense, { '1': 50, '2': 50 } );
    
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
    const eurExpense = { ...testData.expenses.restaurant, amount: 85, currency: 'EUR' };
    const eurResult = await expenseHelper.addExpenseEntry(eurExpense, { '1': 50, '2': 50 } );
    
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
    
    // Create a test expense to delete
    const expense = { ...testData.expenses.groceries, amount: 100, currency: 'USD' };
    const result = await expenseHelper.addExpenseEntry(expense);
    
    // Navigate to expenses page and verify the expense exists
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', 'USD', '+$50.00');
    
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
    
    // Create multiple test expenses to delete
    const expense1 = { ...testData.expenses.groceries, amount: 50, currency: 'USD' };
    const result1 = await expenseHelper.addExpenseEntry(expense1, { '1': 50, '2': 50 } );
    
    const expense2 = { ...testData.expenses.restaurant, amount: 75, currency: 'EUR' };
    const result2 = await expenseHelper.addExpenseEntry(expense2, { '1': 50, '2': 50 } );
    
    const expense3 = { ...testData.expenses.utilities, amount: 120, currency: 'USD' };
    const result3 = await expenseHelper.addExpenseEntry(expense3, { '1': 70, '2': 30 });
    
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

  test('should handle deletion with PIN requirement', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Create a test expense to delete
    const expense = { ...testData.expenses.groceries, amount: 200, currency: 'GBP' };
    const result = await expenseHelper.addExpenseEntry(expense, { '1': 50, '2': 50 } );
    
    // Navigate to expenses page and verify the expense exists
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();
    await expenseHelper.verifySpecificExpenseEntry(result.description, '200', 'GBP', '+£100.00');
    
    // Delete the expense (PIN is handled automatically in the deleteExpenseEntry method)
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
    
    // Create test expenses to delete from different views
    const expense1 = { ...testData.expenses.groceries, amount: 150, currency: 'USD' };
    const result1 = await expenseHelper.addExpenseEntry(expense1, { '1': 50, '2': 50 } );
    
    const expense2 = { ...testData.expenses.restaurant, amount: 90, currency: 'EUR' };
    const result2 = await expenseHelper.addExpenseEntry(expense2, { '1': 50, '2': 50 } );
    
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