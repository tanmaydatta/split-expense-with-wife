import { decryptPlaidToken, encryptPlaidToken } from "./plaid";
import type { BankProviderId } from "./bank-provider";
export type BankEnv = Env & {
	BANK_TOKEN_ENCRYPTION_KEY?: string;
	LUNCH_FLOW_ENABLED?: string;
	BANK_BACKGROUND_SYNC_ENABLED?: string;
};
export function bankEncryptionConfigured(env: Env): boolean {
	return ((env as BankEnv).BANK_TOKEN_ENCRYPTION_KEY?.length ?? 0) >= 32;
}
async function key(env: Env): Promise<CryptoKey> {
	const secret = (env as BankEnv).BANK_TOKEN_ENCRYPTION_KEY;
	if (!secret || secret.length < 32)
		throw new Error("Bank encryption is not configured");
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret),
	);
	return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) =>
	Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function encryptBankToken(
	env: Env,
	token: string,
	provider: BankProviderId,
): Promise<string> {
	if (provider === "plaid") return encryptPlaidToken(env, token);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await key(env),
		new TextEncoder().encode(token),
	);
	return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decryptBankToken(
	env: Env,
	encrypted: string,
	provider: BankProviderId,
): Promise<string> {
	if (!encrypted.startsWith("v1.") && provider === "plaid")
		return decryptPlaidToken(env, encrypted);
	const [version, iv, cipher] = encrypted.split(".");
	if (version !== "v1" || !iv || !cipher)
		throw new Error("Invalid bank credential");
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: decode(iv) },
		await key(env),
		decode(cipher),
	);
	return new TextDecoder().decode(plaintext);
}
