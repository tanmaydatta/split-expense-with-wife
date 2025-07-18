import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

// Helper functions for expense operations
class ExpenseTestHelper {
  constructor(private authenticatedPage: any) {}

  async addExpenseEntry(expense: any, customSplits?: Record<string, number>) {
    const expenseForm = this.authenticatedPage.page.locator('[data-test-id="expense-form"]');

    // Generate random description to avoid edge cases
    const randomId = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString().slice(-6);
    const description = `${expense.description} ${randomId}${timestamp}`;
    console.log("Adding expense with description:", description);

    // Fill basic form fields
    await this.authenticatedPage.page.fill('[data-test-id="description-input"]', description);
    await this.authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await this.authenticatedPage.page.selectOption('[data-test-id="currency-select"]', expense.currency);
    await this.authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', expense.paidBy || '1');

    // Set custom split percentages if provided
    if (customSplits) {
      for (const userId in customSplits) {
        const percentage = customSplits[userId];
        await this.authenticatedPage.page.fill(`[data-test-id="percentage-input-${userId}"]`, percentage.toString());
      }
    }

    await this.authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);

    // Submit and wait for response
    await expenseForm.locator('[data-test-id="submit-button"]').click();
    await this.authenticatedPage.waitForLoading();

    // Wait for and verify success message appears
    await this.authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: 10000 });
    const successMessage = await this.authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
    console.log("Success message received:", successMessage);

    return { description, successMessage };
  }

  async verifyExpensesPageComponents() {
    // Verify basic expenses page structure
    await expect(this.authenticatedPage.page).toHaveURL('/expenses');
    
    // Verify expenses page elements are present using only data-test-id
    const expensesContainer = this.authenticatedPage.page.locator('[data-test-id="expenses-container"]');
    if (await expensesContainer.isVisible({ timeout: 5000 })) {
      console.log("Expenses container found");
    } else {
      console.log("No specific expenses container found, checking for general content");
    }
  }

  async verifySpecificExpenseEntry(description: string, amount: string, currency: string, expectedShare: string) {
    console.log("verifySpecificExpenseEntry", "description", description, "amount", amount, "currency", currency, "expectedShare", expectedShare);
    
    let expenseFound = false;
    let attempts = 0;
    const maxAttempts = 3;

    // Try to find the expense, using pagination if needed
    while (!expenseFound && attempts <= maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts} to find expense: ${description}`);
      
      // Look for the expense using only data-test-id attributes
      const expenseSelectors = [
        '[data-test-id="transaction-item"]',
        '[data-test-id="expense-item"]',
        '[data-test-id="transaction-card"]'
      ];

      for (const selector of expenseSelectors) {
        const expenseItems = this.authenticatedPage.page.locator(selector);
        const count = await expenseItems.count();
        
        if (count > 0) {
          console.log(`Found ${count} expense items with selector: ${selector}`);
          
          // Check each expense item for our description
          for (let i = 0; i < count; i++) {
            const item = expenseItems.nth(i);
            const text = await item.textContent();
            if (text && text.includes(description)) {
              console.log(`Found expense with description: ${description}`);
              
              // Verify it also contains the amount and share
              if (text.includes(amount) && text.includes(expectedShare)) {
                console.log(`Verified amount ${amount} and share ${expectedShare} in expense`);
                expenseFound = true;
                break;
              }
            }
          }
          
          if (expenseFound) break;
        }
      }

      // If not found with specific selectors, try broader search on the expenses container
      if (!expenseFound) {
        console.log("Trying broader search for expense in expenses container");
        const expensesContainer = this.authenticatedPage.page.locator('[data-test-id="expenses-container"]');
        if (await expensesContainer.isVisible({ timeout: 2000 })) {
          const containerText = await expensesContainer.textContent();
          if (containerText && containerText.includes(description) && containerText.includes(amount) && containerText.includes(expectedShare)) {
            console.log(`Found expense in expenses container: ${description} with amount ${amount} and share ${expectedShare}`);
            expenseFound = true;
          }
        }
      }

      // If still not found and we have attempts left, try clicking "Show more"
      if (!expenseFound && attempts <= maxAttempts) {
        console.log(`Expense not found on attempt ${attempts}, looking for "Show more" button`);
        
        // Look for "Show more" button using data-test-id
        const showMoreButton = this.authenticatedPage.page.locator('[data-test-id="show-more-button"]');
        
        if (await showMoreButton.isVisible({ timeout: 2000 })) {
          console.log("Clicking 'Show more' button to load more expenses");
          await showMoreButton.click();
          await this.authenticatedPage.page.waitForTimeout(2000); // Wait for new expenses to load
        } else {
          console.log("No 'Show more' button found, stopping pagination attempts");
          break;
        }
      }
    }

    expect(expenseFound).toBe(true);
  }

  async verifyExpenseNotPresent(description: string) {
    console.log("verifyExpenseNotPresent", "description", description);
    
    // Check that no expense items contain this description using only data-test-id
    const expenseSelectors = [
      '[data-test-id="transaction-item"]', 
      '[data-test-id="expense-item"]',
      '[data-test-id="transaction-card"]'
    ];

    for (const selector of expenseSelectors) {
      const itemsWithDescription = await this.authenticatedPage.page.locator(selector).filter({ hasText: description }).count();
      expect(itemsWithDescription).toBe(0);
    }
    
    console.log(`Verified expense not present: ${description}`);
  }

  async verifyFormDefaults(expectedCurrency: string, expectedSplits: Record<string, string>) {
    // Verify currency selector has expected default
    await expect(this.authenticatedPage.page.locator('[data-test-id="currency-select"]')).toHaveValue(expectedCurrency);

    // Verify percentage inputs have expected defaults
    for (const userId in expectedSplits) {
      const expectedPercentage = expectedSplits[userId];
      await expect(this.authenticatedPage.page.locator(`[data-test-id="percentage-input-${userId}"]`)).toHaveValue(expectedPercentage);
    }
  }

  async getCurrentFormValues() {
    // Wait for form to be fully loaded
    await this.authenticatedPage.page.waitForSelector('[data-test-id="currency-select"]', { timeout: 10000 });
    
    const currency = await this.authenticatedPage.page.locator('[data-test-id="currency-select"]').inputValue();
    const description = await this.authenticatedPage.page.locator('[data-test-id="description-input"]').inputValue();
    const amount = await this.authenticatedPage.page.locator('[data-test-id="amount-input"]').inputValue();
    const pin = await this.authenticatedPage.page.locator('[data-test-id="pin-input"]').inputValue();

    // Get percentage values for each user with more robust selection
    const percentages: Record<string, string> = {};
    
    // Wait for percentage inputs to be visible
    await this.authenticatedPage.page.waitForTimeout(1000);
    
    // Try to find percentage inputs specifically for users 1 and 2
    const user1Input = this.authenticatedPage.page.locator('[data-test-id="percentage-input-1"]');
    const user2Input = this.authenticatedPage.page.locator('[data-test-id="percentage-input-2"]');
    
    if (await user1Input.isVisible({ timeout: 5000 })) {
      percentages['1'] = await user1Input.inputValue();
      console.log('User 1 percentage:', percentages['1']);
    } else {
      console.log('User 1 percentage input not found');
    }
    
    if (await user2Input.isVisible({ timeout: 5000 })) {
      percentages['2'] = await user2Input.inputValue();
      console.log('User 2 percentage:', percentages['2']);
    } else {
      console.log('User 2 percentage input not found');
    }

    console.log('Current form values:', { currency, description, amount, pin, percentages });
    return { currency, description, amount, pin, percentages };
  }

  async setCustomSplitPercentages(splits: Record<string, number>) {
    for (const userId in splits) {
      const percentage = splits[userId];
      await this.authenticatedPage.page.fill(`[data-test-id="percentage-input-${userId}"]`, percentage.toString());
    }
  }

  async verifyFormElementsVisible() {
    // Verify all main form elements are present
    await expect(this.authenticatedPage.page.locator('[data-test-id="description-input"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="amount-input"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="currency-select"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="paid-by-select"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="pin-input"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="submit-button"]')).toBeVisible();
  }
}

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
    
    // Since authenticatedPage uses real login data, verify the defaults are set correctly
    // The test data should have metadata with default values
    await expenseHelper.verifyFormDefaults('USD', { '1': '50', '2': '50' });
  });

  test('should preserve user-modified percentages within dashboard session but reset after navigation', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Verify initial default percentages (from user metadata)
    const initialFormValues = await expenseHelper.getCurrentFormValues();
    expect(initialFormValues.percentages['1']).toBe('50');
    expect(initialFormValues.percentages['2']).toBe('50');
    
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
    
    // Verify percentages reset to defaults (50/50 from user metadata) after navigation
    const afterNavigationValues = await expenseHelper.getCurrentFormValues();
    expect(afterNavigationValues.percentages['1']).toBe('50');
    expect(afterNavigationValues.percentages['2']).toBe('50');
  });

  test('should reset custom currency selection to default after navigation', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Verify initial default currency (from user metadata)
    const initialFormValues = await expenseHelper.getCurrentFormValues();
    expect(initialFormValues.currency).toBe('USD'); // This is the default from user metadata
    
    // Change currency to EUR for this expense
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', 'EUR');
    
    // Add an expense with EUR currency
    const expense = { ...testData.expenses.groceries, amount: 100, currency: 'EUR' };
    const result = await expenseHelper.addExpenseEntry(expense);
    
    // Navigate to expenses page to verify the expense was actually added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(2000);
    await expenseHelper.verifyExpensesPageComponents();
    
    // Verify the specific expense we added is visible with EUR currency (50/50 split: User 1 paid €100, owes €50, share = +€50.00)
    await expenseHelper.verifySpecificExpenseEntry(result.description, '100', 'EUR', '+€50.00');
    
    // Navigate back to Add page to check currency resets to default
    await authenticatedPage.navigateToPage('Add');
    
    // Verify currency selection resets to default (USD from user metadata)
    const formValues = await expenseHelper.getCurrentFormValues();
    expect(formValues.currency).toBe('USD');
  });

  test('should successfully add a new expense with custom split and verify on expenses page', async ({ authenticatedPage }) => {
    const expenseHelper = new ExpenseTestHelper(authenticatedPage);
    
    await expect(authenticatedPage.page).toHaveURL('/');
    
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
    
    // Verify percentages reset to defaults (50/50 from user metadata) after navigation
    expect(formValues.percentages['1']).toBe('50');
    expect(formValues.percentages['2']).toBe('50');
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
    const usdResult = await expenseHelper.addExpenseEntry(usdExpense);
    
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
    const eurResult = await expenseHelper.addExpenseEntry(eurExpense);
    
    // Navigate to expenses page to verify both expenses were added
    await authenticatedPage.navigateToPage('Expenses');
    await authenticatedPage.page.waitForTimeout(3000);
    await expenseHelper.verifyExpensesPageComponents();
    
    // Verify both expenses are visible (pagination handling will find older expenses)
    await expenseHelper.verifySpecificExpenseEntry(eurResult.description, '85', 'EUR', '-€42.50');
    await expenseHelper.verifySpecificExpenseEntry(usdResult.description, '150', 'USD', '+$75.00');
  });
}); 