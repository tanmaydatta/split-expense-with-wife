import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type {
	AddExpenseActionData,
	BudgetRequest,
	ScheduledActionResultData,
	SplitRequest,
} from "../../../shared-types";
import type { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import {
	budget,
	budgetTotals,
	transactions,
	transactionUsers,
} from "../db/schema/schema";
import type { SplitAmount } from "../types";
import {
	calculateSplitAmounts,
	formatSQLiteTime,
	generateDrizzleBalanceUpdates,
	isValidCurrency,
	validatePaidAmounts,
	validateSplitPercentages,
} from "../utils";

type DbInstance = ReturnType<typeof getDb>;
type QueryStatement = { query: BatchItem<"sqlite"> };

/**
 * Generate deterministic transaction ID for scheduled actions
 */
export function generateDeterministicTransactionId(
	actionId: string,
	currentDate: string,
): string {
	return `tx_${actionId}_${currentDate}`;
}

/**
 * Generate deterministic budget ID for scheduled actions
 */
export function generateDeterministicBudgetId(
	actionId: string,
	currentDate: string,
): string {
	return `bg_${actionId}_${currentDate}`;
}

// Helper function to validate split request
function validateSplitRequest(splitRequest: SplitRequest): void {
	if (!isValidCurrency(splitRequest.currency)) {
		throw new Error(`Invalid currency: ${splitRequest.currency}`);
	}

	if (!validateSplitPercentages(splitRequest.splitPctShares)) {
		throw new Error("Split percentages must add up to 100%");
	}

	if (!validatePaidAmounts(splitRequest.paidByShares, splitRequest.amount)) {
		throw new Error("Paid amounts must add up to total amount");
	}
}

// Helper function to check if transaction exists
async function checkTransactionExists(
	db: DbInstance,
	transactionId: string,
): Promise<boolean> {
	const existingTransaction = await db
		.select()
		.from(transactions)
		.where(
			and(
				eq(transactions.transactionId, transactionId),
				isNull(transactions.deleted),
			),
		)
		.limit(1);

	return existingTransaction.length > 0;
}

// Helper function to get user data
async function getUserData(db: DbInstance, splitRequest: SplitRequest) {
	const allUserIds = [
		...Object.keys(splitRequest.paidByShares || {}),
		...Object.keys(splitRequest.splitPctShares || {}),
	];
	const uniqueUserIds = [...new Set(allUserIds)];

	const userData = await db
		.select({ id: user.id, firstName: user.firstName })
		.from(user)
		.where(inArray(user.id, uniqueUserIds));

	return new Map<string, string>(
		userData.map((u: { id: string; firstName: string }) => [u.id, u.firstName]),
	);
}

// Helper function to transform paid shares
function transformPaidShares(
	splitRequest: SplitRequest,
	userIdToName: Map<string, string>,
) {
	const paidBySharesWithNames: Record<string, number> = {};
	for (const [userId, amount] of Object.entries(splitRequest.paidByShares)) {
		const firstName = userIdToName.get(userId) || userId;
		paidBySharesWithNames[firstName] = amount as number;
	}
	return paidBySharesWithNames;
}

// Helper function to transform split percentages and calculate owed amounts
function transformSplitShares(
	splitRequest: SplitRequest,
	userIdToName: Map<string, string>,
) {
	const splitPctSharesWithNames: Record<string, number> = {};
	const owedAmounts: Record<string, number> = {};

	for (const [userId, percentage] of Object.entries(
		splitRequest.splitPctShares,
	)) {
		const firstName = userIdToName.get(userId) || userId;
		splitPctSharesWithNames[firstName] = percentage as number;

		const owedAmount = (splitRequest.amount * (percentage as number)) / 100;
		owedAmounts[firstName] = owedAmount;
	}

	return { splitPctSharesWithNames, owedAmounts };
}

// Helper function to calculate owed-to amounts
function calculateOwedToAmounts(
	splitRequest: SplitRequest,
	userIdToName: Map<string, string>,
	owedAmounts: Record<string, number>,
) {
	const owedToAmounts: Record<string, number> = {};

	for (const [userId, paidAmount] of Object.entries(
		splitRequest.paidByShares,
	)) {
		const firstName = userIdToName.get(userId) || userId;
		const owedAmount = owedAmounts[firstName] || 0;
		const netAmount = (paidAmount as number) - owedAmount;

		if (netAmount > 0) {
			owedToAmounts[firstName] = netAmount;
		}
	}

	return owedToAmounts;
}

// Helper function to get user data and create name mappings
async function getUserMappings(
	db: DbInstance,
	splitRequest: SplitRequest,
): Promise<{
	userIdToName: Map<string, string>;
	paidBySharesWithNames: Record<string, number>;
	splitPctSharesWithNames: Record<string, number>;
	owedAmounts: Record<string, number>;
	owedToAmounts: Record<string, number>;
}> {
	const userIdToName = await getUserData(db, splitRequest);
	const paidBySharesWithNames = transformPaidShares(splitRequest, userIdToName);
	const { splitPctSharesWithNames, owedAmounts } = transformSplitShares(
		splitRequest,
		userIdToName,
	);
	const owedToAmounts = calculateOwedToAmounts(
		splitRequest,
		userIdToName,
		owedAmounts,
	);

	return {
		userIdToName,
		paidBySharesWithNames,
		splitPctSharesWithNames,
		owedAmounts,
		owedToAmounts,
	};
}

// Helper function to create database statements
function createTransactionStatements(
	db: DbInstance,
	splitRequest: SplitRequest,
	transactionId: string,
	groupId: string,
	timestamp: string,
	paidBySharesWithNames: Record<string, number>,
	owedAmounts: Record<string, number>,
	owedToAmounts: Record<string, number>,
	splitAmounts: SplitAmount[],
	env: Env,
): QueryStatement[] {
	const statements = [];

	// Create main transaction record
	statements.push({
		query: db.insert(transactions).values({
			description: splitRequest.description,
			amount: splitRequest.amount,
			createdAt: timestamp,
			currency: splitRequest.currency,
			transactionId,
			groupId: String(groupId),
			metadata: {
				paidByShares: paidBySharesWithNames,
				owedAmounts: owedAmounts,
				owedToAmounts: owedToAmounts,
			},
		}),
	});

	// Create transaction user records
	if (splitAmounts.length > 0) {
		statements.push({
			query: db.insert(transactionUsers).values(
				splitAmounts.map((split) => ({
					transactionId,
					userId: split.user_id,
					amount: split.amount,
					owedToUserId: split.owed_to_user_id,
					groupId,
					currency: split.currency,
				})),
			),
		});
	}

	// Generate balance updates
	const balanceUpdates = generateDrizzleBalanceUpdates(
		env,
		splitAmounts,
		groupId,
		"add",
	);
	for (const update of balanceUpdates) {
		statements.push({ query: update });
	}

	return statements;
}

/**
 * Create database statements for a split transaction from SplitRequest (reusable by handlers)
 * Returns the statements and result data for batch execution
 */
export async function createSplitTransactionFromRequest(
	splitRequest: SplitRequest,
	groupId: string,
	db: DbInstance,
	env: Env,
	transactionId: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: QueryStatement[];
	transactionId: string;
}> {
	// Validate split request
	validateSplitRequest(splitRequest);

	// Check if transaction already exists (for deterministic IDs)
	const exists = await checkTransactionExists(db, transactionId);
	if (exists) {
		console.log(
			`Transaction ${transactionId} already exists, skipping creation`,
		);
		return {
			resultData: {
				message: `Transaction already exists: ${splitRequest.description}`,
				transactionId,
			},
			statements: [],
			transactionId,
		};
	}

	const timestamp = formatSQLiteTime();

	// Get user mappings and transformed data
	const { paidBySharesWithNames, owedAmounts, owedToAmounts } =
		await getUserMappings(db, splitRequest);

	// Calculate split amounts
	const splitAmounts = calculateSplitAmounts(
		splitRequest.amount,
		splitRequest.paidByShares,
		splitRequest.splitPctShares,
		splitRequest.currency,
	);

	// Create database statements
	const statements = createTransactionStatements(
		db,
		splitRequest,
		transactionId,
		groupId,
		timestamp,
		paidBySharesWithNames,
		owedAmounts,
		owedToAmounts,
		splitAmounts,
		env,
	);

	const resultData: ScheduledActionResultData = {
		message: `Transaction created: ${splitRequest.description}`,
		transactionId,
	};

	return { resultData, statements, transactionId };
}

/**
 * Create database statements for a split transaction from AddExpenseActionData (for scheduled actions)
 * Returns the statements and result data for batch execution
 */
export async function createSplitTransactionStatements(
	expenseData: AddExpenseActionData,
	groupId: string,
	db: DbInstance,
	env: Env,
	transactionId: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: QueryStatement[];
}> {
	// Convert AddExpenseActionData to SplitRequest format
	const splitRequest: SplitRequest = {
		amount: expenseData.amount,
		description: expenseData.description,
		paidByShares: { [expenseData.paidByUserId]: expenseData.amount },
		splitPctShares: expenseData.splitPctShares,
		currency: expenseData.currency,
	};

	// Use the generic function with the provided transaction ID
	const result = await createSplitTransactionFromRequest(
		splitRequest,
		groupId,
		db,
		env,
		transactionId,
	);

	return {
		resultData: result.resultData,
		statements: result.statements,
	};
}

/**
 * Create database statements for a budget entry (reusable by handlers and scheduled actions)
 * Returns the statements and result data for batch execution
 */
export async function createBudgetEntryStatements(
	budgetRequest: BudgetRequest,
	db: DbInstance,
	budgetId: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: QueryStatement[];
}> {
	// Validate currency
	if (!isValidCurrency(budgetRequest.currency)) {
		throw new Error(`Invalid currency: ${budgetRequest.currency}`);
	}

	// Validate amount
	if (budgetRequest.amount === 0) {
		throw new Error("Budget amount cannot be zero");
	}

	// Check if budget already exists
	const existingBudget = await db
		.select()
		.from(budget)
		.where(and(eq(budget.budgetId, budgetId), isNull(budget.deleted)))
		.limit(1);

	if (existingBudget.length > 0) {
		console.log(`Budget ${budgetId} already exists, skipping creation`);
		return {
			resultData: {
				message: `Budget already exists: ${budgetRequest.description}`,
			},
			statements: [],
		};
	}

	const timestamp = formatSQLiteTime();
	const statements = [];

	// Create budget entry
	statements.push({
		query: db.insert(budget).values({
			budgetId,
			description: budgetRequest.description,
			addedTime: timestamp,
			amount: budgetRequest.amount,
			name: budgetRequest.name,
			groupid: budgetRequest.groupid,
			currency: budgetRequest.currency,
		}),
	});

	// Update budget totals
	statements.push({
		query: db
			.insert(budgetTotals)
			.values({
				groupId: budgetRequest.groupid,
				name: budgetRequest.name,
				currency: budgetRequest.currency,
				totalAmount: budgetRequest.amount,
				updatedAt: timestamp,
			})
			.onConflictDoUpdate({
				target: [
					budgetTotals.groupId,
					budgetTotals.name,
					budgetTotals.currency,
				],
				set: {
					totalAmount: sql`${budgetTotals.totalAmount} + ${budgetRequest.amount}`,
					updatedAt: timestamp,
				},
			}),
	});

	const resultData: ScheduledActionResultData = {
		message: `Budget entry created: ${budgetRequest.description}`,
	};

	return { resultData, statements };
}

/**
 * Create database statements for a budget entry from scheduled actions (with deterministic ID)
 */
export async function createBudgetEntryStatementsForScheduledAction(
	budgetRequest: BudgetRequest,
	db: DbInstance,
	budgetId: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: QueryStatement[];
}> {
	// Use the generic function with the provided budget ID
	return await createBudgetEntryStatements(budgetRequest, db, budgetId);
}
