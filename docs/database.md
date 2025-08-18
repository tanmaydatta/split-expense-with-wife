# Database Documentation

## Overview

The application uses **Cloudflare D1** (SQLite) as its database with **Drizzle ORM** for type-safe database operations and migrations.

## Database Architecture

### Environment Setup

- **Local Development**: Local SQLite database via D1 local mode
- **Development**: `splitexpense-dev` D1 database  
- **Production**: `splitexpense` D1 database

### Schema Management

The database schema is defined using Drizzle ORM in `cf-worker/src/db/schema/`:
- `schema.ts` - Main application tables
- `auth-schema.ts` - Authentication tables (better-auth)

## Core Database Schema

### Authentication Tables (Better-Auth)

#### `user` Table
```sql
CREATE TABLE user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    username TEXT UNIQUE,
    display_username TEXT,
    groupid TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL
);
```

#### `session` Table  
```sql
CREATE TABLE session (
    id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
```

#### `account` Table
```sql
CREATE TABLE account (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
```

### Application Tables

#### `groups` Table
```sql
CREATE TABLE groups (
    groupid TEXT PRIMARY KEY,
    group_name VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    userids VARCHAR(1000),        -- JSON array of user IDs
    budgets VARCHAR(1000),        -- LEGACY: JSON array of budget categories (migrated to group_budgets table)
    metadata TEXT                 -- JSON object with group settings
);
```

**Metadata Structure:**
```typescript
{
    defaultShare: Record<string, number>,  // Default split percentages
    defaultCurrency: string                // Default currency for group
}
```

#### `group_budgets` Table (New - Migration 0010)
```sql
CREATE TABLE group_budgets (
    id TEXT PRIMARY KEY,                   -- Unique budget ID (e.g., "budget_abc123")
    group_id TEXT NOT NULL,               -- Reference to groups.groupid
    budget_name TEXT NOT NULL,            -- User-friendly budget name
    description TEXT,                     -- Optional budget description
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted TEXT,                         -- Soft delete timestamp
    FOREIGN KEY (group_id) REFERENCES groups(groupid)
);

-- Indexes for performance
CREATE INDEX group_budgets_group_id_idx ON group_budgets (group_id);
CREATE UNIQUE INDEX group_budgets_group_name_active_idx 
ON group_budgets (group_id, budget_name) WHERE deleted IS NULL;
```

**Migration Notes:**
- **Added in Migration 0010**: New normalized budget storage
- **Replaces**: JSON array storage in `groups.budgets` column
- **Benefits**: Unique budget IDs, foreign key integrity, expandable metadata
- **Status**: Migration completed - all code uses new normalized table

#### `transactions` Table
```sql
CREATE TABLE transactions (
    transaction_id VARCHAR(100) PRIMARY KEY,  -- Format: tx_<ulid>
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata TEXT,                         -- JSON transaction metadata
    currency VARCHAR(10) NOT NULL,
    group_id TEXT NOT NULL,
    deleted DATETIME DEFAULT NULL
);
```

**Metadata Structure:**
```typescript
{
    paidByShares: Record<string, number>,   // Who paid what amounts
    owedAmounts: Record<string, number>,    // Who owes what amounts  
    owedToAmounts: Record<string, number>   // Who is owed what amounts
}
```

#### `transaction_users` Table
```sql
CREATE TABLE transaction_users (
    transaction_id VARCHAR(100) NOT NULL,
    user_id TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,         -- Amount this user owes/is owed
    owed_to_user_id TEXT NOT NULL,         -- Who this amount is owed to
    group_id TEXT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    deleted DATETIME DEFAULT NULL,
    PRIMARY KEY (transaction_id, user_id, owed_to_user_id)
);
```

