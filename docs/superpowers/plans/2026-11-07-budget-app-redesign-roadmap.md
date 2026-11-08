# Budget app redesign - independent plan roadmap

**Date:** 2026-11-07  
**Repository:** `tanmaydatta/split-expense-with-wife`  
**Design:** [Transaction-first redesign](../specs/2026-11-07-transaction-first-budget-app-design.md)

These are **five separate implementation plans**, not one giant rewrite. Each targets one change and should be reviewed, tested, and merged independently.

| Order | Plan | Deliverable | Dependencies |
| --- | --- | --- | --- |
| 1 | [Unified transactions](2026-11-07-unified-transactions.md) | One deduplicated chronological history, canonical row types, filters/details | None; preserves existing APIs |
| 2 | [Transaction entry UX](2026-11-07-transaction-entry-ux.md) | Purchase-first entry, clear funding and transfer actions | None; pairs well with plan 1 |
| 3 | [Budget dashboard](2026-11-07-budget-dashboard.md) | All-budget overview, detail, monthly trends, positive/negative balances | None; use new transaction drilldown when plan 1 exists |
| 4 | [Reports and categories](2026-11-07-reports-categories.md) | One Reports page and spending category breakdown with no category limits | Independent; update drilldown links if plan 1 is merged |
| 5 | [AI categorisation](2026-11-07-ai-autocategorisation.md) | GPT-OSS 120B, prompt, async jobs, passive learning, cost cap | Independent; preserve existing category editing APIs |

## Suggested merge order

Start with **Plan 1**, because it resolves the largest duplication and makes the app transaction-first. Then **Plan 2**, then **Plan 3**, then **Plan 4**. **Plan 5** may proceed in parallel on its own branch because it focuses on categorisation rather than navigation.

**Important:** Do **not** combine all five into one implementation PR. A documentation-only PR containing all plans is fine; implementation PRs should be narrowly scoped.

## Non-negotiable checks across PRs

- No changes to accounting totals, shares/IOUs, or bank security as an accidental UI side effect.
- A linked expense + budget movement counts as **one** purchase.
- A paired budget transfer counts as **one** transfer and **zero** spending.
- Budget categories have rolling positive and negative balances; spending categories have **no caps**.
- Preserve existing database content and old routes/contracts until compatible replacements ship.
- AI errors cannot block a save, and late AI cannot overwrite a manual category.
- Do not automatically deploy database migrations to production. Follow `docs/deployment.md` and specific migration runbooks.

## Running the suite

From the repository root, use the project's Yarn scripts. Focused examples:

```bash
yarn test --watchAll=false --runInBand
yarn lint
yarn playwright test src/e2e/tests/expense-budget-linking.spec.ts
cd cf-worker && yarn test && yarn lint
```

Some browser suites require local Worker/D1 fixtures; follow `src/e2e/README.md` and `docs/development.md`. No tests or application changes are performed by this plan set.
