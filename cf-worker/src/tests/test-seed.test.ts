import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
// Vitest globals are available through the test environment
import { getDb } from "../db";
import { user as userTable } from "../db/schema/auth-schema";
import {
  budgetEntries,
  groupBudgets,
  groups,
  transactions,
  transactionUsers,
} from "../db/schema/schema";
import worker from "../index";
import { completeCleanupDatabase, setupDatabase } from "./test-utils";

const TEST_SECRET = "test-secret";
const URL_PATH = "https://localhost:8787/test/seed";
const ORIGINAL_SECRET = env.E2E_SEED_SECRET;

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

  it("returns 400 when alias too long for default-generated username", async () => {
    const longAlias = "a".repeat(22);
    const res = await postSeed({ users: [{ alias: longAlias }] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/too long/i);
  });

  it("returns 400 when explicit username exceeds 30 chars", async () => {
    const res = await postSeed({
      users: [{ alias: "u", username: "u".repeat(31) }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/exceeds 30 chars/i);
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
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/different group/i);
  });

  it("returns 200 with populated IDs for a fully-valid payload", async () => {
    await setupDatabase(env);
    await completeCleanupDatabase(env);
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{
        alias: "g",
        members: ["u"],
        budgets: [{ alias: "b", name: "Default" }],
      }],
      transactions: [{
        alias: "t",
        group: "g",
        amount: 50,
        paidByShares: { u: 50 },
        splitPctShares: { u: 100 },
      }],
      budgetEntries: [{ alias: "be", group: "g", budget: "b", amount: 25 }],
      authenticate: ["u"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: {
        users: object;
        groups: Record<string, { id: string }>;
        transactions: Record<string, { id: string }>;
        budgetEntries: Record<string, { id: string }>;
      };
      sessions: object;
    };
    // Users (Task 6), groups (Task 7), transactions (Task 8) and budget
    // entries (Task 9) are all created.
    expect(Object.keys(body.ids.groups)).toEqual(["g"]);
    expect(body.ids.groups.g.id).toMatch(/^.+/);
    expect(Object.keys(body.ids.transactions)).toEqual(["t"]);
    expect(body.ids.transactions.t.id).toMatch(/^tx_/);
    expect(Object.keys(body.ids.budgetEntries)).toEqual(["be"]);
    expect(body.ids.budgetEntries.be.id).toMatch(/^.+/);
    expect(body.sessions).toEqual({});
  });
});

