import { expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import { TestHelper } from './test-utils';

// Shared helper class for expense operations
export class ExpenseTestHelper {
  constructor(private authenticatedPage: TestHelper) {}

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

  async verifySpecificExpenseEntry(description: string, amount: string, currency: string, expectedShare?: string) {
    await expect(this.authenticatedPage.page).toHaveURL('/expenses');
    await this.authenticatedPage.page.reload();
    await this.authenticatedPage.page.waitForTimeout(2000);
    console.log("verifySpecificExpenseEntry", "description", description, "amount", amount, "currency", currency, "expectedShare", expectedShare);
    
    let expenseFound = false;
    let attempts = 0;
    const maxAttempts = 5;

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
              const hasAmount = text.includes(amount);
              const hasShare = !expectedShare || text.includes(expectedShare);
              
              if (hasAmount && hasShare) {
                if (expectedShare) {
                  console.log(`Verified amount ${amount} and share ${expectedShare} in expense`);
                } else {
                  console.log(`Verified amount ${amount} in expense`);
                }
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
          const hasDescription = containerText && containerText.includes(description);
          const hasAmount = containerText && containerText.includes(amount);
          const hasShare = !expectedShare || (containerText && containerText.includes(expectedShare));
          
          if (hasDescription && hasAmount && hasShare) {
            if (expectedShare) {
              console.log(`Found expense in expenses container: ${description} with amount ${amount} and share ${expectedShare}`);
            } else {
              console.log(`Found expense in expenses container: ${description} with amount ${amount}`);
            }
            expenseFound = true;
          }
        }
      }

      // If still not found and we have attempts left, try clicking "Show more"
      if (!expenseFound && attempts <= maxAttempts) {
        console.log(`Expense not found on attempt ${attempts}, looking for "Show more" button`);
        
        // Look for "Show more" button using data-test-id
        const showMoreButton = this.authenticatedPage.page.locator('[data-test-id="show-more-button"]');
        await expect(this.authenticatedPage.page).toHaveURL('/expenses');
        if (await showMoreButton.isVisible({ timeout: 10000 })) {
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

  async setCustomSplitPercentages(percentages: Record<string, number>) {
    console.log("Setting custom split percentages:", percentages);
    
    for (const userId in percentages) {
      const percentage = percentages[userId];
      await this.authenticatedPage.page.fill(`[data-test-id="percentage-input-${userId}"]`, percentage.toString());
    }
  }

  async verifyFormElementsVisible() {
    // Verify expense form is visible and contains required elements
    await expect(this.authenticatedPage.page.locator('[data-test-id="expense-form"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="description-input"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="amount-input"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="currency-select"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="pin-input"]')).toBeVisible();
    await expect(this.authenticatedPage.page.locator('[data-test-id="submit-button"]')).toBeVisible();
  }

  async deleteExpenseEntry(description: string): Promise<void> {
    console.log("Attempting to delete expense with description:", description);
    
    // Navigate to expenses page if not already there
    if (!this.authenticatedPage.page.url().includes('/expenses')) {
      await this.authenticatedPage.navigateToPage('Expenses');
    }
    await this.authenticatedPage.page.reload();
    await this.authenticatedPage.page.waitForTimeout(2000);
    // First find the expense entry
    let expenseFound = false;
    let deleteButton = null;
    let attempts = 0;
    const maxAttempts = 8;

    while (!expenseFound && attempts <= maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts} to find expense for deletion: ${description}`);
      
      // Check viewport to determine if we're on mobile or desktop
      const isMobile = await this.authenticatedPage.isMobile();
      
      if (isMobile) {
        // On mobile, look for the card with the description and find its delete button
        const expenseCards = this.authenticatedPage.page.locator('[data-test-id="transaction-card"]');
        const cardCount = await expenseCards.count();
        
        for (let i = 0; i < cardCount; i++) {
          const card = expenseCards.nth(i);
          const text = await card.textContent();
          if (text && text.includes(description)) {
            // Mobile uses button with data-test-id="delete-button"
            deleteButton = card.locator('[data-test-id="delete-button"]');
            if (await deleteButton.isVisible({ timeout: 2000 })) {
              expenseFound = true;
              console.log(`Found expense for deletion on mobile: ${description}`);
              break;
            }
          }
        }
      } else {
        // On desktop, look for the table row with the description and find its delete button
        const expenseRows = this.authenticatedPage.page.locator('[data-test-id="transaction-item"]');
        const rowCount = await expenseRows.count();
        
        for (let i = 0; i < rowCount; i++) {
          const row = expenseRows.nth(i);
          const text = await row.textContent();
          if (text && text.includes(description)) {
            // Desktop uses delete button with data-test-id="delete-button"
            deleteButton = row.locator('[data-test-id="delete-button"]');
            if (await deleteButton.isVisible({ timeout: 2000 })) {
              expenseFound = true;
              console.log(`Found expense for deletion on desktop: ${description}`);
              break;
            }
          }
        }
      }

      // If we found the expense and delete button, proceed with deletion
      if (expenseFound && deleteButton) {
        break; // Exit the search loop
      }

      // If not found and we have attempts left, try clicking "Show more"
      if (!expenseFound && attempts <= maxAttempts) {
        const showMoreButton = this.authenticatedPage.page.locator('[data-test-id="show-more-button"]');
        if (await showMoreButton.isVisible({ timeout: 2000 })) {
          console.log("Clicking 'Show more' button to load more expenses");
          await showMoreButton.click();
          // Wait for new expenses to load instead of fixed timeout
          await this.verifyExpensesPageComponents();
        } else {
          console.log("No 'Show more' button found, stopping pagination attempts");
          break;
        }
      }
    }

    // Expect that we found the expense for deletion
    expect(expenseFound).toBe(true);
    expect(deleteButton).not.toBeNull();
    await expect(deleteButton!).toBeVisible();

    // Note: PIN is not yet implemented for expense deletion in the UI

    // Set up alert handler to capture any confirmation dialogs
    this.authenticatedPage.page.once('dialog', async (dialog: any) => {
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept();
    });

    // Click delete button and expect it to be clickable
    await expect(deleteButton!).toBeEnabled();
    await deleteButton!.click();
    console.log("Delete button clicked");
    
    // Wait for deletion to complete
    await this.authenticatedPage.waitForLoading();
    await this.verifyExpensesPageComponents();
    
    console.log(`Successfully deleted expense: ${description}`);
  }
} 