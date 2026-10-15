import { test, expect } from "@playwright/test";
import path from "node:path";
const owner = {
	id: "owner",
	firstName: "Alex",
	lastName: "Example",
	email: "alex@example.test",
	groupid: "home",
};
const session = {
	user: { ...owner, name: "Alex Example", emailVerified: true },
	session: {
		id: "synthetic",
		userId: "owner",
		token: "synthetic",
		expiresAt: "2099-01-01T00:00:00Z",
	},
	extra: {
		currentUser: owner,
		usersById: { owner },
		group: {
			groupid: "home",
			groupName: "Home",
			budgets: [{ id: "household", name: "Household", budgetName: "Household" }],
			metadata: { defaultCurrency: "GBP", defaultShare: { owner: 100 } },
		},
	},
};
const categories = [
	{ id: "groceries", name: "Groceries", slug: "groceries" },
	{ id: "legacy", name: "Shared household and community activities", archivedAt: "2025-01-01" },
];
const entries = [
	{
		id: "groceries-entry",
		description: "Weekly groceries",
		price: "-42.00",
		amount: -42,
		categoryId: "groceries",
		categoryName: "Groceries",
	},
	{
		id: "clear-entry",
		description: "Budget adjustment",
		price: "+20.00",
		amount: 20,
		categoryId: null,
		categoryName: null,
		categorySource: "manual",
	},
	{
		id: "custom-entry",
		description: "Community event supplies",
		price: "-15.00",
		amount: -15,
		categoryId: "legacy",
		categoryName: categories[1].name,
	},
].map((entry) => ({
	...entry,
	name: "Household",
	currency: "GBP",
	addedTime: "2026-10-12",
	groupid: "home",
	categoryVersion: 1,
}));
test("loaded budget categories show icons and names without opening details", async ({
	page,
}, testInfo) => {
	let taxonomyReads = 0,
		detailReads = 0;
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url()),
			p = url.pathname;
		let data: unknown;
		if (p.includes("/auth/get-session")) data = session;
		else if (p.includes("/.netlify/functions/")) {
			if (p.endsWith("/categories")) {
				taxonomyReads++;
				data = { enabled: true, categories, rules: [] };
			} else if (p.endsWith("/budget_list")) data = entries;
			else if (p.endsWith("/budget_total")) data = [{ currency: "GBP", amount: 263 }];
			else if (p.endsWith("/category-jobs")) data = { job: null };
			else if (p.endsWith("/budget_entry_get")) {
				detailReads++;
				data = { budgetEntry: entries[0] };
			} else data = {};
		}
		if (data !== undefined)
			await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
		else if (url.origin === new URL(testInfo.project.use.baseURL as string).origin)
			await route.continue();
		else await route.abort();
	});
	await page.goto("/budget");
	const mobile = testInfo.project.name.toLowerCase().includes("mobile");
	const scope = page.getByTestId(mobile ? "mobile-cards" : "desktop-table");
	for (const name of ["Groceries", "Uncategorised", categories[1].name])
		await expect(
			scope.locator(".category-badge-label").getByText(name, { exact: true }),
		).toBeVisible();
	await expect(scope.locator(".category-badge-icon").filter({ hasText: "🛒" })).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(scope.locator(".category-badge-icon").filter({ hasText: "❔" })).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(scope.locator(".category-badge-icon").filter({ hasText: "🏷" })).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(scope.getByText("Weekly groceries", { exact: true })).toBeVisible();
	if (!mobile) {
		const typography = await scope.locator(".budget-table-entry-description").first().evaluate((el) => {
			const description = getComputedStyle(el), cell = getComputedStyle(el.parentElement!);
			return { description: [description.fontSize, description.color], cell: [cell.fontSize, cell.color] };
		});
		expect(typography.description).toEqual(typography.cell);
	}
	expect(detailReads).toBe(0);
	expect(taxonomyReads).toBe(1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	await scope.scrollIntoViewIfNeeded();
	const file = path.join(
		"docs/previews/budget-category-badges",
		`${mobile ? "mobile" : "desktop"}-loaded-categories.png`,
	);
	await page.screenshot({ path: file });
	await testInfo.attach("Loaded budget category icons and names", {
		path: file,
		contentType: "image/png",
	});
});
