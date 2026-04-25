# E2E Test Fixtures — Design Spec

**Date:** 2026-04-25
**Status:** Draft, pending review
**Phase:** Phase 0 (foundational; the linking spec depends on this)

## Summary

Today's e2e tests are slow because every test sets up state through the UI: log in via the login form, navigate to a page, fill a form, submit, wait for response, then exercise the actual behavior under test. On top of that, the frontend (running locally) makes API calls to a **remote** Cloudflare Worker (`splitexpense-dev.tanmaydatta.workers.dev`), so every API call pays network latency, and every test shares state with every other test that has ever run against that environment.

This spec introduces a fixture system that:

- Switches e2e tests to run the cf-worker **locally** (via `wrangler dev`) by default, with a fresh local D1 per CI run, with a remote-backend escape hatch via env var.
- Adds a guarded `POST /test/seed` endpoint on the local worker that takes a declarative payload describing users/groups/transactions/budgets/links and creates them in a single D1 batch, returning IDs and ready-to-inject session cookies.
- Provides a TS factory module and Playwright fixtures (`seed`, `authedPage`, `authedPageWithGroupOf`) that wrap the seed endpoint with ergonomic defaults.
- Rewrites `expense-management.spec.ts` as a pilot conversion that validates the design end-to-end and serves as a worked reference for future conversions.
- Builds with per-test isolation discipline so that flipping `fullyParallel: true` is a one-line follow-up PR.

Phase 1 keeps `workers: 1` and converts only the pilot spec; the rest of the spec files convert in subsequent independent PRs, and parallel execution is enabled in a separate follow-up.

## Motivation

1. **Tests are slow.** Each test re-logs-in via the UI (≈2s) and re-creates setup state via UI flows. The cumulative cost of "set up state through the UI" across ~4500 lines of tests dominates CI time.
2. **Tests share state.** All e2e tests run against the same remote dev D1 with no cleanup; data accumulates indefinitely; cross-test interference is a quiet source of flakiness.
3. **Network latency on every API call.** The frontend talks to a remote worker even when the test runner is local.
4. **No path to parallelism.** Without isolation, `fullyParallel: true` would cause collisions; the only safe setting is `workers: 1`, which throws away available CPU.

## Goals

- Cut e2e setup cost dramatically: replace UI-driven state setup with one HTTP call to a seed endpoint.
- Run the full backend stack locally during e2e by default; remote opt-in for ad-hoc debugging only.
- Per-test isolation by `groupId`/user, so future parallelism is one config flip away.
- Validate the design by converting one representative spec file (`expense-management.spec.ts`) end-to-end.
- Keep the deprecated legacy fixtures (`authenticatedPage`, `authenticatedMultiPersonPage`) working unchanged in the 6 unconverted spec files.

## Non-goals (Phase 0 / future work)

- Conversion of the remaining 6 spec files (`auth.spec.ts`, `budget-management.spec.ts`, `monthly-budget-management.spec.ts`, `scheduled-actions.spec.ts`, `settings-management.spec.ts`, `transactions-balances.spec.ts`).
- Flipping `fullyParallel: true` and raising `workers`. Designed-for; not enabled.
- A seed endpoint on the deployed dev or staging worker. Local-only by design.
- Fixture support for triggering scheduled-action workflow runs in real time.
- A performance regression / benchmark dashboard.
- Visual-regression infrastructure.
- Replacing `TestHelper` / `ExpenseTestHelper` — their assertion/navigation roles stay valuable.

