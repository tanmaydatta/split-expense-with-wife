// Shared types for both frontend and backend
// These types ensure consistency across API requests and responses

export type UserFromAuth = {
	firstName: string;
	id: string;
};

// User and authentication types
export interface User {
	Id: string;
	username?: string | null;
	FirstName: string | null;
	LastName?: string | null;
	groupid: string | null;
	password?: string; // Only used in login
}

export interface Group {
	groupid: string;
	budgets: string; // JSON string
	userids: string; // JSON string
	metadata: string; // JSON string
}

// New budget structure from the group_budgets table
export interface GroupBudgetData {
	id: string;
	budgetName: string;
	description: string | null;
}

// Budget types
export interface BudgetEntry {
	id: number;
	description: string;
	addedTime: string; // ISO string format
	price: string;
	amount: number;
	name: string;
	deleted?: string; // ISO string format
	groupid: string;
	currency: string;
}

// Transaction types
export interface Transaction {
	description: string;
	amount: number;
	created_at: string; // ISO string format
	metadata: string; // JSON string
	currency: string;
	transaction_id: string;
	group_id: string;
	deleted?: string; // ISO string format
}

export interface TransactionUser {
	transaction_id: string;
	user_id: string;
	amount: number;
	owed_to_user_id: string;
	group_id: string;
	currency: string;
	deleted?: string; // ISO string format
	first_name?: string; // User's first name for display
}

// Parsed metadata types
export interface GroupMetadata {
	defaultShare: Record<string, number>;
	defaultCurrency: string;
}

export interface TransactionMetadata {
	paidByShares: Record<string, number>;
	owedAmounts: Record<string, number>;
	owedToAmounts: Record<string, number>;
}

// API Request types
export interface LoginRequest {
	username: string;
	password: string;
}

export interface BudgetRequest {
	amount: number;
	description: string;
	budgetId: string;
	groupid: string;
	currency: string;
}

export interface BudgetListRequest {
	offset: number;
	budgetId: string;
}

export interface BudgetTotalRequest {
	budgetId: string;
}

export interface BudgetDeleteRequest {
	id: number;
}

export interface BudgetMonthlyRequest {
	budgetId: string;
	timeRange?: "6M" | "1Y" | "2Y" | "All";
	currency?: string;
}

export interface SplitRequest {
	amount: number;
	description: string;
	paidByShares: Record<string, number>;
	splitPctShares: Record<string, number>;
	currency: string;
}

export interface SplitNewRequest {
	amount: number;
	description: string;
	paidByShares: Record<string, number>;
	splitPctShares: Record<string, number>;
	currency: string;
}

export interface SplitDeleteRequest {
	id: string;
}

export interface TransactionsListRequest {
	offset: number;
}

// API Response types
export interface LoginResponse {
	username: string;
	groupId: string;
	budgets: string[];
	users: User[];
	userids: string[];
	metadata: GroupMetadata;
	userId: string;
	token: string;
	currencies: string[];
}

export interface MonthlyAmount {
	currency: string;
	amount: number;
}

export interface MonthlyBudget {
	month: string;
	year: number;
	amounts: MonthlyAmount[];
}

export interface AverageSpendData {
	currency: string;
	averageMonthlySpend: number;
	totalSpend: number;
	monthsAnalyzed: number;
}

export interface AverageSpendPeriod {
	periodMonths: number;
	averages: AverageSpendData[];
}

export interface BudgetMonthlyResponse {
	monthlyBudgets: MonthlyBudget[];
	averageMonthlySpend: AverageSpendPeriod[];
	periodAnalyzed: {
		startDate: string;
		endDate: string;
	};
}

export interface TransactionsListResponse {
	transactions: Transaction[];
	transactionDetails: Record<string, TransactionUser[]>;
}

export interface TransactionBalances {
	user_id: string;
	amount: number;
	owed_to_user_id: string;
	currency: string;
}

// Generic API response wrapper
export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface ErrorResponse {
	error: string;
	statusCode: number;
}

// Frontend-specific types (extending the backend types)
export interface FrontendTransaction {
	transactionId: string;
	description: string;
	totalAmount: number;
	date: string;
	amountOwed: Record<string, number>;
	paidBy: Record<string, number>;
	owedTo: Record<string, number>;
	totalOwed: number;
	currency: string;
}

export interface FrontendUser {
	Id: string;
	Name: string;
}

// Budget display types
export interface BudgetDisplayEntry {
	id: number;
	date: string;
	description: string;
	amount: string;
	deleted?: string;
	currency: string;
}

