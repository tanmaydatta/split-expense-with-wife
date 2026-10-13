import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { isNull, sql } from "drizzle-orm";
import type {
	ScheduledActionData,
	ScheduledActionResultData,
	TransactionMetadata,
} from "../../../../shared-types";
import { account, session, user, verification } from "./auth-schema";

export const groups = sqliteTable("groups", {
	groupid: text("groupid").primaryKey(),
	groupName: text("group_name", { length: 50 }).notNull(),
	createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
	userids: text("userids", { length: 1000 }),
	metadata: text("metadata", { length: 2000 }),
});

export const groupBudgets = sqliteTable(
	"group_budgets",
	{
		id: text("id").primaryKey(),
		groupId: text("group_id")
			.notNull()
			.references(() => groups.groupid),
		budgetName: text("budget_name").notNull(),
		description: text("description"),
		createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
		updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
		deleted: text("deleted"),
	},
	(table) => [
		index("group_budgets_group_id_idx").on(table.groupId),
		index("group_budgets_group_name_active_idx")
			.on(table.groupId, table.budgetName)
			.where(isNull(table.deleted)),
		// Performance index for session enrichment queries
		index("group_budgets_group_id_deleted_idx").on(
			table.groupId,
			table.deleted,
		),
	],
);

export const transactions = sqliteTable(
	"transactions",
	{
		transactionId: text("transaction_id", { length: 100 }).primaryKey(),
		description: text("description", { length: 255 }).notNull(),
		amount: real("amount").notNull(),
		createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
		metadata: text("metadata", { mode: "json" }).$type<TransactionMetadata>(),
		currency: text("currency", { length: 10 }).notNull(),
		groupId: text("group_id").notNull(),
		deleted: text("deleted"),
	},
	(table) => [
		index("transactions_group_id_deleted_created_at_idx").on(
			table.groupId,
			table.deleted,
			table.createdAt,
		),
		index("transactions_created_at_idx").on(table.createdAt),
		index("transactions_group_id_idx").on(table.groupId),
	],
);

export const transactionUsers = sqliteTable(
	"transaction_users",
	{
		transactionId: text("transaction_id", { length: 100 }).notNull(),
		userId: text("user_id").notNull(),
		amount: real("amount").notNull(),
		owedToUserId: text("owed_to_user_id").notNull(),
		groupId: text("group_id").notNull(),
		currency: text("currency", { length: 10 }).notNull(),
		deleted: text("deleted"),
	},
	(table) => [
		primaryKey({
			columns: [table.transactionId, table.userId, table.owedToUserId],
		}),
		index("transaction_users_transaction_group_idx").on(
			table.transactionId,
			table.groupId,
			table.deleted,
		),
		index("transaction_users_transaction_idx").on(
			table.transactionId,
			table.deleted,
		),
		index("transaction_users_group_owed_idx").on(
			table.groupId,
			table.owedToUserId,
			table.deleted,
		),
		index("transaction_users_group_user_idx").on(
			table.groupId,
			table.userId,
			table.deleted,
		),
		index("transaction_users_balances_idx").on(
			table.groupId,
			table.deleted,
			table.userId,
			table.owedToUserId,
			table.currency,
		),
		index("transaction_users_group_id_deleted_idx").on(
			table.groupId,
			table.deleted,
		),
		index("transaction_users_user_id_idx").on(table.userId),
		index("transaction_users_owed_to_user_id_idx").on(table.owedToUserId),
		index("transaction_users_group_id_idx").on(table.groupId),
	],
);

export const budgetEntries = sqliteTable(
	"budget_entries",
	{
		budgetEntryId: text("budget_entry_id", { length: 100 }).primaryKey(), // For deterministic creation in scheduled actions
		description: text("description", { length: 100 }).notNull(),
		addedTime: text("added_time").notNull().default("CURRENT_TIMESTAMP"),
		price: text("price", { length: 100 }),
		amount: real("amount").notNull(),
		budgetId: text("budget_id")
			.notNull()
			.references(() => groupBudgets.id),
		deleted: text("deleted"),
		currency: text("currency", { length: 10 }).notNull().default("GBP"),
	},
	(table) => [
		index("budget_entries_monthly_query_idx").on(
			table.budgetId,
			table.deleted,
			table.addedTime,
		),
		index("budget_entries_budget_id_deleted_added_time_amount_idx").on(
			table.budgetId,
			table.deleted,
			table.addedTime,
			table.amount,
		),
		index("budget_entries_budget_id_deleted_idx").on(
			table.budgetId,
			table.deleted,
		),
		index("budget_entries_budget_id_idx").on(table.budgetId),
		index("budget_entries_amount_idx").on(table.amount),
		index("budget_entries_budget_id_added_time_idx").on(
			table.budgetId,
			table.addedTime,
		),
		index("budget_entries_added_time_idx").on(table.addedTime),
		// Performance index for monthly aggregation queries
		index("budget_entries_monthly_aggregation_idx").on(
			table.budgetId,
			table.deleted,
			table.addedTime,
			table.amount,
			table.currency,
		),
	],
);

