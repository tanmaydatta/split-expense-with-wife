export type UserFromAuth = {
	firstName: string;
	id: string;
};
export interface User {
	Id: string;
	username?: string | null;
	FirstName: string | null;
	LastName?: string | null;
	groupid: string | null;
	password?: string;
}
export interface Group {
	groupid: string;
	budgets: string;
	userids: string;
	metadata: string;
}
export interface GroupBudgetData {
	id: string;
	budgetName: string;
	description: string | null;
}
export interface BudgetEntry {
	id: number;
	description: string;
	addedTime: string;
	price: string;
	amount: number;
	name: string;
	deleted?: string;
	groupid: string;
	currency: string;
}
export interface Transaction {
	description: string;
	amount: number;
	created_at: string;
	metadata: string;
	currency: string;
	transaction_id: string;
	group_id: string;
	deleted?: string;
}
export interface TransactionUser {
	transaction_id: string;
	user_id: string;
	amount: number;
	owed_to_user_id: string;
	group_id: string;
	currency: string;
	deleted?: string;
	first_name?: string;
}
export interface GroupMetadata {
	defaultShare: Record<string, number>;
	defaultCurrency: string;
}
export interface TransactionMetadata {
	paidByShares: Record<string, number>;
	owedAmounts: Record<string, number>;
	owedToAmounts: Record<string, number>;
}
export interface LoginRequest {
	username: string;
	password: string;
}
export interface BudgetRequest {
	amount: number;
	description: string;
	name: string;
	groupid: string;
	currency: string;
}
export interface BudgetListRequest {
	offset: number;
	name: string;
}
export interface BudgetTotalRequest {
	name: string;
}
export interface BudgetDeleteRequest {
	id: number;
}
export interface BudgetMonthlyRequest {
	name: string;
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
export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
}
export interface ErrorResponse {
	error: string;
	statusCode: number;
}
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
	group: ParsedGroupData | null;
	currencies?: string[];
}
export interface FullAuthSession {
	user: AuthenticatedUser;
	session: BetterAuthSession;
	extra: EnrichedSessionExtra;
}
export interface ParsedGroupData {
	groupid: string;
	budgets: GroupBudgetData[];
	userids: string[];
	metadata: GroupMetadata;
}
export interface ReduxState {
	value: FullAuthSession | null;
}
export interface DashboardUser {
	FirstName: string;
	Id: string;
	percentage?: number;
}
export interface ApiOperationResponses {
	expense?: {
		message: string;
		transactionId: string;
	};
	budget?: {
		message: string;
	};
}
export interface ApiEndpoints {
	"/login": {
		request: LoginRequest;
		response: LoginResponse;
	};
	"/budget": {
		request: BudgetRequest;
		response: {
			message: string;
		};
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
		response: {
			message: string;
		};
	};
	"/budget_monthly": {
		request: BudgetMonthlyRequest;
		response: BudgetMonthlyResponse;
	};
	"/split_new": {
		request: SplitNewRequest;
		response: {
			message: string;
			transactionId: string;
		};
	};
	"/split_delete": {
		request: SplitDeleteRequest;
		response: {
			message: string;
		};
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
		response: {
			message: string;
		};
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
		response: {
			message: string;
			id: string;
		};
	};
	"/scheduled-actions/list": {
		request: ScheduledActionListRequest;
		response: ScheduledActionListResponse;
	};
	"/scheduled-actions/update": {
		request: UpdateScheduledActionRequest;
		response: {
			message: string;
		};
	};
	"/scheduled-actions/delete": {
		request: ScheduledActionDeleteRequest;
		response: {
			message: string;
		};
	};
	"/scheduled-actions/history": {
		request: ScheduledActionHistoryListRequest;
		response: ScheduledActionHistoryListResponse;
	};
	"/scheduled-actions/run": {
		request: {
			id: string;
		};
		response: {
			message: string;
			workflowInstanceId: string;
		};
	};
}
export interface TypedApiClient {
	post<K extends keyof ApiEndpoints>(
		endpoint: K,
		data: ApiEndpoints[K]["request"],
	): Promise<ApiEndpoints[K]["response"]>;
	get<K extends keyof ApiEndpoints>(
		endpoint: K,
		options?: {
			queryParams?: Record<string, string>;
		},
	): Promise<ApiEndpoints[K]["response"]>;
}
export type Currency = "USD" | "EUR" | "GBP" | "INR";
export declare const CURRENCIES: readonly [
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
];
export declare const GroupBudgetDataSchema: z.ZodObject<
	{
		id: z.ZodString;
		budgetName: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
		description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
	},
	z.core.$strip
