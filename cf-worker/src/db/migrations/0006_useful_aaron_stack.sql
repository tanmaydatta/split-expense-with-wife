PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`username` text,
	`display_username` text,
	`groupid` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "username", "display_username", "groupid", "first_name", "last_name") SELECT "id", "name", "email", "email_verified", "image", "created_at", "updated_at", "username", "display_username", "groupid", "first_name", "last_name" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TABLE `__new_budget` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`budget_id` text(100),
	`description` text(100) NOT NULL,
	`added_time` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`price` text(100),
	`amount` real NOT NULL,
	`name` text(100) NOT NULL,
	`deleted` text,
	`groupid` text NOT NULL,
	`currency` text(10) DEFAULT 'GBP' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_budget`("id", "budget_id", "description", "added_time", "price", "amount", "name", "deleted", "groupid", "currency") SELECT "id", "budget_id", "description", "added_time", "price", "amount", "name", "deleted", "groupid", "currency" FROM `budget`;--> statement-breakpoint
DROP TABLE `budget`;--> statement-breakpoint
ALTER TABLE `__new_budget` RENAME TO `budget`;--> statement-breakpoint
CREATE INDEX `budget_monthly_query_idx` ON `budget` (`name`,`groupid`,`deleted`,`added_time`);--> statement-breakpoint
CREATE INDEX `budget_name_groupid_deleted_added_time_amount_idx` ON `budget` (`name`,`groupid`,`deleted`,`added_time`,`amount`);--> statement-breakpoint
CREATE INDEX `budget_name_groupid_deleted_idx` ON `budget` (`name`,`groupid`,`deleted`);--> statement-breakpoint
CREATE INDEX `budget_name_price_idx` ON `budget` (`name`,`price`);--> statement-breakpoint
CREATE INDEX `budget_name_idx` ON `budget` (`name`);--> statement-breakpoint
CREATE INDEX `budget_amount_idx` ON `budget` (`amount`);--> statement-breakpoint
CREATE INDEX `budget_name_added_time_idx` ON `budget` (`name`,`added_time`);--> statement-breakpoint
CREATE INDEX `budget_added_time_idx` ON `budget` (`added_time`);--> statement-breakpoint
CREATE INDEX `budget_budget_id_idx` ON `budget` (`budget_id`);--> statement-breakpoint
CREATE TABLE `__new_budget_totals` (
	`group_id` text NOT NULL,
	`name` text(100) NOT NULL,
	`currency` text(10) NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `name`, `currency`)
);
--> statement-breakpoint
INSERT INTO `__new_budget_totals`("group_id", "name", "currency", "total_amount", "updated_at") SELECT "group_id", "name", "currency", "total_amount", "updated_at" FROM `budget_totals`;--> statement-breakpoint
DROP TABLE `budget_totals`;--> statement-breakpoint
ALTER TABLE `__new_budget_totals` RENAME TO `budget_totals`;--> statement-breakpoint
CREATE INDEX `budget_totals_group_name_idx` ON `budget_totals` (`group_id`,`name`);--> statement-breakpoint
CREATE TABLE `__new_groups` (
	`groupid` text PRIMARY KEY NOT NULL,
	`group_name` text(50) NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`userids` text(1000),
	`budgets` text(1000),
	`metadata` text(2000)
);
--> statement-breakpoint
INSERT INTO `__new_groups`("groupid", "group_name", "created_at", "userids", "budgets", "metadata") SELECT "groupid", "group_name", "created_at", "userids", "budgets", "metadata" FROM `groups`;--> statement-breakpoint
DROP TABLE `groups`;--> statement-breakpoint
ALTER TABLE `__new_groups` RENAME TO `groups`;--> statement-breakpoint
CREATE TABLE `__new_transaction_users` (
	`transaction_id` text(100) NOT NULL,
	`user_id` text NOT NULL,
	`amount` real NOT NULL,
	`owed_to_user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`currency` text(10) NOT NULL,
	`deleted` text,
	PRIMARY KEY(`transaction_id`, `user_id`, `owed_to_user_id`)
);
--> statement-breakpoint
INSERT INTO `__new_transaction_users`("transaction_id", "user_id", "amount", "owed_to_user_id", "group_id", "currency", "deleted") SELECT "transaction_id", "user_id", "amount", "owed_to_user_id", "group_id", "currency", "deleted" FROM `transaction_users`;--> statement-breakpoint
DROP TABLE `transaction_users`;--> statement-breakpoint
ALTER TABLE `__new_transaction_users` RENAME TO `transaction_users`;--> statement-breakpoint
CREATE INDEX `transaction_users_transaction_group_idx` ON `transaction_users` (`transaction_id`,`group_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `transaction_users_transaction_idx` ON `transaction_users` (`transaction_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `transaction_users_group_owed_idx` ON `transaction_users` (`group_id`,`owed_to_user_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `transaction_users_group_user_idx` ON `transaction_users` (`group_id`,`user_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `transaction_users_balances_idx` ON `transaction_users` (`group_id`,`deleted`,`user_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `transaction_users_group_id_deleted_idx` ON `transaction_users` (`group_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `transaction_users_user_id_idx` ON `transaction_users` (`user_id`);--> statement-breakpoint
CREATE INDEX `transaction_users_owed_to_user_id_idx` ON `transaction_users` (`owed_to_user_id`);--> statement-breakpoint
CREATE INDEX `transaction_users_group_id_idx` ON `transaction_users` (`group_id`);--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text(255) NOT NULL,
	`amount` real NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`metadata` text,
	`currency` text(10) NOT NULL,
	`transaction_id` text(100),
	`group_id` text NOT NULL,
	`deleted` text
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "description", "amount", "created_at", "metadata", "currency", "transaction_id", "group_id", "deleted") SELECT "id", "description", "amount", "created_at", "metadata", "currency", "transaction_id", "group_id", "deleted" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE INDEX `transactions_group_id_deleted_created_at_idx` ON `transactions` (`group_id`,`deleted`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_created_at_idx` ON `transactions` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transaction_id_idx` ON `transactions` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transactions_group_id_idx` ON `transactions` (`group_id`);--> statement-breakpoint
CREATE TABLE `__new_user_balances` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`owed_to_user_id` text NOT NULL,
	`currency` text(10) NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`, `owed_to_user_id`, `currency`)
);
--> statement-breakpoint
INSERT INTO `__new_user_balances`("group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at") SELECT "group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at" FROM `user_balances`;--> statement-breakpoint
DROP TABLE `user_balances`;--> statement-breakpoint
ALTER TABLE `__new_user_balances` RENAME TO `user_balances`;--> statement-breakpoint
CREATE INDEX `user_balances_group_owed_idx` ON `user_balances` (`group_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `user_balances_group_user_idx` ON `user_balances` (`group_id`,`user_id`,`currency`);