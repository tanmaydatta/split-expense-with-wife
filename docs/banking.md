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
Fetches cover the last 90 days, including pending rows. Account currency may be
absent; each transaction must
supply its own valid currency. Pending rows without a stable provider ID are
validated and kept outside identified financial imports. Manual sync displays them
as private read-only snapshot items that can hold provisional choices; raw sign
preview still omits them and reports the count. Posted rows
without IDs, malformed rows and incomplete snapshots still reject the entire sync.
At most 25 selected accounts and 10,000 transaction changes are processed in a sync. Historical
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

## Private inbox and daily syncing

The page combines enabled providers and lets the owner filter by provider,
destination and account. Account labels show the institution when supplied.
A Lunch Flow destination may span several banks; it is one owner's API key.
Accounts start unselected. Preview and calibrate a known purchase before selecting
an ACTIVE account. Key replacement marks absent accounts unavailable and preserves
reviewed history. Pending rows cannot create shared expenses. Reviewed source
changes and removals remain visible with warnings; linked expenses stay unchanged.

Manual fetching and optional daily jobs share a connection lease. Review confirms
a numeric source version and creates its linked expense in one atomic database
batch, so stale confirmations or failed ledger writes leave no partial claim.
Daily sync is disabled by default. With the flag and workflow binding enabled,
the existing UTC cron queues at most 50 destinations, rotating by last attempt;
a failed destination does not block other owners. Jobs fetch cached API data and
never request Lunch Flow's rate-limited upstream bank refresh. See the
[release prerequisites](deployment.md#bank-provider-release-and-rollback).

## Local live verification gate

The implementation has passed a read-only live Personal API contract check,
including absent account currency and a pending transaction without an ID.
Synthetic provider tests cover encrypted setup, privacy, explicit sign mapping
and idempotency. The owner still needs to confirm a known posted purchase and
money received (including a credit-card payment or refund) in the private preview
before selecting a sign mapping or creating shared expenses. Save a new key as
`LUNCH_FLOW_API_KEY` in the
ignored `cf-worker/.dev.vars` of the banking worktree, then run
`node scripts/lunch-flow-smoke.mjs`. This read-only script prints counts and signs
only, not credentials, IDs, names, balances or transaction amounts. The local
variable is used only by that verification script; application keys are entered
per owner through authenticated setup. Confirm a known purchase and money received (card payment or refund) in
the private preview and validate selected mapping before shared-expense creation.

Set `LUNCH_FLOW_ENABLED=true` locally and a new random
`BANK_TOKEN_ENCRYPTION_KEY` of at least 32 characters to exercise local setup.
The approved initial production release enables Lunch Flow manual sync in
`env.prod.vars` and explicitly disables background sync. These flags are stored
in versioned configuration so a later deployment preserves the intended state.
The production bank encryption secret and additive migrations must exist before
that release deploys. Keep the existing Plaid encryption key for legacy and new Plaid
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

## Bank review and provisional selections

The compact private inbox supports text search and All, Pending, Posted (to review),
and Reviewed filters with server-side paging. Connections, sign calibration and
manual cached sync live in a separate settings panel. Open activity for its full
source details and clickable confirmed expense/budget associations.

Match an existing expense, a budget entry independently, or both. Search results use
the same expense and budget cards as the mobile lists, with keyboard-accessible
radio selection. Expense balances reflect the current user and budget choices
show their budget name. Selection does not navigate, delete or load expanded
details. Candidate metadata and participant rows are read in bounded current-group
pages, without a request for every card.

A confirmed row can gain its missing association; existing confirmed associations cannot be
replaced. Currency and minor-unit amount must match. Positive normalized spending
matches a negative budget debit; negative money received matches a positive budget
credit. Expense matching/creation requires positive spending. Matching creates no
charges and changes no ledger amounts or balances. Both records gain a junction
link atomically if unlinked, or retain their existing compatible pair. A conflicting
new pairing is rejected; existing historical multiple links are preserved.

Pending activity permits a **private provisional selection** of existing records.
Saving it creates no financial links, review completion or balance changes. A
stable provider ID retains the selection when posted, but the owner must confirm
against current source and record values. Anonymous pending rows have opaque local
snapshot references, never invented financial provider IDs. Complete snapshots
stage rows before atomically publishing every account generation and sync metadata;
failed staging/publication retains the previous visible generation. Identical
anonymous rows remain distinct. Refresh does not silently infer their identity.

A vanished pending selection retains its original source and chosen IDs as “Needs
confirmation”. Possible posted items share account, currency, amount and a nearby
date; these are uncertain suggestions requiring explicit choice and confirmation.
Nothing is attached automatically. Cancel removes only the provisional selection;
shared records remain. Account deselection/disconnect purges private imports,
snapshots and drafts while retaining shared records and their financial links.
Only the connecting owner sees bank references inside expanded expense cards and
budget detail cards (including expanded budget table rows). Sources load on
expansion and show merchant/name, amount, currency, date, account and
posted/pending/provisional/needs-confirmation status, with a link to bank review.
Other group members see shared records normally.

For posted activity, Add expense/budget/both reuses the existing Add form. Financial
source amount, currency and date come from the authenticated bank row; descriptions,
budget and group splits remain editable. Save batches bank claim, new ledger rows,
totals and associations atomically. Duplicate/stale saves produce no second charge.
Creation of an already associated side is rejected. A missing side can be created
only when the retained existing record remains valid and has no conflicting pair.

### Review-flow migration and rollback

Apply additive **0030_bank_review_links_pending.sql** manually to staging before the
first PR push (staging auto-deploys), then to production before the approved release.
It adds the nullable bank budget link, account pending-generation pointer, bounded
per-row pending snapshot table, and private review drafts. Existing imports,
credentials, confirmed expense links and historical expense–budget pairs remain.
No key rotation or credential change is required. `node scripts/verify-bank-migrations.mjs`
verifies 0028–0030 compatibility using synthetic in-memory SQLite.

Rollback code while retaining 0030; do not drop tables or reverse financial data.
Older Workers ignore the new tables/columns and retain normal named-column writes,
but do not offer this review flow or its new private-draft cleanup semantics.
Keep background sync disabled for this manual release. No new upstream refresh is
triggered by matching, provisional selection, form prefill or reverse lookup.

### Pending selection version compatibility

A pending item with no saved choice returns `draftVersion: null`. First save
accepts that legacy null or an omitted version; the UI omits it. Updating or
reactivating a saved choice requires its returned numeric version. Missing/null
versions never overwrite an existing choice, including a concurrent version-zero
first save. Stale versions return 409; refresh and select again. This changes no
ledger records, balances or ownership rules and requires no migration.
