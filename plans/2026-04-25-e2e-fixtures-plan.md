# E2E Test Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UI-driven e2e test setup with a declarative seed endpoint plus Playwright fixtures, run the e2e backend locally by default, and convert `expense-management.spec.ts` as a pilot.

**Architecture:** A guarded `POST /test/seed` handler on the local cf-worker accepts a declarative payload, creates entities in one D1 batch, and returns IDs plus better-auth session cookies. Playwright fixtures inject the cookies and `page.goto()` to the target route. Designed for per-test isolation so future parallelism is a one-line config flip.

**Tech Stack:** Cloudflare Workers (cf-worker), D1, Drizzle ORM, better-auth, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-25-e2e-fixtures-design.md`.

---

## File Structure

**Backend (cf-worker)**
- Create: `cf-worker/src/handlers/health.ts` — `GET /health` returning `{ status: "ok" }`.
- Create: `cf-worker/src/handlers/test-seed.ts` — `POST /test/seed` handler with env-var gate, alias resolution, atomic batch insert, session cookie issuance.
- Create: `cf-worker/.dev.vars.example` — committed template documenting `E2E_SEED_SECRET` and `TRUSTED_ORIGINS`.
- Create: `cf-worker/src/tests/health.test.ts` — Vitest test for `/health`.
- Create: `cf-worker/src/tests/test-seed.test.ts` — Vitest tests for `/test/seed`.
- Modify: `cf-worker/src/index.ts` — register the two new routes.

**Shared types**
- Modify: `shared-types/index.ts` — add `SeedRequest`, `SeedResponse`, `SeedCookie` types.

**Frontend / Playwright**
- Create: `src/e2e/fixtures/seed-client.ts` — typed HTTP wrapper around `POST /test/seed`.
- Create: `src/e2e/fixtures/factories.ts` — payload builders with sane defaults.
- Modify: `src/e2e/fixtures/setup.ts` — add `seed`, `authedPage`, `authedPageWithGroupOf`, `skipIfRemoteBackend`; deprecate (don't delete) old fixtures.
- Modify: `playwright.config.ts` — dual `webServer` (worker + frontend); env-driven backend URL.
- Modify: `package.json` (root) — add `test:e2e:remote` and `test:e2e:fresh` scripts.
- Rewrite: `src/e2e/tests/expense-management.spec.ts` — pilot conversion using new fixtures.

**CI**
- Modify: `.github/workflows/e2e-tests.yml` — reset local D1, set `E2E_SEED_SECRET`.

**Docs**
- Modify: `docs/api.md`, `docs/development.md`, `docs/testing.md`, `docs/codebase-map.md`.
- Modify: `src/e2e/README.md` — fixture cookbook.

---

## Tasks

### Task 1: Add `GET /health` endpoint (TDD)

**Files:**
- Create: `cf-worker/src/handlers/health.ts`
- Create: `cf-worker/src/tests/health.test.ts`
- Modify: `cf-worker/src/index.ts` (wire route)

- [ ] **Step 1: Write the failing test**

Create `cf-worker/src/tests/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createTestRequest } from "./test-utils";
import worker from "../index";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const req = createTestRequest("/health", "GET");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `cd cf-worker && yarn test src/tests/health.test.ts`
Expected: FAIL — route returns 404 (handler doesn't exist yet).

- [ ] **Step 3: Implement the handler**

Create `cf-worker/src/handlers/health.ts`:

```ts
import { createJsonResponse } from "../utils";

export async function handleHealth(
  request: Request,
  env: Env,
): Promise<Response> {
  return createJsonResponse({ status: "ok" }, 200, {}, request, env);
}
```

- [ ] **Step 4: Wire the route in `cf-worker/src/index.ts`**

Add the import at the top with other handler imports:

```ts
import { handleHealth } from "./handlers/health";
```

The `/health` route is NOT under `/.netlify/functions/`. It needs to be matched before the `handleApiRoutes` call. Find the request-handling block in the default export (search for `handleApiRoutes`) and add this branch before it:

```ts
if (path === "/health") {
  return await handleHealth(request, env);
}
```

If the existing structure routes by `path === "..."` checks, follow that pattern. If it routes only via `/.netlify/functions/...`, add the early `path === "/health"` check at the top of the request handler.

- [ ] **Step 5: Run test, expect pass**

Run: `cd cf-worker && yarn test src/tests/health.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full cf-worker test suite to confirm no regressions**

Run: `cd cf-worker && yarn test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add cf-worker/src/handlers/health.ts cf-worker/src/tests/health.test.ts cf-worker/src/index.ts
git commit -m "Add /health endpoint for Playwright readiness probe"
```

---

### Task 2: Create `cf-worker/.dev.vars.example`

**Files:**
- Create: `cf-worker/.dev.vars.example`

- [ ] **Step 1: Verify `.dev.vars` is gitignored**

Run: `git check-ignore cf-worker/.dev.vars`
Expected: prints the path (means it's ignored). If not, add `cf-worker/.dev.vars` to `.gitignore` first.

- [ ] **Step 2: Create the example file**

Create `cf-worker/.dev.vars.example`:

```
# Local development environment variables.
# Copy this file to cf-worker/.dev.vars and fill in real values.
# .dev.vars is gitignored; .dev.vars.example is committed.

# Comma-separated origins allowed for CORS / better-auth trustedOrigins.
# Add http://localhost:3000 to allow the local frontend dev server to talk to the local worker.
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:8787

# Enables the test-only POST /test/seed endpoint.
# When this variable is empty/absent, the route is not registered and returns 404.
# Use any opaque value; the secret is required as the X-E2E-Seed-Secret header.
# Never set this in production.
E2E_SEED_SECRET=local-only-do-not-deploy
```

- [ ] **Step 3: Commit**

```bash
git add cf-worker/.dev.vars.example
git commit -m "Add cf-worker/.dev.vars.example documenting local env vars"
```

---

### Task 3: Add seed types to `shared-types/index.ts`

**Files:**
- Modify: `shared-types/index.ts`

- [ ] **Step 1: Append the new types**

Add to the bottom of `shared-types/index.ts`:

```ts
// =====================
// E2E test seed endpoint (POST /test/seed)
// Available only in local cf-worker; never registered in deployed environments.
// =====================

export interface SeedRequest {
  users?: Array<{
    alias: string;
    name?: string;
    email?: string;
    password?: string;
    username?: string;
  }>;
  groups?: Array<{
    alias: string;
    name?: string;
    members: string[];
    defaultCurrency?: string;
    budgets?: Array<{
      alias: string;
      name: string;
      description?: string;
    }>;
    metadata?: Record<string, unknown>;
  }>;
  transactions?: Array<{
    alias: string;
    group: string;
    description?: string;
    amount: number;
    currency?: string;
    paidByShares: Record<string, number>;
    splitPctShares: Record<string, number>;
    createdAt?: string;
  }>;
  budgetEntries?: Array<{
    alias: string;
    group: string;
    budget: string;
    description?: string;
    amount: number;
    currency?: string;
    addedTime?: string;
  }>;
  // expenseBudgetLinks is intentionally NOT in this version.
  // The linking spec adds it in its own plan.
  scheduledActions?: unknown[];
  authenticate?: string[];
}

export interface SeedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  sameSite: "Lax" | "Strict" | "None";
  httpOnly: boolean;
  secure: boolean;
  expires?: number;
}

export interface SeedResponse {
  ids: {
    users: Record<string, { id: string; email: string; username: string }>;
    groups: Record<string, { id: string }>;
    transactions: Record<string, { id: string }>;
    budgetEntries: Record<string, { id: string }>;
  };
  sessions: Record<string, { cookies: SeedCookie[] }>;
}
```

- [ ] **Step 2: Run TS check**

Run: `yarn lint`
Expected: passes (TypeScript compiles).

- [ ] **Step 3: Commit**

```bash
git add shared-types/index.ts
git commit -m "Add SeedRequest/SeedResponse types for /test/seed"
```

---

### Task 4: Add `/test/seed` handler skeleton with env-var gate (TDD: gate behavior)

**Files:**
- Create: `cf-worker/src/handlers/test-seed.ts`
- Create: `cf-worker/src/tests/test-seed.test.ts`
- Modify: `cf-worker/src/index.ts`

- [ ] **Step 1: Write the failing test for the gate**

Create `cf-worker/src/tests/test-seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createTestRequest } from "./test-utils";
import worker from "../index";

