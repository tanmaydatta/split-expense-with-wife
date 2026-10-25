import { test, expect } from "@playwright/test";
import path from "node:path";
const owner = {
	id: "owner",
	firstName: "Alex",
	lastName: "Example",
	email: "alex@example.test",
	groupid: "home",
};
const budgets = [
	{ id: "food", budgetName: "Food", description: null },
	{ id: "house", budgetName: "Household", description: null },
];
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
		currencies: ["GBP", "EUR"],
		group: {
			groupid: "home",
			groupName: "Home",
			budgets,
			metadata: { defaultCurrency: "GBP", defaultShare: { owner: 100 } },
		},
	},
};
test("rename budgets with validation, cancel, retry and immediate labels", async ({
	page,
}, info) => {
	let renamed = false,
		fail = false;
	const requests: unknown[] = [];
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url()),
			p = url.pathname;
		let data: unknown;
		if (p.includes("/auth/get-session")) data = session;
		else if (p.includes("/.netlify/functions/")) {
			if (p.endsWith("/budget/rename")) {
				requests.push(route.request().postDataJSON());
				if (fail) {
					fail = false;
					await route.fulfill({
						status: 500,
						contentType: "application/json",
						body: JSON.stringify({
							error: "Could not save budget name",
							statusCode: 500,
						}),
					});
					return;
				}
				renamed = true;
				data = { ...budgets[0], budgetName: "Groceries" };
			} else if (p.endsWith("/budget_list")) {
				const house = route.request().postDataJSON().budgetId === "house";
				data = [
					{
						id: house ? "house-transfer" : "weekly-shop",
						budgetId: house ? "house" : "food",
						name: house ? "Household" : renamed ? "Groceries" : "Food",
						description: house
							? "Monthly allocation"
							: "Weekly supermarket shop",
						amount: house ? 25 : -42.5,
						price: house ? "+25.00" : "-42.50",
						currency: "GBP",
						addedTime: "2026-01-15 00:00:00",
						...(house
							? {
									transfer: {
										id: "pair",
										role: "destination",
										otherBudgetId: "food",
										otherBudgetName: "Food",
										otherBudgetArchived: false,
										otherEntryId: "source",
									},
								}
							: {}),
					},
				];
			} else if (p.endsWith("/budget_total"))
				data = [
					{
						currency: "GBP",
						amount:
							route.request().postDataJSON().budgetId === "house" ? 225 : 157.5,
					},
				];
			else if (p.endsWith("/categories"))
				data = { enabled: true, categories: [], rules: [] };
			else if (p.endsWith("/category-jobs")) data = { job: null };
			else data = {};
		}
		if (data !== undefined)
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify(data),
			});
		else if (url.origin === "http://127.0.0.1:4326") await route.continue();
		else await route.abort();
	});
	await page.goto("/budget?budget=house");
	await expect(
		page.getByText(/Internal transfer from Food/).filter({ visible: true }),
	).toBeVisible();
	await page.getByRole("radio", { name: "Food", exact: true }).click();
	await expect(page.locator(".budget-card").first()).toContainText("£157.50");
	await page
		.getByRole("button", { name: "Actions for Food", exact: true })
		.click();
	await page.screenshot({
		path: `docs/previews/budget-rename/${info.project.name}-menu.png`,
		animations: "disabled",
	});
	await page
		.getByRole("button", { name: "Rename budget", exact: true })
		.click();
	const dialog = page.getByRole("dialog", { name: "Rename budget" }),
		name = dialog.getByLabel("Budget name", { exact: true }),
		save = dialog.getByRole("button", { name: "Save", exact: true });
	await expect(name).toHaveValue("Food");
	await page.screenshot({
		path: `docs/previews/budget-rename/${info.project.name}-dialog.png`,
		animations: "disabled",
	});
	await name.fill("Cancelled");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	expect(requests).toHaveLength(0);
	await expect(
		page.getByRole("button", { name: "Actions for Food", exact: true }),
	).toBeFocused();
	await page
		.getByRole("button", { name: "Actions for Food", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Rename budget", exact: true })
		.click();
	await name.fill("   ");
	await save.click();
	await expect(dialog.getByRole("alert")).toContainText("empty");
	expect(requests).toHaveLength(0);
	await name.fill("Household");
	await save.click();
	await expect(dialog.getByRole("alert")).toContainText("already");
	expect(requests).toHaveLength(0);
	await name.fill("Groceries");
	fail = true;
	await save.click();
	await expect(dialog.getByRole("alert")).toContainText("Could not save");
	await expect(name).toHaveValue("Groceries");
	await page.screenshot({
		path: `docs/previews/budget-rename/${info.project.name}-error.png`,
		animations: "disabled",
	});
	await name.fill("  Groceries  ");
	await save.click();
	await expect(dialog).toHaveCount(0);
	expect(renamed).toBe(true);
	expect(requests.at(-1)).toEqual({
		budgetId: "food",
		budgetName: "Groceries",
	});
	await expect(
		page.getByRole("radio", { name: "Groceries", exact: true }),
	).toHaveAttribute("aria-checked", "true");
	await expect(
		page.getByRole("radio", { name: "Food", exact: true }),
	).toHaveCount(0);
	await page
		.getByRole("button", { name: "Transfer between budgets", exact: true })
		.click();
	await expect(page.getByLabel("From budget")).toContainText("Groceries");
	await page
		.getByRole("button", { name: "Transfer between budgets", exact: true })
		.click();
	await expect(page.locator(".budget-card").first()).toContainText("£157.50");
	await expect(
		page
			.getByText("Weekly supermarket shop", { exact: true })
			.filter({ visible: true }),
	).toBeVisible();
	await page.screenshot({
		path: `docs/previews/budget-rename/${info.project.name}-renamed.png`,
		animations: "disabled",
		fullPage: info.project.name === "mobile",
	});
	await page.getByRole("radio", { name: "Household", exact: true }).click();
	await expect(
		page
			.getByText(/Internal transfer from Groceries/)
			.filter({ visible: true }),
	).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > innerWidth,
		),
	).toBe(false);
});
