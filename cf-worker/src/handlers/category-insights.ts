import {
	createErrorResponse,
	createJsonResponse,
	withAuthLite,
} from "../utils";
import { categoriesEnabled } from "../utils/categories";
import {
	InsightsError,
	readCategoryInsights,
	validateInsightsRequest,
} from "../utils/category-insights";
export async function handleCategoryInsights(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuthLite(request, env, async (session) => {
		if (!categoriesEnabled(env))
			return createErrorResponse(
				"Categories are not enabled",
				503,
				request,
				env,
			);
		const group = session.currentUser.groupid;
		if (!group)
			return createErrorResponse("Join a group first", 403, request, env);
		const body = await request.json().catch(() => null);
		if (isLegacyInsightsRequest(body))
			return createErrorResponse(
				"Insights changed. Refresh the page.",
				409,
				request,
				env,
			);
		const input = validateInsightsRequest(body);
		if (!input)
			return createErrorResponse(
				"Choose valid dates within 366 days, currency, budget and up to 100 temporary exclusions.",
				400,
				request,
				env,
			);
		try {
			return createJsonResponse(
				await readCategoryInsights(env, group, input),
				200,
				{ "Cache-Control": "private, no-store" },
				request,
				env,
			);
		} catch (error) {
			return insightsFailure(error, request, env);
		}
	});
}
function insightsFailure(error: unknown, request: Request, env: Env) {
	if (error instanceof InsightsError)
		return createErrorResponse(error.message, error.status, request, env);
	return createErrorResponse(
		"Could not load category insights",
		500,
		request,
		env,
	);
}

function isLegacyInsightsRequest(value: unknown): boolean {
	return Boolean(
		value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			!("source" in value),
	);
}