>;
export declare const UpdateGroupMetadataRequestSchema: z.ZodObject<
	{
		groupid: z.ZodPipe<
			z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>,
			z.ZodTransform<string, string | number>
		>;
		defaultShare: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
		defaultCurrency: z.ZodOptional<
			z.ZodEnum<{
				[x: string]: string;
			}>
		>;
		groupName: z.ZodOptional<
			z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>
		>;
		budgets: z.ZodOptional<
			z.ZodArray<
				z.ZodObject<
					{
						id: z.ZodString;
						budgetName: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
						description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
					},
					z.core.$strip
				>
			>
		>;
	},
	z.core.$strip
>;
export type ScheduledActionFrequency = "daily" | "weekly" | "monthly";
export type ScheduledActionType = "add_expense" | "add_budget";
export type CreateScheduledActionResponse = {
	message: string;
	id: string;
};
export type UpdateScheduledActionResponse = {
	message: string;
};
export type DeleteScheduledActionResponse = {
	message: string;
};
export type ScheduledActionErrorResponse = {
	error: string;
};
export type ScheduledActionData = AddExpenseActionData | AddBudgetActionData;
export type ScheduledActionResultData = {
	message: string;
	transactionId?: string;
	budgetEntryId?: string;
} | null;
export interface AddExpenseActionData {
	amount: number;
	description: string;
	currency: string;
	paidByUserId: string;
	splitPctShares: Record<string, number>;
}
export interface AddBudgetActionData {
	amount: number;
	description: string;
	budgetName: string;
	currency: string;
	type: "Credit" | "Debit";
}
export interface ScheduledAction {
	id: string;
	userId: string;
	actionType: ScheduledActionType;
	frequency: ScheduledActionFrequency;
	startDate: string;
	isActive: boolean;
	actionData: AddExpenseActionData | AddBudgetActionData;
	lastExecutedAt?: string;
	nextExecutionDate: string;
	createdAt: string;
	updatedAt: string;
}
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
	nextExecutionDate?: string;
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
export interface ScheduledActionHistory {
	id: string;
	scheduledActionId: string;
	userId: string;
	actionType: ScheduledActionType;
	executedAt: string;
	executionStatus: "success" | "failed" | "started";
	actionData: AddExpenseActionData | AddBudgetActionData;
	resultData?: ScheduledActionResultData;
	errorMessage?: string;
	executionDurationMs?: number;
}
export interface ScheduledActionHistoryListRequest {
	offset?: number;
	limit?: number;
	scheduledActionId?: string;
	actionType?: ScheduledActionType;
	executionStatus?: "success" | "failed" | "started";
}
export interface ScheduledActionHistoryListResponse {
	history: ScheduledActionHistory[];
	totalCount: number;
	hasMore: boolean;
}
import { z } from "zod";
export declare const AddExpenseActionSchema: z.ZodObject<
	{
		amount: z.ZodNumber;
		description: z.ZodString;
		currency: z.ZodString;
		paidByUserId: z.ZodString;
		splitPctShares: z.ZodRecord<z.ZodString, z.ZodNumber>;
	},
	z.core.$strip
