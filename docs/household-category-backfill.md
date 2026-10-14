# Household category backfill

The maintenance CLI categorises existing expense and budget records in one explicitly named household. It does not change amounts, splits, balances, bank sources or links. There is no all-groups mode or API endpoint. Migration 0032 adds covering indexes only; it changes no financial or category values.

## Selection and privacy

Linked components are evaluated once. Saved manual choices, including an explicit Uncategorised choice, are protected. Existing scheduled, rule, linked, provider and AI categories are preserved. Only missing assignments and automatic Uncategorised assignments are eligible. Different saved choices or recurring defaults are reported as conflicts and skipped.

A reliable successful recurring history record supplies its saved default before the current action default. The history and action owners must still belong to this household. Records without reliable history are counted separately; descriptions and names are never used to guess recurring identity. Historical ledger descriptions do not provide a normalized merchant, so merchant rules are not inferred. Description rules precede the released AI policy. AI receives only the bounded shared ledger description and fixed allowed category criteria, with the same timeout and abstention limits documented in [AI verification](testing/category-ai.md).

Preview reads financial descriptions ephemerally. Its manifest contains record IDs, category labels, source/version snapshots and description hashes, but no raw descriptions, amounts or bank data. It is written with mode 0600. Keep it in the ignored `.category-backfill/` directory and do not attach it to a public PR.

## Runbook

Use a token with the narrowly required D1 read/write, Worker deployment read and Workers AI inference permissions. Supply `CF_ACCOUNT_ID` and `CF_API_TOKEN` through the environment; never put them in command arguments or logs. Confirm the exact household ID through minimal group/member metadata, then confirm migrations 0031 and 0032, initialized categories, and the active Worker version. The script checks the migration and active version before loading ledger descriptions, and refuses to initialize categories during read-only preview.

```sh
node scripts/backfill-household-categories.mjs preview \
  --group EXACT_HOUSEHOLD_ID --environment prod --deployment ACTIVE_WORKER_VERSION \
  --file .category-backfill/household.json --batch 20
```

Each invocation processes at most 20 new components by default (maximum 100), with at most 10 candidate pages of 100 per invocation and a component cap of 1000. Snapshot loading and classification run with at most four concurrent requests. Recurring metadata is loaded once per job through each current household owner’s history index, then persisted as record IDs and category choices only. It is capped at 5000 successful history rows per owner. Discovery is capped at 100 active budget pots, with at most 100 indexed IDs per pot. Unused discovery IDs are retained between cohorts instead of fetching the same page again. Candidate windows are deduplicated by their stable linked membership before classification, and completed plans retain discovery order. A cursor advances only after its full window has completed; partial failures leave the prior private checkpoint intact. A classifier timeout retains its existing decision and holds its slot until the remote request settles, preventing hidden extra concurrent requests. Apply remains sequential. If a live link edit creates partially overlapping components during discovery, the preview aborts safely and requires a fresh preview rather than guessing how to merge checkpoints. To continue, repeat with `--resume true`. The manifest records its discovery cursor and processed members so linked components are not classified twice. Resume requires the same household, environment, database, active Worker version and exact classifier/planner source fingerprint.

Review the aggregate status counts, proposed category labels and component IDs privately. Conflicts, protected clears, oversized components and AI abstentions remain unchanged. Review the manifest's printed SHA-256 digest before applying; do not apply an unreviewed preview.

```sh
node scripts/backfill-household-categories.mjs apply \
  --group EXACT_HOUSEHOLD_ID --environment prod --deployment ACTIVE_WORKER_VERSION \
  --file .category-backfill/household.json --approve-preview REVIEWED_SHA-256
```

Apply rereads each component and checks description hashes, membership, category IDs, sources and versions. It then binds the exact freshly checked descriptions into one atomic category-only SQL statement that repeats these checks, preventing partial updates if edits race publication. Repeating an applied plan is idempotent. Stale plans are skipped; create a new preview rather than overriding a user's later choice. Apply is limited to the manifest's proposed components. A preview batch may be applied before discovery completes, then resumed; already classified records are protected on later previews.

