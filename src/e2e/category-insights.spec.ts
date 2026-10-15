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
			budgets: [
				{ id: "food", budgetName: "Food" },
				{ id: "house", budgetName: "Household" },
			],
			metadata: { defaultCurrency: "GBP", defaultShare: { owner: 100 } },
		},
	},
};
const categories = [
	{ id: "groceries", name: "Groceries", slug: "groceries" },
	{ id: "health", name: "Health", slug: "health" },
	{ id: "eating", name: "Eating out", slug: "eating_out" },
	{ id: "transfer", name: "Household movements", excludeFromInsights: true },
	{ id: "empty", name: "Archived travel", archivedAt: "2020-01-01" },
];
const ledger = [
	["2026-01", "food", "groceries", -140],
	["2026-02", "food", "groceries", -130],
	["2026-03", "house", "groceries", -150],
	["2026-01", "house", "eating", -50],
	["2026-02", "house", "eating", -50],
	["2026-03", "house", "eating", -50],
	["2026-01", "food", "health", -30],
	["2026-02", "food", "health", -30],
	["2026-03", "food", "health", -30],
	["2026-01", "house", null, -20],
	["2026-03", "house", null, -20],
	["2026-01", "food", null, 500],
	["2026-02", "house", null, 200],
	["2026-01", "food", "transfer", -500],
	["2026-01", "food", "transfer", 500],
] as const;
function fixture(input: any) {
	const currency = input.currency ?? "GBP",
		factor = currency === "EUR" ? 0.1 : 1;
	const selected = ledger.filter(
		(row) =>
			(!input.budgetId || row[1] === input.budgetId) &&
			`${row[0]}-10` >= input.dateFrom &&
			`${row[0]}-10` <= input.dateTo,
	);
	const excluded = selected.filter(
		(row) =>
			row[2] === "transfer" ||
			(input.excludedCategoryIds ?? []).includes(row[2] ?? "uncategorised"),
	);
	const included = selected.filter((row) => !excluded.includes(row));
	const sum = (rows: readonly (typeof ledger)[number][]) => {
		const spending = rows.reduce((sum, row) => sum + (row[3] < 0 ? -row[3] * factor : 0), 0),
			credits = rows.reduce((sum, row) => sum + (row[3] > 0 ? row[3] * factor : 0), 0);
		return { count: rows.length, spending, credits, net: credits - spending };
	};
	const totals = sum(included),
		buckets = Array.from(new Set(included.map((row) => row[2])))
			.map((id) => {
				const rows = included.filter((row) => row[2] === id),
					summary = sum(rows);
				return {
					id,
					name: categories.find((c) => c.id === id)?.name ?? "Uncategorised",
					...summary,
					percentage: totals.spending ? (summary.spending / totals.spending) * 100 : 0,
					budgets: Array.from(new Set(rows.map((row) => row[1]))).map((budget) => ({
						id: budget,
						name: budget === "food" ? "Food" : "Household",
						...sum(rows.filter((row) => row[1] === budget)),
					})),
				};
			})
			.sort((a, b) => b.spending - a.spending);
	return {
		dateFrom: input.dateFrom,
		dateTo: input.dateTo,
		budgetId: input.budgetId ?? null,
		currency,
		currencies: ["EUR", "GBP"],
		...totals,
		excluded: {
			...sum(excluded),
			categories: Array.from(
				new Set(
					excluded.map((row) => categories.find((c) => c.id === row[2])?.name ?? "Uncategorised"),
				),
			),
		},
		categories: buckets,
		months: ["2026-01", "2026-02", "2026-03"].map((month) => ({
			month,
			spending: sum(included.filter((row) => row[0] === month)).spending,
			categories: Object.fromEntries(
				buckets.map((bucket) => [
					bucket.id ?? "uncategorised",
					sum(included.filter((row) => row[0] === month && row[2] === bucket.id)).spending,
				]),
			),
		})),
	};
}
async function setup(page: import("@playwright/test").Page, error = false) {
	const requests: { path: string; body: any; method: string }[] = [];
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url()),
			p = url.pathname;
		let data: unknown,
			status = 200;
		if (p.includes("/auth/get-session")) data = session;
		else if (p.includes("/.netlify/functions/")) {
			const body = route.request().postDataJSON();
			requests.push({ path: p, body, method: route.request().method() });
			if (p.endsWith("/category-insights")) {
 expect(body.source).toBe("budget");
				data = error
					? {
							error:
								"More than 5,000 budget entries in this range. Choose a shorter date range or one budget.",
							statusCode: 422,
						}
					: fixture(body);
				status = error ? 422 : 200;
			} else if (p.endsWith("/categories")) data = { enabled: true, categories, rules: [] };
			else if (p.endsWith("/budget_list")) data = [];
			else if (p.endsWith("/budget_total")) data = [{ currency: "GBP", amount: 0 }];
			else if (p.endsWith("/category-jobs")) data = { job: null };
			else data = {};
		}
		if (data !== undefined)
			await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
		else if (url.origin === "http://127.0.0.1:4326") await route.continue();
		else await route.abort();
	});
	return requests;
}
async function frame(
	page: import("@playwright/test").Page,
	locator: import("@playwright/test").Locator,
) {
	await locator.evaluate((el) => {
		el.scrollIntoView({ block: "start" });
		for (let p = el.parentElement; p; p = p.parentElement) {
			if (p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY === "auto") {
				p.scrollTop -= 96;
				break;
			}
		}
	});
}
const rangeUrl = "/category-insights?dateFrom=2026-01-01&dateTo=2026-03-31&currency=GBP";
test("budget-only charts and truthful All/per-budget drilldown", async ({ page }, info) => {
	const requests = await setup(page);
	await page.goto(rangeUrl);
	await expect(page.getByRole("heading", { name: "Spending by category" })).toBeVisible();
	await expect(page.getByText("60.0%", { exact: true })).toBeVisible();
	await expect(page.locator(".insights-totals")).toContainText("£700.00");
	await expect(page.getByRole("heading", { name: "Net budget movement" })).toBeVisible();
	await expect(page.getByText("2 budget entries excluded: Household movements")).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	await page.screenshot({
		path: `docs/previews/category-insights/${info.project.name}-overview.png`,
	});
	if (info.project.name === "mobile") {
		await frame(page, page.getByRole("heading", { name: "Spending by category" }));
		await page.screenshot({ path: "docs/previews/category-insights/mobile-breakdown.png" });
	}
	await page.getByText("Monthly spending totals", { exact: true }).scrollIntoViewIfNeeded();
	await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
	const offset = await page
		.locator(".insights-legend li")
		.first()
		.evaluate((el) => {
			const swatch = el.querySelector(".insights-legend-swatch")!.getBoundingClientRect(),
				text = el.querySelector(".insights-legend-text")!.getBoundingClientRect();
			return Math.abs((swatch.top + swatch.bottom - text.top - text.bottom) / 2);
		});
	expect(offset).toBeLessThan(2);
	await page.screenshot({
		path: `docs/previews/category-insights/${info.project.name}-monthly.png`,
	});
	const grocery = page.locator(".insights-category").filter({ hasText: "Groceries" });
	await grocery.getByText("View budget entries", { exact: true }).click();
	await grocery.getByRole("link", { name: /^Food/ }).click();
	await expect(page).toHaveURL(
		/\/budget\?budget=food&categoryId=groceries&dateFrom=2026-01-01&dateTo=2026-03-31&currency=GBP/,
	);
	await expect
		.poll(() => requests.find((r) => r.path.endsWith("/budget_list"))?.body)
		.toMatchObject({
			budgetId: "food",
			categoryId: "groceries",
			dateFrom: "2026-01-01",
			dateTo: "2026-03-31",
			currency: "GBP",
		});
	expect(requests.some((r) => r.path.endsWith("/transactions_list"))).toBe(false);
	await page.goBack();
	await page.getByLabel("Budget scope").selectOption("food");
	await expect(page.locator(".insights-scope")).toHaveText("Scope: Food");
	await expect(page.locator(".insights-totals")).toContainText("£360.00");
	await expect(
		page.locator(".insights-breakdown").getByRole("link", { name: "Groceries", exact: true }),
	).toHaveAttribute("href", /budget=food&categoryId=groceries/);
});
test("temporary exclusions Apply/Reset stay in the URL and never write Settings", async ({
	page,
}, info) => {
	const requests = await setup(page);
	await page.goto(rangeUrl);
	await page.getByText("Temporary category exclusions (0 applied)", { exact: true }).click();
	const check = page.getByRole("checkbox", { name: "Groceries", exact: true });
	await check.check();
	const before = requests.filter((r) => r.path.endsWith("/category-insights")).length;
	await expect(page.locator(".insights-totals")).toContainText("£700.00");
	expect(requests.filter((r) => r.path.endsWith("/category-insights"))).toHaveLength(before);
	await page.getByRole("button", { name: "Apply exclusions" }).click();
	await expect(page).toHaveURL(/exclude=groceries/);
	await expect(page.locator(".insights-totals")).toContainText("£280.00");
	await expect(check).toBeChecked();
	await expect(page.getByRole("checkbox", { name: /Archived travel/ })).toBeVisible();
	await expect(page.getByRole("checkbox", { name: /Household movements/ })).toBeChecked();
	await expect(page.getByRole("checkbox", { name: /Household movements/ })).toBeDisabled();
	await frame(page, page.getByText("Temporary category exclusions (1 applied)", { exact: true }));
	await page.screenshot({
		path: `docs/previews/category-insights/${info.project.name}-filters.png`,
	});
	await page.reload();
	await page.getByText("Temporary category exclusions (1 applied)", { exact: true }).click();
	await expect(check).toBeChecked();
	await page.getByRole("button", { name: "Reset temporary exclusions" }).click();
	await expect(page).not.toHaveURL(/exclude=/);
	await expect(page.locator(".insights-totals")).toContainText("£700.00");
	await expect(page.getByRole("checkbox", { name: /Household movements/ })).toBeChecked();
	expect(requests.some((r) => r.path.endsWith("/categories") && r.method === "POST")).toBe(false);
});
test("rolling presets retain scope/filters and date editing waits for Apply", async ({ page }) => {
	const requests = await setup(page);
	await page.goto(rangeUrl + "&budget=food&exclude=empty");
	const today = new Date().toISOString().slice(0, 10),
		start = new Date(`${today}T00:00:00Z`);
	start.setUTCDate(start.getUTCDate() - 6);
	await page.getByLabel("Period", { exact: true }).selectOption("last7");
	await expect
		.poll(() => requests.filter((r) => r.path.endsWith("/category-insights")).at(-1)?.body)
		.toMatchObject({
			dateFrom: start.toISOString().slice(0, 10),
			dateTo: today,
			budgetId: "food",
			excludedCategoryIds: ["empty"],
		});
	const before = requests.filter((r) => r.path.endsWith("/category-insights")).length;
	await page.getByLabel("Date from (UTC)").fill("2026-01-01");
	expect(requests.filter((r) => r.path.endsWith("/category-insights"))).toHaveLength(before);
	await page.getByRole("button", { name: "Apply dates" }).click();
	await expect(page.getByLabel("Period", { exact: true })).toHaveValue("custom");
	await expect(page).toHaveURL(/budget=food/);
	await expect(page).toHaveURL(/exclude=empty/);
});
test("budget cap errors show no partial totals", async ({ page }) => {
	await setup(page, true);
	await page.goto(rangeUrl);
	await expect(page.getByRole("alert")).toContainText("More than 5,000 budget entries");
	await expect(page.getByRole("heading", { name: "Spending by category" })).toHaveCount(0);
});
