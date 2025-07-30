import { Page, expect } from '@playwright/test';

/**
 * Get CI-aware timeout for selectors (50% longer on CI)
 */
export function getCITimeout(defaultTimeout: number = 10000): number {
  return process.env.CI ? Math.round(defaultTimeout * 1.5) : defaultTimeout;
}

export interface TestUser {
  username: string;
  password: string;
  firstName: string;
  userId: number;
}

export interface TestExpense {
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitPercentages: Record<string, number>;
}

export interface TestBudget {
  name: string;
  amount: number;
  currency: string;
  type: 'Credit' | 'Debit';
}

/**
 * Get current user ID from Redux state
 */
export async function getCurrentUserId(testHelper: TestHelper): Promise<string> {
  // Get current user ID from sidebar welcome message
  const currentUrl = testHelper.page.url();
  // Wait a moment for page to be fully loaded
  await testHelper.page.waitForTimeout(1000);
  
  // Check if we're on mobile
  const isMobile = await testHelper.isMobile();
  
  // If mobile, click hamburger menu to open sidebar
  if (isMobile) {
    const hamburgerButton = testHelper.page.locator('button:has(span)').first();
    if (await hamburgerButton.count() > 0) {
      await hamburgerButton.click();
      await testHelper.page.waitForTimeout(500); // Wait for sidebar to open
    }
  }
  
  // Look for sidebar welcome message with user ID
  const welcomeElement = testHelper.page.locator('[data-test-id^="sidebar-welcome-"]');
  if (await welcomeElement.count() > 0) {
    const testId = await welcomeElement.getAttribute('data-test-id');
    
    if (testId && testId.startsWith('sidebar-welcome-')) {
      // Extract user ID from data-test-id like "sidebar-welcome-{userId}"
      const userId = testId.replace('sidebar-welcome-', '');
      
      // If mobile, close sidebar by clicking hamburger again
      if (isMobile) {
        // const hamburgerButton = testHelper.page.locator('button:has(span)').first();
        // if (await hamburgerButton.count() > 0) {
        //   await hamburgerButton.click();
        //   await testHelper.page.waitForTimeout(500); // Wait for sidebar to close
        // }
        await testHelper.page.goto(currentUrl);
      }
      
      return userId;
    }
  }
  
  // If mobile and sidebar didn't work, close it anyway
  if (isMobile) {
    await testHelper.page.goto(currentUrl);
  }
  
  throw new Error('Could not get current user ID from sidebar welcome message. Make sure user is logged in and the page has loaded completely.');
}

export class TestHelper {
  constructor(public page: Page) {}

  /**
   * Check if we're on mobile viewport
   */
  async isMobile(): Promise<boolean> {
    const viewport = this.page.viewportSize();
    return viewport ? viewport.width <= 768 : false;
  }

  /**
   * Navigate to root page and authenticate user
   */
  async login(user: TestUser): Promise<void> {
    await this.page.goto('/login');
    await this.page.waitForSelector('[data-test-id="username-input"]');
    await this.page.waitForTimeout(2000);

    await this.page.fill('[data-test-id="username-input"]', user.username);
    await this.page.fill('[data-test-id="password-input"]', user.password);
    await this.page.click('[data-test-id="login-button"]');
    
    // Wait for redirect to home page after successful login
    await this.page.waitForURL('/');
    console.log('Redirected to home page');
    
    // Wait for dashboard elements to load
    await this.page.waitForSelector('[data-test-id="dashboard-container"]', { timeout: getCITimeout(10000) });
    console.log('Dashboard loaded successfully');
    await this.page.waitForTimeout(1000);
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.page.click('.SidebarItem.logout');
    await this.page.waitForTimeout(2000);
    // Wait for login form to appear after logout
    await expect(this.page.locator('.LoginWrapper')).toBeVisible();
  }

  /**
   * Navigate using sidebar
   */
  async navigateToPage(page: 'Add' | 'Expenses' | 'Balances' | 'Budget' | 'Monthly Budget' | 'Settings'): Promise<void> {
    // Check if we're on mobile
    const isMobile = await this.isMobile();
    
    if (isMobile) {
      // On mobile, first open the sidebar using the hamburger button
      const hamburger = this.page.locator('button:has(span)').first();
      try {
        await hamburger.waitFor({ state: 'visible', timeout: 2000 });
        await hamburger.click();
        // Wait for sidebar to animate in
        await this.page.waitForTimeout(500);
      } catch (_e) {
        // Hamburger button not visible, continue without opening sidebar
      }
    }
    
    // Use text-based selector that works with styled components
    await this.page.click(`text="${page}"`);
    
    // Wait for navigation to complete
    const urlMap = {
      'Add': '/',
      'Expenses': '/expenses',
      'Balances': '/balances',
      'Budget': '/budget',
      'Monthly Budget': '/monthly-budget',
      'Settings': '/settings'
    };
    
    await this.page.goto(urlMap[page]);
    await this.page.waitForTimeout(1000);
  }

