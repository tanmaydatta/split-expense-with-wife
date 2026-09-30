/** Plaid is deliberately pinned to Sandbox. Live bank data requires a separate rollout. */
const PLAID_URL = "https://sandbox.plaid.com";

type PlaidEnv = Env & {
	PLAID_CLIENT_ID?: string;
	PLAID_SANDBOX_SECRET?: string;
	PLAID_TOKEN_ENCRYPTION_KEY?: string;
	PLAID_SANDBOX_ENABLED?: string;
};

export function plaidEnabled(env: Env): boolean {
	const config = env as PlaidEnv;
	return config.PLAID_SANDBOX_ENABLED === "true" && !!config.PLAID_CLIENT_ID &&
		!!config.PLAID_SANDBOX_SECRET && !!config.PLAID_TOKEN_ENCRYPTION_KEY;
}

export async function plaidRequest<T>(env: Env, path: string, body: Record<string, unknown>): Promise<T> {
	const config = env as PlaidEnv;
	if (!plaidEnabled(env) || !config.PLAID_CLIENT_ID || !config.PLAID_SANDBOX_SECRET) throw new Error("Plaid Sandbox is not configured");
	const response = await fetch(`${PLAID_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": config.PLAID_CLIENT_ID, "PLAID-SECRET": config.PLAID_SANDBOX_SECRET },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const error = await response.json() as { error_code?: string };
		// Plaid request IDs and response bodies can contain sensitive information.
		throw new Error(`Plaid ${path} failed: ${error.error_code ?? response.status}`);
	}
	return response.json() as Promise<T>;
}

function toBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
	const secret = (env as PlaidEnv).PLAID_TOKEN_ENCRYPTION_KEY;
	if (!secret || secret.length < 32) throw new Error("Plaid token encryption key is missing or too short");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
	return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPlaidToken(env: Env, token: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), new TextEncoder().encode(token));
	return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptPlaidToken(env: Env, encrypted: string): Promise<string> {
	const [iv, cipher] = encrypted.split(".");
	if (!iv || !cipher) throw new Error("Invalid encrypted Plaid token");
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), }, await encryptionKey(env), fromBase64(cipher));
	return new TextDecoder().decode(plaintext);
}
