import { auth } from "./auth";
import {
	handleBalances,
	handleBudget,
	handleBudgetDelete,
	handleBudgetList,
	handleBudgetMonthly,
	handleBudgetTotal,
} from "./handlers/budget";
import { handleCron } from "./handlers/cron";
import {
	handleGroupDetails,
	handleUpdateGroupMetadata,
} from "./handlers/group";
import { handleHelloWorld } from "./handlers/hello";
import {
	handlePasswordMigration,
	handleRelinkData,
} from "./handlers/migration";
import {
	handleScheduledActionCreate,
	handleScheduledActionDelete,
	handleScheduledActionDetails,
	handleScheduledActionHistory,
	handleScheduledActionHistoryDetails,
	handleScheduledActionList,
	handleScheduledActionRunNow,
	handleScheduledActionUpdate,
} from "./handlers/scheduled-actions";
import {
	handleSplitDelete,
	handleSplitNew,
	handleTransactionsList,
} from "./handlers/split";
import {
	addCORSHeaders,
	createErrorResponse,
	createOptionsResponse,
} from "./utils";
import { ScheduledActionsOrchestratorWorkflow } from "./workflows/scheduled-actions-orchestrator";
import { ScheduledActionsProcessorWorkflow } from "./workflows/scheduled-actions-processor";

// Helper function to handle auth routes
async function handleAuthRoutes(
	request: Request,
	env: Env,
	path: string,
): Promise<Response | null> {
	if (!path.startsWith("/auth/")) {
		return null;
	}

	// Disable signups - return 404 for any signup-related routes
	const signupRoutes = [
		"/auth/sign-up",
		"/auth/signup",
		"/auth/register",
		"/auth/sign-up/email",
		"/auth/signup/email",
	];

	if (signupRoutes.some((route) => path.startsWith(route))) {
		return createErrorResponse("Not Found", 404, request, env);
	}

	const authInstance = auth(env);
	const authResponse = await authInstance.handler(request);
	return addCORSHeaders(authResponse, request, env);
}

// Helper function to handle method validation for scheduled actions
function validateMethodAndHandle(
	request: Request,
	env: Env,
	allowedMethods: string[],
	handler: (request: Request, env: Env) => Promise<Response>,
): Promise<Response> {
	if (allowedMethods.includes(request.method)) {
		return handler(request, env);
	}
	return Promise.resolve(
		createErrorResponse("Method not allowed", 405, request, env),
	);
}

// Helper function to handle scheduled actions routes
async function handleScheduledActionsRoutes(
	request: Request,
	env: Env,
	apiPath: string,
): Promise<Response | null> {
	const routeMap: Record<
		string,
		{
			methods: string[];
			handler: (request: Request, env: Env) => Promise<Response>;
		}
	> = {
		"scheduled-actions": {
			methods: ["POST"],
			handler: handleScheduledActionCreate,
		},
		"scheduled-actions/list": {
			methods: ["GET"],
			handler: handleScheduledActionList,
		},
		"scheduled-actions/update": {
			methods: ["PUT", "POST"],
			handler: handleScheduledActionUpdate,
		},
		"scheduled-actions/delete": {
			methods: ["DELETE"],
			handler: handleScheduledActionDelete,
		},
		"scheduled-actions/history": {
			methods: ["GET"],
			handler: handleScheduledActionHistory,
		},
		"scheduled-actions/history/details": {
			methods: ["GET"],
			handler: handleScheduledActionHistoryDetails,
		},
		"scheduled-actions/run": {
			methods: ["POST"],
			handler: handleScheduledActionRunNow,
		},
		"scheduled-actions/details": {
			methods: ["GET"],
			handler: handleScheduledActionDetails,
		},
	};

	const route = routeMap[apiPath];
	if (!route) {
		return null;
	}

	return await validateMethodAndHandle(
		request,
		env,
		route.methods,
		route.handler,
	);
}

// Helper function to handle basic API routes
async function handleBasicApiRoutes(
	request: Request,
	env: Env,
	apiPath: string,
): Promise<Response | null> {
	console.log("handleBasicApiRoutes", apiPath);
	switch (apiPath) {
		case "balances":
			return await handleBalances(request, env);
		case "budget":
			return await handleBudget(request, env);
		case "budget_delete":
			return await handleBudgetDelete(request, env);
		case "budget_list":
			return await handleBudgetList(request, env);
		case "budget_monthly":
			return await handleBudgetMonthly(request, env);
		case "budget_total":
			return await handleBudgetTotal(request, env);
		case "group/details":
			return await handleGroupDetails(request, env);
		case "group/metadata":
			return await handleUpdateGroupMetadata(request, env);
		case "split_new":
			return await handleSplitNew(request, env);
		case "split_delete":
			return await handleSplitDelete(request, env);
		case "transactions_list":
			return await handleTransactionsList(request, env);
		case "relink-data":
			return await handleRelinkData(request, env);
		case "migrate-passwords":
			return await handlePasswordMigration(request, env);
		case "hello":
			return await handleHelloWorld(request, env);
		default:
			return null;
	}
}

// Helper function to handle API routes
async function handleApiRoutes(
	request: Request,
	env: Env,
	path: string,
): Promise<Response | null> {
	if (!path.startsWith("/.netlify/functions/")) {
		return null;
	}

	const apiPath = path.replace("/.netlify/functions/", "");

	// Try scheduled actions routes first
	const scheduledActionsResponse = await handleScheduledActionsRoutes(
		request,
		env,
		apiPath,
	);
	if (scheduledActionsResponse) {
		return scheduledActionsResponse;
	}

	// Try basic API routes
	const basicApiResponse = await handleBasicApiRoutes(request, env, apiPath);
	if (basicApiResponse) {
		return basicApiResponse;
	}

	return createErrorResponse("Not Found", 404, request, env);
}

// Helper function to handle static assets
async function handleStaticAssets(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const assetRequest = new Request(request.url, {
			method: request.method,
		});
		return await env.ASSETS.fetch(assetRequest);
	} catch (e) {
		console.error("Asset not found", e);
		return createErrorResponse("Asset not found", 404, request, env);
	}
}

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return createOptionsResponse(request, env);
		}

		const url = new URL(request.url);
		const path = url.pathname;

		// Priority 1: Handle all better-auth routes
		const authResponse = await handleAuthRoutes(request, env, path);
		if (authResponse) {
			return authResponse;
		}

		// Priority 2: Handle all your existing application API routes
		const apiResponse = await handleApiRoutes(request, env, path);
		if (apiResponse) {
			return apiResponse;
		}

		// Handle /hello endpoint for compatibility
		if (path === "/hello") {
			return await handleHelloWorld(request, env);
		}

		// Priority 3: Fallback to serving static assets (your React app)
		return await handleStaticAssets(request, env);
	},

	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		ctx.waitUntil(handleCron(env, controller.cron));
	},
};

// Export workflow classes for Cloudflare Workflows
export {
	ScheduledActionsOrchestratorWorkflow,
	ScheduledActionsProcessorWorkflow,
};
