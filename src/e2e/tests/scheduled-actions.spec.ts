import type { Page } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	expect,
	factories,
	skipIfRemoteBackend,
	test,
} from "../fixtures/setup";
import {
	getCurrentCurrencyFromSettings,
	getCurrentUserPercentages,
} from "../utils/expense-test-helper";
import { ScheduledActionsTestHelper } from "../utils/scheduled-actions-test-helper";
import { TestHelper, getCITimeout } from "../utils/test-utils";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

/**
 * Seed a single-user group, set a non-empty firstName on the user, and
 * persist a `defaultShare` so the scheduled-actions form has 100% pre-filled
 * for that user.
 *
 * Two seed-handler quirks make this fix-up necessary:
 * 1. Users are created with `firstName: ""`, but the Dashboard form's
 *    `DashboardUserSchema` requires `firstName.min(1)`.
 * 2. Groups are created without a `defaultShare`. The scheduled-actions
 *    form does NOT fall back to 100/n the way the Dashboard form does, so
 *    splits stay at 0% and the Submit button is disabled.
 */
async function seedSingleUserAuthedPage(
	seed: SeedFn,
	page: Page,
): Promise<SeedResponse> {
	const result = await seed({
		users: [factories.user({ alias: "u1" })],
		groups: [factories.group({ alias: "g", members: ["u1"] })],
		authenticate: ["u1"],
	});
	const session = result.sessions.u1;
	if (session) {
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: "u1" }),
		});
		const u1Id = result.ids.users.u1.id;
		const groupId = result.ids.groups.g.id;
		await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				groupid: groupId,
				defaultShare: { [u1Id]: 100 },
			}),
		});
	}
	await page.goto("/");
	return result;
}

/**
 * Seed a two-user group with non-empty firstNames and a 50/50 defaultShare.
 * Used by the "new action defaults match group defaults" test, which reads
 * per-user percentages from the Settings page and asserts they match what
 * the scheduled-actions form pre-fills.
 */
async function seedTwoUserAuthedPage(
	seed: SeedFn,
	page: Page,
): Promise<SeedResponse> {
	const result = await seed({
		users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
		groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
		authenticate: ["u1", "u2"],
	});
	for (const alias of ["u1", "u2"] as const) {
		const session = result.sessions[alias];
		if (!session) continue;
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: alias }),
		});
	}
	const u1Session = result.sessions.u1;
	if (u1Session) {
		const cookieHeader = u1Session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		const u1Id = result.ids.users.u1.id;
		const u2Id = result.ids.users.u2.id;
		const groupId = result.ids.groups.g.id;
		await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				groupid: groupId,
				defaultShare: { [u1Id]: 50, [u2Id]: 50 },
			}),
		});
	}
	await page.goto("/");
	return result;
}

