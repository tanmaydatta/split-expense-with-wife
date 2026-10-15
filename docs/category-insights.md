# Shared expense category insights

Open **Category insights** from the navigation to see a category breakdown and monthly stacked spending chart for your current household. The initial range is the current UTC month through today. Apply both dates together; editing a date does not request new totals. Choose one original currency at a time, with no conversion. GBP is initially selected when present, otherwise the first available currency.

## Date presets

**This month** runs from the first UTC day of this month through today. **Last month** is the complete previous calendar month. **Last 7 days** and **Last 30 days** are rolling ranges ending today, including today and the previous 6 or 29 UTC dates. **Custom** keeps the dates you apply.

**Last 3 months** is also rolling, not three completed calendar months. Subtract three months from today, clamp that boundary to the last valid day of its month, then start on the following day: the interval is `(three-month boundary, today]`, expressed as inclusive date inputs. For example, 15 October 2026 gives **16 July–15 October 2026**; 31 May 2026 gives **1 March–31 May 2026** after clamping February to the 28th. Leap years clamp February to the 29th. Saved preset URLs derive fresh dates from today's UTC date when reopened; Custom URLs retain their fixed dates. An unknown preset is treated as Custom. The inputs always show the actual applied dates; manually applying edited dates switches to Custom.

## Explicit category exclusions

In Settings → Transaction categories, choose **Exclude from spending insights** for a category representing internal transfers or another movement you want omitted. The default is off. No category name, merchant or description automatically causes an exclusion. The setting applies to existing and future shared expenses assigned to that category, including archived categories, without editing amounts, descriptions, category assignments, names or archive state. Only authenticated members of the current household can update its categories.

Flagged activity is excluded consistently from included spending, adjustments, net expenses, counts, category percentages and monthly stacks. A visible notice lists excluded category names and the expense count for the selected currency and range; expandable amounts show excluded positives, negative adjustments and net separately. It remains visible when every expense is excluded. Currencies are never combined. Uncategorised activity remains included; assign an explicit category before excluding it. The 5,000-record range cap still includes excluded records across all currencies, so exclusion cannot bypass the cost bound.

## What the amounts mean

- **Spending** sums positive shared expense amounts. Category percentages are shares of this amount, not shares of the number of entries.
- **Adjustments** sums negative shared expense amounts. A negative amount is not assumed to be income or a refund.
- **Net expenses** adds adjustments to spending. For example, £150 spending and -£100 adjustments give £50 net expenses. The category percentages still use £150, so negative-only or net-zero activity cannot create misleading percentages.
- Uncategorised entries remain visible. Saved custom and archived category names are retained. Zero or negative-only categories show 0% spending and their adjustments separately.

Each shared expense is counted once from `transactions`. Linked budget entries, other budget activity, private bank imports and member splits are not included. A bank import explicitly saved as a shared expense is included through that shared expense only. Budget credits moving money between personal and shared budgets are therefore outside this view.

The monthly chart uses positive spending only. It shows the seven largest categories individually and groups any remainder as **Other categories**. The complete category breakdown remains above the chart. Expand **Monthly spending totals** for readable monthly amounts for every category, including those grouped in the chart.

Select a category in the breakdown or chart legend to open the existing Expenses page with that category, UTC date range and currency applied. The resulting list includes adjustments in that category as well as positive expenses.

## Limits and privacy

The read-only endpoint accepts at most 366 inclusive UTC days and 5,000 non-deleted shared expenses across all currencies in the selected range. If the range exceeds the cap, it asks for a shorter range rather than showing partial totals. Choosing a sparse currency does not bypass the household range cap. The analytics query also fails closed if D1 read accounting is absent or exceeds 40,000 rows read.

`POST /category-insights` requires an authenticated, completed-signup user. The server reads the user's current household and rejects client-supplied household identifiers. It never reads bank tables, budget tables, transaction descriptions or member shares. Responses are private and `no-store` at HTTP level.

