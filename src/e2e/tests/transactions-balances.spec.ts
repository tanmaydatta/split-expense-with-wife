import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Transactions and Balances', () => {
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

  test('should display transactions page', async ({ authenticatedPage }) => {
    // Mock transactions data
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify page elements
    await expect(authenticatedPage.page.locator('.transaction-list')).toBeVisible();
    await expect(authenticatedPage.page.locator('.transaction-item')).toHaveCount(1);
  });

  test('should display transaction details correctly', async ({ authenticatedPage }) => {
    // Mock transactions data
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify transaction details are displayed
    const transactionItem = authenticatedPage.page.locator('.transaction-item').first();
    await expect(transactionItem.locator('.transaction-description')).toContainText('Grocery shopping');
    await expect(transactionItem.locator('.transaction-amount')).toContainText('150.50');
    await expect(transactionItem.locator('.transaction-currency')).toContainText('USD');
  });

  test('should display who paid and who owes information', async ({ authenticatedPage }) => {
    // Mock transactions data
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify payment information is displayed
    const transactionItem = authenticatedPage.page.locator('.transaction-item').first();
    await expect(transactionItem.locator('.paid-by')).toBeVisible();
    await expect(transactionItem.locator('.owed-amounts')).toBeVisible();
  });

  test('should handle empty transaction list', async ({ authenticatedPage }) => {
    // Mock empty transactions response
    await authenticatedPage.mockApiResponse('transactions_list', { 
      transactions: [],
      transactionDetails: {}
    });
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify empty state
    await expect(authenticatedPage.page.locator('.transaction-item')).toHaveCount(0);
    await expect(authenticatedPage.page.locator('.empty-state')).toBeVisible();
  });

  test('should handle transaction loading errors', async ({ authenticatedPage }) => {
    // Mock error response
    await authenticatedPage.mockApiError('transactions_list', 500, 'Server error');
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify error handling
    await expect(authenticatedPage.page.locator('.error-message')).toBeVisible();
  });

  test('should display balances page', async ({ authenticatedPage }) => {
    // Mock balances data
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify balances page elements
    await expect(authenticatedPage.page.locator('.balance-summary')).toBeVisible();
    await expect(authenticatedPage.page.locator('.balance-user')).toHaveCount(2);
  });

  test('should display balance information correctly', async ({ authenticatedPage }) => {
    // Mock balances data
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify balance details
    const johnBalance = authenticatedPage.page.locator('.balance-user').first();
    await expect(johnBalance.locator('.balance-name')).toContainText('John');
    await expect(johnBalance.locator('.balance-amount')).toContainText('125.50');
    await expect(johnBalance.locator('.balance-currency')).toContainText('USD');
  });

  test('should display multi-currency balances', async ({ authenticatedPage }) => {
    // Mock balances data
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify multi-currency support
    await expect(authenticatedPage.page.locator('.balance-currency:has-text("USD")')).toBeVisible();
    await expect(authenticatedPage.page.locator('.balance-currency:has-text("EUR")')).toBeVisible();
  });

  test('should handle positive and negative balances', async ({ authenticatedPage }) => {
    // Mock balances data
    await authenticatedPage.mockApiResponse('balances', testData.mockResponses.balances.success);
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify positive balance styling
    const positiveBalance = authenticatedPage.page.locator('.balance-user').first();
    await expect(positiveBalance.locator('.balance-amount.positive')).toBeVisible();
    
    // Verify negative balance styling
    const negativeBalance = authenticatedPage.page.locator('.balance-user').last();
    await expect(negativeBalance.locator('.balance-amount.negative')).toBeVisible();
  });

  test('should handle empty balances', async ({ authenticatedPage }) => {
    // Mock empty balances response
    await authenticatedPage.mockApiResponse('balances', {});
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify empty state
    await expect(authenticatedPage.page.locator('.balance-user')).toHaveCount(0);
    await expect(authenticatedPage.page.locator('.empty-balances')).toBeVisible();
  });

  test('should handle balance loading errors', async ({ authenticatedPage }) => {
    // Mock error response
    await authenticatedPage.mockApiError('balances', 500, 'Server error');
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify error handling
    await expect(authenticatedPage.page.locator('.error-message')).toBeVisible();
  });

  test('should show loading state for transactions', async ({ authenticatedPage }) => {
    // Mock delayed response
    await authenticatedPage.page.route('**/.netlify/functions/transactions_list', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.transactions.success)
      });
    });
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify loading state
    await expect(authenticatedPage.page.locator('.loader')).toBeVisible();
    
    // Wait for completion
    await authenticatedPage.waitForLoading();
    await expect(authenticatedPage.page.locator('.loader')).not.toBeVisible();
    await expect(authenticatedPage.page.locator('.transaction-item')).toHaveCount(1);
  });

  test('should show loading state for balances', async ({ authenticatedPage }) => {
    // Mock delayed response
    await authenticatedPage.page.route('**/.netlify/functions/balances', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.balances.success)
      });
    });
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Verify loading state
    await expect(authenticatedPage.page.locator('.loader')).toBeVisible();
    
    // Wait for completion
    await authenticatedPage.waitForLoading();
    await expect(authenticatedPage.page.locator('.loader')).not.toBeVisible();
    await expect(authenticatedPage.page.locator('.balance-user')).toHaveCount(2);
  });

  test('should handle authentication errors on transactions page', async ({ authenticatedPage }) => {
    // Mock 401 error
    await authenticatedPage.mockApiError('transactions_list', 401, 'Unauthorized');
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Should show login form on root page
    await expect(authenticatedPage.page).toHaveURL('/');
    await expect(authenticatedPage.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should handle authentication errors on balances page', async ({ authenticatedPage }) => {
    // Mock 401 error
    await authenticatedPage.mockApiError('balances', 401, 'Unauthorized');
    
    // Navigate to balances page
    await authenticatedPage.navigateToPage('Balances');
    
    // Should show login form on root page
    await expect(authenticatedPage.page).toHaveURL('/');
    await expect(authenticatedPage.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should display transaction amounts with correct formatting', async ({ authenticatedPage }) => {
    // Mock transactions with different amounts
    const mockTransactions = {
      transactions: [
        {
          id: 1,
          description: 'Small expense',
          amount: 5.50,
          created_at: new Date().toISOString(),
          currency: 'USD',
          transaction_id: 'txn_001',
          group_id: 1,
          metadata: {
            owedAmounts: { '1': 2.75, '2': 2.75 },
            paidByShares: { '1': 5.50 },
            owedToAmounts: { '1': 2.75, '2': 2.75 }
          }
        },
        {
          id: 2,
          description: 'Large expense',
          amount: 1234.99,
          created_at: new Date().toISOString(),
          currency: 'USD',
          transaction_id: 'txn_002',
          group_id: 1,
          metadata: {
            owedAmounts: { '1': 617.50, '2': 617.49 },
            paidByShares: { '1': 1234.99 },
            owedToAmounts: { '1': 617.50, '2': 617.49 }
          }
        }
      ],
      transactionDetails: {
        'txn_001': [{ user_id: 1, owed_to_user_id: 1, amount: 5.50 }],
        'txn_002': [{ user_id: 1, owed_to_user_id: 1, amount: 1234.99 }]
      }
    };
    
    await authenticatedPage.mockApiResponse('transactions_list', mockTransactions);
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify amount formatting
    await expect(authenticatedPage.page.locator('.transaction-amount').first()).toContainText('5.50');
    await expect(authenticatedPage.page.locator('.transaction-amount').last()).toContainText('1234.99');
  });

  test('should display transaction dates correctly', async ({ authenticatedPage }) => {
    // Mock transactions data
    await authenticatedPage.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify date is displayed
    await expect(authenticatedPage.page.locator('.transaction-date')).toBeVisible();
    await expect(authenticatedPage.page.locator('.transaction-date').first()).not.toBeEmpty();
  });

  test('should support transaction pagination or infinite scroll', async ({ authenticatedPage }) => {
    // Mock transactions data with pagination
    const mockTransactions = {
      transactions: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        description: `Transaction ${i + 1}`,
        amount: 100 + i,
        created_at: new Date().toISOString(),
        currency: 'USD',
        transaction_id: `txn_${i + 1}`,
        group_id: 1,
        metadata: {
          owedAmounts: { '1': 50 + i/2, '2': 50 + i/2 },
          paidByShares: { '1': 100 + i },
          owedToAmounts: { '1': 50 + i/2, '2': 50 + i/2 }
        }
      })),
      transactionDetails: {}
    };
    
    await authenticatedPage.mockApiResponse('transactions_list', mockTransactions);
    
    // Navigate to transactions page
    await authenticatedPage.navigateToPage('Expenses');
    
    // Verify multiple transactions are displayed
    await expect(authenticatedPage.page.locator('.transaction-item')).toHaveCount(10);
    
    // Test scrolling or pagination if implemented
    if (await authenticatedPage.page.locator('.pagination').isVisible()) {
      await authenticatedPage.page.click('.pagination .next');
      await authenticatedPage.waitForLoading();
    }
  });
}); 