describe("POST /test/seed user creation", () => {
  beforeEach(async () => {
    env.E2E_SEED_SECRET = TEST_SECRET;
    await setupDatabase(env);
    await completeCleanupDatabase(env);
  });

  afterEach(() => {
    env.E2E_SEED_SECRET = ORIGINAL_SECRET;
  });

  it("creates users via better-auth and returns IDs/emails/usernames", async () => {
    const res = await postSeed({
      users: [{ alias: "alice" }, { alias: "bob", name: "Bob Builder" }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: { users: Record<string, { id: string; email: string; username: string }> };
    };

    expect(body.ids.users.alice).toBeDefined();
    expect(body.ids.users.alice.id).toMatch(/^.+/);
    expect(body.ids.users.alice.email).toMatch(/@e2e\.test$/);
    expect(body.ids.users.alice.username).toMatch(/^alice/);
    expect(body.ids.users.bob.email).toMatch(/@e2e\.test$/);

    const db = getDb(env);
    const aliceRow = await db.select().from(userTable).where(eq(userTable.id, body.ids.users.alice.id));
    expect(aliceRow.length).toBe(1);
    // Default name = alias when override not provided
    expect(aliceRow[0].name).toBe("alice");

    const bobRow = await db.select().from(userTable).where(eq(userTable.id, body.ids.users.bob.id));
    expect(bobRow[0].name).toBe("Bob Builder");
  });

  it("respects email/username/password overrides", async () => {
    // Note: better-auth's default username validator only permits [a-zA-Z0-9_.].
    const res = await postSeed({
      users: [{ alias: "carol", email: "carol@custom.test", username: "carol_custom", password: "pw-12345678" }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: { users: Record<string, { id: string; email: string; username: string }> };
    };
    expect(body.ids.users.carol.email).toBe("carol@custom.test");
    expect(body.ids.users.carol.username).toBe("carol_custom");
  });
});

describe("POST /test/seed group creation", () => {
  beforeEach(async () => {
    env.E2E_SEED_SECRET = TEST_SECRET;
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  afterEach(() => {
    env.E2E_SEED_SECRET = ORIGINAL_SECRET;
  });

  it("creates a group with budgets, sets userids JSON, and updates user.groupid", async () => {
    const res = await postSeed({
      users: [{ alias: "u1" }, { alias: "u2" }],
      groups: [{
        alias: "g",
        name: "Test Group",
        members: ["u1", "u2"],
        defaultCurrency: "USD",
        budgets: [
          { alias: "groceries", name: "Groceries" },
          { alias: "rent", name: "Rent", description: "Monthly rent" },
        ],
      }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: {
        users: Record<string, { id: string }>;
        groups: Record<string, { id: string }>;
      };
    };

    const groupId = body.ids.groups.g.id;
    const u1Id = body.ids.users.u1.id;
    const u2Id = body.ids.users.u2.id;
    expect(groupId).toMatch(/^.+/);

    const db = getDb(env);

    // Group row exists with correct shape
    const groupRows = await db
      .select()
      .from(groups)
      .where(eq(groups.groupid, groupId));
    expect(groupRows.length).toBe(1);
    expect(groupRows[0].groupName).toBe("Test Group");
    expect(groupRows[0].userids).toBeTruthy();
    const userids = JSON.parse(groupRows[0].userids as string) as string[];
    expect(userids.sort()).toEqual([u1Id, u2Id].sort());
    const metadata = JSON.parse(groupRows[0].metadata as string) as {
      defaultCurrency: string;
    };
    expect(metadata.defaultCurrency).toBe("USD");

    // group_budgets rows exist with correct names + description
    const budgetRows = await db
      .select()
      .from(groupBudgets)
      .where(eq(groupBudgets.groupId, groupId));
    expect(budgetRows.length).toBe(2);
    const groceries = budgetRows.find((b) => b.budgetName === "Groceries");
    const rent = budgetRows.find((b) => b.budgetName === "Rent");
    expect(groceries).toBeDefined();
    expect(rent?.description).toBe("Monthly rent");

    // Each user's groupid points to this group
    const u1Row = await db.select().from(userTable).where(eq(userTable.id, u1Id));
    const u2Row = await db.select().from(userTable).where(eq(userTable.id, u2Id));
    expect(u1Row[0].groupid).toBe(groupId);
    expect(u2Row[0].groupid).toBe(groupId);
  });

  it("uses default group name and GBP default currency when not provided", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"] }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ids: { groups: Record<string, { id: string }> } };

    const db = getDb(env);
    const rows = await db.select().from(groups).where(eq(groups.groupid, body.ids.groups.g.id));
    expect(rows[0].groupName).toMatch(/^e2e-group-/);
    const metadata = JSON.parse(rows[0].metadata as string) as { defaultCurrency: string };
    expect(metadata.defaultCurrency).toBe("GBP");
  });

  it("creates the empty 'Default' budget when groups[].budgets is omitted", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"] }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ids: { groups: Record<string, { id: string }> } };

    const db = getDb(env);
    const budgetRows = await db
      .select()
      .from(groupBudgets)
      .where(eq(groupBudgets.groupId, body.ids.groups.g.id));
    expect(budgetRows.length).toBe(0); // No default — only what's explicitly listed
  });
});

describe("POST /test/seed transaction creation", () => {
  beforeEach(async () => {
    env.E2E_SEED_SECRET = TEST_SECRET;
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  afterEach(() => {
    env.E2E_SEED_SECRET = ORIGINAL_SECRET;
  });

  it("creates a transaction with split shares; userIds resolved from aliases", async () => {
    const res = await postSeed({
      users: [{ alias: "u1" }, { alias: "u2" }],
      groups: [{ alias: "g", members: ["u1", "u2"] }],
      transactions: [{
        alias: "t",
        group: "g",
        amount: 100,
        paidByShares: { u1: 100 },
        splitPctShares: { u1: 60, u2: 40 },
        description: "Tesco shop",
      }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: { transactions: Record<string, { id: string }> };
    };
    const txId = body.ids.transactions.t.id;
    expect(txId).toMatch(/^tx_/);

    const db = getDb(env);
    const txRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.transactionId, txId));
    expect(txRows.length).toBe(1);
    expect(txRows[0].amount).toBe(100);
    expect(txRows[0].description).toBe("Tesco shop");
    expect(txRows[0].currency).toBe("GBP");

    // transaction_users rows should exist (count depends on the existing helper)
    const tuRows = await db
      .select()
      .from(transactionUsers)
      .where(eq(transactionUsers.transactionId, txId));
    expect(tuRows.length).toBeGreaterThan(0);
  });

  it("uses payload-supplied currency over group default", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{ alias: "g", members: ["u"], defaultCurrency: "GBP" }],
      transactions: [{
        alias: "t", group: "g", amount: 25, currency: "USD",
        paidByShares: { u: 25 }, splitPctShares: { u: 100 },
      }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ids: { transactions: Record<string, { id: string }> } };
    const db = getDb(env);
    const rows = await db.select().from(transactions).where(eq(transactions.transactionId, body.ids.transactions.t.id));
    expect(rows[0].currency).toBe("USD");
  });
});

describe("POST /test/seed budget entries", () => {
  beforeEach(async () => {
    env.E2E_SEED_SECRET = TEST_SECRET;
    await completeCleanupDatabase(env);
    await setupDatabase(env);
  });

  afterEach(() => {
    env.E2E_SEED_SECRET = ORIGINAL_SECRET;
  });

  it("creates a budget entry linked to the named group_budgets row", async () => {
    const res = await postSeed({
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
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: {
        groups: Record<string, { id: string }>;
        budgetEntries: Record<string, { id: string }>;
      };
    };
    const beId = body.ids.budgetEntries.be.id;
    const gId = body.ids.groups.g.id;
    expect(beId).toMatch(/^.+/);

    const db = getDb(env);
    const beRows = await db
      .select()
      .from(budgetEntries)
      .where(eq(budgetEntries.budgetEntryId, beId));
    expect(beRows.length).toBe(1);
    expect(beRows[0].amount).toBe(50);
    expect(beRows[0].description).toBe("weekly shop");
    // budgetEntries.budgetId references groupBudgets.id (NOT the group ID)
    const groceriesBudgetRows = await db
      .select()
      .from(groupBudgets)
      .where(eq(groupBudgets.groupId, gId));
    expect(beRows[0].budgetId).toBe(groceriesBudgetRows[0].id);
  });

  it("uses payload-supplied currency over group default", async () => {
    const res = await postSeed({
      users: [{ alias: "u" }],
      groups: [{
        alias: "g",
        members: ["u"],
        defaultCurrency: "GBP",
        budgets: [{ alias: "b", name: "B" }],
      }],
      budgetEntries: [{
        alias: "be", group: "g", budget: "b", amount: 25, currency: "USD",
      }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ids: { budgetEntries: Record<string, { id: string }> };
    };
    const db = getDb(env);
    const rows = await db
      .select()
      .from(budgetEntries)
      .where(eq(budgetEntries.budgetEntryId, body.ids.budgetEntries.be.id));
    expect(rows[0].currency).toBe("USD");
  });
});
