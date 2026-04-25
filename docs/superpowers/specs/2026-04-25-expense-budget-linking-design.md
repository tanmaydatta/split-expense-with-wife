# Expense ↔ Budget Entry Linking — Design Spec

**Date:** 2026-04-25
**Status:** Draft, pending review
**Phase:** Phase 1

## Summary

Today, when a user submits the dashboard form with both an expense and a budget category, the frontend fires two sequential API requests (`/split_new` then `/budget`). The two resulting database rows have no relationship — the user can't see which budget entry came from which expense, and the two-request flow has no atomicity (the second can fail after the first succeeds).

This spec introduces a first-class link between transactions and budget entries:

- **A junction table** (`expense_budget_links`) joining `transactions` ↔ `budget_entries`, capable of representing many-to-many from day one.
- **A new endpoint** `/dashboard_submit` that creates expense + budget + link atomically in one request.
- **List and detail UIs** that surface the link via a small 🔗 row indicator and an expanded card showing the linked sibling.
- **New detail routes** `/transaction/:id` and `/budget-entry/:id` for navigation between linked siblings (lists are paginated, so navigating "scroll to find it" is infeasible).
- **Automatic cascade soft-delete** — deleting either side cascades to the linked sibling, atomically.

Phase 1 enforces 1:1 at the API layer (one budget per expense per submit) but the schema is M:N capable, so a future Phase D unlocks multi-budget splits without schema migration.

## Motivation

1. Users can't tell which budget entry corresponds to which expense.
2. The two-request flow can leave the database in a half-state (expense saved, budget save fails) — silent data inconsistency that's hard to recover from.
3. Future capabilities (multi-budget splits, scheduled linked pairs, link audit trail) need a foundation. Adding a link concept now and getting the data model right is much cheaper than retrofitting later.

## Goals

- Create expense + budget + link atomically via a single dashboard request.
- Display the link on both lists (subtle indicator) and detail views.
- Cascade soft-delete from either side to the linked sibling, atomically.
- New deep-link routes to a single transaction or budget entry.
- Schema supports M:N from day one even though Phase 1 UX is 1:1.

## Non-goals (Phase 1)

- Retroactive linking of existing standalone entries.
- Unlinking without deleting either side.
- Editing a link's target.
- A user-facing prompt to opt out of cascade delete.
- Backfilling the junction with historical pairs created before this feature.
- Scheduled actions producing linked pairs (current `add_expense` and `add_budget` types stay independent).
- Multi-budget-per-expense UI (Phase D).
- First-class detail-route navigation from list row clicks (lists keep their inline-expansion UX).

## Hard dependency

This spec's implementation depends on the **fixtures spec** (separate, Phase 0) being shipped first. The fixtures spec introduces a test-only seeding endpoint and Playwright fixture helpers used by this spec's e2e tests. Implementation of the linking spec must not begin until the fixtures spec has shipped.

## Key design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Cardinality (data model) | M:N junction table | Schema supports future multi-budget splits with no migration. |
| Cardinality (Phase 1 UX) | 1:1 (one budget per expense per submit) | Matches current dashboard form; defer M:N UI until Phase D. |
| Where the link lives | New `expense_budget_links` table | Avoids adding nullable FK columns to two heavily-written tables; cleaner cascade semantics; keeps both entity tables untouched. |
| Split amount on the link | Not modeled | Future M:N captures splits via individual `budget_entries.amount` values; the link itself is a pure pointer. |
| `deleted` column on the link | Not added | Soft-delete state lives on the entities; the link row stays so future undelete can restore relationships. |
| Junction PK | Surrogate `id` | Simpler reference for future "unlink one specific link" UX; cleaner FK target than composite. |
| API shape for the "1 request" goal | New endpoint `/dashboard_submit` | Dedicated dashboard endpoint; existing `/split_new` and `/budget` stay simple for other callers. |
| Existing prod data | Leave unlinked | Heuristic backfill risks false positives; if needed later we ship a separate utility. |
| Soft-deleted siblings | Auto cascade soft-delete | Aggregations (totals, charts, balances) already filter on `deleted IS NULL`; cascading both keeps semantics simple and bug-resistant. |
| Cascade prompt | None in Phase 1 | Auto cascade with no opt-out; a Phase 2 refinement adds a confirmation prompt with "delete just one" option. |
| List indicator UX | Small 🔗 icon on the row, visual only | Quiet lists, visible-when-needed details; no row-click behavior change. |
| Detail navigation | New routes reachable from expanded card only | Deep links solve the "paginated sibling" problem; no list-row navigation in Phase 1. |
| Budget list expansion | Add inline expansion (new `BudgetEntryCard`) | Symmetric with transactions; keeps the "expanded card hosts the View → link" pattern uniform. |
| Scheduled actions | No change in Phase 1 | Recurring linked pairs is a separate user need without evidence today; future work as a new action type. |
| Migration risk | New table only; no `ALTER TABLE` on transactions/budget_entries | Heavy tables stay untouched; pure additive change; trivial rollback (`DROP TABLE`). |

