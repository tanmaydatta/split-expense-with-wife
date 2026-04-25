import { createJsonResponse } from "../utils";

export async function handleHealth(
	request: Request,
	env: Env,
): Promise<Response> {
	return createJsonResponse({ status: "ok" }, 200, {}, request, env);
}