## Key design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend location for e2e | Local cf-worker via `wrangler dev` by default; remote opt-in via `E2E_BACKEND_URL` | Removes network latency on every API call; gives true per-run isolation; CI never collides with manual dev work; escape hatch preserves debugging against shared dev data. |
| Parallelism | Designed for; shipped sequential; flipped in a follow-up | Same isolation discipline either way; lower ship risk; one-line PR to flip later. |
| Auth bypass | Direct session cookie injection from the seed endpoint | Skips UI login; uses better-auth's internal session-issuing API so password hashing and session shape match production; real auth flows still covered by `auth.spec.ts`. |
| Seed endpoint API shape | Single declarative payload, single roundtrip, alias-based references | One HTTP call covers the whole test setup; payload reads as the test's intent; aliases keep payloads readable without forcing tests to thread IDs. |
| Migration strategy | Build infra + convert one pilot (`expense-management.spec.ts`); leave the other 6 specs unchanged | YAGNI: don't build infrastructure without exercising it on real tests; one pilot validates and documents the design; remaining specs convert as follow-up PRs. |
| Per-test cleanup | None | Local D1 dies with the run process; per-test isolation is by `groupId`/user, not by cleanup; cleanup machinery would add latency without improving isolation. |
| Seed endpoint security gate | Two layers: env-var presence (route not registered without it) + per-request `X-E2E-Seed-Secret` header | Fails closed in deployed environments; defense in depth even if the env var is leaked. |
| Test data ID generation | `nanoid(6)` for aliases (in payloads), ULIDs for backend-generated IDs, `*@e2e.test` emails | Short readable aliases for test output; ULIDs match the rest of the codebase; `.test` TLD never resolves to real addresses. |
| Existing fixtures | `authenticatedPage` / `authenticatedMultiPersonPage` deprecated but kept working | Old specs unchanged in Phase 1; conversions land independently per file. |

## Architecture

### Today (problem)

```
Playwright → http://localhost:3000 (yarn start, frontend)
                    │
                    └──API calls──▶ https://splitexpense-dev.tanmaydatta.workers.dev (REMOTE, shared, slow)
                                              │
                                              └─▶ shared dev D1 (no isolation across tests / runs / PRs)

Each test: UI sign-in (≈2s) → UI form fills → UI navigation → assertions
```

### After fixtures (target)

```
Playwright (parallel-ready) → http://localhost:3000 (yarn start, frontend)
                                      │
                                      └──API calls──▶ http://localhost:8787 (LOCAL wrangler dev)
                                                              │
                                                              └─▶ fresh local D1 per CI run

Each test: POST /test/seed once → inject session cookies → page.goto(target route) → assertions
```

### Components

| Component | Role |
|---|---|
| Local `wrangler dev` instance | Runs the cf-worker against a fresh local D1; exposes `/test/seed` only when its env-var secret is present. |
| `GET /health` endpoint (new) | Trivial 200 response; used by Playwright's `webServer.url` probe to know when the worker is ready. |
| `POST /test/seed` endpoint (new) | Declarative seeding; returns IDs + session cookies. Gated by env var + per-request header. |
| Factory module (`src/e2e/fixtures/factories.ts`) | TS payload builders with sane defaults: `factories.user()`, `factories.group()`, `factories.transaction()`, `factories.budgetEntry()`, `factories.link()`. |
| Seed client (`src/e2e/fixtures/seed-client.ts`) | Typed HTTP wrapper around `POST /test/seed`. |
| Playwright fixtures (`src/e2e/fixtures/setup.ts`) | New `seed`, `authedPage`, `authedPageWithGroupOf`; legacy `authenticatedPage` / `authenticatedMultiPersonPage` retained as compat shims. |
| Pilot rewrite | `expense-management.spec.ts` — only spec file converted in Phase 1. |
| Playwright config | Dual `webServer` (worker + frontend); `REACT_APP_API_BASE_URL` set to `localhost:8787` by default; `workers: 1` retained. |

## Local cf-worker boot

### Playwright config (`playwright.config.ts`)

```ts
const backendUrl = process.env.E2E_BACKEND_URL || "http://localhost:8787";
const useLocalBackend = backendUrl.startsWith("http://localhost");

export default defineConfig({
  // ...existing settings...
  webServer: [
    ...(useLocalBackend ? [{
      command: "cd cf-worker && yarn dev --port=8787",
      url: "http://localhost:8787/health",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        E2E_SEED_SECRET: process.env.E2E_SEED_SECRET || "local-only-do-not-deploy",
      },
    }] : []),
    {
      command: "yarn start",
      url: "http://localhost:3000",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        REACT_APP_API_BASE_URL: backendUrl,
        BROWSER: "none",
      },
    },
  ],
});
```

