# Shared expense category insights

Open **Category insights** from the navigation to see a category breakdown and monthly stacked spending chart for your current household. The initial range is the current UTC month through today. Apply both dates together; editing a date does not request new totals. Choose one original currency at a time, with no conversion. GBP is initially selected when present, otherwise the first available currency.

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

The frontend cache includes household, user, authentication session, applied dates and currency. It has a one-minute stale time, no polling and no retries. Returning to or focusing a stale page refreshes it. Expense creation/deletion, linked deletion, bill payment, explicit category edits and completed bulk categorisation invalidate cached insights. Changes by other users or background actions are picked up on a stale revisit/focus or page reload.

## Query and regression evidence

The existing `transactions_group_id_deleted_created_at_idx` drives the household/live/date range. A materialized `LIMIT 5001` precedes category sidecar enrichment; category joins use their identity indexes. Currency selection and aggregation happen only after this bounded read. No migration is needed.

Local synthetic testing against **all production SQL migrations**, including 0033:

| Fixture | Analytics rows read |
| --- | ---: |
| 5,000 fully categorised shared expenses | 20,000 |
| Same range plus 50,000 foreign-household and 50,000 older expenses | 20,000 |

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

Synthetic, visually reviewed screenshots: [desktop overview](previews/category-insights/desktop-overview.png), [desktop monthly chart](previews/category-insights/desktop-monthly.png), [mobile overview](previews/category-insights/mobile-overview.png), [mobile category breakdown](previews/category-insights/mobile-breakdown.png), [mobile monthly chart](previews/category-insights/mobile-monthly.png).

## Release

No migration, new binding or financial write is involved. Revert the UI/endpoint commit to roll back. Merge requires explicit user approval after reviewing the PR and embedded screenshots.

Local verification for this release: **10 focused Worker tests**, the production-migration cost fixture, **67 frontend tests (2 skipped)**, TypeScript/ESLint/Worker lint and the production frontend build passed. **Four** dedicated desktop/mobile browser cases passed, including date-apply request control, currency isolation, category/date/currency drilldown, accessible monthly amounts and explicit cap errors without partial charts.
