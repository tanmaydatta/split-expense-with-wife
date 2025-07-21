import { test, expect } from '../fixtures/setup';
import { ExpenseTestHelper } from '../utils/expense-test-helper';
import { TestHelper } from '../utils/test-utils';

// Helper class for transaction and balance operations using composition
class TransactionBalanceTestHelper {
  private expenseHelper: ExpenseTestHelper;

  constructor(private authenticatedPage: TestHelper) {
    this.expenseHelper = new ExpenseTestHelper(authenticatedPage);
  }

  async createTestExpense(description?: string, amount?: number, currency?: string, customSplits?: Record<string, number>) {
    // Navigate to Add page to create an expense
    await this.authenticatedPage.navigateToPage('Add');
    
    // Use the expense helper to create the expense
    const expense = {
      description: description || 'Test expense',
      amount: amount || 100,
      currency: currency || 'USD',
      paidBy: '1'
    };
    
    const result = await this.expenseHelper.addExpenseEntry(expense, customSplits);
    return { 
      description: result.description, 
      amount: expense.amount, 
      currency: expense.currency,
      successMessage: result.successMessage
    };
  }

  async verifyTransactionsPageComponents() {
    // Reuse the expense helper for page verification
    await this.expenseHelper.verifyExpensesPageComponents();
  }

  async verifyTransactionInList(description: string, amount: number, currency: string, expectedShare?: string) {
    // Reuse the expense helper for transaction verification
    await this.expenseHelper.verifySpecificExpenseEntry(description, amount.toString(), currency, expectedShare);
  }

  async verifyBalancesPageComponents() {
    // Verify we're on the balances page
    await expect(this.authenticatedPage.page).toHaveURL('/balances');
    
    console.log("Verifying balances page components");
    
    // Wait for page to load by checking for main content
    // This will succeed if any of these selectors are found
    await this.authenticatedPage.page.waitForSelector('[data-test-id="balances-container"], [data-test-id="empty-balances"], [data-test-id^="balance-section-"], [data-test-id="amount-item"]', { timeout: 10000 });
    
    console.log("✅ Balances page components verification completed - content found and loaded");
  }

  async getCurrentBalances(): Promise<Record<string, Record<string, number>>> {
    console.log("Getting current balance totals");
    
    // Wait for balances to load by checking for content
    await this.authenticatedPage.page.waitForSelector('[data-test-id="balances-container"], [data-test-id="empty-balances"], [data-test-id^="balance-section-"], [data-test-id="amount-item"]', { timeout: 10000 });
    
    const balances: Record<string, Record<string, number>> = {};
    
    // Wait a bit longer for the page to fully load before checking for empty state
    await this.authenticatedPage.page.waitForTimeout(1000);
    
    // Check if we have an empty balances state - but wait longer to ensure it's truly empty
    const emptyBalances = this.authenticatedPage.page.locator('[data-test-id="empty-balances"]');
    const hasEmptyState = await emptyBalances.isVisible({ timeout: 500 });
    
    // Also check if we have user sections or amount items
    const userSections = this.authenticatedPage.page.locator('[data-test-id^="balance-section-"]');
    const amountItems = this.authenticatedPage.page.locator('[data-test-id="amount-item"]');
    const userCount = await userSections.count();
    const itemCount = await amountItems.count();
    
    // Only return empty if we truly have no content and confirmed empty state
    if (hasEmptyState && userCount === 0 && itemCount === 0) {
      console.log("Confirmed empty balances state - returning empty balances object");
      return balances;
    }
    
    // Use the userSections and userCount already declared above
    if (userCount === 0) {
      console.log("No user sections found - checking for amount items directly");
      // Try to find amount items directly if no user sections are found
      const amountItems = this.authenticatedPage.page.locator('[data-test-id="amount-item"]');
      const itemCount = await amountItems.count();
      
      if (itemCount === 0) {
        console.log("No balance data found - returning empty balances");
        return balances;
      }
      
      // Process direct amount items without user sections
      console.log(`Found ${itemCount} amount items without user sections`);
      return balances;
    }
    
    for (let i = 0; i < userCount; i++) {
      const section = userSections.nth(i);
      const userHeader = section.locator('[data-test-id^="user-header-"]');
      const userName = await userHeader.textContent();
      
      if (userName) {
        console.log(`Processing balances for user: ${userName}`);
        balances[userName] = {};
        
        // Look for amount items within this user's section
        const amountItems = section.locator('[data-test-id="amount-item"]');
        const amountCount = await amountItems.count();
        
        for (let j = 0; j < amountCount; j++) {
          const amountItem = amountItems.nth(j);
          const amountText = await amountItem.textContent() || '';
          
          // Extract currency and amount using regex (handles + and - signs, including C$ for CAD)
          const currencyMatch = amountText.match(/([+-]?)(C\$|[£$€¥])(\d+\.?\d*)/);
          if (currencyMatch) {
            const sign = currencyMatch[1];
            const currencySymbol = currencyMatch[2];
            let amount = parseFloat(currencyMatch[3]);
            
            // Apply sign
            if (sign === '-') {
              amount = -amount;
            }
            
            // Map currency symbols to codes (including C$ for CAD)
            const currencyMap: Record<string, string> = { 
              '$': 'USD', 
              'C$': 'CAD',
              '€': 'EUR', 
              '£': 'GBP', 
              '¥': 'JPY' 
            };
            const currencyCode = currencyMap[currencySymbol] || currencySymbol;
            
            // Sum multiple entries for the same currency
            balances[userName][currencyCode] = (balances[userName][currencyCode] || 0) + amount;
            console.log(`✓ ${userName} ${currencyCode}: ${amount} (total: ${balances[userName][currencyCode]})`);
          }
        }
      }
    }
    
    console.log("Current balances:", JSON.stringify(balances, null, 2));
    return balances;
  }

