import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Integration Tests - Complete User Workflows', () => {
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

  test('complete expense tracking workflow', async ({ testHelper }) => {
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.mockApiResponse('split_new', { message: 'Expense added successfully' });
    await testHelper.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await testHelper.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // 1. Login
    await testHelper.login(testData.users.user1);
    await expect(testHelper.page).toHaveURL('/');
    
    // 2. Add an expense
    const expense = testData.expenses.groceries;
    await testHelper.page.fill('input[placeholder="Description"]', expense.description);
    await testHelper.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await testHelper.page.selectOption('select[name="currency"]', expense.currency);
    await testHelper.page.fill('input[placeholder="PIN"]', testData.pin);
    await testHelper.page.click('button[type="submit"]');
    await testHelper.waitForLoading();
    
    // 3. Check transactions
    await testHelper.navigateToPage('Expenses');
    await expect(testHelper.page.locator('.transaction-item')).toHaveCount(1);
    
    // 4. Check balances
    await testHelper.navigateToPage('Balances');
    await expect(testHelper.page.locator('.balance-user')).toHaveCount(2);
    
    // 5. Logout
    await testHelper.logout();
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('complete budget management workflow', async ({ testHelper }) => {
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.mockApiResponse('budget', { message: 'Budget added successfully' });
    await testHelper.mockApiResponse('budget_total', testData.mockResponses.budgetTotal.success);
    await testHelper.mockApiResponse('budget_list', testData.mockResponses.budgetList.success);
    await testHelper.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);
    
    // 1. Login
    await testHelper.login(testData.users.user1);
    
    // 2. Add a budget entry
    const budget = testData.budgets.houseCredit;
    const budgetForm = testHelper.page.locator('form').nth(1);
    await budgetForm.locator('select').selectOption(budget.name);
    await budgetForm.locator('input[value="Credit"]').check();
    await testHelper.page.fill('input[placeholder="Description"]', `${budget.type} for ${budget.name}`);
    await testHelper.page.fill('input[placeholder="Amount"]', budget.amount.toString());
    await testHelper.page.fill('input[placeholder="PIN"]', testData.pin);
    await budgetForm.locator('button[type="submit"]').click();
    await testHelper.waitForLoading();
    
    // 3. Check budget page
    await testHelper.navigateToPage('Budget');
    await testHelper.page.selectOption('select', 'house');
    await testHelper.waitForLoading();
    await expect(testHelper.page.locator('.budget-entry')).toHaveCount(2);
    
    // 4. Check monthly budget
    await testHelper.navigateToPage('Monthly Budget');
    await testHelper.page.selectOption('select', 'house');
    await testHelper.waitForLoading();
    await expect(testHelper.page.locator('.recharts-wrapper')).toBeVisible();
    
    // 5. Logout
    await testHelper.logout();
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('navigation and routing workflow', async ({ testHelper }) => {
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await testHelper.mockApiResponse('balances', testData.mockResponses.balances.success);
    await testHelper.mockApiResponse('budget_total', testData.mockResponses.budgetTotal.success);
    await testHelper.mockApiResponse('budget_list', testData.mockResponses.budgetList.success);
    await testHelper.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);
    
    // 1. Login
    await testHelper.login(testData.users.user1);
    
    // 2. Navigate through all pages
    const pages: Array<'Add' | 'Expenses' | 'Balances' | 'Budget' | 'Monthly Budget'> = [
      'Add', 'Expenses', 'Balances', 'Budget', 'Monthly Budget'
    ];
    
    for (const page of pages) {
      await testHelper.navigateToPage(page);
      await testHelper.waitForLoading();
      
      // Verify page loaded correctly
      const urlMap = {
        'Add': '/',
        'Expenses': '/expenses',
        'Balances': '/balances',
        'Budget': '/budget',
        'Monthly Budget': '/monthly-budget'
      };
      
      await expect(testHelper.page).toHaveURL(urlMap[page]);
    }
    
    // 3. Test browser navigation
    await testHelper.page.goBack();
    await expect(testHelper.page).toHaveURL('/budget');
    
    await testHelper.page.goForward();
    await expect(testHelper.page).toHaveURL('/monthly-budget');
    
    // 4. Logout
    await testHelper.logout();
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('error handling and recovery workflow', async ({ testHelper }) => {
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    // 1. Login successfully
    await testHelper.login(testData.users.user1);
    
    // 2. Test expense submission error
    await testHelper.mockApiError('split_new', 400, 'Invalid expense data');
    const expense = testData.expenses.groceries;
    await testHelper.page.fill('input[placeholder="Description"]', expense.description);
    await testHelper.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await testHelper.page.fill('input[placeholder="PIN"]', testData.pin);
    await testHelper.page.click('button[type="submit"]');
    await testHelper.waitForLoading();
    
    // Verify error is handled gracefully
    await expect(testHelper.page).toHaveURL('/');
    
    // 3. Test authentication error
    await testHelper.mockApiError('transactions_list', 401, 'Unauthorized');
    await testHelper.navigateToPage('Expenses');
    
    // Should show login form on root page
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
    
    // 4. Re-login after auth error
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.login(testData.users.user1);
    await expect(testHelper.page).toHaveURL('/');
  });

  test('multi-currency and complex splitting workflow', async ({ testHelper }) => {
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.mockApiResponse('split_new', { message: 'Expense added successfully' });
    await testHelper.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // 1. Login
    await testHelper.login(testData.users.user1);
    
    // 2. Add expense with custom split
    const expense = testData.expenses.restaurant;
    await testHelper.page.fill('input[placeholder="Description"]', expense.description);
    await testHelper.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await testHelper.page.selectOption('select[name="currency"]', 'EUR');
    
    // Set custom split percentages
    const splitInputs = testHelper.page.locator('.SplitPercentageInput input[type="number"]');
    await splitInputs.nth(0).fill('40');
    await splitInputs.nth(1).fill('60');
    
    // Change who paid
    await testHelper.page.selectOption('select[name="paidBy"]', '2');
    
    await testHelper.page.fill('input[placeholder="PIN"]', testData.pin);
    await testHelper.page.click('button[type="submit"]');
    await testHelper.waitForLoading();
    
    // 3. Verify split percentages were saved
    await expect(splitInputs.nth(0)).toHaveValue('40');
    await expect(splitInputs.nth(1)).toHaveValue('60');
    
    // 4. Check balances with multi-currency
    await testHelper.navigateToPage('Balances');
    await expect(testHelper.page.locator('.balance-currency:has-text("USD")')).toBeVisible();
    await expect(testHelper.page.locator('.balance-currency:has-text("EUR")')).toBeVisible();
    
    // 5. Logout
    await testHelper.logout();
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('mobile responsive workflow', async ({ testHelper }) => {
    // Set mobile viewport
    await testHelper.page.setViewportSize({ width: 375, height: 667 });
    
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.mockApiResponse('split_new', { message: 'Expense added successfully' });
    
    // 1. Login on mobile
    await testHelper.login(testData.users.user1);
    
    // 2. Verify mobile layout
    await expect(testHelper.page.locator('.Sidebar')).toBeVisible();
    
    // 3. Add expense on mobile
    const expense = testData.expenses.groceries;
    await testHelper.page.fill('input[placeholder="Description"]', expense.description);
    await testHelper.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    await testHelper.page.fill('input[placeholder="PIN"]', testData.pin);
    await testHelper.page.click('button[type="submit"]');
    await testHelper.waitForLoading();
    
    // 4. Test mobile navigation
    if (await testHelper.page.locator('.mobile-menu-toggle').isVisible()) {
      await testHelper.page.click('.mobile-menu-toggle');
      await expect(testHelper.page.locator('.mobile-menu')).toBeVisible();
    }
    
    // 5. Logout
    await testHelper.logout();
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('session persistence and recovery workflow', async ({ testHelper }) => {
    // Set up API mocks
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    // 1. Login
    await testHelper.login(testData.users.user1);
    
    // 2. Refresh page
    await testHelper.page.reload();
    
    // 3. Verify session is maintained
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
    
    // 4. Navigate to different page
    await testHelper.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await testHelper.navigateToPage('Expenses');
    
    // 5. Refresh again
    await testHelper.page.reload();
    
    // 6. Verify still on same page
    await expect(testHelper.page).toHaveURL('/expenses');
    
    // 7. Logout
    await testHelper.logout();
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });
}); 