#### `budget_entries` Table
```sql
CREATE TABLE budget_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_entry_id VARCHAR(100),          -- For deterministic creation in scheduled actions
    description VARCHAR(100) NOT NULL,
    added_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    price VARCHAR(100),                    -- Formatted display price
    amount REAL NOT NULL,                  -- Actual numeric amount
    name VARCHAR(100) NOT NULL,            -- Budget category name
    deleted DATETIME DEFAULT NULL,
    groupid TEXT NOT NULL,
    currency VARCHAR(10) DEFAULT 'GBP' NOT NULL
);
```

#### `scheduled_actions` Table
```sql
CREATE TABLE scheduled_actions (
    id TEXT PRIMARY KEY,                   -- ULID
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,             -- 'add_expense' | 'add_budget'
    frequency TEXT NOT NULL,               -- 'daily' | 'weekly' | 'monthly'
    start_date TEXT NOT NULL,              -- ISO date string
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    action_data TEXT NOT NULL,             -- JSON action configuration
    last_executed_at TEXT,                 -- ISO datetime string
    next_execution_date TEXT NOT NULL,     -- ISO date string
    FOREIGN KEY (user_id) REFERENCES user(id)
);
```

#### `scheduled_action_history` Table
```sql
CREATE TABLE scheduled_action_history (
    id TEXT PRIMARY KEY,
    scheduled_action_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    executed_at TEXT NOT NULL,             -- ISO datetime string
    execution_status TEXT NOT NULL,        -- 'started' | 'success' | 'failed'
    workflow_instance_id TEXT,             -- Cloudflare Workflow tracking
    workflow_status TEXT,                  -- Workflow execution status
    action_data TEXT NOT NULL,             -- JSON snapshot of action config
    result_data TEXT,                      -- JSON execution results
    error_message TEXT,                    -- Error details if failed
    execution_duration_ms INTEGER,         -- Performance tracking
    FOREIGN KEY (scheduled_action_id) REFERENCES scheduled_actions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id)
);
```

### Materialized Views (Performance Optimization)

#### `user_balances` Table
Pre-calculated balance between users to avoid expensive real-time calculations.

```sql
CREATE TABLE user_balances (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    owed_to_user_id TEXT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, user_id, owed_to_user_id, currency)
);
```

#### `budget_totals` Table
Pre-calculated budget category totals.

```sql
CREATE TABLE budget_totals (
    group_id TEXT NOT NULL,
    name VARCHAR(100) NOT NULL,            -- Budget category
    currency VARCHAR(10) NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (group_id, name, currency)
);
```

## Database Indexing Strategy

### Performance Indexes

#### Transaction Queries
```sql
-- Efficient transaction listing by group
CREATE INDEX transactions_group_id_deleted_created_at_idx 
ON transactions (group_id, deleted, created_at);

-- Transaction detail lookups
CREATE INDEX transactions_created_at_idx ON transactions (created_at);
CREATE INDEX transactions_group_id_idx ON transactions (group_id);
```

#### Balance Calculations
```sql
-- User balance queries
CREATE INDEX transaction_users_balances_idx 
ON transaction_users (group_id, deleted, user_id, owed_to_user_id, currency);

-- Group-wide balance queries
CREATE INDEX transaction_users_group_id_deleted_idx 
ON transaction_users (group_id, deleted);
```

#### Budget Analysis
```sql
-- Monthly budget queries
CREATE INDEX budget_entries_monthly_query_idx 
ON budget_entries (name, groupid, deleted, added_time);

-- Budget total calculations
CREATE INDEX budget_entries_name_groupid_deleted_idx 
ON budget_entries (name, groupid, deleted);

-- Budget entry lookups
CREATE INDEX budget_entries_budget_entry_id_idx 
ON budget_entries (budget_entry_id);
```

#### Scheduled Actions
```sql
-- Pending action queries
CREATE INDEX scheduled_actions_user_next_execution_idx 
ON scheduled_actions (user_id, next_execution_date);

-- Active action filtering
CREATE INDEX scheduled_actions_user_active_idx 
ON scheduled_actions (user_id, is_active);

-- Execution history
CREATE INDEX scheduled_action_history_user_executed_idx 
ON scheduled_action_history (user_id, executed_at);
```

## Migration Management

