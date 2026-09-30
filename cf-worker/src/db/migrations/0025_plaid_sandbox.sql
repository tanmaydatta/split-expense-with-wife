CREATE TABLE bank_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id),
  group_id TEXT NOT NULL REFERENCES groups(groupid),
  plaid_item_id TEXT NOT NULL UNIQUE,
  institution_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  cursor TEXT,
  status TEXT NOT NULL CHECK (status IN ('connected', 'needs_attention', 'disconnected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX bank_connections_user_idx ON bank_connections(user_id, status);

CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES bank_connections(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  pending INTEGER NOT NULL,
  removed_at TEXT,
  linked_transaction_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX bank_transactions_user_date_idx ON bank_transactions(user_id, date);
