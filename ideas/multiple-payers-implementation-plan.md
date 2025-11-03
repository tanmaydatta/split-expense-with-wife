# Multiple Payers Implementation Plan

## Executive Summary
Enable multiple people to pay for a single transaction with different amounts each. Backend already supports this - focus is on frontend UI and backward compatibility.

## Phase 1: Type System Updates ✅ COMPLETED
- ✅ Updated `shared-types/index.ts` with `PayerEntry` type
- ✅ Updated `GroupMetadata` to include optional `defaultPaidByShare: Record<string, number>`
- ✅ Updated `DashboardUser` to include optional `amount` field
- ✅ Updated `AddExpenseActionData` to support both:
  - Old format: `paidByUserId?: string` (existing prod actions)
  - New format: `paidByShares?: Record<string, number>`
- ✅ Added validation schemas:
  - `PayerSchema` for dashboard form payers
  - `UpdateGroupMetadataRequestSchema` includes `defaultPaidByShare` validation
  - `AddExpenseActionSchema` validates both formats and ensures paid amounts sum to total
  - `DashboardFormSchema` updated to use `payers` array instead of single `paidBy`
- ✅ Built and regenerated dist files

## Phase 2: Backend Validation & Backward Compatibility ✅ COMPLETED
- ✅ Added `normalizePaidByShares()` function in `cf-worker/src/utils/scheduled-action-execution.ts:327-340`
  - Detects old format (paidByUserId) vs new format (paidByShares)
  - Converts old format to new format automatically
  - Throws error if neither format provided
- ✅ Updated `createSplitTransactionStatements()` to use normalized format
- ✅ Zero breaking changes for existing scheduled actions

## Phase 3: Settings - Default Paid-By Split (NEXT)
**New Feature**: Add default paid-by percentages to group settings

### Files to Update:
1. **Settings UI** - `src/pages/Settings/index.tsx`
   - Add new section "Default Paid-By Split"
   - Mirror existing "Default Split %" UI
   - Allow users to set percentage each person pays by default
   - Validation: Must sum to 100%
   - Save to `defaultPaidByShare` in GroupMetadata

2. **Backend Handler** - `cf-worker/src/handlers/group.ts`
   - Already handles metadata updates
   - Verify `defaultPaidByShare` is persisted correctly
   - Schema validation already added in Phase 1

3. **Session Enrichment** - `cf-worker/src/utils.ts`
   - Already loads group metadata
   - `defaultPaidByShare` will be available automatically

## Phase 4: Frontend UI - Payer Selection
**New Component**: `src/pages/Dashboard/PayerSelection.tsx`

### Component Design:
```typescript
interface PayerSelectionProps {
  users: DashboardUser[];
  totalAmount: number;
  payers: PayerEntry[];
  onPayersChange: (payers: PayerEntry[]) => void;
  disabled: boolean;
}
```

### Features:
- Display all users with amount input fields
- Pre-fill from `defaultPaidByShare` percentages
- Auto-calculate amounts based on percentages * total
- Real-time validation feedback:
  - Show "Total Paid: $X / Total: $Y"
  - Color code: Green (match), Yellow (mismatch), Red (error)
- Allow manual override of calculated amounts
- No maximum limit on payers

### Update Existing Files:
1. **`src/pages/Dashboard/FormFields.tsx`**
   - Remove `PaidByField` component (lines 154-188)
   - Add new `PayerSelectionField` component using `PayerSelection`

2. **`src/pages/Dashboard/formHandlers.ts`**
   - Update `handleExpenseSubmit()` to build `paidByShares` from payers array:
   ```typescript
   const paidByShares = payers.reduce((acc, payer) => {
     acc[payer.userId] = payer.amount;
     return acc;
   }, {} as Record<string, number>);
   ```

3. **`src/pages/Dashboard/index.tsx`**
   - Initialize form state with empty `payers: []`
   - Load default payers from `defaultPaidByShare` on mount
   - Pass total amount to PayerSelection component

## Phase 5: Scheduled Actions Update
1. **`src/components/ScheduledActionsManager/FormFields.tsx`**
   - Replace single paidBy dropdown with PayerSelection component
   - Reuse component from Dashboard

2. **`src/components/ScheduledActionsManager/formHandlers.ts`**
   - Transform payers array to `paidByShares` format
   - Use new format when creating scheduled actions

