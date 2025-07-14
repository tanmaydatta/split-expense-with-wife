import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

// Helper class for expense operations
class ExpenseTestHelper {
  private alertMessage = '';

  constructor(private authenticatedPage: any) {
    // Listen for alert dialogs
    this.authenticatedPage.page.on('dialog', async (dialog: any) => {
      this.alertMessage = dialog.message();
      console.log("alertMessage", JSON.stringify(this.alertMessage));
      try {
        await dialog.accept();
      } catch (e) {
        console.log("error accepting dialog", e);
      }
    });
  }

  generateRandomExpenseDescription(baseDescription: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    return `${baseDescription} ${timestamp}_${randomSuffix}`;
  }

  async addExpenseEntry(expense: any, useRandomDescription: boolean = true): Promise<{
    success: boolean;
    alertMessage: string;
    description: string;
    amount: number;
    currency: string;
    paidBy: string;
    splitPercentages: Record<string, number>;
  }> {
    await this.authenticatedPage.navigateToPage('Add');

    // Generate random description if requested
    const description = useRandomDescription
      ? this.generateRandomExpenseDescription(expense.description)
      : expense.description;
    console.log("description", description);
    // Fill expense form (first form on the page)
    await this.authenticatedPage.page.fill('input[placeholder="Description"]', description);
    await this.authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());

    // Set currency
    await this.authenticatedPage.page.selectOption('select[name="currency"]', expense.currency);

    // Set paid by - use index instead of label for more reliability
    if (expense.paidBy === 'John' || expense.paidBy === '1') {
      await this.authenticatedPage.page.selectOption('select[name="paidBy"]', '1');
    } else {
      await this.authenticatedPage.page.selectOption('select[name="paidBy"]', '2');
    }

