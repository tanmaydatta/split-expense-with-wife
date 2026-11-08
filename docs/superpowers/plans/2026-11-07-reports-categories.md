# Reports and Categories UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered Budget Insights and Monthly Budget analytics navigation with one straightforward Reports experience and category breakdowns inside each budget, without category spending limits.

**Architecture:** Reuse the existing budget-entry-based `/category-insights` endpoint, `useCategoryInsights`, `useMonthlyBudget`, and chart components. Move them into a shared Reports UI and a reusable budget-category breakdown component. Preserve existing aggregation semantics, exclusion logic, limits, source and currency boundaries.

**Tech Stack:** React/TypeScript, Recharts (existing), TanStack Query, Cloudflare Worker category-insights endpoint, RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-transaction-first-budget-app-design.md`

## Global Constraints

- Budget = rolling available money; category = spending classification. **Never** give Groceries, Restaurants, Shopping, etc. independent funding limits.
- Use original-currency amounts, never naive cross-currency totals.
- Aggregated spending comes from real budget debits, not from summing linked split-expense rows as a second source.
- Internal budget transfers remain excluded from spending, credits, monthly stacks, category percentages and spending counts, as currently specified in `docs/category-insights.md`.
- Keep explicit saved exclusions and temporary category exclusions, with unchanged meaning.
- Keep historical insight URLs and drilldowns functional across the navigation transition.
- Respect current 366-day, 5,000-record and 100-active-budget reporting bounds and database read controls; do not widen the query unreviewed.

## Review Focus

1. **Linked purchase:** House -> Groceries contributes exactly one £47.83 debit in reports, even though an expense row and linked budget entry both exist. Test in Task 1.
2. **Budget-only credit:** increases available budget but does not count as category spending. Test in Task 1.
3. **Transfer / category exclusion:** paired internal transfer never appears as eating-out spending, even if one side has an unexpected category. Test in Task 1.
4. **Multiple budgets and currencies:** House vs Vacation filters and GBP vs USD remain isolated. Test in Task 1.
5. **No category limits:** changing category settings must not create envelopes or alter monthly funding/available balances. Test in Task 2.

## File Structure

- Create `src/pages/Reports/index.tsx` and `src/pages/Reports/index.css` to host unified report controls, totals, category and monthly trends.
- Create `src/components/SpendingCategoryBreakdown/SpendingCategoryBreakdown.tsx` and test, accepting an existing `CategoryInsightsResponse`.
- Modify `src/pages/CategoryInsights/index.tsx` to extract reusable `InsightsContent`, filters, and category drilldown rather than duplicating a second report.
- Reuse `src/pages/CategoryInsights/TemporaryExclusions.tsx`, `presets.ts`, `src/hooks/useCategoryInsights.ts` and `src/pages/MonthlyBudgetPage/ChartComponents.tsx`.
- Modify `src/pages/Settings/CategoriesSection.tsx` and `src/components/Categories/index.tsx` only to simplify labels, not schema.
- Modify `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx` for `/reports` and compatibility `/category-insights`, `/monthly-budget` links.
- Add `src/components/SpendingCategoryBreakdown/SpendingCategoryBreakdown.test.tsx` and extend `src/pages/CategoryInsights/CategoryInsights.test.tsx`, `src/e2e/category-insights.spec.ts`.
- Update `docs/category-insights.md` and `docs/codebase-map.md` with the new navigation.

## Task 1: Reusable spending breakdown with exact semantics

**Files:** `src/components/SpendingCategoryBreakdown/SpendingCategoryBreakdown.tsx`, `src/components/SpendingCategoryBreakdown/SpendingCategoryBreakdown.test.tsx`, `src/pages/CategoryInsights/index.tsx`

**Interfaces:** `SpendingCategoryBreakdown({ data, compact, onCategorySelect })`, where `data` is the existing `CategoryInsightsResponse`, `compact` toggles the budget-detail presentation and `onCategorySelect(categoryId)` navigates to filtered history.

- [ ] **Step 1: Write failing tests** with £47.83 linked House/Groceries debit, £600 funding credit, internal transfer, exclusion and multi-currency fixtures. Assert category totals, labels and absence of category budgets/limits.
- [ ] **Step 2: Run** `yarn test --watchAll=false --runInBand src/components/SpendingCategoryBreakdown/SpendingCategoryBreakdown.test.tsx`; verify no component exists.
- [ ] **Step 3: Extract** the current category breakdown and monthly grouping from `CategoryInsights` into a reusable component. Do not recalculate net budgets from transactions or treat funding as income without an explicit source distinction. Render concise House -> Groceries/Restaurants/Shopping summaries from selected budget data.
- [ ] **Step 4: Run** component and existing CategoryInsights tests; verify exclusions and original-currency behaviour.
- [ ] **Step 5: Commit** `refactor: share spending category breakdown`.

## Task 2: One Reports destination and sensible controls

**Files:** `src/pages/Reports/index.tsx`, `src/pages/Reports/index.css`, `src/pages/CategoryInsights/index.tsx`, `src/pages/Settings/CategoriesSection.tsx`, `src/e2e/category-insights.spec.ts`

**Interfaces:** `/reports` accepts `budget`, `categoryId`, `dateFrom`, `dateTo`, `currency`, and existing temporary-exclusion query parameters; report data continues through `useCategoryInsights`.

- [ ] **Step 1: Write failing UI tests** for this month/last month, per-budget and all-budget filters, spending categories, monthly chart, empty state, temporary exclusions, accessible mobile filter controls and no category limit controls.
- [ ] **Step 2: Run** the focused browser tests and verify the `/reports` destination is missing.
- [ ] **Step 3: Add** the Reports page combining spending breakdown and monthly trends. Keep taxonomies as optional categorisation in Settings, and rename confusing labels (`Budget category insights`, `Net budget movement`) in the UI while preserving their mathematical definitions in help text. Preserve backend aggregation and 366-day cap.
- [ ] **Step 4: Run** focused CategoryInsights tests and desktop/mobile Playwright. Verify category links open either existing budget history (standalone rollout) or `/transactions` with filters (when Unified Transactions is installed).
- [ ] **Step 5: Commit** `feat: consolidate spending reports`.

## Task 3: Remove redundant navigation, retain old URLs

**Files:** `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx`, `src/pages/Budget/BudgetDetail.tsx` (if the Budget Dashboard plan has shipped), `src/e2e/category-insights.spec.ts`, `docs/category-insights.md`

**Interfaces:** One `Reports` navigation item. `/category-insights` redirects to equivalent `/reports` query parameters; legacy monthly-budget routes continue via the Budget Dashboard plan or existing page until that plan ships.

- [ ] **Step 1: Add failing route tests** for shared report links, category-filtered legacy budget links, archived categories, and mobile sidebar selection.
- [ ] **Step 2: Run** the routing tests; confirm the redundant sidebar destinations are still visible.
- [ ] **Step 3: Replace** sidebar Budget Insights with Reports, embed `SpendingCategoryBreakdown` into a budget detail when that page is available, and keep old routes as compatible redirects. Avoid creating a dependency that requires another plan's code to compile.
- [ ] **Step 4: Run** route E2E, `yarn test --watchAll=false --runInBand`, `yarn lint`, and Worker `category-insights.test.ts` if backend changes were needed.
- [ ] **Step 5: Commit** `refactor: simplify reports navigation` and update docs.

## Rollout and stopping point

This plan changes presentation and routing; keep `/category-insights` results stable unless a separately reviewed backend change is necessary. Do not delete the existing `group_categories` taxonomy. No new spending caps, category sub-budgets, or historical automatic recategorisation.
