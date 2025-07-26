import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../index';
import { setupAndCleanDatabase, createTestUserData, createTestSession, createTestRequest } from './test-utils';
import { getDb } from '../db';
import { groups, users, transactions, transactionUsers } from '../db/schema';
import { eq } from 'drizzle-orm';
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
  metadata: string;
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

      // Check that transaction details were created with correct amounts using net settlement
      // User 1: paid $80, owes $72 (60% of $120) → net +$8 (creditor)
      // User 2: paid $40, owes $48 (40% of $120) → net -$8 (debtor)
      // Expected: User 2 owes User 1 $8
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results).toHaveLength(1);

      const debt = userTransactions.results[0] as TransactionUserDbResult;
      expect(debt.amount).toBeCloseTo(8, 2); // User 2's debt to User 1
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

      // Check transaction users were created using net settlement
      // User 1: paid £60, owes £36 (40% of £90) → net +£24 (creditor)
      // User 2: paid £30, owes £54 (60% of £90) → net -£24 (debtor)
      // Expected: User 2 owes User 1 £24
      const userTransactions = await env.DB.prepare('SELECT * FROM transaction_users WHERE transaction_id = ?').bind(json.transactionId).all();
      expect(userTransactions.results).toHaveLength(1);

      const debt = userTransactions.results[0] as TransactionUserDbResult;
      expect(debt.currency).toBe('GBP');
      expect(debt.group_id).toBe(1);
      expect(debt.amount).toBeCloseTo(24, 2); // User 2's debt to User 1
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

    it('should handle multiple payers with multiple people splitting', async () => {
      // Set up test data for 3-person group using the DB helper
      const db = getDb(env);

      await db.insert(groups).values({
        groupid: 2,
        groupName: 'Multi-person Group',
        userids: '[3, 4, 5]',
        metadata: '{"defaultCurrency": "EUR", "defaultShare": {"3": 40, "4": 30, "5": 30}}'
      });

      await db.insert(users).values([
        {
          id: 3,
          username: 'alice.wilson',
          password: 'hash3',
          firstName: 'Alice',
          lastName: 'Wilson',
          groupid: 2
        },
        {
          id: 4,
          username: 'bob.johnson',
          password: 'hash4',
          firstName: 'Bob',
          lastName: 'Johnson',
          groupid: 2
        },
        {
          id: 5,
          username: 'charlie.brown',
          password: 'hash5',
          firstName: 'Charlie',
          lastName: 'Brown',
          groupid: 2
        }
      ]);

      const sessionId = await createTestSession(env, 'session_alice_multi', 'alice.wilson');

      // Test multi-payer scenario:
      // Alice pays €80, Bob pays €70 (total €150)
      // Split: Alice 40% (€60), Bob 35% (€52.50), Charlie 25% (€37.50)
      const request = createTestRequest('split_new', 'POST', {
        amount: 150,
        description: 'Multi-payer group expense',
        currency: 'EUR',
        paidByShares: { 3: 80, 4: 70 }, // Alice pays €80, Bob pays €70
        splitPctShares: { 3: 40, 4: 35, 5: 25 } // Alice 40%, Bob 35%, Charlie 25%
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;
      expect(json.transactionId).toBeDefined();
      expect(json.message).toBe('Transaction created successfully');

      // Verify transaction was created with correct metadata
      const transactionResult = await db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionId, json.transactionId))
        .get();

      expect(transactionResult).toBeDefined();
      if (!transactionResult) {
        throw new Error('Transaction result should be defined');
      }
      expect(transactionResult.description).toBe('Multi-payer group expense');
      expect(transactionResult.amount).toBe(150);
      expect(transactionResult.currency).toBe('EUR');

      // Verify metadata contains correct paidByShares with first names
      const metadata = transactionResult.metadata || { paidByShares: {}, owedAmounts: {}, owedToAmounts: {} };

      expect(metadata.paidByShares).toEqual({
        'Alice': 80,
        'Bob': 70
      });

      // Verify metadata contains correct values
      expect(metadata.paidByShares).toEqual({
        'Alice': 80,
        'Bob': 70
      });

      // Verify owedAmounts (each person's total share of the expense)
      expect(metadata.owedAmounts).toEqual({
        'Alice': 60,      // 40% of €150
        'Bob': 52.5,      // 35% of €150
        'Charlie': 37.5   // 25% of €150
      });

      // Verify owedToAmounts (net amounts owed to each person)
      expect(metadata.owedToAmounts).toEqual({
        'Alice': 20,      // Alice paid €80, owes €60, so she's owed €20
        'Bob': 17.5       // Bob paid €70, owes €52.50, so he's owed €17.50
        // Charlie not included since he owes money (paid €0, owes €37.50)
      });

      // Verify transaction_users records contain the correct debt relationships
      const userRecords = await db
        .select({
          user_id: transactionUsers.userId,
          amount: transactionUsers.amount,
          owed_to_user_id: transactionUsers.owedToUserId
        })
        .from(transactionUsers)
        .where(eq(transactionUsers.transactionId, json.transactionId))
        .orderBy(transactionUsers.userId, transactionUsers.owedToUserId);

      // Using net settlement logic, only debtors owe to creditors:
      // Alice: paid €80, owes €60 → net +€20 (creditor, doesn't owe anyone)
      // Bob: paid €70, owes €52.50 → net +€17.50 (creditor, doesn't owe anyone)
      // Charlie: paid €0, owes €37.50 → net -€37.50 (debtor, owes €37.50 total)
      //
      // Charlie's €37.50 debt is distributed proportionally to creditors:
      // - To Alice: €37.50 × (€20/€37.50) = €20
      // - To Bob: €37.50 × (€17.50/€37.50) = €17.50

      expect(userRecords).toHaveLength(2);

      const expectedRelationships = [
        { user_id: 5, owed_to_user_id: 3, amount: 20 },     // Charlie owes Alice €20
        { user_id: 5, owed_to_user_id: 4, amount: 17.5 }   // Charlie owes Bob €17.50
      ];

      for (const expected of expectedRelationships) {
        const actual = userRecords.find(r =>
          r.user_id === expected.user_id && r.owed_to_user_id === expected.owed_to_user_id
        );
        expect(actual).toBeDefined();
        if (!actual) {
          throw new Error('Actual record should be defined');
        }
        expect(actual.amount).toBeCloseTo(expected.amount, 2);
      }

      // Verify total debt amounts equal Charlie's total debt (€37.50)
      const totalTransactionAmounts = userRecords.reduce((sum, r) => sum + r.amount, 0);
      expect(totalTransactionAmounts).toBeCloseTo(37.5, 2);
    });

    it('should handle user who pays but still owes money in multi-person group', async () => {
      // Set up test data for 3-person group using the DB helper
      const db = getDb(env);

      await db.insert(groups).values({
        groupid: 3,
        groupName: 'Mixed Payment Group',
        userids: '[6, 7, 8]',
        metadata: '{"defaultCurrency": "EUR", "defaultShare": {"6": 50, "7": 30, "8": 20}}'
      });

      await db.insert(users).values([
        {
          id: 6,
          username: 'alice.mixed',
          password: 'hash6',
          firstName: 'Alice',
          lastName: 'Mixed',
          groupid: 3
        },
        {
          id: 7,
          username: 'bob.mixed',
          password: 'hash7',
          firstName: 'Bob',
          lastName: 'Mixed',
          groupid: 3
        },
        {
          id: 8,
          username: 'charlie.mixed',
          password: 'hash8',
          firstName: 'Charlie',
          lastName: 'Mixed',
          groupid: 3
        }
      ]);

      const sessionId = await createTestSession(env, 'session_alice_mixed', 'alice.mixed');

      // Test scenario where Alice pays but still owes money:
      // Total: €120, Split: Alice 50% (€60), Bob 30% (€36), Charlie 20% (€24)
      // Payments: Alice pays €40, Bob pays €80, Charlie pays €0
      // Net positions: Alice -€20 (debtor), Bob +€44 (creditor), Charlie -€24 (debtor)
      const request = createTestRequest('split_new', 'POST', {
        amount: 120,
        description: 'Mixed payment scenario',
        currency: 'EUR',
        paidByShares: { 6: 40, 7: 80 }, // Alice pays €40, Bob pays €80, Charlie pays €0
        splitPctShares: { 6: 50, 7: 30, 8: 20 } // Alice 50%, Bob 30%, Charlie 20%
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;
      expect(json.transactionId).toBeDefined();
      expect(json.message).toBe('Transaction created successfully');

      // Verify transaction was created with correct metadata
      const transactionResult = await db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionId, json.transactionId))
        .get();

      expect(transactionResult).toBeDefined();
      if (!transactionResult) {
        throw new Error('Transaction result should be defined');
      }
      expect(transactionResult.description).toBe('Mixed payment scenario');
      expect(transactionResult.amount).toBe(120);
      expect(transactionResult.currency).toBe('EUR');

      // Verify metadata contains correct values
      const metadata = transactionResult.metadata || { paidByShares: {}, owedAmounts: {}, owedToAmounts: {} };

      expect(metadata.paidByShares).toEqual({
        'Alice': 40,
        'Bob': 80
      });

      // Verify owedAmounts (each person's total share of the expense)
      expect(metadata.owedAmounts).toEqual({
        'Alice': 60,    // 50% of €120
        'Bob': 36,      // 30% of €120
        'Charlie': 24   // 20% of €120
      });

      // Verify owedToAmounts (only Bob is owed money since he's the only net creditor)
      expect(metadata.owedToAmounts).toEqual({
        'Bob': 44       // Bob paid €80, owes €36, so he's owed €44
        // Alice and Charlie not included since they have net debt
      });

      // Verify transaction_users records contain the correct debt relationships
      const userRecords = await db
        .select({
          user_id: transactionUsers.userId,
          amount: transactionUsers.amount,
          owed_to_user_id: transactionUsers.owedToUserId
        })
        .from(transactionUsers)
        .where(eq(transactionUsers.transactionId, json.transactionId))
        .orderBy(transactionUsers.userId, transactionUsers.owedToUserId);

      // Expected debt relationships using net settlement:
      // Alice: paid €40, owes €60 → net -€20 (debtor, owes €20)
      // Bob: paid €80, owes €36 → net +€44 (creditor, owed €44)
      // Charlie: paid €0, owes €24 → net -€24 (debtor, owes €24)
      //
      // Both Alice and Charlie owe to Bob:
      // - Alice owes Bob €20
      // - Charlie owes Bob €24

      expect(userRecords).toHaveLength(2);

      const expectedRelationships = [
        { user_id: 6, owed_to_user_id: 7, amount: 20 },   // Alice owes Bob €20
        { user_id: 8, owed_to_user_id: 7, amount: 24 }   // Charlie owes Bob €24
      ];

      for (const expected of expectedRelationships) {
        const actual = userRecords.find(r =>
          r.user_id === expected.user_id && r.owed_to_user_id === expected.owed_to_user_id
        );
        expect(actual).toBeDefined();
        if (!actual) {
          throw new Error('Actual record should be defined');
        }
        expect(actual.amount).toBeCloseTo(expected.amount, 2);
      }

      // Verify total debt amounts equal Bob's credit (€44)
      const totalTransactionAmounts = userRecords.reduce((sum, r) => sum + r.amount, 0);
      expect(totalTransactionAmounts).toBeCloseTo(44, 2);

      console.log('✅ Mixed payment scenario test completed successfully');
    });

    it('should handle 2 debtors owing to 2 different creditors with everyone paying', async () => {
      // Set up test data for 4-person group using the DB helper
      const db = getDb(env);

      await db.insert(groups).values({
        groupid: 4,
        groupName: 'Four Person Group',
        userids: '[9, 10, 11, 12]',
        metadata: '{"defaultCurrency": "USD", "defaultShare": {"9": 40, "10": 20, "11": 25, "12": 15}}'
      });

      await db.insert(users).values([
        {
          id: 9,
          username: 'alice.four',
          password: 'hash9',
          firstName: 'Alice',
          lastName: 'Four',
          groupid: 4
        },
        {
          id: 10,
          username: 'bob.four',
          password: 'hash10',
          firstName: 'Bob',
          lastName: 'Four',
          groupid: 4
        },
        {
          id: 11,
          username: 'charlie.four',
          password: 'hash11',
          firstName: 'Charlie',
          lastName: 'Four',
          groupid: 4
        },
        {
          id: 12,
          username: 'david.four',
          password: 'hash12',
          firstName: 'David',
          lastName: 'Four',
          groupid: 4
        }
      ]);

      const sessionId = await createTestSession(env, 'session_alice_four', 'alice.four');

      // Test scenario with 4 people where 2 owe to 2 different creditors:
      // Total: $200, Split: Alice 40% ($80), Bob 20% ($40), Charlie 25% ($50), David 15% ($30)
      // Payments: Alice pays $60, Bob pays $70, Charlie pays $30, David pays $40
      // Net positions: Alice -$20, Bob +$30, Charlie -$20, David +$10
      // Debt distribution proportional to creditor amounts:
      // - Bob gets 75% (30/40) of each debt, David gets 25% (10/40)
      const request = createTestRequest('split_new', 'POST', {
        amount: 200,
        description: 'Four person expense scenario',
        currency: 'USD',
        paidByShares: { 9: 60, 10: 70, 11: 30, 12: 40 }, // Everyone pays something
        splitPctShares: { 9: 40, 10: 20, 11: 25, 12: 15 } // Split percentages
      }, sessionId);

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as SplitCreateResponse;
      expect(json.transactionId).toBeDefined();
      expect(json.message).toBe('Transaction created successfully');

      // Verify transaction was created with correct metadata
      const transactionResult = await db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionId, json.transactionId))
        .get();

      expect(transactionResult).toBeDefined();
      if (!transactionResult) {
        throw new Error('Transaction result should be defined');
      }
      expect(transactionResult.description).toBe('Four person expense scenario');
      expect(transactionResult.amount).toBe(200);
      expect(transactionResult.currency).toBe('USD');

      // Verify metadata contains correct values
      const metadata = transactionResult.metadata || { paidByShares: {}, owedAmounts: {}, owedToAmounts: {} };

      expect(metadata.paidByShares).toEqual({
        'Alice': 60,
        'Bob': 70,
        'Charlie': 30,
        'David': 40
      });

      // Verify owedAmounts (each person's total share of the expense)
      expect(metadata.owedAmounts).toEqual({
        'Alice': 80,    // 40% of $200
        'Bob': 40,      // 20% of $200
        'Charlie': 50,  // 25% of $200
        'David': 30     // 15% of $200
      });

      // Verify owedToAmounts (only net creditors are included)
      expect(metadata.owedToAmounts).toEqual({
        'Bob': 30,      // Bob paid $70, owes $40, so he's owed $30
        'David': 10     // David paid $40, owes $30, so he's owed $10
        // Alice and Charlie not included since they have net debt
      });

      // Verify transaction_users records contain the correct debt relationships
      const userRecords = await db
        .select({
          user_id: transactionUsers.userId,
          amount: transactionUsers.amount,
          owed_to_user_id: transactionUsers.owedToUserId
        })
        .from(transactionUsers)
        .where(eq(transactionUsers.transactionId, json.transactionId))
        .orderBy(transactionUsers.userId, transactionUsers.owedToUserId);

      // Expected debt relationships using net settlement:
      // Alice: paid $60, owes $80 → net -$20 (debtor)
      // Bob: paid $70, owes $40 → net +$30 (creditor)
      // Charlie: paid $30, owes $50 → net -$20 (debtor)
      // David: paid $40, owes $30 → net +$10 (creditor)
      //
      // Total creditor amount: $30 + $10 = $40
      // Bob gets 75% (30/40) of debts, David gets 25% (10/40) of debts
      //
      // Alice's $20 debt: $15 to Bob, $5 to David
      // Charlie's $20 debt: $15 to Bob, $5 to David

      expect(userRecords).toHaveLength(4);

      const expectedRelationships = [
        { user_id: 9, owed_to_user_id: 10, amount: 15 },   // Alice owes Bob $15
        { user_id: 9, owed_to_user_id: 12, amount: 5 },    // Alice owes David $5
        { user_id: 11, owed_to_user_id: 10, amount: 15 },  // Charlie owes Bob $15
        { user_id: 11, owed_to_user_id: 12, amount: 5 }   // Charlie owes David $5
      ];

      for (const expected of expectedRelationships) {
        const actual = userRecords.find(r =>
          r.user_id === expected.user_id && r.owed_to_user_id === expected.owed_to_user_id
        );
        expect(actual).toBeDefined();
        if (!actual) {
          throw new Error('Actual record should be defined');
        }
        expect(actual.amount).toBeCloseTo(expected.amount, 2);
      }

      // Verify total debt amounts equal total creditor amount ($40)
      const totalTransactionAmounts = userRecords.reduce((sum, r) => sum + r.amount, 0);
      expect(totalTransactionAmounts).toBeCloseTo(40, 2);

      // Verify amounts owed to each creditor
      const bobTotal = userRecords
        .filter(r => r.owed_to_user_id === 10)
        .reduce((sum, r) => sum + r.amount, 0);
      expect(bobTotal).toBeCloseTo(30, 2); // Bob should receive $30 total

      const davidTotal = userRecords
        .filter(r => r.owed_to_user_id === 12)
        .reduce((sum, r) => sum + r.amount, 0);
      expect(davidTotal).toBeCloseTo(10, 2); // David should receive $10 total

      console.log('✅ Four person debt distribution test completed successfully');
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