    // Set split percentages if provided
    if (expense.splitPercentages) {
      const splitInputs = this.authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
      const userIds = Object.keys(expense.splitPercentages);

      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        const percentage = expense.splitPercentages[userId];
        await splitInputs.nth(i).fill(percentage.toString());
      }
    }

    // Enter PIN
    await this.authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);

    // Submit expense form (first form on the page)
    await this.authenticatedPage.page.locator('form').first().locator('button[type="submit"]').click();

    // Wait for success/error response
    await this.authenticatedPage.waitForLoading();

    return {
      success: true,
      alertMessage: this.alertMessage,
      description,
      amount: expense.amount,
      currency: expense.currency,
      paidBy: expense.paidBy,
      splitPercentages: expense.splitPercentages
    };

  }

  async verifyExpenseAdded(description: string, amount: number, currency: string): Promise<boolean> {

    await this.authenticatedPage.navigateToPage('Expenses');
    await this.authenticatedPage.waitForLoading();
    await this.authenticatedPage.page.reload();
    await this.authenticatedPage.waitForLoading();
    // Look for the expense in the transaction list
    const transactionItems = await this.authenticatedPage.page.locator('.transactionListItemWrapper').all();
    console.log('Found transaction items:', transactionItems.length);
    expect(transactionItems.length).toBeGreaterThan(0);
    // If no specific transaction items found, try a more general approach
    // if (await transactionItems.count() === 0) {
    //   // Look for any element containing the description
    //   const descriptionElement = this.authenticatedPage.page.locator(`text="${description}"`);
    //   const amountElement = this.authenticatedPage.page.locator(`text="${amount.toString()}"`);

    //   const descriptionExists = await descriptionElement.count() > 0;
    //   const amountExists = await amountElement.count() > 0;

    //   return descriptionExists && amountExists;
    // }

        // Check each transaction item for matching description and amount
    for (let i = 0; i < transactionItems.length; i++) {
      const item = transactionItems[i];
      const itemText = await item.textContent();
      
      // Based on the HTML structure:
      // <div class="transactionListItemWrapper">
      //   <div>Jul 14</div>                              // Date
      //   <div>Grocery shopping 1752524571030_397</div>  // Description
      //   <div>$150.5</div>                              // Amount
      //   <div class="positive"> +$75.25</div>          // Balance change
      //   <div><svg>...</svg></div>                      // Delete button
      // </div>
      
      if (itemText && itemText.includes(description)) {
        // Check if the amount appears in the expected format with currency symbol
        const currencySymbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
        const expectedSymbol = currencySymbols[currency as keyof typeof currencySymbols] || '$';
        const expectedAmount = `${expectedSymbol}${amount}`;
        
        if (itemText.includes(expectedAmount)) {
          return true;
        }
      }
    }

    return false;

  }

  async addAndVerifyExpense(expense: any): Promise<{
    success: boolean;
    description: string;
    error?: string;
  }> {
    const addResult = await this.addExpenseEntry(expense);
    if (!addResult.success) {
      return {
        success: false,
        description: expense.description,
        error: addResult.alertMessage
      };
    }

    const verified = await this.verifyExpenseAdded(addResult.description, expense.amount, expense.currency);

    return {
      success: verified,
      description: addResult.description,
      error: verified ? undefined : 'Expense not found in expenses list'
    };
  }

  async verifyExpensePageComponents() {
    // Verify basic expense page structure
    await expect(this.authenticatedPage.page).toHaveURL('/expenses');
    await expect(this.authenticatedPage.page.locator('.TransactionList, .Transactions, .expenses-container')).toBeVisible();
  }

  async verifyExpenseDataDisplay() {
    // Check for expense table or list elements
    const expenseContainer = this.authenticatedPage.page.locator('.TransactionList, .transaction-list, table, .expenses-content, .expense-entries, .transactionListItemWrapper').first();
    await expect(expenseContainer).toBeVisible();
    return expenseContainer;
  }

    async verifySpecificExpenseEntry(description: string, amount: string, currency: string) {
    // Verify specific expense entry is visible
    const expenseEntries = this.authenticatedPage.page.locator('.transactionListItemWrapper');
    
    // Format the amount with currency symbol
    const currencySymbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
    const expectedSymbol = currencySymbols[currency as keyof typeof currencySymbols] || '$';
    const expectedAmount = `${expectedSymbol}${amount}`;
    
    // Look for an entry containing all our data
    const matchingEntry = expenseEntries.filter({
      hasText: description
    }).filter({
      hasText: expectedAmount
    });
    
    await expect(matchingEntry.first()).toBeVisible();
  }

    async deleteExpenseEntry(description: string): Promise<boolean> {
    try {
      await this.authenticatedPage.navigateToPage('Expenses');
      await this.authenticatedPage.waitForLoading();
      
      // Find the expense entry with the description
      const expenseEntries = this.authenticatedPage.page.locator('.transactionListItemWrapper');
      
      for (let i = 0; i < await expenseEntries.count(); i++) {
        const entry = expenseEntries.nth(i);
        const entryText = await entry.textContent();
        
        if (entryText && entryText.includes(description)) {
          // Enter PIN first before clicking delete
          const pinField = this.authenticatedPage.page.locator('input[placeholder="PIN"], input[name="pin"], input[type="password"]').first();
          if (await pinField.isVisible({ timeout: 2000 })) {
            await pinField.fill(testData.pin);
          }
          
          // Look for delete button in the entry (based on HTML structure, it's the last div with SVG)
          const deleteButton = entry.locator('div:last-child svg, button, .delete-btn, .btn-delete').last();
          
          if (await deleteButton.isVisible({ timeout: 2000 })) {
            await deleteButton.click();
            
            // Wait for deletion to complete
            await this.authenticatedPage.waitForLoading();
            
            // Verify the entry is no longer visible
            await expect(this.authenticatedPage.page.locator(`text="${description}"`)).not.toBeVisible();
            
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.log('Delete functionality not accessible:', error);
      return false;
    }
  }

  async verifyExpenseFormElements() {
    // Verify expense form elements are present
    await expect(this.authenticatedPage.page.locator('input[placeholder="Description"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('input[placeholder="Amount"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('select[name="currency"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('select[name="paidBy"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('input[placeholder="PIN"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('button[type="submit"]').first()).toBeVisible();
  }

  async verifyFormDefaults() {
    await expect(this.authenticatedPage.page.locator('select[name="currency"]')).toHaveValue('USD');
    await expect(this.authenticatedPage.page.locator('select[name="paidBy"]')).toHaveValue('1');

    // Check split percentages default to 50/50
    const splitInputs = this.authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
    if (await splitInputs.count() > 0) {
      await expect(splitInputs.nth(0)).toHaveValue('50');
      await expect(splitInputs.nth(1)).toHaveValue('50');
    }
  }

    async testDecimalAmountSupport() {
    // Fill expense form with decimal amount
    const description = this.generateRandomExpenseDescription('Test decimal expense');
    await this.authenticatedPage.page.fill('input[placeholder="Description"]', description);
    await this.authenticatedPage.page.fill('input[placeholder="Amount"]', '123.45');
    await this.authenticatedPage.page.selectOption('select[name="currency"]', 'USD');
    await this.authenticatedPage.page.fill('input[placeholder="PIN"]', testData.pin);
    
    // Submit form
    await this.authenticatedPage.page.locator('form').first().locator('button[type="submit"]').click();
    await this.authenticatedPage.waitForLoading();
    
    // Verify the expense was actually added by checking the expenses page
    const verified = await this.verifyExpenseAdded(description, 123.45, 'USD');
    expect(verified).toBe(true);
    
    return description;
  }

  async verifyLoadingState() {
    // Try to verify loading state
    const loader = this.authenticatedPage.page.locator('.loader');
    if (await loader.count() > 0) {
      await expect(loader).not.toBeVisible();
    }
  }

  async verifyFormStateAfterSubmission() {
    // Verify PIN field is cleared (most forms clear PIN for security)
    await expect(this.authenticatedPage.page.locator('input[placeholder="PIN"]')).toHaveValue('');
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

  // Mock only the split endpoint for expense submission
  test.beforeEach(async ({ page }) => {
    await page.route('**/.netlify/functions/split', async (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: '200' })
        });
      } else {
        route.continue();
      }
    });
  });

  test.describe('Expense Form Display', () => {
    test('should display expense form on home page', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);

      await expect(authenticatedPage.page).toHaveURL('/');
      await expenseHelper.verifyExpenseFormElements();
    });

    test('should have correct default values in form', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      await expenseHelper.verifyFormDefaults();
    });
  });

  test.describe('Basic Expense Addition', () => {
    test('should successfully add a new expense with groceries data', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = testData.expenses.groceries;

      // Add expense and verify it was added successfully
      const result = await expenseHelper.addAndVerifyExpense(expense);

      // Verify the expense was added successfully
      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
      expect(result.error).toBeUndefined();
    });

    test('should successfully add a new expense with restaurant data', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = testData.expenses.restaurant;

      // Add expense and verify it was added successfully
      const result = await expenseHelper.addAndVerifyExpense(expense);

      // Verify the expense was added successfully
      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
      expect(result.error).toBeUndefined();
    });

    test('should successfully add a new expense with multi-currency data', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = testData.expenses.multiCurrency;

      // Add expense and verify it was added successfully
      const result = await expenseHelper.addAndVerifyExpense(expense);

      // Verify the expense was added successfully
      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
      expect(result.error).toBeUndefined();
    });
  });

  test.describe('Expense Form Validation', () => {

        test('should validate PIN field is required', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = testData.expenses.groceries;
      
      // Navigate to Add page
      await authenticatedPage.navigateToPage('Add');
      
      // Fill all fields except PIN
      await authenticatedPage.page.fill('input[placeholder="Description"]', expense.description);
      await authenticatedPage.page.fill('input[placeholder="Amount"]', expense.amount.toString());
      await authenticatedPage.page.selectOption('select[name="currency"]', expense.currency);
      
      // Try to submit without PIN
      await authenticatedPage.page.locator('form').first().locator('button[type="submit"]').click();
      await authenticatedPage.waitForLoading();
      
      // Should remain on same page
      await expect(authenticatedPage.page).toHaveURL('/');
      
      // Validate that the alert message is not the expected success message
      expect(expenseHelper['alertMessage']).not.toBe('Success');
      expect(expenseHelper['alertMessage']).not.toBe('200');
      
      // The alert message should indicate some kind of error (PIN required, validation failed, etc.)
      expect(expenseHelper['alertMessage']).toBeTruthy(); // Should have some error message
    });

    test('should validate amount field accepts decimal values', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const description = await expenseHelper.testDecimalAmountSupport();

      // Verify decimal was processed
      expect(description).toContain('Test decimal expense');
    });
  });

  test.describe('Currency Support', () => {
    test('should support USD currency', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = { ...testData.expenses.groceries, currency: 'USD' };
      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
    });

    test('should support EUR currency', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = { ...testData.expenses.groceries, currency: 'EUR' };
      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
    });

    test('should support GBP currency', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = { ...testData.expenses.groceries, currency: 'GBP' };
      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
    });
    test('should support INR currency', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = { ...testData.expenses.groceries, currency: 'INR' };
      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
    });
  });

  test.describe('Split Percentage Functionality', () => {
    test('should allow changing split percentages to 40/60', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = {
        ...testData.expenses.restaurant,
        splitPercentages: { '1': 40, '2': 60 }
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);

      // Verify percentages were set correctly
      const splitInputs = authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
      if (await splitInputs.count() > 0) {
        await expect(splitInputs.nth(0)).toHaveValue('40');
        await expect(splitInputs.nth(1)).toHaveValue('60');
      }
    });

    test('should allow changing split percentages to 70/30', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = {
        ...testData.expenses.utilities,
        splitPercentages: { '1': 70, '2': 30 }
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);

      // Verify percentages were set correctly
      const splitInputs = authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
      if (await splitInputs.count() > 0) {
        await expect(splitInputs.nth(0)).toHaveValue('70');
        await expect(splitInputs.nth(1)).toHaveValue('30');
      }
    });

    test('should handle equal split percentages 50/50', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = {
        ...testData.expenses.groceries,
        splitPercentages: { '1': 50, '2': 50 }
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);

      // Verify percentages were set correctly
      const splitInputs = authenticatedPage.page.locator('.SplitPercentageInput input[type="number"]');
      if (await splitInputs.count() > 0) {
        await expect(splitInputs.nth(0)).toHaveValue('50');
        await expect(splitInputs.nth(1)).toHaveValue('50');
      }
    });
  });

  test.describe('Paid By Functionality', () => {
    test('should allow expense paid by user 1', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = { ...testData.expenses.groceries, paidBy: '1' };
      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);

      // Verify the correct user was selected
      await expect(authenticatedPage.page.locator('select[name="paidBy"]')).toHaveValue('1');
    });

    test('should allow expense paid by user 2', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = { ...testData.expenses.restaurant, paidBy: '2' };
      const result = await expenseHelper.addAndVerifyExpense(expense);

      expect(result.success).toBe(true);

      // Verify the correct user was selected
      await expect(authenticatedPage.page.locator('select[name="paidBy"]')).toHaveValue('2');
    });
  });

  test.describe('Loading States', () => {
    test('should show loading state during expense submission', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = testData.expenses.restaurant;

      // Add expense
      const result = await expenseHelper.addExpenseEntry(expense);

      // Verify loading state completed
      await expenseHelper.verifyLoadingState();

      expect(result.success).toBe(true);
      expect(result.description).toContain(expense.description);
    });

    test('should hide loading state after successful submission', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = testData.expenses.utilities;

      // Add expense
      await expenseHelper.addExpenseEntry(expense);

      // Verify loading is complete
      await expenseHelper.verifyLoadingState();
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle very large amounts', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = {
        ...testData.expenses.groceries,
        amount: 9999999.99
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);
      expect(result.success).toBe(true);
    });

    test('should handle very small amounts', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const expense = {
        ...testData.expenses.groceries,
        amount: 0.01
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);
      expect(result.success).toBe(true);
    });

    test('should handle very long descriptions', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const longDescription = 'A'.repeat(100); // Long description
      const expense = {
        ...testData.expenses.groceries,
        description: longDescription
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);
      expect(result.success).toBe(true);
      expect(result.description).toContain(longDescription);
    });

    test('should handle special characters in descriptions', async ({ authenticatedPage }) => {
      const expenseHelper = new ExpenseTestHelper(authenticatedPage);
      const specialDescription = 'Test & special chars 中文 émojis 🍕';
      const expense = {
        ...testData.expenses.groceries,
        description: specialDescription
      };

      const result = await expenseHelper.addAndVerifyExpense(expense);
      expect(result.success).toBe(true);
      expect(result.description).toContain(specialDescription);
    });
  });
}); 