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
test("create, review counterpart and delete a transfer pair", async ({
	page,
}, info) => {
	let created = false,
		deleted = false;
	const requests: unknown[] = [];
	const entry = (role: "source" | "destination") => ({
		id: `pair_${role}`,
		budgetId: role === "source" ? "food" : "house",
		name: role === "source" ? "Food" : "Household",
		description: "Monthly allocation",
		amount: role === "source" ? -125.5 : 125.5,
		price: role === "source" ? "-125.50" : "+125.50",
		currency: "GBP",
		addedTime: "2026-01-15 00:00:00",
		groupid: "home",
		transfer: {
			id: "pair",
			role,
			otherBudgetId: role === "source" ? "house" : "food",
			otherBudgetName: role === "source" ? "Household" : "Food",
			otherBudgetArchived: false,
			otherEntryId: role === "source" ? "pair_destination" : "pair_source",
		},
	});
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url()),
			p = url.pathname;
		let data: unknown;
		if (p.includes("/auth/get-session")) data = session;
		else if (p.includes("/.netlify/functions/")) {
			if (p.endsWith("/budget-transfer")) {
				requests.push(route.request().postDataJSON());
				created = true;
				data = {
					message: "Transfer recorded",
					transferId: "pair",
					sourceEntryId: "pair_source",
					destinationEntryId: "pair_destination",
					deleted: false,
				};
			} else if (p.endsWith("/budget_delete")) {
				expect(route.request().postDataJSON().confirmTransferDeletion).toBe(
					true,
				);
				deleted = true;
				data = { message: "Transfer deleted from both budgets" };
			} else if (p.endsWith("/budget_list")) {
				const body = route.request().postDataJSON();
				data =
					created && !deleted
						? [entry(body.budgetId === "food" ? "source" : "destination")]
						: [];
			} else if (p.endsWith("/budget_total"))
				data = [
					{
						currency: "GBP",
						amount:
							created && !deleted
								? route.request().postDataJSON().budgetId === "food"
									? -125.5
									: 125.5
								: 0,
					},
				];
			else if (p.endsWith("/budget_entry_get")) {
				data = {
					budgetEntry: entry(
						route.request().postDataJSON().id === "pair_source"
							? "source"
							: "destination",
					),
				};
			} else if (p.endsWith("/categories"))
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
	const mobile = info.project.name === "mobile",
		dir = "docs/previews/budget-transfers",
		prefix = mobile ? "mobile" : "desktop";
	await page.goto("/budget?budget=house");
	await page
		.getByTestId("budget-selection-group")
		.getByText("Food", { exact: true })
		.click();
	await page
		.getByRole("button", { name: "Transfer between budgets", exact: true })
		.click();
	await page.getByLabel("To budget").selectOption("house");
	await page.getByLabel("Amount", { exact: true }).fill("125.50");
	await page.getByLabel("Date (UTC)").fill("2026-01-15");
	await page.getByLabel("Note (optional)").fill("Monthly allocation");
	if (mobile) await page.setViewportSize({ width: 390, height: 1400 });
	await page.locator(".budget-transfer-panel").scrollIntoViewIfNeeded();
	if (mobile)
		await page
			.locator(".budget-transfer-panel")
			.screenshot({ path: path.join(dir, `${prefix}-form.png`) });
	else
		await page.screenshot({
			path: path.join(dir, `${prefix}-form.png`),
			fullPage: true,
		});
	if (mobile) await page.setViewportSize({ width: 390, height: 844 });
	await page
		.getByRole("button", { name: "Record transfer", exact: true })
		.click();
	await expect(
		page.getByText("Transfer recorded", { exact: true }),
	).toBeVisible();
	expect(requests).toHaveLength(1);
	expect(requests[0]).toMatchObject({
		sourceBudgetId: "food",
		destinationBudgetId: "house",
		amount: 125.5,
		currency: "GBP",
		date: "2026-01-15",
		note: "Monthly allocation",
	});
	await expect(page.getByLabel("Amount", { exact: true })).toBeDisabled();
	await expect(page.locator(".budget-card").first()).toContainText("-£125.50");
	await page
		.getByRole("button", { name: "Transfer between budgets", exact: true })
		.click();
	const scope = page.getByTestId(mobile ? "mobile-cards" : "desktop-table");
	await expect(scope.getByText(/Internal transfer to Household/)).toBeVisible();
	await expect(scope.getByText("Uncategorised", { exact: true })).toHaveCount(
		0,
	);
	await scope.scrollIntoViewIfNeeded();
	await page.screenshot({ path: path.join(dir, `${prefix}-entries.png`) });

	// Inspect the counterpart link through SPA navigation, retaining both primed budget caches.
	if (mobile) {
		await scope.getByTestId("budget-entry-link").click();
	} else {
		await scope.getByText("Monthly allocation", { exact: true }).click();
	}
	await expect(
		page.getByRole("link", { name: "View entry in Household →" }),
	).toHaveAttribute("href", "/budget-entry/pair_destination");
	if (mobile) await page.getByTestId("back-link").click();
	await page
		.getByTestId("budget-selection-group")
		.getByText("Household", { exact: true })
		.click();
	await expect(scope.getByText(/Internal transfer from Food/)).toBeVisible();
	if (mobile) {
		const card = scope.locator(".budget-entry-card").first();
		const label = await card.locator(".budget-transfer-label").boundingBox();
		const trash = await card
			.getByRole("button", { name: "Delete budget entry" })
			.boundingBox();
		expect(label!.x + label!.width).toBeLessThan(trash!.x);
		await card.screenshot({ path: path.join(dir, "mobile-destination.png") });
	}

	await expect(page.locator(".budget-card").first()).toContainText("+£125.50");
	await scope
		.getByRole("button", { name: "Delete budget entry", exact: true })
		.click();
	await expect(page.getByRole("alertdialog")).toContainText(
		"both transfer entries",
	);
	await expect(page.getByRole("alertdialog")).toContainText("Food");
	await page.screenshot({ path: path.join(dir, `${prefix}-delete.png`) });
	await page
		.getByRole("button", { name: "Delete both entries", exact: true })
		.click();
	await expect(scope.getByText(/Internal transfer/)).toHaveCount(0);
	await expect(page.locator(".budget-card").first()).toContainText("£0.00");
	await page
		.getByTestId("budget-selection-group")
		.getByText("Food", { exact: true })
		.click();
	await expect(scope.getByText(/Internal transfer/)).toHaveCount(0);
	await expect(page.locator(".budget-card").first()).toContainText("£0.00");

	expect(deleted).toBe(true);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > innerWidth,
		),
	).toBe(false);
});
