# Household category backfill

The maintenance CLI categorises existing expense and budget records in one explicitly named household. It does not change amounts, splits, balances, bank sources or links. There is no all-groups mode, API endpoint or migration.

## Selection and privacy

Linked components are evaluated once. Saved manual choices, including an explicit Uncategorised choice, are protected. Existing scheduled, rule, linked, provider and AI categories are preserved. Only missing assignments and automatic Uncategorised assignments are eligible. Different saved choices or recurring defaults are reported as conflicts and skipped.

A reliable successful recurring history record supplies its saved default before the current action default. The history and action owners must still belong to this household. Records without reliable history are counted separately; descriptions and names are never used to guess recurring identity. Historical ledger descriptions do not provide a normalized merchant, so merchant rules are not inferred. Description rules precede the released AI policy. AI receives only the bounded shared ledger description and fixed allowed category criteria, with the same timeout and abstention limits documented in [AI verification](testing/category-ai.md).

Preview reads financial descriptions ephemerally. Its manifest contains record IDs, category labels, source/version snapshots and description hashes, but no raw descriptions, amounts or bank data. It is written with mode 0600. Keep it in the ignored `.category-backfill/` directory and do not attach it to a public PR.

## Runbook

Use a token with the narrowly required D1 read/write, Worker deployment read and Workers AI inference permissions. Supply `CF_ACCOUNT_ID` and `CF_API_TOKEN` through the environment; never put them in command arguments or logs. Confirm the exact household ID through minimal group/member metadata, then confirm migration 0031, initialized categories, and the active Worker version. The script checks the migration and active version before loading ledger descriptions, and refuses to initialize categories during read-only preview.

```sh
node scripts/backfill-household-categories.mjs preview \
  --group EXACT_HOUSEHOLD_ID --environment prod --deployment ACTIVE_WORKER_VERSION \
  --file .category-backfill/household.json --batch 20
```

Each invocation processes at most 20 new components by default (maximum 100), with at most 10 candidate pages of 100 per invocation and a component cap of 1000. Snapshot loading, recurring metadata and classification run with at most four concurrent requests. Candidate windows are deduplicated by their stable linked membership before classification, and completed plans retain discovery order. A cursor advances only after its full window has completed; partial failures leave the prior private checkpoint intact. A classifier timeout retains its existing decision and holds its slot until the remote request settles, preventing hidden extra concurrent requests. Apply remains sequential. If a live link edit creates partially overlapping components during discovery, the preview aborts safely and requires a fresh preview rather than guessing how to merge checkpoints. To continue, repeat with `--resume true`. The manifest records its discovery cursor and processed members so linked components are not classified twice. Resume requires the same household, environment, database, active Worker version and exact classifier/planner source fingerprint.

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
