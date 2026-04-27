# Database Migration Changelog

This document tracks major database migrations and schema changes.

## Migration 0010: Budget Storage Normalization (August 2024)

### Overview
**File**: `0010_eager_scorpion.sql`  
**Type**: Major structural change  
**Status**: Ready for deployment  

### Problem Statement
Budget categories were previously stored as JSON arrays in the `groups.budgets` column:
```json
["Food", "Transport", "Entertainment", "Utilities"]
```

**Issues with this approach:**
- No unique identifiers for individual budgets
- Difficult to rename budgets safely
- No referential integrity
- No room for additional budget metadata
- Poor query performance for budget-related operations

### Solution
Created a new normalized `group_budgets` table with proper foreign key relationships:

```sql
CREATE TABLE group_budgets (
    id TEXT PRIMARY KEY,                -- Unique budget ID
    group_id TEXT NOT NULL,            -- FK to groups.groupid
    budget_name TEXT NOT NULL,         -- Budget category name  
    description TEXT,                  -- Optional description
    created_at TEXT NOT NULL,          -- Creation timestamp
    updated_at TEXT NOT NULL,          -- Last update timestamp
    deleted TEXT,                      -- Soft delete timestamp
    FOREIGN KEY (group_id) REFERENCES groups(groupid)
);
```

### Migration Details