### Behavior matrix

| `E2E_BACKEND_URL` | Web servers launched | Fixture-based tests | UI-only tests (`auth.spec.ts`) |
|---|---|---|---|
| Unset (default) | local worker + frontend | run | run |
| Set to `https://...` (remote) | frontend only | skipped via `skipIfRemoteBackend()` | run |

### Health endpoint

A new `GET /health` route on the cf-worker returns `{ status: "ok" }`. No auth, no DB access. Used purely for `webServer.url` readiness probing. Always-on; harmless in any environment.

### Fresh D1 per CI run

```yaml
# .github/workflows/e2e-tests.yml addition
- name: Reset local D1 state
  run: rm -rf cf-worker/.wrangler/state/v3/d1
```

`wrangler dev` recreates the local D1 file and applies all migrations on startup. Locally, developers may keep `.wrangler` state across runs for debugging; per-test `groupId` isolation prevents cross-run contamination as long as the schema hasn't changed (and migrations re-apply if it has).

### CORS

The cf-worker's `trustedOrigins` env var is consumed by both better-auth and any custom CORS middleware. Add `http://localhost:3000` to the local `cf-worker/.dev.vars` (gitignored) under the existing `TRUSTED_ORIGINS` key. No production change.

### Cookie configuration on localhost

`localhost:3000` and `localhost:8787` are same-site (browsers consider site = scheme + eTLD+1; ports don't change site identity). `SameSite=Lax` allows the cookie on cross-port fetches. The cf-worker already sets non-secure cookies under `LOCAL: true` (`auth.ts:185`), so plain HTTP is fine.

### Wrangler config additions

- `E2E_SEED_SECRET` lives in `cf-worker/.dev.vars` (gitignored). Sample values are documented in a new committed `cf-worker/.dev.vars.example`.
- The deployed dev/prod workers never receive this env var; their `wrangler.toml` is unchanged.

### `package.json` script additions

- `test:e2e` — unchanged interface; defaults to local worker via the new Playwright config.
- `test:e2e:remote` — sets `E2E_BACKEND_URL=https://splitexpense-dev.tanmaydatta.workers.dev` and runs (skips fixture-based tests).
- `test:e2e:fresh` — wipes `cf-worker/.wrangler/state/v3/d1` then runs (mirrors CI; useful locally).

## Seed endpoint

### Path and method

`POST /test/seed` — handled in `cf-worker/src/handlers/test-seed.ts`; wired into `cf-worker/src/index.ts` only when `env.E2E_SEED_SECRET` is non-empty. In environments without that env var, the route is not registered at all; `/test/seed` returns the same 404 as any unknown path.

### Security guards (two layers)

1. **Env-var presence (deployment-time).** Route only registered when `env.E2E_SEED_SECRET` is set. Production wrangler config doesn't define the var.
2. **Per-request secret check (request-time).** Every request must include `X-E2E-Seed-Secret: <value>` matching `env.E2E_SEED_SECRET`. Mismatch → 404 (not 401 — the route should look non-existent to anyone without the secret).

### Request payload

```ts
interface SeedRequest {
  users?: Array<{
    alias: string;                    // unique within payload
    name?: string;                    // default: alias
    email?: string;                   // default: `${alias}-${nanoid(8)}@e2e.test`
    password?: string;                // default: random
    username?: string;                // default: `${alias}-${nanoid(8)}`
  }>;
  groups?: Array<{
    alias: string;
    name?: string;                    // default: `e2e-group-${nanoid(6)}`
    members: string[];                // user aliases
    defaultCurrency?: string;         // default: "GBP"
    budgets?: Array<{
      alias: string;
      name: string;
      description?: string;
    }>;
    metadata?: Record<string, unknown>;
  }>;
  transactions?: Array<{
    alias: string;
    group: string;                    // group alias
    description?: string;
    amount: number;
    currency?: string;                // default: group's defaultCurrency
    paidByShares: Record<string, number>;    // userAlias → amount
    splitPctShares: Record<string, number>;  // userAlias → percentage
    createdAt?: string;
  }>;
  budgetEntries?: Array<{
    alias: string;
    group: string;
    budget: string;                   // budget alias within groups[].budgets
    description?: string;
    amount: number;
    currency?: string;
    addedTime?: string;
  }>;
  expenseBudgetLinks?: Array<{        // requires linking spec's table to exist
    transaction: string;
    budgetEntry: string;
  }>;
  scheduledActions?: Array<unknown>;  // forward-compat; pilot doesn't use it
  authenticate?: string[];            // user aliases to issue session cookies for
}
```

### Response payload

```ts
interface SeedResponse {
  ids: {
    users: Record<string, { id: string; email: string; username: string }>;
    groups: Record<string, { id: string }>;
    transactions: Record<string, { id: string }>;
    budgetEntries: Record<string, { id: string }>;
    expenseBudgetLinks: Record<string, { id: string }>;
  };
  sessions: Record<string, {                  // keyed by user alias
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      sameSite: "Lax" | "Strict" | "None";
      httpOnly: boolean;
      secure: boolean;
      expires?: number;
    }>;
  }>;
}
```

The `cookies` array shape matches Playwright's `BrowserContext.addCookies()` input directly, so the fixture just calls `context.addCookies(response.sessions[alias].cookies.map(c => ({ ...c, url: BACKEND_URL })))`.

### Validation rules

- Aliases unique within their entity type.
- All cross-references resolve (e.g., `transactions[].group` exists in `groups[].alias`; `paidByShares` keys reference user aliases in payload).
- `paidByShares` values sum to `amount`.
- `splitPctShares` values sum to 100.
- Currencies match the existing valid-currency set used by regular handlers.
- `authenticate[]` aliases reference users in the payload.
- Failure → 400 with a message identifying the offending field. No partial state.

### Implementation approach

- Two-pass alias resolution: (1) assign IDs/emails/etc. to each entity; (2) substitute alias references with concrete IDs.
- Single `db.batch([...])`:
  - Users via better-auth's internal `auth.api.signUpEmail()` (same code path as production sign-ups; password hashing parity).
  - Sessions via better-auth's internal session-issuing API (same path real login uses, just bypassing the credential check).
  - Groups, transactions, transaction_users, budget_entries, expense_budget_links via raw Drizzle inserts.
- If any step fails, the batch rolls back; response is 500 with the underlying error message in plain text (test-only endpoint).

### Cookie shape produced

- `name`: better-auth's session cookie name.
- `value`: the issued session token.
- `expires`: now + 24h.
- `httpOnly: true`, `sameSite: "Lax"`, `secure: false` (matches `LOCAL: true` mode).
- `domain`: omitted (cookie bound to whatever host the response came from). Fixtures supply `url: "http://localhost:8787"` to `addCookies()` to bind the cookie to the worker origin.

## Auth bypass / fixture mechanics

### Cookie injection flow (inside the `seed` fixture)

```ts
const response = await callSeedEndpoint(payload);
const auth = options?.authenticateAs ?? payload.authenticate?.[0];
if (auth && response.sessions[auth]) {
  await context.addCookies(
    response.sessions[auth].cookies.map(c => ({ ...c, url: BACKEND_URL }))
  );
}
return response;
```

### Why bind to the backend origin only

The session cookie is `HttpOnly`; the frontend never reads it. The cookie travels with frontend `fetch` calls because the existing frontend code uses `credentials: "include"` (that's how it works against the remote dev worker today). The browser includes the cookie based on destination origin (`:8787`), not the originating frame's origin (`:3000`). Setting the cookie for `localhost:3000` would be redundant.

### Auth state correctness

The seed endpoint uses better-auth's internal APIs, so:

- Password hashing matches production (PBKDF2, 10k iterations, `auth.ts:108–134`).
- Session rows in better-auth's `session` table are well-formed.
- `customSession` plugin output (`auth.ts:78–86`) is identical to a real login.
- Session validation middleware on every request just works — no special-casing for "test sessions".

### Skipping fixture tests when running against remote

```ts
import { skipIfRemoteBackend } from "../fixtures/setup";
test.beforeAll(skipIfRemoteBackend);   // fast-fail when E2E_BACKEND_URL points remote
```

`skipIfRemoteBackend()` reads the same env vars Playwright config uses; if remote, it calls `test.skip()`. UI-only tests like `auth.spec.ts` don't import this helper and continue to work against any backend.

## Playwright fixtures and factory module

### Directory layout (additions in **bold**)

```
src/e2e/
├── fixtures/
│   ├── setup.ts                     ← extended (seed, authedPage; legacy fixtures kept as shims)
│   ├── test-data.ts                 ← unchanged (still used by auth.spec.ts)
│   ├── factories.ts                 ← NEW
│   ├── seed-client.ts               ← NEW
│   └── seed-types.ts                ← NEW
├── tests/                           ← spec files (only expense-management.spec.ts changes in Phase 1)
└── utils/                           ← TestHelper / ExpenseTestHelper retained
```

### `seed-client.ts`

```ts
export async function callSeedEndpoint(payload: SeedRequest): Promise<SeedResponse> {
  const url = `${process.env.E2E_BACKEND_URL ?? "http://localhost:8787"}/test/seed`;
  const secret = process.env.E2E_SEED_SECRET;
  if (!secret) throw new Error("E2E_SEED_SECRET not set; fixtures unavailable");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Seed-Secret": secret },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status} ${await res.text()}`);
  return res.json();
}
```

### `factories.ts`

```ts
export const factories = {
  user(overrides: Partial<SeedRequest["users"][number]> = {}) {
    return { alias: overrides.alias ?? `u-${nanoid(6)}`, ...overrides };
  },
  group(overrides: Partial<SeedRequest["groups"][number]> = {}) {
    return {
      alias: overrides.alias ?? `g-${nanoid(6)}`,
      members: overrides.members ?? [],
      defaultCurrency: overrides.defaultCurrency ?? "GBP",
      budgets: overrides.budgets ?? [{ alias: `b-${nanoid(6)}`, name: "Default" }],
      ...overrides,
    };
  },
  transaction(args: { group: string; paidBy: string; amount: number } & Partial<SeedRequest["transactions"][number]>) {
    const { group, paidBy, amount, ...rest } = args;
    return {
      alias: rest.alias ?? `t-${nanoid(6)}`,
      group, amount,
      paidByShares: rest.paidByShares ?? { [paidBy]: amount },
      splitPctShares: rest.splitPctShares ?? { [paidBy]: 100 },
      currency: rest.currency ?? "GBP",
      description: rest.description ?? `e2e-tx-${nanoid(4)}`,
      ...rest,
    };
  },
  budgetEntry(args: { group: string; budget: string; amount: number } & Partial<SeedRequest["budgetEntries"][number]>) { /* ... */ },
  link(args: { transaction: string; budgetEntry: string }) { return { ...args }; },
};
```

### `setup.ts` — fixture surface

```ts
type SeedFn = (payload: SeedRequest, options?: { authenticateAs?: string }) => Promise<SeedResponse>;