### Migration Workflow

1. **Schema Changes**: Modify `cf-worker/src/db/schema/schema.ts`
2. **Generate Migration**: `yarn db:generate --name descriptive-name`
3. **Review Generated SQL**: Check `cf-worker/src/db/migrations/`
4. **Test Locally**: `yarn db:migrate:local`
5. **Deploy to Dev**: `yarn db:migrate:dev`
6. **Deploy to Prod**: `yarn db:migrate:prod`

### Migration Files Structure

```
cf-worker/src/db/migrations/
├── 0000_rich_psylocke.sql
├── 0001_volatile_darwin.sql
├── 0002_unique_bastion.sql
├── ...
├── 0009_rename-budget-id-to-budget-entry-id.sql
├── 0010_eager_scorpion.sql                      -- NEW: Budget migration to group_budgets table
└── meta/
    ├── 0000_snapshot.json
    ├── 0001_snapshot.json
    ├── ...
    ├── 0010_snapshot.json                       -- NEW: Schema snapshot
    └── _journal.json
```

### Migration Best Practices

- **Incremental Changes**: Small, focused migrations
- **Backwards Compatibility**: Avoid breaking existing data
- **Test First**: Always test on local and dev before production
- **Descriptive Names**: Use clear migration names with `--name` flag
- **Review Generated SQL**: Check auto-generated migration files

### Major Migration: Budget Storage Normalization (Migration 0010)

#### Overview
Migration 0010 (`0010_eager_scorpion.sql`) represents a significant architectural change in how budget categories are stored and managed.

#### Changes Made
1. **New Table**: `group_budgets` table with proper normalization
2. **Data Migration**: Automatic migration of existing budget data from JSON to normalized table
3. **Backward Compatibility**: Fallback logic for systems without the new table
4. **API Compatibility**: Maintained existing API response format during transition

#### Migration Process
```sql
-- 1. Create new normalized table
CREATE TABLE group_budgets (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    budget_name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
    updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
    deleted TEXT,
    FOREIGN KEY (group_id) REFERENCES groups(groupid)
);

-- 2. Create performance indexes
CREATE INDEX group_budgets_group_id_idx ON group_budgets (group_id);
CREATE INDEX group_budgets_group_name_active_idx ON group_budgets (group_id,budget_name) 
WHERE "group_budgets"."deleted" is null;

-- 3. Migrate existing data using D1's JSON functions
INSERT INTO group_budgets (id, group_id, budget_name, created_at, updated_at) 
SELECT 'budget_' || lower(hex(randomblob(8))) as id, 
       groups.groupid, 
       json_each.value as budget_name, 
       CURRENT_TIMESTAMP, 
       CURRENT_TIMESTAMP 
FROM groups, json_each(groups.budgets) 
WHERE groups.budgets IS NOT NULL 
  AND groups.budgets != '' 
  AND groups.budgets != '[]' 
  AND json_valid(groups.budgets);
```

#### Code Changes
- **Backend**: Updated `utils.ts`, `handlers/group.ts`, `types.ts`, and `scheduled-actions.ts`
- **Database Setup**: Updated test utilities to include new table creation
- **Type Safety**: New `GroupBudgetData` interface for better type checking
- **Testing**: Full test suite updated to use new normalized table structure

#### Benefits
- **Unique IDs**: Each budget now has a unique identifier for safe operations
- **Referential Integrity**: Foreign key constraints prevent orphaned data
- **Extensibility**: Room for future budget metadata (descriptions, colors, etc.)
- **Performance**: Better query performance and indexing capabilities
- **Data Integrity**: Proper normalization eliminates duplicate budget names

#### Rollback Strategy
The migration includes a rollback strategy that can regenerate the JSON column if needed:
```sql
-- Rollback: Regenerate groups.budgets from group_budgets table
UPDATE groups 
SET budgets = (
    SELECT json_group_array(budget_name)
    FROM group_budgets 
    WHERE group_id = groups.groupid AND deleted IS NULL
);
```

