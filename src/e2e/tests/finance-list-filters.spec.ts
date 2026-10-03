import {
	test,
	expect,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";
import type { Page } from "@playwright/test";

async function openFilters(page: Page) {
	const details = page.locator(".finance-filter-details");
	if ((await details.getAttribute("open")) === null)
		await details.locator("summary").press("Enter");
}
function visibleRows(page: Page, testId: string) {
	const mobileId =
		testId === "transaction-item" ? "transaction-card" : "budget-entry-card";
	return page.locator(
		`[data-test-id="${testId}"]:visible, [data-test-id="${mobileId}"]:visible`,
	);
}

test.describe("Finance list filters", () => {
	test.beforeAll(skipIfRemoteBackend);
	test("expense filters persist, reset pagination, keep draft search, and preserve details/delete", async ({
		page,
		seed,
	}, testInfo) => {
		await seed({
			users: [
				factories.user({ alias: "alex", name: "Alex" }),
				factories.user({ alias: "sam", name: "Sam" }),
			],
			groups: [
				factories.group({
					alias: "home",
					members: ["alex", "sam"],
					budgets: [{ alias: "food", name: "Food" }],
				}),
			],
			authenticate: ["alex"],
			transactions: Array.from({ length: 13 }, (_, i) =>
				factories.transaction({
					alias: `expense-${i}`,
					group: "home",
					paidBy: i === 0 ? "sam" : "alex",
					splitAcross: ["alex", "sam"],
					amount: 40 + i,
					description: i === 0 ? "Train tickets" : `Weekly groceries ${i}`,
				}),
			),
		});
		await page.goto("/expenses");
		const rows = visibleRows(page, "transaction-item");
		await expect(rows).toHaveCount(10);
		await openFilters(page);
		await page
			.getByRole("combobox", { name: "Sort by", exact: true })
			.selectOption("amount-asc");
		await expect(rows.first()).toContainText("Train tickets");
		await page.getByTestId("show-more-button").click();
		await expect(rows).toHaveCount(13);
		await rows
			.last()
			.getByRole("button", { name: /delete/i })
			.click();
		await expect(rows).toHaveCount(12);
		await openFilters(page);
		await page
			.getByRole("combobox", { name: "Direction", exact: true })
			.selectOption("owe");
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText("Train tickets");
		await page.reload();
		await expect(rows).toHaveCount(1);
		await openFilters(page);
		await expect(
			page.getByRole("combobox", { name: "Direction", exact: true }),
		).toHaveValue("owe");
		await page.getByTestId("search-input").fill("Train");
		await page
			.getByRole("combobox", { name: "Currency", exact: true })
			.selectOption("GBP");
		await expect(page).toHaveURL(/q=Train/);
		await expect(page.getByTestId("search-input")).toHaveValue("Train");
		await expect(rows).toHaveCount(1);
		await page.getByTestId("clear-all-filters").click();
		await expect(rows).toHaveCount(10);
		await expect(page).toHaveURL("/expenses");
		await page.goBack();
		await expect(page).toHaveURL(/q=Train/);
		await expect(rows).toHaveCount(1);
		await page.goForward();
		await expect(rows).toHaveCount(10);
		await openFilters(page);
		await page
			.getByRole("combobox", { name: "Direction", exact: true })
			.selectOption("owe");
		await expect(rows).toHaveCount(1);
		await rows.first().click();
		await expect(
			page.locator('[data-test-id="full-description"]:visible'),
		).toContainText("Train tickets");
		await rows
			.first()
			.getByRole("button", { name: /delete/i })
			.click();
		await expect(page.getByTestId("search-empty-state")).toContainText(
			"No expenses match",
		);
		await page.getByRole("button", { name: "Clear all filters" }).click();
		await expect(rows).toHaveCount(10);
		await openFilters(page);
		await page
			.getByRole("combobox", { name: "Currency", exact: true })
			.selectOption("GBP");
		await page
			.getByRole("combobox", { name: "Direction", exact: true })
			.selectOption("owed");
		await page.getByLabel("Total amount minimum").fill("40");
		await expect(rows).toHaveCount(10);
		if (testInfo.project.name === "chromium")
			await page.setViewportSize({ width: 1280, height: 1150 });
		const successClose = page.getByRole("button", {
			name: "Close success message",
		});
		if (await successClose.isVisible()) await successClose.click();
		await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
		if (testInfo.project.name !== "chromium")
			await page
				.locator(".finance-filters")
				.evaluate((element) => element.scrollIntoView({ block: "start" }));
		const fits = await page.locator(".finance-filter-grid").evaluate((grid) => {
			const bounds = grid.getBoundingClientRect();
			return Array.from(grid.querySelectorAll("input, select")).every(
				(input) => {
					const box = input.getBoundingClientRect();
					return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
				},
			);
		});
		expect(fits).toBe(true);
		await page.screenshot({
			path: `docs/images/expense-list-filters-${testInfo.project.name === "chromium" ? "desktop" : "mobile"}.png`,
			fullPage: true,
		});
	});
	test("budget filters retain category and lifetime total across date/magnitude filtering", async ({
		page,
		seed,
	}, testInfo) => {
		await seed({
			users: [factories.user({ alias: "alex", name: "Alex" })],
			groups: [
				factories.group({
					alias: "home",
					members: ["alex"],
					budgets: [
						{ alias: "food", name: "Food" },
						{ alias: "travel", name: "Travel" },
					],
				}),
			],
			authenticate: ["alex"],
			budgetEntries: [
				...Array.from({ length: 13 }, (_, i) =>
					factories.budgetEntry({
						alias: `debit-${i}`,
						group: "home",
						budget: "food",
						amount: -40 - i,
						description: `Weekly groceries ${i}`,
						addedTime: "2024-02-29 23:59:59",
					}),
				),
				factories.budgetEntry({
					alias: "credit",
					group: "home",
					budget: "food",
					amount: 500,
					description: "Monthly allowance",
					addedTime: "2024-02-29 00:00:00",
				}),
				factories.budgetEntry({
					alias: "travel",
					group: "home",
					budget: "travel",
					amount: -50,
					description: "Train tickets",
					addedTime: "2024-02-29 00:00:00",
				}),
			],
		});
		await page.goto("/budget");
		const rows = visibleRows(page, "budget-entry-item");
		await expect(rows).toHaveCount(5);
		await page.getByRole("button", { name: "Show more", exact: true }).click();
		await expect(rows).toHaveCount(10);
		// Delay a real Worker pagination response, then leave and revisit its filters.
		let releasePage!: () => void;
		let paginationArrived!: () => void;
		const release = new Promise<void>((resolve) => {
			releasePage = resolve;
		});
		const arrived = new Promise<void>((resolve) => {
			paginationArrived = resolve;
		});
		await page.route("**/budget_list", async (route) => {
			if (route.request().postDataJSON().offset !== 10) return route.continue();
			const response = await route.fetch();
			paginationArrived();
			await release;
			await route.fulfill({ response });
		});
		await page.getByRole("button", { name: "Show more", exact: true }).click();
		await arrived;
		await openFilters(page);
		await page
			.getByRole("combobox", { name: "Direction", exact: true })
			.selectOption("debit");
		await expect(rows).toHaveCount(5);
		await page.getByTestId("clear-all-filters").click();
		await expect(rows).toHaveCount(5);
		releasePage();
		await expect(
			page.getByRole("button", { name: "Show more", exact: true }),
		).toBeEnabled();
		await expect(rows).toHaveCount(5);
		await page.unroute("**/budget_list");
		const lifetime = await page.locator(".budget-card").textContent();
		await openFilters(page);
		await page
			.getByRole("combobox", { name: "Direction", exact: true })
			.selectOption("debit");
		await expect(rows).toHaveCount(5);
		await page.getByTestId("clear-all-filters").click();
		await expect(rows).toHaveCount(5);
		await page.getByRole("button", { name: "Show more", exact: true }).click();
		await expect(rows).toHaveCount(10);
		await page.getByRole("button", { name: "Show more", exact: true }).click();
		await expect(rows).toHaveCount(14);
		await page
			.getByRole("combobox", { name: "Direction", exact: true })
			.selectOption("debit");
		await expect(rows).toHaveCount(5);
		await page
			.getByLabel("Date from (UTC)", { exact: true })
			.fill(new Date().toISOString().slice(0, 10));
		await page
			.getByLabel("Date to (UTC)", { exact: true })
			.fill(new Date().toISOString().slice(0, 10));
		await page.getByLabel("Total amount minimum").fill("45");
		await page.getByLabel("Total amount maximum").fill("47");
		await expect(rows).toHaveCount(3);
		await expect(page.locator(".budget-card")).toHaveText(lifetime ?? "");
		await page
			.getByRole("combobox", { name: "Currency", exact: true })
			.selectOption("GBP");
		await page.reload();
		await expect(rows).toHaveCount(3);
		await openFilters(page);
		if (testInfo.project.name === "chromium")
			await page.setViewportSize({ width: 1280, height: 1150 });
		const successClose = page.getByRole("button", {
			name: "Close success message",
		});
		if (await successClose.isVisible()) await successClose.click();
		await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
		if (testInfo.project.name !== "chromium")
			await page
				.locator(".finance-filters")
				.evaluate((element) => element.scrollIntoView({ block: "start" }));
		const fits = await page.locator(".finance-filter-grid").evaluate((grid) => {
			const bounds = grid.getBoundingClientRect();
			return Array.from(grid.querySelectorAll("input, select")).every(
				(input) => {
					const box = input.getBoundingClientRect();
					return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
				},
			);
		});
		expect(fits).toBe(true);
		await page.screenshot({
			path: `docs/images/budget-list-filters-${testInfo.project.name === "chromium" ? "desktop" : "mobile"}.png`,
			fullPage: true,
		});
		await page.getByTestId("clear-all-filters").click();
		await expect(page).toHaveURL("/budget");
		await expect(rows).toHaveCount(5);
		await page.getByRole("radio", { name: "Travel", exact: true }).click();
		await expect(rows).toHaveCount(1);
		await page.reload();
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText("Train tickets");
		if (testInfo.project.name !== "chromium") {
			await rows.first().getByRole("link").click();
			await expect(page).toHaveURL(/budget-entry/);
			await page.goBack();
		} else await rows.first().click();
		await rows
			.first()
			.getByRole("button", { name: /delete/i })
			.click();
		await expect(rows).toHaveCount(0);
	});
});
