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
		const input = validateInsightsRequest(
			await request.json().catch(() => null),
		);
		if (!input)
			return createErrorResponse(
				"Choose valid UTC dates within 366 days and a three-letter currency.",
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