There is no automatic rollback or database Time Travel. If a reviewed automatic assignment needs correction, use the shared record category editor, which preserves category consistency across linked records. Never restore financial tables to undo optional metadata.

## Verification

Eight focused Worker regressions cover linked assignment, financial-table invariance, saved manual values and clear, automatic Uncategorised versions, replay, membership/description races and current-owner recurring history. Two offline CLI cases use synthetic Cloudflare responses to check scope requirements, no preview writes, transpilation/adapter loading, private file mode, resume deduplication and digest rejection. They also assert independent metadata/AI concurrency limits, linked-root deduplication, stable cursor/resume and retained timeout slots. No production historical writes are part of these tests.


## Read-cost incident and safeguards

On 14 October 2026, GraphQL D1 Insights identified 45,949,250 reads across six maintenance query shapes: component 22,894,351; financial snapshot 10,084,100; split snapshot 5,355,042; recurring history 4,515,786; candidate discovery 2,132,308; link snapshot 967,663. Historical category writes were never started. Preview, audit and apply were stopped, and the private evidence was preserved. The old preview cannot be resumed or applied with this implementation because its source fingerprint and schema version differ. Do not rewrite those guards or deployment pins.

The recursive query now walks transaction/budget edge indexes in separate directions. Both raw D1 and Drizzle bank-link consumers use the same definition. Live record lookups start from the bounded component and use record identities. Financial audit SQL lives in `cf-worker/src/utils/category-backfill-audit.ts`; reuse this helper rather than copying snapshot queries. JSON wanted IDs remain outermost through CROSS JOIN, preventing SQLite from scanning all household records once for every wanted ID.

The CLI persists a private `<manifest>.reads.json` meter, containing only query hashes, counts and read totals. Limits are 10000 reads per query and 250000 reads per job across restarts. Concurrent requests reserve their maximum allowance before dispatch and persist in-flight state. Missing read metadata, network errors, oversized responses or an interrupted in-flight request stop further work. A query can exceed its measured limit once before its response is available; the durable stop prevents repeating it. Do not delete or reset a stopped meter to bypass review. Keep one operator process per manifest.

Production-migration Miniflare tests compare 250 and 2500 linked pairs, plus equally many foreign-household records. Current query reads stay constant: component 30, traversal 14; 100 budget candidates 102; 100 expense candidates 100, and the combined100-record financial audit 1200. Old full-migration query costs grew from 2511 to 25011 for a component, 50501 to 505001 for financial snapshots, 25250 to 252500 for splits and 20200 to 247450 for links. History loading grows once with the household’s history size; 100 subsequent component lookups issue zero D1 queries. These are local synthetic measurements, not a claim about live post-release analytics.

### Index rollout and rollback

Inspect pending migrations; only 0032 should follow the already applied 0031. Apply the additive indexes before using this maintenance CLI:

```sh
cd cf-worker
npx wrangler d1 migrations apply splitexpense-dev --env dev --remote
npx wrangler d1 migrations apply splitexpense --env prod --remote
```

The exact targets are dev `a721ee7e-a5ee-452d-88d4-ebb97a1f0786` and production `56f19864-f964-4c28-b176-001047d58e00`. If the exhausted quota rejects the migration, stop and report it; do not repeatedly retry or start maintenance. The normal app traversal fix uses pre-existing indexes and can still deploy. Roll back Worker code to the known-good version using the existing release runbook; leave the additive indexes in place. They are compatible with older Workers. No database restoration or financial rollback is needed.

```sh
node --test scripts/tests/category-query-cost.test.mjs scripts/tests/d1-read-budget.test.mjs scripts/tests/backfill-household-categories.test.mjs
```