  async verifyBalances(expectedBalances: Record<string, Record<string, number>>) {
    console.log("Verifying expected balances");
    
    const currentBalances = await this.getCurrentBalances();
    
    // Verify each expected balance
    for (const [userName, currencies] of Object.entries(expectedBalances)) {
      for (const [currency, expectedAmount] of Object.entries(currencies)) {
        const currentAmount = currentBalances[userName]?.[currency] || 0;
        
        expect(currentAmount).toBeCloseTo(expectedAmount, 2);
        console.log(`✓ ${userName} ${currency}: expected ${expectedAmount}, got ${currentAmount}`);
      }
    }
    
    console.log("✅ Balance verification completed");
  }

  async verifyBalanceEntries() {
    console.log("Verifying balance entries");
    
    // Wait for balance entries to load by checking for content
    await this.authenticatedPage.page.waitForSelector('[data-test-id="amount-item"], [data-test-id="empty-balances"]', { timeout: 10000 });
    
    // Look for balance entries using only data-test-id
    const amountItems = this.authenticatedPage.page.locator('[data-test-id="amount-item"]');
    const count = await amountItems.count();
    
    expect(count).toBeGreaterThan(0);
    console.log(`Found ${count} balance items`);
    
    // Verify balance entries contain expected content
    for (let i = 0; i < Math.min(count, 5); i++) {
      const item = amountItems.nth(i);
      const text = await item.textContent();
      if (text) {
        console.log(`Balance entry ${i + 1}: ${text}`);
        
        // Check for currency symbols and amounts
        const hasCurrencyInfo = /[$€£¥]|\d+\.\d{2}/.test(text);
        expect(hasCurrencyInfo).toBe(true);
        console.log(`✓ Balance entry ${i + 1} contains currency/amount information`);
      }
    }

    console.log("✅ Balance entries verification completed");
  }

