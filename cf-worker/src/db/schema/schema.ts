import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { TransactionMetadata } from '../../../../shared-types';
import {user, session, account, verification}  from './auth-schema';

export const groups = sqliteTable('groups', {
  groupid: integer('groupid').primaryKey({ autoIncrement: true }),
  groupName: text('group_name', { length: 50 }).notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  userids: text('userids', { length: 1000 }),
  budgets: text('budgets', { length: 1000 }),
  metadata: text('metadata', { length: 2000 })
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  description: text('description', { length: 255 }).notNull(),
  amount: real('amount').notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  metadata: text('metadata', { mode: 'json' }).$type<TransactionMetadata>(),
  currency: text('currency', { length: 10 }).notNull(),
  transactionId: text('transaction_id', { length: 100 }),
  groupId: integer('group_id').notNull(),
  deleted: text('deleted')
}, (table) => [
  index('transactions_group_id_deleted_created_at_idx').on(table.groupId, table.deleted, table.createdAt),
  index('transactions_created_at_idx').on(table.createdAt),
  uniqueIndex('transactions_transaction_id_idx').on(table.transactionId),
  index('transactions_group_id_idx').on(table.groupId)
]);

export const transactionUsers = sqliteTable('transaction_users', {
  transactionId: text('transaction_id', { length: 100 }).notNull(),
  userId: text('user_id').notNull(),
  amount: real('amount').notNull(),
  owedToUserId: text('owed_to_user_id').notNull(),
  groupId: integer('group_id').notNull(),
  currency: text('currency', { length: 10 }).notNull(),
  deleted: text('deleted')
}, (table) => [
  primaryKey({ columns: [table.transactionId, table.userId, table.owedToUserId] }),
  index('transaction_users_transaction_group_idx').on(table.transactionId, table.groupId, table.deleted),
  index('transaction_users_transaction_idx').on(table.transactionId, table.deleted),
  index('transaction_users_group_owed_idx').on(table.groupId, table.owedToUserId, table.deleted),
  index('transaction_users_group_user_idx').on(table.groupId, table.userId, table.deleted),
  index('transaction_users_balances_idx').on(table.groupId, table.deleted, table.userId, table.owedToUserId, table.currency),
  index('transaction_users_group_id_deleted_idx').on(table.groupId, table.deleted),
  index('transaction_users_user_id_idx').on(table.userId),
  index('transaction_users_owed_to_user_id_idx').on(table.owedToUserId),
  index('transaction_users_group_id_idx').on(table.groupId)
]);

export const budget = sqliteTable('budget', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  description: text('description', { length: 100 }).notNull(),
  addedTime: text('added_time').notNull().default('CURRENT_TIMESTAMP'),
  price: text('price', { length: 100 }),
  amount: real('amount').notNull(),
  name: text('name', { length: 100 }).notNull(),
  deleted: text('deleted'),
  groupid: integer('groupid').notNull(),
  currency: text('currency', { length: 10 }).notNull().default('GBP')
}, (table) => [
  index('budget_monthly_query_idx').on(table.name, table.groupid, table.deleted, table.addedTime),
  index('budget_name_groupid_deleted_added_time_amount_idx').on(table.name, table.groupid, table.deleted, table.addedTime, table.amount),
  index('budget_name_groupid_deleted_idx').on(table.name, table.groupid, table.deleted),
  index('budget_name_price_idx').on(table.name, table.price),
  index('budget_name_idx').on(table.name),
  index('budget_amount_idx').on(table.amount),
  index('budget_name_added_time_idx').on(table.name, table.addedTime),
  index('budget_added_time_idx').on(table.addedTime)
]);

export const userBalances = sqliteTable('user_balances', {
  groupId: integer('group_id').notNull(),
  userId: text('user_id').notNull(),
  owedToUserId: text('owed_to_user_id').notNull(),
  currency: text('currency', { length: 10 }).notNull(),
  balance: real('balance').notNull().default(0),
  updatedAt: text('updated_at').notNull()
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId, table.owedToUserId, table.currency] }),
  index('user_balances_group_owed_idx').on(table.groupId, table.owedToUserId, table.currency),
  index('user_balances_group_user_idx').on(table.groupId, table.userId, table.currency)
]);

export const budgetTotals = sqliteTable('budget_totals', {
  groupId: integer('group_id').notNull(),
  name: text('name', { length: 100 }).notNull(),
  currency: text('currency', { length: 10 }).notNull(),
  totalAmount: real('total_amount').notNull().default(0),
  updatedAt: text('updated_at').notNull()
}, (table) => [
  primaryKey({ columns: [table.groupId, table.name, table.currency] }),
  index('budget_totals_group_name_idx').on(table.groupId, table.name)
]);

// Create schema object for Drizzle
export const schema = {
  user,
  groups,
  session,
  account,
  verification,
  transactions,
  transactionUsers,
  budget,
  userBalances,
  budgetTotals
};

// Export inferred types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionUser = typeof transactionUsers.$inferSelect;
export type NewTransactionUser = typeof transactionUsers.$inferInsert;
export type Budget = typeof budget.$inferSelect;
export type NewBudget = typeof budget.$inferInsert;
export type UserBalance = typeof userBalances.$inferSelect;
export type NewUserBalance = typeof userBalances.$inferInsert;
export type BudgetTotal = typeof budgetTotals.$inferSelect;
export type NewBudgetTotal = typeof budgetTotals.$inferInsert;
