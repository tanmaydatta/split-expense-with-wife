# Optional transaction categories

Categories describe purchases; budgets track money set aside. Categories have stable group-scoped IDs, separate from budget pots. Defaults: Groceries, Eating out, Transport, Housing, Utilities, Shopping, Health, Entertainment, Income, Other. Uncategorised is a nullable choice.

## Foundation behavior

This layer ships disabled (`CATEGORIES_ENABLED=false`). The dependent UI/AI layer provides availability-gated activation. Disabled or unmigrated installations preserve financial flows. Historical records are never backfilled or silently recategorised.

New records resolve manual choice (including clear), recurring default, explicit group merchant/description rule, normalized provider hint when available, then Uncategorised. AI follows in the dependent layer. Linked components share explicit category edits atomically, bounded to 1,000 live records with optimistic versions. Conflicting saved choices require an explicit choice when confirming a bank link; stale requests roll back the bank claim and financial association. Pending provisional choices never edit shared categories. Disconnect retains categories on confirmed records.

New recurring bill pairs reuse a live counterpart category; otherwise the expense default wins before the budget default. Publication rereads the saved category, preserving a concurrent manual clear. Historical cron pairing preserves independently saved manual values even when they differ, without failing financial execution; the dependent expanded editor exposes explicit alignment. Current group ownership is checked for peer scheduled actions and live financial records.

Archive preserves saved labels and historical filters, while new selectors use active categories. Explicit rule creation requires consent explaining that the text applies to the group. Raw private feed descriptions are never saved as rules automatically. Merchant rules match exactly; description rules match the chosen substring. Limits: 32 active categories, 100 rules per group. Bulk record enrichment uses bounded queries.

## API

Authenticated current-group GET/POST `categories`; POST `record-category` accepts `{kind,id,categoryId,version}`. Composite category/group foreign keys protect ownership. Financial list requests accept optional `categoryId`; `uncategorised` includes old records without sidecars and manual clears. Payload category fields are additive and optional.

## Manual rollout and rollback

Deploy does not run migrations. An operator must review and apply 0031 to each exact environment before feature activation:

```sh
cd cf-worker
npx wrangler d1 migrations apply splitexpense-dev -e dev --remote
npx wrangler d1 migrations apply splitexpense -e prod --remote
```

Production migration and release require separate explicit approval. Confirm the target binding before running a command. 0031 adds category/rule sidecars and indexes only; ledger tables and historical records are unchanged. Default taxonomy initialization is lazy and conflict-safe.

Before rollout, record the current canonical production Worker version and take the existing release-process D1 backup. Retain that version ID with the release notes.

Rollback: persist `CATEGORIES_ENABLED=false` and the dependent AI flag false, deploy the previous Worker/UI, and retain sidecars. Do not drop saved category assignments. Older Workers ignore sidecars. Re-enable after schema and feature verification. For immediate code rollback to a recorded known-good canonical Worker version:

```sh
cd cf-worker
npx wrangler rollback <known-good-version-id> --name splitexpense --env=''
```

The empty environment deliberately targets the canonical `splitexpense` Worker rather than an environment-suffixed Worker. Verify public health/auth boundaries and active flags afterwards. Do not use D1 Time Travel or restore the financial database solely for a category code/metadata issue; retain the sidecars and ledger.

## Verification

Focused synthetic backend tests cover disabled/missing schema, stable defaults, group ownership, archive labels, rule consent, many-to-many manual clear, concurrent/stale edits, bank conflict resolution/pending isolation, atomic bank pairs with metadata/splits/budget-total readback, and both recurring execution orders with manual clear between planning/publication. Browser category evidence belongs to the dependent UI layer. No private bank access or production migration occurred.
