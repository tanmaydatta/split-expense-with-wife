import {
	createErrorResponse,
	createJsonResponse,
	withAuthLite,
} from "../utils";
import {
	createTransfer,
	deleteTransferForEntry,
	TransferError,
	validateTransfer,
} from "../utils/budget-transfers";
export async function handleBudgetTransfer(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST")
		return createErrorResponse("Method not allowed", 405, request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: authenticated creation has one error boundary and explicit feature/membership gates.
	return withAuthLite(request, env, async (session) => {
		try {
			if (env.BUDGET_TRANSFERS_ENABLED !== "true")
				return createErrorResponse(
					"New budget transfers are temporarily disabled.",
					503,
					request,
					env,
				);
			const group = session.currentUser.groupid;
			if (!group)
				return createErrorResponse("Join a group first", 403, request, env);
			const input = validateTransfer(await request.json().catch(() => null));
			return createJsonResponse(
				await createTransfer(env, String(group), session.currentUser.id, input),
				200,
				{},
				request,
				env,
			);
		} catch (error) {
			return createErrorResponse(
				error instanceof TransferError
					? error.message
					: "Could not record transfer. Retry with the same request.",
				error instanceof TransferError ? error.status : 500,
				request,
				env,
			);
		}
	});
}

export async function transferDeleteResponse(
	request: Request,
	env: Env,
	group: string,
	actor: string,
	id: string,
	confirmed: boolean,
): Promise<Response | null> {
	try {
		return (await deleteTransferForEntry(env, group, actor, id, confirmed))
			? createJsonResponse(
					{ message: "Transfer deleted from both budgets" },
					200,
					{},
					request,
					env,
				)
			: null;
	} catch (error) {
		return createErrorResponse(
			error instanceof TransferError
				? error.message
				: "Could not delete transfer. Retry safely.",
			error instanceof TransferError ? error.status : 500,
			request,
			env,
		);
	}
}
