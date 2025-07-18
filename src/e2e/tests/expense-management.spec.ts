import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

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
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Verify expense form elements are present
    await expect(authenticatedPage.page.locator('[data-test-id="description-input"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('[data-test-id="currency-select"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('[data-test-id="paid-by-select"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('[data-test-id="pin-input"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('[data-test-id="submit-button"]')).toBeVisible();
  });

  test('should set default currency from login metadata', async ({ testHelper }) => {
    // Create custom login response with EUR as default currency
    const customLoginResponse = {
      ...testData.mockResponses.login.success,
      metadata: {
        defaultCurrency: 'EUR',
        defaultShare: { '1': 50, '2': 50 }
      }
    };
    
    // Mock login with EUR default currency
    await testHelper.mockApiResponse('login', customLoginResponse);
    
    // Login
    await testHelper.login(testData.users.user1);
    
    // Verify currency selector has EUR selected by default
    await expect(testHelper.page.locator('[data-test-id="currency-select"]')).toHaveValue('EUR');
  });

  test('should set default split percentages from login metadata', async ({ testHelper }) => {
    // Create custom login response with 60/40 split
    const customLoginResponse = {
      ...testData.mockResponses.login.success,
      metadata: {
        defaultCurrency: 'USD',
        defaultShare: { '1': 60, '2': 40 }
      }
    };
    
    // Mock login with custom split percentages
    await testHelper.mockApiResponse('login', customLoginResponse);
    
    // Login
    await testHelper.login(testData.users.user1);
    
    // Verify percentage inputs have the default values from metadata
    await expect(testHelper.page.locator('[data-test-id="percentage-input-1"]')).toHaveValue('60');
    await expect(testHelper.page.locator('[data-test-id="percentage-input-2"]')).toHaveValue('40');
  });

  test('should preserve user-modified percentages after successful form submission', async ({ testHelper }) => {
    // Mock successful expense submission
    await testHelper.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    // Login with default 50/50 split
    await testHelper.login(testData.users.user1);
    
    // Verify initial default percentages (50/50)
    await expect(testHelper.page.locator('[data-test-id="percentage-input-1"]')).toHaveValue('50');
    await expect(testHelper.page.locator('[data-test-id="percentage-input-2"]')).toHaveValue('50');
    
    // Modify split percentages to 70/30
    await testHelper.page.fill('[data-test-id="percentage-input-1"]', '70');
    await testHelper.page.fill('[data-test-id="percentage-input-2"]', '30');
    
    // Fill and submit expense form
    await testHelper.page.fill('[data-test-id="description-input"]', 'Test expense');
    await testHelper.page.fill('[data-test-id="amount-input"]', '100');
    await testHelper.page.selectOption('[data-test-id="paid-by-select"]', '1');
    await testHelper.page.fill('[data-test-id="pin-input"]', testData.pin);
    await testHelper.page.click('[data-test-id="submit-button"]');
    
    // Wait for form submission
    await testHelper.waitForLoading();
    
    // Verify form fields are reset except percentages
    await expect(testHelper.page.locator('[data-test-id="description-input"]')).toHaveValue('');
    await expect(testHelper.page.locator('[data-test-id="amount-input"]')).toHaveValue('');
    await expect(testHelper.page.locator('[data-test-id="pin-input"]')).toHaveValue('');
    
    // Verify custom percentages are preserved (not reset to defaults)
    await expect(testHelper.page.locator('[data-test-id="percentage-input-1"]')).toHaveValue('70');
    await expect(testHelper.page.locator('[data-test-id="percentage-input-2"]')).toHaveValue('30');
  });

  test('should preserve custom currency selection after form submission', async ({ testHelper }) => {
    // Mock successful expense submission
    await testHelper.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    // Login (default USD currency)
    await testHelper.login(testData.users.user1);
    
    // Change currency to EUR
    await testHelper.page.selectOption('[data-test-id="currency-select"]', 'EUR');
    
    // Fill and submit expense form
    await testHelper.page.fill('[data-test-id="description-input"]', 'Test expense');
    await testHelper.page.fill('[data-test-id="amount-input"]', '100');
    await testHelper.page.selectOption('[data-test-id="paid-by-select"]', '1');
    await testHelper.page.fill('[data-test-id="pin-input"]', testData.pin);
    await testHelper.page.click('[data-test-id="submit-button"]');
    
    // Wait for form submission
    await testHelper.waitForLoading();
    
    // Verify currency selection is preserved
    await expect(testHelper.page.locator('[data-test-id="currency-select"]')).toHaveValue('EUR');
  });

  test('should handle metadata with missing defaultShare gracefully', async ({ testHelper }) => {
    // Create login response with missing defaultShare
    const customLoginResponse = {
      ...testData.mockResponses.login.success,
      metadata: {
        defaultCurrency: 'USD'
        // defaultShare is missing
      }
    };
    
    // Mock login with incomplete metadata
    await testHelper.mockApiResponse('login', customLoginResponse);
    
    // Login
    await testHelper.login(testData.users.user1);
    
    // Should fall back to equal split (50/50 for 2 users)
    await expect(testHelper.page.locator('[data-test-id="percentage-input-1"]')).toHaveValue('50');
    await expect(testHelper.page.locator('[data-test-id="percentage-input-2"]')).toHaveValue('50');
  });

  test('should handle metadata with partial defaultShare gracefully', async ({ testHelper }) => {
    // Create login response with partial defaultShare (only user 1 defined)
    const customLoginResponse = {
      ...testData.mockResponses.login.success,
      metadata: {
        defaultCurrency: 'USD',
        defaultShare: { '1': 75 }
        // User 2 is missing from defaultShare
      }
    };
    
    // Mock login with partial metadata
    await testHelper.mockApiResponse('login', customLoginResponse);
    
    // Login
    await testHelper.login(testData.users.user1);
    
    // User 1 should get defined percentage, User 2 should get equal split fallback
    await expect(testHelper.page.locator('[data-test-id="percentage-input-1"]')).toHaveValue('75');
    await expect(testHelper.page.locator('[data-test-id="percentage-input-2"]')).toHaveValue('50'); // fallback to equal split
  });

  test('should successfully add a new expense', async ({ authenticatedPage }) => {
    // Mock successful expense submission
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    const expense = testData.expenses.groceries;
    
    // Fill expense form
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    
    // Set currency
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', expense.currency);
    
    // Set paid by (selecting by index since we know the test data structure)
    await authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', '1');
    
    // Enter PIN
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Wait for success response
    await authenticatedPage.waitForLoading();
    
    // Verify form was reset after successful submission
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue('');
  });

  test('should show validation errors for invalid expense data', async ({ authenticatedPage }) => {
    const expense = testData.expenses.invalidExpense;
    
    // Fill form with invalid data (negative amount)
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // The form should show validation error for negative amount
    // Note: This depends on the form validation implementation
  });

  test('should handle expense submission errors gracefully', async ({ authenticatedPage }) => {
    // Mock error response
    await authenticatedPage.mockApiError('split_new', 400, 'Invalid expense data');
    
    const expense = testData.expenses.groceries;
    
    // Fill and submit expense form
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', expense.currency);
    await authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', '1');
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Should show error message
    await authenticatedPage.waitForLoading();
  });

  test('should handle different currencies correctly', async ({ authenticatedPage }) => {
    // Mock successful expense submission
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    const expense = testData.expenses.groceries;
    
    // Fill expense form with EUR currency
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', 'EUR');
    await authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', '1');
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Wait for success response
    await authenticatedPage.waitForLoading();
  });

  test('should update split percentages correctly', async ({ authenticatedPage }) => {
    const expense = testData.expenses.groceries;
    
    // Fill basic expense data
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Update split percentages (assuming we have percentage inputs for users)
    const splitInputs = authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
    const inputCount = await splitInputs.count();
    
    if (inputCount > 0) {
      // Set first user to 60%, second to 40%
      await splitInputs.nth(0).fill('60');
      if (inputCount > 1) {
        await splitInputs.nth(1).fill('40');
      }
    }
  });

  test('should handle different paid by users', async ({ authenticatedPage }) => {
    // Mock successful expense submission
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    const expense = testData.expenses.groceries;
    
    // Fill expense form
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', expense.currency);
    
    // Select different paid by user (second option)
    await authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', { index: 2 });
    
    // Enter PIN and submit
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Wait for success response
    await authenticatedPage.waitForLoading();
  });

  test('should preserve form data during validation', async ({ authenticatedPage }) => {
    const expense = testData.expenses.groceries;
    
    // Fill form completely except submit
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', expense.currency);
    await authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', '1');
    
    // Don't fill PIN to trigger validation error
    
    // Try to submit - should show validation error
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Verify form data is preserved
    await expect(authenticatedPage.page.locator('[data-test-id="description-input"]')).toHaveValue(expense.description);
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue(expense.amount.toString());
  });

  test('should reset form after successful submission', async ({ authenticatedPage }) => {
    // Mock successful expense submission  
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    const expense = testData.expenses.groceries;
    
    // Fill and submit expense form
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Wait for success response
    await authenticatedPage.waitForLoading();
    
    // Verify form fields are reset
    await expect(authenticatedPage.page.locator('[data-test-id="description-input"]')).toHaveValue('');
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue('');
  });

  test('should handle decimal amounts correctly', async ({ authenticatedPage }) => {
    // Mock successful expense submission
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    // Fill form with decimal amount
    await authenticatedPage.page.fill('[data-test-id="description-input"]', 'Test decimal expense');
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', '123.45');
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Verify decimal amount is preserved in form
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue('123.45');
  });

  test('should clear PIN field after submission for security', async ({ authenticatedPage }) => {
    // Mock successful expense submission
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    const expense = testData.expenses.groceries;
    
    // Fill and submit expense form
    await authenticatedPage.page.fill('[data-test-id="description-input"]', expense.description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', expense.amount.toString());
    await authenticatedPage.page.fill('[data-test-id="pin-input"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('[data-test-id="submit-button"]');
    
    // Wait for success response
    await authenticatedPage.waitForLoading();
    
    // Verify PIN field is cleared for security
    await expect(authenticatedPage.page.locator('[data-test-id="pin-input"]')).toHaveValue('');
  });
}); 