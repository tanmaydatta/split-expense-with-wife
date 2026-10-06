# Bank imports and Lunch Flow

Imported activity belongs to the connecting user and stays separate from shared
expenses, budget entries and balances. Reviewing a posted charge lets you match
a shared expense or explicitly confirm a new one. Provider sync never changes
an already confirmed shared expense. Reviewed imports changed or removed by a
provider stay visible with a warning.

## Lunch Flow Personal API setup

1. Create your own Lunch Flow account and connect a bank on its Connections page.
   For a UK bank choose **UK Banks**, then authenticate directly with your bank.
2. Add an API destination under Destinations and copy its generated key. Enable
   the desired accounts in that destination's **Account Access** settings.
3. In this app connect Lunch Flow and submit your key to the authenticated backend.
   This is a personal destination containing one or several banks. Each owner
   supplies their own key; the app does not use a global account or Platform OAuth.
4. Preview each account's raw feed. Identify a known purchase and choose whether
   it appears negative or positive, then select the account. Positive normalized
   inbox amounts mean spending; negative amounts mean money received. Verify a
   deposit as well before creating a shared expense.

Lunch Flow preserves bank signs and has its own **Reverse Amounts** account
setting. If that setting changes, verify and update your mapping here. Revised
reviewed rows are flagged; their linked shared expense is preserved.

## Fetching and availability

The adapter reads Lunch Flow's cached Personal API data using `x-api-key` at
`https://lunchflow.app/api/v1`. It uses the documented `include_pending`, `from`,
and `to` parameters. There are no documented page/cursor parameters; the adapter
checks `total` equals the returned length and rejects incomplete snapshots.
Fetches cover the last 90 days, including pending rows. At most 25 selected
accounts and 10,000 transaction changes are processed in a sync. Historical
imports outside the fetched window are retained and are never inferred removed.

A complete account/window snapshot can mark previously imported missing rows
removed. Pending rows cannot be reviewed; a posted replacement becomes eligible
after sync. Unavailable accounts retain private history and selection but cannot
be newly selected until active. Repeated sync is idempotent; HTTP requests have
15-second timeouts and at most three attempts for transient errors. Invalid keys
require attention, and errors are returned as safe categories.

Fetching destination data does **not** force an upstream bank refresh. UK data
typically updates daily; Lunch Flow's GoCardless manual refresh limit is four per
day. Renew expired bank access on Lunch Flow (UK connections typically expire
after 90 days), then sync here. Replace an API key here if it was rotated.

Disconnect removes this app's encrypted key and private imported activity.
Confirmed shared expenses remain. Personal API has no remote revocation endpoint:
revoke the destination key or bank connection in the Lunch Flow dashboard when
you also want to remove upstream access.

## Local live verification gate

The current implementation is tested with mocked official-contract fixtures.
**Lunch Flow live validation is pending until the owner creates an account,
connects a bank, and provides a new Personal API key. Do not call this ready for
release until that gate passes.** Save that new key as `LUNCH_FLOW_API_KEY` in the
ignored `cf-worker/.dev.vars` of the banking worktree, then run
`node scripts/lunch-flow-smoke.mjs`. This read-only script prints counts and signs
only, not credentials, IDs, names, balances or transaction amounts. The local
variable is used only by that verification script; application keys are entered
per owner through authenticated setup. Confirm a known purchase and deposit in
the private preview and validate selected mapping before shared-expense creation.

Set `LUNCH_FLOW_ENABLED=true` locally and a new random
`BANK_TOKEN_ENCRYPTION_KEY` of at least 32 characters to exercise local setup.
Production flags remain unset/off until the live gate and separate release
approval. Keep the existing Plaid encryption key for legacy and new Plaid
credentials; do not replace it with the bank key.

## Manual migration, deployment and rollback

Apply 0028 then 0029 manually to splitexpense-dev **before** pushing the API/UI
stack, because PR pushes auto-deploy staging. Compare a D1 backup's connection,
import and confirmed-link counts before/after. `node scripts/verify-bank-migrations.mjs`
checks the migration's old-Worker compatibility using an in-memory fixture.
Production is `budget.wastd.dev`; its migrations, flags and deployment require a
separate concrete release approval after live validation. Nothing here applies
a remote migration or deployment.

Both migrations expand the schema and retain `plaid_item_id`. New Plaid
connections dual-write the neutral identifier and use the old ciphertext format.
Lunch Flow puts a namespaced destination identifier in the legacy required column
for compatibility; it is not a Plaid item. LF transaction identity includes both
account and provider transaction ID. Existing Plaid row IDs and expense links
remain unchanged. Rollback the Worker while retaining these added columns and
private data; do not drop tables or roll back data. The previous Worker keeps
working with Plaid when its Sandbox flag is enabled. Disable LF/background flags
first to stop LF fetching without touching confirmed expenses.

## Official references (verified 2026-10-06)

- [API destination and account access](https://www.lunchflow.app/docs/guides/destinations/api)
- [Personal API overview](https://www.lunchflow.app/docs/api/personal-api-overview)
- [Account response](https://www.lunchflow.app/docs/api/personal-api/listAccounts)
- [Transaction response and date filters](https://www.lunchflow.app/docs/api/personal-api/getAccountTransactions)
- [Amount signs and Reverse Amounts](https://www.lunchflow.app/docs/guides/configuration/transaction-amounts)
- [UK connection, expiry and refresh limits](https://www.lunchflow.app/docs/guides/connections/regions/uk-eu)
