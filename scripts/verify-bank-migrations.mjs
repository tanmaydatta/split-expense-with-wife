import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE user (id TEXT PRIMARY KEY); CREATE TABLE groups (groupid TEXT PRIMARY KEY); INSERT INTO user VALUES ('owner'); INSERT INTO groups VALUES ('group');");
const migration = name => readFileSync(new URL(`../cf-worker/src/db/migrations/${name}`, import.meta.url), "utf8");
for (const name of ["0025_plaid_sandbox.sql", "0026_bank_accounts.sql", "0027_bank_review.sql"]) db.exec(migration(name));
db.exec("INSERT INTO bank_connections VALUES ('bank_old', 'owner', 'group', 'item_old', 'Old bank', 'legacy-ciphertext', 'cursor-old', 'connected', 'today', 'today'); INSERT INTO bank_accounts VALUES ('bank_old:account', 'bank_old', 'Account', NULL, 'bank', NULL, 1); INSERT INTO bank_transactions (id, connection_id, user_id, account_id, date, name, amount_minor, currency, pending, linked_transaction_id, review_status, created_at, updated_at) VALUES ('bank_old:transaction', 'bank_old', 'owner', 'bank_old:account', '2026-10-01', 'Purchase', 1234, 'GBP', 0, 'shared-expense', 'matched', 'today', 'today');");
db.exec(migration("0028_bank_providers.sql")); db.exec(migration("0029_lunch_flow.sql")); db.exec(migration("0030_bank_review_links_pending.sql"));
assert.equal(db.prepare("SELECT plaid_item_id FROM bank_connections").get().plaid_item_id, "item_old");
assert.equal(db.prepare("SELECT provider_connection_id FROM bank_connections").get().provider_connection_id, "item_old");
assert.equal(db.prepare("SELECT provider_account_id FROM bank_accounts").get().provider_account_id, "account");
assert.deepEqual({ ...db.prepare("SELECT linked_transaction_id, review_status FROM bank_transactions").get() }, { linked_transaction_id: "shared-expense", review_status: "matched" });
// Simulate a still-deployed old Worker creating a connection after manual expansion.
db.exec("INSERT INTO bank_connections (id,user_id,group_id,plaid_item_id,institution_name,access_token_encrypted,status,created_at,updated_at) VALUES ('bank_after','owner','group','item_after','After','legacy','connected','today','today');");
assert.equal(db.prepare("SELECT provider FROM bank_connections WHERE id='bank_after'").get().provider, "plaid");
assert.equal(db.prepare("SELECT count(*) AS count FROM bank_transactions").get().count, 1);
// A pre-0030 Worker can still write named old columns after expansion.
db.exec("INSERT INTO bank_accounts (id,connection_id,name,type,selected) VALUES ('bank_after:a','bank_after','Account','bank',1); INSERT INTO bank_transactions(id,connection_id,user_id,account_id,date,name,amount_minor,currency,pending,created_at,updated_at) VALUES ('bank_after:t','bank_after','owner','bank_after:a','2026-10-01','Old Worker write',500,'GBP',0,'today','today');");
assert.equal(db.prepare("SELECT linked_budget_entry_id FROM bank_transactions WHERE id='bank_after:t'").get().linked_budget_entry_id,null);
assert.equal(db.prepare("SELECT linked_transaction_id FROM bank_transactions WHERE id='bank_old:transaction'").get().linked_transaction_id,'shared-expense');
db.exec("INSERT INTO bank_pending_snapshots(id,snapshot_id,connection_id,account_id,user_id,date,name,amount_minor,currency,created_at) VALUES ('pending','generation','bank_after','bank_after:a','owner','2026-10-01','Pending',500,'GBP','today'); DELETE FROM bank_accounts WHERE id='bank_after:a';");
assert.equal(db.prepare("SELECT count(*) AS count FROM bank_pending_snapshots").get().count,0);
console.log("Bank migrations 0028–0030 preserve old Worker writes and confirmed links; private pending rows cascade with accounts.");