export const test = base.extend<{
  seed: SeedFn;
  authedPage: Page;                                              // 1 user, 1 fresh group, signed in, on "/"
  authedPageWithGroupOf: (n: number) => Promise<{ page: Page; users: string[] }>;
}>({
  seed: async ({ context }, use) => {
    const fn: SeedFn = async (payload, options) => {
      const result = await callSeedEndpoint(payload);
      const auth = options?.authenticateAs ?? payload.authenticate?.[0];
      if (auth && result.sessions[auth]) {
        await context.addCookies(
          result.sessions[auth].cookies.map(c => ({ ...c, url: BACKEND_URL }))
        );
      }
      return result;
    };
    await use(fn);
  },

  authedPage: async ({ page, seed }, use) => {
    await seed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"], budgets: [{ alias: "b", name: "Default" }] }],
      authenticate: ["u"],
    });
    await page.goto("/");
    await use(page);
  },

  authedPageWithGroupOf: async ({ page, seed }, use) => {
    const factory = async (n: number) => {
      const aliases = Array.from({ length: n }, (_, i) => `u${i + 1}`);
      await seed({
        users: aliases.map(a => factories.user({ alias: a })),
        groups: [factories.group({ alias: "g", members: aliases })],
        authenticate: [aliases[0]],
      });
      await page.goto("/");
      return { page, users: aliases };
    };
    await use(factory);
  },
});