## Data model

### New table: `expense_budget_links`

```sql
CREATE TABLE expense_budget_links (
  id              TEXT PRIMARY KEY,                           -- ULID/UUID
  transaction_id  TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE NO ACTION,
  budget_entry_id TEXT NOT NULL REFERENCES budget_entries(budget_entry_id) ON DELETE NO ACTION,
  group_id        TEXT NOT NULL,                              -- denormalised; matches both siblings' group_id
  created_at      TEXT NOT NULL                               -- ISO timestamp
);

CREATE UNIQUE INDEX expense_budget_links_pair_idx
  ON expense_budget_links(transaction_id, budget_entry_id);

CREATE INDEX expense_budget_links_transaction_idx
  ON expense_budget_links(transaction_id);

CREATE INDEX expense_budget_links_budget_entry_idx
  ON expense_budget_links(budget_entry_id);

CREATE INDEX expense_budget_links_group_idx
  ON expense_budget_links(group_id);
```

Notes:
- `ON DELETE NO ACTION` because soft-deletes are managed in app code; the FK is for referential integrity (no hard-delete should ever orphan a link row).
- `group_id` denormalised so authorization checks and group-scoped scans don't require a join.
- `UNIQUE (transaction_id, budget_entry_id)` prevents duplicate link rows. Per-column UNIQUE constraints are intentionally **not** added — that would block M:N at the DB level. Phase 1's 1:1 invariant is enforced at the API layer.

### Drizzle schema (`cf-worker/src/db/schema/schema.ts`)

Add `expenseBudgetLinks` table definition with the columns and indexes above. No changes to `transactions`, `transactionUsers`, or `budgetEntries`.

### Migration

- File: `cf-worker/src/db/migrations/0017_<generated_name>.sql`.
- Generate via `yarn db:generate`.
- Single `CREATE TABLE` + 4 index statements.
- No data migration. No backfill.
- Rollback: `DROP TABLE expense_budget_links;` — safe; no other table references it.

### Shared types (`shared-types/index.ts`)

New:

```ts
interface ExpenseBudgetLink {
  id: string;
  transactionId: string;
  budgetEntryId: string;
  groupId: string;
  createdAt: string;
}
```

Modifications to existing list-response types are described in the Backend section.

## Backend

### New endpoints

#### `POST /dashboard_submit`

Single-request creation for the dashboard form. Handles all three submit modes.

```ts
// Request
interface DashboardSubmitRequest {
  expense?: {
    amount: number;
    description: string;
    paidByShares: Record<string, number>;
    splitPctShares: Record<string, number>;
    currency: string;
  };
  budget?: {
    amount: number;
    description: string;
    budgetId: string;     // group_budgets.id
    currency: string;
  };
  // group_id and user_id taken from session
}

// Response
interface DashboardSubmitResponse {
  message: string;
  transactionId?: string;    // present when expense was created
  budgetEntryId?: string;    // present when budget was created
  linkId?: string;           // present when both were created and linked
}
```

Validation:
- At least one of `expense` / `budget` must be present (else 400).
- When both are present (mode 3): `expense.amount === budget.amount` and `expense.currency === budget.currency` (else 400).
- `budget.budgetId` must belong to the user's group (existing check, reused).
- `expense.paidByShares` and `expense.splitPctShares` must reference users in the requesting user's group (existing check, reused).

