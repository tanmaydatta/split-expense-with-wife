import type {
    ScheduledAction,
    ScheduledActionHistory,
} from "split-expense-shared-types";
import { expect, test } from "../fixtures/setup";

test.describe("Scheduled Actions", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;

    // In-memory store for mocked API
    const actions: ScheduledAction[] = [];
    const historyByActionId = new Map<string, ScheduledActionHistory[]>();

    function nowIsoDateTime(): string {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function todayIsoDate(): string {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    // Utility to fulfill JSON
    const fulfillJson = (route: any, body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    await page.route("**/.netlify/functions/scheduled-actions*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace("/.netlify/functions/", "");
      const method = request.method();

      if (path === "scheduled-actions" && method === "POST") {
        const body = (await request.postDataJSON()) as any;
        const id = `sa_${Math.random().toString(36).slice(2, 10)}`;
        const createdAt = nowIsoDateTime().replace("T", " ");
        const nextExecutionDate = body.startDate || todayIsoDate();
        const newAction: ScheduledAction = {
          id,
          userId: "u1",
          actionType: body.actionType,
          frequency: body.frequency,
          startDate: body.startDate,
          isActive: true,
          actionData: body.actionData,
          nextExecutionDate,
          createdAt,
          updatedAt: createdAt,
        };
        actions.unshift(newAction);
        return fulfillJson(route, { message: "Scheduled action created successfully", id });
      }

      if (path === "scheduled-actions/list" && method === "GET") {
        return fulfillJson(route, {
          scheduledActions: actions,
          totalCount: actions.length,
          hasMore: false,
        });
      }

      if (path === "scheduled-actions/update" && (method === "POST" || method === "PUT")) {
        const body = (await request.postDataJSON()) as any;
        const idx = actions.findIndex((a) => a.id === body.id);
        if (idx >= 0) {
          actions[idx] = {
            ...actions[idx],
            ...("frequency" in body ? { frequency: body.frequency } : {}),
            ...("startDate" in body ? { startDate: body.startDate } : {}),
            ...("isActive" in body ? { isActive: body.isActive } : {}),
            ...("actionData" in body && body.actionData ? { actionData: body.actionData } : {}),
            updatedAt: nowIsoDateTime().replace("T", " "),
          } as ScheduledAction;
        }
        return fulfillJson(route, { message: "Updated" });
      }

      if (path === "scheduled-actions/delete" && method === "DELETE") {
        const body = (await request.postDataJSON()) as any;
        const idx = actions.findIndex((a) => a.id === body.id);
        if (idx >= 0) actions.splice(idx, 1);
        return fulfillJson(route, { message: "Deleted" });
      }

      if (path === "scheduled-actions/details" && method === "GET") {
        const id = url.searchParams.get("id");
        const action = actions.find((a) => a.id === id);
        if (!action) return fulfillJson(route, { error: "Not found" }, 404);
        return fulfillJson(route, action);
      }

      if (path === "scheduled-actions/history" && method === "GET") {
        const scheduledActionId = url.searchParams.get("scheduledActionId") || "";
        const list = historyByActionId.get(scheduledActionId) || [];
        return fulfillJson(route, { history: list, totalCount: list.length, hasMore: false });
      }

      if (path === "scheduled-actions/history/details" && method === "GET") {
        const historyId = url.searchParams.get("id");
        let found: ScheduledActionHistory | undefined;
        for (const items of Array.from(historyByActionId.values())) {
          found = items.find((h) => h.id === historyId);
          if (found) break;
        }
        if (!found) return fulfillJson(route, { error: "Not found" }, 404);
        return fulfillJson(route, found);
      }

      return route.continue();
    });
  });

  test("create expense action and see it in list", async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    await page.goto("/scheduled-actions/new");
    await expect(page.getByTestId("scheduled-actions-new")).toBeVisible();

    // Ensure expense mode
    await page.getByTestId("sa-action-expense").click();

    // Fill fields
    await page.getByTestId("sa-exp-description").fill("Morning coffee subscription");
    await page.getByTestId("sa-exp-amount").fill("9.99");

    // Select first available paidBy option if present
    const paidBySelect = page.getByTestId("sa-exp-paid-by");
    if (await paidBySelect.count()) {
      const firstVal = await paidBySelect.locator("option").nth(1).getAttribute("value");
      if (firstVal) await paidBySelect.selectOption(firstVal);
    }

    // Submit
    await page.getByTestId("sa-submit").click();
    await expect(page.getByTestId("success-container")).toBeVisible();

    // Navigate to list and verify card
    await page.goto("/scheduled-actions");
    await expect(page.getByTestId("scheduled-actions-page")).toBeVisible();
    await expect(page.locator(".settings-card").filter({ hasText: "Morning coffee subscription" })).toBeVisible();
    await expect(page.locator(".settings-card").filter({ hasText: "Add Expense" })).toBeVisible();
  });

  test("create budget action and see it in list", async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    await page.goto("/scheduled-actions/new");

    await page.getByTestId("sa-action-budget").click();
    await page.getByTestId("sa-bud-description").fill("Monthly house credit");
    await page.getByTestId("sa-bud-amount").fill("200");
    await page.getByTestId("sa-bud-currency").selectOption({ label: (await page.getByTestId("sa-bud-currency").locator("option").first().textContent()) || "USD" });

    // Select first budget if available
    const firstBudget = page.locator('[data-test-id^="budget-radio-"]').first();
    if (await firstBudget.count()) await firstBudget.click();

    await page.getByTestId("sa-submit").click();
    await expect(page.getByTestId("success-container")).toBeVisible();

    await page.goto("/scheduled-actions");
    await expect(page.locator(".settings-card").filter({ hasText: "Monthly house credit" })).toBeVisible();
    await expect(page.locator(".settings-card").filter({ hasText: "Add to Budget" })).toBeVisible();
  });

  test("edit an action's frequency and amount", async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;

    // Create one action via UI first
    await page.goto("/scheduled-actions/new");
    await page.getByTestId("sa-action-expense").click();
    await page.getByTestId("sa-exp-description").fill("Gym membership");
    await page.getByTestId("sa-exp-amount").fill("50");
    await page.getByTestId("sa-submit").click();
    await expect(page.getByTestId("success-container")).toBeVisible();

    // Go to list and open edit
    await page.goto("/scheduled-actions");
    const card = page.locator(".settings-card").filter({ hasText: "Gym membership" });
    await expect(card).toBeVisible();
    // Click edit icon in this card
    await card.locator('[data-test-id^="sa-edit-"]').click();

    await expect(page.getByTestId("scheduled-actions-edit")).toBeVisible();
    // Change frequency to weekly
    await page.getByTestId("sa-frequency-weekly").click();
    // Change amount
    await page.getByTestId("sa-exp-amount").fill("55");
    await page.getByTestId("sa-submit").click();
    await expect(page.getByTestId("success-container")).toBeVisible();

    // Back to list and expect frequency text shows weekly
    await page.goto("/scheduled-actions");
    const updated = page.locator(".settings-card").filter({ hasText: "Gym membership" });
    await expect(updated).toBeVisible();
    await expect(updated.locator("div")).toContainText("WEEKLY");
  });

  test("delete flow: cancel then confirm", async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;

    // Create an action
    await page.goto("/scheduled-actions/new");
    await page.getByTestId("sa-exp-description").fill("To be deleted");
    await page.getByTestId("sa-exp-amount").fill("10");
    await page.getByTestId("sa-submit").click();
    await expect(page.getByTestId("success-container")).toBeVisible();

    await page.goto("/scheduled-actions");
    const card = page.locator(".settings-card").filter({ hasText: "To be deleted" });
    await expect(card).toBeVisible();

    // Cancel delete
    await card.locator('[data-test-id^="sa-delete-"]').click();
    await expect(page.locator('[data-test-id="confirm-dialog"]')).toBeVisible();
    await page.getByText("Cancel").click();
    await expect(card).toBeVisible();

    // Confirm delete
    await card.locator('[data-test-id^="sa-delete-"]').click();
    await page.getByText("Delete").click();
    await expect(page.locator(".settings-card").filter({ hasText: "To be deleted" })).toHaveCount(0);
  });

  test("validation: submit disabled on invalid fields and split mismatch", async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;
    await page.goto("/scheduled-actions/new");

    // Expense mode
    await page.getByTestId("sa-action-expense").click();
    await page.getByTestId("sa-exp-description").fill("a"); // too short
    await page.getByTestId("sa-exp-amount").fill("0"); // not positive

    // Try to change one split to break total = 100
    const anySplit = page.locator('[data-test-id^="sa-exp-split-"]').first();
    if (await anySplit.count()) {
      await anySplit.fill("10");
    }

    await expect(page.getByTestId("sa-submit")).toBeDisabled();

    // Fix inputs to valid
    await page.getByTestId("sa-exp-description").fill("Valid desc");
    await page.getByTestId("sa-exp-amount").fill("1");
  });

  test("history page and run details navigation (UI only)", async ({ authenticatedPage }) => {
    const { page } = authenticatedPage;

    // Create an action to have an ID
    await page.goto("/scheduled-actions/new");
    await page.getByTestId("sa-exp-description").fill("Has history");
    await page.getByTestId("sa-exp-amount").fill("5");
    await page.getByTestId("sa-submit").click();
    await expect(page.getByTestId("success-container")).toBeVisible();

    // Go to list and click the card to go to history page
    await page.goto("/scheduled-actions");
    const card = page.locator(".settings-card").filter({ hasText: "Has history" });
    await expect(card).toBeVisible();

    // Extract the dynamic id from edit button test-id (sa-edit-<id>) to construct history mocks automatically
    const editBtn = card.locator('[data-test-id^="sa-edit-"]');
    const editTestId = await editBtn.getAttribute("data-test-id");
    const actionId = editTestId?.replace("sa-edit-", "") || "";

    // Inject mock history for this action by navigating to history (routes set in beforeEach will serve it)
    // Click left section to navigate to history page
    await card.locator("div").first().click();
    await expect(page.getByTestId("scheduled-actions-history")).toBeVisible();

    // Because our beforeEach handler returns empty history by default, navigate directly to run details should show failure to load
    // Instead, manually request details page with a made-up id to assert error UI is handled gracefully
    await page.goto(`/scheduled-actions/history/run/hist_${actionId}-2024-01-01`);
    await expect(page.getByTestId("sa-history-run")).toBeVisible();
  });
});


