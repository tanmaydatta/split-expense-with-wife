# Transfer between budgets

Open **Budget → Transfer between budgets**, choose different source and destination household budgets, then enter an amount, currency, UTC date and optional note. At least two active budgets are needed. A transfer records one debit in the source and one equal credit in the destination, with both budget totals updated atomically. Existing negative balances are allowed; this feature does not enforce available funds.

Amounts must be finite, positive, at most 1,000,000,000 and represent whole minor units (at most two decimal places). Both entries use the same supported currency; no conversion occurs. Dates must be valid UTC dates today or earlier, stored at `00:00:00` in the existing SQLite UTC timestamp format. Future transfers are not scheduled. Notes are limited to 200 characters. The form locks while saving and after success; **Record another transfer** starts a new intent.

## Identity, retries and deletion

`POST /budget-transfer` accepts `{requestId, sourceBudgetId, destinationBudgetId, amount, currency, date, note?}`. Authentication and completed signup are required. Both budgets must be active in the actor's current household and distinct. Membership and active budgets are rechecked within the same atomic creation statement. No client household identifier is accepted.

A durable unique `(group_id, actor_id, request_id)` identifies the intent. The form retains the same identity after an ambiguous network failure when the payload is unchanged. Retrying the same payload returns the original pair; changing it under the same identity returns 409. Retrying an already deleted transfer returns its tombstone and never recreates entries. A new generated header identity gates entry creation and total updates, so competing requests cannot double-apply balances. Header, entries, entry identity mappings and total deltas commit in one D1 batch or all roll back.

Each loaded desktop row/mobile card identifies **Internal transfer to/from [other budget]** instead of presenting it as a missing purchase category. Details link to the counterpart entry. Metadata comes from bounded entry identity lookups, not one request per row. Budget category changes do not change transfer identity.

Deletion requires `confirmTransferDeletion: true`; older clients receive 409 asking them to refresh and confirm both entries, before any write. Deleting either entry confirms that **both entries** will be removed and both budget totals reversed. Both sides and the header are soft-deleted in one batch. A fresh unique operation token owns the deletion claim; repeated or concurrent deletes from opposite sides reverse totals once, even within the same second. A failure rolls back the claim, both entries and totals so a retry remains safe. Membership is rechecked inside the claim statement. Deleting from an active budget also cleans up its archived counterpart. Archiving a budget in Settings retains its entries and transfer metadata; the remaining active side still names the archived counterpart and stays excluded from spending insights.

Transfer entries cannot link to expenses or bank imports. Candidate searches omit them; indexed database triggers reject forged insert/update associations. Transfer deletion never follows expense links or changes unrelated expenses, member balances or private bank records. The expense deletion path also refuses a transfer target if inconsistent historical associations exist. Transfer pair identity does not use `expense_budget_links`.

## Spending insights

Explicit transfer-entry identity **always excludes transfers** from included spending, credits, net movement, entry counts, category percentages and monthly stacks, and the existing Monthly Budget Breakdown spending/averages. This is independent of category names, category assignments, saved preferences and temporary filters. An Uncategorised or relabelled transfer remains excluded.

The existing excluded-activity notice includes **Internal budget transfers**, and expandable amounts report transfer entry counts, debit magnitudes and credits separately. Counts refer to entries: All budgets usually sees two sides; an individual budget sees one. Net excluded movement is credits minus debits, so a complete same-currency pair nets zero. Each currency stays separate. Deleted/future/out-of-range entries and archived budget scope follow the existing report rules. Transfer entries still count toward the 5,000-record cap before exclusions.

## Bounds and measured cost

Migration **0035_budget_transfers.sql** adds two metadata tables, entry PK/transfer-role uniqueness, household/actor/request uniqueness, foreign keys and four bank/expense link-protection triggers. It performs no historical financial writes. Drizzle declarations match. No historical backfill or AI call is needed.

The existing Insights date/record/budget bounds and cumulative **40,000 rows-read** fail-closed meter remain in place. Transfer enrichment is an entry-PK lookup after the materialized report limit. Local fixtures apply all actual production migrations including 0035 and check EXPLAIN:

| Synthetic fixture | Actual rows read |
| --- | ---: |
| 5,000 ordinary categorised entries | 20,007 |
| Same plus 100,000 foreign/older entries | 20,007 |
| 5,000 explicit transfer entries | 25,007 |
| Same plus 100,000 same-household transfer headers / 200,000 mappings | 25,007 |
| 25-entry metadata page with that history | 125 |
| 55,000 in-range records, explicit cap rejection | 17,505 |
| Existing monthly spending query with transfer-history fixture | 5,002 |

EXPLAIN uses entry PK, header PK, unique transfer/role and budget PK probes. There is no transfer-table/ledger scan or global ordering sort. Ordinary bank insertion/linking and expense linking still work; transfer link attempts fail. The regression fixture is already part of Worker CI.

## Release and safe disable

Migrations are manual. **Development 0035 was applied and metadata verified before pushing**, after confirming it was the sole pending migration. Production 0035 is **not applied by this PR**: obtain explicit user approval for the migration and merge, confirm it is the sole pending migration on production D1 `56f19864-f964-4c28-b176-001047d58e00`, apply it before merging, then verify only schema/migration metadata. Production is `budget.wastd.dev`; development D1 is `a721ee7e-a5ee-452d-88d4-ebb97a1f0786`. Do not reapply 0034. No secret or new service binding is needed.

Creation requires the plain environment variable `BUDGET_TRANSFERS_ENABLED` to equal exactly `"true"`; absent or `"false"` fails closed. The committed Wrangler vars enable it for development and production. To disable creation safely, change **only** that variable to `"false"` in the relevant `[env.dev.vars]` / `[env.prod.vars]` section and release the same transfer-aware Worker through the normal reviewed pipeline. An emergency dashboard plain-variable change can disable creation after saving and deploying that configuration; mirror it in Wrangler before the next deployment. Do not create a secret with the same name. Pair deletion, metadata reads, link guards and Insights exclusion stay active while creation is disabled; tests cover this.

**Never roll back to a pre-transfer-aware backend after transfers exist.** Such code could delete only one side or count a transfer as spending. Roll back UI only, or disable creation while retaining transfer-aware reads/deletion/exclusion and the additive tables/triggers. Do not drop metadata, restore financial data or remove link protections as a code rollback.

After an approved merge, verify the automatic build, active version, public health and unauthenticated endpoint rejection. Do not create a real transfer or request financial reports as a deployment check.

## Verification and screenshots

Real local API/D1 tests cover atomic balances, concurrent duplicate requests, mismatched requests, create/delete failure rollback, foreign group access, validation, missing creation switch, membership changes immediately before the batch, opposite-side concurrent deletes, archived counterpart deletion, tombstone retries, unrelated expense preservation, bank candidates and category-independent Insights exclusion. Full Worker tests include existing bank/expense paths. Frontend coverage verifies retry identity, form fields and counterpart detail cache invalidation. Built-frontend synthetic browser tests prime both budgets, create from A, inspect the counterpart, switch to B to see the credit, delete from B, then return to A and verify the debit is absent. Browser API responses are synthetic; backend API/D1 verification is separate.

```sh
yarn workspace split-expense-worker test
yarn workspace split-expense-worker lint
yarn test --watchAll=false --runInBand
yarn lint
node --test scripts/tests/category-insights-query-cost.test.mjs
REACT_APP_AUTH_BASE_URL=http://127.0.0.1:4326 REACT_APP_API_BASE_URL=/.netlify/functions yarn build
yarn playwright test --config playwright.bulk-categories.config.ts budget-transfers.spec.ts
```

Synthetic desktop/mobile screenshots are embedded in the PR and personally reviewed: [desktop form](previews/budget-transfers/desktop-form.png), [desktop entry](previews/budget-transfers/desktop-entries.png), [desktop paired deletion](previews/budget-transfers/desktop-delete.png), [mobile form](previews/budget-transfers/mobile-form.png), [mobile entry](previews/budget-transfers/mobile-entries.png), [mobile destination credit](previews/budget-transfers/mobile-destination.png), [mobile paired deletion](previews/budget-transfers/mobile-delete.png).

Final local evidence: the full Worker suite passed **419 tests, 8 skipped** before the final compatibility/monthly regressions; the final focused transfer/Budget/Insights run passed **64 tests** including all 13 transfer cases. Full frontend: **79 passed, 2 existing skipped**. Both lint/type gates, production build, actual-migrations cost fixture and both desktop/mobile browser cases passed. The mobile form capture uses a taller viewport at the same 390px width to show the entire form; interactive mobile checks use 390×844.