#### Data Migration
Existing budget data is automatically migrated using D1's JSON functions:
```sql
INSERT INTO group_budgets (id, group_id, budget_name, created_at, updated_at)
SELECT 
    'budget_' || lower(hex(randomblob(8))) as id,
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

#### Indexes Created
- `group_budgets_group_id_idx`: Fast lookups by group
- `group_budgets_group_name_active_idx`: Unique constraint on active budget names per group

### Code Changes

#### Backend Files Modified
- **`cf-worker/src/db/schema/schema.ts`**: Added new table definition
- **`cf-worker/src/types.ts`**: New `GroupBudgetData` interface
- **`cf-worker/src/utils.ts`**: Updated session enrichment to use new table
- **`cf-worker/src/handlers/group.ts`**: New budget management functions using normalized table
- **`cf-worker/src/handlers/scheduled-actions.ts`**: Updated to work with new budget structure

#### Implementation Approach
Direct migration to new table structure without fallback mechanisms:
- All code updated to use new normalized table directly
- Test database setup updated to include new table
- All tests modified to verify against new table structure

### Deployment Strategy

#### Phase 1: Migration Ready ✅
- [x] Schema changes implemented
- [x] Migration generated and tested locally
- [x] All backend code updated to use new table
- [x] All tests passing (174/174)
- [x] Documentation updated

#### Phase 2: Development Deployment
- [ ] Run migration in dev environment: `yarn db:migrate:dev`
- [ ] Deploy backend to dev: `yarn deploy:dev`
- [ ] Verify budget functionality in dev environment
- [ ] Test data migration accuracy

#### Phase 3: Production Deployment
- [ ] Run migration in production: `yarn db:migrate:prod` 
- [ ] Deploy backend to production: `yarn deploy:prod`
- [ ] Verify all budget operations working
- [ ] Monitor for any migration issues

#### Phase 4: Legacy Column Cleanup ✅
- [x] Remove legacy `groups.budgets` column with migration 0011
- [x] Remove all fallback code - direct approach implemented
- [x] Fix UI budget display issue by maintaining proper session structure
- [x] All tests passing (174/174) with new structure

### Benefits Achieved

1. **Data Integrity**: Foreign key constraints prevent orphaned budget references
2. **Unique Identifiers**: Each budget has a stable, unique ID for safe operations
3. **Extensibility**: Can now add budget metadata (colors, descriptions, limits, etc.)
4. **Performance**: Better indexing and query performance for budget operations
5. **Referential Safety**: Can safely rename budgets without breaking existing data
6. **Type Safety**: Better TypeScript types for budget operations

### Testing Results

- **Unit Tests**: ✅ 174/174 passed using new normalized table
- **Integration Tests**: ✅ All budget-related workflows functional
- **Migration Tests**: ✅ Local migration successful with data verification
- **Database Migration**: ✅ Local migration verified with data integrity

### Rollback Plan

If needed, the migration can be rolled back by regenerating the JSON column:
```sql
UPDATE groups 
SET budgets = (
    SELECT json_group_array(budget_name)
    FROM group_budgets 
    WHERE group_id = groups.groupid AND deleted IS NULL
);
```

### Future Enhancements Enabled

This migration lays the foundation for future budget-related features:
- Budget descriptions and metadata
- Budget color coding
- Budget spending limits and tracking
- Budget categorization and hierarchies
- Advanced budget reporting and analytics
- Budget templates and sharing between groups

---

## Previous Migrations

### Migration 0009: Rename budget_id to budget_entry_id
- **Type**: Column rename
- **Impact**: Low - simple column rename in budget_entries table

### Migration 0008: Budget to Budget Entries
- **Type**: Table rename
- **Impact**: Medium - renamed budget table to budget_entries

### Migration 0011: Drop Legacy Budget Column
- **Type**: Cleanup migration  
- **Impact**: Low - removes deprecated column after successful normalization
- **Status**: ✅ Complete - all tests passing, UI working correctly

### Migration 0013: Backfill Budget Entry IDs (August 2024)
- **Type**: Data backfill migration  
- **Impact**: Low - adds unique identifiers to existing budget entries
- **Status**: ✅ Complete - tested locally, all 174 tests passing

**Problem**: Many existing `budget_entries` records had NULL `budget_entry_id` values. This field is used for deterministic creation in scheduled actions and needed unique identifiers for proper tracking.

**Solution**: Backfilled all NULL `budget_entry_id` values with unique identifiers using "bge_" prefix:
```sql
UPDATE `budget_entries` SET `budget_entry_id` = 'bge_' || lower(hex(randomblob(8))) || '_' || `id` WHERE `budget_entry_id` IS NULL;
```

**Benefits**:
- Unique identifiers for all budget entries
- Consistent format with "bge_" prefix as requested
- Uses established SQLite randomblob pattern from migration 0010
- Ensures combination of `id` and generated ID is unique

### Migration 0015: Make budget_entry_id Primary Key

**Date**: 2025-08-27
**File**: `0015_perfect_the_watchers.sql`

**Problem**: The `budget_entries` table used an auto-increment integer `id` as primary key, but `budget_entry_id` (string) was the actual identifier used throughout the application for deterministic creation and API operations.

**Solution**: Changed the primary key from `id` to `budget_entry_id`:

```sql
-- Create new table with budget_entry_id as primary key
CREATE TABLE `__new_budget_entries` (
    `budget_entry_id` text(100) PRIMARY KEY NOT NULL,
    -- ... other columns
);

-- Migrate existing data
INSERT INTO `__new_budget_entries` 
SELECT "budget_entry_id", "description", "added_time", "price", "amount", "budget_id", "deleted", "currency" 
FROM `budget_entries`;

-- Replace old table
DROP TABLE `budget_entries`;
ALTER TABLE `__new_budget_entries` RENAME TO `budget_entries`;
```

**Breaking Changes**:
- Budget entry IDs are now strings instead of numbers in all APIs
- `BudgetDeleteRequest.id` changed from `number` to `string`
- `BudgetDisplayEntry.id` changed from `number` to `string` 
- Frontend components updated to handle string IDs

**Benefits**:
- Eliminates dual ID system (integer + string)
- Makes `budget_entry_id` the single source of truth
- Consistent with deterministic ID pattern used in scheduled actions
- Removes need for separate unique index on `budget_entry_id`

### Migration 0017: Fix groupid / group_id INTEGER → TEXT

**Date**: 2026-04
**File**: `0017_fix_groupid_text_types.sql`
**Type**: Schema correction (table recreate)

**Problem**: Migration 0000 declared `groups.groupid`, `user.groupid`, `transaction_users.group_id`, and `user_balances.group_id` as INTEGER, but the application stores ULID strings in those columns. Recent wrangler/D1 versions reject TEXT inserts into INTEGER PK columns with `SQLITE_MISMATCH`, breaking fresh-DB e2e tests. Deployed dbs were created via direct SQL with TEXT columns *or* with INTEGER columns that SQLite type-affinity has been silently storing TEXT in — both flavors have been working in production.

**Solution as written**: DROP+RENAME each affected table after copying rows into a new table with the correct types.

⚠️ **Production incident on 2026-04-27**: Applying this migration on prod (which had INTEGER columns + ULID-string data) cascade-deleted every row in `account` and `session` because `DROP TABLE \`user\`` triggered the `ON DELETE CASCADE` foreign keys those tables declare on `user.id`. `PRAGMA defer_foreign_keys=ON` defers FK *validation*, not `ON DELETE CASCADE` *triggers*. The proper escape (`PRAGMA foreign_keys=OFF`) is **not supported by Cloudflare D1**.