The frontend cache includes household, user, authentication session, applied dates and currency. It has a one-minute stale time, no polling and no retries. Returning to or focusing a stale page refreshes it. Expense creation/deletion, linked deletion, bill payment, explicit category edits/exclusion settings and completed bulk categorisation invalidate cached insights. Changes by other users or background actions are picked up on a stale revisit/focus or page reload.

## Query and regression evidence

The existing `transactions_group_id_deleted_created_at_idx` drives the household/live/date range. A materialized `LIMIT 5001` precedes category sidecar enrichment; category joins use their identity indexes. Currency selection and aggregation happen only after this bounded read. The existing indexes remain sufficient; migration 0034 adds only the category preference column.

Local synthetic testing against **all production SQL migrations**, including 0033:

| Fixture | Analytics rows read |
| --- | ---: |
| 5,000 fully categorised shared expenses | 20,000 |
| Same range plus 50,000 foreign-household and 50,000 older expenses | 20,000 |
| Same 5,000 expenses explicitly excluded | 20,000 |

`EXPLAIN QUERY PLAN` confirms indexed transaction range discovery and indexed category joins, with no scans of the ledger or category tables. The scan of the materialized selected rows is bounded to 5,001. Authentication uses the existing separate indexed session/current-user lookups. The cost fixture runs in Worker CI.

```sh
node --test scripts/tests/category-insights-query-cost.test.mjs
cd cf-worker && yarn exec vitest run src/tests/category-insights.test.ts
```

Frontend regression coverage includes cache/session isolation, mutation invalidation, amount-based percentages, negative-only and empty states, and exact filtered drilldown URLs. Synthetic browser checks use a built frontend with stubbed API responses, separately from the real local D1/auth API tests; they do not claim end-to-end real financial API execution.

```sh
yarn test --watchAll=false --runInBand
yarn lint
REACT_APP_AUTH_BASE_URL=http://127.0.0.1:4326 REACT_APP_API_BASE_URL=/.netlify/functions yarn build
yarn playwright test --config playwright.bulk-categories.config.ts category-insights.spec.ts
```

The legend uses specific flex classes with each decorative swatch inside its label link. Actual browser computed geometry improved from a 13px vertical offset to 0.75px while retaining the 44px link target.

Synthetic, visually reviewed screenshots: [desktop overview](previews/category-insights/desktop-overview.png), [desktop monthly chart](previews/category-insights/desktop-monthly.png), [mobile overview](previews/category-insights/mobile-overview.png), [mobile category breakdown](previews/category-insights/mobile-breakdown.png), [mobile monthly chart](previews/category-insights/mobile-monthly.png), [desktop exclusion settings](previews/category-insights/desktop-settings.png), [mobile exclusion settings](previews/category-insights/mobile-settings.png).

## Release and rollback

Migration **0034_category_insight_exclusions.sql** adds `group_categories.exclude_from_insights INTEGER NOT NULL DEFAULT 0 CHECK (exclude_from_insights IN (0,1))`. Drizzle schema and shared types match. It changes no financial rows or saved category assignments; existing and new categories default to included. Old Worker code remains compatible with the added column.

Migrations are manual: verify 0034 is the sole pending migration and apply it to **dev before pushing** (push automatically deploys dev), then verify its column/default/check and migration record using metadata only. **Production 0034 must be reviewed and applied before merging** because the new taxonomy and analytics SELECTs require the column. Merge still requires explicit user approval after reviewing the PR and all seven embedded screenshots. No new binding is required.

For rollback, revert the Worker/UI code and leave the additive column and stored preferences in place. Do not drop the column or alter financial data.

Local final verification: **405 Worker tests passed, 8 skipped** across 33 files; **72 frontend tests passed, 2 skipped**. Both lint/type gates and the production frontend build passed. **Eight** dedicated desktop/mobile browser cases passed, including rolling presets, no date-keystroke requests, currency isolation, exact filtered drilldown, readable monthly amounts, explicit cap errors, measured legend alignment and archived-category exclusion toggles. The production-migration cost fixture includes 0034 and remains at **20,000 reads** in all three cases above. Seven final screenshots were personally reviewed.
