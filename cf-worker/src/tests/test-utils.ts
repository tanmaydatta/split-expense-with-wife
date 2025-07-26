import { Env } from '../types';
import { getDb } from '../db';
import { users, groups, sessions, transactions, transactionUsers, budget, userBalances, budgetTotals } from '../db/schema';
import { sql } from 'drizzle-orm';

// Database setup and management utilities for tests

export function createMockRequest(method: string, body?: object, token?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't include body for GET or HEAD requests
  const requestInit: RequestInit = {
    method,
    headers
  };

  if (body && method !== 'GET' && method !== 'HEAD') {
    requestInit.body = JSON.stringify(body);
  }

  return new Request('https://example.com/test', requestInit);
}

// Legacy function for backward compatibility with tests
export function createTestRequest(
  endpoint: string,
  method: string = 'POST',
  body?: unknown,
  token?: string,
  isNetlifyFunction: boolean = true
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = isNetlifyFunction
    ? `https://example.com/.netlify/functions/${endpoint}`
    : `https://example.com/api/${endpoint}`;

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

// Helper function to setup the database schema
export async function setupDatabase(env: Env): Promise<void> {
  // Create tables in correct order (respecting foreign key dependencies)
  await env.DB.exec("CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(100) NOT NULL, added_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, price VARCHAR(100), amount REAL NOT NULL, name VARCHAR(100) NOT NULL, deleted DATETIME DEFAULT NULL, groupid INTEGER NOT NULL DEFAULT 1, currency VARCHAR(10) DEFAULT 'GBP' NOT NULL)");
  await env.DB.exec('CREATE TABLE IF NOT EXISTS groups (groupid INTEGER PRIMARY KEY AUTOINCREMENT, group_name VARCHAR(50) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, userids VARCHAR(1000), budgets VARCHAR(1000), metadata TEXT)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS sessions (username VARCHAR(255) NOT NULL, sessionid VARCHAR(255) NOT NULL, expiry_time DATETIME NOT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS transaction_users (transaction_id VARCHAR(100) NOT NULL, user_id INTEGER NOT NULL, amount DECIMAL(10,2) NOT NULL, owed_to_user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, currency VARCHAR(10) NOT NULL, deleted DATETIME DEFAULT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(255) NOT NULL, amount DECIMAL(10,2) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, metadata TEXT, currency VARCHAR(10) NOT NULL, transaction_id VARCHAR(100), group_id INTEGER NOT NULL, deleted DATETIME DEFAULT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(50) NOT NULL, password VARCHAR(255) NOT NULL, first_name VARCHAR(50), last_name VARCHAR(50), groupid INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)');

  // Create materialized views for performance
  await env.DB.exec('CREATE TABLE IF NOT EXISTS user_balances (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, owed_to_user_id INTEGER NOT NULL, currency VARCHAR(10) NOT NULL, balance REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, user_id, owed_to_user_id, currency))');

  // Create budget totals table
  await env.DB.exec('CREATE TABLE IF NOT EXISTS budget_totals (group_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, currency VARCHAR(10) NOT NULL, total_amount REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, name, currency))');

  // Create indexes for performance
  await env.DB.exec('CREATE INDEX IF NOT EXISTS user_balances_group_user_idx ON user_balances (group_id, user_id, currency)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS transaction_users_balances_idx ON transaction_users (group_id, deleted, user_id, owed_to_user_id, currency)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS budget_totals_group_name_idx ON budget_totals (group_id, name)');
}

// Clean up database for tests
export async function cleanupDatabase(env: Env): Promise<void> {
  const db = getDb(env);
  await db.delete(transactionUsers);
  await db.delete(transactions);
  await db.delete(budget);
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(groups);
  await db.delete(userBalances);
  await db.delete(budgetTotals);
}

// Setup and clean database for testing - convenience function
export async function setupAndCleanDatabase(env: Env): Promise<void> {
  await setupDatabase(env);
  await cleanupDatabase(env);
}

// Create test user and group data
export async function createTestUserData(env: Env): Promise<void> {
  const db = getDb(env);

  await db.insert(groups).values({
    groupid: 1,
    groupName: 'Test Group',
    userids: '[1, 2, 3, 4]',
    budgets: '["house", "food"]',
    metadata: '{"defaultShare": {"1": 25, "2": 25, "3": 25, "4": 25}, "defaultCurrency": "USD"}'
  });

  await db.insert(users).values([
    {
      id: 1,
      username: 'testuser',
      password: 'testpass',
      firstName: 'Test',
      groupid: 1
    },
    {
      id: 2,
      username: 'testuser2',
      password: 'testpass2',
      firstName: 'Other',
      groupid: 1
    },
    {
      id: 3,
      username: 'testuser3',
      password: 'testpass3',
      firstName: 'Third',
      groupid: 1
    },
    {
      id: 4,
      username: 'testuser4',
      password: 'testpass4',
      firstName: 'Fourth',
      groupid: 1
    }
  ]);
}

// Create a test session
export async function createTestSession(env: Env, sessionId: string = 'test-session-id', username: string = 'testuser'): Promise<string> {
  const db = getDb(env);

  const expiryTime = new Date();
  expiryTime.setDate(expiryTime.getDate() + 1); // 1 day from now

  await db.insert(sessions).values({
    username,
    sessionid: sessionId,
    expiryTime: expiryTime.toISOString().replace('T', ' ').slice(0, 19)
  });

  return sessionId;
}

// Populate materialized tables for balance calculation
export async function populateMaterializedTables(env: Env): Promise<void> {
  const db = getDb(env);

  // Clear existing data
  await db.delete(userBalances);
  await db.delete(budgetTotals);

  // Rebuild user balances from transaction data
  await db.run(sql`
    INSERT INTO user_balances (group_id, user_id, owed_to_user_id, currency, balance, updated_at)
    SELECT
      group_id,
      user_id,
      owed_to_user_id,
      currency,
      SUM(amount) as balance,
      datetime('now') as updated_at
    FROM transaction_users
    WHERE deleted IS NULL
    GROUP BY group_id, user_id, owed_to_user_id, currency
    HAVING SUM(amount) != 0
  `);

  // Rebuild budget totals
  await db.run(sql`
    INSERT INTO budget_totals (group_id, name, currency, total_amount, updated_at)
    SELECT
      groupid as group_id,
      name,
      currency,
      SUM(amount) as total_amount,
      datetime('now') as updated_at
    FROM budget
    WHERE deleted IS NULL
    GROUP BY groupid, name, currency
  `);
}