Atomicity:
- Mode 1 (expense only): single batch — `INSERT transactions` + `INSERT transaction_users (N rows)`.
- Mode 2 (budget only): single batch — `INSERT budget_entries`.
- Mode 3 (both linked): single batch — `INSERT transactions` + `INSERT transaction_users (N rows)` + `INSERT budget_entries` + `INSERT expense_budget_links`.

Implemented via `db.batch([...])`. If any statement fails, no rows are persisted.

#### `POST /transaction_get`

```ts
interface TransactionGetRequest {
  id: string;            // transaction_id
}

interface TransactionGetResponse {
  transaction: Transaction;
  transactionUsers: TransactionUser[];
  linkedBudgetEntry?: BudgetEntry;   // present when a non-deleted linked sibling exists
}
```

- 404 if the transaction doesn't exist or isn't in the requesting user's group (don't leak existence).
- Filters `linkedBudgetEntry` on `deleted IS NULL`.

#### `POST /budget_entry_get`

```ts
interface BudgetEntryGetRequest {
  id: string;            // budget_entry_id
}

interface BudgetEntryGetResponse {
  budgetEntry: BudgetEntry;
  linkedTransaction?: Transaction;
  linkedTransactionUsers?: TransactionUser[];   // present iff linkedTransaction is present
}
```

- 404 on cross-group access.
- Filters `linkedTransaction` on `deleted IS NULL`.

### Modified endpoints

#### `POST /split_delete` — cascade

Sequence:
1. Verify the transaction is in the requesting user's group.
2. Read all live linked budget_entry IDs via the junction (filter `budget_entries.deleted IS NULL`).
3. Single `db.batch()`:
   - `UPDATE transactions SET deleted = ? WHERE transaction_id = ?`
   - `UPDATE transaction_users SET deleted = ? WHERE transaction_id = ?`
   - For each linked budget_entry_id: `UPDATE budget_entries SET deleted = ? WHERE budget_entry_id = ?`
4. Junction rows are NOT modified — they remain as the audit trail / undelete pointer.

#### `POST /budget_delete` — cascade

Symmetric: read live linked transaction IDs, then in one batch soft-delete the budget entry plus the linked transactions plus their transaction_users rows.

#### `POST /transactions_list` — links embedded per entity

Each `Transaction` in the response gains an optional `linkedBudgetEntryIds: string[]` field, populated from `expense_budget_links` joined to `budget_entries` (filtered on `deleted IS NULL`). Phase 1 always produces a list of length 0 or 1, but the field is `string[]` for forward compatibility with M:N. The wrapper response shape (`{ transactions, transactionDetails }`) is unchanged.

Implementation: a single grouped query keyed by `transaction_id`, merged into the `Transaction` rows before serialization.

#### `POST /budget_list` — links embedded per entity

Each `BudgetEntry` in the response gains an optional `linkedTransactionIds: string[]` field. Symmetric implementation. **The bare-array response shape (`BudgetEntry[]`) is preserved** — no breaking change to the response envelope.

Why per-entity instead of a top-level map: `/budget_list` currently returns a bare `BudgetEntry[]`, not a wrapper object. Wrapping it would be a breaking shape change requiring lockstep backend+frontend deploys. Embedding the field on `BudgetEntry` keeps the envelope stable and provides symmetry with `Transaction`. Detail endpoints (`/transaction_get`, `/budget_entry_get`) inherit the field automatically without further work.

### Unchanged endpoints

- `/split_new` — still called by scheduled actions.
- `/budget` — still called by the standalone Budget page's add-entry UI.
- `/budget_total`, `/budget_monthly` — unaffected (aggregations already filter `deleted IS NULL`, which works correctly with cascade).

### Authorization

- All new and modified endpoints reuse the existing session middleware and group-membership pattern.
- Junction `group_id` is asserted to match the session group on every read; mismatch is treated as a not-found.
- Cross-group linking is structurally impossible because the API only ever inserts links with the session's `group_id` and reads only filter by it.

### Shared-type additions

