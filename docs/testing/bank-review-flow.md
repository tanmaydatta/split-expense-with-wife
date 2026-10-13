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