>;
export declare const AddBudgetActionSchema: z.ZodObject<
	{
		amount: z.ZodNumber;
		description: z.ZodString;
		budgetName: z.ZodString;
		currency: z.ZodString;
		type: z.ZodUnion<readonly [z.ZodLiteral<"Credit">, z.ZodLiteral<"Debit">]>;
	},
	z.core.$strip
>;
export declare const CreateScheduledActionSchema: z.ZodObject<
	{
		actionType: z.ZodUnion<
			readonly [z.ZodLiteral<"add_expense">, z.ZodLiteral<"add_budget">]
		>;
		frequency: z.ZodUnion<
			readonly [
				z.ZodLiteral<"daily">,
				z.ZodLiteral<"weekly">,
				z.ZodLiteral<"monthly">,
			]
		>;
		startDate: z.ZodString;
		actionData: z.ZodUnion<
			readonly [
				z.ZodObject<
					{
						amount: z.ZodNumber;
						description: z.ZodString;
						currency: z.ZodString;
						paidByUserId: z.ZodString;
						splitPctShares: z.ZodRecord<z.ZodString, z.ZodNumber>;
					},
					z.core.$strip
				>,
				z.ZodObject<
					{
						amount: z.ZodNumber;
						description: z.ZodString;
						budgetName: z.ZodString;
						currency: z.ZodString;
						type: z.ZodUnion<
							readonly [z.ZodLiteral<"Credit">, z.ZodLiteral<"Debit">]
						>;
					},
					z.core.$strip
				>,
			]
		>;
	},
	z.core.$strip
>;
export declare const UpdateScheduledActionSchema: z.ZodObject<
	{
		id: z.ZodString;
		isActive: z.ZodOptional<z.ZodBoolean>;
		frequency: z.ZodOptional<
			z.ZodUnion<
				readonly [
					z.ZodLiteral<"daily">,
					z.ZodLiteral<"weekly">,
					z.ZodLiteral<"monthly">,
				]
			>
		>;
		actionData: z.ZodOptional<
			z.ZodUnion<
				readonly [
					z.ZodObject<
						{
							amount: z.ZodNumber;
							description: z.ZodString;
							currency: z.ZodString;
							paidByUserId: z.ZodString;
							splitPctShares: z.ZodRecord<z.ZodString, z.ZodNumber>;
						},
						z.core.$strip
					>,
					z.ZodObject<
						{
							amount: z.ZodNumber;
							description: z.ZodString;
							budgetName: z.ZodString;
							currency: z.ZodString;
							type: z.ZodUnion<
								readonly [z.ZodLiteral<"Credit">, z.ZodLiteral<"Debit">]
							>;
						},
						z.core.$strip
					>,
				]
			>
		>;
		nextExecutionDate: z.ZodOptional<z.ZodString>;
		skipNext: z.ZodOptional<z.ZodBoolean>;
	},
	z.core.$strip
>;
export declare const ScheduledActionListQuerySchema: z.ZodObject<
	{
		offset: z.ZodPipe<
			z.ZodCatch<z.ZodCoercedNumber<unknown>>,
			z.ZodTransform<number, number>
		>;
		limit: z.ZodPipe<
			z.ZodCatch<z.ZodCoercedNumber<unknown>>,
			z.ZodTransform<number, number>
		>;
	},
	z.core.$strip
>;
export declare const ScheduledActionHistoryQuerySchema: z.ZodObject<
	{
		offset: z.ZodPipe<
			z.ZodCatch<z.ZodCoercedNumber<unknown>>,
			z.ZodTransform<number, number>
		>;
		limit: z.ZodPipe<
			z.ZodCatch<z.ZodCoercedNumber<unknown>>,
			z.ZodTransform<number, number>
		>;
		scheduledActionId: z.ZodString;
		executionStatus: z.ZodOptional<
			z.ZodUnion<
				readonly [
					z.ZodLiteral<"success">,
					z.ZodLiteral<"failed">,
					z.ZodLiteral<"started">,
				]
			>
		>;
	},
	z.core.$strip
>;
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
