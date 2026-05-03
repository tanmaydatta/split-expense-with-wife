# Frontend Hooks Reference

All custom React hooks wrapping React Query for server state management. Located in `src/hooks/`.

## Query Client Configuration (`queryClient.ts`)

```typescript
{
  retry: 2,
  staleTime: 5 * 60 * 1000,     // 5 minutes default
  refetchOnWindowFocus: false
}
```

## Hook Reference

### useTransactions (`useTransactions.ts`)

| Hook | Type | Query Key | Stale Time | Notes |
|------|------|-----------|------------|-------|
| `useTransactionsList(offset, q?)` | Query | `["transactions", "list", offset, q]` | 2 min | Paginated, processes raw data to frontend format; each item carries `linkedBudgetEntryIds`. Optional `q` filters by description/amount substring; included in the cache key so different `q` values get distinct cache entries. |
| `useInfiniteTransactionsList(q?)` | Query | `["transactions", "infinite", q]` | 2 min | Manual pagination (not useInfiniteQuery). Optional `q` filters by description/amount substring; included in the cache key so different `q` values get distinct cache entries. |
| `useDeleteTransaction` | Mutation | — | — | See cache invalidation matrix below |

### useTransaction (`useTransaction.ts`)

| Hook | Type | Query Key | Stale Time | Notes |
|------|------|-----------|------------|-------|
| `useTransaction(id)` | Query | `["transaction", id]` | default | Disabled when `id` is falsy; returns `TransactionGetResponse` with optional `linkedBudgetEntry` |

### useBudget (`useBudget.ts`)

| Hook | Type | Query Key | Stale Time | Notes |
|------|------|-----------|------------|-------|
| `useBudgetTotal(budget)` | Query | `["budget", "total", budgetId]` | 2 min | Current balance by currency. Unchanged — not affected by `q`. |
| `useBudgetHistory` | Query | `["budget", "history", budgetId, offset]` | 1 min | Paginated entries; each carries `linkedTransactionIds` |
| `useDeleteBudgetEntry` | Mutation | — | — | See cache invalidation matrix below |
| `useInfiniteBudgetHistory(budgetId, q?)` | Query | `["budget", "history", budgetId, "infinite", q]` | 1 min | Infinite-scroll variant. Optional `q` filters by description/amount substring; included in the cache key so different `q` values get distinct cache entries. |
| `useLoadMoreBudgetHistory(budgetId, q?)` | — | — | — | Manual load-more helper. Passes optional `q` through to `useInfiniteBudgetHistory`; included in the cache key. |

### useBudgetEntry (`useBudgetEntry.ts`)

| Hook | Type | Query Key | Stale Time | Notes |
|------|------|-----------|------------|-------|
| `useBudgetEntry(id)` | Query | `["budgetEntry", id]` | default | Disabled when `id` is falsy; returns `BudgetEntryGetResponse` with optional `linkedTransaction` + `linkedTransactionUsers` |

### useDashboard (`useDashboard.ts`)

| Hook | Type | Query Key | Notes |
|------|------|-----------|-------|
| `useCreateExpense` | Mutation | — | Legacy: calls `/split_new` alone; invalidates `["transactions"]` + `["balances"]` |
| `useUpdateBudget` | Mutation | — | Legacy: calls `/budget` alone; invalidates `["budget"]` |
| `useDashboardSubmit` | Mutation | — | Preferred: single call to `/dashboard_submit`; invalidates `["transactions"]`, `["balances"]`, `["budget"]` |
| `useDashboardState` | — | — | Tracks individual loading states for `useCreateExpense` + `useUpdateBudget` |

### useBalances (`useBalances.ts`)

| Hook | Type | Query Key | Notes |
|------|------|-----------|-------|
| `useBalances` | Query | `["balances"]` | Returns `Map<userName, Map<currency, amount>>` |

### useMonthlyBudget (`useMonthlyBudget.ts`)

