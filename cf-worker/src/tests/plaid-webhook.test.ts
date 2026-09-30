import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import worker from "../index";
import { getDb } from "../db";
import { bankConnections } from "../db/schema/schema";
import { encryptPlaidToken } from "../utils/plaid";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase } from "./test-utils";

const env = { ...(testEnv as unknown as Env), PLAID_CLIENT_ID: "test-client", PLAID_SANDBOX_SECRET: "test-secret",
	PLAID_TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-over-32-characters", PLAID_SANDBOX_ENABLED: "true" } as Env;

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("Plaid webhook verification", () => {
	beforeAll(async () => { await setupAndCleanDatabase(env); });
	beforeEach(async () => { await completeCleanupDatabase(env); });
	afterEach(() => { vi.restoreAllMocks(); });

	it("rejects unsigned events and accepts a fresh signed item event", async () => {
		const users = await createTestUserData(env);
		const db = getDb(env);
		const now = new Date().toISOString();
		await db.insert(bankConnections).values({ id: "bank_test", userId: users.user1.id, groupId: users.testGroupId,
			plaidItemId: "item_test", institutionName: "Sandbox bank", accessTokenEncrypted: await encryptPlaidToken(env, "access-sandbox-test"),
			status: "needs_attention", createdAt: now, updatedAt: now });
		const body = JSON.stringify({ webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED", item_id: "item_test" });
		const makeRequest = (signature?: string) => new Request("https://localhost:8787/plaid/webhook", { method: "POST",
			headers: signature ? { "Plaid-Verification": signature } : {}, body });
		expect((await worker.fetch(makeRequest(), env, createExecutionContext())).status).toBe(401);
		const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
		const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
		const kid = "test-key-id";
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ key: { ...publicKey, kid, alg: "ES256" } }), { status: 200 }));
		const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })));
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
		const hash = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
		const payload = base64url(new TextEncoder().encode(JSON.stringify({ iat: Math.floor(Date.now() / 1000), request_body_sha256: hash })));
		const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
		const jwt = `${header}.${payload}.${base64url(signature)}`;
		expect((await worker.fetch(makeRequest(jwt), env, createExecutionContext())).status).toBe(200);
		expect((await db.select().from(bankConnections).where(eq(bankConnections.id, "bank_test")))[0].status).toBe("connected");
	});
});
