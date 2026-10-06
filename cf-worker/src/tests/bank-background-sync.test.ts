import { env as testEnv } from "cloudflare:test";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions } from "../db/schema/schema";
import { enqueueDailyBankSync, runBankBackgroundSync } from "../utils/bank-background-sync";
import { handleCron } from "../handlers/cron";
import { encryptBankToken } from "../utils/bank-token";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase } from "./test-utils";
const env = { ...(testEnv as unknown as Env), BANK_BACKGROUND_SYNC_ENABLED: "true", LUNCH_FLOW_ENABLED: "true", BANK_TOKEN_ENCRYPTION_KEY: "background-test-key-at-least-32-characters", PLAID_SANDBOX_ENABLED: "false" } as Env;
describe("Daily private bank sync", () => {
 beforeAll(async () => setupAndCleanDatabase(env)); beforeEach(async () => completeCleanupDatabase(env)); afterEach(() => vi.restoreAllMocks());
 async function connection(id: string, selected = true) {
  const users = await createTestUserData(env); const db = getDb(env); const now = new Date().toISOString();
  await db.insert(bankConnections).values({ id, userId: users.user1.id, groupId: users.testGroupId, provider: "lunch_flow", plaidItemId: `lunch_flow:${id}`, providerConnectionId: `lunch_flow:${id}`, institutionName: "Personal destination", accessTokenEncrypted: await encryptBankToken(env, "test-private-key", "lunch_flow"), status: "connected", createdAt: now, updatedAt: now });
  await db.insert(bankAccounts).values({ id: `${id}:1`, providerAccountId: "1", connectionId: id, name: "Account", type: "bank", selected, amountMultiplier: -1 });
 }
 it("keeps background sync gated, enqueues only selected connections and isolates queue failures", async () => {
  await connection("bank_a"); await connection("bank_b"); await connection("bank_unselected", false);
  const create = vi.fn().mockRejectedValueOnce(new Error("queue unavailable")).mockResolvedValue({ id: "job" });
  const configured = { ...env, BANK_SYNC_WORKFLOW: { create } } as unknown as Env;
  expect(await enqueueDailyBankSync({ ...configured, BANK_BACKGROUND_SYNC_ENABLED: "false" } as Env)).toEqual({ queued: 0, failed: 0 });
  expect(await enqueueDailyBankSync(configured, "2026-10-06")).toEqual({ queued: 1, failed: 1 });
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0][0]).toMatchObject({ id: "bank-sync-bank_a-2026-10-06", params: { connectionId: "bank_a" } });
  expect(JSON.stringify(create.mock.calls)).not.toContain("test-private-key");
 });
 it("fetches only cached API data and persists private imports while disabled jobs make no requests", async () => {
  await connection("bank_run"); const date = new Date().toISOString().slice(0, 10);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/accounts") ? { accounts: [{ id: 1, connection_id: 2, name: "Account", institution_name: "Bank", currency: "GBP", status: "ACTIVE", provider: "gocardless" }], total: 1 } : { transactions: [{ id: "t", accountId: 1, amount: -10, currency: "GBP", date, merchant: "Shop", description: "Purchase", isPending: false }], total: 1 }));
  expect(await runBankBackgroundSync({ ...env, BANK_BACKGROUND_SYNC_ENABLED: "false" } as Env, "bank_run")).toEqual({ skipped: true }); expect(fetchMock).not.toHaveBeenCalled();
  expect(await runBankBackgroundSync(env, "bank_run")).toMatchObject({ skipped: false, added: 1 });
  expect(await getDb(env).select().from(bankTransactions)).toHaveLength(1);
  expect(fetchMock.mock.calls.every((call: [RequestInfo | URL]) => String(call[0]).includes("lunchflow.app/api/v1/accounts"))).toBe(true);
 });
 it("reuses the daily cron alongside scheduled actions and reminders", async () => {
  await connection("bank_cron"); const create = vi.fn().mockResolvedValue({ id: "job" });
  const configured = { ...env, BANK_SYNC_WORKFLOW: { create }, ORCHESTRATOR_WORKFLOW: { create: vi.fn().mockResolvedValue({ id: "orchestrator" }) } } as unknown as Env;
  await handleCron(configured, "0 0 * * *"); expect(create).toHaveBeenCalledTimes(1);
  await handleCron(configured, "0 1 * * *"); expect(create).toHaveBeenCalledTimes(1);
 });
});
