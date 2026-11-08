# Budget Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Budgets a readable overview of rolling money pools with a useful individual budget detail page, replacing the current budget-history-first and standalone Monthly Budget experience.

**Architecture:** Reuse `group_budgets`, `budget_totals`, `budget_entries`, existing `useBudgetTotal` and `useMonthlyBudget` queries. Add a summary grid and a detail route; move monthly chart presentation into budget details without changing calculation logic. Category breakdown will be reusable content supplied by the separate Reports/Categories plan.

**Tech Stack:** React/TypeScript, TanStack Query, existing `BudgetChart`, Cloudflare D1 read APIs, Jest/RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-transaction-first-budget-app-design.md`

## Global Constraints

- Budget names (House, Your Personal, Wife's Personal, Vacation) are examples, not hardcoded strings; use the group's configured budget IDs.
- Existing budget available balances are **signed lifetime totals**. Preserve deficits, positive rollover and existing funding behaviour; do not silently reset at the month boundary.
- Keep separate currencies separate; show `GBP`, `USD` or other existing currencies alongside amounts.
- Category labels never create separate spending caps or reduce available cash twice.
- Preserve budget rename/archive, transfer semantics, reporting exclusions and the ability to view old entries.
- Keep `/budget?budget=<id>` and `/monthly-budget/:budgetName` accessible through compatibility routes while moving visible navigation.

## Review Focus

1. **Negative balance:** `-21.18 + 137.45` shows `116.27`, not a reset to `137.45`. Test in Task 1.
2. **No budgets / archived budgets:** empty state does not dereference a non-existent first budget, and archived history remains accessible. Test in Task 1.
3. **Multiple currencies:** no sum across currencies without explicit conversion; show distinct totals. Test in Task 1.
4. **Transfer pair:** applying a transfer changes both budget summaries but is not treated as spent money. Test in Task 2.
5. **Historical deep links:** old `/monthly-budget` and budget-filtered links still resolve to the correct budget after rename. Test in Task 3.

## File Structure

- Create `src/pages/Budget/BudgetOverview.tsx` and `src/pages/Budget/BudgetSummaryCard.tsx` for all active budgets.
- Create `src/pages/Budget/BudgetDetail.tsx` for per-budget overview, activity entry points, funding/transfer actions and monthly trends.
- Create `src/pages/Budget/BudgetSummaryCard.test.tsx` for signed balance and currency rendering.
- Modify `src/pages/Budget/index.tsx` to render the overview rather than lead with the one-budget ledger.
- Reuse `src/hooks/useBudget.ts`, `src/hooks/useMonthlyBudget.ts`, `src/pages/MonthlyBudgetPage/ChartComponents.tsx`, `src/pages/Budget/TransferForm.tsx`, `src/SelectBudget.tsx`.
- Modify `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx` and, if needed, `src/pages/MonthlyBudgetPage/index.tsx` for detail routing and old-route redirection.
- Extend `src/e2e/tests/budget-management.spec.ts` and `src/e2e/tests/monthly-budget-management.spec.ts`.
- Update `docs/codebase-map.md` and `docs/budget-transfers.md` where navigation changes.

## Task 1: All-budget overview

**Files:** `src/pages/Budget/BudgetOverview.tsx`, `src/pages/Budget/BudgetSummaryCard.tsx`, `src/pages/Budget/BudgetSummaryCard.test.tsx`, `src/pages/Budget/index.tsx`

**Interfaces:** `BudgetSummaryCard({ budgetId, name, totals, onOpen })`; `BudgetOverview` reads current household group budgets and existing `useBudgetTotal` data.

- [ ] **Step 1: Write failing unit tests** for active House/Personal/Vacation cards, negative balances, positive lifetime balances, empty households, archived budget omission, and multi-currency totals.
- [ ] **Step 2: Run** `yarn test --watchAll=false --runInBand src/pages/Budget/BudgetSummaryCard.test.tsx`; verify missing components cause failure.
- [ ] **Step 3: Build** an overview with accessible budget cards: name, signed `Available` amount, optional this-month funding/spend from existing read APIs, and a detail action. Avoid a misleading fixed `spent of budget` progress bar unless an actual monthly allowance exists.
- [ ] **Step 4: Run** unit tests and `yarn lint`; verify lifetime available is unchanged by date-range filters.
- [ ] **Step 5: Commit** `feat: add budget overview`.

## Task 2: Individual budget detail and trends

**Files:** `src/pages/Budget/BudgetDetail.tsx`, `src/pages/Budget/TransferForm.tsx`, `src/pages/MonthlyBudgetPage/ChartComponents.tsx`, `src/e2e/tests/budget-management.spec.ts`, `src/e2e/tests/monthly-budget-management.spec.ts`

**Interfaces:** Route `/budget/:budgetId` renders `BudgetDetail`; `BudgetDetail` uses `useBudgetTotal(budgetId)` and `useMonthlyBudget({ budgetId, ... })` with a chart range and currency selector.

- [ ] **Step 1: Write failing browser tests** for House detail, previous-month trend, changing date range, transfer between budgets, negative available amount, and accessing recent activity.
- [ ] **Step 2: Run** focused budget/monthly Playwright tests; verify missing detail route/sections.
- [ ] **Step 3: Reuse** the current monthly chart under a `Trends` section inside budget detail. Show `Available` separately from monthly spent/funding so cumulative balance is not confused with a monthly limit. Reuse existing transfer form; link activity to the unified Transactions filtered view if it exists, otherwise retain the existing budget-history route during independent rollout.
- [ ] **Step 4: Run** focused Playwright on desktop and mobile; run frontend tests and lint. Verify transfer exclusion and archive handling.
- [ ] **Step 5: Commit** `feat: add budget detail and trends`.

## Task 3: Navigation and legacy-route compatibility

**Files:** `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx`, `src/pages/Budget/index.tsx`, `src/pages/MonthlyBudgetPage/index.tsx`, `src/e2e/tests/monthly-budget-management.spec.ts`

**Interfaces:** Sidebar retains one `Budgets` destination. `/monthly-budget/:budgetId` redirects to `/budget/:budgetId` with a trend-section anchor and preserves supported query parameters; current `/budget?budget=` deep links resolve to the corresponding detail.

- [ ] **Step 1: Add failing routing tests** for old monthly budget URLs, old budget-filter URL, unknown/archived budgets and browser Back navigation.
- [ ] **Step 2: Run** routing tests and confirm old destinations still render separately.
- [ ] **Step 3: Remove** standalone Monthly Budget from navigation, add compatibility routes, and keep the old chart component available for existing tests until all links are updated. Update accessible page titles and mobile menu.
- [ ] **Step 4: Run** navigation E2E, `yarn test --watchAll=false --runInBand` and `yarn lint`.
- [ ] **Step 5: Commit** `refactor: consolidate budget navigation` and update docs.

## Rollout and stopping point

This plan may ship independently of Unified Transactions and Reports. It makes Budgets clearer without altering the accounting engine. **Reports/Categories plan** subsequently embeds House -> Groceries/Restaurants breakdown in the budget detail; this plan should expose a small reusable detail-section slot rather than duplicating analytics code.
