# Transaction category UI verification

All browser data is invented. The CLI Playwright harness blocks external requests and service workers; API mutations are synthetic responses only. No real bank access, sync or customer ledger writes occurred. Root personally reviewed actual desktop/mobile source, selection/conflict, bank form, expanded editor/private source, filters, recurring form and group-rule consent viewports, and required corrected numeric budget fixtures and scheduled app-bar mapping before approval.

## Checks

- Full Worker suite: 360 passed, 8 skipped across 30 files, baseline AI/categories disabled; targeted AI calls mocked.
- Focused UI:7 passed, covering Automatic(undefined) versus manual clear(null), saved archived choice, disabled UI, conflict alignment with reviewed version/event isolation, successful new-form category reset and shipped inbox behavior.
- Frontend/Worker types, full frontend ESLint, Worker Biome, independent UI build and git diff check passed.
- Browser smoke: explicit bank conflict resolution sends both reviewed category versions; manual edit sends null and version; archived/Uncategorised filter IDs reach APIs; category choice resets on source route change; pending first-save omits category and draft version; rendered budget totals are numeric; nested scheduled pages retain the correct app-bar title; no horizontal overflow.

## Capture reproduction

Build the UI independently, serve it locally, then run:

```sh
BANK_PREVIEW_URL=http://127.0.0.1:4322 node scripts/capture-transaction-categories.cjs
```

The harness writes 60 PNGs under `docs/previews/transaction-categories`. `viewport` files show actual app scroll/layout; `lower-viewport` and dedicated category/rules shots show actual scrolled positions. Full captures are supplementary context that temporarily exposes scroll ancestors and restores styles. Settings top supplements are labelled accurately because nested scrolling limits the captured content.

Representative evidence:

- [Mobile bank conflict/actions](../previews/transaction-categories/review-conflict-mobile-lower-viewport.png)
- [Mobile bank form](../previews/transaction-categories/form-mobile-viewport.png)
- [Expanded category editor and private bank source](../previews/transaction-categories/expanded-expense-mobile-full.png)
- [Expense category filter](../previews/transaction-categories/expenses-filter-mobile-full.png)
- [Budget category filter](../previews/transaction-categories/budget-filter-mobile-viewport.png)
- [Recurring default](../previews/transaction-categories/recurring-mobile-viewport.png)
- [Explicit group rule and consent](../previews/transaction-categories/settings-rules-mobile-viewport.png)

The AI calibration/heldout reports and reproducible evaluator are documented separately in [category AI verification](category-ai.md). Remote 0031 was explicitly approved and applied to exact dev/prod databases on 2026-10-14; deployed category flags remained disabled until this UI/runtime release.
