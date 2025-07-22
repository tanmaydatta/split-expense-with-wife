import { env as testEnv, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../index';
import { setupAndCleanDatabase, createTestUserData, createTestSession, populateMaterializedTables } from './test-utils';
import { TestBudgetMonthlyResponse, TestBudgetTotalResponse, TestMonthlyBudgetItem, TestAverageSpendItem } from './types';
import { UserBalancesByUser, Env } from '../types';

const env = testEnv as unknown as Env;

describe('Budget Handlers', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
  });

  describe('handleBalances', () => {
    it('should return calculated balances for the user', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Add some transaction data to create balances
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('test-tx-1', 'Test transaction', 100, 'USD', 1, '2024-01-01 00:00:00')");
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('test-tx-1', 1, 50, 2, 'USD', 1), ('test-tx-1', 2, 20, 1, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-30);
    });

    it('should handle 2-user scenario where current user is owed money', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // User 2 owes 75 to user 1 (testuser), user 1 owes 25 to user 2
      // Net: user 2 owes 50 to user 1
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-2', 2, 75, 1, 'USD', 1), ('tx-2', 1, 25, 2, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(50); // Other owes 50 to testuser
    });

    it('should handle 3-user triangular debt scenario', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create triangular debt:
      // User 1 (testuser) owes 30 to user 2 (Other)
      // User 2 (Other) owes 40 to user 3 (Third)
      // User 3 (Third) owes 20 to user 1 (testuser)
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-3a', 1, 30, 2, 'USD', 1), ('tx-3b', 2, 40, 3, 'USD', 1), ('tx-3c', 3, 20, 1, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-30); // testuser owes 30 to Other
      expect(json.Third.USD).toBe(20); // Third owes 20 to testuser
    });

    it('should handle 4-user complex debt scenario', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Complex scenario with 4 users:
      // User 1 (testuser) owes 50 to user 2 (Other)
      // User 3 (Third) owes 30 to user 1 (testuser)
      // User 4 (Fourth) owes 40 to user 1 (testuser)
      // User 1 (testuser) owes 20 to user 4 (Fourth)
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-4a', 1, 50, 2, 'USD', 1), ('tx-4b', 3, 30, 1, 'USD', 1), ('tx-4c', 4, 40, 1, 'USD', 1), ('tx-4d', 1, 20, 4, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-50); // testuser owes 50 to Other
      expect(json.Third.USD).toBe(30); // Third owes 30 to testuser
      expect(json.Fourth.USD).toBe(20); // Fourth owes 20 to testuser (40 - 20 = 20)
    });

    it('should handle multi-currency balances', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Multi-currency scenario:
      // User 1 owes 50 USD to user 2, user 2 owes 30 EUR to user 1
      // User 3 owes 100 GBP to user 1
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-5a', 1, 50, 2, 'USD', 1), ('tx-5b', 2, 30, 1, 'EUR', 1), ('tx-5c', 3, 100, 1, 'GBP', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-50); // testuser owes 50 USD to Other
      expect(json.Other.EUR).toBe(30); // Other owes 30 EUR to testuser
      expect(json.Third.GBP).toBe(100); // Third owes 100 GBP to testuser
    });

    it('should return empty object when no balances exist', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // No transaction_users entries

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json).toEqual({});
    });

    it('should ignore self-owed amounts', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Add some self-owed amounts (should be ignored) and real balances
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-6a', 1, 100, 1, 'USD', 1), ('tx-6b', 2, 50, 2, 'USD', 1), ('tx-6c', 1, 40, 2, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-40); // Only the real debt should be counted
    });

    it('should handle complex multiple transactions between same users', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Multiple transactions between users:
      // Transaction 1: User 1 owes 60 to user 2, user 2 owes 10 to user 1
      // Transaction 2: User 1 owes 30 to user 2, user 2 owes 20 to user 1
      // Transaction 3: User 3 owes 50 to user 1
      // Net result: User 1 owes 60 to user 2, user 3 owes 50 to user 1
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-7a', 1, 60, 2, 'USD', 1), ('tx-7b', 2, 10, 1, 'USD', 1), ('tx-7c', 1, 30, 2, 'USD', 1), ('tx-7d', 2, 20, 1, 'USD', 1), ('tx-7e', 3, 50, 1, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-60); // testuser owes 60 to Other (90 - 30 = 60)
      expect(json.Third.USD).toBe(50); // Third owes 50 to testuser
    });

    it('should handle balances for different session users', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env, 'other-session', 'otheruser'); // Session for user 2 (Other)

      // User 1 owes 50 to user 2, user 2 owes 30 to user 3
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-8a', 1, 50, 2, 'USD', 1), ('tx-8b', 2, 30, 3, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer other-session',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Test.USD).toBe(50); // Test (user 1) owes 50 to Other (user 2)
      expect(json.Third.USD).toBe(-30); // Other (user 2) owes 30 to Third (user 3)
    });

    it('should handle 3-user scenario where one user owes multiple others', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // User 1 (testuser) owes 100 to user 2 (Other) and 75 to user 3 (Third)
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-9a', 1, 100, 2, 'USD', 1), ('tx-9b', 1, 75, 3, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-100); // testuser owes 100 to Other
      expect(json.Third.USD).toBe(-75); // testuser owes 75 to Third
    });

    it('should handle 3-user scenario where multiple users owe one user', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // User 2 (Other) owes 60 to user 1 (testuser) and user 3 (Third) owes 40 to user 1 (testuser)
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-10a', 2, 60, 1, 'USD', 1), ('tx-10b', 3, 40, 1, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(60); // Other owes 60 to testuser
      expect(json.Third.USD).toBe(40); // Third owes 40 to testuser
    });

    it('should handle 3-user chain debt scenario', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Chain: User 1 owes 50 to user 2, user 2 owes 30 to user 3, user 3 owes 20 to user 1
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-11a', 1, 50, 2, 'USD', 1), ('tx-11b', 2, 30, 3, 'USD', 1), ('tx-11c', 3, 20, 1, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-50); // testuser owes 50 to Other
      expect(json.Third.USD).toBe(20); // Third owes 20 to testuser
    });

    it('should handle 4-user scenario where one user owes all others', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // User 1 (testuser) owes money to all other users
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-12a', 1, 25, 2, 'USD', 1), ('tx-12b', 1, 35, 3, 'USD', 1), ('tx-12c', 1, 45, 4, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-25); // testuser owes 25 to Other
      expect(json.Third.USD).toBe(-35); // testuser owes 35 to Third
      expect(json.Fourth.USD).toBe(-45); // testuser owes 45 to Fourth
    });

    it('should handle 4-user scenario where all others owe one user', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // All other users owe money to user 1 (testuser)
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-13a', 2, 80, 1, 'USD', 1), ('tx-13b', 3, 65, 1, 'USD', 1), ('tx-13c', 4, 55, 1, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(80); // Other owes 80 to testuser
      expect(json.Third.USD).toBe(65); // Third owes 65 to testuser
      expect(json.Fourth.USD).toBe(55); // Fourth owes 55 to testuser
    });

    it('should handle 4-user scenario with two pairs of debt', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Two pairs: User 1 owes user 2, user 3 owes user 4
      // But we're user 1, so we only see our relationship with user 2
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-14a', 1, 90, 2, 'USD', 1), ('tx-14b', 3, 70, 4, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-90); // testuser owes 90 to Other
      expect(json.Third).toBeUndefined(); // Third doesn't have debt with testuser
      expect(json.Fourth).toBeUndefined(); // Fourth doesn't have debt with testuser
    });

    it('should handle 3-user multi-currency complex scenario', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Complex multi-currency with 3 users:
      // User 1 owes 100 USD to user 2, user 2 owes 50 EUR to user 1
      // User 3 owes 200 GBP to user 1, user 1 owes 75 EUR to user 3
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-15a', 1, 100, 2, 'USD', 1), ('tx-15b', 2, 50, 1, 'EUR', 1), ('tx-15c', 3, 200, 1, 'GBP', 1), ('tx-15d', 1, 75, 3, 'EUR', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-100); // testuser owes 100 USD to Other
      expect(json.Other.EUR).toBe(50); // Other owes 50 EUR to testuser
      expect(json.Third.GBP).toBe(200); // Third owes 200 GBP to testuser
      expect(json.Third.EUR).toBe(-75); // testuser owes 75 EUR to Third
    });

    it('should handle 4-user web of debt scenario', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Complex web: Multiple interconnected debts
      // User 1 owes 40 to user 2, user 2 owes 30 to user 1 (net: user 1 owes 10 to user 2)
      // User 3 owes 60 to user 1, user 1 owes 20 to user 3 (net: user 3 owes 40 to user 1)
      // User 4 owes 80 to user 1, user 1 owes 35 to user 4 (net: user 4 owes 45 to user 1)
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-16a', 1, 40, 2, 'USD', 1), ('tx-16b', 2, 30, 1, 'USD', 1), ('tx-16c', 3, 60, 1, 'USD', 1), ('tx-16d', 1, 20, 3, 'USD', 1), ('tx-16e', 4, 80, 1, 'USD', 1), ('tx-16f', 1, 35, 4, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-10); // testuser owes 10 to Other (40 - 30)
      expect(json.Third.USD).toBe(40); // Third owes 40 to testuser (60 - 20)
      expect(json.Fourth.USD).toBe(45); // Fourth owes 45 to testuser (80 - 35)
    });

    it('should handle 3-user scenario with one user having no debt', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Only debt between user 1 and user 2, user 3 has no debt with user 1
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('tx-17a', 1, 85, 2, 'USD', 1), ('tx-17b', 3, 50, 2, 'USD', 1)");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/balances', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.Other.USD).toBe(-85); // testuser owes 85 to Other
      expect(json.Third).toBeUndefined(); // Third has no debt with testuser
    });
  });

  describe('handleBudget', () => {
    it('should create a budget entry successfully', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/budget', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100,
          description: 'Groceries',
          pin: '1234',
          name: 'house',
          groupid: 1,
          currency: 'USD'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.message).toBe('200');
    });

    it('should return 401 if not authorized for budget', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/budget', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 100,
          description: 'Groceries',
          pin: '1234',
          name: 'unauthorized_budget',
          groupid: 1,
          currency: 'USD'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });
  });

  describe('handleBudgetDelete', () => {
    it('should delete a budget entry successfully', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create a budget entry to delete with correct schema
      await env.DB.exec("INSERT INTO budget (id, description, price, added_time, amount, name, groupid, currency) VALUES (1, 'Test entry', '+100.00', '2024-01-01 00:00:00', 100, 'house', 1, 'USD')");

      const request = new Request('http://example.com/.netlify/functions/budget_delete', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: 1,
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json.message).toBe('200');
    });
  });

  describe('handleBudgetList', () => {
    it('should return a list of budget entries', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create budget entries with correct schema
      await env.DB.exec("INSERT INTO budget (id, description, price, added_time, amount, name, groupid, currency) VALUES (1, 'Groceries', '+100.00', '2024-01-01 00:00:00', 100, 'house', 1, 'USD')");

      const request = new Request('http://example.com/.netlify/functions/budget_list', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'house',
          offset: 0,
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as UserBalancesByUser;
      expect(json[0].description).toBe('Groceries');
    });
  });

  describe('handleBudgetMonthly', () => {
    it('should return monthly budget totals with average calculations', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create budget entries with negative amounts for monthly totals (different months)
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('July expense', '-500.00', '2024-07-15 00:00:00', -500, 'house', 1, 'USD')");
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('August expense', '-600.00', '2024-08-15 00:00:00', -600, 'house', 1, 'USD')");
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('September expense', '-400.00', '2024-09-15 00:00:00', -400, 'house', 1, 'USD')");

      // Populate materialized table for monthly queries
      await env.DB.exec("INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', 2024, 7, -500, '2024-07-15 00:00:00')");
      await env.DB.exec("INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', 2024, 8, -600, '2024-08-15 00:00:00')");
      await env.DB.exec("INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', 2024, 9, -400, '2024-09-15 00:00:00')");

      const request = new Request('http://example.com/.netlify/functions/budget_monthly', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'house'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestBudgetMonthlyResponse;

      // Check that the response has the new structure
      expect(json).toHaveProperty('monthlyBudgets');
      expect(json).toHaveProperty('averageMonthlySpend');
      expect(json).toHaveProperty('periodAnalyzed');

      // Check monthly budgets structure
      expect(Array.isArray(json.monthlyBudgets)).toBe(true);
      // Should include all months from today back to oldest data date
      // The function generates from current month back to oldest month with actual data (July 2024)
      const today = new Date();
      const currentDate = new Date(today.getFullYear(), today.getMonth()); // Start of current month
      const oldestDataDate = new Date(2024, 6); // July 2024 (months are 0-indexed)

      // Calculate months between start and end dates
      let monthCount = 0;
      const tempDate = new Date(currentDate);
      while (tempDate >= oldestDataDate) {
        monthCount++;
        tempDate.setMonth(tempDate.getMonth() - 1);
      }

      expect(json.monthlyBudgets.length).toBe(monthCount);

      // Check that the months with data show correct amounts
      const julyBudget = json.monthlyBudgets.find((b: TestMonthlyBudgetItem) => b.month === 'July' && b.year === 2024);
      const augustBudget = json.monthlyBudgets.find((b: TestMonthlyBudgetItem) => b.month === 'August' && b.year === 2024);
      const septemberBudget = json.monthlyBudgets.find((b: TestMonthlyBudgetItem) => b.month === 'September' && b.year === 2024);

      expect(julyBudget).toBeTruthy();
      expect((julyBudget as TestMonthlyBudgetItem).amounts[0].amount).toBe(-500);
      expect(augustBudget).toBeTruthy();
      expect((augustBudget as TestMonthlyBudgetItem).amounts[0].amount).toBe(-600);
      expect(septemberBudget).toBeTruthy();
      expect((septemberBudget as TestMonthlyBudgetItem).amounts[0].amount).toBe(-400);

      // Check rolling average monthly spend calculations
      expect(Array.isArray(json.averageMonthlySpend)).toBe(true);

      // Since we have 3 months of data (July, August, September 2024), we should get 3 periods
      // The number of periods depends on the current date when the test runs, so let's check more flexibly
      expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

      // Check 1-month average (should exist)
      const oneMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 1);
      expect(oneMonthAverage).toBeTruthy();
      expect((oneMonthAverage as TestAverageSpendItem).averages.length).toBe(1);
      expect((oneMonthAverage as TestAverageSpendItem).averages[0].currency).toBe('USD');

      // Check 2-month average (should exist)
      const twoMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 2);
      expect(twoMonthAverage).toBeTruthy();
      expect((twoMonthAverage as TestAverageSpendItem).averages.length).toBe(1);
      expect((twoMonthAverage as TestAverageSpendItem).averages[0].currency).toBe('USD');

      // Check 3-month average (should exist)
      const threeMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 3);
      expect(threeMonthAverage).toBeTruthy();
      expect((threeMonthAverage as TestAverageSpendItem).averages.length).toBe(1);
      expect((threeMonthAverage as TestAverageSpendItem).averages[0].currency).toBe('USD');

      // Check period analyzed
      expect(json.periodAnalyzed).toHaveProperty('startDate');
      expect(json.periodAnalyzed).toHaveProperty('endDate');
    });

    it('should handle empty budget data and return default averages', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // No budget entries

      const request = new Request('http://example.com/.netlify/functions/budget_monthly', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'house'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestBudgetMonthlyResponse;

      // Check that the response has the new structure
      expect(json).toHaveProperty('monthlyBudgets');
      expect(json).toHaveProperty('averageMonthlySpend');
      expect(json).toHaveProperty('periodAnalyzed');

      // Check monthly budgets structure (should still show all months, just with 0 amounts)
      expect(Array.isArray(json.monthlyBudgets)).toBe(true);
      // Should include all months from today back to 2 years ago, even with no data
      // The function generates from current month back to oldest month (2 years ago)
      const today = new Date();
      const currentDate = new Date(today.getFullYear(), today.getMonth()); // Start of current month
      const oldestData = new Date();
      oldestData.setFullYear(oldestData.getFullYear() - 2);
      const endDate = new Date(oldestData.getFullYear(), oldestData.getMonth()); // Start of oldest month

      // Calculate months between start and end dates
      let monthCount = 0;
      const tempDate = new Date(currentDate);
      while (tempDate >= endDate) {
        monthCount++;
        tempDate.setMonth(tempDate.getMonth() - 1);
      }

      expect(json.monthlyBudgets.length).toBe(monthCount);

      // All months should have 0 amounts since no budget data exists
      json.monthlyBudgets.forEach((budget: TestMonthlyBudgetItem) => {
        expect(budget.amounts[0].amount).toBe(0);
        expect(budget.amounts[0].currency).toBe('USD');
      });

      // Check average data - should have multiple periods even with no spending data
      expect(Array.isArray(json.averageMonthlySpend)).toBe(true);
      expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

      // Check the first period (1-month average)
      const oneMonthPeriod = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 1);
      expect(oneMonthPeriod).toBeTruthy();
      expect((oneMonthPeriod as TestAverageSpendItem).averages.length).toBe(1);
      expect((oneMonthPeriod as TestAverageSpendItem).averages[0].currency).toBe('USD');
      expect((oneMonthPeriod as TestAverageSpendItem).averages[0].totalSpend).toBe(0);
      expect((oneMonthPeriod as TestAverageSpendItem).averages[0].averageMonthlySpend).toBe(0);
      expect((oneMonthPeriod as TestAverageSpendItem).averages[0].monthsAnalyzed).toBe(1);
    });

    it('should calculate rolling averages correctly for different time periods', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create budget entries across 6 recent months that would be within rolling window
      const currentDate = new Date();
      const getRecentDate = (monthsBack: number) => {
        const date = new Date(currentDate);
        date.setMonth(date.getMonth() - monthsBack);
        return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
      };

      await env.DB.exec(`INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Month 1 expense', '-1000.00', '${getRecentDate(5)}', -1000, 'house', 1, 'USD')`);
      await env.DB.exec(`INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Month 2 expense', '-1200.00', '${getRecentDate(4)}', -1200, 'house', 1, 'USD')`);
      await env.DB.exec(`INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Month 3 expense', '-800.00', '${getRecentDate(3)}', -800, 'house', 1, 'USD')`);
      await env.DB.exec(`INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Month 4 expense', '-1100.00', '${getRecentDate(2)}', -1100, 'house', 1, 'USD')`);
      await env.DB.exec(`INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Month 5 expense', '-900.00', '${getRecentDate(1)}', -900, 'house', 1, 'USD')`);
      await env.DB.exec(`INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Month 6 expense', '-1300.00', '${getRecentDate(0)}', -1300, 'house', 1, 'USD')`);

      // Populate materialized table for monthly queries
      const getMonthYear = (monthsBack: number) => {
        const date = new Date(currentDate);
        date.setMonth(date.getMonth() - monthsBack);
        return { year: date.getFullYear(), month: date.getMonth() + 1 };
      };

      const month1 = getMonthYear(5);
      const month2 = getMonthYear(4);
      const month3 = getMonthYear(3);
      const month4 = getMonthYear(2);
      const month5 = getMonthYear(1);
      const month6 = getMonthYear(0);

      await env.DB.exec(`INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', ${month1.year}, ${month1.month}, -1000, '${getRecentDate(5)}')`);
      await env.DB.exec(`INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', ${month2.year}, ${month2.month}, -1200, '${getRecentDate(4)}')`);
      await env.DB.exec(`INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', ${month3.year}, ${month3.month}, -800, '${getRecentDate(3)}')`);
      await env.DB.exec(`INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', ${month4.year}, ${month4.month}, -1100, '${getRecentDate(2)}')`);
      await env.DB.exec(`INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', ${month5.year}, ${month5.month}, -900, '${getRecentDate(1)}')`);
      await env.DB.exec(`INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at) VALUES (1, 'house', 'USD', ${month6.year}, ${month6.month}, -1300, '${getRecentDate(0)}')`);

      const request = new Request('http://example.com/.netlify/functions/budget_monthly', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'house'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestBudgetMonthlyResponse;

      // Check that we have rolling averages for different periods
      // Since we have 6 months of recent data, we should get periods based on current date
      expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

      // Find and check 1-month average
      const oneMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 1);
      expect(oneMonthAverage).toBeTruthy();
      expect((oneMonthAverage as TestAverageSpendItem).averages[0].currency).toBe('USD');

      // Find and check 2-month average
      const twoMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 2);
      expect(twoMonthAverage).toBeTruthy();
      expect((twoMonthAverage as TestAverageSpendItem).averages[0].currency).toBe('USD');

      // Find and check 3-month average
      const threeMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 3);
      expect(threeMonthAverage).toBeTruthy();
      expect((threeMonthAverage as TestAverageSpendItem).averages[0].currency).toBe('USD');

      // Find and check 6-month average (should include months within the 6-month window)
      const sixMonthAverage = json.averageMonthlySpend.find((avg: TestAverageSpendItem) => avg.periodMonths === 6);
      if (sixMonthAverage) {
        expect(sixMonthAverage.averages[0].currency).toBe('USD');
        expect(sixMonthAverage.averages[0].totalSpend).toBeGreaterThan(0);
        expect(sixMonthAverage.averages[0].monthsAnalyzed).toBeGreaterThan(0);
        expect(sixMonthAverage.averages[0].averageMonthlySpend).toBe(
          sixMonthAverage.averages[0].totalSpend / sixMonthAverage.averages[0].monthsAnalyzed
        );
      }
    });
  });

  describe('handleBudgetTotal', () => {
    it('should return budget totals', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      // Create budget entries with correct schema
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Entry 1', '+500.00', '2024-01-01 00:00:00', 500, 'house', 1, 'USD')");
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Entry 2', '+1000.00', '2024-02-01 00:00:00', 1000, 'house', 1, 'USD')");

      // Populate materialized tables for optimized queries
      await populateMaterializedTables(env);

      const request = new Request('http://example.com/.netlify/functions/budget_total', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'house',
          pin: '1234'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as TestBudgetTotalResponse[];
      expect(json[0].amount).toBe(1500);
    });
  });
});
