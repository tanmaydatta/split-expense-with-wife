# Bulk category verification

All fixtures and screenshots are synthetic. Browser tests intercept application API/auth responses; they exercise the actual production UI build for checkbox selection, the 100-entry limit, queued progress, navigation away/return, completed counts and version-aware category badge updates without a list-refetch storm. They cover Budget and Expenses at desktop (1440×1080) and mobile (390×844). No remote financial records, real inference or historical backfill are used.

The Worker integration suite separately dispatches the **real local Cloudflare Workflow** through authenticated HTTP start, applies a deterministic description rule through D1, and verifies terminal state/category publication. The default Worker suite covers authentication, owner privacy, group changes during the final atomic SQL write, concurrent manual clears, sibling/request deduplication, retry reservations, dispatch ambiguity/failure recovery, stale leases and cost limits. Production migration 0033 is executed by the shared synthetic D1 setup.

The measured 100-independent-root fixture uses **12,146 D1 rows read**, below the processing allowance of 50,000. A one-root fixture with 10,000 unrelated household transactions stays below 500 rows read. Metadata/status operations use indexed bounded job/item lookups; these small operations are additional to the processing meter. Missing D1 cost metadata consumes the durable reservation and stops further processing.

```sh
# Complete backend suite and actual local Workflow integration
yarn workspace split-expense-worker test
yarn workspace split-expense-worker exec vitest run --config vitest.category-workflow.config.ts

# Frontend suite and build
yarn test --watchAll=false --runInBand
REACT_APP_AUTH_BASE_URL=http://127.0.0.1:4326 REACT_APP_API_BASE_URL=/.netlify/functions yarn build

# Starts a loopback-only preview server and regenerates the synthetic screenshots
yarn playwright test --config playwright.bulk-categories.config.ts
```

| View | Selected entries | Completed job |
| --- | --- | --- |
| Expenses desktop | [Screenshot](../previews/bulk-categories/expense-desktop-selected.png) | [Screenshot](../previews/bulk-categories/expense-desktop-completed.png) |
| Expenses mobile | [Screenshot](../previews/bulk-categories/expense-mobile-selected.png) | [Screenshot](../previews/bulk-categories/expense-mobile-completed.png) |
| Budget desktop | [Screenshot](../previews/bulk-categories/budget-desktop-selected.png) | [Screenshot](../previews/bulk-categories/budget-desktop-completed.png) |
| Budget mobile | [Screenshot](../previews/bulk-categories/budget-mobile-selected.png) | [Screenshot](../previews/bulk-categories/budget-mobile-completed.png) |

Screenshots are framed around the bulk controls and loaded entries. Final captures are inspected at their actual viewport sizes; the mobile completed cards visibly show the resulting category and neither layout overflows horizontally.