export interface BudgetTotal {
	currency: string;
	amount: number;
}

// Settings/Group management types
export interface GroupDetailsResponse {
	groupid: string;
	groupName: string;
	budgets: GroupBudgetData[];
	metadata: GroupMetadata;
	users: User[];
}

export interface UpdateGroupMetadataRequest {
	groupid: string;
	defaultShare?: Record<string, number>;
	defaultCurrency?: string;
	groupName?: string;
	budgets?: GroupBudgetData[];
}

export interface UpdateGroupMetadataResponse {
	message: string;
	metadata: GroupMetadata;
}

// Better-auth and session types (matching actual schema)
export interface AuthenticatedUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
	username: string | null;
	displayUsername: string | null;
	groupid: string | null;
	firstName: string;
	lastName: string;
}

export interface BetterAuthSession {
	id: string;
	expiresAt: Date;
	token: string;
	createdAt: Date;
	updatedAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	userId: string;
}

export interface EnrichedSessionExtra {
	currentUser: AuthenticatedUser;
	usersById: Record<string, AuthenticatedUser>;
	group: ParsedGroupData | null; // Already parsed in backend
	currencies?: string[];
}

export interface FullAuthSession {
	user: AuthenticatedUser;
	session: BetterAuthSession;
	extra: EnrichedSessionExtra;
}

// Parsed group data for frontend use (same structure as backend ParsedGroup)
export interface ParsedGroupData {
	groupid: string;
	budgets: GroupBudgetData[];
	userids: string[];
	metadata: GroupMetadata;
}

// Redux store state type
export interface ReduxState {
	value: FullAuthSession | null;
}

// Dashboard component types
export interface DashboardUser {
	FirstName: string;
	Id: string;
	percentage?: number;
}

export interface ApiOperationResponses {
	expense?: { message: string; transactionId: string };
	budget?: { message: string };
}

// API endpoint types for type-safe API calls
export interface ApiEndpoints {
	"/login": {
		request: LoginRequest;
		response: LoginResponse;
	};
	"/budget": {
		request: BudgetRequest;
		response: { message: string };
	};

	"/budget_list": {
		request: BudgetListRequest;
		response: BudgetEntry[];
	};
	"/budget_total": {
		request: BudgetTotalRequest;
		response: BudgetTotal[];
	};
	"/budget_delete": {
		request: BudgetDeleteRequest;
		response: { message: string };
	};
	"/budget_monthly": {
		request: BudgetMonthlyRequest;
		response: BudgetMonthlyResponse;
	};
	"/split_new": {
		request: SplitNewRequest;
		response: { message: string; transactionId: string };
	};
	"/split_delete": {
		request: SplitDeleteRequest;
		response: { message: string };
	};
	"/transactions_list": {
		request: TransactionsListRequest;
		response: TransactionsListResponse;
	};
	"/balances": {
		request: {};
		response: Record<string, Record<string, number>>;
	};
	"/logout": {
		request: {};
		response: { message: string };
	};
	"/group/details": {
		request: {};
		response: GroupDetailsResponse;
	};
	"/group/metadata": {
		request: UpdateGroupMetadataRequest;
		response: UpdateGroupMetadataResponse;
	};
	"/scheduled-actions": {
		request: CreateScheduledActionRequest;
		response: { message: string; id: string };
	};
	"/scheduled-actions/list": {
		request: ScheduledActionListRequest;
		response: ScheduledActionListResponse;
	};
	"/scheduled-actions/update": {
		request: UpdateScheduledActionRequest;
		response: { message: string };
	};
	"/scheduled-actions/delete": {
		request: ScheduledActionDeleteRequest;
		response: { message: string };
	};
	"/scheduled-actions/history": {
		request: ScheduledActionHistoryListRequest;
		response: ScheduledActionHistoryListResponse;
	};
	"/scheduled-actions/run": {
		request: { id: string };
		response: { message: string; workflowInstanceId: string };
	};
}

// Type-safe API client interface
export interface TypedApiClient {
	post<K extends keyof ApiEndpoints>(
		endpoint: K,
		data: ApiEndpoints[K]["request"],
	): Promise<ApiEndpoints[K]["response"]>;
	get<K extends keyof ApiEndpoints>(
		endpoint: K,
		options?: { queryParams?: Record<string, string> },
	): Promise<ApiEndpoints[K]["response"]>;
}

// Types
export type Currency = "USD" | "EUR" | "GBP" | "INR";

