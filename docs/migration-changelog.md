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

### Earlier Migrations (0000-0007)
- Initial schema setup
- Authentication system setup (better-auth)
- Transaction and user management tables
- Various index optimizations