-- Additive: old Workers ignore these columns and anonymous pending snapshots.
ALTER TABLE bank_transactions ADD COLUMN linked_budget_entry_id TEXT;
CREATE UNIQUE INDEX bank_transactions_linked_budget_idx ON bank_transactions(linked_budget_entry_id) WHERE linked_budget_entry_id IS NOT NULL;
ALTER TABLE bank_accounts ADD COLUMN pending_snapshot_id TEXT;
CREATE TABLE bank_pending_snapshots (
 id TEXT PRIMARY KEY NOT NULL, snapshot_id TEXT NOT NULL,
 connection_id TEXT NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES user(id),
 date TEXT NOT NULL, name TEXT NOT NULL, merchant_name TEXT,
 amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX bank_pending_account_snapshot_idx ON bank_pending_snapshots(account_id, snapshot_id);

CREATE TABLE bank_review_drafts (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES user(id),
 connection_id TEXT NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
 bank_row_id TEXT NOT NULL, source_version INTEGER NOT NULL,
 date TEXT NOT NULL, name TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL,
 transaction_id TEXT, budget_entry_id TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','confirmed')),
 version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id, bank_row_id)
);
CREATE INDEX bank_review_drafts_owner_idx ON bank_review_drafts(user_id,status);
