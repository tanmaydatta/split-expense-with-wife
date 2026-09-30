import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions, transactions } from "../db/schema/schema";
import { encryptPlaidToken } from "../utils/plaid";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase } from "./test-utils";

const env = { ...(testEnv as unknown as Env), PLAID_CLIENT_ID: "test-client", PLAID_SANDBOX_SECRET: "test-secret",
	PLAID_TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-over-32-characters", PLAID_SANDBOX_ENABLED: "true" } as Env;

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signedRequest(body: string): Promise<Request> {
	const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
	const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
	const kid = "test-key-id";
	vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ key: { ...publicKey, kid, alg: "ES256" } }), { status: 200 }));
	const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })));
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
	const hash = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
	const payload = base64url(new TextEncoder().encode(JSON.stringify({ iat: Math.floor(Date.now() / 1000), request_body_sha256: hash })));
	const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
	return new Request("https://localhost:8787/plaid/webhook", { method: "POST",
		headers: { "Plaid-Verification": `${header}.${payload}.${base64url(signature)}` }, body });
}

describe("Plaid permission revocation", () => {
	beforeAll(async () => { await setupAndCleanDatabase(env); });
	beforeEach(async () => { await completeCleanupDatabase(env); });
	afterEach(() => { vi.restoreAllMocks(); });

	it("deletes only the revoked Item's private rows and retains confirmed shared expenses", async () => {
		const users = await createTestUserData(env);
		const db = getDb(env);
		const now = new Date().toISOString();
		for (const id of ["bank_revoked", "bank_other"]) {
			await db.insert(bankConnections).values({ id, userId: users.user1.id, groupId: users.testGroupId,
				plaidItemId: `item_${id}`, institutionName: "Sandbox bank", accessTokenEncrypted: await encryptPlaidToken(env, `access_${id}`),
				status: "connected", createdAt: now, updatedAt: now });
			await db.insert(bankAccounts).values({ id: `${id}:account_1`, connectionId: id, name: "Current", type: "depository", selected: true });
			await db.insert(bankTransactions).values({ id: `${id}:transaction_1`, connectionId: id, userId: users.user1.id,
				accountId: `${id}:account_1`, date: "2026-09-01", name: "Coffee", amountMinor: 1234, currency: "GBP", pending: false,
				linkedTransactionId: id === "bank_revoked" ? "tx_confirmed" : null, createdAt: now, updatedAt: now });
		}
		await db.insert(transactions).values({ transactionId: "tx_confirmed", groupId: users.testGroupId,
			description: "Coffee", amount: 12.34, currency: "GBP", createdAt: now });
		const body = JSON.stringify({ webhook_type: "ITEM", webhook_code: "USER_PERMISSION_REVOKED", item_id: "item_bank_revoked" });
		expect((await worker.fetch(new Request("https://localhost:8787/plaid/webhook", { method: "POST", body }), env, createExecutionContext())).status).toBe(401);
		expect(await db.select().from(bankConnections)).toHaveLength(2);
		expect((await worker.fetch(await signedRequest(body), env, createExecutionContext())).status).toBe(200);
		expect((await db.select().from(bankConnections)).map(row => row.id)).toEqual(["bank_other"]);
		expect((await db.select().from(bankAccounts)).map(row => row.connectionId)).toEqual(["bank_other"]);
		expect((await db.select().from(bankTransactions)).map(row => row.connectionId)).toEqual(["bank_other"]);
		expect((await db.select().from(transactions)).map(row => row.transactionId)).toEqual(["tx_confirmed"]);
		expect((await worker.fetch(await signedRequest(body), env, createExecutionContext())).status).toBe(200);
	});
});
