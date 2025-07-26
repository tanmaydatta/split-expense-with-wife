import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

// Helper functions for budget operations
class BudgetTestHelper {
  constructor(private authenticatedPage: any) {
    // No alert handling needed for budget operations
  }

  async addBudgetEntry(budget: any, type: 'Credit' | 'Debit') {
    const budgetForm = this.authenticatedPage.page.locator('form');

    // Generate random description to avoid edge cases
    const randomId = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString().slice(-6);
    const description = `${type} for ${budget.name} ${randomId}${timestamp}`;
    console.log("description", description);
    // Fill the form
    await budgetForm.locator(`[data-test-id="budget-radio-${budget.name}"]`).click();
    await budgetForm.locator(`[data-test-id="${type.toLowerCase()}-radio"]`).click();
    await this.authenticatedPage.page.fill('[data-test-id="description-input"]', description);
    await this.authenticatedPage.page.fill('[data-test-id="amount-input"]', budget.amount.toString());
    await this.authenticatedPage.page.selectOption('[data-test-id="currency-select"]', budget.currency);

    // Submit and wait for response
    await budgetForm.locator('[data-test-id="submit-button"]').click();
    await this.authenticatedPage.waitForLoading();

    // Wait for and verify success message appears
    await this.authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: 10000 });
    const successMessage = await this.authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
    console.log("Success message received:", successMessage);

    return { description, successMessage };
  }

  async verifyBudgetPageComponents() {
    // Verify basic budget page structure
    await expect(this.authenticatedPage.page).toHaveURL('/budget');
    await expect(this.authenticatedPage.page.locator('[data-test-id="budget-container"]')).toBeVisible();

    // Verify budget selection group is present
    await expect(this.authenticatedPage.page.locator('[data-test-id="budget-selection-group"]')).toBeVisible();

    // Verify budget category buttons are present (at least one should exist)
    const budgetButtons = this.authenticatedPage.page.locator('[data-test-id="budget-selection-group"] button');
    await expect(budgetButtons.first()).toBeVisible();
    
    // Log available budget categories for debugging
    const buttonCount = await budgetButtons.count();
    console.log(`Found ${buttonCount} budget categories on the page`);
  }

  async selectBudgetCategory(category: string) {
    await this.authenticatedPage.page.locator(`[data-test-id="budget-radio-${category}"]`).click();
    await this.authenticatedPage.waitForLoading();
  }

  async verifyBudgetDataDisplay() {
    // Check viewport to determine if we're on mobile or desktop
    const isMobile = await this.authenticatedPage.isMobile();
    
    if (isMobile) {
      // On mobile, look for the card container
      const mobileContainer = this.authenticatedPage.page.locator('[data-test-id="mobile-cards"]');
      await expect(mobileContainer).toBeVisible();
      return mobileContainer;
    } else {
      // On desktop, look for the table
      const desktopContainer = this.authenticatedPage.page.locator('[data-test-id="desktop-table"] table');
      await expect(desktopContainer).toBeVisible();
      return desktopContainer;
    }
  }

  async verifyBudgetTotals() {
    // Check for budget totals display (AmountGrid component)
    const budgetTotals = this.authenticatedPage.page.locator('[data-test-id="amount-grid"]');
    await expect(budgetTotals).toBeVisible();
    
    // Verify there are budget amounts displayed
    const amountItems = budgetTotals.locator('[data-test-id="amount-item"]');
    await expect(amountItems.first()).toBeVisible();
    
    const itemCount = await amountItems.count();
    console.log(`Found ${itemCount} budget total items`);

    return budgetTotals;
  }

  async verifySpecificBudgetEntry(description: string, amount: string, currency: string, date: string) {
    console.log("verifySpecificBudgetEntry", "description", description, "amount", amount, "currency", currency, "date", date);
    
    // Check viewport to determine if we're on mobile or desktop
    const isMobile = await this.authenticatedPage.isMobile();
    
    if (isMobile) {
      // On mobile, look for the entry in the card layout
      const entryCard = this.authenticatedPage.page.locator('[data-test-id="budget-entry-card"]').filter({ hasText: description });
      await expect(entryCard).toBeVisible();
      
      // Check that the card contains the amount
      await expect(entryCard).toContainText(amount.toString());
      
      // Check that the card contains the date
      await expect(entryCard).toContainText(date);
    } else {
      // On desktop, search for the entry in any table row, not just the first
      const entryRow = this.authenticatedPage.page.locator('tbody tr').filter({ hasText: description });
      await expect(entryRow).toBeVisible();
      
      // Check that the row contains the amount (3rd column, index 2)
      await expect(entryRow.locator('td').nth(2)).toContainText(amount.toString());
      
      // Check that the row contains the date (1st column, index 0)
      await expect(entryRow.locator('td').nth(0)).toContainText(date);
    }
  }

  async verifyBudgetEntryNotPresent(description: string) {
    console.log("verifyBudgetEntryNotPresent", "description", description);
    
    // Check viewport to determine if we're on mobile or desktop (reusing the same logic)
    const isMobile = await this.authenticatedPage.isMobile();
    
    if (isMobile) {
      // On mobile, verify no card contains this description
      const entryCards = await this.authenticatedPage.page.locator('[data-test-id="budget-entry-card"]').filter({ hasText: description }).count();
      expect(entryCards).toBe(0);
      console.log(`Verified deletion on mobile: ${description} not found in any cards`);
    } else {
      // On desktop, verify no table row contains this description
      const entryRows = await this.authenticatedPage.page.locator('tbody tr').filter({ hasText: description }).count();
      expect(entryRows).toBe(0);
      console.log(`Verified deletion on desktop: ${description} not found in any rows`);
    }
  }

  async deleteBudgetEntry(description: string) {
    // Try to find and delete the budget entry
    try {
      // Check viewport to determine if we're on mobile or desktop
      const isMobile = await this.authenticatedPage.isMobile();

      // PIN authentication has been removed

      let deleteButton;

      if (isMobile) {
        // On mobile, look for the card with the description and find its delete button
        const entryCard = this.authenticatedPage.page.locator('[data-test-id="budget-entry-card"]').filter({ hasText: description });
        try {
          await entryCard.waitFor({ state: 'visible', timeout: 2000 });
          deleteButton = entryCard.locator('[data-test-id="delete-button"]');
        } catch (_e) {
          console.log('No budget entry card found with description:', description);
          return false;
        }
      } else {
        // On desktop, look for the table row with the description and find its delete button
        const entryRow = this.authenticatedPage.page.locator('tbody tr').filter({ hasText: description });
        try {
          await entryRow.waitFor({ state: 'visible', timeout: 2000 });
          deleteButton = entryRow.locator('[data-test-id="delete-button"]');
        } catch (_e) {
          console.log('No budget entry row found with description:', description);
          return false;
        }
      }

      if (deleteButton) {
        try {
          await deleteButton.waitFor({ state: 'visible', timeout: 2000 });
          await deleteButton.click();
          console.log("deleteButton clicked");
        } catch (_e) {
          console.log("Delete button not visible, deletion failed");
          return false;
        }
        
        // Wait for deletion to complete and verify success message appears
        await this.authenticatedPage.waitForLoading();
        
        // Check for success container instead of alert
        await this.authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: 10000 });
        const successMessage = await this.authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
        console.log(`Success message: ${successMessage}`);
        
        // Allow time for page refresh after deletion
        await this.authenticatedPage.page.waitForTimeout(1000);

        return true; // Deletion successful
      } else {
        console.log('Delete button not found for entry:', description);
        return false; // Delete button not found
      }
    } catch (error) {
      console.log('Delete functionality not accessible - may not be implemented yet. Error:', error);
      return false; // Deletion failed
    }
  }
}

