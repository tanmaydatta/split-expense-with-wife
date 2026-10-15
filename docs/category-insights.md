# Budget category insights

Open **Budget insights** to see debit spending by category and month for the current household's active budgets. **All active budgets** is selected initially; choose an individual budget when needed. Shared expenses and private bank tables are never report sources. Each live budget entry is counted once using its own budget category metadata, independently of any linked expense category.

## Amounts and drilldown

- **Spending** is the magnitude of negative budget entries (debits).
- **Credits** sums positive budget entries. Credits are not assumed to be income.
- **Net budget movement** is credits minus spending. A £500 credit and £500 debit therefore show £500 spending, £500 credits and £0 net movement.
- Category percentages use debit spending amounts, not entry counts. Credit-only categories show 0% spending and their credits separately. Counts include zero-value entries.

Choose one original currency at a time; currencies are never converted or combined. The monthly chart stacks debit spending only. It displays the seven largest categories and groups the remainder as **Other categories**. The complete category breakdown and expandable monthly category amounts remain available as readable text.

For an individual budget, category links open the existing Budget page with that budget, category, date range and currency. For All active budgets, expand **View budget entries** below a category to choose a visibly named budget. These links never silently default to a different budget and never open Expenses. Drilldown includes credits as well as debits. Deleted entries and deleted budgets are excluded. Future-dated entries are excluded using the same current-UTC-second cutoff as the Budget list.

## Dates

The initial range is this UTC month through today. Apply date edits together; typing does not request new totals. **This month** runs from the first UTC day through today. **Last month** is the complete previous calendar month. **Last 7 days** and **Last 30 days** include today and the previous 6 or 29 UTC dates. **Custom** keeps the dates you apply.

**Last 3 months** is rolling: subtract three months from today, clamp that boundary to its month's last valid day, then start on the following day. The interval is `(three-month boundary, today]`, shown as inclusive inputs. For example, 15 October 2026 gives **16 July–15 October 2026**; 31 May 2026 gives **1 March–31 May 2026** after clamping February to the 28th. Leap years clamp February to the 29th. Reopened preset URLs derive dates from today's UTC date; Custom URLs stay fixed. Unknown presets become Custom, and applying manually edited dates selects Custom.

## Saved and temporary exclusions

Settings → Transaction categories retains the explicit **Exclude from spending insights** preference, off by default. No name, description or merchant implies exclusion. Saved exclusions apply to the category's budget entries, including archived categories, without changing category assignments or financial records.

The Insights page also offers **Temporary category exclusions**. Check categories and choose **Apply exclusions** to add exclusions for this view. Repeated `exclude` URL parameters preserve the selection across reloads and shared links. **Reset temporary exclusions** clears only those temporary choices; budget, date and currency controls remain set. This page never writes category Settings. Saved exclusions remain checked and disabled because temporary filters are additive, not overrides. Options include Uncategorised, archived categories and categories with no currently included rows, so an exclusion can always be undone.

Exclusions apply consistently to spending, credits, net movement, counts, percentages and monthly stacks. A visible notice lists excluded category names and budget-entry counts; expandable amounts show excluded spending, credits and net movement for the selected currency. It remains usable when every entry is excluded. Resetting temporary choices does not reset saved preferences.

## Bounds, authentication and compatibility

The read-only `POST /category-insights` requires an authenticated completed-signup user and verifies their current household server-side. Client-supplied household identifiers are rejected. Budget identities and temporary category IDs must belong to that household. Responses are private and HTTP `no-store`; no transaction descriptions, member splits or bank tables are read.

Requests require `source: "budget"`. An already-open older expense-insights page receives **409: Insights changed. Refresh the page.** instead of displaying budget totals under old expense labels. Refresh loads the new budget-only interface. Malformed or unsupported request fields are rejected.

The maximum range is **366 inclusive UTC days**, **5,000 live budget entries**, and **100 active budgets** in All mode. A household with more budgets must select one. The entry cap applies before currency selection and exclusions. Exceeding a cap shows a narrow-range/select-budget message, never partial totals. At most 100 temporary category IDs are accepted. Cumulative measured D1 reads across budget discovery, exclusion validation and ledger enrichment must remain within **40,000**; absent read metadata fails closed.

The frontend cache includes source, household, user, authentication session, dates, currency, budget and temporary exclusions. It has a one-minute stale time, no polling and no retries. Relevant budget/ledger/category/bulk mutations invalidate insights, including budget creation. Other-user or background changes appear on stale revisit/focus or reload.

## Query-cost and local verification

Verified budget IDs feed indexed `budget_entries_monthly_aggregation_idx` date ranges. An unordered materialized `LIMIT 5001` precedes category enrichment, avoiding a global date sort that could read an entire oversized range. Sidecars use `record_kind='budget'` and identity indexes. All-budget metadata uses `group_budgets_group_id_deleted_idx` with `LIMIT 101`. Existing production indexes suffice; **no migration is added**.

The synthetic fixture runs all production SQL migrations through 0034 and measures every report query's actual `meta.rows_read`:

| Fixture | Cumulative rows read |
| --- | ---: |
| 5,000 categorised budget entries across two budgets | 20,007 |
| Same plus 50,000 foreign-budget and 50,000 older household entries | 20,007 |
| All 5,000 entries excluded | 20,007 |
| 55,000 in-range entries across two budgets, rejected at the cap | 15,005 |

`EXPLAIN QUERY PLAN` confirms indexed budget/date discovery and category identity joins, without ledger/category scans or a global ordering sort. Authentication uses separate existing indexed session/current-user lookups. This cost fixture runs in Worker CI.

Focused backend tests cover authentication, legacy-client refresh, current/foreign household scope, deleted/future entries, £500 credit/debit cancellation, budget versus linked-expense categories, currency separation, saved/additive temporary exclusions, validation, empty households, record/budget bounds and fail-closed accounting. Frontend tests cover URL Apply/Reset, no Settings writes, cache isolation and correct per-budget links. Browser cases use a built frontend with synthetic API responses; real local D1/auth API tests independently verify backend behavior.

```sh
node --test scripts/tests/category-insights-query-cost.test.mjs
cd cf-worker && yarn exec vitest run src/tests/category-insights.test.ts
# From the repository root:
yarn test --watchAll=false --runInBand
yarn lint
yarn workspace split-expense-worker lint
REACT_APP_AUTH_BASE_URL=http://127.0.0.1:4326 REACT_APP_API_BASE_URL=/.netlify/functions yarn build
yarn playwright test --config playwright.bulk-categories.config.ts category-insights.spec.ts
```

Synthetic screenshots, personally reviewed: [desktop overview](previews/category-insights/desktop-overview.png), [desktop monthly chart](previews/category-insights/desktop-monthly.png), [desktop temporary filters](previews/category-insights/desktop-filters.png), [mobile overview](previews/category-insights/mobile-overview.png), [mobile category breakdown](previews/category-insights/mobile-breakdown.png), [mobile monthly chart](previews/category-insights/mobile-monthly.png), [mobile temporary filters](previews/category-insights/mobile-filters.png).

## Release and rollback

Migration 0034 and its saved category preference are already applied in development and production; **do not reapply it**. This change needs no migration or new binding. Push deploys development automatically; merge requires explicit user approval after the PR and screenshots are reviewed. No real financial report or classification job is required for release verification. Verify public health, unauthenticated rejection and version/static assets only.

For rollback, revert Worker and UI together and retain the additive 0034 column and preferences. No financial rows or category settings are modified by this report or its temporary filters.
