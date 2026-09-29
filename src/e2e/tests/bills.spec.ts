import { expect, skipIfRemoteBackend, test } from "../fixtures/setup";

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
});
