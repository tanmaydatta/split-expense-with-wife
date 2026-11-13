import type { SeedResponse } from "../../../shared-types";
import {
	test,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";
import path from "path";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";
const ARTIFACT_DIR =
	"/Users/tanmay.datta/.gemini/antigravity-cli/brain/9352d06c-c340-4fc2-ae52-26e32095cdba";

async function setFirstNames(
	result: SeedResponse,
	aliases: string[],
): Promise<void> {
	for (const alias of aliases) {
		const session = result.sessions[alias];
		if (!session) continue;
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: alias === "u1" ? "Tanmay" : "Wife" }),
		});
	}
}

test.describe("Transaction Entry Visual Screenshots", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("captures entry flow screenshots across modes", async ({
		seed,
		page,
	}) => {
		const result = await seed({
			users: [
				factories.user({ alias: "u1" }),
				factories.user({ alias: "u2" }),
			],
			groups: [
				factories.group({
					alias: "g",
					members: ["u1", "u2"],
					budgets: [
						{ alias: "b1", name: "Household" },
						{ alias: "b2", name: "Groceries" },
					],
				}),
			],
			authenticate: ["u1"],
		});

		await setFirstNames(result, ["u1", "u2"]);

		await page.goto("/");
		await page.waitForSelector('[data-test-id="paid-by-select"]', {
			timeout: 20000,
		});

		// 1. Purchase Mode (Default)
		await page.screenshot({
			path: path.join(ARTIFACT_DIR, "transaction-entry-1-purchase-mode.png"),
			fullPage: true,
		});

		// 2. Split Only Mode
		await page.selectOption(
			'[data-test-id="transaction-mode-selector"]',
			"split_only",
		);
		await page.waitForSelector('[data-test-id="split-only-hint"]');
		await page.screenshot({
			path: path.join(ARTIFACT_DIR, "transaction-entry-2-split-only-mode.png"),
			fullPage: true,
		});

		// 3. Budget Adjustment Mode
		await page.selectOption(
			'[data-test-id="transaction-mode-selector"]',
			"budget_adjustment",
		);
		await page.waitForSelector('[data-test-id="credit-debit-group"]');
		await page.screenshot({
			path: path.join(
				ARTIFACT_DIR,
				"transaction-entry-3-budget-adjustment-mode.png",
			),
			fullPage: true,
		});

		// 4. Transfer Mode
		await page.selectOption(
			'[data-test-id="transaction-mode-selector"]',
			"transfer",
		);
		await page.waitForSelector('[data-test-id="dashboard-transfer-container"]');
		await page.screenshot({
			path: path.join(ARTIFACT_DIR, "transaction-entry-4-transfer-mode.png"),
			fullPage: true,
		});

		// 5. Mobile Viewport (Purchase Mode)
		await page.setViewportSize({ width: 375, height: 812 });
		await page.selectOption(
			'[data-test-id="transaction-mode-selector"]',
			"purchase",
		);
		await page.waitForSelector('[data-test-id="paid-by-select"]');
		await page.screenshot({
			path: path.join(ARTIFACT_DIR, "transaction-entry-5-mobile-purchase.png"),
			fullPage: true,
		});
	});
});
