# Transaction Entry UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing Add Expense / Update Budget checkboxes with an intuitive, transaction-first entry flow, without replacing the existing write APIs.

**Architecture:** Use a small discriminated UI action state (`purchase`, `budget_adjustment`, `transfer`) that maps to the existing `/dashboard_submit`, `/budget` and `/budget-transfer` endpoints. Keep the normal path a single purchase form; preserve split-only transactions and specialist workflows under clearly named advanced actions.

**Tech Stack:** React, TypeScript, existing TanStack Form helpers, TanStack Query, current Cloudflare Worker APIs, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-transaction-first-budget-app-design.md`

## Global Constraints

- No D1 migration or change to existing financial write calculations in this plan.
- Normal purchase defaults to both expense+budget when a valid budget is available, using **one** `/dashboard_submit` mutation and its atomic link.
- Preserve a **split-only** path with no budget impact, a **budget-only** funding/adjustment path, and budget-to-budget transfer pairing.
- `Paid by` and percentage shares remain available; don't adopt joint-account-only accounting by stealth.
- Category remains optional/automatic; never make a new spending-category limit.
- Preserve bank review amount/date immutability, partial association flows, and scheduled bill integration.

## Review Focus

1. **No active budgets:** users can still record a split-only purchase and see an understandable empty-budget state. Test in Task 1.
2. **Payer/split validation:** percentages must reconcile to 100%, and error states must not create partial ledger writes. Test in Task 2.
3. **Bank-import pending/linked row:** never create a duplicate expense/budget side or override immutable amount/date. Test in Task 2.
4. **Double submit or refresh:** no duplicate charges from a single visible submit action; disable and surface pending. Test in Task 2.
5. **Transfer funding semantics:** budget adjustment does not create member IOU; transfer creates two budget entries but one logical action. Test in Task 2.

## File Structure

- Create `src/pages/Dashboard/transactionModes.ts` for `TransactionEntryMode`, defaults and existing API payload mapping.
- Modify `src/pages/Dashboard/index.tsx` and `src/pages/Dashboard/FormFields.tsx` for the simplified action-first form.
- Modify `src/pages/Dashboard/formHandlers.ts`, `src/pages/Dashboard/helpers.ts`, `src/pages/Dashboard/index.css` for form values/validation and labels.
- Reuse `src/pages/Budget/TransferForm.tsx` rather than adding another transfer implementation.
- Modify `src/AppWrapper.tsx` and `src/components/Sidebar/index.tsx` to name the root action `Add Transaction` (or a `+ New` action in navigation).
- Add `src/pages/Dashboard/transactionModes.test.ts` and extend `src/pages/Dashboard/formHandlers.category.test.ts`.
- Extend `src/e2e/tests/expense-management.spec.ts`, `src/e2e/tests/expense-budget-linking.spec.ts`, `src/e2e/tests/bank-import.spec.ts`.
- Update `docs/codebase-map.md` and `docs/api.md` if public labels/contracts change.

## Task 1: Single action type and clear defaults

**Files:** `src/pages/Dashboard/transactionModes.ts`, `src/pages/Dashboard/transactionModes.test.ts`, `src/pages/Dashboard/helpers.ts`

**Interfaces:** `type TransactionEntryMode = "purchase" | "split_only" | "budget_adjustment" | "transfer"`; `defaultTransactionMode(hasBudget: boolean): TransactionEntryMode`; `toExistingSubmitPayload(values: DashboardFormInput, mode: TransactionEntryMode): DashboardFormData | null`.

- [x] **Step 1: Write failing tests** for purchase default with budget, split-only default without budget, budget-credit and budget-debit mapping, zero debt impact for funding, and a transfer that does not call the expense API.
- [x] **Step 2: Run** `yarn test --watchAll=false --runInBand src/pages/Dashboard/transactionModes.test.ts`; confirm tests fail before the mapping exists.
- [x] **Step 3: Implement** mode-specific form defaults and pure mapping. Do not change the existing `DashboardSubmitRequest` contract; a purchase emits `expense + budget` in the same request, split-only emits `expense` only, and budget adjustment emits `budget` only.
- [x] **Step 4: Re-run** the focused test and `yarn lint`; verify default percentages/currencies follow the existing group settings.
- [x] **Step 5: Commit** `refactor: model transaction entry modes`.

## Task 2: Purchase-first UI and specialist actions

**Files:** `src/pages/Dashboard/index.tsx`, `src/pages/Dashboard/FormFields.tsx`, `src/pages/Dashboard/formHandlers.ts`, `src/pages/Dashboard/index.css`, `src/pages/Budget/TransferForm.tsx`, `src/e2e/tests/expense-budget-linking.spec.ts`

**Interfaces:** `Dashboard` remains the existing route component; submit continues via `useDashboardSubmit`; transfer delegates to the existing transfer form and endpoint.

- [x] **Step 1: Add failing UI/E2E assertions** for purchase title, a selected budget, optional category, payer/splits, one submit, a collapsed `Other actions` selector, an adjustment credit, and a paired transfer. Verify the normal form has no `Add Expense`/`Update Budget` checkboxes.
- [x] **Step 2: Run** the focused frontend/E2E tests and verify the current checkbox UX fails them.
- [x] **Step 3: Render** the common Purchase fields first: description, amount, currency, budget, paid by, split percentages, optional category. Put split-only and budget adjustments under explicit mode selection. Reuse `TransferForm` for transfer mode. Preserve the single mutation and validation errors for each action.
- [x] **Step 4: Run** desktop/mobile Playwright and `yarn test --watchAll=false --runInBand`; confirm one purchase creates only one linked pair and preserves balances.
- [x] **Step 5: Commit** `feat: simplify transaction entry`.

## Task 3: Bank review and navigation compatibility

**Files:** `src/pages/Dashboard/index.tsx`, `src/pages/BankImport/TransactionReview.tsx`, `src/AppWrapper.tsx`, `src/components/Sidebar/index.tsx`, `src/e2e/tests/bank-import.spec.ts`, `src/e2e/tests/bills.spec.ts`

**Interfaces:** Existing `/bank-import/transactions/:id/add?mode=expense|budget|both` links are mapped to the corresponding existing payload/side availability; no backend protocol change.

- [x] **Step 1: Add failing cases** for bank records already linked on one side, pending bank transactions, manual-only budget association, and routes reopened from browser history.
- [x] **Step 2: Run** focused bank review and bills tests to observe old routing differences.
- [x] **Step 3: Add** an adapter from legacy bank modes to the new form modes, retaining reviewed bank values and conflict guards. Rename the navigation CTA without changing the underlying backend endpoints. Preserve focus, error and success states on mobile.
- [x] **Step 4: Run** E2E tests for bank import, bills and expense management; run frontend lint/build.
- [x] **Step 5: Commit** `fix: retain bank entry compatibility` and update docs.

## Rollout and stopping point

This PR changes entry **presentation**, not accounting. It can ship without the unified Transactions list; when both are present, the submit success action links to the new canonical row. Do not force a migration of historic records or scheduled jobs.
