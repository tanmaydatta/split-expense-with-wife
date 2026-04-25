import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
// Vitest globals are available through the test environment
import worker from "../index";

const TEST_SECRET = "test-secret";
const URL_PATH = "https://localhost:8787/test/seed";

describe("POST /test/seed gate", () => {
  beforeEach(() => {
    env.E2E_SEED_SECRET = TEST_SECRET;
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
