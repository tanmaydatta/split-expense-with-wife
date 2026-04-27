import type { BatchItem } from "drizzle-orm/batch";
import { ulid } from "ulid";
import type {
	BudgetRequest,
	DashboardSubmitRequest,
	DashboardSubmitResponse,
	SplitRequest,
} from "../../../shared-types";
import type { getDb } from "../db";
import { expenseBudgetLinks } from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
	isAuthorizedForBudgetDirect,
	isValidCurrency,
	withAuth,
} from "../utils";
import {
	createBudgetEntryStatements,
	createSplitTransactionFromRequest,
} from "../utils/scheduled-action-execution";

type SqliteBatchItem = BatchItem<"sqlite">;
type DbInstance = ReturnType<typeof getDb>;
type ValidationFailure = { ok: false; message: string };
type ValidationSuccess = { ok: true };
type ValidationResult = ValidationFailure | ValidationSuccess;

// Cross-check expense and budget when both are present.
// Compare absolute values because the frontend negates budget.amount for Debit entries.
function validatePair(body: DashboardSubmitRequest): ValidationResult {
	if (!body.expense || !body.budget) return { ok: true };
	if (Math.abs(body.expense.amount) !== Math.abs(body.budget.amount)) {
		return { ok: false, message: "Expense and budget amounts must match" };
	}
	if (body.expense.currency !== body.budget.currency) {
		return { ok: false, message: "Expense and budget currencies must match" };
	}
	return { ok: true };
}

// Verify each side carries a valid currency.
function validateCurrencies(body: DashboardSubmitRequest): ValidationResult {
	if (body.expense && !isValidCurrency(body.expense.currency)) {
		return { ok: false, message: `Invalid currency: ${body.expense.currency}` };
	}
	if (body.budget && !isValidCurrency(body.budget.currency)) {
		return { ok: false, message: `Invalid currency: ${body.budget.currency}` };
	}
	return { ok: true };
}

// Validate the dashboard submission body (presence, amount/currency match, valid currencies).
function validateBody(body: DashboardSubmitRequest): ValidationResult {
	if (!body.expense && !body.budget) {
		return {
			ok: false,
			message: "At least one of expense or budget is required",
		};
	}
	const pair = validatePair(body);
	if (!pair.ok) return pair;
	return validateCurrencies(body);
}

// Build statements for the expense side and return the new transactionId.
async function buildExpenseStatements(
	expense: NonNullable<DashboardSubmitRequest["expense"]>,
	groupId: string,
	db: DbInstance,
	env: Env,
): Promise<{ transactionId: string; queries: SqliteBatchItem[] }> {
	const transactionId = `tx_${ulid()}`;
	const splitRequest: SplitRequest = {
		amount: expense.amount,
		description: expense.description,
		paidByShares: expense.paidByShares,
		splitPctShares: expense.splitPctShares,
		currency: expense.currency,
	};
	const result = await createSplitTransactionFromRequest(
		splitRequest,
		groupId,
		db,
		env,
		transactionId,
	);
	return {
		transactionId,
		queries: result.statements.map((s) => s.query),
	};
}

// Build statements for the budget side and return the new budgetEntryId.
async function buildBudgetStatements(
	budget: NonNullable<DashboardSubmitRequest["budget"]>,
	groupId: string,
	db: DbInstance,
): Promise<{ budgetEntryId: string; queries: SqliteBatchItem[] }> {
	const budgetEntryId = `bge_${ulid()}`;
	const budgetRequest: BudgetRequest = {
		amount: budget.amount,
		description: budget.description,
		budgetId: budget.budgetId,
		currency: budget.currency,
		groupid: groupId,
	};
	const result = await createBudgetEntryStatements(
		budgetRequest,
		db,
		budgetEntryId,
	);
	return {
		budgetEntryId,
		queries: result.statements.map((s) => s.query),
	};
}

// Build the link insert statement for the junction table.
function buildLinkStatement(
	db: DbInstance,
	transactionId: string,
	budgetEntryId: string,
	groupId: string,
): { linkId: string; query: SqliteBatchItem } {
	const linkId = ulid();
	return {
		linkId,
		query: db.insert(expenseBudgetLinks).values({
			id: linkId,
			transactionId,
			budgetEntryId,
			groupId,
			createdAt: formatSQLiteTime(),
		}),
	};
}

// Process a validated dashboard submission: collect statements + run atomic batch.
async function processDashboardSubmit(
	body: DashboardSubmitRequest,
	groupId: string,
	db: DbInstance,
	env: Env,
): Promise<DashboardSubmitResponse> {
	const queries: SqliteBatchItem[] = [];
	let transactionId: string | undefined;
	let budgetEntryId: string | undefined;
	let linkId: string | undefined;

	if (body.expense) {
		const out = await buildExpenseStatements(body.expense, groupId, db, env);
		transactionId = out.transactionId;
		queries.push(...out.queries);
	}

	if (body.budget) {
		const out = await buildBudgetStatements(body.budget, groupId, db);
		budgetEntryId = out.budgetEntryId;
		queries.push(...out.queries);
	}

	if (transactionId && budgetEntryId) {
		const out = buildLinkStatement(db, transactionId, budgetEntryId, groupId);
		linkId = out.linkId;
		queries.push(out.query);
	}

	if (queries.length > 0) {
		await db.batch([queries[0], ...queries.slice(1)] as [
			SqliteBatchItem,
			...SqliteBatchItem[],
		]);
	}

	return {
		message: "Dashboard submission created successfully",
		transactionId,
		budgetEntryId,
		linkId,
	};
}

// Authorization check for the optional budget side.
async function ensureBudgetAuthorized(
	body: DashboardSubmitRequest,
	userId: string,
	db: DbInstance,
): Promise<boolean> {
	if (!body.budget) return true;
	return await isAuthorizedForBudgetDirect(db, userId, body.budget.budgetId);
}

// Inner handler — assumes auth has resolved. Validates, authorizes, processes.
async function runDashboardSubmit(
	body: DashboardSubmitRequest,
	userId: string,
	groupId: string,
	db: DbInstance,
	env: Env,
	request: Request,
): Promise<Response> {
	const validation = validateBody(body);
	if (!validation.ok) {
		return createErrorResponse(validation.message, 400, request, env);
	}

	const authorized = await ensureBudgetAuthorized(body, userId, db);
	if (!authorized) {
		return createErrorResponse("Unauthorized budget", 400, request, env);
	}

	try {
		const responseBody = await processDashboardSubmit(body, groupId, db, env);
		return createJsonResponse(responseBody, 200, {}, request, env);
	} catch (error) {
		console.error("Dashboard submit error:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return createErrorResponse(errorMessage, 400, request, env);
	}
}

// Handle dashboard submission: atomic creation of expense + budget + link
export async function handleDashboardSubmit(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as DashboardSubmitRequest;
			return await runDashboardSubmit(
				body,
				session.user.id,
				String(session.group.groupid),
				db,
				env,
				request,
			);
		});
	} catch (error) {
		console.error("Dashboard submit outer error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
