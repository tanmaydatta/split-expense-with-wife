import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../index';
import { setupAndCleanDatabase, createTestUserData, createTestSession, createTestRequest } from './test-utils';
import { TestSuccessResponse, TestTransactionCreateResponse, TestTransactionsListResponse, TestErrorResponse, TestTransactionDbResult, TestTransactionUserDbResult } from './types';

describe('Split Handlers', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
  });

  describe('handleSplit', () => {
    it('should create a split successfully with Splitwise (50/50)', async () => {
      // Mock the external Splitwise API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12345 })
      });

      // Replace global fetch with our mock
      vi.stubGlobal('fetch', mockFetch);

      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = createTestRequest('split', 'POST', {
        amount: 100,
        currency: 'USD',
        description: 'Dinner',
        splitPctShares: { '1': 50, '2': 50 },
        paidByShares: { '1': 100, '2': 0 },
        pin: '1234'
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestSuccessResponse;
      expect(json.message).toBe('Split created successfully');

      // Verify the mock was called with the correct URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://secure.splitwise.com/api/v3.0/create_expense',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer'),
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('Dinner')
        })
      );

      // Restore global fetch
      vi.unstubAllGlobals();
    });

    it('should create a split with 60/40 percentage', async () => {
      // Mock the external Splitwise API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12346 })
      });

      vi.stubGlobal('fetch', mockFetch);

      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = createTestRequest('split', 'POST', {
        amount: 200,
        currency: 'USD',
        description: 'Groceries',
        splitPctShares: { '1': 60, '2': 40 },
        paidByShares: { '1': 200, '2': 0 },
        pin: '1234'
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Split created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify the transaction was stored in database
      const transactionResult = await env.DB.prepare('SELECT * FROM transactions WHERE transaction_id = ?').bind(json.transactionId).first();
      expect(transactionResult).toBeTruthy();
      const transaction = transactionResult as TestTransactionDbResult;
      expect(transaction.description).toBe('Groceries');
      expect(transaction.amount).toBe(200);

      vi.unstubAllGlobals();
    });

    it('should create a split with 3 users', async () => {
      // Mock the external Splitwise API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12347 })
      });

      vi.stubGlobal('fetch', mockFetch);

      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = createTestRequest('split', 'POST', {
        amount: 300,
        currency: 'USD',
        description: 'Pizza for three',
        splitPctShares: { '1': 40, '2': 30, '3': 30 },
        paidByShares: { '1': 300, '2': 0, '3': 0 },
        pin: '1234'
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Split created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify debt records are created (only for users who owe money)
      // User 1 paid $300, owes $120 (40% of $300), so they are OWED $180
      // Users 2 and 3 owe money, so 2 records should be created
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results.length).toBe(2);

      vi.unstubAllGlobals();
    });

    it('should create a split with 4 users and mixed payment', async () => {
      // Mock the external Splitwise API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12348 })
      });

      vi.stubGlobal('fetch', mockFetch);

      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = createTestRequest('split', 'POST', {
        amount: 400,
        currency: 'USD',
        description: 'Group dinner',
        splitPctShares: { '1': 25, '2': 25, '3': 25, '4': 25 },
        paidByShares: { '1': 150, '2': 100, '3': 150, '4': 0 },
        pin: '1234'
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Split created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify debt records are created (only for users who owe money)
      // User 1: paid $150, owes $100, net = +$50 (owed)
      // User 2: paid $100, owes $100, net = $0 (even)
      // User 3: paid $150, owes $100, net = +$50 (owed)
      // User 4: paid $0, owes $100, net = -$100 (owes)
      // Only User 4 owes money, split between Users 1 and 3, so 2 records
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results.length).toBe(2);

      vi.unstubAllGlobals();
    });

    it('should reject invalid split percentages', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100,
          currency: 'USD',
          description: 'Invalid split',
          splitPctShares: { '1': 60, '2': 30 }, // Only adds up to 90%
          paidByShares: { '1': 100, '2': 0 },
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const json = await response.json() as TestErrorResponse;
      expect(json.error).toBe('Split percentages must total 100%');
    });

    it('should reject invalid paid amounts', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100,
          currency: 'USD',
          description: 'Invalid payment',
          splitPctShares: { '1': 50, '2': 50 },
          paidByShares: { '1': 80, '2': 0 }, // Only adds up to 80, not 100
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const json = await response.json() as TestErrorResponse;
      expect(json.error).toBe('Paid amounts must equal total amount');
    });
  });

  describe('handleSplitDelete', () => {
    it('should delete a split successfully', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create a transaction to delete using correct schema
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('123', 'Test split', 100, 'USD', 1, '2024-01-01 00:00:00')");
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('123', 1, 50, 2, 'USD', 1)");

      const request = createTestRequest('split_delete', 'POST', {
        id: '123',
        pin: '1234'
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestSuccessResponse;
      expect(json.message).toBe('Transaction deleted successfully');
    });
  });

  describe('handleSplitNew', () => {
    it('should create a new split in the database (50/50)', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 100,
        currency: 'USD',
        description: 'Dinner',
        splitPctShares: { '1': 50, '2': 50 },
        paidByShares: { '1': 100, '2': 0 },
        pin: '1234'
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestSuccessResponse;
      expect(json.message).toBe('Transaction created successfully');
    });

    it('should create a new split with 70/30 percentage', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split_new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 150,
          currency: 'USD',
          description: 'Coffee and pastries',
          splitPctShares: { '1': 70, '2': 30 },
          paidByShares: { '1': 150, '2': 0 },
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Transaction created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify the transaction was stored in database
      const transactionResult = await env.DB.prepare('SELECT * FROM transactions WHERE transaction_id = ?').bind(json.transactionId).first();
      expect(transactionResult).toBeTruthy();
      expect((transactionResult as TestTransactionDbResult).amount).toBe(150);
    });

    it('should create a new split with 3 users (equal shares)', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split_new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 300,
          currency: 'USD',
          description: 'Taxi ride for three',
          splitPctShares: { '1': 33.33, '2': 33.33, '3': 33.34 },
          paidByShares: { '1': 300, '2': 0, '3': 0 },
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Transaction created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify debt records are created (only for users who owe money)
      // User 1 paid $300, but only owes $100 (33.33% of $300), so they are OWED money
      // Users 2 and 3 owe money, so only 2 records should be created
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results.length).toBe(2);
    });

    it('should create a new split with 4 users (unequal shares)', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split_new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 500,
          currency: 'USD',
          description: 'Hotel room split',
          splitPctShares: { '1': 40, '2': 30, '3': 20, '4': 10 },
          paidByShares: { '1': 0, '2': 500, '3': 0, '4': 0 },
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Transaction created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify debt records are created (only for users who owe money)
      // User 2 paid $500 and owes $150 (30% of $500), so they are OWED $350
      // Users 1, 3, and 4 owe money, so 3 records should be created
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results.length).toBe(3);

      // Check that the amounts match the expected split
      const user1Transaction = userTransactions.results.find((t: TestTransactionUserDbResult) => t.user_id === 1);
      expect(user1Transaction).toBeTruthy();
      expect((user1Transaction as TestTransactionUserDbResult).amount).toBe(200); // 40% of 500
    });

    it('should create a new split with multiple people paying', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split_new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 240,
          currency: 'USD',
          description: 'Concert tickets',
          splitPctShares: { '1': 25, '2': 25, '3': 25, '4': 25 },
          paidByShares: { '1': 120, '2': 120, '3': 0, '4': 0 },
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionCreateResponse;
      expect(json.message).toBe('Transaction created successfully');
      expect(json.transactionId).toBeDefined();

      // Verify the transaction was stored
      const transactionResult = await env.DB.prepare('SELECT * FROM transactions WHERE transaction_id = ?').bind(json.transactionId).first();
      expect(transactionResult).toBeTruthy();
      expect((transactionResult as TestTransactionDbResult).amount).toBe(240);
    });

    it('should reject invalid split percentages in split_new', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split_new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100,
          currency: 'USD',
          description: 'Invalid split',
          splitPctShares: { '1': 45, '2': 45 }, // Only adds up to 90%
          paidByShares: { '1': 100, '2': 0 },
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const json = await response.json() as TestErrorResponse;
      expect(json.error).toBe('Split percentages must total 100%');
    });

    it('should reject invalid paid amounts in split_new', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/split_new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100,
          currency: 'USD',
          description: 'Invalid payment',
          splitPctShares: { '1': 50, '2': 50 },
          paidByShares: { '1': 120, '2': 0 }, // Paid amount exceeds total
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const json = await response.json() as TestErrorResponse;
      expect(json.error).toBe('Paid amounts must equal total amount');
    });
  });

  describe('handleTransactionsList', () => {
    it('should return a list of transactions', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create some transactions using correct schema
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('1', 'Transaction 1', 100, 'USD', 1, '2024-01-01 00:00:00')");

      const request = createTestRequest('transactions_list', 'POST', {
        offset: 0
      }, 'test-session-id');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestTransactionsListResponse;
      expect(json.transactions[0].description).toBe('Transaction 1');
    });
  });
});