// Constants
export const CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"INR",
	"CAD",
	"AUD",
	"JPY",
	"CHF",
	"CNY",
	"SGD",
] as const;

// Group Budget Data Schema
export const GroupBudgetDataSchema = z.object({
	id: z.string().min(1),
	budgetName: z
		.string()
		.min(1, "Budget name cannot be empty")
		.max(60, "Budget name cannot exceed 60 characters")
		.regex(
			/^[a-zA-Z0-9\s\-_]+$/,
			"Budget names can only contain letters, numbers, spaces, hyphens, and underscores",
		)
		.transform((name) => name.trim()),
	description: z.string().nullable().optional(),
});

// Update Group Metadata Request Schema
export const UpdateGroupMetadataRequestSchema = z
	.object({
		groupid: z.union([z.string(), z.number()]).transform((val) => String(val)),
		defaultShare: z
			.record(z.string(), z.number())
			.refine(
				(shares) => {
					const values = Object.values(shares);
					return values.every((v) => v >= 0);
				},
				{ message: "Default share percentages must be positive" },
			)
			.refine(
				(shares) => {
					const total = Object.values(shares).reduce((sum, p) => sum + p, 0);
					return Math.abs(total - 100) <= 0.001;
				},
				{ message: "Default share percentages must add up to 100%" },
			)
			.optional(),
		defaultCurrency: z
			.enum(CURRENCIES as readonly [string, ...string[]])
			.optional(),
		groupName: z
			.string()
			.transform((name) => name.trim())
			.refine((name) => name.length >= 1, {
				message: "Group name cannot be empty",
			})
			.optional(),
		budgets: z
			.array(GroupBudgetDataSchema)
			.refine(
				(budgets) => {
					const names = budgets.map((b) => b.budgetName.toLowerCase());
					return names.length === new Set(names).size;
				},
				{ message: "Budget names must be unique" },
			)
			.optional(),
	})
	.refine(
		(data) => {
			// Ensure at least one field is being updated
			const hasChanges =
				data.defaultShare !== undefined ||
				data.defaultCurrency !== undefined ||
				data.groupName !== undefined ||
				data.budgets !== undefined;
			return hasChanges;
		},
		{ message: "No changes provided" },
	);

// Scheduled Actions Types
export type ScheduledActionFrequency = "daily" | "weekly" | "monthly";
export type ScheduledActionType = "add_expense" | "add_budget";

// Scheduled Actions Response Types
export type CreateScheduledActionResponse = { message: string; id: string };
export type UpdateScheduledActionResponse = { message: string };
export type DeleteScheduledActionResponse = { message: string };
export type ScheduledActionErrorResponse = { error: string };

// Scheduled Action JSON Types
export type ScheduledActionData = AddExpenseActionData | AddBudgetActionData;

export type ScheduledActionResultData = {
	message: string;
	transactionId?: string;
	budgetEntryId?: string;
} | null;

// Action-specific data types
export interface AddExpenseActionData {
	amount: number;
	description: string;
	currency: string; // Will be validated against supported currencies
	paidByUserId: string; // Which user paid for the expense
	splitPctShares: Record<string, number>; // userId -> percentage (must sum to 100)
}

export interface AddBudgetActionData {
	amount: number;
	description: string;
	budgetId: string; // Budget ID from group_budgets table
	currency: string; // Will be validated against supported currencies
	type: "Credit" | "Debit"; // Credit adds to budget, Debit subtracts from budget
}

// Base scheduled action
export interface ScheduledAction {
	id: string;
	userId: string;
	actionType: ScheduledActionType;
	frequency: ScheduledActionFrequency;
	startDate: string; // ISO date
	isActive: boolean;
	actionData: AddExpenseActionData | AddBudgetActionData;
	lastExecutedAt?: string;
	nextExecutionDate: string;
	createdAt: string;
	updatedAt: string;
}

// API request/response types
export interface CreateScheduledActionRequest {
	actionType: ScheduledActionType;
	frequency: ScheduledActionFrequency;
	startDate: string;
	actionData: AddExpenseActionData | AddBudgetActionData;
}

export interface UpdateScheduledActionRequest {
	id: string;
	isActive?: boolean;
	frequency?: ScheduledActionFrequency;
	actionData?: AddExpenseActionData | AddBudgetActionData;
	// New: allow explicitly setting the next run date
	nextExecutionDate?: string; // ISO date YYYY-MM-DD
	// New: convenience flag to skip the next run (advance by one period)
	skipNext?: boolean;
}

