# Bank review flow verification

Verified locally on 2026-10-13 with Node 22.18.0 and synthetic data only.

## Backend

- Latest focused review + Lunch Flow run: **22/22 passed** after the aggregate
  anonymous-pending cap correction.
- Broader focused run: **36/36 passed** across review, Lunch Flow, dashboard,
  provider foundation and background sync tests.
- Worker TypeScript and full Worker Biome lint passed.
- `node scripts/verify-bank-migrations.mjs` passed for additive 0028–0030, named
  old-Worker writes, retained confirmed expense links and pending-account cascade.

Covered direct independent budget matching, signed credits/debits, adding a missing
association, compatible historic multi-links versus conflicting new pairs, owner
privacy, stale/replayed claims, provisional save without ledger changes, stable-ID
posting confirmation, anonymous multiplicity and vanished-source history, draft
cancellation/reactivation/version races, failed staging/publication retaining the
old pending generation, source-tampered form saves, bank-derived dates, duplicate
creation protection and rollback when an existing matched side was deleted.

Reproduce from `cf-worker`:

```sh
vitest run src/tests/bank-review-flow.test.ts src/tests/lunch-flow.test.ts --no-file-parallelism
```

## UI and previews

UI TypeScript, full ESLint and the production UI build passed. The bank-prefilled
form was observed in a local browser: description **Weekly groceries**, amount
**42**, **GBP**, initial payer **Alex**, group splits **50/50** and Household budget.
A mocked save carried bank source/version, expense **42**, budget debit **-42**,
owner payer and 50/50 splits; it returned to review. Amount/currency/date/direction
stay fixed; payer, description, splits and budget use the normal form controls.

These desktop/mobile screenshots use synthetic HTTP fixtures with invented account,
merchant, user and record names. They are visual previews, not live-bank E2E evidence.
A stale local PWA cache was cleared before recapturing; DOM prefill was asserted
before the final form screenshots. No actual financial data or credentials were
read, captured or committed.

- [List desktop](../previews/bank-review-flow/list-desktop.png)
- [List mobile](../previews/bank-review-flow/list-mobile.png)
- [Review desktop](../previews/bank-review-flow/review-desktop.png)
- [Review mobile](../previews/bank-review-flow/review-mobile.png)
- [Existing Add form desktop](../previews/bank-review-flow/form-desktop.png)
- [Existing Add form mobile](../previews/bank-review-flow/form-mobile.png)

New persistent browser E2E expansion was deferred at the user's request. Production
migration, deployment and real-bank interactions require their separate release
step; these local checks do not claim production validation.

## Shared cards and embedded sources (2026-10-13)

The new focused Worker review suite passes **14/14** and UI card DOM suite passes
**4/4**. Coverage checks real participant rows and metadata, current-user positive
and negative balances, unchanged ordinary BudgetCard navigation/delete actions,
selection without navigation/deletion/expansion fetches, expanded-only source
mounting, and owner-only pending source summaries. Frontend and Worker types,
frontend ESLint and changed-handler Biome lint pass. The independent UI build uses
explicit local auth/API URLs; no shared build symlink is used.

`scripts/capture-bank-review.cjs` runs Playwright against a separately served local
build. All session, bank, candidate and detail responses are synthetic fixtures;
external requests are aborted and service workers blocked. It checks horizontal
overflow and a pending first-save payload that omits a null draft version. No live
bank access, synchronization or ledger writes occur. This is focused browser smoke,
not full financial E2E coverage.

New evidence is in `docs/previews/bank-review-polish`. Each desktop (1440×1080) and
mobile (390×844) view has an untouched top `-viewport.png` and supplemental
`-full.png` capture. The full capture temporarily exposes the app shell’s internal
scroll height and restores all styles afterward; it does not change content widths.
Review and bank Add also have untouched `-lower-viewport.png` captures for selected
records and actions. The harness verifies actual checkbox center alignment, full
form width and two mobile split columns before capturing:

- [List](../previews/bank-review-polish/list-mobile-full.png)
- [Connection settings](../previews/bank-review-polish/settings-mobile-full.png)
- [Selected expense and budget cards](../previews/bank-review-polish/review-mobile-full.png)
- [Expanded expense bank source](../previews/bank-review-polish/expanded-expense-mobile-full.png)
- [Expanded budget bank source](../previews/bank-review-polish/expanded-budget-mobile-full.png)
- [Bank Add form](../previews/bank-review-polish/form-mobile-full.png)
- [Ordinary Dashboard comparison](../previews/bank-review-polish/dashboard-mobile-full.png)

Visual approval is performed by the coordinating agent after inspecting these
screenshots, before the UI PR is pushed. Production release remains a separate
approval step.
