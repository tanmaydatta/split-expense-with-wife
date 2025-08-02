DROP TABLE `sessions_old`;--> statement-breakpoint
DROP TABLE `users_old`;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_transaction_users` (
	`transaction_id` text(100) NOT NULL,
	`user_id` text NOT NULL,
	`amount` real NOT NULL,
	`owed_to_user_id` text NOT NULL,
	`group_id` integer NOT NULL,
	`currency` text(10) NOT NULL,
	`deleted` text,
	PRIMARY KEY(`transaction_id`, `user_id`, `owed_to_user_id`)
);--> statement-breakpoint
INSERT INTO `__new_transaction_users`("transaction_id", "user_id", "amount", "owed_to_user_id", "group_id", "currency", "deleted") SELECT "transaction_id", "user_id", "amount", "owed_to_user_id", "group_id", "currency", "deleted" FROM `transaction_users`;--> statement-breakpoint
DROP TABLE `transaction_users`;--> statement-breakpoint
ALTER TABLE `__new_transaction_users` RENAME TO `transaction_users`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_transaction_group_idx` ON `transaction_users` (`transaction_id`,`group_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_transaction_idx` ON `transaction_users` (`transaction_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_owed_idx` ON `transaction_users` (`group_id`,`owed_to_user_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_user_idx` ON `transaction_users` (`group_id`,`user_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_balances_idx` ON `transaction_users` (`group_id`,`deleted`,`user_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_id_deleted_idx` ON `transaction_users` (`group_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_user_id_idx` ON `transaction_users` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_owed_to_user_id_idx` ON `transaction_users` (`owed_to_user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_users_group_id_idx` ON `transaction_users` (`group_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_user_balances` (
	`group_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`owed_to_user_id` text NOT NULL,
	`currency` text(10) NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`, `owed_to_user_id`, `currency`)
);--> statement-breakpoint
INSERT INTO `__new_user_balances`("group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at") SELECT "group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at" FROM `user_balances`;--> statement-breakpoint
DROP TABLE `user_balances`;--> statement-breakpoint
ALTER TABLE `__new_user_balances` RENAME TO `user_balances`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_balances_group_owed_idx` ON `user_balances` (`group_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_balances_group_user_idx` ON `user_balances` (`group_id`,`user_id`,`currency`);
ALTER TABLE `user` ADD `groupid` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `first_name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `last_name` text NOT NULL;