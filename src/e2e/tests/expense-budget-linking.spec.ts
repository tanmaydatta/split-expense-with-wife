import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	test,
	expect,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

/**
 * Set firstName on seeded users so the Dashboard's DashboardUserSchema
 * validation passes (firstName must be at least 1 char) and paid-by labels render.
 */
async function setFirstNames(
	result: SeedResponse,
	aliases: string[],
): Promise<void> {
	for (const alias of aliases) {
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
}

/**
 * Set group defaultShare so the dashboard form has a known split.
 */
async function setDefaultShare(
	result: SeedResponse,
	groupAlias: string,
	authedAlias: string,
	defaultShare: Record<string, number>,
): Promise<void> {
	const session = result.sessions[authedAlias];
	if (!session) return;
	const cookieHeader = session.cookies
		.map((c) => `${c.name}=${c.value}`)
		.join("; ");
	const groupId = result.ids.groups[groupAlias]?.id;
	if (!groupId) return;
	await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: cookieHeader },
		body: JSON.stringify({ groupId, metadata: { defaultShare } }),
	});
}

test.describe("Expense-Budget Linking", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("dashboard form submits ONE /dashboard_submit request and shows 🔗 on both lists", async ({
		seed,
		page,
	}) => {
		// Use a single user to avoid the 2-user defaultShare complexity.
		// Single user = 100% split, no defaultShare needed, simpler validation path.
		const result = await seed({
			users: [factories.user({ alias: "u1" })],
			groups: [
				factories.group({
					alias: "g",
					members: ["u1"],
					budgets: [{ alias: "b", name: "Food" }],
				}),
			],
			authenticate: ["u1"],
		});

		await setFirstNames(result, ["u1"]);

		await page.goto("/");

		// Collect all API requests to netlify functions
		const dashboardCalls: string[] = [];
		page.on("request", (req) => {
			const url = req.url();
			if (url.includes("/dashboard_submit")) {
				dashboardCalls.push(url);
			}
		});

		// Wait for the paid-by select to be visible: means form+session data are loaded
		await page.waitForSelector('[data-test-id="paid-by-select"]', {
			timeout: 20000,
		});

		// Both checkboxes default to checked; ensure they are
		const addExpenseCheckbox = page.locator(
			'[data-test-id="add-expense-checkbox"]',
		);
		const updateBudgetCheckbox = page.locator(
			'[data-test-id="update-budget-checkbox"]',
		);
		if (!(await addExpenseCheckbox.isChecked())) {
			await addExpenseCheckbox.check();
		}
		if (!(await updateBudgetCheckbox.isChecked())) {
			await updateBudgetCheckbox.check();
		}

		// Wait for the budget radio to appear (it shows only when updateBudget=true)
		await page.waitForSelector('[data-test-id="budget-radio-Food"]', {
			timeout: 10000,
		});

		// Fill the form
		const description = `LinkedExpense-${Date.now()}`;
		await page.fill('[data-test-id="description-input"]', description);
		await page.fill('[data-test-id="amount-input"]', "50");
		await page.selectOption('[data-test-id="currency-select"]', "GBP");

		// Select budget category "Food" (it may already be selected by default)
		await page.click('[data-test-id="budget-radio-Food"]');

		// Select Debit (may already be selected by default)
		const debitRadio = page.locator('[data-test-id="debit-radio"]');
		if (await debitRadio.isVisible()) {
			await debitRadio.click();
		}

		// Submit the form
		await page.click('[data-test-id="submit-button"]');

		// Wait for success
		await page.waitForSelector('[data-test-id="success-container"]', {
			timeout: 20000,
		});

		// Assert exactly ONE /dashboard_submit was made
		expect(dashboardCalls).toHaveLength(1);
		expect(dashboardCalls[0]).toContain("/dashboard_submit");

		// Navigate to /expenses and assert linked icon is visible
		await page.goto("/expenses");
		await page.waitForSelector('[data-test-id="expenses-container"]', {
			timeout: 10000,
		});
		await page.waitForTimeout(1000);

		// The new transaction row should show the linked icon
		const linkedIconInExpenses = page.locator(
			'[data-test-id="transaction-linked-icon"]',
		);
		await expect(linkedIconInExpenses.first()).toBeVisible({ timeout: 10000 });

		// Navigate to /budget and assert linked icon is visible
		await page.goto("/budget");
		await page.waitForSelector('[data-test-id="budget-container"]', {
			timeout: 10000,
		});
		await page.waitForTimeout(1500);

		const linkedIconInBudget = page.locator(
			'[data-test-id="budget-entry-linked-icon"]',
		);
		await expect(linkedIconInBudget.first()).toBeVisible({ timeout: 10000 });
	});

	test("clicking 'View budget entry →' navigates to /budget-entry/:id", async ({
		seed,
		page,
	}) => {
		const result = await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [
				factories.group({
					alias: "g",
					members: ["u", "u2"],
					budgets: [{ alias: "b", name: "Groceries" }],
				}),
			],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 80,
					currency: "GBP",
					description: "Supermarket linked",
				}),
			],
			budgetEntries: [
				factories.budgetEntry({
					alias: "be",
					group: "g",
					budget: "b",
					amount: 80,
					currency: "GBP",
					description: "Supermarket linked",
				}),
			],
			expenseBudgetLinks: [{ transaction: "t", budgetEntry: "be" }],
			authenticate: ["u"],
		});

		await setFirstNames(result, ["u"]);

		const transactionId = result.ids.transactions.t.id;
		const budgetEntryId = result.ids.budgetEntries.be.id;

		await page.goto(`/transaction/${transactionId}`);

		// Wait for the transaction detail to load
		await page.waitForSelector('[data-test-id="transaction-detail-page"]', {
			timeout: 10000,
		});

		// The linked budget entry section should be visible
		await expect(
			page.locator('[data-test-id="transaction-card-linked-budget"]'),
		).toBeVisible({ timeout: 10000 });

		// Click the "View budget entry →" link
		await page.click('[data-test-id="view-linked-budget-entry"]');

		// Assert navigation to /budget-entry/:id
		await expect(page).toHaveURL(`/budget-entry/${budgetEntryId}`, {
			timeout: 10000,
		});

		// Assert the budget entry card shows the linked transaction section
		await expect(
			page.locator('[data-test-id="budget-entry-card-linked-transaction"]'),
		).toBeVisible({ timeout: 10000 });
	});

	test("deleting a linked transaction cascades and both lists no longer show the entries", async ({
		seed,
		page,
	}) => {
		const result = await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [
				factories.group({
					alias: "g",
					members: ["u", "u2"],
					budgets: [{ alias: "b", name: "Bills" }],
				}),
			],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u",
					splitAcross: ["u", "u2"],
					amount: 200,
					currency: "GBP",
					description: "ToDelete",
				}),
			],
			budgetEntries: [
				factories.budgetEntry({
					alias: "be",
					group: "g",
					budget: "b",
					amount: 200,
					currency: "GBP",
					description: "ToDelete",
				}),
			],
			expenseBudgetLinks: [{ transaction: "t", budgetEntry: "be" }],
			authenticate: ["u"],
		});

		await setFirstNames(result, ["u"]);

		const transactionId = result.ids.transactions.t.id;

		// Go to root first to initialize session in Redux (ensures routing works)
		await page.goto("/");
		await page.waitForSelector('[data-test-id="dashboard-container"]', {
			timeout: 15000,
		});

		// Navigate to the transaction detail page
		await page.goto(`/transaction/${transactionId}`);
		await page.waitForSelector('[data-test-id="transaction-detail-page"]', {
			timeout: 10000,
		});

		// Click the delete button on the transaction detail page
		await page.click('[data-test-id="delete"]');

		// Wait for redirect to /expenses
		await expect(page).toHaveURL("/expenses", { timeout: 10000 });

		// Verify "ToDelete" is not present in expenses list
		await page.waitForSelector('[data-test-id="expenses-container"]', {
			timeout: 10000,
		});
		await page.waitForTimeout(1000);
		await expect(page.getByText("ToDelete")).not.toBeVisible();

		// Navigate to /budget and verify "ToDelete" is not shown in active entries
		await page.goto("/budget");
		await page.waitForSelector('[data-test-id="budget-container"]', {
			timeout: 10000,
		});
		await page.waitForTimeout(1500);

		// The deleted budget entry should not appear (it's soft-deleted and filtered out)
		const budgetEntryItems = page.locator('[data-test-id="budget-entry-item"]');
		const count = await budgetEntryItems.count();
		for (let i = 0; i < count; i++) {
			const text = await budgetEntryItems.nth(i).textContent();
			// Items without a "Deleted" date stamp are active entries
			// We verify that no active (non-deleted) entry has "ToDelete"
			if (text && !text.includes("Deleted:")) {
				expect(text).not.toContain("ToDelete");
			}
		}
	});

	test("standalone budget entry shows no 🔗 icon", async ({ seed, page }) => {
		await seed({
			users: [factories.user({ alias: "u" }), factories.user({ alias: "u2" })],
			groups: [
				factories.group({
					alias: "g",
					members: ["u", "u2"],
					budgets: [{ alias: "b", name: "Misc" }],
				}),
			],
			budgetEntries: [
				factories.budgetEntry({
					alias: "be",
					group: "g",
					budget: "b",
					amount: 30,
					currency: "GBP",
					description: "Standalone",
				}),
			],
			authenticate: ["u"],
		});

		// Go to root first to ensure session+group data is loaded into Redux
		await page.goto("/");
		await page.waitForSelector('[data-test-id="dashboard-container"]', {
			timeout: 15000,
		});

		// Then navigate to budget page
		await page.goto("/budget");
		await page.waitForSelector('[data-test-id="budget-container"]', {
			timeout: 10000,
		});

		// Wait for the budget history to load (at least one row must appear)
		const budgetEntryItems = page.locator('[data-test-id="budget-entry-item"]');
		await expect(budgetEntryItems.first()).toBeVisible({ timeout: 10000 });

		const count = await budgetEntryItems.count();
		expect(count).toBeGreaterThan(0);

		let foundStandaloneRow = false;
		for (let i = 0; i < count; i++) {
			const row = budgetEntryItems.nth(i);
			const text = await row.textContent();
			if (text?.includes("Standalone")) {
				foundStandaloneRow = true;
				// The linked icon should NOT be present in this row
				const linkedIcon = row.locator('[data-test-id="budget-entry-linked-icon"]');
				await expect(linkedIcon).toHaveCount(0);
				break;
			}
		}

		expect(foundStandaloneRow).toBe(true);
	});
});