  async verifyMultiCurrencySupport() {
    console.log("Verifying multi-currency support");
    
    const currencySymbols = ['$', 'C$', '€', '£', '¥'];
    let foundCurrencies = 0;
    
    for (const symbol of currencySymbols) {
      const currencyItems = await this.authenticatedPage.page.locator(`[data-test-id="amount-item"]:has-text("${symbol}")`).count();
      if (currencyItems > 0) {
        foundCurrencies++;
        console.log(`✓ Found currency symbol: ${symbol}`);
      }
    }
    
    console.log(`Total currencies found: ${foundCurrencies}`);
    expect(foundCurrencies).toBeGreaterThan(0);
    console.log("✅ Multi-currency support verification completed");
  }

  async verifyTransactionDetails(description: string, expectedTotalAmount?: number, expectedAmountsOwed?: Record<string, string>, expectedPaidBy?: Record<string, string>, expectedTotalOwed?: string) {
    console.log("Verifying transaction details for:", description);
    
    // Check which view is visible (desktop table vs mobile cards)
    const desktopTable = this.authenticatedPage.page.locator('.desktop-table');
    const mobileCards = this.authenticatedPage.page.locator('.mobile-cards');
    
    let targetItem = null;
    let transactionId = null;
    
    // Determine which view is visible and use appropriate selector
    if (await desktopTable.isVisible({ timeout: 1000 })) {
      console.log("Desktop table view detected, looking for transaction-item");
      const transactionItems = await this.authenticatedPage.page.locator('[data-test-id="transaction-item"]').all();
      
      for (const item of transactionItems) {
        const text = await item.textContent();
        if (text && text.includes(description)) {
          console.log(`Found transaction to expand (desktop): ${description}`);
          targetItem = item;
          transactionId = await item.getAttribute('data-transaction-id');
          break;
        }
      }
    } else if (await mobileCards.isVisible({ timeout: 1000 })) {
      console.log("Mobile cards view detected, looking for transaction-card");
      const transactionCards = await this.authenticatedPage.page.locator('[data-test-id="transaction-card"]').all();
      
      for (const card of transactionCards) {
        const text = await card.textContent();
        if (text && text.includes(description)) {
          console.log(`Found transaction to expand (mobile): ${description}`);
          targetItem = card;
          transactionId = await card.getAttribute('data-transaction-id');
          break;
        }
      }
    } else {
      throw new Error("Neither desktop table nor mobile cards view is visible");
    }
    
    if (!targetItem) {
      throw new Error(`Transaction not found: ${description}`);
    }
    
    console.log(`Transaction ID: ${transactionId}`);
    
    // Click to expand the transaction
    await targetItem.click();
    
    // Wait for transaction details to appear
    await this.authenticatedPage.page.waitForSelector(`[data-test-id="transaction-details-${transactionId}"]`, { timeout: 5000 });

    // Look for the specific transaction details using the transaction ID
    let detailsContainer = null;
    const detailsContainers = await this.authenticatedPage.page.locator(`[data-test-id="transaction-details-${transactionId}"]`).all();
    for (const dc of detailsContainers) {
      if (await dc.isVisible()) {
        detailsContainer = dc;
      }
    }
    expect(detailsContainer).not.toBeNull();
    // Assert that the details container is visible within the clicked item
    console.log(`Expanded transaction details found for: ${description}`);
          if (!detailsContainer) {
            console.log(`No details container found for: ${description}`);
            return;
          }
          // Verify each required section exists using data-test-id
          const fullDescription = detailsContainer.locator('[data-test-id="full-description"]');
          const amountOwedSection = detailsContainer.locator('[data-test-id="amount-owed-section"]');
          const paidBySection = detailsContainer.locator('[data-test-id="paid-by-section"]');
          const totalOwedSection = detailsContainer.locator('[data-test-id="total-owed-section"]');

          expect(fullDescription).not.toBeNull();
          expect(amountOwedSection).not.toBeNull();
          expect(paidBySection).not.toBeNull();
          expect(totalOwedSection).not.toBeNull();

          // Assert all sections are visible
          await expect(fullDescription).toBeVisible();
          await expect(amountOwedSection).toBeVisible();
          await expect(paidBySection).toBeVisible();
          await expect(totalOwedSection).toBeVisible();
          
          // Verify the full description contains the expected description
          const fullDescriptionText = await fullDescription.textContent() || '';
          expect(fullDescriptionText).toContain(description);
          console.log(`✓ Full description verified: ${fullDescriptionText}`);
          
          // Verify exact amounts owed for each participant
          if (expectedAmountsOwed) {
            const amountOwedText = await amountOwedSection.textContent() || '';
            console.log(`Amount owed section text: ${amountOwedText}`);
            
            for (const [user, expectedAmount] of Object.entries(expectedAmountsOwed)) {
              expect(amountOwedText).toContain(expectedAmount);
              console.log(`✓ Amount owed verified for ${user}: ${expectedAmount}`);
            }
          }
          
          // Verify exact amounts paid by each participant  
          if (expectedPaidBy) {
            const paidByText = await paidBySection.textContent() || '';
            console.log(`Paid by section text: ${paidByText}`);
            
            for (const [user, expectedAmount] of Object.entries(expectedPaidBy)) {
              expect(paidByText).toContain(expectedAmount);
              console.log(`✓ Paid by amount verified for ${user}: ${expectedAmount}`);
            }
          }
          
          // Verify total owed amount
          if (expectedTotalOwed !== undefined) {
            const totalOwedText = await totalOwedSection.textContent() || '';
            console.log(`Total owed section text: ${totalOwedText}`);
            
            if (expectedTotalOwed.startsWith('+')) {
              expect(totalOwedText).toContain('You are owed');
              expect(totalOwedText).toContain(expectedTotalOwed);
              console.log(`✓ Total owed verified: You are owed +${expectedTotalOwed}`);
            } else if (expectedTotalOwed.startsWith('-')) {
              expect(totalOwedText).toContain('You owe');
              expect(totalOwedText).toContain(expectedTotalOwed);
              console.log(`✓ Total owed verified: You owe -${expectedTotalOwed}`);
            } else {
              expect(totalOwedText).toContain('No amount owed');
              console.log(`✓ Total owed verified: No amount owed`);
            }
          }
          
          // Verify total amount if provided
          if (expectedTotalAmount !== undefined) {
            const fullDetailsText = await detailsContainer.textContent() || '';
            expect(fullDetailsText).toContain(expectedTotalAmount.toString());
            console.log(`✓ Total amount verified: ${expectedTotalAmount}`);
          }
          
          console.log(`✅ Successfully verified all expanded transaction details for: ${description}`);
  }
}