export { expect } from "@playwright/test";
export { factories } from "./factories";
```

### Legacy fixtures handling

| Old fixture | What happens to it |
|---|---|
| `authenticatedPage` | Marked `@deprecated`; new tests use `authedPage`. Old specs still reference it; implementation stays UI-driven for backward compat. Removed when all old specs are converted (separate follow-up PRs). |
| `authenticatedMultiPersonPage` | Same: deprecated; new tests use `authedPageWithGroupOf(3)`. |

Phase 1 changes only `expense-management.spec.ts`'s usage; the other 6 spec files continue using legacy fixtures unchanged.

### Type safety

`SeedRequest` and `SeedResponse` are defined in `cf-worker/src/handlers/test-seed.ts` and re-exported via `shared-types/index.ts` so the same types flow into `src/e2e/fixtures/seed-types.ts`. Test authors get autocomplete on payloads; cross-alias references are validated at runtime by the seed handler.

### ID/value generation

- Aliases (in payloads): `nanoid(6)` — short, readable, unique.
- Backend-generated IDs: ULIDs (matching the rest of the codebase).
- Emails: `${alias}-${nanoid(8)}@e2e.test`. The `.test` TLD is RFC 2606 reserved; never resolves to real addresses.
- Group names: prefixed `e2e-` so accidental data leakage is identifiable.

### Test author ergonomics

```ts
import { test, expect, factories } from "../fixtures/setup";

