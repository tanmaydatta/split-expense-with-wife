import { expect } from '@playwright/test';
import { getCITimeout } from './test-utils';
import { TestHelper, getCurrentUserId } from './test-utils';

// Shared helper class for expense operations
export class ExpenseTestHelper {
  constructor(private authenticatedPage: TestHelper) { }

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

    // Set paid by - if expense.paidBy is provided, use it, otherwise use the first available option
    if (expense.paidBy) {
      await this.authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', expense.paidBy);
    } else {
      // If no paidBy specified, select the first available option
      const firstOption = await this.authenticatedPage.page.locator('[data-test-id="paid-by-select"] option').first().getAttribute('value');
      if (firstOption) {
        await this.authenticatedPage.page.selectOption('[data-test-id="paid-by-select"]', firstOption);
      }
    }

    // Set custom split percentages if provided
    if (customSplits) {
      for (const userId in customSplits) {
        const percentage = customSplits[userId];
        await this.authenticatedPage.page.fill(`[data-test-id="percentage-input-${userId}"]`, percentage.toString());
      }
    }



    // Submit and wait for response
    await expenseForm.locator('[data-test-id="submit-button"]').click();
    await this.authenticatedPage.waitForLoading();

    // Wait for and verify success message appears
    await this.authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: getCITimeout(10000) });
    const successMessage = await this.authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
    console.log("Success message received:", successMessage);

    return { description, successMessage };
  }

  async verifyExpensesPageComponents() {
    // Verify basic expenses page structure
    await expect(this.authenticatedPage.page).toHaveURL('/expenses');

    // Verify expenses page elements are present using only data-test-id
    const expensesContainer = this.authenticatedPage.page.locator('[data-test-id="expenses-container"]');
    try {
      await expensesContainer.waitFor({ state: 'visible', timeout: 5000 });
      console.log("Expenses container found");
    } catch (_e) {
      console.log("No specific expenses container found, checking for general content");
    }
  }

  async verifySpecificExpenseEntry(description: string, amount: string, currency: string, expectedShare?: string) {
    await expect(this.authenticatedPage.page).toHaveURL('/expenses');
    await this.authenticatedPage.page.reload();
    await this.authenticatedPage.page.waitForTimeout(1000);
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
        try {
          await expensesContainer.waitFor({ state: 'visible', timeout: 2000 });
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
        } catch (_e) {
          console.log("Expenses container not visible, continuing search");
        }
      }

      // If still not found and we have attempts left, try clicking "Show more"
      if (!expenseFound && attempts <= maxAttempts) {
        console.log(`Expense not found on attempt ${attempts}, looking for "Show more" button`);

        // Look for "Show more" button using data-test-id
        const showMoreButton = this.authenticatedPage.page.locator('[data-test-id="show-more-button"]');
        await expect(this.authenticatedPage.page).toHaveURL('/expenses');
        try {
          // Wait up to 15 s for the button to appear (covers slow CI environments)
          await showMoreButton.waitFor({ state: 'visible', timeout: 15000 });
          console.log("Clicking 'Show more' button to load more expenses");
          await showMoreButton.click();
          await this.authenticatedPage.page.waitForTimeout(2000); // Wait for new expenses to load
        } catch (_e) {
          console.log("No 'Show more' button found after waiting, stopping pagination attempts");
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
    await this.authenticatedPage.page.waitForSelector('[data-test-id="currency-select"]', { timeout: getCITimeout(10000) });

    const currency = await this.authenticatedPage.page.locator('[data-test-id="currency-select"]').inputValue();
    const description = await this.authenticatedPage.page.locator('[data-test-id="description-input"]').inputValue();
    const amount = await this.authenticatedPage.page.locator('[data-test-id="amount-input"]').inputValue();

    // Get percentage values for each user dynamically
    const percentages: Record<string, string> = {};

    // Wait for percentage inputs to be visible
    await this.authenticatedPage.page.waitForTimeout(1000);

    // Find all percentage inputs dynamically
    const percentageInputs = await this.authenticatedPage.page.locator('[data-test-id*="percentage-input-"]').all();

    for (const input of percentageInputs) {
      try {
        const testId = await input.getAttribute('data-test-id');
        if (testId && testId.includes('percentage-input-')) {
          // Extract user ID from data-test-id like "percentage-input-{userId}"
          const userId = testId.replace('percentage-input-', '');
          const value = await input.inputValue();
          percentages[userId] = value;
          console.log(`User ${userId} percentage:`, value);
        }
      } catch (_e) {
        console.log('Could not read percentage input:', _e);
      }
    }

    console.log('Current form values:', { currency, description, amount, percentages });
    return { currency, description, amount, percentages };
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
            try {
              await deleteButton.waitFor({ state: 'visible', timeout: 2000 });
              expenseFound = true;
              console.log(`Found expense for deletion on mobile: ${description}`);
              break;
            } catch (_e) {
              // Delete button not visible, continue searching
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
            try {
              await deleteButton.waitFor({ state: 'visible', timeout: 2000 });
              expenseFound = true;
              console.log(`Found expense for deletion on desktop: ${description}`);
              break;
            } catch (_e) {
              // Delete button not visible, continue searching
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
        try {
          await showMoreButton.waitFor({ state: 'visible', timeout: 10000 });
          console.log("Clicking 'Show more' button to load more expenses");
          await showMoreButton.click();
          // Wait for new expenses to load instead of fixed timeout
          await this.verifyExpensesPageComponents();
        } catch (_e) {
          console.log("No 'Show more' button found after waiting, stopping pagination attempts");
          break;
        }
      }
    }

    // Expect that we found the expense for deletion
    expect(expenseFound).toBe(true);
    expect(deleteButton).not.toBeNull();
    await expect(deleteButton!).toBeVisible();

    // PIN authentication has been removed

    // Click delete button and expect it to be clickable
    await expect(deleteButton!).toBeEnabled();
    await deleteButton!.click();
    console.log("Delete button clicked");

    // Wait for deletion to complete and verify success message appears
    await this.authenticatedPage.waitForLoading();

    // Check for success container instead of alert dialog
    await this.authenticatedPage.page.waitForSelector('[data-test-id="success-container"]', { timeout: getCITimeout(10000) });
    const successMessage = await this.authenticatedPage.page.locator('[data-test-id="success-message"]').textContent();
    console.log(`Success message: ${successMessage}`);

    await this.verifyExpensesPageComponents();

    console.log(`Successfully deleted expense: ${description}`);
  }
}

