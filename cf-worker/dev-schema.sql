PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description VARCHAR(100) NOT NULL,
    added_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    price VARCHAR(100),
    amount REAL NOT NULL,
    name VARCHAR(100) NOT NULL,
    deleted DATETIME,
    groupid INTEGER DEFAULT 1 NOT NULL,
    currency VARCHAR(10) DEFAULT 'GBP' NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
    groupid INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    userids VARCHAR(1000),
    budgets VARCHAR(1000),
    metadata TEXT -- JSON stored as TEXT in SQLite
);
CREATE TABLE IF NOT EXISTS sessions (
    username VARCHAR(255) NOT NULL,
    sessionid VARCHAR(255) NOT NULL,
    expiry_time DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS transaction_users (
    transaction_id VARCHAR(100) NOT NULL,
    user_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    owed_to_user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    deleted DATETIME,
    PRIMARY KEY (transaction_id, user_id, owed_to_user_id)
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT, -- JSON stored as TEXT in SQLite
    currency VARCHAR(10) NOT NULL,
    transaction_id VARCHAR(100),
    group_id INTEGER NOT NULL,
    deleted DATETIME
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    groupid INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_balances (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    owed_to_user_id INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, user_id, owed_to_user_id, currency)
);
CREATE TABLE IF NOT EXISTS budget_totals (
    group_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, name, currency)
);
CREATE TABLE IF NOT EXISTS budget_monthly (
    group_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, name, currency, year, month)
);
DELETE FROM sqlite_sequence;
CREATE INDEX IF NOT EXISTS budget_added_time_idx ON budget(added_time);
CREATE INDEX IF NOT EXISTS budget_name_added_time_idx ON budget(name, added_time);
CREATE INDEX IF NOT EXISTS budget_amount_idx ON budget(amount);
CREATE INDEX IF NOT EXISTS budget_name_idx ON budget(name);
CREATE INDEX IF NOT EXISTS budget_name_price_idx ON budget(name, price);
CREATE INDEX IF NOT EXISTS transaction_users_group_id_idx ON transaction_users(group_id);
CREATE INDEX IF NOT EXISTS transaction_users_owed_to_user_id_idx ON transaction_users(owed_to_user_id);
CREATE INDEX IF NOT EXISTS transaction_users_user_id_idx ON transaction_users(user_id);
CREATE INDEX IF NOT EXISTS transactions_group_id_idx ON transactions(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_transaction_id_idx ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS sessions_sessionid_idx ON sessions(sessionid);
CREATE INDEX IF NOT EXISTS transactions_group_id_deleted_created_at_idx ON transactions(group_id, deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS budget_name_groupid_deleted_idx ON budget(name, groupid, deleted);
CREATE INDEX IF NOT EXISTS budget_name_groupid_deleted_added_time_amount_idx ON budget(name, groupid, deleted, added_time, amount);
-- Note: Monthly queries now use budget_monthly materialized table for optimal performance

CREATE INDEX IF NOT EXISTS transaction_users_group_id_deleted_idx ON transaction_users(group_id, deleted);
-- Optimized indexes for balance calculations
CREATE INDEX IF NOT EXISTS transaction_users_balances_idx ON transaction_users(group_id, deleted, user_id, owed_to_user_id, currency);
CREATE INDEX IF NOT EXISTS transaction_users_group_user_idx ON transaction_users(group_id, user_id, deleted);
CREATE INDEX IF NOT EXISTS transaction_users_group_owed_idx ON transaction_users(group_id, owed_to_user_id, deleted);
CREATE INDEX IF NOT EXISTS transaction_users_transaction_idx ON transaction_users(transaction_id, deleted);
CREATE INDEX IF NOT EXISTS transaction_users_transaction_group_idx ON transaction_users(transaction_id, group_id, deleted);
-- Indexes for user_balances table
CREATE INDEX IF NOT EXISTS user_balances_group_user_idx ON user_balances(group_id, user_id, currency);
CREATE INDEX IF NOT EXISTS user_balances_group_owed_idx ON user_balances(group_id, owed_to_user_id, currency);
-- Indexes for budget_totals table
CREATE INDEX IF NOT EXISTS budget_totals_group_name_idx ON budget_totals(group_id, name);

-- Complete rebuild of materialized tables for all groups

-- Step 1: Rebuild user_balances
DELETE FROM user_balances;
INSERT INTO user_balances (group_id, user_id, owed_to_user_id, currency, balance, updated_at)
SELECT 
  group_id,
  user_id,
  owed_to_user_id,
  currency,
  sum(amount) as balance,
  datetime('now') as updated_at
FROM transaction_users 
WHERE deleted IS NULL 
GROUP BY group_id, user_id, owed_to_user_id, currency;

-- Step 2: Rebuild budget_totals
DELETE FROM budget_totals;
INSERT INTO budget_totals (group_id, name, currency, total_amount, updated_at)
SELECT 
  groupid as group_id,
  name,
  currency,
  sum(amount) as total_amount,
  datetime('now') as updated_at
FROM budget 
WHERE deleted IS NULL 
GROUP BY groupid, name, currency;

-- Step 3: Rebuild budget_monthly
DELETE FROM budget_monthly;
INSERT INTO budget_monthly (group_id, name, currency, year, month, total_amount, updated_at)
SELECT 
  groupid as group_id,
  name,
  currency,
  CAST(strftime('%Y', added_time) AS INTEGER) as year,
  CAST(strftime('%m', added_time) AS INTEGER) as month,
  sum(amount) as total_amount,
  datetime('now') as updated_at
FROM budget 
WHERE deleted IS NULL 
GROUP BY groupid, name, currency, year, month
HAVING total_amount != 0;

-- Verification queries
SELECT 'user_balances' as table_name, count(*) as row_count FROM user_balances
UNION ALL
SELECT 'budget_totals' as table_name, count(*) as row_count FROM budget_totals
UNION ALL
SELECT 'budget_monthly' as table_name, count(*) as row_count FROM budget_monthly;