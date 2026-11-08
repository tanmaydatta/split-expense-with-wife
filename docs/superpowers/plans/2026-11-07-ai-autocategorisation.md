# AI Autocategorisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve automatic transaction categorisation while making saves instant, learning silently from corrections, and keeping estimated model charges below US$1 for 200 new transactions per month.

**Architecture:** Replace the inline Clef Flash choice-classifier with Cloudflare Workers AI `@cf/openai/gpt-oss-120b`, strict validated JSON output and a more concrete prompt. Perform inference via a durable, idempotent post-commit workflow; use an additive household-scoped correction-memory table for automatic exact-match learning. Preserve the existing `record_categories`/linked-record propagation and manual edit APIs.

**Tech Stack:** Cloudflare Workers AI, Cloudflare Workflows, D1 SQLite/Drizzle, existing category resolver and API, React/TanStack Query, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-transaction-first-budget-app-design.md`

## Global Constraints

- **Provider/model:** Cloudflare Workers AI binding `CATEGORY_AI`, model `@cf/openai/gpt-oss-120b`.
- **No accuracy benchmark required.** Provider response-format smoke test and deterministic safety/functional tests are still required.
- **Spend target:** less than **US$1 model usage** for **200 classifications/month**; no hidden repeated retries or unlimited background recategorisation.
- New financial records save successfully without waiting for model inference. The UI may show `Categorising...` until completion.
- On definite failure or ambiguous input, the visible result is `Uncategorised`; there is no guess disguised as certainty.
- Manual category edits remain one normal action with **zero extra user input**; only exact/sufficiently specific corrections can be learned implicitly.
- Never apply an AI result after a newer manual edit/version change; do not let category updates mutate amount, payer/splits, `user_balances` or `budget_totals`.
- Preserve existing group authorization, privacy and bank review permissions. Only send bounded merchant, description and allowed category names/IDs to the model; no account data or member IDs.
- Keep category source provenance (`manual`, `scheduled`, `rule`, `provider`, `ai`, `uncategorised`). Pending state lives in job metadata; don't invent a ledger row or alter accounting to show it.
- Existing category bulk-backfill jobs are distinct from automatic new-record jobs. Preserve their behaviour.

## Review Focus

1. **Late AI after manual edit:** a response for Groceries cannot undo a user correction to Shopping or change its linked sibling. Test in Task 3.
2. **Conflicting learning:** correcting identical description `M&S` to different categories disables automatic reuse; never create broad merchant rules from one correction. Test in Task 2.
3. **Duplicate inference delivery:** one linked expense/budget pair is charged at most once per attempt and receives one consistent category; retries must not recreate the expense. Test in Task 3.
4. **Untrusted transaction text:** descriptions attempting to override system instructions or invoke external actions cannot create arbitrary category IDs or leak data. Test in Task 1.
5. **Cost/availability:** quota exhaustion, missing AI binding, D1 outbox dispatch failures and model latency leave saved financial activity unchanged and surface Uncategorised after bounded retries. Test in Tasks 3 and 4.

## Verified baseline and price assumptions

- Current `cf-worker/src/utils/category-ai.ts` invokes `@cf/cloudflare/clef-flash`, requires a probability >= 0.75 and lead >= 0.20, and gives inference 2.5 seconds. These restrictions likely explain some `Uncategorised` outcomes; they are **not** reliable confidence signals for GPT text generation.
- Current `resolveCategory` in `cf-worker/src/utils/categories.ts` runs AI inline after manual, scheduled, rule and provider checks; linked records have category sidecars and guarded edits.
- Cloudflare lists GPT-OSS 120B at **$0.35 per million input tokens** and **$0.75 per million output tokens** on 2026-11-07: <https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/>.
- Example: 200 requests * (1,000 input tokens * $0.35/M + 100 output tokens * $0.75/M) = **$0.085**. Even a conservative 400 attempts at 2,000 input + 256 output each = **$0.3568** at those prices, excluding unrelated infrastructure charges. These are estimates, not billing guarantees; bound and meter actual usage.

## File Structure

- Modify `cf-worker/src/utils/category-ai.ts`: GPT model client, prompt, response parsing and bounded token settings.
- Create `cf-worker/src/utils/category-ai-prompt.ts`: category criteria, examples, validated allowed IDs and literal instructions.
- Modify `cf-worker/src/utils/categories.ts`: resolver precedence and skip-inline-AI decision; maintain existing linked-category update rules.
- Create `cf-worker/src/utils/category-memory.ts`: normalisation, exact lookup, conflict-safe correction learning.
- Create `cf-worker/src/db/migrations/<next>_auto_category.sql` and update `cf-worker/src/db/schema/schema.ts` + migration journal for `category_auto_jobs` and `category_correction_memory`. Determine the next migration number from current `main`, **not** from a hard-coded assumption; apply only to development first.
- Create `cf-worker/src/workflows/auto-category.ts`: idempotent single-logical-transaction classifier/reconciler.
- Create `cf-worker/src/utils/auto-category-jobs.ts`: durable enqueue, dispatch, retry and guarded completion.
- Modify `cf-worker/src/handlers/dashboard.ts`, `split.ts`, `budget.ts`, scheduled/bill/bank creation pathways as needed to enqueue **after atomic financial creation** when classification is unresolved. Avoid a second write of financial amounts.
- Modify `cf-worker/src/handlers/categories.ts` to learn in the background after successful `editRecordCategory` on a real manual correction.
- Modify `cf-worker/src/index.ts`, `cf-worker/wrangler.toml`, `cf-worker/worker-configuration.d.ts` and relevant typed responses to wire `AUTO_CATEGORY_WORKFLOW` and read-only job status.
- Modify `src/components/Categories/index.tsx`, `src/hooks/useCategories.ts` or a new `src/hooks/useCategoryStatus.ts` to show `Categorising...` and refresh when done.
- Test `cf-worker/src/tests/category-ai.test.ts`, `category-foundation.test.ts`, `category-jobs.test.ts`, `dashboard.test.ts`, `bank-review-flow.test.ts`, `scheduled-actions.test.ts`; create `cf-worker/src/tests/auto-category.test.ts`, `category-memory.test.ts` and `src/e2e/auto-category.spec.ts`.
- Update `docs/testing/category-ai.md`, `docs/api.md`, `docs/deployment.md` with the new async semantics, cost, rollback and data handling.

## Precedence and output contract

Use this precedence for **new** records; existing manually categorised records are never silently reclassified:

1. Explicit manual category (including explicit `Uncategorised`).
2. Saved scheduled/recurring category.
3. Existing explicit user category rules.
4. Household exact correction memory, where conflict-free and sufficiently specific.
5. Supported provider category hint.
6. Post-commit GPT inference.
7. `Uncategorised` fallback.

The model receives **only active** allowed category identifiers plus brief descriptions. Default criteria distinguish groceries from prepared meals and non-food supermarket items. Custom categories may be predicted only when the known name provides sufficient evidence. The system message treats all merchant/description text as untrusted data.

Example classification output:

```json
{"categoryId":"gc_<existing_id>"}
```

Validate against the **current household's active category IDs**, not a hardcoded taxonomy, and use JSON schema output where the model/SDK confirms it. Use `null` or a designated `uncategorised` choice for genuine ambiguity; invalid JSON/unknown category never becomes a saved arbitrary ID. Reduce temperature and request low reasoning effort when supported, cap output at <= 256 tokens, and keep the prompt compact.

## Task 1: Model, prompt, parser and provider-compatibility smoke test

**Files:** `cf-worker/src/utils/category-ai.ts`, `cf-worker/src/utils/category-ai-prompt.ts`, `cf-worker/src/tests/category-ai.test.ts`, `docs/testing/category-ai.md`

**Interfaces:** `classifyCategory(env: Env, input: { merchant: string; description: string; allowedCategories: Array<{id: string; name: string; slug?: string | null}> }): Promise<string | null>`; return `null` for intentional abstention or invalid model output.

- [ ] **Step 1: Write failing tests** for `Lidl -> Groceries`, `M&S bakery items -> Groceries`, `Tesco school uniform -> Shopping`, `Aldi cordless drill -> Shopping`, `Starbucks -> Eating out`, bare `Amazon -> null`, custom category ID, injection text, and unsupported category ID. Mock the model, no benchmark.
- [ ] **Step 2: Run** `cd cf-worker && yarn vitest run src/tests/category-ai.test.ts --no-file-parallelism`; verify old Clef probabilities/payload fail the new JSON contract tests.
- [ ] **Step 3: Implement** the GPT model call, bounded system/user messages, allowed categories, JSON response parser and strict allowlist. Remove Clef probability thresholds; preserve generic-merchant abstention. Run one minimal **development-only provider smoke call** to verify actual SDK input/output shape, including JSON mode and reasoning settings; do not run a scored benchmark.
- [ ] **Step 4: Run** focused mocked tests and `cd cf-worker && yarn lint`; inspect provider smoke-call cost/latency and store only aggregate counts, no raw descriptions.
- [ ] **Step 5: Commit** `feat: improve category model and prompt`.

## Task 2: Passive correction memory

**Files:** `cf-worker/src/utils/category-memory.ts`, `cf-worker/src/handlers/categories.ts`, `cf-worker/src/db/schema/schema.ts`, next migration, `cf-worker/src/tests/category-memory.test.ts`, `cf-worker/src/tests/category-foundation.test.ts`

**Interfaces:** `lookupCorrection(env, groupId, merchant, description): Promise<string | null>`; `rememberCorrection(env, groupId, merchant, description, categoryId): Promise<void>`.

- [ ] **Step 1: Write failing database tests** for an exact description match after a manual correction, household isolation, no match on a different purchased item, no learning of generic `Amazon`/`payment` labels, archived category rejection, and conflicting-category suppression. Check that the correction itself succeeds even if memory storage fails.
- [ ] **Step 2: Run** the new test to verify the table/helper is absent.
- [ ] **Step 3: Add** a small correction-memory table keyed by `(group_id, normalized_fingerprint)` with chosen `category_id`, conflict state and timestamps; store a fingerprint rather than a second raw transaction description. In the existing `/record-category` success path, learn **only** from explicit user corrections; never learn from AI-produced categories or silently show another prompt. Keep explicit rules higher priority.
- [ ] **Step 4: Run** the memory and category edit tests; verify no financial totals change and linked records remain aligned.
- [ ] **Step 5: Commit** `feat: learn from category corrections`.

## Task 3: Durable asynchronous inference after successful ledger save

**Files:** `cf-worker/src/utils/auto-category-jobs.ts`, `cf-worker/src/workflows/auto-category.ts`, `cf-worker/src/handlers/dashboard.ts`, relevant create handlers, `cf-worker/src/utils/categories.ts`, `cf-worker/src/index.ts`, `cf-worker/wrangler.toml`, migrations, `cf-worker/src/tests/auto-category.test.ts`

**Interfaces:** `enqueueAutoCategory(statementBatch, groupId, logicalRecordId, sourceVersion): void` adds a unique job intent in the **same D1 atomic batch** as the financial record; `AutoCategoryWorkflow` completes it with a category-only conditional update when the saved version is still current.

- [ ] **Step 1: Write failing tests** for save-success while inference is slow/down, exactly one job for a linked expense/budget pair, successful eventual category propagation, idempotent duplicate deliveries, stale-version refusal after manual edit, and failed workflow dispatch later recovered from persisted queued intent. Include bank/scheduled/bill creation paths.
- [ ] **Step 2: Run** focused Worker tests; verify inline AI currently blocks the save and no auto-category job/outbox exists.
- [ ] **Step 3: Change** unresolved `resolveCategory` to return an uncategorised/pending decision **without awaiting AI**. Persist a minimal `category_auto_jobs` intent atomically with the created financial record; dispatch a separate Cloudflare Workflow after commit, and add bounded recovery of undispatched queued intents. In the workflow, run GPT then update only category sidecars using current version/source checks and existing linked-component propagation. Never update ledger amounts, user balances or budget totals. Use at most two inference attempts per logical record, with bounded backoff.
- [ ] **Step 4: Run** `cd cf-worker && yarn vitest run src/tests/auto-category.test.ts src/tests/dashboard.test.ts src/tests/scheduled-actions.test.ts src/tests/bank-review-flow.test.ts --no-file-parallelism`, plus full Worker tests and lint. Confirm all existing financial saves work with `CATEGORY_AI_ENABLED=false`.
- [ ] **Step 5: Commit** `feat: classify categories after save`.

## Task 4: Pending UX and sub-$1 model-spend protection

**Files:** `src/components/Categories/index.tsx`, `src/hooks/useCategories.ts` (or `src/hooks/useCategoryStatus.ts`), `src/e2e/auto-category.spec.ts`, `cf-worker/src/utils/auto-category-jobs.ts`, `cf-worker/src/tests/auto-category.test.ts`, `docs/testing/category-ai.md`

**Interfaces:** Read-only `GET /category-auto-status?recordKind=expense|budget&recordId=<id>` or a status field on existing authenticated record-detail responses returns `pending | completed | failed` without exposing private bank data. Use existing category query invalidation when complete.

- [ ] **Step 1: Write failing frontend/Worker tests** for `Categorising...` immediately after save, updated badge when a model category arrives, `Uncategorised` after terminal failure, manual correction overriding pending AI, no repeated infinite polling, and monthly quota exhaustion.
- [ ] **Step 2: Run** focused frontend/Worker tests and confirm no pending-state UX exists.
- [ ] **Step 3: Add** a small pending badge and bounded re-fetch while jobs are pending. Enforce a per-household **model-cost reservation** before each inference attempt using configured published rates or conservative per-call upper bound, a hard stop before US$1 estimated charges/month, a bounded request size (~2,000 input tokens), `max_tokens <= 256`, and at most two attempts. Track total usage without logging raw purchase text. Revisit pricing before deployment; include model calls from this workflow, not unrelated Workers AI workloads.
- [ ] **Step 4: Run** React tests, focused desktop/mobile Playwright, full Worker tests and both lint gates. Confirm a 200-record synthetic workflow stays below the US$1 estimate even with maximum permitted retries. Do not call the real model 200 times; use mocked measured-token fixtures.
- [ ] **Step 5: Commit** `feat: show category inference status` and update the runbook.

## Rollout and rollback

1. Additive migrations and workflow binding go to **development** first. Inspect current migration journal; don't reuse existing migration numbers or apply unspecified production migrations. Respect `docs/deployment.md`.
2. Deploy with `CATEGORY_AI_ENABLED=false` initially to prove saves/edits still work and job states degrade safely. Enable only after the workflow is registered, category edits are protected, and cost guard is tested.
3. Production enablement is a separately approved step. Preserve category memory and outbox on rollback; disable new inference via flag while keeping compatible category reads and manual edits.
4. Never backfill all historical Uncategorised records as an implicit side effect. That would break the stated 200/month budget expectation.

## Done when

A purchase saves promptly, initially shows `Categorising...`, receives a valid existing category or eventually becomes `Uncategorised`, and is never double-posted. A correction is a single ordinary action that is remembered for later exact matches, without a new UI prompt. Model usage is bounded, observable and designed to cost less than US$1 for 200 monthly transactions.
