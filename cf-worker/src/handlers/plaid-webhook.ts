import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { bankConnections } from "../db/schema/schema";
import { plaidEnabled, plaidRequest } from "../utils/plaid";
import { syncBankConnection } from "../utils/plaid-sync";

function decodeBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), character => character.charCodeAt(0));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each verification guard is required before trusting a webhook
async function verifySignature(request: Request, env: Env, body: string): Promise<boolean> {
	try {
		const jwt = request.headers.get("Plaid-Verification") ?? "";
		const parts = jwt.split(".");
		if (parts.length !== 3) return false;
		const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { alg?: string; kid?: string };
		if (header.alg !== "ES256" || !header.kid) return false;
		const response = await plaidRequest<{ key: JsonWebKey & { kid?: string } }>(env, "/webhook_verification_key/get", { key_id: header.kid });
		if (response.key.alg !== "ES256" || response.key.kid !== header.kid) return false;
		const key = await crypto.subtle.importKey("jwk", response.key, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
		const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
		if (!valid) return false;
		const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as { iat?: number; request_body_sha256?: string };
		if (typeof payload.iat !== "number" || Math.abs(Date.now() / 1000 - payload.iat) > 300) return false;
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
		const expected = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
		const actual = payload.request_body_sha256 ?? "";
		if (actual.length !== expected.length) return false;
		let difference = 0;
		for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
		return difference === 0;
	} catch {
		return false;
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: event dispatch and authentication are kept together
export async function handlePlaidWebhook(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return new Response("Not found", { status: 404 });
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	const raw = await request.text();
	if (!await verifySignature(request, env, raw)) return new Response("Invalid signature", { status: 401 });
	let event: { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } };
	try { event = JSON.parse(raw); } catch { return new Response("Invalid body", { status: 400 }); }
	if (!event.item_id) return new Response("Invalid body", { status: 400 });
	const db = getDb(env);
	const connection = (await db.select().from(bankConnections).where(eq(bankConnections.plaidItemId, event.item_id)).limit(1))[0];
	if (!connection || connection.status === "disconnected") return new Response("OK");
	try {
		if (event.webhook_type === "TRANSACTIONS" && event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
			await syncBankConnection(env, db, connection);
		} else if (event.webhook_type === "ITEM" && event.webhook_code === "ERROR" && event.error?.error_code === "ITEM_LOGIN_REQUIRED") {
			await db.update(bankConnections).set({ status: "needs_attention", updatedAt: new Date().toISOString() }).where(eq(bankConnections.id, connection.id));
		} else if (event.webhook_type === "ITEM" && event.webhook_code === "LOGIN_REPAIRED") {
			await db.update(bankConnections).set({ status: "connected", updatedAt: new Date().toISOString() }).where(eq(bankConnections.id, connection.id));
		} else if (event.webhook_type === "ITEM" && event.webhook_code === "USER_PERMISSION_REVOKED") {
			await db.update(bankConnections).set({ status: "disconnected", accessTokenEncrypted: "", updatedAt: new Date().toISOString() }).where(eq(bankConnections.id, connection.id));
		}
		return new Response("OK");
	} catch (error) {
		console.error("Plaid webhook processing failed", error instanceof Error ? error.message : "unknown");
		return new Response("Retry", { status: 500 });
	}
}
