-- Additive migration: preserve existing IDs, review states and expense links.
ALTER TABLE bank_connections ADD COLUMN provider_connection_id TEXT;
UPDATE bank_connections SET provider_connection_id = plaid_item_id;
ALTER TABLE bank_connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'plaid' CHECK (provider IN ('plaid', 'lunch_flow'));
ALTER TABLE bank_connections ADD COLUMN sync_lock TEXT;
ALTER TABLE bank_connections ADD COLUMN sync_lock_expires_at INTEGER;
ALTER TABLE bank_connections ADD COLUMN last_synced_at TEXT;
ALTER TABLE bank_connections ADD COLUMN last_error TEXT;
-- Legacy unique constraint remains: Lunch Flow destination IDs are namespaced.
CREATE UNIQUE INDEX bank_connections_provider_external_idx ON bank_connections(provider, provider_connection_id);
ALTER TABLE bank_accounts ADD COLUMN provider_account_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bank_accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE bank_accounts ADD COLUMN currency TEXT;
ALTER TABLE bank_accounts ADD COLUMN institution_name TEXT;
UPDATE bank_accounts SET provider_account_id = substr(id, length(connection_id) + 2);
ALTER TABLE bank_transactions ADD COLUMN provider_transaction_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bank_transactions ADD COLUMN source_changed INTEGER NOT NULL DEFAULT 0;
UPDATE bank_transactions SET provider_transaction_id = substr(id, length(connection_id) + 2);