test.describe('Transactions and Balances', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.goto('/');
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.log('Storage clear failed:', e);
      }
    });
  });

  test('should display transactions page with real expense data', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create a test expense first (default 50/50 split)
    // 50/50 split on $75: User 1 pays $75, owes $37.50, share = +$37.50
    const expense = await helper.createTestExpense('Grocery shopping for test', 75, 'USD');
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify page components
    await helper.verifyTransactionsPageComponents();
    
    // Verify the created expense appears in the list with correct share
    await helper.verifyTransactionInList(expense.description, expense.amount, expense.currency, '+$37.50');
  });

  test('should display transaction with correct amount and currency formatting', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create expenses with different amounts and currencies (default 50/50 split)
    // 50/50 split on $5.50: User 1 pays $5.50, owes $2.75, share = +$2.75
    const expense1 = await helper.createTestExpense('Small purchase', 5.50, 'USD');
    // 50/50 split on €1234.99: User 1 pays €1234.99, owes €617.50 (rounded), share = +€617.50
    const expense2 = await helper.createTestExpense('Large purchase', 1234.99, 'EUR');
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    await helper.verifyTransactionsPageComponents();
    
    // Verify both transactions appear with correct formatting and shares
    await helper.verifyTransactionInList(expense1.description, expense1.amount, expense1.currency, '+$2.75');
    await helper.verifyTransactionInList(expense2.description, expense2.amount, expense2.currency, '+€617.50');
  });

  test('should display transaction share calculations correctly', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create expense with custom split (60/40)
    const expense = await helper.createTestExpense('Custom split expense', 100, 'USD', { '1': 60, '2': 40 });
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    await helper.verifyTransactionsPageComponents();
    
    // For 60/40 split on $100: User 1 pays $100, owes $60, so share = +$40.00
    await helper.verifyTransactionInList(expense.description, expense.amount, expense.currency, '+$40.00');
  });

  test('should handle transaction details expansion', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create a test expense with specific split (default 50/50)
    const expense = await helper.createTestExpense('Detailed expense', 150, 'USD');
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    await helper.verifyTransactionsPageComponents();
    
    // First verify the transaction appears in the list
    await helper.verifyTransactionInList(expense.description, expense.amount, expense.currency, '+$75.00');
    
    // Then verify transaction details can be expanded and show correct content
    // For 50/50 split on $150: User 1 (John) pays $150, owes $75, share = +$75.00
    // Expected breakdown:
    // - Amount owed: John: $75.00, Jane: $75.00
    // - Paid by: John: $150.00
    // - Total owed: +$75.00 (John should get $75 back)
    await helper.verifyTransactionDetails(
      expense.description,
      expense.amount, // expectedTotalAmount: 150
      { "John": '$75.00', "Jane": '$75.00' }, // expectedAmountsOwed
      { "John": '$150.00' }, // expectedPaidBy
      '+$75.00' // expectedTotalOwed (positive, John gets money back)
    );
  });

  test('should display balances page with real data', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create some test expenses to generate balances
    await helper.createTestExpense('Balance test 1', 50, 'USD', { '1': 70, '2': 30 });
    await helper.createTestExpense('Balance test 2', 80, 'EUR', { '1': 40, '2': 60 });
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify page components
    await helper.verifyBalancesPageComponents();
    
    // Verify balance entries exist
    await helper.verifyBalanceEntries();
  });

  test('should display multi-currency balances', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create expenses in different currencies
    await helper.createTestExpense('USD expense', 100, 'USD');
    await helper.createTestExpense('EUR expense', 75, 'EUR');
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    
    // Verify multi-currency support
    await helper.verifyMultiCurrencySupport();
  });

  test('should handle pagination on transactions page', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Create multiple expenses to test pagination
    const expenses = [];
    for (let i = 1; i <= 3; i++) {
      const expense = await helper.createTestExpense(`Pagination test ${i}`, 50 + i, 'USD');
      expenses.push(expense);
    }
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    await helper.verifyTransactionsPageComponents();
    
    // Verify first few expenses are visible
    await helper.verifyTransactionInList(expenses[0].description, expenses[0].amount, expenses[0].currency);
    
    // Test "Show more" functionality if it exists
    const showMoreButton = authenticatedPage.page.locator('[data-test-id="show-more-button"]');
    if (await showMoreButton.isVisible({ timeout: 2000 })) {
      await showMoreButton.click();
      // Wait for new transactions to load by checking for content
      await helper.verifyTransactionsPageComponents();
      
      // Verify more transactions are now visible
      await helper.verifyTransactionInList(expenses[expenses.length - 1].description, expenses[expenses.length - 1].amount, expenses[expenses.length - 1].currency);
    }
  });

  test('should verify balance totals change correctly after adding expense', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Navigate to balances page first to get initial state
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    
    // Get initial balances
    const initialBalances = await helper.getCurrentBalances();
    console.log("Initial balances:", JSON.stringify(initialBalances, null, 2));
    
    // Create a single test expense with 60/40 split
    // John (User 1) pays $120, owes $72 (60%), gets +$48.00 back
    // Jane (User 2) owes $48 (40%), so her balance decreases by -$48.00
    const expenseAmount = 120;
    const currency = 'USD';
    await helper.createTestExpense('Balance test expense', expenseAmount, currency, { '1': 60, '2': 40 });
    
    // Calculate expected balance changes
    const expectedBalances = JSON.parse(JSON.stringify(initialBalances)); // deep copy
    
    // Ensure Jane exists in expected balances (John is logged-in user, so won't appear on balances page)
    if (!expectedBalances['Jane']) expectedBalances['Jane'] = {};
    
    // Apply balance changes from the expense
    // Since John is the logged-in user, only Jane's balance appears on the balances page
    // Jane: owes $48 to John, so her balance increases by +$48 (showing money John will get)
    const janeChange = +48.00;
    expectedBalances['Jane'][currency] = (expectedBalances['Jane'][currency] || 0) + janeChange;
    
    console.log("Expected balances after expense:", JSON.stringify(expectedBalances, null, 2));
    
    // Navigate back to balances page to get new balances
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    
    // Verify the balances match our calculated expectations
    await helper.verifyBalances(expectedBalances);
    await helper.verifyBalanceEntries();
  });

  test('should display correct balance calculations after multiple transactions', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Get initial balances
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    const initialBalances = await helper.getCurrentBalances();
    console.log("Initial balances:", JSON.stringify(initialBalances, null, 2));
    
    // Create multiple transactions with different splits
    // Transaction 1: 50/50 split on $100: John pays $100, owes $50, gets +$50.00 back
    await helper.createTestExpense('Transaction 1', 100, 'USD', { '1': 50, '2': 50 });
    // Transaction 2: 75/25 split on $80: John pays $80, owes $60, gets +$20.00 back
    await helper.createTestExpense('Transaction 2', 80, 'USD', { '1': 75, '2': 25 });
    
    // Calculate expected balance changes
    const expectedBalances = JSON.parse(JSON.stringify(initialBalances)); // deep copy
    
    // Ensure Jane exists in expected balances (John is logged-in user, so won't appear on balances page)
    if (!expectedBalances['Jane']) expectedBalances['Jane'] = {};
    
    // Apply cumulative balance changes from both transactions
    // Since John is the logged-in user, only Jane's balance appears on the balances page
    // Jane: Transaction 1: owes $50 to John, Transaction 2: owes $20 to John = +$70 total (money John will get)
    const janeTotalChange = +50.00 + 20.00;
    expectedBalances['Jane']['USD'] = (expectedBalances['Jane']['USD'] || 0) + janeTotalChange;
    
    // Remove John from expected balances since he's the logged-in user
    delete expectedBalances['John'];
    
    console.log("Expected balances after multiple transactions:", JSON.stringify(expectedBalances, null, 2));
    
    // Navigate to balances page to verify final balances
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    
    // Verify the balances match our calculated expectations
    await helper.verifyBalances(expectedBalances);
    await helper.verifyBalanceEntries();
  });

  test('should display loading states during data fetching', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Mock the transactions_list API with a 2-second delay
    await authenticatedPage.page.route('**/.netlify/functions/transactions_list', async (route) => {
      // Simulate a 2-second delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Return a successful response with mock data
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transactions: [
            {
              id: 1,
              description: 'Mock transaction for loading test',
              amount: 100,
              created_at: new Date().toISOString(),
              currency: 'USD',
              transaction_id: 'mock_txn_001',
              group_id: 1,
              metadata: JSON.stringify({
                owedAmounts: { '1': 50, '2': 50 },
                paidByShares: { '1': 100 },
                owedToAmounts: { '1': 50, '2': 50 }
              })
            }
          ],
          transactionDetails: {
            'mock_txn_001': [
              {
                user_id: 1,
                owed_to_user_id: 1,
                amount: 100,
                first_name: 'John'
              },
              {
                user_id: 2,
                owed_to_user_id: 1,
                amount: 50,
                first_name: 'Jane'
              }
            ]
          }
        })
      });
    });
    
    // Start navigation to transactions page
    const navigatePromise = authenticatedPage.navigateToPage('Expenses');
    
    // Verify loader appears immediately after navigation starts
    const loader = authenticatedPage.page.locator('[data-test-id="loader"]');
    await expect(loader).toBeVisible({ timeout: 1000 });
    console.log("✅ Loader state detected during API call");
    
    // Wait for navigation to complete (this will wait for the 2-second delay)
    await navigatePromise;
    
    // Wait for expenses container to be visible (ensures page content is loaded)
    await expect(authenticatedPage.page.locator('[data-test-id="expenses-container"]')).toBeVisible({ timeout: 3000 });
    
    // Verify loader disappears after content is loaded
    await expect(loader).not.toBeVisible({ timeout: 3000 });
    console.log("✅ Loader disappeared after API response");
    
    // Verify page loads properly
    await helper.verifyTransactionsPageComponents();
  });

  test('should update balances correctly after expense deletion', async ({ authenticatedPage }) => {
    const helper = new TransactionBalanceTestHelper(authenticatedPage);
    
    // Get initial balances
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    const initialBalances = await helper.getCurrentBalances();
    console.log("Initial balances before expense creation:", JSON.stringify(initialBalances, null, 2));
    
    // Create test expenses that will affect balances
    // Expense 1: 60/40 split on $100: John pays $100, owes $60, gets +$40 back
    // This means Jane owes John $40
    const expense1 = await helper.createTestExpense('Balance deletion test 1', 100, 'USD', { '1': 60, '2': 40 });
    
    // Expense 2: 50/50 split on €80: John pays €80, owes €40, gets +€40 back
    // This means Jane owes John €40
    const expense2 = await helper.createTestExpense('Balance deletion test 2', 80, 'EUR', { '1': 50, '2': 50 });
    
    // Check balances after adding both expenses
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    const balancesAfterAddition = await helper.getCurrentBalances();
    console.log("Balances after adding both expenses:", JSON.stringify(balancesAfterAddition, null, 2));
    
    // Calculate expected balances after adding both expenses
    const expectedAfterAddition = JSON.parse(JSON.stringify(initialBalances));
    if (!expectedAfterAddition['Jane']) expectedAfterAddition['Jane'] = {};
    expectedAfterAddition['Jane']['USD'] = (expectedAfterAddition['Jane']['USD'] || 0) + 40; // Jane owes John $40
    expectedAfterAddition['Jane']['EUR'] = (expectedAfterAddition['Jane']['EUR'] || 0) + 40; // Jane owes John €40
    
    await helper.verifyBalances(expectedAfterAddition);
    
    // Now delete the first expense and verify balances update
    await authenticatedPage.navigateToPage('Expenses');
    await helper.verifyTransactionsPageComponents();
    
    // Import the ExpenseTestHelper to handle deletion
    const expenseHelper = new (await import('../utils/expense-test-helper')).ExpenseTestHelper(authenticatedPage);
    console.log(`Attempting to delete first expense: ${expense1.description}`);
    await expenseHelper.deleteExpenseEntry(expense1.description);
    
    // Check balances after deleting first expense
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    const balancesAfterFirstDeletion = await helper.getCurrentBalances();
    console.log("Balances after deleting first expense:", JSON.stringify(balancesAfterFirstDeletion, null, 2));
    
    // Calculate expected balances after deleting first expense
    // We should be back to initial + second expense only
    const expectedAfterFirstDeletion = JSON.parse(JSON.stringify(initialBalances));
    if (!expectedAfterFirstDeletion['Jane']) expectedAfterFirstDeletion['Jane'] = {};
    expectedAfterFirstDeletion['Jane']['EUR'] = (expectedAfterFirstDeletion['Jane']['EUR'] || 0) + 40; // Only €40 from second expense remains
    // USD balance should be back to initial (first expense deleted)
    
    await helper.verifyBalances(expectedAfterFirstDeletion);
    
    // Delete the second expense and verify balances return to initial state
    await authenticatedPage.navigateToPage('Expenses');
    console.log(`Attempting to delete second expense: ${expense2.description}`);
    await expenseHelper.deleteExpenseEntry(expense2.description);
    
    // Check final balances after deleting both expenses
    await authenticatedPage.navigateToPage('Balances');
    await helper.verifyBalancesPageComponents();
    const finalBalances = await helper.getCurrentBalances();
    console.log("Final balances after deleting both expenses:", JSON.stringify(finalBalances, null, 2));
    
    // Balances should return to initial state
    await helper.verifyBalances(initialBalances);
    
    console.log("✅ Balance deletion test completed successfully");
  });
}); 