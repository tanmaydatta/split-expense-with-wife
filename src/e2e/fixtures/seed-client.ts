import type { SeedRequest, SeedResponse } from "../../../shared-types";

export const BACKEND_URL =
	process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

export const isLocalBackend = BACKEND_URL.startsWith("http://localhost");

export async function callSeedEndpoint(
	payload: SeedRequest,
): Promise<SeedResponse> {
	const secret = process.env.E2E_SEED_SECRET;
	if (!secret) {
		throw new Error(
			"E2E_SEED_SECRET is not set; seed-based fixtures cannot run. " +
				"Set it via Playwright's webServer env or your shell.",
		);
	}
	const res = await fetch(`${BACKEND_URL}/test/seed`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-E2E-Seed-Secret": secret,
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`seed failed: ${res.status} ${text}`);
	}
	return (await res.json()) as SeedResponse;
}