export const userBalances = sqliteTable(
	"user_balances",
	{
		groupId: text("group_id").notNull(),
		userId: text("user_id").notNull(),
		owedToUserId: text("owed_to_user_id").notNull(),
		currency: text("currency", { length: 10 }).notNull(),
		balance: real("balance").notNull().default(0),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [
				table.groupId,
				table.userId,
				table.owedToUserId,
				table.currency,
			],
		}),
		index("user_balances_group_owed_idx").on(
			table.groupId,
			table.owedToUserId,
			table.currency,
		),
		index("user_balances_group_user_idx").on(
			table.groupId,
			table.userId,
			table.currency,
		),
	],
);

export const budgetTotals = sqliteTable(
	"budget_totals",
	{
		budgetId: text("budget_id")
			.notNull()
			.references(() => groupBudgets.id),
		currency: text("currency", { length: 10 }).notNull(),
		totalAmount: real("total_amount").notNull().default(0),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.budgetId, table.currency] }),
		index("budget_totals_budget_id_idx").on(table.budgetId),
	],
);

export const scheduledActions = sqliteTable(
	"scheduled_actions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		actionType: text("action_type", {
			enum: ["add_expense", "add_budget"],
		}).notNull(),
		frequency: text("frequency", {
			enum: ["daily", "weekly", "monthly"],
		}).notNull(),
		startDate: text("start_date").notNull(), // ISO date string
		isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),

		// Action-specific data (JSON)
		actionData: text("action_data", { mode: "json" })
			.$type<ScheduledActionData>()
			.notNull(),

		// Tracking
		lastExecutedAt: text("last_executed_at"), // ISO datetime string
		nextExecutionDate: text("next_execution_date").notNull(), // ISO date string
	},
	(table) => [
		index("scheduled_actions_user_next_execution_idx").on(
			table.userId,
			table.nextExecutionDate,
		),
		index("scheduled_actions_user_active_idx").on(table.userId, table.isActive),
	],
);

