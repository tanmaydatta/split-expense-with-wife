# Optional transaction categories

Categories describe purchases; budgets track money set aside. Categories have stable group-scoped IDs, separate from budget pots. Defaults: Groceries, Eating out, Transport, Housing, Utilities, Shopping, Health, Entertainment, Income, Other. Uncategorised is a nullable choice.

## Foundation behavior

The foundation shipped disabled.0031 was explicitly approved and applied to dev and production on 2026-10-14; categorization remains disabled in the deployed foundation. The dependent UI/AI configuration enables both flags only with schema-availability gating. Disabled or unmigrated installations preserve financial flows. Historical records are never backfilled or silently recategorised.

New records resolve manual choice (including clear), recurring default, explicit group merchant/description rule, normalized provider hint when available, then Uncategorised. The dependent runtime uses evaluated Workers AI after stronger sources, with error/timeout fallback. Current adapters have no persisted normalized provider hints. Linked components share explicit category edits atomically, bounded to 1, 000 live records with optimistic versions. Conflicting saved choices require an explicit choice when confirming a bank link; stale requests roll back the bank claim and financial association. Pending provisional choices never edit shared categories. Disconnect retains categories on confirmed records.

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

## UI/runtime layer

Add/review forms offer Automatic or an explicit category/Uncategorised. Automatic resolves on the server when saved; matching existing records retains their choices unless the member explicitly changes them. Expanded record editors align linked categories and expose historical conflicts. Expense/Budget filters include archived categories for saved records. Settings manages category names/archive and explicit shared rules; recurring forms preserve saved defaults. See [synthetic AI evaluation](testing/category-ai.md).

## Bulk auto-categorisation

Budget and Expenses lists offer checkboxes, **Select this page**, a selected count and **Auto-categorise**. Selection includes the currently loaded entries, up to 100 per job. Active work continues in Cloudflare Workflows when you navigate away; returning to either list restores your latest job. Status updates every two seconds while the page is visible and a job is active. Completed changes update loaded rows using category versions, preserving later manual edits. Entries that no longer match the active category filter leave the visible list; other filters remain set.

A selected record includes its active linked expense/budget component. Components are deduplicated and receive a single category decision. Saved non-null categories and manual Uncategorised clears are preserved; automatic Uncategorised or missing metadata can be filled. Conflicting saved choices or recurring defaults abstain. Rules precede AI; each logical component uses at most one AI attempt, with the existing strict confidence, margin and timeout. Deterministic recurring entries load history snapshots and current defaults using indexed ID lookups.

Jobs accept at most 100 roots, each component at most 1,000 records, and read at most 2,000 component records in total. Processing measures actual D1 `meta.rows_read`, with a 50,000-row allowance. Before every processing query the remaining allowance is durably reserved; missing read metadata or an ambiguous crash consumes the reservation and prevents further work. D1 reports cost after execution, so one already-running indexed query can exceed the remaining allowance; subsequent reads and writes stop. Metadata/status queries use bounded indexed job/item lookups. No household financial scans are performed.

One active job per household and per user is enforced in D1, with at least 30 seconds between new household jobs. Selection and request identity are durable; retrying the same request reuses its job. Failed dispatch is visible and the same request can retry. Component membership is durably reserved before inference, so a selected linked sibling stays deduplicated even if publishing the completed decision fails. The resolved plan is durably stored before a separate apply step. An interrupted inference reservation is reported failed instead of issuing another AI call. This avoids repeat inference after an ambiguous crash; it does not claim exactly-once delivery to an external AI service. Category writes are idempotent and compare snapshot descriptions, category versions and component membership atomically. The initiator must still exist, have completed signup and belong to the job household at the write itself.

A five-minute inactivity lease releases abandoned capacity on the next authenticated start/status request. Fatal Workflow errors mark unfinished items and the job failed. A completed job may contain failed or skipped selections; counts refer to selected roots, while the updated-record count includes eligible linked siblings. Only category metadata and job sidecars are written; amounts, balances and financial links are unchanged.

