import type { SeedRequest, SeedResponse } from "../../../shared-types";
import { createErrorResponse, createJsonResponse } from "../utils";

const SEED_SECRET_HEADER = "X-E2E-Seed-Secret";

export async function handleTestSeed(
	request: Request,
	env: Env,
): Promise<Response> {
	// Layer 2: per-request secret check
	const provided = request.headers.get(SEED_SECRET_HEADER);
	if (!provided || provided !== env.E2E_SEED_SECRET) {
		return createErrorResponse("Not Found", 404, request, env);
	}

	let _payload: SeedRequest;
	try {
		_payload = (await request.json()) as SeedRequest;
	} catch {
		return createErrorResponse("Invalid JSON", 400, request, env);
	}

	// Validation + entity creation come in subsequent tasks.
	// For now, return a stub response so the gate test passes.
	const response: SeedResponse = {
		ids: { users: {}, groups: {}, transactions: {}, budgetEntries: {} },
		sessions: {},
	};
	return createJsonResponse(response, 200, {}, request, env);
}
