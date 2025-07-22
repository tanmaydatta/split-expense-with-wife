import { Env } from '../types';

/**
 * Setup database tables for testing
 * Creates all necessary tables with the exact real schema
 */
export async function setupDatabase(env: Env): Promise<void> {
  // Create tables with the exact real schema
  await env.DB.exec("CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(100) NOT NULL, added_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, price VARCHAR(100), amount REAL NOT NULL, name VARCHAR(100) NOT NULL, deleted DATETIME, groupid INTEGER DEFAULT 1 NOT NULL, currency VARCHAR(10) DEFAULT 'GBP' NOT NULL)");
  await env.DB.exec('CREATE TABLE IF NOT EXISTS groups (groupid INTEGER PRIMARY KEY AUTOINCREMENT, group_name VARCHAR(50) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, userids VARCHAR(1000), budgets VARCHAR(1000), metadata TEXT)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS sessions (username VARCHAR(255) NOT NULL, sessionid VARCHAR(255) NOT NULL, expiry_time DATETIME NOT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS transaction_users (transaction_id VARCHAR(100) NOT NULL, user_id INTEGER NOT NULL, amount DECIMAL(10,2) NOT NULL, owed_to_user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, currency VARCHAR(10) NOT NULL, deleted DATETIME, PRIMARY KEY (transaction_id, user_id, owed_to_user_id))');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(255) NOT NULL, amount DECIMAL(10,2) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, metadata TEXT, currency VARCHAR(10) NOT NULL, transaction_id VARCHAR(100), group_id INTEGER NOT NULL, deleted DATETIME)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(50) NOT NULL, password VARCHAR(255) NOT NULL, first_name VARCHAR(50), last_name VARCHAR(50), groupid INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');

  // Create balances table for optimized balance calculations
  await env.DB.exec('CREATE TABLE IF NOT EXISTS user_balances (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, owed_to_user_id INTEGER NOT NULL, currency VARCHAR(10) NOT NULL, balance REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, user_id, owed_to_user_id, currency))');

  // Create budget totals table for optimized budget aggregations
  await env.DB.exec('CREATE TABLE IF NOT EXISTS budget_totals (group_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, currency VARCHAR(10) NOT NULL, total_amount REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, name, currency))');

  // Create monthly budget aggregations table for optimized monthly reports
  await env.DB.exec('CREATE TABLE IF NOT EXISTS budget_monthly (group_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, currency VARCHAR(10) NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL, total_amount REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, name, currency, year, month))');

  // Create indexes for performance
  await env.DB.exec('CREATE INDEX IF NOT EXISTS user_balances_group_user_idx ON user_balances (group_id, user_id, currency)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS transaction_users_balances_idx ON transaction_users (group_id, deleted, user_id, owed_to_user_id, currency)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS budget_totals_group_name_idx ON budget_totals (group_id, name)');

  // Budget table indexes for optimal query performance
  await env.DB.exec('CREATE INDEX IF NOT EXISTS budget_monthly_query_idx ON budget (groupid, name, deleted, added_time, amount)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS budget_list_query_idx ON budget (groupid, name, deleted, added_time)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS budget_general_idx ON budget (groupid, deleted, added_time)');
}

/**
 * Clean up database tables for testing
 * Removes all data from all tables
 */
export async function cleanupDatabase(env: Env): Promise<void> {
  // Clean up the database - order matters due to foreign key constraints
  await env.DB.exec('DELETE FROM transaction_users');
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM budget');
  await env.DB.exec('DELETE FROM sessions');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM groups');
}

/**
 * Complete database setup for testing
 * Creates tables and cleans up existing data
 */
export async function setupAndCleanDatabase(env: Env): Promise<void> {
  await setupDatabase(env);
  await cleanupDatabase(env);

  // Set up required environment variables for testing
  env.AUTH_PIN = '1234';
  env.SPLITWISE_API_KEY = 'test-key';
  env.SPLITWISE_GROUP_ID = 'test-group';
  env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001';
  env.GROUP_IDS = '1,2';
}

/**
 * Create test user data
 * Helper function to create common test users and groups
 */
export async function createTestUserData(env: Env): Promise<void> {
  // Create a test group with multiple users
  await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (1, 'Test Group', '[\"house\", \"food\"]', '[1, 2, 3, 4]', '{}')");

  // Create test users
  await env.DB.exec("INSERT INTO users (id, username, first_name, groupid, password) VALUES (1, 'testuser', 'Test', 1, 'password123')");
  await env.DB.exec("INSERT INTO users (id, username, first_name, groupid, password) VALUES (2, 'otheruser', 'Other', 1, 'pass456')");
  await env.DB.exec("INSERT INTO users (id, username, first_name, groupid, password) VALUES (3, 'thirduser', 'Third', 1, 'pass789')");
  await env.DB.exec("INSERT INTO users (id, username, first_name, groupid, password) VALUES (4, 'fourthuser', 'Fourth', 1, 'pass101')");
}

/**
 * Create test session data
 * Helper function to create a test session
 */
export async function createTestSession(env: Env, sessionId: string = 'test-session-id', username: string = 'testuser'): Promise<void> {
  await env.DB.exec(`INSERT INTO sessions (sessionid, username, expiry_time) VALUES ('${sessionId}', '${username}', '2099-01-01 00:00:00')`);
}

/**
 * Helper function to populate materialized tables from existing test data
 * This should be called after inserting test data to ensure the optimized tables are populated
 */
export async function populateMaterializedTables(env: Env): Promise<void> {
  // Populate user_balances table from transaction_users
  await env.DB.exec('INSERT OR REPLACE INTO user_balances (group_id, user_id, owed_to_user_id, currency, balance, updated_at) SELECT group_id, user_id, owed_to_user_id, currency, sum(amount) as balance, datetime(\'now\') as updated_at FROM transaction_users WHERE deleted IS NULL GROUP BY group_id, user_id, owed_to_user_id, currency');

  // Populate budget_totals table from budget
  await env.DB.exec('INSERT OR REPLACE INTO budget_totals (group_id, name, currency, total_amount, updated_at) SELECT groupid as group_id, name, currency, sum(amount) as total_amount, datetime(\'now\') as updated_at FROM budget WHERE deleted IS NULL GROUP BY groupid, name, currency');
}
