import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { customSession, username } from "better-auth/plugins";
import { getDb } from "./db";
import type { Session } from "./types";
import { enrichSession } from "./utils";

// Helper functions for password verification
function decodeStoredHash(hash: string): { salt: Uint8Array; storedHash: Uint8Array } {
	const combined = new Uint8Array(
		atob(hash)
			.split("")
			.map((char) => char.charCodeAt(0)),
	);
	const salt = combined.slice(0, 16);
	const storedHash = combined.slice(16);
	return { salt, storedHash };
}

async function hashPasswordWithSalt(password: string, salt: Uint8Array): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	
	const key = await crypto.subtle.importKey(
		"raw",
		data,
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	const candidateHashBuffer = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt,
			iterations: 10000,
			hash: "SHA-256",
		},
		key,
		256,
	);

	return new Uint8Array(candidateHashBuffer);
}

function compareHashes(candidateHash: Uint8Array, storedHash: Uint8Array): boolean {
	if (candidateHash.length !== storedHash.length) {
		return false;
	}

	for (let i = 0; i < candidateHash.length; i++) {
		if (candidateHash[i] !== storedHash[i]) {
			return false;
		}
	}
	return true;
}

// const env = process.env as unknown as Env;
export const auth = (env: Env): ReturnType<typeof betterAuth> =>
	betterAuth({
		// export const auth =  betterAuth({
		database: drizzleAdapter(getDb(env), {
			provider: "sqlite",
		}),
		rateLimit: {
			enabled: false,
		},
		plugins: [
			username(),
			customSession(async ({ user, session }) => {
				return {
					user,
					session,
					extra: await enrichSession({ user, session } as Session, getDb(env)),
				};
			}),
		],
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60, // Cache duration in seconds
			},
		},
		secret: env.AUTH_PRIVATE_KEY,
		baseURL: env.BASE_URL,
		trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			password: {
				/** Hash new passwords using Web Crypto API (works in Cloudflare Workers) */
				hash: async (password: string) => {
					const encoder = new TextEncoder();
					const data = encoder.encode(password);
					const salt = crypto.getRandomValues(new Uint8Array(16));

					// Use PBKDF2 with 10,000 iterations (much faster than bcrypt/Argon2)
					const key = await crypto.subtle.importKey(
						"raw",
						data,
						{ name: "PBKDF2" },
						false,
						["deriveBits"],
					);

					const hashBuffer = await crypto.subtle.deriveBits(
						{
							name: "PBKDF2",
							salt: salt,
							iterations: 10000,
							hash: "SHA-256",
						},
						key,
						256,
					);

					// Combine salt + hash for storage
					const combined = new Uint8Array(salt.length + hashBuffer.byteLength);
					combined.set(salt);
					combined.set(new Uint8Array(hashBuffer), salt.length);

					// Return as base64
					return btoa(String.fromCharCode.apply(null, Array.from(combined)));
				},

				/** Compare a candidate password with the stored hash */
				verify: async ({
					hash,
					password,
				}: {
					hash: string;
					password: string;
				}) => {
					try {
						if (!hash) {
							console.log("❌ No hash provided");
							return false;
						}

						const { salt, storedHash } = decodeStoredHash(hash);
						const candidateHash = await hashPasswordWithSalt(password, salt);
						const isMatch = compareHashes(candidateHash, storedHash);

						if (isMatch) {
							console.log("✅ Password verification successful");
						}
						return isMatch;
					} catch (error) {
						console.error("❌ Password verification error:", error);
						return false;
					}
				},
			},
		},
		user: {
			additionalFields: {
				groupid: {
					type: "string",
					required: false,
				},
				firstName: {
					type: "string",
					required: true,
					defaultValue: "",
				},
				lastName: {
					type: "string",
					required: true,
					defaultValue: "",
					input: true,
				},
			},
		},
		advanced: {
			useSecureCookies: !env.LOCAL,
		},
	});
