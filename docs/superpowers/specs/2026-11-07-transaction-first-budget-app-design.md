# Transaction-first household budgeting app - design specification

**Date:** 2026-11-07  
**Status:** Agreed product direction; implementation plans remain subject to review  
**Repository:** `tanmaydatta/split-expense-with-wife`  
**Scope:** User experience and narrow additive APIs/metadata; retain the existing Cloudflare Workers + D1 financial engine.

## Goal

Give the household one coherent way to record, find, understand, and analyse financial activity, borrowing the straightforward experience of Actual Budget while retaining the app's unique split/IOU capabilities.

The redesign has **five independently deliverable changes**, each with its own implementation plan:

1. Unified transaction history and canonical transaction read model.
2. One intuitive transaction-entry experience.
3. Budget overview and budget-detail experience.
4. Reports and categories consolidation.
5. Reliable, inexpensive, asynchronous AI categorisation with passive correction learning.

## Decisions confirmed in conversation

- **Budgets** are rolling money pools such as **House, Your Personal, Wife's Personal, Vacation**. Budget balances may be positive or negative; no silent forgiveness of deficits.
- **Categories** such as Groceries, Eating out, Shopping, Transport, and Clothing (if created) are for **spending breakdowns only**. They **do not** have monthly limits or separate envelopes.
- Every ordinary purchase should appear **once** in the user-facing Transactions list, regardless of its linked expense and budget records.
- Purchases remain capable of affecting both budget balances **and** spouse-to-spouse settlement balances. Do not remove paid-by, shares, net IOU, or existing bill/bank workflows.
- Budget funding and internal transfers are visible financial activity, but paired budget-transfer entries must appear as one transfer rather than two unrelated lines.
- Monthly Budget and Budget Insights should stop feeling like separate apps. Put their useful views within Budgets and Reports.
- Manually correcting a purchase's category involves **no extra form or confirmation**; learning happens automatically in the background.
- Use Cloudflare-hosted `@cf/openai/gpt-oss-120b`, an improved prompt, and an inference design targeting **less than US$1 in model charges for 200 transactions/month**.
- **No model accuracy benchmark** is required. Functional tests, provider-compatibility smoke tests and cost guards still are.
- New transactions must save **before** AI finishes. UI can briefly show **Categorising...**. On definitive failure, show **Uncategorised**; ledger save must never fail because of AI.

## Existing implementation to preserve

The `main` branch inspected on 2026-11-07 already has:

- `transactions`, `transaction_users`, and `user_balances` for expenses and splits.
- `group_budgets`, `budget_entries`, and `budget_totals` for rolling budget movements.
- `expense_budget_links` for linking an expense to its corresponding budget movement. The dashboard currently creates linked pairs atomically through `POST /dashboard_submit`.
- `budget_transfers` and `budget_transfer_entries` for one logical transfer represented by a debit/credit pair.
- Separate list endpoints `/transactions_list` and `/budget_list`, separate `/expenses` and `/budget` pages, plus `/monthly-budget` and `/category-insights`.
- Optional taxonomy and `record_categories` sidecars, rule matching, and currently inline Cloudflare Clef Flash classification. Manual category edits propagate through linked financial records.
- Bank import/review, scheduled actions, shared bills, multi-currency records, and soft deletes.

**Do not replace these financial tables or recalculate the IOU engine as part of the redesign.** A unified *read model* is preferred to a rewritten ledger.

## User-facing model

### Transactions

A chronological ledger lists purchases, standalone budget adjustments, funding, and transfers. Linked expense + budget records become **one** displayed row. Old unlinked records remain visible. A row can show budget, category, payer, split summary, bank match, and amount. Detail view explains effects without presenting linked sibling records as duplicate transactions.

No double-counting in list counts, spending summaries, category reports, or exports. Avoid turning a budget credit or internal transfer into spending.

### Add Transaction

Default action is **Purchase**, with description, amount, currency, budget, who paid, share percentages, and optional/automatic spending category. A user may still choose **Split-only expense** without affecting a budget. Explicit **Budget adjustment/funding** and **Transfer between budgets** paths preserve existing special-case semantics. Advanced/legacy options should not complicate the normal purchase flow.

### Budgets

Overview shows all active budgets and their available balances, including negatives. Each budget detail has recent activity, category breakdown, funding/adjustments and monthly trends. A budget transfer is easy to find but is not categorised as spending.

### Reports

A single Reports destination exposes spending by category **inside selected budgets**, month-by-month trends, and filters by period/currency/budget/category. Preserve exclusions, category drilldown, and existing category-insights limits. Categories stay editable in Settings; no budgets or limits per spending category.

### AI categorisation

The order of precedence is: explicit manual choice; saved recurring default; explicit user rule; reliable exact correction memory; provider category hint; GPT inference; Uncategorised. Where an earlier integration requires stricter precedence (for example a bank-review manual conflict), keep that protection.

AI runs after the financial transaction is safely committed. A durable idempotent job is preferable to a fire-and-forget request. An AI response must never overwrite a newer manual correction. The same logical linked expense/budget pair must be classified only once, and its category must stay aligned.

When a user saves a manual correction, automatically remember a sufficiently specific normalised merchant+description key, scoped to the household, without any UI change. Do **not** learn broad merchant rules from mixed retailers (Tesco, Amazon, M&S). Conflicting corrections for the same key disable automatic reuse rather than guessing.

## Design and non-goals

- No replacement of the existing D1 accounting schema, split algorithms, soft-delete semantics, or bank import permissions.
- No migration to actual bank-account-only accounting or requirement that household members use a joint card. The separate joint-account proposal is **not** required for this app redesign.
- No new category-level budget caps, envelopes, budget contribution split UI, or automatically generated real-bank transfers.
- No retroactive reinterpretation of old standalone expenses/budget entries using fuzzy matching.
- No mandatory LLM benchmarking or AI-driven reclassification of historical manual labels.
- Keep old detail URLs and old API contracts working during rollout; add compatibility redirects only where safe.
- Prefer small additive APIs, isolated views/components, and optional feature flags for staged rollout.

## Cross-cutting acceptance tests

1. A linked GBP purchase changes one budget and one split ledger, appears once in Transactions, and counts once in spending.
2. A budget-only credit appears once but does not count as spending or an inter-spouse debt.
3. A budget transfer appears once, changes two budget balances by equal/opposite amounts, and is excluded from spending analytics.
4. A budget balance of -GBP21.18 persists and is carried into the following month's available amount.
5. A House -> Groceries purchase appears in the House category breakdown; Groceries has **no** spending limit.
6. Manually changing a category takes one ordinary edit, updates linked records, and is not undone by late AI results.
7. AI timeout, failure, cancellation, duplicate delivery, or paid quota exhaustion never changes the purchase amount, split, budget total, or saved manual category.
8. Bank activity remains private to the connecting owner until explicitly reviewed/shared, as in today's implementation.
9. Legacy, standalone, archived, mixed-currency and deleted records remain correctly represented.
10. Changes pass existing Cloudflare Worker tests, frontend tests, and targeted desktop/mobile Playwright flows before production rollout.

## Implementation links

See `docs/superpowers/plans/2026-11-07-budget-app-redesign-roadmap.md` and the five independently executable plans linked there.
