import { expect, factories, skipIfRemoteBackend, test } from "../fixtures/setup";

const backend = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

test.describe("Shared bills", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("create a bill, view its due date, and record payment", async ({ authedPage: page }) => {
		const date = new Date().toISOString().slice(0, 10);
		const month = date.slice(0, 7);
		await page.goto(`/bills?month=${month}`);
		await expect(page.getByTestId("bills-page").getByRole("heading", { name: "Shared bills" })).toBeVisible();
		await page.getByRole("button", { name: "Add bill" }).click();
		const form = page.getByRole("form", { name: "Add bill" });
		await form.getByLabel("Bill name").fill("Electricity");
		await form.getByLabel("Amount").fill("68.50");
		await form.getByLabel("First due date").fill(date);
		await form.getByLabel("Repeat").selectOption("monthly");
		await form.getByRole("button", { name: "Add bill" }).click();
		await expect(form).toBeHidden();
		const due = page.getByRole("heading", { name: "Due this month" }).locator("xpath=following-sibling::div[1]");
		await expect(due).toContainText("Electricity");
		await expect(due).toContainText("68.50");
		const summary = page.locator('section[aria-label$=" summary"]');
		await expect(summary).toContainText("68.50 due");
		await due.getByRole("button", { name: "Mark paid" }).click();
		const payment = page.getByRole("dialog", { name: "Record bill payment" });
		await expect(payment.getByRole("radio", { name: /Mark paid only/ })).toBeChecked();
		await expect(payment.getByRole("radio", { name: /Create an expense/ })).toBeVisible();
		await payment.getByRole("button", { name: "Record payment" }).click();
		await expect(due).toContainText("Paid");
		await expect(summary).toContainText("0.00 due");
		await due.getByRole("button", { name: "Mark pending" }).click();
		await expect(due).toContainText("Pending");
	});

	test("record payment with an expense and optional budget debit", async ({ authedPage: page }, testInfo) => {
		const date = new Date().toISOString().slice(0, 10);
		await page.goto(`/bills?month=${date.slice(0, 7)}`);
		await page.getByRole("button", { name: "Add bill" }).click();
		const form = page.getByRole("form", { name: "Add bill" });
		await form.getByLabel("Bill name").fill("Water bill");
		await form.getByLabel("Amount").fill("32.00");
		await form.getByLabel("First due date").fill(date);
		await form.getByRole("button", { name: "Add bill" }).click();
		const due = page.getByRole("heading", { name: "Due this month" }).locator("xpath=following-sibling::div[1]");
		await due.getByRole("button", { name: "Mark paid" }).click();
		const payment = page.getByRole("dialog", { name: "Record bill payment" });
		await payment.getByRole("radio", { name: /Create an expense/ }).check();
		await expect(payment.getByLabel("Budget debit (optional)")).toBeVisible();
		if (process.env.CAPTURE_BILL_PREVIEWS) {
			await page.screenshot({ path: `docs/previews/bill-payment-${testInfo.project.name === "chromium" ? "desktop" : "mobile"}.png`, fullPage: true });
		}
		await payment.getByRole("button", { name: "Record payment and expense" }).click();
		await expect(due).toContainText("Paid");
		await expect(due).toContainText("Linked expense:");
	});

	test("pick monthly actions with different first dates and explain payment behavior", async ({ page, seed }, testInfo) => {
		const result = await seed({ users: [factories.user({ alias: "u" })], groups: [factories.group({ alias: "g", members: ["u"], budgets: [{ alias: "b", name: "House" }] })], authenticate: ["u"] });
		const userId = result.ids.users.u.id;
		const cookie = result.sessions.u.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
		const headers = { "Content-Type": "application/json", Cookie: cookie };
		const groupResponse = await fetch(`${backend}/.netlify/functions/group/details`, { headers });
		const group = await groupResponse.json() as { budgets: Array<{ id: string }> };
		const now = new Date();
		const targetMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
		const date = targetMonth.toISOString().slice(0, 10);
		const expenseStartDate = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
		for (const action of [
			{ actionType: "add_expense", startDate: expenseStartDate, actionData: { amount: 30, description: "Monthly phone expense", currency: "GBP", paidByUserId: userId, splitPctShares: { [userId]: 100 } } },
			{ actionType: "add_budget", startDate: date, actionData: { amount: 20, description: "Monthly house credit", currency: "GBP", budgetId: group.budgets[0].id, type: "Credit" } },
		]) {
			const response = await fetch(`${backend}/.netlify/functions/scheduled-actions`, { method: "POST", headers, body: JSON.stringify({ ...action, frequency: "monthly" }) });
			expect(response.status).toBe(201);
		}
		await page.goto(`/bills?month=${date.slice(0, 7)}`);
		await page.getByRole("button", { name: "Add bill" }).click();
		const form = page.getByRole("form", { name: "Add bill" });
		await form.getByLabel("Bill name").fill("Phone bill");
		await form.getByLabel("Amount", { exact: true }).fill("50.00");
		await form.getByLabel("First due date").fill(date);
		await form.getByLabel("Currency").selectOption("GBP");
		await form.getByRole("searchbox", { name: "Search scheduled expense (optional)" }).fill("phone");
		await form.getByRole("radio", { name: /Monthly phone expense/ }).check();
		await expect(form).toContainText("Differs from bill: amount");
		await form.getByRole("searchbox", { name: "Search scheduled budget (optional)" }).fill("house");
		await form.getByRole("radio", { name: /Monthly house credit/ }).check();
		await expect(form).toContainText("Credit · 20 GBP");
		await expect(form).toContainText("linked only on dates when both actions run");
		if (process.env.CAPTURE_BILL_PREVIEWS) await page.screenshot({ path: `docs/previews/bill-action-pickers-${testInfo.project.name === "chromium" ? "desktop" : "mobile"}.png`, fullPage: true });
		await form.getByRole("button", { name: "Add bill" }).click();
		await expect(form).toBeHidden();
		const due = page.getByRole("heading", { name: "Due this month" }).locator("xpath=following-sibling::div[1]");
		await due.getByRole("button", { name: "Mark paid" }).click();
		const payment = page.getByRole("dialog", { name: "Record bill payment" });
		await expect(payment).toContainText("scheduled expense runs on this date");
		await expect(payment).toContainText("scheduled Credit action");
		await expect(payment.getByRole("radio", { name: /Create an expense/ })).toBeDisabled();
		await expect(payment.getByLabel("Budget debit (optional)")).toHaveCount(0);
	});
});
