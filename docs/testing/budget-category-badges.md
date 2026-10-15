# Loaded budget category display verification

Synthetic desktop (1440×1080) and mobile (390×844) browser fixtures show Groceries, a manual Uncategorised clear and an archived custom category with a long name. All icons are decorative (`aria-hidden`) and names remain readable text. The tests verify that the loaded list makes no entry-detail requests and uses one shared cached taxonomy request.

```sh
yarn test --watchAll=false --runInBand src/components/Categories/CategoryBadge.test.tsx src/pages/Budget/BudgetTable.category.test.tsx
REACT_APP_AUTH_BASE_URL=http://127.0.0.1:4326 REACT_APP_API_BASE_URL=/.netlify/functions yarn build
yarn playwright test --config playwright.bulk-categories.config.ts budget-category-badges.spec.ts
```

The existing synthetic browser CI job includes this spec and uploads its screenshots. No backend changes, migrations, financial queries or inference are needed.

- [Desktop loaded categories](../previews/budget-category-badges/desktop-loaded-categories.png)
- [Mobile loaded categories](../previews/budget-category-badges/mobile-loaded-categories.png)

Verified locally: full frontend suite **61 passed, 2 skipped**; TypeScript/ESLint and production build passed; both desktop/mobile browser cases passed. Both screenshots were visually reviewed. Browser checks also assert desktop description typography inherits its original table cell font and color, preserved descriptions and amounts, no horizontal overflow, one taxonomy request and zero entry-detail requests.