test.describe("Scheduled Actions", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("create expense action and see it in list", async ({ seed, page }) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
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

	test("create budget action and see it in list", async ({ seed, page }) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
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

	test("edit an action's frequency and amount", async ({ seed, page }) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
		await helper.createExpenseAction({
			description: "Gym membership",
			amount: 50,
		});
		await helper.openEditForAction("Gym membership");
		await helper.changeFrequencyWeekly();
		await helper.changeExpenseAmount(55);
		await helper.submitAndConfirmSuccess();

		await helper.gotoListPage();
		await helper.expectActionCardVisible({
			description: "Gym membership",
			containsText: "WEEKLY",
		});
	});

	test("toggle action active/inactive from list", async ({ seed, page }) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
		await helper.createExpenseAction({ description: "Toggle me", amount: 5 });
		await helper.gotoListPage();
		// Initially active: status dot is green, button should say Deactivate
		const card = page
			.locator(".settings-card")
			.filter({ hasText: "Toggle me" })
			.first();
		await expect(card).toBeVisible();

		// Click the toggle button to deactivate
		const actionId = await helper.getActionIdFromCard("Toggle me");
		const toggleBtn = actionId
			? page.locator(`[data-test-id="sa-toggle-${actionId}"]`)
			: card.locator('[data-test-id^="sa-toggle-"]').first();
		await toggleBtn.click();

		// After toggle, the button aria-label should flip to Activate action
		await expect(toggleBtn).toHaveAttribute(
			"aria-label",
			/Activate action/i,
		);

		// Toggle back to active and expect aria-label to flip to Deactivate action
		await toggleBtn.click();
		await expect(toggleBtn).toHaveAttribute(
			"aria-label",
			/Deactivate action/i,
		);
	});

	test("delete flow: cancel then confirm", async ({ seed, page }) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
		await helper.createExpenseAction({
			description: "To be deleted",
			amount: 10,
		});
		await helper.deleteAction("To be deleted", { confirm: false });
		await helper.deleteAction("To be deleted", { confirm: true });
	});

	test("validation: submit disabled on invalid fields and split mismatch", async ({
		seed,
		page,
	}) => {
		await seedSingleUserAuthedPage(seed, page);
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

	test("history page and run details navigation (UI only)", async ({
		seed,
		page,
	}) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
		await helper.createExpenseAction({
			description: "Has history",
			amount: 5,
		});
		await helper.openHistoryForAction("Has history");

		// Also navigate to a made-up run details id to ensure page renders gracefully
		const actionId = (await helper.getActionIdFromCard("Has history")) || "noid";
		await page.goto(
			`/scheduled-actions/history/run/hist_${actionId}-2024-01-01`,
		);
		await expect(page.getByTestId("sa-history-run")).toBeVisible();
	});

	test("history page shows upcoming date and allows skip and custom next date", async ({
		seed,
		page,
	}) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
		await helper.createExpenseAction({ description: "Skip me", amount: 5 });
		await helper.openHistoryForAction("Skip me");

		// Capture current upcoming date
		const upcomingText = await page
			.locator(
				'[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")',
			)
			.textContent();
		const currentMatch = (upcomingText || "").match(
			/Next:\s*(\d{4}-\d{2}-\d{2})/,
		);
		const currentNext = currentMatch ? currentMatch[1] : undefined;

		// Click skip next
		await page.getByTestId("sa-skip-next").click();
		await page.waitForTimeout(getCITimeout(2000)); // allow re-render

		// Expect next date to change
		const upcomingText2 = await page
			.locator(
				'[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")',
			)
			.textContent();
		const newMatch = (upcomingText2 || "").match(
			/Next:\s*(\d{4}-\d{2}-\d{2})/,
		);
		const newNext = newMatch ? newMatch[1] : undefined;
		expect(newNext).not.toBe(currentNext);

		// Set custom next date = today + 5 days for determinism in CI window
		const plusDays = (days: number) => {
			const d = new Date();
			d.setUTCDate(d.getUTCDate() + days);
			return d.toISOString().split("T")[0];
		};
		const customDate = plusDays(5);
		await page.getByTestId("sa-custom-next-date-input").fill(customDate);
		await page.getByTestId("sa-set-custom-next").click();
		await page.waitForTimeout(getCITimeout(2000));

		const upcomingText3 = await page
			.locator(
				'[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")',
			)
			.textContent();
		expect(upcomingText3).toContain(`Next: ${customDate}`);
	});

	// TODO(fixtures-pilot): The freshly-created action has its
	// nextExecutionDate already advanced once (start=today, daily → today+1).
	// Run Now then triggers the Workflow with `now = new Date(triggerDate)`,
	// which `wrangler dev` parses in the host's LOCAL timezone (BST/EDT/etc.).
	// In any TZ west of UTC the resulting "today" inside the workflow stays at
	// startDate, and the recomputed next date doesn't advance — so the
	// `afterNext !== beforeNext` assertion flakes locally. The deployed worker
	// runs in UTC, so this test is reliable against the remote backend only.
	// Re-enable when either (a) the workflow's `now` is constructed with an
	// explicit UTC parse, or (b) the seed handler exposes scheduledActions and
	// we can pre-create an action whose nextExecutionDate is already today.
	test.skip("run now from history triggers immediate run", async ({
		seed,
		page,
	}) => {
		await seedSingleUserAuthedPage(seed, page);
		const helper = new ScheduledActionsTestHelper(new TestHelper(page));
		await helper.createExpenseAction({ description: "Run Now", amount: 3 });
		await helper.openHistoryForAction("Run Now");

		// Capture current upcoming date
		const beforeText = await page
			.locator(
				'[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")',
			)
			.textContent();
		const beforeMatch = (beforeText || "").match(
			/Next:\s*(\d{4}-\d{2}-\d{2})/,
		);
		const beforeNext = beforeMatch ? beforeMatch[1] : undefined;

		// Run now
		const btn = page.getByTestId("sa-run-now");
		await btn.click();

		// Wait briefly and refresh the page to pick up new nextExecutionDate
		await page.waitForTimeout(getCITimeout(5000));
		await page.reload();
		await page.waitForTimeout(getCITimeout(2000));
		const afterText = await page
			.locator(
				'[data-test-id="sa-history"] .settings-card:has-text("Upcoming run")',
			)
			.textContent();
		const afterMatch = (afterText || "").match(
			/Next:\s*(\d{4}-\d{2}-\d{2})/,
		);
		const afterNext = afterMatch ? afterMatch[1] : undefined;

		expect(afterNext).toBeTruthy();
		expect(afterNext).not.toBe(beforeNext);
	});

	test("new action defaults match group defaults", async ({ seed, page }) => {
		// Use 2-user seeded group so per-user percentage inputs are rendered on
		// the Settings page. With a single user, getCurrentUserPercentages would
		// still work but the assertion is more meaningful with multiple users.
		await seedTwoUserAuthedPage(seed, page);
		const testHelper = new TestHelper(page);
		const helper = new ScheduledActionsTestHelper(testHelper);
		const expectedPercentages = await getCurrentUserPercentages(testHelper);
		const expectedCurrency = await getCurrentCurrencyFromSettings(testHelper);

		await helper.gotoNewActionPage();

		// Verify default currency
		await expect(
			page.locator('[data-test-id="sa-exp-currency"]'),
		).toHaveValue(expectedCurrency);

		// Verify default paidBy is the highest share user
		const [topUserId] = Object.entries(expectedPercentages)
			.map(([uid, pct]) => [uid, parseFloat(pct) || 0] as const)
			.sort((a, b) => b[1] - a[1])[0];
		await expect(
			page.locator('[data-test-id="sa-exp-paid-by"]'),
		).toHaveValue(String(topUserId));

		// Verify split inputs per user
		for (const [uid, pct] of Object.entries(expectedPercentages)) {
			await expect(
				page.locator(`[data-test-id="sa-exp-split-${uid}"]`),
			).toHaveValue(String(pct));
		}
	});
});
