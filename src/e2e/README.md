# E2E test fixtures

This directory holds Playwright fixtures and supporting helpers for e2e tests.

## New fixtures (preferred for new tests)

- `fixtures/setup.ts` — exports `test`, `expect`, `factories`, `skipIfRemoteBackend`, fixture types.
- `fixtures/seed-client.ts` — typed HTTP wrapper around `POST /test/seed`.
- `fixtures/factories.ts` — payload builders with sane defaults.

### Quick example

```ts
import { test, expect, factories } from "../fixtures/setup";

test("delete a transaction", async ({ seed, page }) => {
  const { ids } = await seed({
    users: [factories.user({ alias: "alice" })],
    groups: [factories.group({ alias: "g", members: ["alice"] })],
    transactions: [factories.transaction({
      alias: "t", group: "g", paidBy: "alice", amount: 100,
    })],
    authenticate: ["alice"],
  });
  await page.goto(`/transactions`);
  // ... exercise the UI ...
});
```

## Skipping fixture tests when running against a remote backend

```ts
import { test, expect, skipIfRemoteBackend } from "../fixtures/setup";

test.describe("My fixture-dependent suite", () => {
  test.beforeAll(skipIfRemoteBackend);
  // ... tests ...
});
```

## Legacy fixtures (deprecated)

`fixtures/setup.ts` also exports `authenticatedPage` and `authenticatedMultiPersonPage` — UI-based login fixtures used by older spec files. They still work but new tests should use the seed-based fixtures above.

`fixtures/test-data.ts` contains hardcoded test users used by legacy fixtures. Don't import this in new tests.

## Conversion guidance

When converting a legacy test:

- Replace `authenticatedPage` with `authedPage` and wrap in `new TestHelper(authedPage)` if the test uses `ExpenseTestHelper` or similar helpers that take a `TestHelper`.
- Keep UI form-fill code if the form is the system under test.
- Replace UI-driven creation steps (e.g., "add expense via form, then delete it") with seed-driven setup ("seed expense, then delete it via UI").
- Drop the per-test `clearCookies` / `localStorage.clear` blocks — fixtures isolate each test by default.

See `src/e2e/tests/expense-management.spec.ts` for the pilot conversion.
