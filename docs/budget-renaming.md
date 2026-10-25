# Renaming budgets

On **Budget**, open the **⋯** actions next to a budget name and choose **Rename budget**. The dialog starts with the current name. Choose **Save** to apply immediately, or **Cancel** to leave it unchanged. A failed save keeps the dialog and entered name available for retry.

Names are trimmed and must contain 1–60 characters: letters, numbers, spaces, hyphens or underscores. Active budgets in the same household cannot share a name, ignoring case. Renaming keeps the budget ID, description, entries, transfer pairs and balances unchanged. Selectors, Insights filters and transfer counterpart labels use the new name.

`POST /budget/rename` accepts `{budgetId, budgetName}` and returns `{id, budgetName, description}`. Authentication and completed signup are required. The update atomically checks the active budget and the user's current household membership; the client cannot choose a household. Missing, archived and other-household budgets return 403. Invalid or duplicate names return 400, unauthenticated requests 401 and non-POST methods 405. No migration, deployment flag or financial writes are required.

Coverage: `cf-worker/src/tests/budget-rename.test.ts` exercises authentication, household boundaries, validation, trimming and preservation. `src/e2e/budget-rename.spec.ts` exercises desktop/mobile cancellation, validation, retry and immediate selector/transfer updates with synthetic data. Browser evidence is in `docs/previews/budget-rename/`.