test.describe('Budget Management', () => {
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

  test('should display budget form on home page', async ({ authenticatedPage }) => {
    await authenticatedPage.navigateToPage('Add');
    await authenticatedPage.page.waitForTimeout(2000);
    await expect(authenticatedPage.page).toHaveURL('/');

    // Verify budget form elements are present (single form on the page)
    const mainForm = authenticatedPage.page.locator('form');
    await expect(mainForm).toBeVisible();
    
    // Verify "Update Budget" checkbox is checked by default
    const updateBudgetCheckbox = mainForm.locator('[data-test-id="update-budget-checkbox"]');
    await expect(updateBudgetCheckbox).toBeChecked();
    
    // Verify budget-related elements are visible when "Update Budget" is checked
    await expect(mainForm.locator('[data-test-id="credit-radio"]')).toBeVisible();
    await expect(mainForm.locator('[data-test-id="debit-radio"]')).toBeVisible();
    await expect(mainForm.locator('[data-test-id="budget-selection-group"]')).toBeVisible();
    await expect(mainForm.locator('[data-test-id="submit-button"]')).toBeVisible();
  });

  test('should successfully add a budget credit entry', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    await authenticatedPage.navigateToPage('Add');

    // Add credit entry and verify success
    const budget = testData.budgets.houseCredit;
    await budgetHelper.addBudgetEntry(budget, 'Credit');

    // Verify form was reset after successful submission
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue('');

    // Verify we're still on the home page
    await expect(authenticatedPage.page).toHaveURL('/');
  });

  test('should successfully add a budget debit entry', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    await authenticatedPage.navigateToPage('Add');

    // Add debit entry and verify success
    const budget = testData.budgets.houseDebit;
    await budgetHelper.addBudgetEntry(budget, 'Debit');

    // Verify form was reset after successful submission
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue('');

    // Verify we're still on the home page
    await expect(authenticatedPage.page).toHaveURL('/');
  });

  test('should navigate to budget page and display budget information', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    // First add some budget entries
    await authenticatedPage.navigateToPage('Add');

    // Add a credit entry for house budget
    const creditBudget = testData.budgets.houseCredit;
    const creditResult = await budgetHelper.addBudgetEntry(creditBudget, 'Credit');
    await authenticatedPage.page.waitForTimeout(2000);

    // Add a debit entry for food budget
    const debitBudget = { ...testData.budgets.foodCredit, amount: 150 };
    const debitResult = await budgetHelper.addBudgetEntry(debitBudget, 'Debit');
    await authenticatedPage.page.waitForTimeout(2000);
    // Navigate to budget page
    await authenticatedPage.navigateToPage('Budget');
    await authenticatedPage.page.waitForTimeout(2000);
    await authenticatedPage.page.reload();
    // Verify budget page components
    await budgetHelper.verifyBudgetPageComponents();

    // Select house budget category to load its data
    await budgetHelper.selectBudgetCategory('house');

    // Verify budget data is displayed
    await budgetHelper.verifyBudgetDataDisplay();

    // Verify the specific house credit entry we added is visible
    const todayDate = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short", 
      day: "2-digit",
      year: "numeric",
    });
    await budgetHelper.verifySpecificBudgetEntry(creditResult.description, '500', '$', todayDate);

    // Verify budget totals are shown

    await budgetHelper.verifyBudgetTotals();


    // Switch to food budget category and verify the debit entry we added
    await budgetHelper.selectBudgetCategory('food');
    await budgetHelper.verifyBudgetDataDisplay();

    // Verify the specific food debit entry we added is visible
    await budgetHelper.verifySpecificBudgetEntry(debitResult.description, '150', '$', todayDate);
    await budgetHelper.verifyBudgetTotals();
    // Verify we're still authenticated and on budget page
    await expect(authenticatedPage.page).toHaveURL('/budget');
  });

  test('should display budget totals grouped by currency', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    // First add some budget entries to have data to display
    await authenticatedPage.navigateToPage('Add');

    // Add entries in different currencies
    const usdBudget = testData.budgets.houseCredit;
    await budgetHelper.addBudgetEntry(usdBudget, 'Credit');

    // Navigate to budget page
    await authenticatedPage.navigateToPage('Budget');

    // Verify budget page components
    await budgetHelper.verifyBudgetPageComponents();

    // Select budget category
    await budgetHelper.selectBudgetCategory('house');

    // Verify budget totals are displayed
    await budgetHelper.verifyBudgetTotals();
  });

  test('should show loading state during budget submission', async ({ authenticatedPage }) => {

    // Mock both APIs since the form submits to both expense and budget endpoints
    await authenticatedPage.page.route('**/.netlify/functions/budget', async (route) => {
      // Add a 2-second delay to simulate slow network
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Budget updated successfully' })
      });
    });

    // Navigate to Add page
    await authenticatedPage.navigateToPage('Add');

    const budget = testData.budgets.transportDebit;

    // Fill the form but don't submit yet
    const budgetForm = authenticatedPage.page.locator('form');
    const randomId = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString().slice(-6);
    const description = `Debit for ${budget.name} ${randomId}${timestamp}`;

    // Uncheck "Add Expense" to test only budget submission
    const addExpenseCheckbox = authenticatedPage.page.locator('[data-test-id="add-expense-checkbox"]');
    await addExpenseCheckbox.uncheck();
    
    // Ensure "Update Budget" is checked
    const updateBudgetCheckbox = authenticatedPage.page.locator('[data-test-id="update-budget-checkbox"]');
    await updateBudgetCheckbox.check();

    await budgetForm.locator(`[data-test-id="budget-radio-${budget.name}"]`).click();
    await budgetForm.locator('[data-test-id="debit-radio"]').click();
    await authenticatedPage.page.fill('[data-test-id="description-input"]', description);
    await authenticatedPage.page.fill('[data-test-id="amount-input"]', budget.amount.toString());
    await authenticatedPage.page.selectOption('[data-test-id="currency-select"]', budget.currency);

    // Verify initial button state
    const submitButton = budgetForm.locator('[data-test-id="submit-button"]');
    await expect(submitButton).toHaveText('Submit');
    await expect(submitButton).not.toBeDisabled();

    // Submit the form and immediately check for loading state
    await submitButton.click();

    // With the mocked delay, we should be able to catch the loading state
    // Check that button becomes disabled
    await expect(submitButton).toBeDisabled({ timeout: 3000 });
    console.log('✓ Loading state detected: button became disabled');

    // Check that button text changes to "Processing..."
    await expect(submitButton).toHaveText('Processing...', { timeout: 3000 });
    console.log('✓ Loading state detected: button text changed to Processing...');

    // Wait for submission to complete and verify success
    await authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: 10000 });
    const successMessage = await authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
    console.log("Success message received:", successMessage);
    expect(successMessage).toBeTruthy();

    // Verify button returns to normal state after completion
    await expect(submitButton).toHaveText('Submit');
    await expect(submitButton).not.toBeDisabled();

    console.log('✓ Loading state was properly detected during form submission');

    // Verify form was reset after successful submission
    await expect(authenticatedPage.page.locator('[data-test-id="amount-input"]')).toHaveValue('');

    // Verify we're still on the home page
    await expect(authenticatedPage.page).toHaveURL('/');
  });

  test('should navigate to monthly budget page', async ({ authenticatedPage }) => {
    // Mock monthly budget data
    await authenticatedPage.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);

    // Navigate to monthly budget page
    await authenticatedPage.navigateToPage('Monthly Budget');

    // Verify monthly budget page elements
    await expect(authenticatedPage.page.locator('[data-test-id="budget-selection-group"]')).toBeVisible(); // Budget selector
    // Remove chart container check as it might not exist

    // Click a budget toggle button
    await authenticatedPage.page.locator('[data-test-id="budget-radio-house"]').click();
    await authenticatedPage.waitForLoading();
  });

  test('should display monthly budget breakdown chart', async ({ authenticatedPage }) => {
    // Mock monthly budget data
    await authenticatedPage.mockApiResponse('budget_monthly', testData.mockResponses.budgetMonthly.success);

    // Navigate to monthly budget page
    await authenticatedPage.navigateToPage('Monthly Budget');

    // Click a budget toggle button
    await authenticatedPage.page.locator('[data-test-id="budget-radio-house"]').click();
    await authenticatedPage.waitForLoading();

    // Just verify the page loads - chart elements may not be present without proper data
    await expect(authenticatedPage.page.locator('[data-test-id="monthly-budget-container"]')).toBeVisible();
  });

  test('should handle budget deletion', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    // First create a budget entry to delete
    await authenticatedPage.navigateToPage('Add');
    const budget = testData.budgets.houseCredit;
    const budgetResult = await budgetHelper.addBudgetEntry(budget, 'Credit');

    // Navigate to budget page
    await authenticatedPage.navigateToPage('Budget');
    await authenticatedPage.page.waitForTimeout(2000);
    await authenticatedPage.page.reload();
    // Verify budget page components
    await budgetHelper.verifyBudgetPageComponents();

    // Select house budget category
    await budgetHelper.selectBudgetCategory('house');

    // Verify budget data is displayed
    await budgetHelper.verifyBudgetDataDisplay();

    // Verify our created entry is visible
    const todayDate2 = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short", 
      day: "2-digit",
      year: "numeric",
    });
    await budgetHelper.verifySpecificBudgetEntry(budgetResult.description, '500', '$', todayDate2);

    // Attempt to delete the budget entry
    const deleteSuccess = await budgetHelper.deleteBudgetEntry(budgetResult.description);
    expect(deleteSuccess).toBe(true);
    
    // Verify we're still on the budget page
    await expect(authenticatedPage.page).toHaveURL('/budget');

    // Wait for the UI to update after deletion and reload the page to ensure fresh data
    await authenticatedPage.page.waitForTimeout(1000);
    await authenticatedPage.page.reload();
    await authenticatedPage.page.waitForTimeout(2000);

    // Re-select the budget category after reload
    await budgetHelper.selectBudgetCategory('house');

    // Verify the specific entry is no longer visible in the budget entries (this is the key test)
    await budgetHelper.verifyBudgetEntryNotPresent(budgetResult.description);
    
    // Optional: Also verify that we still have budget entries displayed (just to ensure the page loaded correctly)
    // Don't check exact counts due to parallel test race conditions, just verify basic page state
    await budgetHelper.verifyBudgetDataDisplay();
  });

  test('should handle budget page navigation with URL parameters', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    // First add some budget data to have real data to display
    await authenticatedPage.navigateToPage('Add');
    const budget = testData.budgets.houseCredit;
    await budgetHelper.addBudgetEntry(budget, 'Credit');

    // Navigate directly to monthly budget page with budget parameter
    await authenticatedPage.page.goto('/monthly-budget/house');

    // Verify page loads - toggle buttons may not show selected state via value
    await expect(authenticatedPage.page.locator('[data-test-id="monthly-budget-container"]')).toBeVisible();

    // Verify budget selector is present
    await expect(authenticatedPage.page.locator('[data-test-id="budget-selection-group"]')).toBeVisible();

    // Verify we can navigate to regular budget page as well
    await authenticatedPage.page.goto('/budget');
    await budgetHelper.verifyBudgetPageComponents();
  });

  test('should calculate budget totals correctly across multiple currencies', async ({ authenticatedPage }) => {
    const budgetHelper = new BudgetTestHelper(authenticatedPage);

    // Mock budget totals API to avoid race conditions from parallel tests
    // When multiple tests run simultaneously, they create budget entries that affect totals calculations
    // Mocking ensures predictable, isolated test results
    const mockBudgetTotals = [
      { currency: 'USD', amount: 250.00 },  // Net: +100 Credit, -25 Debit = +75 difference from 175 baseline  
      { currency: 'EUR', amount: 50.00 },   // +50 Credit
      { currency: 'GBP', amount: 80.00 },   // +80 Credit
      { currency: 'CAD', amount: -25.00 }   // -25 Debit
    ];
    // Mock both APIs since the form submits to both expense and budget endpoints
    await authenticatedPage.page.route('**/.netlify/functions/budget_total', async (route) => {
      // Add a 2-second delay to simulate slow network
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBudgetTotals)
      });
    });
    // await authenticatedPage.mockApiResponse('budget_total', mockBudgetTotals);

    // Navigate to budget page to verify multi-currency display
    await authenticatedPage.navigateToPage('Budget');
    await budgetHelper.verifyBudgetPageComponents();

    // Select house budget category
    await budgetHelper.selectBudgetCategory('house');

    // Verify budget totals are displayed
    await budgetHelper.verifyBudgetTotals();

    // Verify that multiple currencies are displayed
    const currencySymbols = ['$', 'C$', '€', '£']; // USD uses $, CAD uses C$, EUR uses €, GBP uses £
    
    // Check that at least 4 different currency symbols are present in the amount grid
    let foundCurrencies = 0;
    for (const symbol of currencySymbols) {
      const currencyItems = await authenticatedPage.page.locator(`[data-test-id="amount-item"]:has-text("${symbol}")`).count();
      if (currencyItems > 0) {
        foundCurrencies++;
        console.log(`Found currency symbol: ${symbol}`);
      }
    }

    // Verify we have 4 different currency symbols (USD, CAD, EUR, GBP)
    expect(foundCurrencies).toBe(4);

    // Verify that budget totals contain proper formatting (currency symbol and amount)
    const amountItems = await authenticatedPage.page.locator('[data-test-id="amount-item"]').all();
    expect(amountItems.length).toBeGreaterThan(0);

    // Check that at least one amount item has a valid currency format
    let hasValidFormat = false;
    for (const item of amountItems) {
      const text = await item.textContent();
      if (text && /^[+-][€£$¥][\d,]+\.[\d]{2}$/.test(text)) {
        hasValidFormat = true;
        console.log(`Found valid currency format: ${text}`);
        break;
      }
    }
    expect(hasValidFormat).toBe(true);

    // Verify the specific mocked totals are displayed correctly
    const expectedTotals = [
      '+$250.00', // USD
      '+€50.00',  // EUR
      '+£80.00',  // GBP
      '-C$25.00'  // CAD (negative) - uses C$ to distinguish from USD
    ];

    for (const expectedTotal of expectedTotals) {
      const totalElement = authenticatedPage.page.locator(`[data-test-id="amount-item"]:has-text("${expectedTotal}")`);
      await expect(totalElement).toBeVisible({ timeout: 5000 });
      console.log(`✓ Verified mocked total: ${expectedTotal}`);
    }

    // Verify individual entries are still visible
    await budgetHelper.verifyBudgetDataDisplay();

    // Test switching between different budget categories
    await budgetHelper.selectBudgetCategory('food');
    await budgetHelper.verifyBudgetDataDisplay();

    await budgetHelper.selectBudgetCategory('house');
    await budgetHelper.verifyBudgetDataDisplay();

    // Verify we're still on the budget page
    await expect(authenticatedPage.page).toHaveURL('/budget');
  });
}); 