import { Page, expect } from '@playwright/test';

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
    await this.page.waitForSelector('[data-test-id="dashboard-container"]', { timeout: 10000 });
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
  async navigateToPage(page: 'Add' | 'Expenses' | 'Balances' | 'Budget' | 'Monthly Budget'): Promise<void> {
    // Check if we're on mobile
    const isMobile = await this.isMobile();
    
    if (isMobile) {
      // On mobile, first open the sidebar using the hamburger button
      const hamburger = this.page.locator('button:has(span)').first();
      if (await hamburger.isVisible()) {
        await hamburger.click();
        // Wait for sidebar to animate in
        await this.page.waitForTimeout(500);
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
      'Monthly Budget': '/monthly-budget'
    };
    
    await this.page.waitForURL(urlMap[page]);
  }

  /**
   * Add a new expense
   */
  async addExpense(expense: TestExpense, pin: string): Promise<void> {
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
    
    // Enter PIN
    await this.page.fill('input[placeholder="PIN"]', pin);
    
    // Submit form
    await this.page.click('button[type="submit"]');
    
    // Wait for success/error response
    await this.page.waitForFunction(() => !document.querySelector('.loader'));
  }

  /**
   * Add a budget entry
   */
  async addBudget(budget: TestBudget, pin: string): Promise<void> {
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
    
    // Enter PIN
    await this.page.fill('input[placeholder="PIN"]', pin);
    
    // Submit budget form
    await budgetForm.locator('button[type="submit"]').click();
    
    // Wait for success/error response
    await this.page.waitForFunction(() => !document.querySelector('.loader'));
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoading(): Promise<void> {
    await this.page.waitForFunction(() => !document.querySelector('.loader'));
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
      await this.page.waitForSelector('.SidebarHeader', { timeout: 5000 });
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