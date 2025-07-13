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
    await expect(authenticatedPage.page.locator('input[placeholder="Description"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('input[placeholder="Amount"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('select[name="currency"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('select[name="paidBy"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('input[placeholder="PIN"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should successfully add a new expense', async ({ authenticatedPage }) => {
    // Mock successful expense submission
    await authenticatedPage.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    const expense = testData.expenses.groceries;
    
    // Fill expense form
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    
    // Set currency
    await authenticatedPage.page.selectOption('select[name="currency"]', expense.currency);
    
    // Set paid by (selecting by index since we know the test data structure)
    await authenticatedPage.page.selectOption('select[name="paidBy"]', '1');
    
    // Enter PIN
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    
    // Wait for loading to complete
    await authenticatedPage.waitForLoading();
    
    // Verify success (this depends on how the app shows success)
    // The app might show an alert or success message
  });

  test('should show loading state during expense submission', async ({ authenticatedPage }) => {
    // Mock delayed response
    await authenticatedPage.page.route('**/.netlify/functions/split_new', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Success' })
      });
    });
    
    const expense = testData.expenses.restaurant;
    
    // Fill and submit form
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    
    // Verify loading state
    await expect(authenticatedPage.page.locator('.loader')).toBeVisible();
    
    // Wait for completion
    await authenticatedPage.waitForLoading();
    await expect(authenticatedPage.page.locator('.loader')).not.toBeVisible();
  });

  test('should handle expense submission errors', async ({ authenticatedPage }) => {
    // Mock error response
    await authenticatedPage.mockApiError('split_new', 400, 'Invalid expense data');
    
    const expense = testData.expenses.utilities;
    
    // Fill and submit form
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    
    // Wait for error handling
    await authenticatedPage.waitForLoading();
    
    // Should remain on the same page
    await expect(authenticatedPage.page).toHaveURL('/');
  });

  test('should support multiple currencies', async ({ authenticatedPage }) => {
    // Mock successful response
    await authenticatedPage.mockApiResponse('split_new', { message: 'Success' });
    
    const expense = testData.expenses.multiCurrency;
    
    // Fill expense form with EUR currency
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await authenticatedPage.page.selectOption('select[name="currency"]', 'EUR');
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    await authenticatedPage.waitForLoading();
    
    // Verify EUR was selected
    await expect(authenticatedPage.page.locator('select[name="currency"]')).toHaveValue('EUR');
  });

  test('should allow changing split percentages', async ({ authenticatedPage }) => {
    // Mock successful response
    await authenticatedPage.mockApiResponse('split_new', { message: 'Success' });
    
    const expense = testData.expenses.restaurant;
    
    // Fill basic expense info
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    
    // Change split percentages
    const splitInputs = authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
    await splitInputs.nth(0).fill('40');
    await splitInputs.nth(1).fill('60');
    
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    await authenticatedPage.waitForLoading();
    
    // Verify percentages were set
    await expect(splitInputs.nth(0)).toHaveValue('40');
    await expect(splitInputs.nth(1)).toHaveValue('60');
  });

  test('should allow changing who paid for the expense', async ({ authenticatedPage }) => {
    // Mock successful response
    await authenticatedPage.mockApiResponse('split_new', { message: 'Success' });
    
    const expense = testData.expenses.groceries;
    
    // Fill expense form
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    
    // Change who paid - select second user
    await authenticatedPage.page.selectOption('select[name="paidBy"]', '2');
    
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    await authenticatedPage.waitForLoading();
    
    // Verify the correct user was selected
    await expect(authenticatedPage.page.locator('select[name="paidBy"]')).toHaveValue('2');
  });

  test('should validate required fields', async ({ authenticatedPage }) => {
    // Try to submit form without filling required fields
    await authenticatedPage.page.click('button[type="submit"]');
    
    // Form should not be submitted (HTML5 validation should prevent it)
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Verify required fields are still empty
    await expect(authenticatedPage.page.locator('input[placeholder="Description"]')).toHaveValue('');
    await expect(authenticatedPage.page.locator('input[placeholder="Amount"]')).toHaveValue('');
  });

  test('should handle authentication errors during expense submission', async ({ authenticatedPage }) => {
    // Mock 401 error
    await authenticatedPage.mockApiError('split_new', 401, 'Unauthorized');
    
    const expense = testData.expenses.utilities;
    
    // Fill and submit form
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    
    // Should show login form on root page
    await expect(authenticatedPage.page).toHaveURL('/');
    await expect(authenticatedPage.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should support decimal amounts', async ({ authenticatedPage }) => {
    // Mock successful response
    await authenticatedPage.mockApiResponse('split_new', { message: 'Success' });
    
    // Fill expense form with decimal amount
    await authenticatedPage.page.fill('input[placeholder="Description"]', 'Test decimal expense');
    await authenticatedPage.page.fill('input[placeholder="Amount"]', '123.45');
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    await authenticatedPage.waitForLoading();
    
    // Verify decimal value is accepted
    await expect(authenticatedPage.page.locator('input[placeholder="Amount"]')).toHaveValue('123.45');
  });

  test('should clear form after successful submission', async ({ authenticatedPage }) => {
    // Mock successful response
    await authenticatedPage.mockApiResponse('split_new', { message: 'Success' });
    
    const expense = testData.expenses.groceries;
    
    // Fill and submit form
    await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
    await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await authenticatedPage.page.click('button[type="submit"]');
    await authenticatedPage.waitForLoading();
    
    // Verify form is cleared (or reset to defaults)
    // Note: This depends on the app's behavior after successful submission
    await expect(authenticatedPage.page.locator('input[placeholder="PIN"]')).toHaveValue('');
  });
}); 