export const scheduledActionHistory = sqliteTable(
	"scheduled_action_history",
	{
		id: text("id").primaryKey(),
		scheduledActionId: text("scheduled_action_id")
			.notNull()
			.references(() => scheduledActions.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		actionType: text("action_type", {
			enum: ["add_expense", "add_budget"],
		}).notNull(),
		executedAt: text("executed_at").notNull(), // ISO datetime string
		executionStatus: text("execution_status", {
			enum: ["started", "success", "failed"],
		}).notNull(),

		// Workflow tracking
		workflowInstanceId: text("workflow_instance_id"), // Instance ID for workflow tracking
		workflowStatus: text("workflow_status", {
			enum: ["running", "complete", "paused", "terminated", "unknown"],
		}), // Cloudflare Workflow status

		// Action data and results
		actionData: text("action_data", { mode: "json" })
			.$type<ScheduledActionData>()
			.notNull(),
		resultData: text("result_data", {
			mode: "json",
		}).$type<ScheduledActionResultData>(), // Results if successful
		errorMessage: text("error_message"), // Error details if failed

		// Performance tracking
		executionDurationMs: integer("execution_duration_ms"), // Execution time
	},
	(table) => [
		index("scheduled_action_history_user_executed_idx").on(
			table.userId,
			table.executedAt,
		),
		index("scheduled_action_history_scheduled_action_idx").on(
			table.scheduledActionId,
			table.executedAt,
		),
		index("scheduled_action_history_status_idx").on(table.executionStatus),
		index("scheduled_action_history_workflow_instance_idx").on(
			table.workflowInstanceId,
		),
		// Unique constraint for action + date to prevent duplicate executions
		index("scheduled_action_history_action_date_unique_idx").on(
			table.scheduledActionId,
			table.executedAt,
		),
	],
);

export const expenseBudgetLinks = sqliteTable(
	"expense_budget_links",
	{
		id: text("id").primaryKey(),
		transactionId: text("transaction_id", { length: 100 })
			.notNull()
			.references(() => transactions.transactionId, { onDelete: "no action" }),
		budgetEntryId: text("budget_entry_id", { length: 100 })
			.notNull()
			.references(() => budgetEntries.budgetEntryId, { onDelete: "no action" }),
		groupId: text("group_id").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("expense_budget_links_pair_idx").on(
			table.transactionId,
			table.budgetEntryId,
		),
		index("expense_budget_links_transaction_idx").on(table.transactionId),
		index("expense_budget_links_budget_entry_idx").on(table.budgetEntryId),
		index("expense_budget_links_group_idx").on(table.groupId),
	],
);

// Bills are plans. A linked scheduled expense may supply an occurrence's
// transaction; payment remains a separate explicit state transition.
export const bills = sqliteTable(
	"bills",
	{
		id: text("id").primaryKey(),
		groupId: text("group_id").notNull().references(() => groups.groupid),
		title: text("title").notNull(),
		amountMinor: integer("amount_minor").notNull(),
		currency: text("currency").notNull(),
		firstDueDate: text("first_due_date").notNull(),
		recurrence: text("recurrence", { enum: ["once", "daily", "weekly", "monthly"] }).notNull(),
		payerUserId: text("payer_user_id").notNull().references(() => user.id),
		splitBasisPoints: text("split_basis_points", { mode: "json" }).$type<Record<string, number>>().notNull(),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		scheduledActionId: text("scheduled_action_id").references(() => scheduledActions.id, { onDelete: "set null" }),
		scheduledBudgetActionId: text("scheduled_budget_action_id").references(() => scheduledActions.id, { onDelete: "set null" }),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		index("bills_group_active_idx").on(table.groupId, table.isActive),
		uniqueIndex("bills_scheduled_action_unique_idx").on(table.scheduledActionId),
		uniqueIndex("bills_scheduled_budget_action_unique_idx").on(table.scheduledBudgetActionId),
	],
);

export const billOccurrences = sqliteTable(
	"bill_occurrences",
	{
		id: text("id").primaryKey(),
		billId: text("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
		groupId: text("group_id").notNull().references(() => groups.groupid),
		title: text("title").notNull(),
		dueDate: text("due_date").notNull(),
		amountMinor: integer("amount_minor").notNull(),
		currency: text("currency").notNull(),
		payerUserId: text("payer_user_id").notNull().references(() => user.id),
		splitBasisPoints: text("split_basis_points", { mode: "json" }).$type<Record<string, number>>().notNull(),
		paidAt: text("paid_at"),
		linkedTransactionId: text("linked_transaction_id"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("bill_occurrences_bill_date_idx").on(table.billId, table.dueDate),
		index("bill_occurrences_group_date_idx").on(table.groupId, table.dueDate),
		uniqueIndex("bill_occurrences_linked_transaction_unique_idx").on(table.linkedTransactionId),
	],
);

export const billReminders = sqliteTable(
	"bill_reminders",
	{
		id: text("id").primaryKey(),
		occurrenceId: text("occurrence_id").notNull().references(() => billOccurrences.id, { onDelete: "cascade" }),
		userId: text("user_id").notNull().references(() => user.id),
		kind: text("kind", { enum: ["upcoming", "overdue"] }).notNull(),
		createdAt: text("created_at").notNull(),
		readAt: text("read_at"),
	},
	(table) => [
		uniqueIndex("bill_reminders_unique_idx").on(table.occurrenceId, table.userId, table.kind),
		index("bill_reminders_user_read_idx").on(table.userId, table.readAt),
	],
);

// Bank data belongs to the connecting user. Imported rows never participate in balances.
export const bankConnections = sqliteTable("bank_connections", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id),
	groupId: text("group_id").notNull().references(() => groups.groupid),
	provider: text("provider", { enum: ["plaid", "lunch_flow"] }).notNull().default("plaid"),
	plaidItemId: text("plaid_item_id").notNull().unique(), // Retained for old Worker rollback.
	providerConnectionId: text("provider_connection_id"),
	syncLock: text("sync_lock"),
	syncLockExpiresAt: integer("sync_lock_expires_at"),
	lastSyncedAt: text("last_synced_at"),
	lastError: text("last_error"),
	institutionName: text("institution_name").notNull(),
	accessTokenEncrypted: text("access_token_encrypted").notNull(),
	cursor: text("cursor"),
	status: text("status", { enum: ["connected", "needs_attention", "disconnected"] }).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
}, (table) => [index("bank_connections_user_idx").on(table.userId, table.status), uniqueIndex("bank_connections_provider_external_idx").on(table.provider, table.providerConnectionId)]);

export const bankTransactions = sqliteTable("bank_transactions", {
	id: text("id").primaryKey(),
	connectionId: text("connection_id").notNull().references(() => bankConnections.id),
	userId: text("user_id").notNull().references(() => user.id),
	accountId: text("account_id").notNull(),
	providerTransactionId: text("provider_transaction_id").notNull().default(""),
	sourceChanged: integer("source_changed", { mode: "boolean" }).notNull().default(false),
	date: text("date").notNull(),
	name: text("name").notNull(),
	merchantName: text("merchant_name"),
	amountMinor: integer("amount_minor").notNull(),
	currency: text("currency").notNull(),
	pending: integer("pending", { mode: "boolean" }).notNull(),
	pendingTransactionId: text("pending_transaction_id"),
	reviewStatus: text("review_status", { enum: ["unreviewed", "ignored", "matched", "created"] }).notNull().default("unreviewed"),
	removedAt: text("removed_at"),
	linkedTransactionId: text("linked_transaction_id"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
}, (table) => [
	index("bank_transactions_user_date_idx").on(table.userId, table.date),
	uniqueIndex("bank_transactions_linked_expense_idx").on(table.linkedTransactionId).where(sql`${table.linkedTransactionId} IS NOT NULL`),
]);

export const bankAccounts = sqliteTable("bank_accounts", {
	id: text("id").primaryKey(),
	connectionId: text("connection_id").notNull().references(() => bankConnections.id),
	providerAccountId: text("provider_account_id").notNull().default(""),
	status: text("status").notNull().default("ACTIVE"),
	currency: text("currency"),
	institutionName: text("institution_name"),
	name: text("name").notNull(),
	mask: text("mask"),
	type: text("type").notNull(),
	subtype: text("subtype"),
	selected: integer("selected", { mode: "boolean" }).notNull().default(true),
}, (table) => [index("bank_accounts_connection_idx").on(table.connectionId)]);

// Create schema object for Drizzle
export const schema = {
	user,
	groups,
	groupBudgets,
	session,
	account,
	verification,
	transactions,
	transactionUsers,
	budgetEntries,
	userBalances,
	budgetTotals,
	scheduledActions,
	scheduledActionHistory,
	expenseBudgetLinks,
	bills,
	billOccurrences,
	billReminders,
	bankConnections,
	bankTransactions,
	bankAccounts,
};

// Export inferred types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupBudget = typeof groupBudgets.$inferSelect;
export type NewGroupBudget = typeof groupBudgets.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionUser = typeof transactionUsers.$inferSelect;
export type NewTransactionUser = typeof transactionUsers.$inferInsert;
export type BudgetEntry = typeof budgetEntries.$inferSelect;
export type NewBudgetEntry = typeof budgetEntries.$inferInsert;
export type UserBalance = typeof userBalances.$inferSelect;
export type NewUserBalance = typeof userBalances.$inferInsert;
export type BudgetTotal = typeof budgetTotals.$inferSelect;
export type NewBudgetTotal = typeof budgetTotals.$inferInsert;
export type ScheduledAction = typeof scheduledActions.$inferSelect;
export type NewScheduledAction = typeof scheduledActions.$inferInsert;
export type ScheduledActionHistory = typeof scheduledActionHistory.$inferSelect;
export type NewScheduledActionHistory =
	typeof scheduledActionHistory.$inferInsert;
export type ExpenseBudgetLink = typeof expenseBudgetLinks.$inferSelect;
export type NewExpenseBudgetLink = typeof expenseBudgetLinks.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type BillOccurrence = typeof billOccurrences.$inferSelect;
export type BillReminder = typeof billReminders.$inferSelect;