test("delete a transaction", async ({ seed, page }) => {
  const { ids } = await seed({
    users: [factories.user({ alias: "alice" })],
    groups: [factories.group({ alias: "g", members: ["alice"] })],
    transactions: [factories.transaction({ alias: "t", group: "g", paidBy: "alice", amount: 100 })],
    authenticate: ["alice"],
  });
  await page.goto(`/transaction/${ids.transactions.t.id}`);
  await page.click('[data-test-id="delete"]');
  await expect(page).toHaveURL("/transactions");
});
```

## Pilot conversion: `expense-management.spec.ts`

### Conversion principle

> Replace UI-driven *setup* with seed-endpoint setup; keep UI-driven *exercise of the system under test* unchanged.

If a test's purpose is "the dashboard form correctly creates an expense," the form interaction stays — that's the SUT. If a test's purpose is "deleting an existing expense works," the existing expense gets seeded and only the deletion is exercised through UI.

### Test-by-test classification

| Test pattern | Conversion |
|---|---|
| Form validation: required fields, negative amounts, etc. | **No change.** Form is the SUT. `authedPage` replaces `authenticatedPage`; otherwise unchanged. |
| Submit form with valid data, assert expense appears | **Half-converted.** Setup via `authedPage` (no pre-existing expense). Form submission stays UI; assertion stays UI. |
| Default currency / split percentages match settings | **Fully converted.** Today: navigates to Settings to read values, navigates back. After: seed group with known `defaultCurrency` and per-member percentages; assert form defaults match. |
| Add expense, navigate to Expenses page, verify it appears | **Half-converted.** Add UI is part of the SUT; navigate + verify stay. |
| Verify a specific expense entry shows correct amount/currency | **Fully converted.** Today: add via UI, then assert. After: seed transaction with known values, navigate to Expenses, assert. |
| Delete an existing expense | **Fully converted.** Seed transaction; navigate directly to its detail/list; delete; verify. |
| Multi-currency: expenses in USD, EUR, GBP | **Fully converted.** Seed three transactions with different currencies; navigate; assert. |
| Custom split percentages | **Half-converted.** Seed a multi-user group via `authedPageWithGroupOf(3)`; form interaction (split percentage UI) stays UI. |

### Estimated speedup for the pilot file alone

- Today: ~25 tests × ~8s avg ≈ ~200s.
- After: ~25 tests × ~3s avg ≈ ~75s.
- ~2.5–3× speedup on this file alone. Across all 7 specs (when fully converted later) the same ratio applies, plus the parallelism multiplier when `workers` is raised.

### What's added to the spec file

A typical new test:

```ts
import { test, expect, factories } from "../fixtures/setup";
import { ExpenseTestHelper } from "../utils/expense-test-helper";  // unchanged

