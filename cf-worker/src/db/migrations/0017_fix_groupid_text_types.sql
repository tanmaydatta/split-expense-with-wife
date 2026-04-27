-- Fix groupid / group_id column types from INTEGER to TEXT.
--
-- Migration 0000 created `groups.groupid`, `user.groupid`,
-- `transaction_users.group_id`, and `user_balances.group_id` as INTEGER, but
-- the application stores ULID strings in these columns. A previous attempt to
-- fix this (the now-deleted `0006_useful_aaron_stack.sql`) was reverted because
-- the deployed databases were already created with TEXT columns directly via
-- SQL, so production worked. Fresh databases (local dev / CI) however go
-- through the migrations and end up with INTEGER columns; recent wrangler/D1
-- versions reject TEXT inserts into INTEGER PK columns with SQLITE_MISMATCH,
-- breaking e2e tests.
--
-- This migration recreates each affected table with the correct TEXT type.
-- The pattern (CREATE __new_X → INSERT FROM X → DROP X → RENAME) is idempotent
-- on databases that already have TEXT columns: copying TEXT→TEXT preserves
-- data, the resulting table still has TEXT, no-op effectively.
--
-- ⚠️  KNOWN BUG — DO NOT APPLY ON A DATA-RICH DATABASE.
--
-- The `DROP TABLE user` step below cascades through better-auth's foreign keys
-- (`account.user_id REFERENCES user(id) ON DELETE cascade` and the same on
-- `session.user_id`), wiping every row in `account` and `session`. Users lose
-- their password hashes → login returns 401, every active session is invalidated.
--
-- `PRAGMA defer_foreign_keys=ON` (set below) defers FK constraint *validation*
-- to commit time; it does NOT suppress `ON DELETE CASCADE` triggers. The proper
-- escape hatch — `PRAGMA foreign_keys=OFF` — is not supported on Cloudflare D1.
--
-- ACTION TAKEN ON DEPLOYED ENVIRONMENTS (do NOT re-run this migration there):
--   * dev D1 (`splitexpense-dev`): if not yet applied, mark as applied without
--     running by inserting into `d1_migrations` (see `splitexpense` step below).
--   * prod D1 (`splitexpense`):
--       INSERT INTO d1_migrations (name)
--       VALUES ('0017_fix_groupid_text_types.sql');
--     This was done after a Time Travel restore on 2026-04-27 because applying
--     the migration as-written cascade-deleted all `account` and `session` rows.
--     Prod has been running fine with INTEGER columns + ULID-string data
--     (SQLite type affinity makes that work), so leaving the schema as-is is
--     safe.
--
-- WHY THIS FILE STILL EXISTS:
--   Fresh local/CI databases still need the schema to match the Drizzle
--   declarations (TEXT). Those DBs are created with no `account`/`session` rows
--   yet, so the cascade is harmless on first apply. The Drizzle schema is the
--   source of truth; this migration is the only path that reconciles a fresh
--   migration-built DB with that schema.
--
-- TODO (cleanup, separate PR): replace this migration with a sequence that
-- preserves child rows — e.g. CREATE TABLE __preserve_account AS SELECT *
-- FROM account; (same for session;) DROP+RENAME the parent; INSERT INTO
-- account SELECT * FROM __preserve_account; DROP __preserve_account. Test on
-- a populated dev DB before re-enabling for any deployed environment.

PRAGMA defer_foreign_keys=ON;--> statement-breakpoint

-- =====================================================================
-- user (groupid: integer → text)
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
	`first_name` text NOT NULL,
	`last_name` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "username", "display_username", "groupid", "first_name", "last_name") SELECT "id", "name", "email", "email_verified", "image", "created_at", "updated_at", "username", "display_username", "groupid", "first_name", "last_name" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint

-- =====================================================================
-- groups (groupid: integer PRIMARY KEY AUTOINCREMENT → text PRIMARY KEY)
-- =====================================================================
CREATE TABLE `__new_groups` (
	`groupid` text PRIMARY KEY NOT NULL,
	`group_name` text(50) NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`userids` text(1000),
	`metadata` text(2000)
);--> statement-breakpoint
INSERT INTO `__new_groups`("groupid", "group_name", "created_at", "userids", "metadata") SELECT "groupid", "group_name", "created_at", "userids", "metadata" FROM `groups`;--> statement-breakpoint
DROP TABLE `groups`;--> statement-breakpoint
ALTER TABLE `__new_groups` RENAME TO `groups`;--> statement-breakpoint

-- =====================================================================
-- transaction_users (group_id: integer → text)
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

-- =====================================================================
-- user_balances (group_id: integer → text)
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
INSERT INTO `__new_user_balances`("group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at") SELECT "group_id", "user_id", "owed_to_user_id", "currency", "balance", "updated_at" FROM `user_balances`;--> statement-breakpoint
DROP TABLE `user_balances`;--> statement-breakpoint
ALTER TABLE `__new_user_balances` RENAME TO `user_balances`;--> statement-breakpoint
CREATE INDEX `user_balances_group_owed_idx` ON `user_balances` (`group_id`,`owed_to_user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `user_balances_group_user_idx` ON `user_balances` (`group_id`,`user_id`,`currency`);--> statement-breakpoint

PRAGMA defer_foreign_keys=OFF;