3. **`cf-worker/src/handlers/scheduled-actions.ts`**
   - Already accepts both formats (validated in schema)
   - Store in new format preferentially
   - Execution uses normalization function (Phase 2)

## Phase 6: Display Updates
1. **`src/pages/Transactions/index.tsx`**
   - Already displays multiple payers correctly (lines 191-202)
   - Verify formatting handles many payers elegantly

2. **`src/components/TransactionCard/index.tsx`**
   - Update mobile view
   - Add condensed format: "Alice ($60), Bob ($40)"

3. **`src/pages/ScheduledActions/HistoryRunDetails.tsx`**
   - Show multiple payers in action history
   - Format for readability

## Phase 7: Testing
### Backend Tests (Mostly Complete ✓)
- ✓ `cf-worker/src/tests/split.test.ts:444-923` - Multi-payer tests exist
- **Add**: Backward compatibility tests for scheduled actions
  - Old format executes correctly
  - New format executes correctly
  - normalizePaidByShares() function tests

### Frontend Unit Tests (New)
- **`src/pages/Dashboard/PayerSelection.test.tsx`**
  - Renders all users
  - Loads default split percentages
  - Calculates amounts correctly
  - Validates sum equals total
  - Shows errors for invalid states
  - Handles user interactions

- **`src/pages/Dashboard/formHandlers.test.ts`**
  - Transforms payers to paidByShares correctly
  - Handles single payer
  - Handles multiple payers
  - Validates totals

### E2E Tests (New)
- **`src/e2e/tests/expense-management.spec.ts`**
  - Create expense with single payer
  - Create expense with multiple payers
  - Verify default splits applied
  - Override default amounts
  - Validation errors display correctly

- **`src/e2e/tests/scheduled-actions.spec.ts`**
  - Create action with multiple payers
  - Execute old format actions (compatibility)
  - Execute new format actions

## Phase 8: Documentation
1. **`docs/api.md`**
   - Update `/split_new` endpoint
   - Document backward compatibility
   - Add examples with multiple payers

2. **`CLAUDE.md`**
   - Document new payer selection architecture
   - Note backward compatibility strategy

3. **`docs/migration-changelog.md`**
   - Document changes
   - Emphasize zero-downtime migration

## Phase 9: UI/UX Polish
- Visual feedback (progress bars, color coding)
- Accessibility (ARIA labels, keyboard nav)
- Mobile optimization
- Smooth animations

## Phase 10: Final Testing & Deployment
1. Run all tests (backend, frontend, E2E)
2. Deploy backend first (handles both formats)
3. Test with existing prod scheduled actions
4. Deploy frontend
5. Monitor logs

## Timeline: 42-54 hours (5-7 days)

## Key Implementation Notes

### User Feedback Incorporated:
1. ✅ Default paid-by split in settings (like owed amount split)
2. ✅ No limit on number of payers
3. ✅ No saved payer groups
4. ✅ Scheduled actions support multiple payers
5. ✅ No data migration - code supports both formats
6. ✅ **Critical**: Preserve existing prod scheduled actions with `paidByUserId`

### Backward Compatibility Strategy:
- `normalizePaidByShares()` detects and converts formats
- Existing scheduled actions work without modification
- New actions use new format
- Zero user action required
- Zero downtime

### Files Modified So Far:
- ✅ `shared-types/index.ts` - Types and schemas
- ✅ `cf-worker/src/utils/scheduled-action-execution.ts` - Normalization

### Files To Modify Next:
- `src/pages/Settings/index.tsx` - Add default paid-by split UI
- `src/pages/Dashboard/PayerSelection.tsx` - New component
- `src/pages/Dashboard/FormFields.tsx` - Replace PaidByField
- `src/pages/Dashboard/formHandlers.ts` - Update submission logic
- `src/pages/Dashboard/index.tsx` - Update form state
- `src/components/ScheduledActionsManager/*` - Multiple payer support
- Tests (backend, frontend, E2E)

## Success Criteria
1. Users can select multiple payers for expenses
2. Each payer specifies different amounts
3. Amounts must sum to total
4. Default paid-by split in settings works
5. Existing single-payer functionality works
6. Existing scheduled actions continue working
7. All tests pass
8. Mobile-friendly UI
9. Accessible (keyboard, screen readers)
10. Documentation complete