### Common Migration Patterns

#### Adding New Column
```typescript
// 1. Add to schema
export const budgetEntries = sqliteTable("budget_entries", {
    // existing columns...
    newColumn: text("new_column"),
});

// 2. Generate migration
// yarn db:generate --name add-new-column

// 3. Generated SQL:
// ALTER TABLE budget_entries ADD COLUMN new_column TEXT;
```

#### Renaming Column
```typescript
// 1. Update schema with new name
budgetEntryId: text("budget_entry_id", { length: 100 }),

// 2. Generate migration  
// yarn db:generate --name rename-column

// 3. Generated SQL:
// ALTER TABLE budget_entries RENAME COLUMN budget_id TO budget_entry_id;
```

#### Adding Index
```typescript
// 1. Add to table definition
index("new_index_name").on(table.column1, table.column2),

// 2. Generate migration
// yarn db:generate --name add-index-name

// 3. Generated SQL:
// CREATE INDEX new_index_name ON table_name (column1, column2);
```

## Database Operations

### Connection Management

```typescript
// Database connection is managed by Drizzle + D1
import { getDb } from "../db";

// Usage in handlers
export async function handleSomeAction(request: Request, env: Env) {
    const db = getDb(env);
    
    // Perform database operations
    const result = await db.select().from(users);
    
    return new Response(JSON.stringify(result));
}
```

### Transaction Management

```typescript
// Use Drizzle batch for atomic operations
await db.batch([
    db.insert(transactions).values(transactionData),
    db.insert(transactionUsers).values(splitData),
    db.update(userBalances).set({ balance: newBalance })
]);
```

### Query Patterns

#### Complex Joins
```typescript
// Join with user data for transaction details
const transactionDetails = await db
    .select({
        transactionId: transactions.transactionId,
        description: transactions.description,
        firstName: user.firstName,
        amount: transactionUsers.amount,
    })
    .from(transactions)
    .innerJoin(transactionUsers, eq(transactions.transactionId, transactionUsers.transactionId))
    .innerJoin(user, eq(transactionUsers.userId, user.id))
    .where(eq(transactions.groupId, groupId));
```

#### Aggregation Queries
```typescript
// Calculate budget totals
const totals = await db
    .select({
        currency: budgetEntries.currency,
        total: sql<number>`SUM(amount)`.as("total"),
    })
    .from(budgetEntries)
    .where(
        and(
            eq(budgetEntries.groupid, groupId),
            eq(budgetEntries.name, budgetName),
            isNull(budgetEntries.deleted)
        )
    )
    .groupBy(budgetEntries.currency);
```

## Data Integrity

### Constraints

- **Primary Keys**: All tables have appropriate primary keys
- **Foreign Keys**: Referential integrity between related tables
- **Unique Constraints**: Email uniqueness, session tokens
- **Check Constraints**: Data validation at database level

### Soft Deletion

Tables use soft deletion with `deleted` timestamp columns:
- **Advantages**: Data recovery, audit trails, referential integrity
- **Query Pattern**: Always filter `WHERE deleted IS NULL`
- **Cleanup**: Periodic cleanup jobs for old deleted records

### Data Validation

- **Type Safety**: Drizzle ORM ensures type safety
- **Runtime Validation**: Zod schemas for API inputs
- **Database Constraints**: SQL constraints for data integrity

## Performance Considerations

### Query Optimization

- **Indexes**: Strategic indexing on query patterns
- **Materialized Views**: Pre-calculated aggregations
- **Pagination**: Efficient pagination with offset/limit
- **Connection Pooling**: D1 handles connection management

### Monitoring

- **Query Performance**: Monitor slow queries via Cloudflare Analytics
- **Database Size**: Track D1 storage usage
- **Index Usage**: Monitor index effectiveness

### Scaling Strategies

- **Read Replicas**: D1 provides automatic read scaling
- **Caching**: Application-level caching for frequent queries
- **Archival**: Move old data to separate tables
- **Sharding**: Group-based natural sharding