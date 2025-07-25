import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username', { length: 50 }).notNull(),
  password: text('password', { length: 255 }).notNull(),
  firstName: text('first_name', { length: 50 }),
  lastName: text('last_name', { length: 50 }),
  groupid: integer('groupid').notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP')
});

export const groups = sqliteTable('groups', {
  groupid: integer('groupid').primaryKey({ autoIncrement: true }),
  groupName: text('group_name', { length: 50 }).notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  userids: text('userids', { length: 1000 }),
  budgets: text('budgets', { length: 1000 }),
  metadata: text('metadata', { length: 2000 })
});

export const sessions = sqliteTable('sessions', {
  username: text('username', { length: 255 }).notNull(),
  sessionid: text('sessionid', { length: 255 }).notNull(),
  expiryTime: text('expiry_time').notNull()
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  description: text('description', { length: 255 }).notNull(),
  amount: real('amount').notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  metadata: text('metadata', { length: 2000 }),
  currency: text('currency', { length: 10 }).notNull(),
  transactionId: text('transaction_id', { length: 100 }),
  groupId: integer('group_id').notNull(),
  deleted: text('deleted')
});

export const transactionUsers = sqliteTable('transaction_users', {
  transactionId: text('transaction_id', { length: 100 }).notNull(),
  userId: integer('user_id').notNull(),
  amount: real('amount').notNull(),
  owedToUserId: integer('owed_to_user_id').notNull(),
  groupId: integer('group_id').notNull(),
  currency: text('currency', { length: 10 }).notNull(),
  deleted: text('deleted')
}, (table) => ({
  pk: primaryKey({ columns: [table.transactionId, table.userId, table.owedToUserId] })
}));

export const budget = sqliteTable('budget', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  description: text('description', { length: 100 }).notNull(),
  addedTime: text('added_time').notNull().default('CURRENT_TIMESTAMP'),
  price: text('price', { length: 100 }),
  amount: real('amount').notNull(),
  name: text('name', { length: 100 }).notNull(),
  deleted: text('deleted'),
  groupid: integer('groupid').notNull(),
  currency: text('currency', { length: 10 }).notNull()
});

export const userBalances = sqliteTable('user_balances', {
  groupId: integer('group_id').notNull(),
  userId: integer('user_id').notNull(),
  owedToUserId: integer('owed_to_user_id').notNull(),
  currency: text('currency', { length: 10 }).notNull(),
  balance: real('balance').notNull().default(0),
  updatedAt: text('updated_at').notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.userId, table.owedToUserId, table.currency] })
}));

export const budgetTotals = sqliteTable('budget_totals', {
  groupId: integer('group_id').notNull(),
  name: text('name', { length: 100 }).notNull(),
  currency: text('currency', { length: 10 }).notNull(),
  totalAmount: real('total_amount').notNull().default(0),
  updatedAt: text('updated_at').notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.name, table.currency] })
}));

// Create schema object for Drizzle
export const schema = {
  users,
  groups,
  sessions,
  transactions,
  transactionUsers,
  budget,
  userBalances,
  budgetTotals
};

// Export inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
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
