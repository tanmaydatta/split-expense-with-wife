import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { isNull } from "drizzle-orm";
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