test.describe("Expense management", () => {
  test("renders list with seeded expenses", async ({ seed, page }) => {
    const { ids } = await seed({
      users: [factories.user({ alias: "u" })],
      groups: [factories.group({ alias: "g", members: ["u"] })],
      transactions: [
        factories.transaction({ alias: "t1", group: "g", paidBy: "u", amount: 50, currency: "USD", description: "Lunch" }),
        factories.transaction({ alias: "t2", group: "g", paidBy: "u", amount: 80, currency: "GBP", description: "Tesco" }),
      ],
      authenticate: ["u"],
    });
    await page.goto("/expenses");
    const helper = new ExpenseTestHelper(page);
    await helper.verifySpecificExpenseEntry("Lunch", "50", "USD", "+$50.00");
    await helper.verifySpecificExpenseEntry("Tesco", "80", "GBP", "+£80.00");
  });
});
```

### What's removed from the file

- All `authenticatedPage` references → `authedPage` or `seed` + `page`.
- All `await expenseHelper.addExpenseEntry(...)` calls used purely for setup → seed payloads. Calls used to exercise the form submission stay.
- "Navigate to Settings to read percentages, navigate back" preambles → known seed group.

### What stays in the file

- `ExpenseTestHelper` assertion methods (`verifyExpensesPageComponents`, `verifySpecificExpenseEntry`, `getCurrentFormValues`).
- `TestHelper.navigateToPage`.
- `data-test-id` selectors.
- Pure form-validation tests — they test the form itself; the seed endpoint can't make them faster.

### Anticipated factory needs surfaced by the pilot

- `factories.group({ memberShares: { alice: 60, bob: 40 } })` — for the "default split percentages match settings" test, requires extending `groups[].members` in the seed payload to optionally carry per-member percentages.
- Multi-currency transaction support already covered by `factories.transaction({ currency: "USD" })`.

### Out of scope for the pilot

- The other 6 spec files keep using legacy fixtures.
- `auth.spec.ts` may never convert; it tests the login UI itself.

## CI, rollout, parallelism flip

### CI workflow changes (`.github/workflows/e2e-tests.yml`)

```yaml
# additions; existing steps preserved
- name: Reset local D1 state
  run: rm -rf cf-worker/.wrangler/state/v3/d1

- name: Run e2e tests
  env:
    E2E_SEED_SECRET: ${{ secrets.E2E_SEED_SECRET }}
    # E2E_BACKEND_URL not set → defaults to local
  run: yarn test:e2e
