# Database Optimization: Balances & Budget Totals

## Problem
The original balance and budget total calculations were performing expensive aggregation queries on every request:

**Balance Query:**
```sql
SELECT user_id, owed_to_user_id, currency, sum(amount) as amount 
FROM transaction_users 
WHERE group_id = ? AND deleted IS NULL 
GROUP BY user_id, owed_to_user_id, currency
```

**Budget Total Query:**
```sql
SELECT currency, sum(amount) as amount
FROM budget 
WHERE name = ? AND groupid = ? AND deleted IS NULL
GROUP BY currency
```

These queries scanned **thousands of rows** every time data was requested, causing performance issues and high D1 database costs.

## Solution

### 1. Materialized View Approach

#### User Balances Table
Created a new `user_balances` table that maintains running balances and gets updated when transactions are added/deleted:

```sql
CREATE TABLE user_balances (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    owed_to_user_id INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, user_id, owed_to_user_id, currency)
);
```

#### Budget Totals Table
Created a new `budget_totals` table that maintains running totals and gets updated when budget entries are added/deleted:

```sql
CREATE TABLE budget_totals (
    group_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, name, currency)
);
```

### 2. Optimized Indexes
Added strategic indexes to improve query performance:

```sql
-- For transaction balance queries
CREATE INDEX transaction_users_balances_idx ON transaction_users(group_id, deleted, user_id, owed_to_user_id, currency);
CREATE INDEX transaction_users_group_user_idx ON transaction_users(group_id, user_id, deleted);
CREATE INDEX transaction_users_group_owed_idx ON transaction_users(group_id, owed_to_user_id, deleted);

-- For balance table lookups
CREATE INDEX user_balances_group_user_idx ON user_balances(group_id, user_id, currency);
CREATE INDEX user_balances_group_owed_idx ON user_balances(group_id, owed_to_user_id, currency);

-- For budget totals table lookups
CREATE INDEX budget_totals_group_name_idx ON budget_totals(group_id, name);
```

## Implementation

### Optimized Queries

#### Balance Query
The balance endpoint now uses a simple lookup instead of aggregation:

```sql
SELECT user_id, owed_to_user_id, currency, balance as amount 
FROM user_balances 
WHERE group_id = ? AND balance != 0
```

#### Budget Total Query
The budget total endpoint now uses a simple lookup instead of aggregation:

```sql
SELECT currency, total_amount as amount 
FROM budget_totals 
WHERE group_id = ? AND name = ?
```

**Performance improvement: O(log n) index lookup vs O(n) table scan + aggregation**

### Automatic Maintenance

#### User Balances
The `user_balances` table is automatically maintained when transactions are:

**Added (`handleSplitNew`, `handleSplit`):**
```typescript
const balanceStatements = generateBalanceUpdateStatements(splitAmounts, groupId, 'add');
await executeBatch(env, [...transactionStatements, ...balanceStatements]);
```

**Deleted (`handleSplitDelete`):**
```typescript
const balanceStatements = generateBalanceUpdateStatements(existingAmounts, groupId, 'remove');
await executeBatch(env, [...deleteStatements, ...balanceStatements]);
```

#### Budget Totals
The `budget_totals` table is automatically maintained when budget entries are:

**Added (`handleBudget`):**
```typescript
const budgetTotalStatements = generateBudgetTotalUpdateStatements(groupId, name, currency, amount, 'add');
await executeBatch(env, [budgetStatement, ...budgetTotalStatements]);
```

**Deleted (`handleBudgetDelete`):**
```typescript
const budgetTotalStatements = generateBudgetTotalUpdateStatements(groupId, name, currency, amount, 'remove');
await executeBatch(env, [deleteStatement, ...budgetTotalStatements]);
```

### Utility Functions

#### User Balance Functions
- **`getUserBalances(env, groupId)`**: Fast lookup of current balances from materialized table
- **`generateBalanceUpdateStatements(splitAmounts, groupId, operation)`**: Generates balance update statements for batch execution
- **`rebuildGroupBalances(env, groupId)`**: Rebuilds balances from scratch for data integrity

#### Budget Total Functions
- **`getBudgetTotals(env, groupId, name)`**: Fast lookup of budget totals from materialized table
- **`generateBudgetTotalUpdateStatements(groupId, name, currency, amount, operation)`**: Generates budget total update statements for batch execution

## Migration

### For Existing Databases
Run the migration script:
```bash
wrangler d1 execute YOUR_DATABASE_NAME --file=migrate-to-optimized-balances.sql
```

### For New Databases
The updated `dev-schema.sql` includes all necessary tables and indexes.

## Performance Benefits

1. **Query Performance**: O(log n) vs O(n) - exponentially faster with more data
2. **Database Costs**: Minimal row reads vs thousands of row scans
3. **Scalability**: Performance remains consistent as transaction volume grows
4. **Maintenance**: Automatic balance updates ensure data consistency

## Data Consistency

- Balances are updated atomically with transaction creation/deletion
- UPSERT operations handle concurrent updates safely
- Rebuild utility available for data integrity verification
- Soft deletes maintain transaction history while updating balances correctly

## Testing

The optimization maintains the exact same API and response format - existing frontend code requires no changes. Balance calculations remain accurate while being dramatically faster.

## Monitoring

Consider adding periodic balance reconciliation checks to ensure the materialized view stays in sync with actual transaction data:

```sql
-- Verification query (run periodically)
SELECT 
  m.group_id, m.user_id, m.owed_to_user_id, m.currency,
  m.balance as materialized_balance,
  COALESCE(c.calculated_balance, 0) as calculated_balance,
  (m.balance - COALESCE(c.calculated_balance, 0)) as difference
FROM user_balances m
LEFT JOIN (
  SELECT group_id, user_id, owed_to_user_id, currency, SUM(amount) as calculated_balance
  FROM transaction_users 
  WHERE deleted IS NULL 
  GROUP BY group_id, user_id, owed_to_user_id, currency
) c ON m.group_id = c.group_id 
    AND m.user_id = c.user_id 
    AND m.owed_to_user_id = c.owed_to_user_id 
    AND m.currency = c.currency
WHERE ABS(m.balance - COALESCE(c.calculated_balance, 0)) > 0.01;
``` 