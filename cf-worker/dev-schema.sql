PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE budget (
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
CREATE TABLE groups (
    groupid INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    userids VARCHAR(1000),
    budgets VARCHAR(1000),
    metadata TEXT -- JSON stored as TEXT in SQLite
);
CREATE TABLE sessions (
    username VARCHAR(255) NOT NULL,
    sessionid VARCHAR(255) NOT NULL,
    expiry_time DATETIME NOT NULL
);
CREATE TABLE transaction_users (
    transaction_id VARCHAR(100) NOT NULL,
    user_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    owed_to_user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    deleted DATETIME,
    PRIMARY KEY (transaction_id, user_id, owed_to_user_id)
);
CREATE TABLE transactions (
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
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    groupid INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_balances (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    owed_to_user_id INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, user_id, owed_to_user_id, currency)
);
CREATE TABLE budget_totals (
    group_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, name, currency)
);
DELETE FROM sqlite_sequence;
CREATE INDEX budget_added_time_idx ON budget(added_time);
CREATE INDEX budget_name_added_time_idx ON budget(name, added_time);
CREATE INDEX budget_amount_idx ON budget(amount);
CREATE INDEX budget_name_idx ON budget(name);
CREATE INDEX budget_name_price_idx ON budget(name, price);
CREATE INDEX transaction_users_group_id_idx ON transaction_users(group_id);
CREATE INDEX transaction_users_owed_to_user_id_idx ON transaction_users(owed_to_user_id);
CREATE INDEX transaction_users_user_id_idx ON transaction_users(user_id);
CREATE INDEX transactions_group_id_idx ON transactions(group_id);
CREATE UNIQUE INDEX transactions_transaction_id_idx ON transactions(transaction_id);
CREATE INDEX transactions_created_at_idx ON transactions(created_at);
CREATE INDEX users_username_idx ON users(username);
CREATE INDEX sessions_sessionid_idx ON sessions(sessionid);
CREATE INDEX transactions_group_id_deleted_created_at_idx ON transactions(group_id, deleted, created_at DESC);
CREATE INDEX budget_name_groupid_deleted_idx ON budget(name, groupid, deleted);
CREATE INDEX budget_name_groupid_deleted_added_time_amount_idx ON budget(name, groupid, deleted, added_time, amount);
CREATE INDEX transaction_users_group_id_deleted_idx ON transaction_users(group_id, deleted);
CREATE INDEX transaction_users_balances_idx ON transaction_users(group_id, deleted, user_id, owed_to_user_id, currency);
CREATE INDEX transaction_users_group_user_idx ON transaction_users(group_id, user_id, deleted);
CREATE INDEX transaction_users_group_owed_idx ON transaction_users(group_id, owed_to_user_id, deleted);
CREATE INDEX transaction_users_transaction_idx ON transaction_users(transaction_id, deleted);
CREATE INDEX user_balances_group_user_idx ON user_balances(group_id, user_id, currency);
CREATE INDEX user_balances_group_owed_idx ON user_balances(group_id, owed_to_user_id, currency);
CREATE INDEX budget_totals_group_name_idx ON budget_totals(group_id, name);
CREATE INDEX budget_monthly_query_idx ON budget(name, groupid, deleted, added_time) WHERE amount < 0;
CREATE INDEX transaction_users_transaction_group_idx ON transaction_users(transaction_id, group_id, deleted);