describe("POST /test/seed gate", () => {
  it("returns 404 when E2E_SEED_SECRET env var is empty", async () => {
    const originalSecret = env.E2E_SEED_SECRET;
    // @ts-expect-error — runtime mutation for test
    env.E2E_SEED_SECRET = "";
    try {
      const req = createTestRequest("/test/seed", "POST", {});
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(404);
    } finally {
      // @ts-expect-error
      env.E2E_SEED_SECRET = originalSecret;
    }
  });

  it("returns 404 when X-E2E-Seed-Secret header missing", async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it("returns 404 when X-E2E-Seed-Secret header value mismatches", async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "wrong",
      },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it("returns 200 (or 400 for empty payload) when secret matches", async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "test-secret",
      },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, env);
    expect([200, 400]).toContain(res.status);  // accepts both — empty payload may 400 later, but route is reachable
  });
});
```

- [ ] **Step 2: Add `E2E_SEED_SECRET` to the test env**

Modify `cf-worker/.dev.vars` to include `E2E_SEED_SECRET=test-secret-for-vitest` (or whatever `cloudflare:test` picks up — Vitest with the Cloudflare pool reads `.dev.vars` for `env` bindings).

If the existing setup uses a different mechanism (e.g., `wrangler.toml` `[vars]`), follow that pattern. The goal: `env.E2E_SEED_SECRET` is non-empty during Vitest runs.

- [ ] **Step 3: Run test, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL — route doesn't exist; all assertions fail.

- [ ] **Step 4: Implement the handler skeleton**

Create `cf-worker/src/handlers/test-seed.ts`:

```ts
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import { createErrorResponse, createJsonResponse } from "../utils";

const SEED_SECRET_HEADER = "X-E2E-Seed-Secret";