```ts
interface DashboardSubmitRequest { /* see above */ }
interface DashboardSubmitResponse { /* see above */ }
interface TransactionGetRequest { id: string }
interface TransactionGetResponse { /* see above */ }
interface BudgetEntryGetRequest { id: string }
interface BudgetEntryGetResponse { /* see above */ }

// Modifications (links embedded per entity, response envelopes unchanged):
interface Transaction {
  // ...existing fields...
  linkedBudgetEntryIds?: string[];   // NEW; omitted/empty when no live link
}

interface BudgetEntry {
  // ...existing fields...
  linkedTransactionIds?: string[];   // NEW; omitted/empty when no live link
}

// TransactionsListResponse: shape unchanged; each Transaction now carries linkedBudgetEntryIds.
// /budget_list response: still BudgetEntry[]; each BudgetEntry now carries linkedTransactionIds.
```

`ApiOperationResponses` (currently used to merge the two old responses into one) becomes unused once `useDashboardSubmit` returns `DashboardSubmitResponse` directly. Remove it after a greppable safety check.

## Frontend

### Hooks (`src/hooks/`)

| Hook | Status | Notes |
|---|---|---|
| `useDashboardSubmit` | **Rewrite** | Single `useMutation` against `/dashboard_submit`. Returns `DashboardSubmitResponse`. Replaces sequential `createExpense` + `updateBudget` composition. |
| `useCreateExpense` | Keep | Still callable elsewhere; not used by dashboard anymore. |
| `useUpdateBudget` | Keep | Still backs the standalone Budget page's add-entry UI. |
| `useTransaction(id)` | **New** | `useQuery` against `/transaction_get`. Cache key: `["transaction", id]`. |
| `useBudgetEntry(id)` | **New** | `useQuery` against `/budget_entry_get`. Cache key: `["budgetEntry", id]`. |
| `useTransactionsList` | Modify | Each `Transaction` in the response now carries `linkedBudgetEntryIds`; hook signature unchanged. |
| `useInfiniteBudgetHistory` | Modify | Each `BudgetEntry` in the response now carries `linkedTransactionIds`; hook signature unchanged. |
| `useDeleteTransaction` | Modify | On success, additionally invalidate `["budget"]` (all variants), `["transaction", deletedId]`, and (when known from list cache) `["budgetEntry", linkedId]`. Optimistic removal extends to the linked sibling in the budget list cache. |
| `useDeleteBudgetEntry` | Modify | Symmetric: invalidates `["transactions"]`, `["balances"]`, `["budgetEntry", deletedId]`, `["transaction", linkedId]`; optimistic removal of the linked sibling from the transactions list cache. |

### Cache invalidation matrix

| Action | Invalidates |
|---|---|
| `useDashboardSubmit` success | `["transactions"]`, `["balances"]`, `["budget"]` (all variants). |
| `useDeleteTransaction` success | `["transactions"]`, `["balances"]`, `["budget"]`, `["transaction", deletedId]`, `["budgetEntry", linkedId]` if known. |
| `useDeleteBudgetEntry` success | `["budget"]`, `["transactions"]`, `["balances"]`, `["budgetEntry", deletedId]`, `["transaction", linkedId]` if known. |

### Pages (`src/pages/`)

#### `Dashboard/`

- No visible UI changes.
- `formHandlers.ts` — `createFormSubmitHandler` calls `dashboardSubmit.mutateAsync(payload)` once; payload is `DashboardSubmitRequest`.
- Success toast unifies into one message: "Expense and budget entry added" / "Expense added" / "Budget entry added" depending on which fields were submitted.

#### `Transactions/`

- Each row gets a small 🔗 icon next to the description when `transaction.linkedBudgetEntryIds?.length > 0`.
- Row click still expands `TransactionCard` (existing behavior).
- `TransactionCard` gains a "Linked budget entry" section when a linked sibling exists, showing budget name, description, amount + currency, added time, and a "View budget entry →" link to `/budget-entry/:linkedId`.

#### `Budget/`

- New `BudgetEntryCard` component (analogous to `TransactionCard`).
- `BudgetTable.tsx` extended to support row-click expansion with a child render slot.
- Each row gets a small 🔗 icon next to the description when `budgetEntry.linkedTransactionIds?.length > 0`.
- Expanded `BudgetEntryCard` shows budget entry details + (when linked) a "Linked expense" section with "View expense →" link to `/transaction/:linkedId`.