  /**
   * Add a new expense
   */
  async addExpense(expense: TestExpense): Promise<void> {
    await this.navigateToPage('Add');
    
    // Fill expense form
    await this.page.fill('input[placeholder="Description"]', expense.description);
    await this.page.fill('input[placeholder="Amount"]', expense.amount.toString());
    
    // Set currency
    await this.page.selectOption('select[name="currency"]', expense.currency);
    
    // Set paid by
    await this.page.selectOption('select[name="paidBy"]', { label: expense.paidBy });
    
    // Set split percentages
    for (const [, percentage] of Object.entries(expense.splitPercentages)) {
      const splitInput = this.page.locator(`input[value="${percentage}"]`).first();
      await splitInput.fill(percentage.toString());
    }
    
    // Submit form
    await this.page.click('button[type="submit"]');
    
    // Wait for success/error response
    await this.page.waitForFunction(() => !document.querySelector('.loader'));
  }

  /**
   * Add a budget entry
   */
  async addBudget(budget: TestBudget): Promise<void> {
    await this.navigateToPage('Add');
    
    // Fill budget form (second form on the page)
    const budgetForm = this.page.locator('form').nth(1);
    
    // Set budget name
    await budgetForm.locator('select').first().selectOption(budget.name);
    
    // Set credit/debit
    await budgetForm.locator(`input[value="${budget.type}"]`).check();
    
    // Fill amount and description in the main form
    await this.page.fill('input[placeholder="Description"]', `${budget.type} for ${budget.name}`);
    await this.page.fill('input[placeholder="Amount"]', budget.amount.toString());
    
    // Set currency
    await this.page.selectOption('select[name="currency"]', budget.currency);
    
    // Submit budget form
    await budgetForm.locator('button[type="submit"]').click();
    
    // Wait for success/error response
    await this.page.waitForFunction(() => !document.querySelector('.loader'));
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoading(): Promise<void> {
    // Use CI-aware timeout for loading states
    await this.page.waitForFunction(() => !document.querySelector('.loader'), { timeout: getCITimeout(10000) });
  }

  /**
   * Get balance information
   */
  async getBalances(): Promise<Record<string, Record<string, number>>> {
    await this.navigateToPage('Balances');
    await this.waitForLoading();
    
    const balances: Record<string, Record<string, number>> = {};
    
    // Extract balance data from the page
    const balanceEntries = await this.page.locator('.BalanceEntry').all();
    
    for (const entry of balanceEntries) {
      const user = await entry.locator('.BalanceUser').textContent();
      const currency = await entry.locator('.BalanceCurrency').textContent();
      const amount = await entry.locator('.BalanceAmount').textContent();
      
      if (user && currency && amount) {
        if (!balances[user]) {
          balances[user] = {};
        }
        balances[user][currency] = parseFloat(amount.replace(/[^0-9.-]/g, ''));
      }
    }
    
    return balances;
  }

  /**
   * Get transaction list
   */
  async getTransactions(): Promise<any[]> {
    await this.navigateToPage('Expenses');
    await this.waitForLoading();
    
    const transactions = await this.page.locator('.transaction-item').all();
    const transactionData = [];
    
    for (const transaction of transactions) {
      const description = await transaction.locator('.transaction-description').textContent();
      const amount = await transaction.locator('.transaction-amount').textContent();
      const date = await transaction.locator('.transaction-date').textContent();
      
      transactionData.push({
        description,
        amount,
        date
      });
    }
    
    return transactionData;
  }

  /**
   * Get budget information
   */
  async getBudgetInfo(budgetName: string): Promise<any> {
    await this.navigateToPage('Budget');
    await this.waitForLoading();
    
    // Select budget
    await this.page.selectOption('select', budgetName);
    await this.waitForLoading();
    
    // Extract budget data
    const budgetData = {
      total: await this.page.locator('.budget-total').textContent(),
      entries: await this.page.locator('.budget-entry').count()
    };
    
    return budgetData;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      await this.page.goto('/');
      // Use CI-aware timeout for sidebar
    await this.page.waitForSelector('.SidebarHeader', { timeout: getCITimeout(5000) });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear browser storage
   */
  async clearStorage(): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  /**
   * Mock API response for testing
   */
  async mockApiResponse(endpoint: string, response: any, method: string = 'POST'): Promise<void> {
    // Use exact production URL pattern that we discovered works
    await this.page.route(`**/.netlify/functions/${endpoint}`, (route) => {
      if (route.request().method() === method) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response)
        });
      } else {
        route.continue();
      }
    });
  }

  /**
   * Mock API error for testing
   */
  async mockApiError(endpoint: string, statusCode: number = 400, errorMessage: string = 'Test error'): Promise<void> {
    // Use exact production URL pattern that we discovered works
    await this.page.route(`**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/${endpoint}`, (route) => {
      route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: JSON.stringify({ error: errorMessage })
      });
    });
  }
} 