### Job API and rollout

`GET /.netlify/functions/category-jobs` restores the initiating user's latest job in their current household; `?id=...` reads a specific owned job. `POST` accepts `{requestId, records:[{kind:"expense"|"budget",id}]}` and returns HTTP 202 with the durable job. Request IDs must be 8–100 letters, digits, underscores or hyphens. Reusing a request ID with another selection returns 409; active/rate guards return 429. Status and completed category metadata are private to the initiator, even within a shared household.

Apply additive migration **0033_category_jobs.sql** to development before pushing the PR, and production before merging. Configure `CATEGORY_JOBS_WORKFLOW` with `CategoryJobsWorkflow` (development workflow `category-jobs-dev`, production `category-jobs`). Existing category/AI rollout flags continue to apply. Before rollback, terminate active category-jobs Workflow instances (or have an authorized operator mark their jobs failed) before reverting the Worker/UI. Running Workflow instances can retain their original Worker version, so changing flags in a new deployment alone does not cancel their category writes. Retain the additive job tables. Do not run the historical backfill tool for this feature.

### Authentication audit

Category taxonomy/rule management and explicit record-category edits use `withAuth`, refreshed database household membership, and group-scoped category/component SQL. Bulk start/status uses `withAuthLite`, current database user/signup membership, owner+household job predicates and an additional membership guard inside the final category SQL statement.

Private bank inbox, detail, links, provisional drafts and review endpoints require authenticated sessions and source ownership. Connection/account management uses `withAuthLite` and `bank_connections.user_id`; ledger associations additionally validate the shared household. The public exceptions are intentional: `/health` exposes static readiness; `/auth/*` runs the authentication provider/allowlist flow; `/plaid/webhook` verifies ES256 signature, key identity, a five-minute timestamp window and the exact body's SHA-256 before dispatch; `/test/seed` only registers when an environment seed secret exists, accepts POST and validates the per-request secret. Static application assets and OPTIONS preflight are public. This audit does not assume production seed-secret absence.

Local verification covers unauthenticated GET/POST, same-household non-owner job status, inaccessible roots, duplicate requests/siblings, dispatch ambiguity/retry, stale leases, read limits, concurrent clears and an actor move at the final SQL write. A separate integration suite runs the actual local Workflow with categories enabled, AI disabled and a synthetic description rule:

```sh
yarn workspace split-expense-worker exec vitest run --config vitest.category-workflow.config.ts
```

See [bulk verification and synthetic screenshots](testing/bulk-categories.md) for reproducible local checks.

## Category labels on budget entries

Loaded Budget desktop rows show the category icon and name below the description, and mobile cards show the same shared badge immediately. Expanding a row or opening details is unnecessary. Built-in categories use decorative icons; custom and archived custom categories use a generic tag while retaining their saved name. Missing or manually cleared metadata displays Uncategorised. Icons are hidden from assistive technology; the category name remains readable text. The shared badge also keeps other category surfaces visually consistent.

The display reuses category metadata already returned by the budget list plus the shared cached category taxonomy. It adds no per-entry detail requests, financial queries or classification calls.

See [loaded budget display verification](testing/budget-category-badges.md) for synthetic desktop/mobile screenshots and regression coverage.

## Shared expense insights

[Category insights](category-insights.md) shows positive shared spending by category and month, with adjustments separate, one currency at a time. Category links open the existing filtered Expenses page. Budget copies and private bank activity are excluded; bounded range/record limits prevent partial or unbounded reports.

Categories also have an explicit **Exclude from spending insights** preference in Settings, off by default. It changes category insight totals only and never infers transfers from names or edits financial records. Insights disclose excluded activity separately and support rolling UTC date presets; see the [insights guide](category-insights.md) for exact boundaries and migration 0034 rollout order.