#### `TransactionDetail/` (new)

- Route: `/transaction/:id`.
- Reuses `TransactionCard` content for the entity display.
- "Linked budget entry" section when present, with "View budget entry →" link.
- Delete button (cascade behavior). On success: navigate to `/transactions`.
- "← Back" link via `navigate(-1)`.
- Loading skeleton (existing pattern), 404 → "Entry not found or you don't have access" card.

#### `BudgetEntryDetail/` (new)

- Route: `/budget-entry/:id`.
- Reuses the new `BudgetEntryCard` content.
- "Linked expense" section when present.
- Delete button (cascade behavior). On success: navigate to `/budget?budgetId=<budgetId>` if known, else `/budget`.
- "← Back" link.
- Same loading / 404 patterns as above.

### Routing (`src/App.tsx` or wherever `<Routes>` lives)

```tsx
<Route path="/transaction/:id" element={<TransactionDetail />} />
<Route path="/budget-entry/:id" element={<BudgetEntryDetail />} />
```

Both inside the authenticated layout.

## UI surfaces — interaction summary

| Surface | Indicator | Click behavior | Linked-sibling visibility |
|---|---|---|---|
| Transactions list row | 🔗 icon (visual only) | Row click expands `TransactionCard` (unchanged) | Inside expanded card: "Linked budget entry" section + "View budget entry →" link |
| Budget list row | 🔗 icon (visual only) | Row click expands `BudgetEntryCard` (new) | Inside expanded card: "Linked expense" section + "View expense →" link |
| `/transaction/:id` page | n/a (full detail) | Direct URL or "View expense →" from elsewhere | "Linked budget entry" section in body |
| `/budget-entry/:id` page | n/a (full detail) | Direct URL or "View budget entry →" from elsewhere | "Linked expense" section in body |

## Scheduled actions

Out of scope for Phase 1. `cf-worker/src/handlers/scheduled-actions.ts` and the workflow processor stay unchanged; runs continue to produce unlinked entries.

Future work (deferred): introduce an `add_expense_with_budget` scheduled-action type whose config carries both expense and budget params. The executor opens a single batch and inserts the link row alongside the entries. No schema changes will be needed.

## Tests

### Backend (Vitest, `cf-worker/src/tests/`)

New test file `expense-budget-link.test.ts` (or split across the existing files where logical):

1. `/dashboard_submit` mode 1 (expense only) — creates one transaction, no link.
2. `/dashboard_submit` mode 2 (budget only) — creates one budget entry, no link.
3. `/dashboard_submit` mode 3 (both) — creates expense + budget + link atomically; response carries all three IDs; junction row has correct group_id.
4. `/dashboard_submit` validation: neither field present → 400; amount mismatch → 400; currency mismatch → 400; cross-group budgetId → 400.
5. `/dashboard_submit` atomicity: induce a mid-batch failure (e.g., invalid user in `paidByShares`) and assert no rows persist.
6. `/transaction_get` returns linked sibling when present, omits when not, returns 404 for cross-group access.
7. `/budget_entry_get` symmetric.
8. `/split_delete` cascade: deleting a linked expense soft-deletes its linked budget entry; both `deleted` set; junction row preserved.
9. `/budget_delete` cascade: symmetric.
10. `/transactions_list` populates `linkedBudgetEntryIds` on each `Transaction` row; soft-deleted budget entries are omitted from the IDs.
11. `/budget_list` populates `linkedTransactionIds` on each `BudgetEntry`; soft-deleted transactions are omitted from the IDs.

Update existing `split.test.ts` and `budget.test.ts` to assert the new fields exist on each row (omitted or empty when no links).

### Frontend (Jest)

- `useDashboardSubmit`: single `fetch` call to `/dashboard_submit`; happy path; error path.
- `useTransaction(id)` and `useBudgetEntry(id)`: query key shape; response handling; 404 handling.
- `useDeleteTransaction`: extended to assert that `["budget"]` and `["budgetEntry", linkedId]` are invalidated after a cascading delete.
- Component tests for `TransactionDetail` and `BudgetEntryDetail`: with linked sibling, without, 404.
- 🔗 icon presence on rows when the entity carries `linkedBudgetEntryIds` / `linkedTransactionIds`.

