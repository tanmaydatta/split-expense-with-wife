import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import worker from "../index";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions, transactions } from "../db/schema/schema";
import { lunchFlowAccounts, lunchFlowTransactions } from "../utils/lunch-flow";
import { decryptBankToken } from "../utils/bank-token";
import { refreshBankAccounts, syncBankConnection } from "../utils/bank-sync";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";
const env = { ...(testEnv as unknown as Env), LUNCH_FLOW_ENABLED: "true", BANK_TOKEN_ENCRYPTION_KEY: "bank-test-key-with-at-least-32-characters", PLAID_SANDBOX_ENABLED: "false" } as Env;
const date = new Date().toISOString().slice(0, 10);
const accountRows = [1, 2].map(id => ({ id, connection_id: id + 10, name: `Account ${id}`, institution_name: `Bank ${id}`, provider: "gocardless", currency: "GBP", status: "ACTIVE" }));
const transaction = (accountId = 1, id = "same_id", amount = -12.34, isPending = false) => ({ id, accountId, amount, currency: "GBP", date, merchant: "Shop", description: "Purchase", isPending });
function request(route: string, method: string, cookie?: string, body?: unknown) {
 return new Request(`https://localhost:8787/.netlify/functions/bank-import/${route}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
describe("Lunch Flow personal imports", () => {
 beforeAll(async () => setupAndCleanDatabase(env));
 beforeEach(async () => completeCleanupDatabase(env));
 afterEach(() => vi.restoreAllMocks());
 async function fixture() {
  const users = await createTestUserData(env); const cookie = await signInAndGetCookies(env, users.user1.email, users.user1.password);
  const otherCookie = await signInAndGetCookies(env, users.user2.email, users.user2.password); const db = getDb(env);
  const rows: Record<number, ReturnType<typeof transaction>[]> = { 1: [transaction()], 2: [transaction(2)] };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
   const url = String(input); if (url.endsWith("/accounts")) return Response.json({ accounts: accountRows, total: 2 });
   const id = Number(url.match(/accounts\/(\d+)\//)?.[1]); return Response.json({ transactions: rows[id] ?? [], total: (rows[id] ?? []).length });
  });
  const call = (route: string, method = "POST", body?: unknown, auth = cookie) => worker.fetch(request(route, method, auth, body), env, createExecutionContext());
  const result = await call("lunch-flow/setup", "POST", { apiKey: "owner-api-key-never-return" }); expect(result.status).toBe(201);
  const { id } = await result.json() as { id: string };
  return { users, cookie, otherCookie, db, rows, call, id, fetchMock };
 }
 it("stores encrypted per-owner credentials, keeps accounts unselected and rejects cross-owner setup/preview", async () => {
  const { db, id, call, otherCookie } = await fixture();
  const connection = (await db.select().from(bankConnections))[0];
  expect(connection.accessTokenEncrypted).not.toContain("owner-api-key");
  expect(await decryptBankToken(env, connection.accessTokenEncrypted, "lunch_flow")).toBe("owner-api-key-never-return");
  expect((await db.select().from(bankAccounts)).every(row => !row.selected)).toBe(true);
  const list = await call("connections", "GET"); expect(await list.text()).not.toContain("owner-api-key");
  expect((await call(`accounts?connectionId=${id}`, "GET", undefined, otherCookie)).status).toBe(404);
  expect((await call(`lunch-flow/preview?connectionId=${id}&accountId=${id}:1`, "GET", undefined, otherCookie)).status).toBe(404);
  expect((await call("lunch-flow/setup", "POST", { apiKey: "same-owner-key" })).status).toBe(409);
  expect((await call("lunch-flow/setup", "POST", { connectionId: id, apiKey: "other-key" }, otherCookie)).status).toBe(404);
  expect((await call("accounts/select", "POST", { connectionId: id, accountId: `${id}:1`, selected: true })).status).toBe(400);
  const preview = await call(`lunch-flow/preview?connectionId=${id}&accountId=${id}:1`, "GET"); expect(preview.status).toBe(200);
  expect(await db.select().from(bankTransactions)).toHaveLength(0);
 });
 it("normalizes explicit signs, scopes identical IDs across accounts and retries without duplicate expenses", async () => {
  const { db, id, call, rows } = await fixture();
  rows[1].push(transaction(1, "credit", 5));
  for (const account of [1, 2]) expect((await call("accounts/select", "POST", { connectionId: id, accountId: `${id}:${account}`, selected: true, amountMultiplier: -1 })).status).toBe(200);
  let imported = await db.select().from(bankTransactions);
  expect(imported).toHaveLength(3); expect(imported.map(row => row.id)).toContain(`${id}:2:same_id`);
  expect(imported.find(row => row.id === `${id}:1:same_id`)).toMatchObject({ amountMinor: 1234, rawAmountMinor: -1234 });
  expect(imported.find(row => row.id.endsWith(":credit"))?.amountMinor).toBe(-500);
  const replay = await syncBankConnection(env, db, { id }); expect(replay).toEqual({ added: 0, modified: 0, removed: 0 });
  imported = await db.select().from(bankTransactions); expect(imported).toHaveLength(3); expect(await db.select().from(transactions)).toHaveLength(0);
 });
 it("marks complete window removals and pending replacements without changing a reviewed shared record", async () => {
  const { users, db, id, call, rows } = await fixture(); rows[1] = [transaction(1, "pending", -10, true), transaction()];
  await call("accounts/select", "POST", { connectionId: id, accountId: `${id}:1`, selected: true, amountMultiplier: -1 });
  await db.insert(transactions).values({ transactionId: "confirmed", groupId: users.testGroupId, description: "Confirmed", amount: 12.34, currency: "GBP", createdAt: date });
  await db.update(bankTransactions).set({ linkedTransactionId: "confirmed", reviewStatus: "matched" }).where(eq(bankTransactions.id, `${id}:1:same_id`));
  rows[1] = [transaction(1, "booked", -10)];
  await syncBankConnection(env, db, { id });
  const old = (await db.select().from(bankTransactions).where(eq(bankTransactions.id, `${id}:1:same_id`)))[0];
  expect(old).toMatchObject({ linkedTransactionId: "confirmed", reviewStatus: "matched", sourceChanged: true }); expect(old.removedAt).not.toBeNull();
  expect((await db.select().from(transactions))[0].amount).toBe(12.34);
  const reviewed = await (await call("inbox?status=reviewed", "GET")).json() as { transactions: Array<{ id: string; removedAt: string | null }> };
  expect(reviewed.transactions.find(row => row.id === old.id)?.removedAt).not.toBeNull();
  expect((await db.select().from(bankTransactions).where(eq(bankTransactions.id, `${id}:1:pending`)))[0].removedAt).not.toBeNull();
 });
 it("fails closed on incomplete snapshots and exposes only redacted connection errors", async () => {
  const { db, id, call, fetchMock } = await fixture();
  await call("accounts/select", "POST", { connectionId: id, accountId: `${id}:1`, selected: true, amountMultiplier: -1 });
  fetchMock.mockResolvedValue(Response.json({ transactions: [], total: 1 }));
  await expect(syncBankConnection(env, db, { id })).rejects.toThrow("invalid_data");
  expect((await db.select().from(bankTransactions))[0].removedAt).toBeNull();
  fetchMock.mockResolvedValue(new Response("secret-upstream-response", { status: 401 }));
  await expect(refreshBankAccounts(env, db, { id })).rejects.toThrow("reauthorize");
  const connection = (await db.select().from(bankConnections))[0]; expect(connection.status).toBe("needs_attention"); expect(connection.lastError).toBe("reauthorize");
 });
 it("uses documented filters, bounded retry and strict schema/calendar/account validation", async () => {
  const mock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(Response.json({ accounts: accountRows, total: 2 }));
  expect(await lunchFlowAccounts(env, "key")).toHaveLength(2); expect(mock).toHaveBeenCalledTimes(2);
  mock.mockResolvedValue(Response.json({ transactions: [{ ...transaction(), date: "2026-02-30" }], total: 1 }));
  await expect(lunchFlowTransactions(env, "key", "1", "2026-01-01", date)).rejects.toThrow("invalid_data");
  mock.mockResolvedValue(Response.json({ transactions: [transaction(2)], total: 1 }));
  await expect(lunchFlowTransactions(env, "key", "1", "2026-01-01", date)).rejects.toThrow("invalid_data");
  mock.mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "60" } }));
  await expect(lunchFlowAccounts(env, "key")).rejects.toThrow("rate_limited");
 });
});
