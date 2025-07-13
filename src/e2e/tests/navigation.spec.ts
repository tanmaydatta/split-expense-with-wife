import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Navigation and Routing', () => {
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

  test('should display sidebar navigation', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.page).toHaveURL('/');
    
    // Verify sidebar is visible
    await expect(authenticatedPage.page.locator('.Sidebar')).toBeVisible();
    
    // Verify all navigation items are present
    await expect(authenticatedPage.page.locator('.SidebarItem:has-text("Add")')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem:has-text("Expenses")')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem:has-text("Balances")')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem:has-text("Budget")')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem:has-text("Monthly Budget")')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem.logout')).toBeVisible();
  });

  test('should navigate to Add page', async ({ authenticatedPage }) => {
    await authenticatedPage.navigateToPage('Add');
    
    // Verify URL and page content
    await expect(authenticatedPage.page).toHaveURL('/');
    await expect(authenticatedPage.page.locator('input[placeholder="Description"]')).toBeVisible();
    await expect(authenticatedPage.page.locator('input[placeholder="Amount"]')).toBeVisible();
  });

  test('should navigate to Expenses page', async ({ authenticatedPage }) => {
    // Mock transactions data
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify URL and page content
    await expect(authenticatedPage.page).toHaveURL('/expenses');
    await expect(authenticatedPage.page.locator('.transaction-list')).toBeVisible();
  });

  test('should navigate to Balances page', async ({ authenticatedPage }) => {
    // Mock balances data
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify URL and page content
    await expect(authenticatedPage.page).toHaveURL('/balances');
    await expect(authenticatedPage.page.locator('.balance-summary')).toBeVisible();
  });

  test('should navigate to Budget page', async ({ authenticatedPage }) => {
    // Mock budget data
    await authenticatedPage.mockApiResponse('budget_total', testData.mockResponses.budgetTotal.success);
    await authenticatedPage.mockApiResponse('budget_list', testData.mockResponses.budgetList.success);
    
    await authenticatedPage.navigateToPage('Budget');
    
    // Verify URL and page content
    await expect(authenticatedPage.page).toHaveURL('/budget');
    await expect(authenticatedPage.page.locator('select')).toBeVisible(); // Budget selector
  });

  test('should navigate to Monthly Budget page', async ({ authenticatedPage }) => {
    // Mock monthly budget data
    await authenticatedPage.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);
    
    await authenticatedPage.navigateToPage('Monthly Budget');
    
    // Verify URL and page content
    await expect(authenticatedPage.page).toHaveURL('/monthly-budget');
    await expect(authenticatedPage.page.locator('.chart-container')).toBeVisible();
  });

  test('should handle direct URL navigation', async ({ authenticatedPage }) => {
    // Mock necessary data
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    
    // Navigate directly to expenses page
    await authenticatedPage.page.goto('/expenses');
    
    // Verify correct page is loaded
    await expect(authenticatedPage.page).toHaveURL('/expenses');
    await expect(authenticatedPage.page.locator('.transaction-list')).toBeVisible();
  });

  test('should handle URL parameters in monthly budget', async ({ authenticatedPage }) => {
    // Mock monthly budget data
    await authenticatedPage.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);
    
    // Navigate to specific budget
    await authenticatedPage.page.goto('/monthly-budget/house');
    
    // Verify URL and budget selection
    await expect(authenticatedPage.page).toHaveURL('/monthly-budget/house');
    await expect(authenticatedPage.page.locator('select')).toHaveValue('house');
  });

  test('should highlight active navigation item', async ({ authenticatedPage }) => {
    // Navigate to expenses page
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify active state (this depends on how active states are implemented)
    await expect(authenticatedPage.page.locator('.SidebarItem.active:has-text("Expenses")')).toBeVisible();
  });

  test('should handle browser back and forward navigation', async ({ authenticatedPage }) => {
    // Mock data for different pages
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Navigate to expenses page
    await authenticatedPage.navigateToPage('Expenses');
    await expect(authenticatedPage.page).toHaveURL('/expenses');
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    await expect(authenticatedPage.page).toHaveURL('/balances');
    
    // Use browser back button
    await authenticatedPage.page.goBack();
    await expect(authenticatedPage.page).toHaveURL('/expenses');
    
    // Use browser forward button
    await authenticatedPage.page.goForward();
    await expect(authenticatedPage.page).toHaveURL('/balances');
  });

  test('should handle navigation with authentication errors', async ({ authenticatedPage }) => {
    // Mock 401 error for expenses page
    await authenticatedPage.mockApiError('transactions_list', 401, 'Unauthorized');
    
    // Try to navigate to expenses page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Should show login form on root page
    await expect(authenticatedPage.page).toHaveURL('/');
    await expect(authenticatedPage.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should preserve sidebar state across navigation', async ({ authenticatedPage }) => {
    // Mock data for different pages
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Navigate to expenses page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify sidebar is still visible
    await expect(authenticatedPage.page.locator('.Sidebar')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem')).toBeVisible();
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify sidebar is still visible
    await expect(authenticatedPage.page.locator('.Sidebar')).toBeVisible();
    await expect(authenticatedPage.page.locator('.SidebarItem')).toBeVisible();
  });

  test('should handle navigation shortcuts or hotkeys', async ({ authenticatedPage }) => {
    // If keyboard shortcuts are implemented, test them
    await authenticatedPage.page.keyboard.press('1');
    
    // Check if navigation occurred (depends on implementation)
    // This test may need adjustment based on actual keyboard shortcuts
  });

  test('should handle mobile navigation', async ({ authenticatedPage }) => {
    // Set mobile viewport
    await authenticatedPage.page.setViewportSize({ width: 375, height: 667 });
    
    // Verify mobile navigation (hamburger menu, etc.)
    if (await authenticatedPage.page.locator('.mobile-menu-toggle').isVisible()) {
      await authenticatedPage.page.click('.mobile-menu-toggle');
      await expect(authenticatedPage.page.locator('.mobile-menu')).toBeVisible();
    }
  });

  test('should handle deep linking to specific budget', async ({ authenticatedPage }) => {
    // Mock budget data
    await authenticatedPage.mockApiResponse('budget_total', testData.mockResponses.budgetTotal.success);
    await authenticatedPage.mockApiResponse('budget_list', testData.mockResponses.budgetList.success);
    
    // Navigate directly to budget page with query parameters
    await authenticatedPage.page.goto('/budget?category=house');
    
    // Verify correct budget is selected
    await expect(authenticatedPage.page).toHaveURL('/budget?category=house');
    // Additional assertions based on how query parameters are handled
  });

  test('should handle logout navigation', async ({ authenticatedPage }) => {
    // Mock logout response
    await authenticatedPage.mockApiResponse('logout', {}, 'POST');
    
    // Click logout
    await authenticatedPage.page.click('.SidebarItem.logout');
    
    // Verify logout and redirect to root with login form
    await expect(authenticatedPage.page).toHaveURL('/');
    await expect(authenticatedPage.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should handle navigation loading states', async ({ authenticatedPage }) => {
    // Mock delayed response
    await authenticatedPage.page.route('**/.netlify/functions/transactions_list', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.transactions.success)
      });
    });
    
    // Navigate to expenses page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify loading state is shown
    await expect(authenticatedPage.page.locator('.loader')).toBeVisible();
    
    // Wait for loading to complete
    await authenticatedPage.waitForLoading();
    await expect(authenticatedPage.page.locator('.loader')).not.toBeVisible();
  });

  test('should handle navigation with network errors', async ({ authenticatedPage }) => {
    // Mock network error
    await authenticatedPage.page.route('**/.netlify/functions/transactions_list', (route) => {
      route.abort('failed');
    });
    
    // Try to navigate to expenses page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify error handling
    await expect(authenticatedPage.page.locator('.error-message')).toBeVisible();
  });

  test('should maintain URL consistency', async ({ authenticatedPage }) => {
    // Mock data
    await authenticatedPage.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);
    
    // Navigate to monthly budget with parameter
    await authenticatedPage.navigateToPage('Monthly Budget');
    
    // Change budget selection
    await authenticatedPage.page.selectOption('select', 'food');
    
    // Verify URL is updated
    await expect(authenticatedPage.page).toHaveURL('/monthly-budget/food');
  });

  test('should handle navigation accessibility', async ({ authenticatedPage }) => {
    // Test keyboard navigation
    await authenticatedPage.page.keyboard.press('Tab');
    
    // Verify focus is on navigation items
    await expect(authenticatedPage.page.locator('.SidebarItem:focus')).toBeVisible();
    
    // Test Enter key navigation
    await authenticatedPage.page.keyboard.press('Enter');
    
    // Verify navigation occurred
    // This test depends on focus management implementation
  });

  test('should handle concurrent navigation requests', async ({ authenticatedPage }) => {
    // Mock data for different pages
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Rapidly click different navigation items
    await authenticatedPage.page.click('.SidebarItem:has-text("Expenses")');
    await authenticatedPage.page.click('.SidebarItem:has-text("Balances")');
    
    // Verify final navigation state
    await expect(authenticatedPage.page).toHaveURL('/balances');
    await expect(authenticatedPage.page.locator('.balance-summary')).toBeVisible();
  });
}); 