export async function handleTestSeed(
  request: Request,
  env: Env,
): Promise<Response> {
  // Layer 2: per-request secret check
  const provided = request.headers.get(SEED_SECRET_HEADER);
  if (!provided || provided !== env.E2E_SEED_SECRET) {
    return createErrorResponse("Not Found", 404, request, env);
  }

  let payload: SeedRequest;
  try {
    payload = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON", 400, request, env);
  }

  // Validation + entity creation come in subsequent tasks.
  // For now, return a stub response so the gate test passes.
  const response: SeedResponse = {
    ids: { users: {}, groups: {}, transactions: {}, budgetEntries: {} },
    sessions: {},
  };
  return createJsonResponse(response, 200, {}, request, env);
}
```

- [ ] **Step 5: Wire the route in `cf-worker/src/index.ts`**

Import:

```ts
import { handleTestSeed } from "./handlers/test-seed";
```

Add this branch BEFORE `handleApiRoutes` is called, AFTER the `/health` branch from Task 1:

```ts
if (path === "/test/seed") {
  // Layer 1: env-var presence gate. If unset, the route is not registered.
  if (!env.E2E_SEED_SECRET) {
    return createErrorResponse("Not Found", 404, request, env);
  }
  if (request.method !== "POST") {
    return createErrorResponse("Method not allowed", 405, request, env);
  }
  return await handleTestSeed(request, env);
}
```

- [ ] **Step 6: Run test, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 7: Run full cf-worker test suite**

Run: `cd cf-worker && yarn test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts cf-worker/src/index.ts cf-worker/.dev.vars
git commit -m "Add /test/seed handler skeleton with env-var gate"
```

---

### Task 5: Add validation + alias resolution to `/test/seed` (TDD)

**Files:**
- Modify: `cf-worker/src/handlers/test-seed.ts`
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append validation tests**

Append to `cf-worker/src/tests/test-seed.test.ts`:

```ts
describe("POST /test/seed validation", () => {
  const headers = {
    "Content-Type": "application/json",
    "X-E2E-Seed-Secret": "test-secret",
  };
  const url = "http://test.local/test/seed";

  beforeEach(() => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
  });

  it("returns 400 when a transaction references unknown group alias", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        users: [{ alias: "u" }],
        transactions: [{
          alias: "t", group: "missing", amount: 100,
          paidByShares: { u: 100 }, splitPctShares: { u: 100 },
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/group.*missing/i);
  });

  it("returns 400 when paidByShares sum doesn't equal amount", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{ alias: "g", members: ["u"] }],
        transactions: [{
          alias: "t", group: "g", amount: 100,
          paidByShares: { u: 50 },  // mismatch
          splitPctShares: { u: 100 },
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/paidByShares.*sum/i);
  });

  it("returns 400 when splitPctShares doesn't sum to 100", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{ alias: "g", members: ["u"] }],
        transactions: [{
          alias: "t", group: "g", amount: 100,
          paidByShares: { u: 100 },
          splitPctShares: { u: 90 },  // mismatch
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown currency", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{ alias: "g", members: ["u"], defaultCurrency: "XYZ" }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when authenticate references unknown user alias", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        users: [{ alias: "u" }],
        authenticate: ["bob"],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when alias is reused within users[]", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        users: [{ alias: "u" }, { alias: "u" }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 when group member references unknown user alias", async () => {
    const req = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        groups: [{ alias: "g", members: ["ghost"] }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL — handler doesn't validate yet (returns 200 stub).

- [ ] **Step 3: Implement validation**

Replace the contents of `cf-worker/src/handlers/test-seed.ts` with:

```ts
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import { createErrorResponse, createJsonResponse } from "../utils";

const SEED_SECRET_HEADER = "X-E2E-Seed-Secret";

const VALID_CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF", "CNY", "SGD"];

function fail(message: string, request: Request, env: Env): Response {
  return createErrorResponse(message, 400, request, env);
}

function validate(payload: SeedRequest): string | null {
  // Alias uniqueness
  const userAliases = new Set<string>();
  for (const u of payload.users ?? []) {
    if (userAliases.has(u.alias)) return `users alias '${u.alias}' duplicated`;
    userAliases.add(u.alias);
  }
  const groupAliases = new Set<string>();
  for (const g of payload.groups ?? []) {
    if (groupAliases.has(g.alias)) return `groups alias '${g.alias}' duplicated`;
    groupAliases.add(g.alias);
    for (const member of g.members) {
      if (!userAliases.has(member)) return `group '${g.alias}' member '${member}' not in users[]`;
    }
    if (g.defaultCurrency && !VALID_CURRENCIES.includes(g.defaultCurrency)) {
      return `group '${g.alias}' has invalid currency '${g.defaultCurrency}'`;
    }
  }
  const budgetAliases = new Map<string, string>();  // budgetAlias -> groupAlias
  for (const g of payload.groups ?? []) {
    for (const b of g.budgets ?? []) {
      if (budgetAliases.has(b.alias)) return `budget alias '${b.alias}' duplicated`;
      budgetAliases.set(b.alias, g.alias);
    }
  }
  const txAliases = new Set<string>();
  for (const t of payload.transactions ?? []) {
    if (txAliases.has(t.alias)) return `transactions alias '${t.alias}' duplicated`;
    txAliases.add(t.alias);
    if (!groupAliases.has(t.group)) return `transaction '${t.alias}' references unknown group '${t.group}'`;
    for (const userAlias of Object.keys(t.paidByShares)) {
      if (!userAliases.has(userAlias)) return `transaction '${t.alias}' paidByShares references unknown user '${userAlias}'`;
    }
    for (const userAlias of Object.keys(t.splitPctShares)) {
      if (!userAliases.has(userAlias)) return `transaction '${t.alias}' splitPctShares references unknown user '${userAlias}'`;
    }
    const paidSum = Object.values(t.paidByShares).reduce((a, b) => a + b, 0);
    if (Math.abs(paidSum - t.amount) > 0.001) {
      return `transaction '${t.alias}' paidByShares sum ${paidSum} != amount ${t.amount}`;
    }
    const pctSum = Object.values(t.splitPctShares).reduce((a, b) => a + b, 0);
    if (Math.abs(pctSum - 100) > 0.001) {
      return `transaction '${t.alias}' splitPctShares sum ${pctSum} != 100`;
    }
    if (t.currency && !VALID_CURRENCIES.includes(t.currency)) {
      return `transaction '${t.alias}' invalid currency '${t.currency}'`;
    }
  }
  const beAliases = new Set<string>();
  for (const be of payload.budgetEntries ?? []) {
    if (beAliases.has(be.alias)) return `budgetEntries alias '${be.alias}' duplicated`;
    beAliases.add(be.alias);
    if (!groupAliases.has(be.group)) return `budgetEntry '${be.alias}' references unknown group '${be.group}'`;
    if (!budgetAliases.has(be.budget)) return `budgetEntry '${be.alias}' references unknown budget '${be.budget}'`;
    if (budgetAliases.get(be.budget) !== be.group) return `budgetEntry '${be.alias}' budget '${be.budget}' belongs to a different group`;
    if (be.currency && !VALID_CURRENCIES.includes(be.currency)) {
      return `budgetEntry '${be.alias}' invalid currency '${be.currency}'`;
    }
  }
  for (const alias of payload.authenticate ?? []) {
    if (!userAliases.has(alias)) return `authenticate references unknown user '${alias}'`;
  }
  return null;
}

export async function handleTestSeed(
  request: Request,
  env: Env,
): Promise<Response> {
  const provided = request.headers.get(SEED_SECRET_HEADER);
  if (!provided || provided !== env.E2E_SEED_SECRET) {
    return createErrorResponse("Not Found", 404, request, env);
  }

  let payload: SeedRequest;
  try {
    payload = await request.json();
  } catch {
    return fail("Invalid JSON", request, env);
  }

  const error = validate(payload);
  if (error) return fail(error, request, env);

  // Entity creation comes in the next tasks.
  const response: SeedResponse = {
    ids: { users: {}, groups: {}, transactions: {}, budgetEntries: {} },
    sessions: {},
  };
  return createJsonResponse(response, 200, {}, request, env);
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Add validation and alias resolution for /test/seed"
```

---

### Task 6: Implement user creation in `/test/seed` (TDD)

**Files:**
- Modify: `cf-worker/src/handlers/test-seed.ts`
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append the test**

Append to `cf-worker/src/tests/test-seed.test.ts`:

```ts
import { user as userTable } from "../db/schema/auth-schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";

describe("POST /test/seed user creation", () => {
  beforeEach(async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    await completeCleanupDatabase(env);  // existing helper
    await setupDatabase(env);
  });

  it("creates users via better-auth and returns IDs/emails", async () => {
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "test-secret",
      },
      body: JSON.stringify({
        users: [{ alias: "alice" }, { alias: "bob", name: "Bob Builder" }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ids.users.alice).toBeDefined();
    expect(body.ids.users.alice.id).toMatch(/^.+/);
    expect(body.ids.users.alice.email).toMatch(/@e2e\.test$/);
    expect(body.ids.users.bob.email).toMatch(/@e2e\.test$/);

    // Verify rows exist in DB
    const db = getDb(env);
    const aliceRow = await db.select().from(userTable).where(eq(userTable.id, body.ids.users.alice.id));
    expect(aliceRow.length).toBe(1);
    expect(aliceRow[0].name).toBe("alice");  // default = alias

    const bobRow = await db.select().from(userTable).where(eq(userTable.id, body.ids.users.bob.id));
    expect(bobRow[0].name).toBe("Bob Builder");
  });
});
```

(Add the necessary imports for `completeCleanupDatabase` and `setupDatabase` from `./test-utils` at the top of the file.)

- [ ] **Step 2: Run, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL — `body.ids.users.alice` is undefined.

- [ ] **Step 3: Implement user creation**

Update `cf-worker/src/handlers/test-seed.ts` to add a user-creation phase. Add these imports at the top:

```ts
import { auth } from "../auth";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
```

Add a helper before `handleTestSeed`:

```ts
async function createUsers(
  payload: SeedRequest,
  env: Env,
): Promise<Record<string, { id: string; email: string; username: string; password: string }>> {
  const result: Record<string, { id: string; email: string; username: string; password: string }> = {};
  const authInstance = auth(env);

  for (const u of payload.users ?? []) {
    const email = u.email ?? `${u.alias}-${nanoid()}@e2e.test`;
    const username = u.username ?? `${u.alias}-${nanoid()}`;
    const password = u.password ?? `pw-${nanoid()}-${nanoid()}`;
    const name = u.name ?? u.alias;

    const signUp = await authInstance.api.signUpEmail({
      body: { email, password, name, username },
    });
    if (!signUp || !signUp.user) {
      throw new Error(`failed to create user '${u.alias}'`);
    }
    result[u.alias] = { id: signUp.user.id, email, username, password };
  }
  return result;
}
```

Modify the `handleTestSeed` body — after validation passes, add:

```ts
let users: Record<string, { id: string; email: string; username: string; password: string }>;
try {
  users = await createUsers(payload, env);
} catch (e) {
  return fail(`user creation failed: ${(e as Error).message}`, request, env);
}

const response: SeedResponse = {
  ids: {
    users: Object.fromEntries(
      Object.entries(users).map(([alias, u]) => [
        alias,
        { id: u.id, email: u.email, username: u.username },
      ]),
    ),
    groups: {},
    transactions: {},
    budgetEntries: {},
  },
  sessions: {},
};
return createJsonResponse(response, 200, {}, request, env);
```

(Replace the previous stub response with this.)

- [ ] **Step 4: Run, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Implement user creation in /test/seed via better-auth"
```

---

### Task 7: Implement group + group_budgets creation (TDD)

**Files:**
- Modify: `cf-worker/src/handlers/test-seed.ts`
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append the test**

```ts
import { groups, groupBudgets } from "../db/schema/schema";

describe("POST /test/seed group creation", () => {
  beforeEach(async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  it("creates a group with budgets and returns IDs", async () => {
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "test-secret",
      },
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{
          alias: "g",
          members: ["u"],
          defaultCurrency: "USD",
          budgets: [{ alias: "groceries", name: "Groceries" }],
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ids.groups.g.id).toMatch(/^.+/);

    const db = getDb(env);
    const groupRow = await db.select().from(groups).where(eq(groups.groupid, body.ids.groups.g.id));
    expect(groupRow.length).toBe(1);
    expect(groupRow[0].defaultCurrency).toBe("USD");

    const budgetRows = await db.select().from(groupBudgets).where(eq(groupBudgets.groupId, body.ids.groups.g.id));
    expect(budgetRows.length).toBe(1);
    expect(budgetRows[0].budgetName).toBe("Groceries");
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement group creation**

In `cf-worker/src/handlers/test-seed.ts`, add at the top (alongside other imports):

```ts
import { ulid } from "ulid";
import { groups, groupBudgets, users as usersTable } from "../db/schema/schema";
import { getDb } from "../db";
```

(Match the actual exports from `../db/schema/schema` — if there isn't a `users` table there, just import what exists. Look at the schema file before editing if unsure.)

Add a helper:

```ts
async function createGroups(
  payload: SeedRequest,
  userIds: Record<string, { id: string }>,
  db: ReturnType<typeof getDb>,
): Promise<{ groupIds: Record<string, { id: string }>; budgetIds: Record<string, { id: string }> }> {
  const groupIds: Record<string, { id: string }> = {};
  const budgetIds: Record<string, { id: string }> = {};
  const now = new Date().toISOString();

  for (const g of payload.groups ?? []) {
    const groupId = ulid();
    groupIds[g.alias] = { id: groupId };
    await db.insert(groups).values({
      groupid: groupId,
      groupName: g.name ?? `e2e-group-${nanoid()}`,
      // members: stored as JSON array of user IDs (matches existing schema)
      // — verify the field name and shape against the actual schema before merging
      // and adjust accordingly.
      // budgets: stored historically as JSON; new group_budgets rows are the source of truth
      defaultCurrency: g.defaultCurrency ?? "GBP",
      metadata: g.metadata ? JSON.stringify(g.metadata) : null,
      createdAt: now,
    });

    // Attach members. The current schema stores group membership as a JSON column
    // on `groups`; if a separate `group_users` table exists, insert into that instead.
    // Implementation note: check `cf-worker/src/db/schema/schema.ts` and follow the
    // existing convention used by `createTestUserData` in `cf-worker/src/tests/test-utils.ts`.

    for (const b of g.budgets ?? []) {
      const budgetId = ulid();
      budgetIds[b.alias] = { id: budgetId };
      await db.insert(groupBudgets).values({
        id: budgetId,
        groupId,
        budgetName: b.name,
        description: b.description ?? "",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return { groupIds, budgetIds };
}
```

In `handleTestSeed`, after `createUsers`:

```ts
const db = getDb(env);
const { groupIds, budgetIds } = await createGroups(payload, users, db);
```

And update the response:

```ts
const response: SeedResponse = {
  ids: {
    users: Object.fromEntries(...),
    groups: groupIds,
    transactions: {},
    budgetEntries: {},
  },
  sessions: {},
};
```

**Implementation note for the engineer:** The exact group member persistence mechanism (JSON column on `groups` vs. a separate join table) and the field names (`groupid` vs. `group_id`, `groupName` vs. `group_name`) must be confirmed by reading `cf-worker/src/db/schema/schema.ts` and the working `createTestUserData()` in `cf-worker/src/tests/test-utils.ts` — replicate the pattern that function uses. The seed handler must produce the same shape of group rows that production handlers produce; mismatches show up as 500s in subsequent tasks.

- [ ] **Step 4: Run, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Implement group + group_budgets creation in /test/seed"
```

---

### Task 8: Implement transaction + transaction_users creation (TDD)

**Files:**
- Modify: `cf-worker/src/handlers/test-seed.ts`
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append the test**

```ts
import { transactions, transactionUsers } from "../db/schema/schema";

describe("POST /test/seed transaction creation", () => {
  beforeEach(async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  it("creates a transaction with split shares", async () => {
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "test-secret",
      },
      body: JSON.stringify({
        users: [{ alias: "u1" }, { alias: "u2" }],
        groups: [{ alias: "g", members: ["u1", "u2"] }],
        transactions: [{
          alias: "t",
          group: "g",
          amount: 100,
          paidByShares: { u1: 100 },
          splitPctShares: { u1: 60, u2: 40 },
          description: "Tesco",
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();

    const txId = body.ids.transactions.t.id;
    expect(txId).toMatch(/^tx_/);

    const db = getDb(env);
    const txRows = await db.select().from(transactions).where(eq(transactions.transactionId, txId));
    expect(txRows.length).toBe(1);
    expect(txRows[0].amount).toBe(100);
    expect(txRows[0].description).toBe("Tesco");

    const tuRows = await db.select().from(transactionUsers).where(eq(transactionUsers.transactionId, txId));
    expect(tuRows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `test-seed.ts`:

```ts
import { createSplitTransactionFromRequest } from "../utils/scheduled-action-execution";

async function createTransactions(
  payload: SeedRequest,
  userIds: Record<string, { id: string }>,
  groupIds: Record<string, { id: string }>,
  db: ReturnType<typeof getDb>,
  env: Env,
): Promise<Record<string, { id: string }>> {
  const txIds: Record<string, { id: string }> = {};

  for (const t of payload.transactions ?? []) {
    const txId = `tx_${ulid()}`;
    txIds[t.alias] = { id: txId };
    const groupId = groupIds[t.group].id;

    // Resolve user-alias keys in shares to real user IDs
    const paidByShares: Record<string, number> = {};
    for (const [alias, val] of Object.entries(t.paidByShares)) {
      paidByShares[userIds[alias].id] = val;
    }
    const splitPctShares: Record<string, number> = {};
    for (const [alias, val] of Object.entries(t.splitPctShares)) {
      splitPctShares[userIds[alias].id] = val;
    }

    const splitRequest = {
      amount: t.amount,
      description: t.description ?? `e2e-tx-${nanoid()}`,
      paidByShares,
      splitPctShares,
      currency: t.currency ?? "GBP",
    };

    const result = await createSplitTransactionFromRequest(
      splitRequest,
      groupId,
      db,
      env,
      txId,
    );
    if (result.statements.length > 0) {
      const queries = result.statements.map((s) => s.query);
      await db.batch([queries[0], ...queries.slice(1)]);
    }
  }

  return txIds;
}
```

Wire into `handleTestSeed` after `createGroups`:

```ts
const transactionIds = await createTransactions(payload, users, groupIds, db, env);
```

And update response:

```ts
ids: {
  users: ...,
  groups: groupIds,
  transactions: transactionIds,
  budgetEntries: {},
},
```

- [ ] **Step 4: Run, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Implement transaction + transaction_users creation in /test/seed"
```

---

### Task 9: Implement budget_entries creation (TDD)

**Files:**
- Modify: `cf-worker/src/handlers/test-seed.ts`
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append the test**

```ts
import { budgetEntries } from "../db/schema/schema";

describe("POST /test/seed budget entries", () => {
  beforeEach(async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  it("creates budget entries linked to group_budgets", async () => {
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Seed-Secret": "test-secret" },
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{
          alias: "g",
          members: ["u"],
          budgets: [{ alias: "groceries", name: "Groceries" }],
        }],
        budgetEntries: [{
          alias: "be",
          group: "g",
          budget: "groceries",
          amount: 50,
          description: "weekly shop",
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    const beId = body.ids.budgetEntries.be.id;

    const db = getDb(env);
    const rows = await db.select().from(budgetEntries).where(eq(budgetEntries.budgetEntryId, beId));
    expect(rows.length).toBe(1);
    expect(rows[0].amount).toBe(50);
    expect(rows[0].budgetId).toBe(body.ids.groups.g.id ? "(should match the budget alias's id)" : "");
    // Adjust the assertion above based on what budgetId actually references in your schema.
  });
});
```

(The assertion structure should follow the budget schema — `budgetId` references `groupBudgets.id`. Read `cf-worker/src/db/schema/schema.ts` to confirm before refining the assertion.)

- [ ] **Step 2: Run, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `test-seed.ts`:

```ts
async function createBudgetEntries(
  payload: SeedRequest,
  groupIds: Record<string, { id: string }>,
  budgetIds: Record<string, { id: string }>,
  db: ReturnType<typeof getDb>,
): Promise<Record<string, { id: string }>> {
  const beIds: Record<string, { id: string }> = {};

  for (const be of payload.budgetEntries ?? []) {
    const beId = ulid();
    beIds[be.alias] = { id: beId };
    await db.insert(budgetEntries).values({
      budgetEntryId: beId,
      budgetId: budgetIds[be.budget].id,
      description: be.description ?? `e2e-budget-${nanoid()}`,
      amount: be.amount,
      price: String(be.amount),       // existing schema uses `price` text field
      currency: be.currency ?? "GBP",
      addedTime: be.addedTime ?? new Date().toISOString(),
    });
  }

  return beIds;
}
```

Wire into `handleTestSeed` after `createTransactions`:

```ts
const budgetEntryIds = await createBudgetEntries(payload, groupIds, budgetIds, db);
```

Update response:

```ts
ids: {
  users: ...,
  groups: groupIds,
  transactions: transactionIds,
  budgetEntries: budgetEntryIds,
},
```

- [ ] **Step 4: Run, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Implement budget_entries creation in /test/seed"
```

---

### Task 10: Implement session cookie issuance (TDD)

**Files:**
- Modify: `cf-worker/src/handlers/test-seed.ts`
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe("POST /test/seed authenticate / cookies", () => {
  beforeEach(async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  it("returns session cookies for authenticate users", async () => {
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Seed-Secret": "test-secret" },
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{ alias: "g", members: ["u"] }],
        authenticate: ["u"],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessions.u).toBeDefined();
    expect(body.sessions.u.cookies.length).toBeGreaterThan(0);
    const sessionCookie = body.sessions.u.cookies.find((c: { name: string }) => c.name.includes("session"));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie.value).toMatch(/^.+/);
    expect(sessionCookie.httpOnly).toBe(true);
  });

  it("issued cookie authenticates a subsequent request", async () => {
    const seedReq = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Seed-Secret": "test-secret" },
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{ alias: "g", members: ["u"] }],
        authenticate: ["u"],
      }),
    });
    const seedRes = await worker.fetch(seedReq, env);
    const seedBody = await seedRes.json();
    const cookies = seedBody.sessions.u.cookies;
    const cookieHeader = cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");

    // Hit an authenticated endpoint with the cookie (e.g., /balances)
    const authReq = new Request("http://test.local/.netlify/functions/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    const authRes = await worker.fetch(authReq, env);
    expect([200, 400]).toContain(authRes.status);  // not 401/403; actual data shape may vary
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement session issuance**

In `test-seed.ts`, add a helper:

```ts
async function issueSessions(
  payload: SeedRequest,
  users: Record<string, { id: string; email: string; password: string }>,
  env: Env,
): Promise<Record<string, { cookies: SeedCookie[] }>> {
  if (!payload.authenticate || payload.authenticate.length === 0) return {};

  const sessions: Record<string, { cookies: SeedCookie[] }> = {};
  const authInstance = auth(env);

  for (const alias of payload.authenticate) {
    const u = users[alias];
    // Use better-auth's signIn to obtain a session cookie. The signIn API returns
    // headers with Set-Cookie that we parse.
    const signInResult = await authInstance.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    const setCookies = signInResult.headers.getSetCookie?.() ?? [];
    const cookies: SeedCookie[] = setCookies.map(parseCookie);
    sessions[alias] = { cookies };
  }

  return sessions;
}

// Parse a Set-Cookie header string into a SeedCookie object.
function parseCookie(setCookie: string): SeedCookie {
  const parts = setCookie.split(";").map((s) => s.trim());
  const [nameValue, ...attrs] = parts;
  const eq = nameValue.indexOf("=");
  const name = nameValue.slice(0, eq);
  const value = nameValue.slice(eq + 1);
  const attrMap = new Map<string, string>();
  for (const a of attrs) {
    const i = a.indexOf("=");
    if (i === -1) attrMap.set(a.toLowerCase(), "true");
    else attrMap.set(a.slice(0, i).toLowerCase(), a.slice(i + 1));
  }
  return {
    name,
    value,
    domain: attrMap.get("domain") ?? "",
    path: attrMap.get("path") ?? "/",
    sameSite: (attrMap.get("samesite") as "Lax" | "Strict" | "None" | undefined) ?? "Lax",
    httpOnly: attrMap.has("httponly"),
    secure: attrMap.has("secure"),
    expires: attrMap.has("max-age")
      ? Date.now() / 1000 + Number(attrMap.get("max-age"))
      : undefined,
  };
}
```

Wire into `handleTestSeed` after entity creation:

```ts
const sessions = await issueSessions(payload, users, env);
```

Update response:

```ts
const response: SeedResponse = {
  ids: { users: ..., groups: groupIds, transactions: transactionIds, budgetEntries: budgetEntryIds },
  sessions,
};
```

**Engineer note:** If `auth.api.signInEmail` is not the correct method name (better-auth's API surface varies by version), check the auth instance's available methods at runtime: `Object.keys(authInstance.api)`. Look for `signIn*`, `createSession`, or similar. The test's "subsequent request authenticated" assertion is the ground truth — if the cookie returned doesn't authenticate a follow-up request, try the alternative API.

- [ ] **Step 4: Run, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Implement session cookie issuance in /test/seed"
```

---

### Task 11: Verify atomicity — failing batch leaves no rows (TDD)

**Files:**
- Modify: `cf-worker/src/tests/test-seed.test.ts`

- [ ] **Step 1: Append the atomicity test**

```ts
describe("POST /test/seed atomicity", () => {
  beforeEach(async () => {
    // @ts-expect-error
    env.E2E_SEED_SECRET = "test-secret";
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  it("rolls back when later step fails (no partial state)", async () => {
    // Force failure: reference a non-existent user id in paidByShares after passing validation
    // by patching the schema temporarily, OR construct a valid payload that cf-worker
    // will reject at insert time. A simple forced failure: include an oversize description
    // that exceeds the column's length limit (transactions.description is varchar(255)).
    const oversizeDescription = "x".repeat(300);
    const req = new Request("http://test.local/test/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Seed-Secret": "test-secret" },
      body: JSON.stringify({
        users: [{ alias: "u" }],
        groups: [{ alias: "g", members: ["u"] }],
        transactions: [{
          alias: "t",
          group: "g",
          amount: 10,
          paidByShares: { u: 10 },
          splitPctShares: { u: 100 },
          description: oversizeDescription,
        }],
      }),
    });
    const res = await worker.fetch(req, env);
    expect([400, 500]).toContain(res.status);

    // Verify NO users, groups, or transactions persisted
    const db = getDb(env);
    const userCount = (await db.select().from(userTable)).length;
    const groupCount = (await db.select().from(groups)).length;
    const txCount = (await db.select().from(transactions)).length;
    expect(userCount).toBe(0);
    expect(groupCount).toBe(0);
    expect(txCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect fail (likely)**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: depending on the current implementation, this may fail because user creation runs BEFORE transaction creation; if transaction creation fails, the user row already exists.

- [ ] **Step 3: Wrap entire seed in a try/catch with rollback**

The cleanest fix: collect all DB statements first (without executing), then run a single `db.batch([...])`. If user creation through better-auth doesn't support deferred execution, fall back to a try/catch that explicitly deletes any inserted rows on failure.

Modify `handleTestSeed`:

```ts
export async function handleTestSeed(request: Request, env: Env): Promise<Response> {
  // ... gate + validation as before ...

  const db = getDb(env);
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const users = await createUsers(payload, env);
    cleanup.push(async () => {
      for (const u of Object.values(users)) {
        await db.delete(userTable).where(eq(userTable.id, u.id));
      }
    });

    const { groupIds, budgetIds } = await createGroups(payload, users, db);
    cleanup.push(async () => {
      for (const g of Object.values(groupIds)) {
        await db.delete(groups).where(eq(groups.groupid, g.id));
      }
    });

    const transactionIds = await createTransactions(payload, users, groupIds, db, env);
    cleanup.push(async () => {
      for (const t of Object.values(transactionIds)) {
        await db.delete(transactions).where(eq(transactions.transactionId, t.id));
        await db.delete(transactionUsers).where(eq(transactionUsers.transactionId, t.id));
      }
    });

    const budgetEntryIds = await createBudgetEntries(payload, groupIds, budgetIds, db);
    const sessions = await issueSessions(payload, users, env);

    const response: SeedResponse = { /* ... */ };
    return createJsonResponse(response, 200, {}, request, env);
  } catch (e) {
    // Best-effort rollback in reverse order
    for (const undo of cleanup.reverse()) {
      try { await undo(); } catch { /* swallow */ }
    }
    return fail(`seed failed: ${(e as Error).message}`, request, env);
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd cf-worker && yarn test src/tests/test-seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full cf-worker suite**

Run: `cd cf-worker && yarn test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add cf-worker/src/handlers/test-seed.ts cf-worker/src/tests/test-seed.test.ts
git commit -m "Add atomic rollback to /test/seed"
```

---

### Task 12: Update CORS for `localhost:3000`

**Files:**
- Modify: `cf-worker/.dev.vars` (gitignored)
- Modify: `cf-worker/.dev.vars.example` (already covers this)

- [ ] **Step 1: Verify trustedOrigins handling**

Open `cf-worker/src/auth.ts` and the CORS middleware (search for `trustedOrigins` and `Access-Control-Allow-Origin` in the worker code). Confirm both consume an env var (likely `env.TRUSTED_ORIGINS`, comma-separated).

- [ ] **Step 2: Update local `.dev.vars`**

Append to (or create) `cf-worker/.dev.vars`:

```
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:8787
E2E_SEED_SECRET=local-only-do-not-deploy
```

- [ ] **Step 3: Run cf-worker dev locally to confirm it boots**

Run: `cd cf-worker && yarn dev`
Wait for: log line indicating worker is ready.
Visit: `http://localhost:8787/health` in a browser → expect `{ "status": "ok" }`.
Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit (only the example, since `.dev.vars` is gitignored)**

If `.dev.vars.example` was already committed in Task 2, no commit needed here. Otherwise:

```bash
git add cf-worker/.dev.vars.example
git commit -m "Document TRUSTED_ORIGINS in .dev.vars.example"
```

---

### Task 13: Frontend — add `seed-client.ts`

**Files:**
- Create: `src/e2e/fixtures/seed-client.ts`

- [ ] **Step 1: Write the file**

```ts
import type { SeedRequest, SeedResponse } from "../../../shared-types";

export const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

export const isLocalBackend = BACKEND_URL.startsWith("http://localhost");

export async function callSeedEndpoint(payload: SeedRequest): Promise<SeedResponse> {
  const secret = process.env.E2E_SEED_SECRET;
  if (!secret) {
    throw new Error(
      "E2E_SEED_SECRET is not set; seed-based fixtures cannot run. " +
      "Set it via Playwright's webServer env or your shell.",
    );
  }
  const res = await fetch(`${BACKEND_URL}/test/seed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Seed-Secret": secret,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`seed failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SeedResponse;
}
```

- [ ] **Step 2: Run TS check**

Run: `yarn lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/fixtures/seed-client.ts
git commit -m "Add typed seed-client wrapper around POST /test/seed"
```

---

### Task 14: Frontend — add `factories.ts`

**Files:**
- Create: `src/e2e/fixtures/factories.ts`

- [ ] **Step 1: Write the file**

```ts
import { customAlphabet } from "nanoid";
import type { SeedRequest } from "../../../shared-types";

const nano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

type UserSpec = NonNullable<SeedRequest["users"]>[number];
type GroupSpec = NonNullable<SeedRequest["groups"]>[number];
type TxSpec = NonNullable<SeedRequest["transactions"]>[number];
type BeSpec = NonNullable<SeedRequest["budgetEntries"]>[number];

export const factories = {
  user(overrides: Partial<UserSpec> = {}): UserSpec {
    return { alias: overrides.alias ?? `u-${nano()}`, ...overrides };
  },

  group(overrides: Partial<GroupSpec> = {}): GroupSpec {
    return {
      alias: overrides.alias ?? `g-${nano()}`,
      members: overrides.members ?? [],
      defaultCurrency: overrides.defaultCurrency ?? "GBP",
      budgets: overrides.budgets ?? [{ alias: `b-${nano()}`, name: "Default" }],
      ...overrides,
    };
  },

  transaction(args: {
    alias?: string;
    group: string;
    paidBy: string;             // user alias
    amount: number;
    currency?: string;
    description?: string;
    splitAcross?: string[];     // user aliases
    splitPcts?: number[];       // matching percentages summing to 100
    paidByShares?: Record<string, number>;
    splitPctShares?: Record<string, number>;
  }): TxSpec {
    const splitAcross = args.splitAcross ?? [args.paidBy];
    const splitPcts =
      args.splitPcts ?? splitAcross.map(() => 100 / splitAcross.length);
    return {
      alias: args.alias ?? `t-${nano()}`,
      group: args.group,
      amount: args.amount,
      currency: args.currency ?? "GBP",
      description: args.description ?? `e2e-tx-${nano()}`,
      paidByShares: args.paidByShares ?? { [args.paidBy]: args.amount },
      splitPctShares:
        args.splitPctShares ??
        Object.fromEntries(splitAcross.map((u, i) => [u, splitPcts[i]])),
    };
  },

  budgetEntry(args: {
    alias?: string;
    group: string;
    budget: string;
    amount: number;
    currency?: string;
    description?: string;
    addedTime?: string;
  }): BeSpec {
    return {
      alias: args.alias ?? `be-${nano()}`,
      group: args.group,
      budget: args.budget,
      amount: args.amount,
      currency: args.currency ?? "GBP",
      description: args.description ?? `e2e-be-${nano()}`,
      addedTime: args.addedTime,
    };
  },
};
```

- [ ] **Step 2: Run TS check**

Run: `yarn lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/fixtures/factories.ts
git commit -m "Add factories module with typed payload builders"
```

---

### Task 15: Frontend — extend `setup.ts` with new fixtures

**Files:**
- Modify: `src/e2e/fixtures/setup.ts`

- [ ] **Step 1: Update the file**

Replace the contents of `src/e2e/fixtures/setup.ts` with:

```ts
import { test as base, type Page } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import { TestHelper } from "../utils/test-utils";
import { testData } from "./test-data";
import { BACKEND_URL, callSeedEndpoint, isLocalBackend } from "./seed-client";
import { factories } from "./factories";

type SeedFn = (
  payload: SeedRequest,
  options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

type AuthedGroupFactory = (
  n: number,
) => Promise<{ page: Page; users: string[] }>;

export type TestFixtures = {
  // Legacy (deprecated, retained for unconverted spec files)
  testHelper: TestHelper;
  authenticatedPage: TestHelper;
  authenticatedMultiPersonPage: TestHelper;
  mockHelper: TestHelper;

  // New
  seed: SeedFn;
  authedPage: Page;
  authedPageWithGroupOf: AuthedGroupFactory;
};

export const test = base.extend<TestFixtures>({
  // ===== Legacy fixtures (kept working; new tests should not use these) =====
  testHelper: async ({ page }, use) => {
    await use(new TestHelper(page));
  },
  authenticatedPage: async ({ page }, use) => {
    const helper = new TestHelper(page);
    await helper.login(testData.users.user1);
    await use(helper);
    await helper.clearStorage();
  },
  authenticatedMultiPersonPage: async ({ page }, use) => {
    const helper = new TestHelper(page);
    await helper.login(testData.users.user3);
    await use(helper);
    await helper.clearStorage();
  },
  mockHelper: async ({ page }, use) => {
    const helper = new TestHelper(page);
    await helper.mockApiResponse("login", testData.mockResponses.login.success);
    await helper.mockApiResponse("balances", testData.mockResponses.balances.success);
    await helper.mockApiResponse("transactions_list", testData.mockResponses.transactions.success);
    await helper.mockApiResponse("budget_total", testData.mockResponses.budgetTotal.success);
    await helper.mockApiResponse("budget_list", testData.mockResponses.budgetList.success);
    await helper.mockApiResponse("budget_monthly", testData.mockResponses.budgetMonthly.success);
    await use(helper);
  },

  // ===== New fixtures =====

  seed: async ({ context }, use) => {
    const fn: SeedFn = async (payload, options) => {
      const result = await callSeedEndpoint(payload);
      const auth = options?.authenticateAs ?? payload.authenticate?.[0];
      if (auth && result.sessions[auth]) {
        await context.addCookies(
          result.sessions[auth].cookies.map((c) => ({
            name: c.name,
            value: c.value,
            url: BACKEND_URL,
            sameSite: c.sameSite,
            httpOnly: c.httpOnly,
            secure: c.secure,
            ...(c.expires !== undefined ? { expires: c.expires } : {}),
          })),
        );
      }
      return result;
    };
    await use(fn);
  },

  authedPage: async ({ page, seed }, use) => {
    await seed({
      users: [{ alias: "u" }],
      groups: [{
        alias: "g",
        members: ["u"],
        budgets: [{ alias: "b", name: "Default" }],
      }],
      authenticate: ["u"],
    });
    await page.goto("/");
    await use(page);
  },

  authedPageWithGroupOf: async ({ page, seed }, use) => {
    const factory: AuthedGroupFactory = async (n: number) => {
      const aliases = Array.from({ length: n }, (_, i) => `u${i + 1}`);
      await seed({
        users: aliases.map((a) => factories.user({ alias: a })),
        groups: [factories.group({ alias: "g", members: aliases })],
        authenticate: [aliases[0]],
      });
      await page.goto("/");
      return { page, users: aliases };
    };
    await use(factory);
  },
});

/**
 * Skip a test (or describe) when running against a remote backend that
 * doesn't expose /test/seed.
 */
export function skipIfRemoteBackend(): void {
  test.skip(!isLocalBackend, "requires local backend with /test/seed enabled");
}

export { expect } from "@playwright/test";
export { factories } from "./factories";
```

- [ ] **Step 2: Run TS check**

Run: `yarn lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/fixtures/setup.ts
git commit -m "Extend Playwright setup with seed/authedPage fixtures; deprecate legacy"
```

---

### Task 16: Update `playwright.config.ts` for dual webServer

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Replace the config**

Replace the contents of `playwright.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.test", override: false });

const backendUrl = process.env.E2E_BACKEND_URL || "http://localhost:8787";
const useLocalBackend = backendUrl.startsWith("http://localhost");

export default defineConfig({
  testDir: "./src/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 3 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html"]] : "html",
  timeout: 100 * 1000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    serviceWorkers: "block",
    testIdAttribute: "data-test-id",
    actionTimeout: 30 * 1000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: { slowMo: 400 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
  ],
  webServer: [
    ...(useLocalBackend
      ? [{
          command: "cd cf-worker && yarn dev --port=8787",
          url: "http://localhost:8787/health",
          reuseExistingServer: !process.env.CI,
          timeout: process.env.CI ? 180 * 1000 : 120 * 1000,
          env: {
            E2E_SEED_SECRET:
              process.env.E2E_SEED_SECRET || "local-only-do-not-deploy",
          },
        }]
      : []),
    {
      command: "yarn start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 180 * 1000 : 120 * 1000,
      env: {
        REACT_APP_API_BASE_URL: backendUrl,
        BROWSER: "none",
      },
    },
  ],
});
```

Important notes for the engineer:
- The previous config's `baseURL` defaulted to the remote dev worker. The new default is `http://localhost:3000` (the local frontend). `PLAYWRIGHT_BASE_URL` still overrides for ad-hoc.
- `E2E_BACKEND_URL` is the new variable that controls which cf-worker the frontend calls.
- The frontend's `REACT_APP_API_BASE_URL` is set via the webServer's `env`. Verify the React app reads this env var at runtime; if it bakes at build time only, you may need to set it before `yarn start` runs. The CRA dev server (`yarn start`) does read `REACT_APP_*` from env at startup.

- [ ] **Step 2: Run TS check**

Run: `yarn lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "Update playwright config for dual webServer (local backend default)"
```

---

### Task 17: Add new package.json scripts

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add scripts**

In the `"scripts"` section of `package.json`, add:

```json
"test:e2e:remote": "E2E_BACKEND_URL=https://splitexpense-dev.tanmaydatta.workers.dev playwright test",
"test:e2e:fresh": "rm -rf cf-worker/.wrangler/state/v3/d1 && playwright test",
```

(Keep the existing `test:e2e` script.)

- [ ] **Step 2: Verify scripts work**

Run: `yarn test:e2e:fresh --list` (just lists tests; doesn't run)
Expected: prints list of e2e tests without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add test:e2e:remote and test:e2e:fresh scripts"
```

---

### Task 18: Manually verify the local stack boots

**Files:** none (validation only)

- [ ] **Step 1: Wipe local D1**

Run: `rm -rf cf-worker/.wrangler/state/v3/d1`

- [ ] **Step 2: Boot wrangler dev manually**

Run (in one terminal): `cd cf-worker && yarn dev`
Wait for: log line indicating worker is ready on port 8787.

- [ ] **Step 3: Verify migrations applied**

Run: `curl http://localhost:8787/health`
Expected: `{ "status": "ok" }`.

- [ ] **Step 4: Boot frontend manually pointing at local worker**

Run (in another terminal): `REACT_APP_API_BASE_URL=http://localhost:8787 yarn start`
Wait for: browser opens or log says ready on port 3000.

- [ ] **Step 5: Manually exercise sign-in via UI**

Open `http://localhost:3000`. Sign-up endpoints are disabled, so use the seed endpoint to create a user:

```bash
curl -X POST http://localhost:8787/test/seed \
  -H "Content-Type: application/json" \
  -H "X-E2E-Seed-Secret: local-only-do-not-deploy" \
  -d '{ "users": [{ "alias": "tester" }], "authenticate": ["tester"] }'
```

Note the `email` and a session cookie from the response. The session should let API calls succeed.

- [ ] **Step 6: Stop both servers; record findings**

If anything failed (CORS errors, cookies not accepted, migrations missing), note it. The most common issues:
- Frontend reads `REACT_APP_API_BASE_URL` only at build time → use `craco start` directly with the env in front, or check `src/api.ts` (or wherever `fetch` is wrapped) for how it picks up the base URL.
- CORS error in browser → confirm `TRUSTED_ORIGINS` in `.dev.vars` includes `http://localhost:3000`.
- Cookies not sent on cross-origin fetch → confirm `credentials: "include"` is set on the frontend's fetch wrapper.

Fix any issues with targeted patches; commit each as a small follow-up. No new test required if the fix is purely a config string.

---

### Task 19: Pilot conversion — `expense-management.spec.ts` (preparation)

**Files:**
- Read: `src/e2e/tests/expense-management.spec.ts` (existing)
- Modify: `src/e2e/tests/expense-management.spec.ts` (rewrite in-place)

- [ ] **Step 1: Read the existing file end-to-end**

Run: `cat src/e2e/tests/expense-management.spec.ts | wc -l`  (≈ 651 lines)

Read the file carefully. Identify:
- Which tests start with UI-driven setup that's NOT testing the form (those are full-conversion candidates).
- Which tests exercise the dashboard form itself (those keep UI form fills).

- [ ] **Step 2: Plan the test-by-test conversion**

Per the spec's Section 6 classification, draft a brief comment plan in your scratch file:

```
- "should set default currency and split percentages...": FULLY convert; seed group with known defaults.
- "should successfully add an expense with valid data": HALF; setup via authedPage; form interaction stays.
- "should fail validation for empty description": NO change; pure form test.
- "should add USD/EUR/GBP expenses": FULLY convert; seed three transactions.
- "should delete an existing expense": FULLY convert; seed transaction; navigate; delete.
- ... (continue for all ~25 tests)
```

This step produces no code; it produces a mental map you'll execute in Task 20.

- [ ] **Step 3: Stash, no commit yet**

(No commit; the actual file rewrite happens in Task 20.)

---

### Task 20: Pilot conversion — rewrite `expense-management.spec.ts`

**Files:**
- Modify: `src/e2e/tests/expense-management.spec.ts`

- [ ] **Step 1: Update imports**

Replace top-of-file imports with:

```ts
import { test, expect, factories } from "../fixtures/setup";
import { ExpenseTestHelper } from "../utils/expense-test-helper";
```

- [ ] **Step 2: Convert per-test, top to bottom**

For each test in the file, apply the conversion plan from Task 19. Two examples:

**Example A — fully converted "default currency and percentages" test:**

```ts
test("form defaults reflect group's currency and percentages", async ({ seed, page }) => {
  await seed({
    users: [factories.user({ alias: "u" })],
    groups: [factories.group({
      alias: "g",
      members: ["u"],
      defaultCurrency: "USD",
    })],
    authenticate: ["u"],
  });
  await page.goto("/");
  const helper = new ExpenseTestHelper(page);
  await helper.verifyFormDefaults("USD", { u: 100 });
});
```

**Example B — half-converted "verify a specific expense" test:**

```ts
test("transactions list shows seeded expense", async ({ seed, page }) => {
  await seed({
    users: [factories.user({ alias: "u" })],
    groups: [factories.group({ alias: "g", members: ["u"] })],
    transactions: [factories.transaction({
      alias: "t",
      group: "g",
      paidBy: "u",
      amount: 100,
      currency: "USD",
      description: "Tesco",
    })],
    authenticate: ["u"],
  });
  await page.goto("/expenses");
  const helper = new ExpenseTestHelper(page);
  await helper.verifySpecificExpenseEntry("Tesco", "100", "USD", "+$100.00");
});
```

**For tests that exercise the form itself (validation, submission flow):** replace `authenticatedPage` with `authedPage`; keep all UI form fills unchanged.

- [ ] **Step 3: Add `skipIfRemoteBackend` at the top of `describe` blocks**

For test files that use `seed`/`authedPage`, add inside the top `describe`:

```ts
test.beforeAll(skipIfRemoteBackend);
```

(Import it from `../fixtures/setup`.)

- [ ] **Step 4: Run the converted spec locally**

```bash
yarn test:e2e:fresh src/e2e/tests/expense-management.spec.ts --project=chromium
```

Expected: all tests in the file pass.

If any fail:
- Read the error.
- If it's a fixture/seed issue, debug the seed payload (most common: forgetting `authenticate`, alias mismatch).
- If it's an assertion issue, the converted setup may not match what the original test was doing — re-read the original.

- [ ] **Step 5: Run the full e2e suite to confirm no regressions**

```bash
yarn test:e2e:fresh --project=chromium
```

Expected: all tests pass (other 6 specs use legacy fixtures unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/e2e/tests/expense-management.spec.ts
git commit -m "Convert expense-management.spec.ts to fixture-based setup (pilot)"
```

---

### Task 21: Update `.github/workflows/e2e-tests.yml`

**Files:**
- Modify: `.github/workflows/e2e-tests.yml`

- [ ] **Step 1: Add the D1 reset step and env**

Find the job that runs e2e (likely a single `e2e` job). Modify it so:

- A step before "Run e2e tests" runs `rm -rf cf-worker/.wrangler/state/v3/d1`.
- The "Run e2e tests" step has `E2E_SEED_SECRET: ${{ secrets.E2E_SEED_SECRET }}` in its `env`.

Concrete diff (illustrative — match the existing structure):

```yaml
      - name: Reset local D1 state
        run: rm -rf cf-worker/.wrangler/state/v3/d1

      - name: Run e2e tests
        env:
          E2E_SEED_SECRET: ${{ secrets.E2E_SEED_SECRET }}
        run: yarn test:e2e
```

If the workflow currently runs each spec file separately (per the explore: "scheduled-actions.spec.ts → settings-management.spec.ts → ..."), preserve that structure but add the env var to each `Run` step (or to the job-level `env:`).

- [ ] **Step 2: Add `E2E_SEED_SECRET` to repo secrets**

Manually (one-time) on GitHub: Settings → Secrets and variables → Actions → New repository secret. Name `E2E_SEED_SECRET`, value any opaque string (e.g., generate with `openssl rand -hex 16`). Document this in the PR description.

- [ ] **Step 3: Commit the workflow changes**

```bash
git add .github/workflows/e2e-tests.yml
git commit -m "Wire E2E_SEED_SECRET and local D1 reset into e2e CI"
```

- [ ] **Step 4: Push and watch the CI run**

Push the branch and observe the e2e job. Expected: the local cf-worker boots, applies migrations, and the converted `expense-management.spec.ts` plus the unchanged 6 specs all run green.

If failing:
- Sanity-check the worker boot logs (search for "Listening on" or readiness probe failure).
- If migrations didn't apply, check that `cf-worker/.wrangler/state` is being written and migrations exist in `cf-worker/src/db/migrations/`.

---

### Task 22: Documentation updates

**Files:**
- Modify: `docs/api.md`, `docs/development.md`, `docs/testing.md`, `docs/codebase-map.md`
- Create or modify: `src/e2e/README.md`

- [ ] **Step 1: `docs/api.md` — add the new endpoints**

Append a section:

```markdown
## Test endpoints

### `GET /health`

Returns `{ "status": "ok" }`. No auth, no DB. Used by Playwright's webServer readiness probe. Always available.

### `POST /test/seed`

Available **only** when the cf-worker is running with `env.E2E_SEED_SECRET` set (typically only via `wrangler dev` locally). In all deployed environments this route returns 404 because the env var is absent.

Requires `X-E2E-Seed-Secret` header matching the env var.

Request body: `SeedRequest` (see `shared-types/index.ts`).
Response: `SeedResponse` with `ids` and `sessions`.
```

- [ ] **Step 2: `docs/development.md` — add a "Running e2e tests" section**

Append:

```markdown
## Running e2e tests

By default, e2e tests run against a **local** cf-worker instance booted by Playwright:

- `yarn test:e2e` — runs against local backend (default).
- `yarn test:e2e:fresh` — wipes the local D1 first; mirrors CI.
- `yarn test:e2e:remote` — runs against the deployed dev worker. Tests that require fixtures are skipped automatically.

You'll need `cf-worker/.dev.vars` with at least:

```
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:8787
E2E_SEED_SECRET=local-only-do-not-deploy
```

(Copy from `cf-worker/.dev.vars.example`.)
```

- [ ] **Step 3: `docs/testing.md` — fixture API reference**

Append:

```markdown
## E2E fixtures

E2E tests use Playwright fixtures defined in `src/e2e/fixtures/setup.ts`:

- `seed(payload, options?)` — POST to `/test/seed`; optionally inject session cookies.
- `authedPage` — shorthand for one user, one fresh group, signed in, on `/`.
- `authedPageWithGroupOf(n)` — multi-user group; first user authenticated.

Use `factories` from `../fixtures/setup` to build seed payloads with sane defaults.

When converting an existing test, follow the principle: replace UI-driven setup with seed-endpoint setup; keep UI-driven exercise of the system under test unchanged.

The legacy fixtures `authenticatedPage` and `authenticatedMultiPersonPage` are **deprecated** but still functional for unconverted spec files.
```

- [ ] **Step 4: `docs/codebase-map.md` — note the new files**

Find the e2e/fixtures section and add:
```
- src/e2e/fixtures/seed-client.ts — typed wrapper around POST /test/seed
- src/e2e/fixtures/factories.ts — payload builders with defaults
- cf-worker/src/handlers/health.ts — GET /health
- cf-worker/src/handlers/test-seed.ts — POST /test/seed (gated, local-only)
```

- [ ] **Step 5: `src/e2e/README.md` — fixture cookbook**

Create or replace with:

```markdown
# E2E test fixtures

This directory holds Playwright fixtures and supporting helpers.

## New (preferred for new tests)

- `fixtures/setup.ts` — exports `test`, `expect`, `factories`, `skipIfRemoteBackend`, fixture types.
- `fixtures/seed-client.ts` — typed HTTP wrapper around `POST /test/seed`.
- `fixtures/factories.ts` — payload builders.

### Quick example

```ts
import { test, expect, factories } from "../fixtures/setup";

test("delete a transaction", async ({ seed, page }) => {
  const { ids } = await seed({
    users: [factories.user({ alias: "alice" })],
    groups: [factories.group({ alias: "g", members: ["alice"] })],
    transactions: [factories.transaction({
      alias: "t", group: "g", paidBy: "alice", amount: 100,
    })],
    authenticate: ["alice"],
  });
  await page.goto(`/transaction/${ids.transactions.t.id}`);
  await page.click('[data-test-id="delete"]');
});
```

## Legacy (deprecated, kept for unconverted spec files)

- `fixtures/setup.ts` exports `authenticatedPage` and `authenticatedMultiPersonPage` — UI-based login.
- `fixtures/test-data.ts` — hardcoded test users.

Convert legacy tests to the new fixtures incrementally; one spec file at a time per PR.
```

- [ ] **Step 6: Commit docs**

```bash
git add docs/api.md docs/development.md docs/testing.md docs/codebase-map.md src/e2e/README.md
git commit -m "Document e2e fixtures, /test/seed, and local-backend e2e flow"
```

---

### Task 23: Final lint + full suite

- [ ] **Step 1: Lint**

Run: `yarn lint`
Expected: passes.

- [ ] **Step 2: Run all cf-worker tests**

Run: `cd cf-worker && yarn test`
Expected: all pass.

- [ ] **Step 3: Run all e2e tests fresh**

Run: `yarn test:e2e:fresh`
Expected: all pass.

- [ ] **Step 4: No commit (sanity check only)**

If anything failed, fix it before merging.

---

## Self-review

- **Spec coverage**: every section of `docs/superpowers/specs/2026-04-25-e2e-fixtures-design.md` is reflected in tasks above. Section 1 (architecture) drives every task; Section 2 (local cf-worker boot) → Tasks 1, 2, 12, 16; Section 3 (seed endpoint) → Tasks 3-11; Section 4 (auth bypass) → Task 10 + 15; Section 5 (fixtures + factory) → Tasks 13-15; Section 6 (pilot) → Tasks 19-20; Section 7 (CI/rollout) → Tasks 21-22.
- **Out-of-scope** correctly excluded: parallelism flip is NOT in this plan (separate follow-up); other 6 spec conversions NOT in this plan.

## Notes for the implementing engineer

- Better-auth's API method names (`signUpEmail`, `signInEmail`) may vary by version; verify by inspecting `auth(env).api` at runtime if a method isn't found.
- The Drizzle schema for `groups` may store members as JSON — read `cf-worker/src/db/schema/schema.ts` and follow the existing convention from `createTestUserData()` in `cf-worker/src/tests/test-utils.ts`.
- Some tests use `cloudflare:test` env mutation via `// @ts-expect-error` comments. If the project's TS config treats those errors differently, use `(env as any).E2E_SEED_SECRET = ...` instead.
- Yarn scripts in `cf-worker/package.json` may not pass through CLI args by default (`yarn dev --port=8787` may need `yarn dev -- --port=8787`). If the dev server doesn't pick up the port, test both forms.
