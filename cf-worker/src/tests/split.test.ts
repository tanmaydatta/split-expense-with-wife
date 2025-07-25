import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../index';
import { setupAndCleanDatabase, createTestUserData, createTestSession, createTestRequest } from './test-utils';
import {
  ErrorResponse,
  ApiEndpoints,
  TransactionsListResponse
} from '../../../shared-types';

// Type aliases for API responses
type SplitCreateResponse = ApiEndpoints['/split_new']['response'];
type SplitDeleteResponse = ApiEndpoints['/split_delete']['response'];

// Define types for database result objects
interface TransactionDbResult {
  description: string;
  amount: number;
  currency: string;
}

interface TransactionUserDbResult {
  amount: number;
  currency: string;
  group_id: number;
}

describe('Split handlers', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
  });

  describe('Split creation', () => {
    it('should create a split transaction successfully', async () => {
      // Set up test data
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 100,
        description: 'Test split',
        currency: 'USD',
        paidByShares: { 1: 60, 2: 40 },
        splitPctShares: { 1: 50, 2: 50 }
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;
      expect(json.message).toContain('successfully');
      expect(json.transactionId).toBeDefined();

      // Verify transaction was created in database
      const transactionResult = await env.DB.prepare('SELECT * FROM transactions WHERE transaction_id = ?').bind(json.transactionId).first();
      expect(transactionResult).toBeDefined();
      expect((transactionResult as TransactionDbResult).description).toBe('Test split');
      expect((transactionResult as TransactionDbResult).amount).toBe(100);
      expect((transactionResult as TransactionDbResult).currency).toBe('USD');
    });

    it('should create a complex split with multiple users successfully', async () => {
      // Set up test data
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 120,
        description: 'Group dinner',
        currency: 'USD',
        paidByShares: { 1: 80, 2: 40 },
        splitPctShares: { 1: 60, 2: 40 }
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;
      expect(json.message).toContain('successfully');

      // Check that transaction details were created with correct amounts
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results).toHaveLength(4); // 2 users x 2 payers

      // Verify the split amounts add up correctly
      const splitData = userTransactions.results as TransactionUserDbResult[];
      const totalAmount = splitData.reduce((sum, record) => sum + record.amount, 0);
      expect(Math.abs(totalAmount - 120)).toBeLessThan(0.01);
    });

    it('should return error for invalid split percentages', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 100,
        description: 'Invalid split',
        currency: 'USD',
        paidByShares: { 1: 100 },
        splitPctShares: { 1: 60, 2: 30 } // Only adds up to 90%
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toContain('100%');
    });

    it('should return error for invalid paid amounts', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 100,
        description: 'Invalid paid amounts',
        currency: 'USD',
        paidByShares: { 1: 60, 2: 30 }, // Only adds up to 90
        splitPctShares: { 1: 50, 2: 50 }
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toContain('total amount');
    });
  });

  describe('Split deletion', () => {
    it('should delete a split transaction successfully', async () => {
      // Set up test data and create a transaction first
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      // Insert a test transaction
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('123', 'Test split', 100, 'USD', 1, '2024-01-01 00:00:00')");
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('123', 1, 50, 2, 'USD', 1)");

      const request = createTestRequest('split_delete', 'POST', {
        id: '123'
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitDeleteResponse;
      expect(json.message).toContain('successfully');
    });

    it('should handle deletion of non-existent transaction', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_delete', 'POST', {
        id: 'non-existent'
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toContain('not found');
    });
  });

  describe('Split creation (split_new)', () => {
    it('should create a new split with generated transaction ID', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 75,
        description: 'New split test',
        currency: 'EUR',
        paidByShares: { 1: 45, 2: 30 },
        splitPctShares: { 1: 70, 2: 30 }
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;
      expect(json.transactionId).toBeDefined();
      expect(json.transactionId.length).toBeGreaterThan(0);

      // Verify transaction was created in database
      const transactionResult = await env.DB.prepare('SELECT * FROM transactions WHERE transaction_id = ?').bind(json.transactionId).first();
      expect(transactionResult).toBeDefined();
      expect((transactionResult as TransactionDbResult).description).toBe('New split test');
      expect((transactionResult as TransactionDbResult).amount).toBe(75);
      expect((transactionResult as TransactionDbResult).currency).toBe('EUR');
    });

    it('should create transaction users for new split', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 90,
        description: 'Multi-user split',
        currency: 'GBP',
        paidByShares: { 1: 60, 2: 30 },
        splitPctShares: { 1: 40, 2: 60 }
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;

      // Check transaction users were created
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results).toHaveLength(4); // 2 users, 2 payers = 4 entries

      // Verify amounts and currencies
      for (const transaction of userTransactions.results as TransactionUserDbResult[]) {
        expect(transaction.currency).toBe('GBP');
        expect(transaction.group_id).toBe(1);
        expect(transaction.amount).toBeGreaterThan(0);
      }
    });

    it('should return error for unauthenticated request', async () => {
      const request = createTestRequest('split_new', 'POST', {
        amount: 50,
        description: 'Unauthenticated split',
        currency: 'USD',
        paidByShares: { 1: 50 },
        splitPctShares: { 1: 100 }
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toBe('Unauthorized');
    });

    it('should return error for invalid currency', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      const request = createTestRequest('split_new', 'POST', {
        amount: 100,
        description: 'Invalid currency split',
        currency: 'INVALID',
        paidByShares: { 1: 100 },
        splitPctShares: { 1: 100 }
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toContain('currency');
    });
  });

  describe('Transactions list', () => {
    it('should return list of transactions', async () => {
      await createTestUserData(env);
      const sessionId = await createTestSession(env);

      // Add a test transaction
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('1', 'Transaction 1', 100, 'USD', 1, '2024-01-01 00:00:00')");

      const request = createTestRequest('transactions_list', 'POST', {
        offset: 0
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as TransactionsListResponse;
      expect(json.transactions).toHaveLength(1);
      expect(json.transactions[0].description).toBe('Transaction 1');
      expect(json.transactionDetails).toBeDefined();
    });
  });
});
