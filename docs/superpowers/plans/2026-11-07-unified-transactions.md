# Unified Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present one canonical chronological Transactions history instead of separate Expenses and Budget entry lists, while preserving the underlying financial ledger.

**Architecture:** Create a read-only, group-authorised unified ledger endpoint that merges distinct logical events from existing financial tables. Linked expense + budget pairs and paired internal transfers produce one visible row each. Replace the Expenses list UI with a transaction-first list; retain legacy detail URLs and accounting write endpoints.

**Tech Stack:** React/TypeScript, TanStack Query, Cloudflare Workers/Hono, Drizzle + D1 SQLite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-transaction-first-budget-app-design.md`

## Global Constraints

- Do not merge/drop `transactions`, `budget_entries`, `expense_budget_links`, or `budget_transfer_entries`.
- Read model is read-only; no change to split/debt calculation, budget totals, soft deletion, scheduled writes or bank privacy.
- Use the existing authenticated household identity, never a client-supplied household ID.
- Linked expense + budget = one row; paired transfer = one row; standalone expense/credit/debit = one row each.
- Keep `/transactions_list`, `/budget_list`, `/transaction/:id`, `/budget-entry/:id`, and `/expenses` operational during the rollout.
- Preserve signed budget movements and original currencies; never silently merge currencies or double-count budget debits.

## Review Focus

1. **Historical unlinked records:** an expense without any budget link and a budget-only debit each appear once, not incorrectly paired by description/date. Test in Task 1.
2. **Many-to-many links:** a transaction linked to multiple budget entries is displayed once with all linked IDs, not multiplied by JOIN rows. Test in Task 1.
3. **Transfer across archived budgets:** one transfer remains visible when the selected active budget is one side, and excludes a deleted transfer. Test in Task 1.
4. **Same timestamp pagination:** stable keyset pagination returns every row exactly once across page boundaries and filters. Test in Task 2.
5. **Private bank activity:** only shared ledger rows are returned; owner-only bank metadata is not disclosed. Test in Task 1.

## File Structure

- Create `shared-types/ledger.ts` for `UnifiedLedgerRow`, list request/response types, and discriminated row kinds; re-export from `shared-types/index.ts`.
- Create `cf-worker/src/handlers/ledger.ts` for a bounded authenticated `POST /ledger_list` read endpoint.
- Modify `cf-worker/src/index.ts` to register the new endpoint alongside legacy handlers.
- Create `cf-worker/src/tests/ledger.test.ts` for API, identity, transfer and pagination cases.
- Create `src/hooks/useLedger.ts` for query keys, pagination and cache invalidation.
- Create `src/pages/Transactions/UnifiedLedgerList.tsx` for unified desktop/mobile rows and detail routing.
- Modify `src/pages/Transactions/index.tsx`, `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx`, `src/pages/Transactions/index.css` for the first-class Transactions view and legacy navigation.
- Create `src/e2e/tests/unified-ledger.spec.ts` for full flows on desktop and mobile.
- Update `docs/codebase-map.md`, `docs/api.md` and `docs/architecture.md` after implementation.

## Interface contract

Expose `POST /.netlify/functions/ledger_list` with a server-owned household scope and a request shaped as:

```ts
interface LedgerListRequest {
  limit?: number; // 1..50, default 25
  cursor?: string; // opaque; stable event timestamp + canonical identity
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  currency?: string;
  budgetId?: string;
  categoryId?: string;
  kinds?: Array<"purchase" | "budget_adjustment" | "transfer">;
}
interface UnifiedLedgerRow {
  id: string; // tx:<transactionId>, be:<budgetEntryId>, transfer:<transferId>
  kind: "purchase" | "budget_adjustment" | "transfer";
  timestamp: string;
  description: string;
  currency: string;
  amount: number; // signed in the visible budget direction
  transactionId?: string;
  budgetEntryIds: string[];
  budgetIds: string[];
  categoryId?: string | null;
  paidByUserId?: string;
  transferId?: string;
}
interface LedgerListResponse { rows: UnifiedLedgerRow[]; nextCursor: string | null }
```

A linked expense anchors on `tx:<id>` even if it has multiple budget entries. An unlinked budget entry anchors on `be:<id>`. A budget transfer anchors on `transfer:<id>` and emits no separate budget-entry rows. Preserve legacy standalone transaction semantics if there is no budget ID. Do not manufacture historical links.

## Task 1: Canonical row projection and authorisation

**Files:** `shared-types/ledger.ts`, `shared-types/index.ts`, `cf-worker/src/handlers/ledger.ts`, `cf-worker/src/tests/ledger.test.ts`, `cf-worker/src/index.ts`

**Interfaces:** Produce `UnifiedLedgerRow`/`LedgerListRequest`/`LedgerListResponse`; Task 2 consumes the same endpoint.

- [x] **Step 1: Write failing Worker tests** for linked purchase (one row), standalone expense, standalone budget credit/debit, two-ended transfer, archived counterpart, M:N links, deleted siblings, foreign household ID, and absence of unreviewed private bank rows. Assert exact canonical IDs and amounts.
- [x] **Step 2: Run** `cd cf-worker && yarn vitest run src/tests/ledger.test.ts --no-file-parallelism`; verify tests fail because `/ledger_list` is not registered.
- [x] **Step 3: Implement** `handleLedgerList(request: Request, env: Env): Promise<Response>` using the established auth helpers. Build a bounded D1 query/projection across sources, excluding transfer-backed and expense-linked budget rows from the standalone arm; de-duplicate expense anchors before pagination. Enforce ownership and household authorization before category enrichment.
- [x] **Step 4: Re-run** focused tests; verify all pass, then `cd cf-worker && yarn lint`.
- [x] **Step 5: Commit** `feat: add unified ledger read API`.

## Task 2: Stable filtering and pagination

**Files:** `cf-worker/src/handlers/ledger.ts`, `cf-worker/src/tests/ledger.test.ts`, `src/hooks/useLedger.ts`

**Interfaces:** `useLedger(filters: LedgerListRequest)` returns a TanStack paginated query of `LedgerListResponse`, preserving the opaque cursor and session cache key.

- [x] **Step 1: Add failing tests** for duplicate timestamps, cross-source ordering, budget+category+currency filters, page boundary at 25 rows, cursor reuse after filtered query, and malformed/foreign cursor rejection. Include mixed currency and a transfer involving an archived budget.
- [x] **Step 2: Run** the focused Worker test and verify failures reflect absent cursor/filter behaviour.
- [x] **Step 3: Implement** deterministic ordering `timestamp DESC, canonicalId DESC`, server-validated opaque cursors, a capped page size, and an index-aware bounded query. Keep filters on the canonical logical event rather than filtering sibling rows after pagination. Implement `useLedger` with user/group/session identity in the query key.
- [x] **Step 4: Run** the focused Worker suite and frontend type/lint gates; confirm stable non-overlapping pagination.
- [x] **Step 5: Commit** `feat: paginate unified ledger`.

## Task 3: One Transactions page and detail navigation

**Files:** `src/pages/Transactions/UnifiedLedgerList.tsx`, `src/pages/Transactions/index.tsx`, `src/pages/Transactions/index.css`, `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx`, `src/e2e/tests/unified-ledger.spec.ts`

**Interfaces:** Render `UnifiedLedgerRow`; route purchase to existing `/transaction/:id`, unlinked budget adjustment to `/budget-entry/:id`, and transfer to an existing paired-transfer detail path or a small new read-only transfer detail component. Never delete both sides by two independent requests.

- [x] **Step 1: Write failing browser tests** showing one Tesco linked row, standalone funding, one transfer row, filtering, mobile expansion, a legacy `/expenses` link and the absence of duplicate siblings.
- [x] **Step 2: Run** `yarn playwright test src/e2e/tests/unified-ledger.spec.ts --project=chromium`; verify old Expenses UI does not satisfy the new assertions.
- [x] **Step 3: Build** Transactions UI using existing row/card, `FinanceListFilters`, detail and accessible mobile patterns. Change sidebar label `Expenses` -> `Transactions`, use `/transactions` as canonical URL, and redirect `/expenses` without losing query parameters. Keep category/source/split information accessible on expansion; reflect delete effects by invalidating `ledger`, `transactions`, `budget`, `balances`, and insights queries.
- [x] **Step 4: Run** focused Playwright on Chromium and Mobile Chrome; run `yarn test --watchAll=false --runInBand` and `yarn lint`; retain existing expense-budget-linking coverage.
- [x] **Step 5: Commit** `feat: show unified transactions` and update repository docs.

## Rollout and stopping point

Ship only the new read endpoint and page; leave all financial writes unchanged. After verifying old URLs and reports still work in development, rollout via the normal release process. **Do not migrate or remove legacy tables/endpoints in this PR.** The transaction-entry redesign is a separate plan.
