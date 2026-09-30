import { expect, skipIfRemoteBackend, test } from "../fixtures/setup";

test.describe("Plaid Sandbox bank review", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("shows private posted activity and requires confirmation to add an expense", async ({ authedPageWithGroupOf }) => {
		const { page } = await authedPageWithGroupOf(2);
		const createPayloads: Record<string, unknown>[] = [];
		let reviewed = false;
		await page.route("**/.netlify/functions/bank-import/**", async route => {
			const url = new URL(route.request().url());
			let payload: unknown = {};
			if (url.pathname.endsWith("/connections")) payload = { connections: [{ id: "bank_1", institutionName: "Sandbox bank", status: "connected", createdAt: "2026-09-01" }] };
			if (url.pathname.endsWith("/accounts")) payload = { accounts: [{ id: "account_1", connectionId: "bank_1", name: "Current account", mask: "1234", selected: true }] };
			if (url.pathname.endsWith("/inbox")) payload = { transactions: reviewed ? [] : [{ id: "plaid_1", connectionId: "bank_1", accountId: "account_1", accountName: "Current account", date: "2026-09-01", name: "Coffee", merchantName: "Coffee Shop", amountMinor: 1234, currency: "GBP", linkedTransactionId: null, reviewStatus: "unreviewed" }] };
			if (url.pathname.endsWith("/create-expense")) {
				createPayloads.push(route.request().postDataJSON());
				if (createPayloads.length === 1) {
					await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "A scheduled expense has the same amount near this date. Match it, or confirm Add anyway if this is a separate purchase" }) });
					return;
				}
				reviewed = true; payload = { transactionId: "tx_bank_plaid_1" };
			}
			await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
		});
		await page.goto("/bank-import");
		await expect(page.getByRole("main").getByRole("heading", { name: "Bank imports" })).toBeVisible();
		await expect(page.getByText("Coffee Shop")).toBeVisible();
		await expect(page.getByText("£12.34")).toBeVisible();
		if (process.env.CAPTURE_PLAID_PREVIEW === "1") await page.getByRole("main").screenshot({ path: `docs/previews/plaid-bank-import-${test.info().project.name.replace(/\s+/g, "-").toLowerCase()}.png` });
		await page.getByRole("button", { name: "Add shared expense" }).click();
		await expect(page.getByRole("heading", { name: "Add shared expense" })).toBeVisible();
		await expect(page.getByLabel("Add anyway if this is a separate purchase")).toBeHidden();
		await page.getByLabel("Description").fill("Coffee with partner");
		await page.getByRole("button", { name: "Confirm shared expense" }).click();
		await expect(page.getByText("A scheduled expense may already cover this charge.", { exact: false })).toBeVisible();
		await page.getByLabel("Add anyway if this is a separate purchase").check();
		await page.getByRole("button", { name: "Confirm shared expense" }).click();
		await expect(page.getByRole("status")).toContainText("Shared expense created and linked");
		expect(createPayloads).toHaveLength(2);
		expect(createPayloads[0]).toMatchObject({ bankTransactionId: "plaid_1", description: "Coffee with partner", allowPossibleDuplicate: false });
		expect(createPayloads[1]).toMatchObject({ allowPossibleDuplicate: true });
		await expect(page.getByText("Coffee Shop")).toBeHidden();
	});
});