### E2E (Playwright, `src/e2e/tests/`)

> Depends on the fixtures spec (Phase 0) being shipped. E2E tests use the seed endpoint and Playwright fixtures from that spec for fast setup.

New file `expense-budget-linking.spec.ts`:

1. Submit dashboard form with both expense and budget; assert exactly one network request to `/dashboard_submit`; assert both entries appear in their lists with 🔗 icons.
2. Click a transaction row; expanded card shows the "Linked budget entry" section; click "View budget entry →"; assert URL is `/budget-entry/:id` and the page shows the linked expense.
3. From `/transaction/:id`, click delete; assert both linked entries disappear from their lists.
4. Submit the dashboard with only the expense; assert no 🔗 icon on the row.
5. Submit via the standalone Budget page (no expense); assert no 🔗 icon on the budget row.

Update existing `expense-management.spec.ts` and `budget-management.spec.ts` minimally where they assert response shapes that have changed.

## Rollout

Three discrete deploys, each independently safe to roll back:

1. **Migration `0017`** (`yarn db:migrate:dev`, then `yarn db:migrate:prod`). Pure additive; no `ALTER TABLE` on existing tables; no data migration.
2. **Backend deploy** (`yarn deploy:dev`, then `yarn deploy:prod`). New endpoints + cascade behavior + list response augmentations. Old frontend continues to work unchanged (`/split_new` and `/budget` keep their semantics; cascading delete is a no-op when no link rows exist).
3. **Frontend deploy** (Netlify auto-deploy on main). Single PR with `useDashboardSubmit` rewrite, new hooks, new pages, new routes, list UI changes.

No feature flag. The user-visible behavior change is small and self-contained.

### Rollback

- Frontend: revert the PR; old `useDashboardSubmit` resumes 2-call behavior. Backend stays; harmless.
- Backend: revert and redeploy. Existing junction rows become orphans but cause no errors.
- Migration (only if absolutely necessary): `DROP TABLE expense_budget_links;`. Junction rows lost; no other table references it.

### Performance

- Junction table is small (one row per linked pair).
- List endpoints add one extra grouped query / LEFT JOIN; with the indexes above this is negligible compared to existing pagination cost.
- Detail endpoints are point reads; no concern.

## Documentation updates (mandatory per `CLAUDE.md`)

- `docs/api.md` — `/dashboard_submit`, `/transaction_get`, `/budget_entry_get`; cascade additions to `/split_delete`, `/budget_delete`; list response augmentations.
- `docs/database.md` — `expense_budget_links` table.
- `docs/migration-changelog.md` — `0017_<name>` entry.
- `docs/codebase-map.md` — new routes, new pages, new hooks.
- `docs/frontend-hooks.md` — new hooks, cache invalidation matrix.
- `docs/user-flows.md` — updated dashboard flow (1 request, link badges), new detail pages, cascade-delete behavior.
- `docs/architecture.md` — link as a first-class concept.

## Out of scope for Phase 1 / Future work

| Item | Phase | Notes |
|---|---|---|
| Multi-budget-per-expense UI | Phase D | Schema already supports it; relax API validation + rework dashboard form. |
| Last-link-only cascade rule | Phase D | Application code change; no schema change. |
| Retroactive linking of standalone entries | Future | Requires a search-and-pick UI; deferred indefinitely. |
| Backfill historical pairs | Future | Standalone utility; not a migration. |
| Unlinking without delete | Future | Cheap to add (one endpoint, one button); deferred. |
| Editing a link target | Future | Requires retroactive linking first. |
| Cascade-delete opt-out prompt | Phase 2 | UX refinement: "Delete this expense and its linked budget entry? [Yes, both] [Just the expense]". |
| Scheduled `add_expense_with_budget` action | Future | New action type, executor uses `/dashboard_submit` shape internally. |
| First-class detail-route navigation from list rows | Future | Add a "view full detail" link or make row description an anchor. |
| Inline 🔗-with-sibling-name chip on rows | Future | Replace icon-only with `🔗 Groceries`-style chip. |
| Link-row metadata (audit fields, custom labels) | Future | Add columns to junction without a migration risk; backwards compatible. |

## Open questions

None at this time. All decisions captured in the table above.