export interface ScheduledActionDeleteRequest {
	id: string;
}

export interface ScheduledActionListRequest {
	offset?: number;
	limit?: number;
}

export interface ScheduledActionListResponse {
	scheduledActions: ScheduledAction[];
	totalCount: number;
	hasMore: boolean;
}

// Action execution history types
export interface ScheduledActionHistory {
	id: string;
	scheduledActionId: string;
	userId: string;
	actionType: ScheduledActionType;
	executedAt: string; // ISO datetime
	executionStatus: "success" | "failed" | "started";
	actionData: AddExpenseActionData | AddBudgetActionData;
	resultData?: ScheduledActionResultData; // Results from the executed action
	errorMessage?: string;
	executionDurationMs?: number;
}

export interface ScheduledActionHistoryListRequest {
	offset?: number;
	limit?: number;
	scheduledActionId?: string; // Filter by specific scheduled action
	actionType?: ScheduledActionType; // Filter by action type
	executionStatus?: "success" | "failed" | "started"; // Filter by status
}

export interface ScheduledActionHistoryListResponse {
	history: ScheduledActionHistory[];
	totalCount: number;
	hasMore: boolean;
}

// ============================
// Zod Schemas (shared)
// ============================
import { z } from "zod";

export const AddExpenseActionSchema = z.object({
	amount: z.number().positive(),
	description: z.string().min(2).max(100),
	currency: z.string(),
	paidByUserId: z.string().min(1),
	splitPctShares: z
		.record(z.string(), z.number())
		.refine(
			(shares) =>
				Math.abs(Object.values(shares).reduce((a, b) => a + b, 0) - 100) < 0.01,
			{ message: "Split percentages must total 100%" },
		),
});

export const AddBudgetActionSchema = z.object({
	amount: z.number().positive(),
	description: z.string().min(2).max(100),
	budgetId: z.string().min(1),
	currency: z.string(),
	type: z.union([z.literal("Credit"), z.literal("Debit")]),
});

export const CreateScheduledActionSchema = z.object({
	actionType: z.union([z.literal("add_expense"), z.literal("add_budget")]),
	frequency: z.union([
		z.literal("daily"),
		z.literal("weekly"),
		z.literal("monthly"),
	]),
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	actionData: z.union([AddExpenseActionSchema, AddBudgetActionSchema]),
});

export const UpdateScheduledActionSchema = z
	.object({
		id: z.string().min(1),
		isActive: z.boolean().optional(),
		frequency: z
			.union([z.literal("daily"), z.literal("weekly"), z.literal("monthly")])
			.optional(),
		actionData: z
			.union([AddExpenseActionSchema, AddBudgetActionSchema])
			.optional(),
		nextExecutionDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		skipNext: z.boolean().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.nextExecutionDate && data.skipNext) {
			ctx.addIssue({
				code: "custom",
				message: "Provide only one of nextExecutionDate or skipNext",
				path: ["nextExecutionDate"],
			});
		}
	});

export const ScheduledActionListQuerySchema = z.object({
	offset: z.coerce
		.number()
		.int()
		.catch(0)
		.transform((n: number) => (n < 0 ? 0 : n)),
	limit: z.coerce
		.number()
		.int()
		.catch(10)
		.transform((n: number) => (n < 1 ? 10 : n > 50 ? 50 : n)),
});

export const ScheduledActionHistoryQuerySchema = z.object({
	offset: z.coerce
		.number()
		.int()
		.catch(0)
		.transform((n: number) => (n < 0 ? 0 : n)),
	limit: z.coerce
		.number()
		.int()
		.catch(10)
		.transform((n: number) => (n < 1 ? 10 : n > 50 ? 50 : n)),
	scheduledActionId: z.string().min(1),
	executionStatus: z
		.union([z.literal("success"), z.literal("failed"), z.literal("started")])
		.optional(),
});

// Export types inferred from schemas
export type CreateScheduledActionInput = z.infer<
	typeof CreateScheduledActionSchema
>;
export type UpdateScheduledActionInput = z.infer<
	typeof UpdateScheduledActionSchema
>;
export type ScheduledActionListQuery = z.infer<
	typeof ScheduledActionListQuerySchema
>;
export type ScheduledActionHistoryQuery = z.infer<
	typeof ScheduledActionHistoryQuerySchema
>;
export type UpdateGroupMetadataRequestInput = z.infer<
	typeof UpdateGroupMetadataRequestSchema
>;