```

`E2E_SEED_SECRET` is added to the GitHub Actions repo secrets (any opaque value). It functions as a feature flag — its presence enables the route — not as a strong secret.

### Rollout — three small PRs (or one if reviewable)

1. **PR A — backend prep.** Add `GET /health`. Add `POST /test/seed` handler in `cf-worker/src/handlers/test-seed.ts`, gated by env var + header. Add `cf-worker/.dev.vars.example`. Vitest tests in `cf-worker/src/tests/test-seed.test.ts` cover gate behavior, alias resolution, validation errors, atomic batch failure, session cookie validity. No callers yet; production unaffected.
2. **PR B — frontend test infrastructure + pilot.** Update `playwright.config.ts` for the dual `webServer`. Add `src/e2e/fixtures/seed-client.ts`, `factories.ts`, `seed-types.ts`. Extend `setup.ts` with new fixtures. Rewrite `expense-management.spec.ts`. Update `src/e2e/README.md` with the new fixture API.
3. **PR C — CI wiring.** Update `.github/workflows/e2e-tests.yml`. Add `E2E_SEED_SECRET` to repo secrets.

Order: A and B can land in either order (B's tests work locally against a manually-launched worker if A is in). C is last because it depends on both.

### Rollback

- PR A: clean — seed handler is dead code in prod since the env var isn't set there.
- PR B: clean — pilot returns to its previous form; fixture files are removed.
- PR C: clean — CI returns to the old workflow.

### Parallelism flip (separate follow-up PR)

```ts
// playwright.config.ts changes
fullyParallel: true,
workers: process.env.CI ? 4 : undefined,
```

Pre-conditions before flipping:

- Pilot spec runs cleanly on CI for ≥10 consecutive runs.
- Local `wrangler dev` confirmed to handle concurrent requests under load.
- Each pilot test reviewed for hidden cross-test state.

If parallel runs flake: easy revert.

## Tests for the fixture infrastructure

### Vitest (`cf-worker/src/tests/test-seed.test.ts`)

- Endpoint not registered when env var absent → 404.
- Endpoint registered but missing/wrong header → 404.
- Endpoint registered with correct header → 200; entities created; cookies returned valid.
- Validation errors (unknown alias, sum mismatch, invalid currency) → 400; no rows persisted.
- Atomic batch failure (e.g., FK violation injected mid-batch) → 500; no rows persisted.
- Session cookie issued is valid for subsequent authenticated requests against the same worker instance.

### E2E

Covered implicitly by the pilot spec — if the fixture is broken, all pilot tests fail loudly.

## Documentation updates (per `CLAUDE.md` mandate)

- `docs/testing.md` — fixture API reference; how to write a fixture-based test; when fixtures aren't appropriate.
- `docs/codebase-map.md` — note new files in `src/e2e/fixtures/` and `cf-worker/src/handlers/test-seed.ts`.
- `docs/api.md` — new `GET /health` endpoint; explicit note that `POST /test/seed` exists in non-prod environments only.
- `docs/development.md` — how to run e2e locally; how to switch to remote backend; CORS / cookie troubleshooting.
- `cf-worker/.dev.vars.example` — comments on `E2E_SEED_SECRET`, `TRUSTED_ORIGINS`.
- `src/e2e/README.md` — fixture usage cookbook with examples.

## Out of scope / future work

| Item | Reason / Future plan |
|---|---|
| Conversion of remaining 6 specs | Each is its own small PR; lands independently. |
| Parallel test execution flip | Separate follow-up PR after pilot proves stable. |
| Seed endpoint on deployed dev/staging worker | Explicit non-goal — local-only by design. |
| Fixture support for triggering scheduled-action workflow runs | Workflows orchestrate over time; e2e for them stays UI-driven. |
| Performance benchmark / regression dashboard | Useful but orthogonal. |
| Visual-regression infrastructure | Separate concern. |
| `storageState` global setup as an alternate path | Not needed given per-test isolation; would conflict with the design. |
| Replacing `TestHelper` / `ExpenseTestHelper` entirely | Their assertion/navigation roles remain valuable; setup methods atrophy as conversions proceed. |

## Open questions

None at this time. All decisions captured in the table above and in the rollout/scope sections.
