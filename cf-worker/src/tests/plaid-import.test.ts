import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import { decryptPlaidToken, encryptPlaidToken, plaidEnabled } from "../utils/plaid";

const env = testEnv as unknown as Env;

describe("Plaid Sandbox isolation", () => {
	it("keeps bank routes unavailable without server secrets", async () => {
		const response = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/bank-import/connections"),
			env,
			createExecutionContext(),
		);
		expect(response.status).toBe(503);
		expect(plaidEnabled(env)).toBe(false);
	});

	it("encrypts tokens with a random IV and requires the same key to decrypt", async () => {
		const configured = { ...env, PLAID_TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-over-32-characters" } as Env;
		const first = await encryptPlaidToken(configured, "access-sandbox-example");
		const second = await encryptPlaidToken(configured, "access-sandbox-example");
		expect(first).not.toBe(second);
		expect(first).not.toContain("access-sandbox-example");
		expect(await decryptPlaidToken(configured, first)).toBe("access-sandbox-example");
		await expect(decryptPlaidToken({ ...configured, PLAID_TOKEN_ENCRYPTION_KEY: "a-different-test-key-longer-than-32" } as Env, first)).rejects.toThrow();
	});
});