**Recovery**: Restored prod from D1 Time Travel, then marked the migration as applied without running its SQL:

```sh
wrangler d1 execute splitexpense --env prod --remote \
  --command "INSERT INTO d1_migrations (name) VALUES ('0017_fix_groupid_text_types.sql');"
```

Prod now runs with the original INTEGER schema + ULID-string data (same as it has for months — SQLite's permissive type affinity makes it work).

**Standing guidance**:
- **Fresh databases (local, CI)**: this migration applies cleanly because there are no `account` / `session` rows yet. No action needed.
- **Existing dev/prod databases**: do NOT re-run this migration. If `0017` is unapplied on a deployed environment, mark it applied via the same `INSERT INTO d1_migrations` shown above. Verify schema correctness is not needed — INTEGER columns + TEXT data have been working.

**Follow-up**: replace this migration with a child-row-preserving variant before re-enabling for any deployed environment. See the in-file comment block in `0017_fix_groupid_text_types.sql` for the proposed pattern.

### Migration 0018: Add expense_budget_links Junction Table

**Date**: 2026-04
**File**: `0018_sleepy_sauron.sql`
**Type**: New table (no data migration)

**Problem**: The system had no way to express a relationship between an expense transaction and a budget entry created at the same time. Without a link, deleting one side left the other orphaned and UIs could not cross-navigate between the two entities.

**Solution**: Added `expense_budget_links` junction table establishing an M:N relationship between `transactions` and `budget_entries`.

```sql
CREATE TABLE expense_budget_links (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT(100) NOT NULL,
    budget_entry_id TEXT(100) NOT NULL,
    group_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (budget_entry_id) REFERENCES budget_entries(budget_entry_id) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX expense_budget_links_pair_idx ON expense_budget_links (transaction_id, budget_entry_id);
CREATE INDEX expense_budget_links_transaction_idx ON expense_budget_links (transaction_id);
CREATE INDEX expense_budget_links_budget_entry_idx ON expense_budget_links (budget_entry_id);
CREATE INDEX expense_budget_links_group_idx ON expense_budget_links (group_id);
```

**No data migration**: New table only. Existing transactions and budget entries remain unlinked.

**Rollback**: `DROP TABLE expense_budget_links;`

**Code changes accompanying this migration:**
- `cf-worker/src/db/schema/schema.ts`: New `expenseBudgetLinks` table definition
- `cf-worker/src/handlers/dashboard.ts`: Atomic expense + budget + link creation via `/dashboard_submit`
- `cf-worker/src/handlers/get-by-id.ts`: `/transaction_get` and `/budget_entry_get` with linked sibling
- `cf-worker/src/handlers/split.ts`: `/split_delete` now cascade-soft-deletes linked budget entries
- `cf-worker/src/handlers/budget.ts`: `/budget_delete` now cascade-soft-deletes linked transactions; `/budget_list` returns `linkedTransactionIds`; `/transactions_list` returns `linkedBudgetEntryIds`
- `shared-types/index.ts`: New request/response types for the above endpoints

### Earlier Migrations (0000-0007)
- Initial schema setup
- Authentication system setup (better-auth)
- Transaction and user management tables
- Various index optimizations