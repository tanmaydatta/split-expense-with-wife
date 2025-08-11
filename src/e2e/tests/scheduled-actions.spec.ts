import { expect, test } from "../fixtures/setup";
import {
  getCurrentCurrencyFromSettings,
  getCurrentUserPercentages,
} from "../utils/expense-test-helper";
import { ScheduledActionsTestHelper } from "../utils/scheduled-actions-test-helper";

test.describe("Scheduled Actions", () => {
  // No request mocking. Use real backend like other e2e suites.

  test("create expense action and see it in list", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    const startDate = await helper.createExpenseAction({
      description: "Morning coffee subscription",
      amount: "9.99",
    });
    await helper.gotoListPage();
    await helper.expectActionCardVisible({
      description: "Morning coffee subscription",
      containsText: "Add Expense",
    });
    // Verify meta: default frequency daily and next date equals chosen start date
    await helper.expectActionCardMeta({
      description: "Morning coffee subscription",
      frequency: "daily",
      typeText: "Add Expense",
      nextDate: startDate,
    });
  });

  test("create budget action and see it in list", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    const startDate = await helper.createBudgetAction({
      description: "Monthly house credit",
      amount: "200",
    });
    await helper.gotoListPage();
    await helper.expectActionCardVisible({
      description: "Monthly house credit",
      containsText: "Add to Budget",
    });
    await helper.expectActionCardMeta({
      description: "Monthly house credit",
      frequency: "daily",
      typeText: "Add to Budget",
      nextDate: startDate,
    });
  });

  test("edit an action's frequency and amount", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    await helper.createExpenseAction({ description: "Gym membership", amount: 50 });
    await helper.openEditForAction("Gym membership");
    await helper.changeFrequencyWeekly();
    await helper.changeExpenseAmount(55);
    await helper.submitAndConfirmSuccess();

    await helper.gotoListPage();
    await helper.expectActionCardVisible({ description: "Gym membership", containsText: "WEEKLY" });
  });

  test("toggle action active/inactive from list", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    await helper.createExpenseAction({ description: "Toggle me", amount: 5 });
    await helper.gotoListPage();
    // Initially active: status dot is green, button should say Deactivate
    const card = authenticatedPage.page
      .locator(".settings-card")
      .filter({ hasText: "Toggle me" })
      .first();
    await expect(card).toBeVisible();

    // Click the toggle button to deactivate
    const actionId = await helper.getActionIdFromCard("Toggle me");
    const toggleBtn = actionId
      ? authenticatedPage.page.locator(`[data-test-id="sa-toggle-${actionId}"]`)
      : card.locator('[data-test-id^="sa-toggle-"]').first();
    await toggleBtn.click();

    // After toggle, the button aria-label should flip to Activate action
    await expect(toggleBtn).toHaveAttribute("aria-label", /Activate action/i);

    // Toggle back to active and expect aria-label to flip to Deactivate action
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-label", /Deactivate action/i);
  });

  test("delete flow: cancel then confirm", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    await helper.createExpenseAction({ description: "To be deleted", amount: 10 });
    await helper.deleteAction("To be deleted", { confirm: false });
    await helper.deleteAction("To be deleted", { confirm: true });
  });

  test("validation: submit disabled on invalid fields and split mismatch", async ({ authenticatedPage }) => {
    await authenticatedPage.page.goto("/scheduled-actions/new");

    // Expense mode
    await authenticatedPage.page.getByTestId("sa-action-expense").click();
    await authenticatedPage.page.getByTestId("sa-exp-description").fill("a"); // too short
    await authenticatedPage.page.getByTestId("sa-exp-amount").fill("0"); // not positive

    // Try to change one split to break total = 100
    const anySplit = authenticatedPage.page.locator('[data-test-id^="sa-exp-split-"]').first();
    if (await anySplit.count()) {
      await anySplit.fill("10");
    }

    await expect(authenticatedPage.page.getByTestId("sa-submit")).toBeDisabled();

    // Fix inputs to valid
    await authenticatedPage.page.getByTestId("sa-exp-description").fill("Valid desc");
    await authenticatedPage.page.getByTestId("sa-exp-amount").fill("1");
  });

  test("history page and run details navigation (UI only)", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    await helper.createExpenseAction({ description: "Has history", amount: 5 });
    await helper.openHistoryForAction("Has history");

    // Also navigate to a made-up run details id to ensure page renders gracefully
    const actionId = (await helper.getActionIdFromCard("Has history")) || "noid";
    await authenticatedPage.page.goto(
      `/scheduled-actions/history/run/hist_${actionId}-2024-01-01`,
    );
    await expect(
      authenticatedPage.page.getByTestId("sa-history-run"),
    ).toBeVisible();
  });

  test("history page shows upcoming date and allows skip and custom next date", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    await helper.createExpenseAction({ description: "Skip me", amount: 5 });
    await helper.openHistoryForAction("Skip me");

    // Capture current upcoming date
    const upcomingText = await authenticatedPage.page
      .locator('[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")')
      .textContent();
    const currentMatch = (upcomingText || '').match(/Next:\s*(\d{4}-\d{2}-\d{2})/);
    const currentNext = currentMatch ? currentMatch[1] : undefined;

    // Click skip next
    await authenticatedPage.page.getByTestId('sa-skip-next').click();
    await authenticatedPage.page.waitForTimeout(300); // allow re-render

    // Expect next date to change
    const upcomingText2 = await authenticatedPage.page
      .locator('[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")')
      .textContent();
    const newMatch = (upcomingText2 || '').match(/Next:\s*(\d{4}-\d{2}-\d{2})/);
    const newNext = newMatch ? newMatch[1] : undefined;
    expect(newNext).not.toBe(currentNext);

    // Set custom next date = today + 5 days for determinism in CI window
    const plusDays = (days: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().split('T')[0];
    };
    const customDate = plusDays(5);
    await authenticatedPage.page.getByTestId('sa-custom-next-date-input').fill(customDate);
    await authenticatedPage.page.getByTestId('sa-set-custom-next').click();
    await authenticatedPage.page.waitForTimeout(200);

    const upcomingText3 = await authenticatedPage.page
      .locator('[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")')
      .textContent();
    expect(upcomingText3).toContain(`Next: ${customDate}`);
  });

  test("run now from history triggers immediate run", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    await helper.createExpenseAction({ description: "Run Now", amount: 3 });
    await helper.openHistoryForAction("Run Now");

    // Capture current upcoming date
    const beforeText = await authenticatedPage.page
      .locator('[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")')
      .textContent();
    const beforeMatch = (beforeText || '').match(/Next:\s*(\d{4}-\d{2}-\d{2})/);
    const beforeNext = beforeMatch ? beforeMatch[1] : undefined;

    // Run now
    const btn = authenticatedPage.page.getByTestId("sa-run-now");
    await btn.click();

    // Wait briefly and refresh the page to pick up new nextExecutionDate
    await authenticatedPage.page.waitForTimeout(5000);
    await authenticatedPage.page.reload();

    const afterText = await authenticatedPage.page
      .locator('[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")')
      .textContent();
    const afterMatch = (afterText || '').match(/Next:\s*(\d{4}-\d{2}-\d{2})/);
    const afterNext = afterMatch ? afterMatch[1] : undefined;

    expect(afterNext).toBeTruthy();
    expect(afterNext).not.toBe(beforeNext);
  });

  test("new action defaults match group defaults", async ({ authenticatedPage }) => {
    const helper = new ScheduledActionsTestHelper(authenticatedPage);
    const expectedPercentages = await getCurrentUserPercentages(authenticatedPage);
    const expectedCurrency = await getCurrentCurrencyFromSettings(authenticatedPage);

    await helper.gotoNewActionPage();

    // Verify default currency
    await expect(
      authenticatedPage.page.locator('[data-test-id="sa-exp-currency"]'),
    ).toHaveValue(expectedCurrency);

    // Verify default paidBy is the highest share user
    const [topUserId] = Object.entries(expectedPercentages)
      .map(([uid, pct]) => [uid, parseFloat(pct) || 0] as const)
      .sort((a, b) => b[1] - a[1])[0];
    await expect(
      authenticatedPage.page.locator('[data-test-id="sa-exp-paid-by"]'),
    ).toHaveValue(String(topUserId));

    // Verify split inputs per user
    for (const [uid, pct] of Object.entries(expectedPercentages)) {
      await expect(
        authenticatedPage.page.locator(`[data-test-id="sa-exp-split-${uid}"]`),
      ).toHaveValue(String(pct));
    }
  });
});


