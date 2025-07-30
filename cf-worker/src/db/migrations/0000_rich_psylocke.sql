CREATE TABLE IF NOT EXISTS `budget` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text(100) NOT NULL,
	`added_time` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`price` text(100),
	`amount` real NOT NULL,
	`name` text(100) NOT NULL,
	`deleted` text,
	`groupid` integer NOT NULL,
	`currency` text(10) DEFAULT 'GBP' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_monthly_query_idx` ON `budget` (`name`,`groupid`,`deleted`,`added_time`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_name_groupid_deleted_added_time_amount_idx` ON `budget` (`name`,`groupid`,`deleted`,`added_time`,`amount`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_name_groupid_deleted_idx` ON `budget` (`name`,`groupid`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_name_price_idx` ON `budget` (`name`,`price`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_name_idx` ON `budget` (`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_amount_idx` ON `budget` (`amount`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_name_added_time_idx` ON `budget` (`name`,`added_time`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_added_time_idx` ON `budget` (`added_time`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `budget_totals` (
	`group_id` integer NOT NULL,
	`name` text(100) NOT NULL,
	`currency` text(10) NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `name`, `currency`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_totals_group_name_idx` ON `budget_totals` (`group_id`,`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `groups` (
	`groupid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_name` text(50) NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`userids` text(1000),
	`budgets` text(1000),
	`metadata` text(2000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`username` text(255) NOT NULL,
	`sessionid` text(255) NOT NULL,
	`expiry_time` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_sessionid_idx` ON `sessions` (`sessionid`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transaction_users` (
	`transaction_id` text(100) NOT NULL,
	`user_id` integer NOT NULL,
	`amount` real NOT NULL,
	`owed_to_user_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`currency` text(10) NOT NULL,
	`deleted` text,
	PRIMARY KEY(`transaction_id`, `user_id`, `owed_to_user_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_transaction_group_idx` ON `transaction_users` (`transaction_id`,`group_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_transaction_idx` ON `transaction_users` (`transaction_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_owed_idx` ON `transaction_users` (`group_id`,`owed_to_user_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_user_idx` ON `transaction_users` (`group_id`,`user_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_balances_idx` ON `transaction_users` (`group_id`,`deleted`,`user_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_id_deleted_idx` ON `transaction_users` (`group_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_user_id_idx` ON `transaction_users` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_owed_to_user_id_idx` ON `transaction_users` (`owed_to_user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_id_idx` ON `transaction_users` (`group_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text(255) NOT NULL,
	`amount` real NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`metadata` text,
	`currency` text(10) NOT NULL,
	`transaction_id` text(100),
	`group_id` integer NOT NULL,
	`deleted` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_group_id_deleted_created_at_idx` ON `transactions` (`group_id`,`deleted`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_created_at_idx` ON `transactions` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `transactions_transaction_id_idx` ON `transactions` (`transaction_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_group_id_idx` ON `transactions` (`group_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_balances` (
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`owed_to_user_id` integer NOT NULL,
	`currency` text(10) NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`, `owed_to_user_id`, `currency`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_balances_group_owed_idx` ON `user_balances` (`group_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_balances_group_user_idx` ON `user_balances` (`group_id`,`user_id`,`currency`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text(50) NOT NULL,
	`password` text(255) NOT NULL,
	`first_name` text(50),
	`last_name` text(50),
	`groupid` integer NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_username_idx` ON `users` (`username`);