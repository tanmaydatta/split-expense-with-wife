import {
	test,
	expect,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

test.describe("Unified Transactions Ledger", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("shows one Tesco linked row, standalone funding, one transfer row, and redirects /expenses", async ({
		seed,
		page,
	}) => {
		const result = await seed({
			users: [factories.user({ alias: "u1" })],
			groups: [
				factories.group({
					alias: "g",
					members: ["u1"],
					budgets: [
						{ alias: "b_house", name: "House" },
						{ alias: "b_food", name: "Food" },
					],
				}),
			],
			authenticate: ["u1"],
		});

		const userSession = result.sessions.u1;
		const cookieHeader = userSession?.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");

		const groupRes = await fetch(`${BACKEND_URL}/.netlify/functions/group/details`, {
			headers: { Cookie: cookieHeader },
		});
		const groupData = (await groupRes.json()) as { budgets: Array<{ id: string; budgetName: string }> };
		const houseBudgetId = groupData.budgets.find((b) => b.budgetName === "House")?.id || groupData.budgets[0].id;
		const foodBudgetId = groupData.budgets.find((b) => b.budgetName === "Food")?.id || groupData.budgets[1].id;

		// 1. Create a linked Tesco purchase via dashboard_submit
		await fetch(`${BACKEND_URL}/.netlify/functions/dashboard_submit`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				expense: {
					amount: 47.83,
					description: "Tesco Groceries",
					currency: "GBP",
					paidByShares: { [result.ids.users.u1.id]: 47.83 },
					splitPctShares: { [result.ids.users.u1.id]: 100 },
				},
				budget: {
					amount: 47.83,
					description: "Tesco Groceries",
					currency: "GBP",
					budgetId: houseBudgetId,
				},
			}),
		});

		// 2. Create standalone budget funding
		await fetch(`${BACKEND_URL}/.netlify/functions/budget`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				amount: 500.0,
				description: "Monthly House Funding",
				currency: "GBP",
				budgetId: houseBudgetId,
				groupid: result.ids.groups.g.id,
			}),
		});

		// 3. Create a paired budget transfer
		await fetch(`${BACKEND_URL}/.netlify/functions/budget-transfer`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				requestId: `transfer-e2e-${Date.now()}`,
				sourceBudgetId: houseBudgetId,
				destinationBudgetId: foodBudgetId,
				amount: 100.0,
				currency: "GBP",
				date: "2026-03-01",
				note: "House to Food transfer",
			}),
		});

		// 4. Test legacy /expenses redirect
		await page.goto("/expenses?q=Tesco");
		await expect(page).toHaveURL(/\/transactions\?q=Tesco/);

		// Navigate to canonical /transactions
		await page.goto("/transactions");
		await expect(page.getByRole("heading", { name: "Transactions" }).first()).toBeVisible();

		// Verify exactly 3 canonical rows exist:
		// - "Tesco Groceries" (linked purchase, should appear ONCE)
		// - "Monthly House Funding" (budget funding, should appear ONCE)
		// - "House to Food transfer" (paired transfer, should appear ONCE)
		const tescoRows = page.locator('[data-test-id="ledger-row-purchase"]');
		await expect(tescoRows).toHaveCount(1);
		await expect(tescoRows.first()).toContainText("Tesco Groceries");
		await expect(tescoRows.first()).toContainText("47.83");

		const fundingRows = page.locator('[data-test-id="ledger-row-budget_adjustment"]');
		await expect(fundingRows).toHaveCount(1);
		await expect(fundingRows.first()).toContainText("Monthly House Funding");
		await expect(fundingRows.first()).toContainText("500.00");

		const transferRows = page.locator('[data-test-id="ledger-row-transfer"]');
		await expect(transferRows).toHaveCount(1);
		await expect(transferRows.first()).toContainText("House to Food transfer");
		await expect(transferRows.first()).toContainText("100.00");

		// Click to expand Tesco row and verify detail section shows without duplicating siblings
		await tescoRows.first().click();
		await expect(page.locator('[data-test-id="ledger-row-details"]')).toBeVisible();
	});
});
