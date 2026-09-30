CREATE TABLE bank_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES bank_connections(id),
  name TEXT NOT NULL,
  mask TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  selected INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX bank_accounts_connection_idx ON bank_accounts(connection_id);
ALTER TABLE bank_transactions ADD COLUMN pending_transaction_id TEXT;