| Hook | Type | Query Key | Notes |
|------|------|-----------|-------|
| `useMonthlyBudget` | Query | `["monthlyBudget", budgetId, params]` | Returns processed data with currencies |
| `useMonthlyBudgetCurrencies` | Derived | — | Extracts unique currencies from data |

### useGroupDetails (`useGroupDetails.ts`)

| Hook | Type | Query Key | Notes |
|------|------|-----------|-------|
| `useGroupDetails` | Query | `["groupDetails"]` | Group info, budgets, members |
| `useUpdateGroupMetadata` | Mutation | — | Invalidates `["groupDetails"]` |
| `useRefreshGroupDetails` | — | — | Force refresh bypassing cookie cache |

### useScheduledActions (`useScheduledActions.ts`)

| Hook | Type | Query Key | Notes |
|------|------|-----------|-------|
| `useScheduledActionsList` | Query | `["scheduledActions"]` | Simple list |
| `useInfiniteScheduledActionsList` | Query | `["scheduledActions", "infinite"]` | With pagination |
| `useCreateScheduledAction` | Mutation | — | Invalidates `["scheduledActions"]` |
| `useUpdateScheduledAction` | Mutation | — | Invalidates `["scheduledActions"]` |
| `useDeleteScheduledAction` | Mutation | — | Invalidates `["scheduledActions"]` |
| `useRunScheduledActionNow` | Mutation | — | Invalidates `["scheduledActions"]` + `["scheduledActionHistory"]` |
| `useScheduledActionHistory` | Query | `["scheduledActionHistory", params]` | Filtered history |
| `useScheduledActionDetails` | Query | `["scheduledAction", id]` | Single action |

## Cache Invalidation Map

When data changes, these caches get invalidated:

| Action | Invalidates |
|--------|-------------|
| `useDashboardSubmit` (create expense + budget + link) | `["transactions"]`, `["balances"]`, `["budget"]` |
| Create expense only (`useCreateExpense`) | `["transactions"]`, `["balances"]` |
| Create budget entry only (`useUpdateBudget`) | `["budget"]` |
| `useDeleteTransaction` | `["transactions"]`, `["balances"]`, `["transaction", id]`, `["budget"]`, `["budgetEntry", linkedBeId]` for each linked BE found in the budget history cache |
| `useDeleteBudgetEntry` | `["budget"]`, `["budgetEntry", id]`, `["transactions"]`, `["balances"]`, `["transaction", linkedTxId]` for each linked tx read from the budget history cache **before** the optimistic removal |
| Update group metadata | `["groupDetails"]` |
| Create/update/delete scheduled action | `["scheduledActions"]` |
| Run scheduled action now | `["scheduledActions"]`, `["scheduledActionHistory"]` |

### Delete cascade notes

**`useDeleteTransaction`** (`useTransactions.ts`):
1. Calls `POST /split_delete` — backend soft-deletes the transaction and any linked budget entries atomically.
2. Optimistically removes the transaction from all `["transactions"]` caches.
3. Invalidates `["transaction", deletedId]` (detail page).
4. Invalidates all `["budget"]` keys (list + totals).
5. Scans `["budget", "history"]` caches for entries whose `linkedTransactionIds` include the deleted ID, then invalidates each matching `["budgetEntry", beId]` detail cache.

**`useDeleteBudgetEntry`** (`useBudget.ts`):
1. Reads `linkedTransactionIds` from the `["budget", "history"]` cache **before** the optimistic removal (the only place the IDs are available without an extra network call).
2. Calls `POST /budget_delete` — backend soft-deletes the budget entry and any linked transactions atomically.
3. Optimistically removes the budget entry from all `["budget", "history"]` caches.
4. Invalidates `["budget"]` (totals + list), `["budgetEntry", deletedId]`.
5. Invalidates `["transactions"]`, `["balances"]`, and `["transaction", txId]` for each linked transaction found in step 1.
