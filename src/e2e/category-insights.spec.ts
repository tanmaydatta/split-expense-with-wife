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
	{ id: "health", name: "Health", slug: "health" },
	{ id: "eating", name: "Eating out", slug: "eating_out" },
];
function fixture(currency = "GBP") {
	const euro = currency === "EUR",
		factor = euro ? 0.1 : 1;
	return {
		excluded: {
			count: 2,
			spending: 500 * factor,
			negativeAdjustments: -25 * factor,
			net: 475 * factor,
			categories: ["Household movements"],
		},
		dateFrom: "2026-01-01",
		dateTo: "2026-03-31",
		currency,
		currencies: ["EUR", "GBP"],
		count: 12,
		spending: 700 * factor,
		negativeAdjustments: -30 * factor,
		net: 670 * factor,
		categories: [
			{
				id: "groceries",
				name: "Groceries",
				spending: 420 * factor,
				negativeAdjustments: -30 * factor,
				percentage: 60,
				count: 6,
			},
			{
				id: "eating",
				name: "Eating out",
				spending: 150 * factor,
				negativeAdjustments: 0,
				percentage: 150 / 7,
				count: 3,
			},
			{
				id: "health",
				name: "Health",
				spending: 90 * factor,
				negativeAdjustments: 0,
				percentage: 90 / 7,
				count: 2,
			},
			{
				id: null,
				name: "Uncategorised",
				spending: 40 * factor,
				negativeAdjustments: 0,
				percentage: 40 / 7,
				count: 1,
			},
		],
		months: [
			{
				month: "2026-01",
				spending: 240 * factor,
				categories: {
					groceries: 140 * factor,
					eating: 50 * factor,
					health: 30 * factor,
					uncategorised: 20 * factor,
				},
			},
			{
				month: "2026-02",
				spending: 210 * factor,
				categories: { groceries: 130 * factor, eating: 50 * factor, health: 30 * factor },
			},
			{
				month: "2026-03",
				spending: 250 * factor,
				categories: {
					groceries: 150 * factor,
					eating: 50 * factor,
					health: 30 * factor,
					uncategorised: 20 * factor,
				},
			},
		],
	};
}
async function setup(page: import("@playwright/test").Page, error = false) {
	let excluded = false;
	const requests: { path: string; body: any }[] = [];
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url()),
			p = url.pathname;
		let data: unknown,
			status = 200;
		if (p.includes("/auth/get-session")) data = session;
		else if (p.includes("/.netlify/functions/")) {
			const body = route.request().postDataJSON();
			requests.push({ path: p, body });
			if (p.endsWith("/category-insights")) {
				data = error
					? {
							error: "More than 5,000 shared expenses in this range. Choose a shorter date range.",
							statusCode: 422,
						}
					: { ...fixture(body.currency ?? "GBP"), dateFrom: body.dateFrom, dateTo: body.dateTo };
				status = error ? 422 : 200;
			} else if (p.endsWith("/categories")) {
				if (body?.action === "insight-exclusion") excluded = body.excluded;
				data = {
					enabled: true,
					categories: [
						...categories,
						{
							id: "household",
							name: "Household movements",
							archivedAt: "2026-01-01",
							excludeFromInsights: excluded,
						},
					],
					rules: [],
				};
			} else if (p.endsWith("/group/details"))
				data = {
					groupName: "Home",
					users: [{ Id: "owner", FirstName: "Alex", LastName: "Example" }],
					budgets: [],
					metadata: { defaultCurrency: "GBP", defaultShare: { owner: 100 } },
				};
			else if (p.endsWith("/transactions_list"))
				data = { transactions: [], transactionDetails: {} };
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
test("shared expense charts, currency controls and scoped category drilldown", async ({
	page,
}, info) => {
	const requests = await setup(page);
	await page.goto("/category-insights?dateFrom=2026-01-01&dateTo=2026-03-31&currency=GBP");
	await expect(page.getByRole("heading", { name: "Spending by category" })).toBeVisible();
	await expect(page.getByText("60.0%", { exact: true })).toBeVisible();
	await expect(page.getByText("2 expenses excluded: Household movements")).toBeVisible();
	await expect(page.locator(".insights-totals")).toContainText("£700.00");
	await expect(page.locator(".insights-totals")).toContainText("-£30.00");
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	const device = info.project.name;
	if (device === "mobile")
		await page
			.getByRole("main")
			.getByRole("heading", { name: "Category insights", exact: true })
			.evaluate((el) => {
				for (let parent = el.parentElement; parent; parent = parent.parentElement) {
					if (
						parent.scrollHeight > parent.clientHeight &&
						getComputedStyle(parent).overflowY === "auto"
					) {
						parent.scrollTop = 32;
						break;
					}
				}
			});
	await page.screenshot({ path: `docs/previews/category-insights/${device}-overview.png` });
	if (device === "mobile") {
		await page.getByRole("heading", { name: "Spending by category" }).evaluate((el) => {
			el.scrollIntoView({ block: "start" });
			for (let parent = el.parentElement; parent; parent = parent.parentElement) {
				if (
					parent.scrollHeight > parent.clientHeight &&
					getComputedStyle(parent).overflowY === "auto"
				) {
					parent.scrollTop -= 96;
					break;
				}
			}
		});
		await page.screenshot({ path: `docs/previews/category-insights/mobile-breakdown.png` });
	}
	await page.getByText("Monthly spending totals", { exact: true }).scrollIntoViewIfNeeded();
	await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
	const legendGeometry = await page
		.locator(".insights-legend li")
		.first()
		.evaluate((el) => {
			const swatch = el.querySelector(".insights-legend-swatch")!,
				label = el.querySelector(".insights-legend-text")!;
			const range = document.createRange();
			range.selectNodeContents(label);
			const text = range.getBoundingClientRect(),
				box = swatch.getBoundingClientRect();
			return {
				offset: Math.abs((text.top + text.bottom - box.top - box.bottom) / 2),
				anchorHeight: getComputedStyle(el.querySelector("a")!).height,
				anchorDisplay: getComputedStyle(el.querySelector("a")!).display,
				swatchTop: box.top,
				textTop: text.top,
			};
		});
	console.log("legend computed geometry", JSON.stringify(legendGeometry));
	expect(legendGeometry.offset).toBeLessThan(2);

	await page.screenshot({ path: `docs/previews/category-insights/${device}-monthly.png` });
	await page.getByText("Monthly spending totals", { exact: true }).click();
	await expect(page.locator(".insights-month-detail").first()).toContainText("Groceries");
	await expect(page.locator(".insights-month-detail").first()).toContainText("£140.00");
	await page
		.locator(".insights-breakdown")
		.getByRole("link", { name: /^Groceries/ })
		.click();
	await expect(page).toHaveURL(
		/\/expenses\?categoryId=groceries&dateFrom=2026-01-01&dateTo=2026-03-31&currency=GBP/,
	);
	await expect
		.poll(() => requests.find((r) => r.path.endsWith("/transactions_list"))?.body)
		.toMatchObject({
			categoryId: "groceries",
			dateFrom: "2026-01-01",
			dateTo: "2026-03-31",
			currency: "GBP",
		});
	await page.goBack();
	await page.getByLabel("Currency", { exact: true }).selectOption("EUR");
	await expect(page.locator(".insights-totals")).toContainText("€70.00");
	await expect(page.locator(".insights-totals")).not.toContainText("£700.00");
	const beforeDates = requests.filter((r) => r.path.endsWith("/category-insights")).length;
	await page.getByLabel("Date from (UTC)").fill("2026-02-01");
	expect(requests.filter((r) => r.path.endsWith("/category-insights"))).toHaveLength(beforeDates);
	await page.getByRole("button", { name: "Apply dates" }).click();
	await expect
		.poll(() => requests.filter((r) => r.path.endsWith("/category-insights")).at(-1)?.body)
		.toMatchObject({ dateFrom: "2026-02-01", dateTo: "2026-03-31", currency: "EUR" });
});
test("quick presets apply rolling UTC dates while Custom keeps editable dates", async ({
	page,
}) => {
	const requests = await setup(page);
	await page.goto("/category-insights");
	const today = new Date(),
		end = today.toISOString().slice(0, 10);
	const start = new Date(`${end}T00:00:00Z`);
	start.setUTCDate(start.getUTCDate() - 6);
	await page.getByLabel("Period", { exact: true }).selectOption("last7");
	await expect
		.poll(() => requests.filter((r) => r.path.endsWith("/category-insights")).at(-1)?.body)
		.toMatchObject({ dateFrom: start.toISOString().slice(0, 10), dateTo: end });
	await expect(page.getByLabel("Date from (UTC)")).toHaveValue(start.toISOString().slice(0, 10));
	await page.getByLabel("Period", { exact: true }).selectOption("custom");
	await expect(page.getByLabel("Date to (UTC)")).toHaveValue(end);
});
test("range limits show an error instead of partial financial charts", async ({ page }) => {
	await setup(page, true);
	await page.goto("/category-insights?dateFrom=2026-01-01&dateTo=2026-03-31");
	await expect(page.getByRole("alert")).toContainText("More than 5,000");
	await expect(page.getByRole("heading", { name: "Spending by category" })).toHaveCount(0);
});

test("category exclusion setting is explicit and retains archived names", async ({
	page,
}, info) => {
	const requests = await setup(page);
	await page.goto("/settings");
	const checkbox = page.getByRole("checkbox", {
		name: "Exclude Household movements from spending insights",
	});
	await expect(checkbox).not.toBeChecked();
	await checkbox.click();
	await expect(checkbox).toBeChecked();
	expect(requests.find((r) => r.body?.action === "insight-exclusion")?.body).toEqual({
		action: "insight-exclusion",
		id: "household",
		excluded: true,
	});
	await expect(page.getByText("Household movements · archived", { exact: true })).toBeVisible();
	await page.getByRole("heading", { name: "Transaction categories" }).evaluate((el) => {
		el.scrollIntoView({ block: "start" });
		for (let parent = el.parentElement; parent; parent = parent.parentElement) {
			if (
				parent.scrollHeight > parent.clientHeight &&
				getComputedStyle(parent).overflowY === "auto"
			) {
				parent.scrollTop -= 96;
				break;
			}
		}
	});
	await page.screenshot({
		path: `docs/previews/category-insights/${info.project.name}-settings.png`,
	});
});
