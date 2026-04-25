import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
// Vitest globals are available through the test environment
import worker from "../index";

const TEST_SECRET = "test-secret";
const URL_PATH = "https://localhost:8787/test/seed";
const ORIGINAL_SECRET = env.E2E_SEED_SECRET;

describe("POST /test/seed gate", () => {
  beforeEach(() => {
    env.E2E_SEED_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    env.E2E_SEED_SECRET = ORIGINAL_SECRET;
  });

  it("returns 404 when E2E_SEED_SECRET env var is empty", async () => {
    env.E2E_SEED_SECRET = "";
    const req = new Request(URL_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when env is empty even with a valid-looking header (proves Layer 1)", async () => {
    env.E2E_SEED_SECRET = "";
    const req = new Request(URL_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "anything-claiming-validity",
      },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when X-E2E-Seed-Secret header is missing", async () => {
    const req = new Request(URL_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when X-E2E-Seed-Secret header value mismatches", async () => {
    const req = new Request(URL_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": "wrong",
      },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 200 (or 400) when secret matches and route is reachable", async () => {
    const req = new Request(URL_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": TEST_SECRET,
      },
      body: JSON.stringify({}),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    // Empty payload is allowed in Task 4's stub; later tasks add validation.
    // Either 200 (stub response) or 400 (validation rejects empty) is acceptable here.
    expect([200, 400]).toContain(res.status);
  });

  it("returns 405 for non-POST methods when secret is set", async () => {
    const req = new Request(URL_PATH, {
      method: "GET",
      headers: {
        "X-E2E-Seed-Secret": TEST_SECRET,
      },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(405);
  });
});

describe("POST /test/seed validation", () => {
  beforeEach(() => {
    env.E2E_SEED_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    env.E2E_SEED_SECRET = ORIGINAL_SECRET;
  });

  async function postSeed(body: unknown): Promise<Response> {
    const req = new Request(URL_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-E2E-Seed-Secret": TEST_SECRET,
      },
      body: JSON.stringify(body),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  it("returns 400 when a transaction references unknown group alias", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      transactions: [{
        alias: "t", group: "missing", amount: 100,
        paidByShares: { u: 100 }, splitPctShares: { u: 100 },
      }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/group.*missing/i);
  });

  it("returns 400 when paidByShares sum doesn't equal amount", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"] }],
      transactions: [{
        alias: "t", group: "g", amount: 100,
        paidByShares: { u: 50 },
        splitPctShares: { u: 100 },
      }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/paidByShares.*sum/i);
  });

  it("returns 400 when splitPctShares doesn't sum to 100", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"] }],
      transactions: [{
        alias: "t", group: "g", amount: 100,
        paidByShares: { u: 100 },
        splitPctShares: { u: 90 },
      }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown currency", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"], defaultCurrency: "XYZ" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when authenticate references unknown user alias", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      authenticate: ["bob"],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when alias is reused within users[]", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }, { alias: "u" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when group member references unknown user alias", async () => {
    const res = await postSeed({
      groups: [{ alias: "g", members: ["ghost"] }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when budgetEntry references unknown budget alias", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"] }],
      budgetEntries: [{ alias: "be", group: "g", budget: "ghost", amount: 10 }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when budgetEntry's budget belongs to a different group", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [
        { alias: "g1", members: ["u"], budgets: [{ alias: "b1", name: "B1" }] },
        { alias: "g2", members: ["u"] },
      ],
      budgetEntries: [{ alias: "be", group: "g2", budget: "b1", amount: 10 }],
    });
    expect(res.status).toBe(400);
  });
});
