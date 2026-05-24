-- Repair deployed databases where 0017_fix_groupid_text_types.sql was
-- recorded as applied without rebuilding the affected INTEGER group columns.
--
-- This keeps the 0017 table-rebuild approach, but preserves Better Auth child
-- rows before dropping `user`. Dropping `user` fires ON DELETE CASCADE for
-- `account` and `session`; restoring those rows keeps password hashes and
-- active sessions intact.

PRAGMA defer_foreign_keys=ON;--> statement-breakpoint

DROP TABLE IF EXISTS `__preserve_account`;--> statement-breakpoint
DROP TABLE IF EXISTS `__preserve_session`;--> statement-breakpoint

CREATE TABLE `__preserve_account` AS SELECT * FROM `account`;--> statement-breakpoint
CREATE TABLE `__preserve_session` AS SELECT * FROM `session`;--> statement-breakpoint

-- =====================================================================
-- user (groupid: integer -> text)
-- =====================================================================
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
	`signup_complete` integer DEFAULT 1 NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "username", "display_username", "groupid", "signup_complete", "first_name", "last_name")
	SELECT "id", "name", "email", "email_verified", "image", "created_at", "updated_at", "username", "display_username", CAST("groupid" AS text), "signup_complete", "first_name", "last_name" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint

INSERT INTO `account` SELECT * FROM `__preserve_account`;--> statement-breakpoint
INSERT INTO `session` SELECT * FROM `__preserve_session`;--> statement-breakpoint

DROP TABLE `__preserve_account`;--> statement-breakpoint
DROP TABLE `__preserve_session`;--> statement-breakpoint

-- =====================================================================
-- groups (groupid: integer primary key autoincrement -> text primary key)
-- =====================================================================
CREATE TABLE `__new_groups` (
	`groupid` text PRIMARY KEY NOT NULL,
	`group_name` text(50) NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`userids` text(1000),
	`metadata` text(2000)
);--> statement-breakpoint
INSERT INTO `__new_groups`("groupid", "group_name", "created_at", "userids", "metadata")
	SELECT CAST("groupid" AS text), "group_name", "created_at", "userids", "metadata" FROM `groups`;--> statement-breakpoint
DROP TABLE `groups`;--> statement-breakpoint
ALTER TABLE `__new_groups` RENAME TO `groups`;--> statement-breakpoint

-- =====================================================================
-- transaction_users (group_id: integer -> text)
-- =====================================================================
CREATE TABLE `__new_transaction_users` (
	`transaction_id` text(100) NOT NULL,
	`user_id` text NOT NULL,
	`amount` real NOT NULL,
	`owed_to_user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`currency` text(10) NOT NULL,
	`deleted` text,
	PRIMARY KEY(`transaction_id`, `user_id`, `owed_to_user_id`)
);--> statement-breakpoint
INSERT INTO `__new_transaction_users`("transaction_id", "user_id", "amount", "owed_to_user_id", "group_id", "currency", "deleted")
	SELECT "transaction_id", "user_id", "amount", "owed_to_user_id", CAST("group_id" AS text), "currency", "deleted" FROM `transaction_users`;--> statement-breakpoint
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

-- =====================================================================
-- user_balances (group_id: integer -> text)
-- =====================================================================
CREATE TABLE `__new_user_balances` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`owed_to_user_id` text NOT NULL,
	`currency` text(10) NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`, `owed_to_user_id`, `currency`)
);--> statement-breakpoint
INSERT INTO `__new_user_balances`("group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at")
	SELECT CAST("group_id" AS text), "user_id", "owed_to_user_id", "currency", "balance", "updated_at" FROM `user_balances`;--> statement-breakpoint
DROP TABLE `user_balances`;--> statement-breakpoint
ALTER TABLE `__new_user_balances` RENAME TO `user_balances`;--> statement-breakpoint
CREATE INDEX `user_balances_group_owed_idx` ON `user_balances` (`group_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `user_balances_group_user_idx` ON `user_balances` (`group_id`,`user_id`,`currency`);--> statement-breakpoint

PRAGMA defer_foreign_keys=OFF;
