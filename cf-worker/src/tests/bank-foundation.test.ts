import { env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions } from "../db/schema/schema";
import { syncBankConnection } from "../utils/bank-sync";
import { amountMinor } from "../utils/bank-provider";
import { decryptBankToken, encryptBankToken } from "../utils/bank-token";
import { encryptPlaidToken } from "../utils/plaid";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase } from "./test-utils";
const env = { ...(testEnv as unknown as Env), BANK_TOKEN_ENCRYPTION_KEY: "new-bank-test-key-of-at-least-32-characters", PLAID_TOKEN_ENCRYPTION_KEY: "legacy-plaid-test-key-of-at-least-32-characters",
 PLAID_CLIENT_ID: "client", PLAID_SANDBOX_SECRET: "secret", PLAID_SANDBOX_ENABLED: "true" } as Env;
describe("Bank provider foundation", () => {
 beforeAll(async () => setupAndCleanDatabase(env));
 beforeEach(async () => completeCleanupDatabase(env));
 afterEach(() => vi.restoreAllMocks());
 it("supports versioned bank encryption and legacy Plaid ciphertext without sharing encryption keys", async () => {
  const encrypted = await encryptBankToken(env, "private-api-key", "lunch_flow");
  expect(encrypted.startsWith("v1.")).toBe(true);
  expect(await decryptBankToken(env, encrypted, "lunch_flow")).toBe("private-api-key");
  const legacy = await encryptPlaidToken(env, "old-plaid-token");
  expect(await decryptBankToken(env, legacy, "plaid")).toBe("old-plaid-token");
  await expect(decryptBankToken(env, legacy, "lunch_flow")).rejects.toThrow();
  await expect(decryptBankToken({ ...env, BANK_TOKEN_ENCRYPTION_KEY: "other-bank-key-of-at-least-32-characters" } as Env, encrypted, "lunch_flow")).rejects.toThrow();
 });
 it("normalizes zero, two and three decimal currencies", () => {
  expect(amountMinor(12, "JPY")).toBe(12); expect(amountMinor(12.34, "GBP")).toBe(1234);
  expect(amountMinor(-12.345, "KWD")).toBe(-12345); expect(() => amountMinor(Infinity, "GBP")).toThrow();
 });
 it("serializes concurrent sync and flags revised reviewed data while retaining the confirmed link", async () => {
  const users = await createTestUserData(env); const db = getDb(env); const now = new Date().toISOString();
  await db.insert(bankConnections).values({ id: "bank_lock", userId: users.user1.id, groupId: users.testGroupId, plaidItemId: "item_lock", institutionName: "Sandbox", status: "connected", accessTokenEncrypted: await encryptBankToken(env, "token", "plaid"), createdAt: now, updatedAt: now });
  await db.insert(bankAccounts).values({ id: "bank_lock:a", providerAccountId: "a", connectionId: "bank_lock", name: "Account", type: "depository", selected: true });
  await db.insert(bankTransactions).values({ id: "bank_lock:t", connectionId: "bank_lock", userId: users.user1.id, accountId: "bank_lock:a", date: "2026-10-01", name: "Charge", amountMinor: 1000, currency: "GBP", pending: false, linkedTransactionId: "confirmed-expense", reviewStatus: "matched", createdAt: now, updatedAt: now });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const called = new Promise<void>(resolve => { entered = resolve; });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
   entered(); await gate;
   return Response.json({ added: [], modified: [{ transaction_id: "t", account_id: "a", date: "2026-10-01", name: "Charge", merchant_name: null, amount: 11, iso_currency_code: "GBP", pending: false, pending_transaction_id: null }], removed: [], has_more: false, next_cursor: "next" });
  });
  const first = syncBankConnection(env, db, { id: "bank_lock" }); await called;
  await expect(syncBankConnection(env, db, { id: "bank_lock" })).rejects.toThrow("busy");
  release(); await first;
  const row = (await db.select().from(bankTransactions).where(eq(bankTransactions.id, "bank_lock:t")))[0];
  expect(row).toMatchObject({ amountMinor: 1100, linkedTransactionId: "confirmed-expense", reviewStatus: "matched", sourceChanged: true });
  const connection = (await db.select().from(bankConnections).where(eq(bankConnections.id, "bank_lock")))[0];
  expect(connection.syncLock).toBeNull(); expect(connection.lastSyncedAt).not.toBeNull();
 });
});