export async function getCurrentUserPercentages(authenticatedPage: TestHelper): Promise<Record<string, string>> {
  // Navigate to Settings page to get current percentages
  const currentUrl = authenticatedPage.page.url();
  await authenticatedPage.navigateToPage('Settings');// Wait for data to load

  // Get all percentage input elements dynamically
  const percentageInputs = await authenticatedPage.page.locator('[data-test-id*="-percentage"]').all();
  const allUserPercentages: Record<string, string> = {};

  for (const input of percentageInputs) {
    const testId = await input.getAttribute('data-test-id');
    if (testId && testId.includes('user-') && testId.endsWith('-percentage')) {
      // Extract user ID from data-test-id like "user-{userId}-percentage"
      const userId = testId.replace('user-', '').replace('-percentage', '');
      const percentage = await input.inputValue();
      allUserPercentages[userId] = percentage;
    }
  }

  // Navigate back to original page
  await authenticatedPage.page.goto(currentUrl);
  await authenticatedPage.waitForLoading();

  // Get current user ID and reorder with current user first
  const currentUserId = await getCurrentUserId(authenticatedPage);
  const allUserIds = Object.keys(allUserPercentages);
  const otherUserIds = allUserIds.filter(id => id !== currentUserId);
  const orderedUserIds = [currentUserId, ...otherUserIds];
  
  // Create ordered result with current user first
  const orderedUserPercentages: Record<string, string> = {};
  for (const userId of orderedUserIds) {
    if (allUserPercentages[userId] !== undefined) {
      orderedUserPercentages[userId] = allUserPercentages[userId];
    }
  }

  return orderedUserPercentages;
}

export async function createTestExpensesWithCurrentUser(authenticatedPage: TestHelper): Promise<Record<string, any>> {
  // Get current user ID and all user percentages
  const currentUserId = await getCurrentUserId(authenticatedPage);
  const currentPercentages = await getCurrentUserPercentages(authenticatedPage);

  // Get all user IDs and ensure current user is first
  const allUserIds = Object.keys(currentPercentages);
  const otherUserIds = allUserIds.filter(id => id !== currentUserId);
  const orderedUserIds = [currentUserId, ...otherUserIds];

  console.log('Current user ID:', currentUserId);
  console.log('All user IDs:', allUserIds);
  console.log('Ordered user IDs (current user first):', orderedUserIds);

  // Import and use createTestExpenses
  const { createTestExpenses } = await import('../fixtures/test-data');
  return createTestExpenses(orderedUserIds);
}

export async function getNewUserPercentage(authenticatedPage: TestHelper, userId?: string) {
  // If no userId provided, get the first available user from current percentages
  if (!userId) {
    const currentPercentages = await getCurrentUserPercentages(authenticatedPage);
    const userIds = Object.keys(currentPercentages);
    if (userIds.length === 0) {
      throw new Error('No users found to get percentage for');
    }
    userId = userIds[0]; // Use first available user
  }

  const userPercentage = Number(await authenticatedPage.page.inputValue(`[data-test-id="user-${userId}-percentage"]`));

  const newUserPercentage = userPercentage < 100 ? userPercentage + 1 : 100 - userPercentage;
  console.log(`newUser${userId}Percentage`, newUserPercentage);
  return newUserPercentage;
}
