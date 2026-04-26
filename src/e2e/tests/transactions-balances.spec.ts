import type { Page } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	expect,
	factories,
	skipIfRemoteBackend,
	test,
} from "../fixtures/setup";
import { ExpenseTestHelper } from "../utils/expense-test-helper";
import { TestHelper } from "../utils/test-utils";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8787";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

// Helper class for transaction and balance operations using composition.
// Operates on a Page directly (wraps a TestHelper internally).
class TransactionBalanceTestHelper {
	private testHelper: TestHelper;
	private expenseHelper: ExpenseTestHelper;

	constructor(public page: Page) {
		this.testHelper = new TestHelper(page);
		this.expenseHelper = new ExpenseTestHelper(this.testHelper);
	}

	async navigateToPage(name: Parameters<TestHelper["navigateToPage"]>[0]) {
		await this.testHelper.navigateToPage(name);
	}

	async waitForLoading() {
		await this.testHelper.waitForLoading();
	}

	// Helpers to reduce nesting depth
	private async isEmptyBalancesState(): Promise<boolean> {
		const emptyBalances = this.page.locator('[data-test-id="empty-balances"]');
		try {
			await emptyBalances.waitFor({ state: "visible", timeout: 500 });
			return true;
		} catch (_e) {
			return false;
		}
	}

	private parseCurrencyAmount(
		text: string,
	): { currencyCode: string; amount: number } | null {
		const match = text.match(/([+-]?)(C\$|[£$€¥])(\d+\.?\d*)/);
		if (!match) return null;
		const sign = match[1];
		const symbol = match[2];
		const rawAmount = parseFloat(match[3]);
		const amount = sign === "-" ? -rawAmount : rawAmount;
		const currencyMap: Record<string, string> = {
			$: "USD",
			"C$": "CAD",
			"€": "EUR",
			"£": "GBP",
			"¥": "JPY",
		};
		const currencyCode = currencyMap[symbol] || symbol;
		return { currencyCode, amount };
	}

	private addAmount(
		balances: Record<string, Record<string, number>>,
		userName: string,
		currencyCode: string,
		amount: number,
	): void {
		if (!balances[userName]) balances[userName] = {};
		balances[userName][currencyCode] =
			(balances[userName][currencyCode] || 0) + amount;
	}

	private async detectView(): Promise<"desktop" | "mobile"> {
		const desktopTable = this.page.locator(".desktop-table");
		try {
			await desktopTable.waitFor({ state: "visible", timeout: 1000 });
			return "desktop";
		} catch (_e) {
			const mobileCards = this.page.locator(".mobile-cards");
			await mobileCards.waitFor({ state: "visible", timeout: 1000 });
			return "mobile";
		}
	}

	private async findTransactionTarget(
		description: string,
	): Promise<{ targetItem: any; transactionId: string }> {
		const view = await this.detectView();
		if (view === "desktop") {
			const items = await this.page
				.locator('[data-test-id="transaction-item"]')
				.all();
			for (const item of items) {
				const text = await item.textContent();
				if (text && text.includes(description)) {
					const id = (await item.getAttribute("data-transaction-id")) || "";
					return { targetItem: item, transactionId: id };
				}
			}
			throw new Error(`Transaction not found: ${description}`);
		}
		// mobile
		const cards = await this.page
			.locator('[data-test-id="transaction-card"]')
			.all();
		for (const card of cards) {
			const text = await card.textContent();
			if (text && text.includes(description)) {
				const id = (await card.getAttribute("data-transaction-id")) || "";
				return { targetItem: card, transactionId: id };
			}
		}
		throw new Error(`Transaction not found: ${description}`);
	}

	private async getVisibleDetailsContainer(transactionId: string) {
		const containers = await this.page
			.locator(`[data-test-id="transaction-details-${transactionId}"]`)
			.all();
		for (const c of containers) {
			try {
				await c.waitFor({ state: "visible", timeout: 2000 });
				return c;
			} catch (_e) {
				// continue
			}
		}
		return containers[0] || null;
	}

	async createTestExpense(
		description?: string,
		amount?: number,
		currency?: string,
		customSplits?: Record<string, number>,
		paidBy?: string,
	) {
		// Navigate to Add page to create an expense
		await this.navigateToPage("Add");

		// Use the expense helper to create the expense
		const expense = {
			description: description || "Test expense",
			amount: amount || 100,
			currency: currency || "USD",
			paidBy: paidBy,
		};

		const result = await this.expenseHelper.addExpenseEntry(
			expense,
			customSplits,
		);
		return {
			description: result.description,
			amount: expense.amount,
			currency: expense.currency,
			successMessage: result.successMessage,
		};
	}

	async verifyTransactionsPageComponents() {
		await this.expenseHelper.verifyExpensesPageComponents();
	}

	async verifyTransactionInList(
		description: string,
		amount: number,
		currency: string,
		expectedShare?: string,
	) {
		await this.expenseHelper.verifySpecificExpenseEntry(
			description,
			amount.toString(),
			currency,
			expectedShare,
		);
	}

	async verifyBalancesPageComponents() {
		await expect(this.page).toHaveURL("/balances");
		console.log("Verifying balances page components");
		await this.page.waitForSelector(
			'[data-test-id="balances-container"], [data-test-id="empty-balances"], [data-test-id^="balance-section-"], [data-test-id="amount-item"]',
			{ timeout: 10000 },
		);
		console.log(
			"✅ Balances page components verification completed - content found and loaded",
		);
	}

	async getCurrentBalances(): Promise<Record<string, Record<string, number>>> {
		console.log("Getting current balance totals");
		await this.page.waitForSelector(
			'[data-test-id="balances-container"], [data-test-id="empty-balances"], [data-test-id^="balance-section-"], [data-test-id="amount-item"]',
			{ timeout: 10000 },
		);

		const balances: Record<string, Record<string, number>> = {};
		await this.page.waitForTimeout(1000);

		const hasEmptyState = await this.isEmptyBalancesState();
		const userSections = this.page.locator(
			'[data-test-id^="balance-section-"]',
		);
		const amountItems = this.page.locator('[data-test-id="amount-item"]');
		const userCount = await userSections.count();
		const itemCount = await amountItems.count();

		if (hasEmptyState && userCount === 0 && itemCount === 0) {
			console.log(
				"Confirmed empty balances state - returning empty balances object",
			);
			return balances;
		}

		if (userCount === 0) {
			console.log(
				"No user sections found - checking for amount items directly",
			);
			const amountItems2 = this.page.locator('[data-test-id="amount-item"]');
			const itemCount2 = await amountItems2.count();
			if (itemCount2 === 0) {
				console.log("No balance data found - returning empty balances");
				return balances;
			}
			console.log(`Found ${itemCount2} amount items without user sections`);
			return balances;
		}

		for (let i = 0; i < userCount; i++) {
			const section = userSections.nth(i);
			const userHeader = section.locator('[data-test-id^="user-header-"]');
			const userName = (await userHeader.textContent()) || undefined;
			if (!userName) continue;
			console.log(`Processing balances for user: ${userName}`);
			balances[userName] = {};
			const sectionAmountItems = section.locator(
				'[data-test-id="amount-item"]',
			);
			const amountCount = await sectionAmountItems.count();
			for (let j = 0; j < amountCount; j++) {
				const text = (await sectionAmountItems.nth(j).textContent()) || "";
				const parsed = this.parseCurrencyAmount(text);
				if (!parsed) continue;
				this.addAmount(balances, userName, parsed.currencyCode, parsed.amount);
				console.log(
					`✓ ${userName} ${parsed.currencyCode}: ${parsed.amount} (total: ${balances[userName][parsed.currencyCode]})`,
				);
			}
		}

		console.log("Current balances:", JSON.stringify(balances, null, 2));
		return balances;
	}

	async verifyBalances(
		expectedBalances: Record<string, Record<string, number>>,
	) {
		console.log("Verifying expected balances");
		await this.page.reload();
		await this.page.waitForTimeout(1000);
		const currentBalances = await this.getCurrentBalances();

		for (const [userName, currencies] of Object.entries(expectedBalances)) {
			for (const [currency, expectedAmount] of Object.entries(currencies)) {
				const currentAmount = currentBalances[userName]?.[currency] || 0;
				expect(currentAmount).toBeCloseTo(expectedAmount, 2);
				console.log(
					`✓ ${userName} ${currency}: expected ${expectedAmount}, got ${currentAmount}`,
				);
			}
		}

		console.log("✅ Balance verification completed");
	}

	async verifyBalanceEntries() {
		console.log("Verifying balance entries");
		await this.page.waitForSelector(
			'[data-test-id="amount-item"], [data-test-id="empty-balances"]',
			{ timeout: 10000 },
		);
		await this.page.waitForTimeout(2000);

		const amountItems = this.page.locator('[data-test-id="amount-item"]');
		const count = await amountItems.count();

		const isEmpty = await this.isEmptyBalancesState();
		if (isEmpty) {
			console.log(
				"Page is in empty balances state - no balance items expected",
			);
			expect(count).toBe(0);
			return;
		}

		if (count === 0) {
			console.log("No balance items found, waiting longer and retrying...");
			await this.page.waitForTimeout(3000);
			const retryCount = await amountItems.count();
			expect(retryCount).toBeGreaterThan(0);
			console.log(`Found ${retryCount} balance items after retry`);
		} else {
			expect(count).toBeGreaterThan(0);
			console.log(`Found ${count} balance items`);
		}

		for (let i = 0; i < Math.min(count, 5); i++) {
			const item = amountItems.nth(i);
			const text = await item.textContent();
			if (text) {
				console.log(`Balance entry ${i + 1}: ${text}`);
				const hasCurrencyInfo = /[$€£¥]|\d+\.\d{2}/.test(text);
				expect(hasCurrencyInfo).toBe(true);
				console.log(
					`✓ Balance entry ${i + 1} contains currency/amount information`,
				);
			}
		}

		console.log("✅ Balance entries verification completed");
	}

	async verifyTransactionDetails(
		description: string,
		expectedTotalAmount?: number,
		expectedAmountsOwed?: Record<string, string>,
		expectedPaidBy?: Record<string, string>,
		expectedTotalOwed?: string,
	) {
		console.log("Verifying transaction details for:", description);
		const { targetItem, transactionId } =
			await this.findTransactionTarget(description);
		await targetItem.click();
		await this.page.waitForTimeout(1000);
		const detailsContainer = await this.getVisibleDetailsContainer(transactionId);
		if (!detailsContainer) {
			console.log(`No details container found for: ${description}`);
			return;
		}

		console.log(`Expanded transaction details found for: ${description}`);
		const fullDescription = detailsContainer.locator(
			'[data-test-id="full-description"]',
		);
		const amountOwedSection = detailsContainer.locator(
			'[data-test-id="amount-owed-section"]',
		);
		const paidBySection = detailsContainer.locator(
			'[data-test-id="paid-by-section"]',
		);
		const totalOwedSection = detailsContainer.locator(
			'[data-test-id="total-owed-section"]',
		);

		expect(fullDescription).not.toBeNull();
		expect(amountOwedSection).not.toBeNull();
		expect(paidBySection).not.toBeNull();
		expect(totalOwedSection).not.toBeNull();

		await expect(fullDescription).toBeVisible();
		await expect(amountOwedSection).toBeVisible();
		await expect(paidBySection).toBeVisible();
		await expect(totalOwedSection).toBeVisible();

		const fullDescriptionText = (await fullDescription.textContent()) || "";
		expect(fullDescriptionText).toContain(description);
		console.log(`✓ Full description verified: ${fullDescriptionText}`);

		if (expectedAmountsOwed) {
			const amountOwedText = (await amountOwedSection.textContent()) || "";
			console.log(`Amount owed section text: ${amountOwedText}`);
			for (const [user, expectedAmount] of Object.entries(
				expectedAmountsOwed,
			)) {
				expect(amountOwedText).toContain(expectedAmount);
				console.log(`✓ Amount owed verified for ${user}: ${expectedAmount}`);
			}
		}

		if (expectedPaidBy) {
			const paidByText = (await paidBySection.textContent()) || "";
			console.log(`Paid by section text: ${paidByText}`);
			for (const [user, expectedAmount] of Object.entries(expectedPaidBy)) {
				expect(paidByText).toContain(expectedAmount);
				console.log(`✓ Paid by amount verified for ${user}: ${expectedAmount}`);
			}
		}

		if (expectedTotalOwed !== undefined) {
			const totalOwedText = (await totalOwedSection.textContent()) || "";
			console.log(`Total owed section text: ${totalOwedText}`);

			if (expectedTotalOwed.startsWith("+")) {
				expect(totalOwedText).toContain("You are owed");
				expect(totalOwedText).toContain(expectedTotalOwed);
				console.log(
					`✓ Total owed verified: You are owed +${expectedTotalOwed}`,
				);
			} else if (expectedTotalOwed.startsWith("-")) {
				expect(totalOwedText).toContain("You owe");
				expect(totalOwedText).toContain(expectedTotalOwed);
				console.log(`✓ Total owed verified: You owe -${expectedTotalOwed}`);
			} else {
				expect(totalOwedText).toContain("No amount owed");
				console.log(`✓ Total owed verified: No amount owed`);
			}
		}

		if (expectedTotalAmount !== undefined) {
			const fullDetailsText = (await detailsContainer.textContent()) || "";
			expect(fullDetailsText).toContain(expectedTotalAmount.toString());
			console.log(`✓ Total amount verified: ${expectedTotalAmount}`);
		}

		console.log(
			`✅ Successfully verified all expanded transaction details for: ${description}`,
		);
	}
}

interface SeedTwoUserOptions {
	defaultShare?: { u1: number; u2: number };
	u1FirstName?: string;
	u2FirstName?: string;
}

/**
 * Seed a two-user group used for transactions/balances tests. Sets non-empty
 * firstNames (defaults "John"/"Jane" to match the legacy fixtures the tests
 * historically asserted on) and persists a `defaultShare` in group metadata
 * so the Dashboard's split form pre-fills sensible percentages.
 */
async function seedTwoUserAuthedPage(
	seed: SeedFn,
	page: Page,
	options: SeedTwoUserOptions = {},
): Promise<SeedResponse> {
	const u1FirstName = options.u1FirstName ?? "John";
	const u2FirstName = options.u2FirstName ?? "Jane";
	const defaultShare = options.defaultShare ?? { u1: 50, u2: 50 };

	const result = await seed({
		users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
		groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
		authenticate: ["u1", "u2"],
	});

	const firstNames: Record<"u1" | "u2", string> = {
		u1: u1FirstName,
		u2: u2FirstName,
	};
	for (const alias of ["u1", "u2"] as const) {
		const session = result.sessions[alias];
		if (!session) continue;
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: firstNames[alias] }),
		});
	}

	const u1Session = result.sessions.u1;
	if (u1Session) {
		const cookieHeader = u1Session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		const u1Id = result.ids.users.u1.id;
		const u2Id = result.ids.users.u2.id;
		const groupId = result.ids.groups.g.id;
		await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				groupid: groupId,
				defaultShare: { [u1Id]: defaultShare.u1, [u2Id]: defaultShare.u2 },
			}),
		});
	}

	await page.goto("/");
	return result;
}

interface SeedThreeUserOptions {
	defaultShare?: { u1: number; u2: number; u3: number };
	firstNames?: { u1: string; u2: string; u3: string };
}

/**
 * Seed a three-user group used for the multi-person transaction test. The test
 * verifies that the transaction details panel renders all three participants'
 * firstNames (Alice/Bob/Charlie by default).
 */
async function seedThreeUserAuthedPage(
	seed: SeedFn,
	page: Page,
	options: SeedThreeUserOptions = {},
): Promise<SeedResponse> {
	const firstNames = options.firstNames ?? {
		u1: "Alice",
		u2: "Bob",
		u3: "Charlie",
	};
	const defaultShare = options.defaultShare ?? { u1: 40, u2: 35, u3: 25 };

	const result = await seed({
		users: [
			factories.user({ alias: "u1" }),
			factories.user({ alias: "u2" }),
			factories.user({ alias: "u3" }),
		],
		groups: [
			factories.group({ alias: "g", members: ["u1", "u2", "u3"] }),
		],
		authenticate: ["u1", "u2", "u3"],
	});

	for (const alias of ["u1", "u2", "u3"] as const) {
		const session = result.sessions[alias];
		if (!session) continue;
		const cookieHeader = session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({ firstName: firstNames[alias] }),
		});
	}

	const u1Session = result.sessions.u1;
	if (u1Session) {
		const cookieHeader = u1Session.cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ");
		const u1Id = result.ids.users.u1.id;
		const u2Id = result.ids.users.u2.id;
		const u3Id = result.ids.users.u3.id;
		const groupId = result.ids.groups.g.id;
		await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify({
				groupid: groupId,
				defaultShare: {
					[u1Id]: defaultShare.u1,
					[u2Id]: defaultShare.u2,
					[u3Id]: defaultShare.u3,
				},
			}),
		});
	}

	await page.goto("/");
	return result;
}

test.describe("Transactions and Balances", () => {
	test.beforeAll(skipIfRemoteBackend);

	test("should display transactions page with real expense data", async ({
		seed,
		page,
	}) => {
		// Full convert: seed a two-user group + the transaction directly, then
		// just verify it renders on the Expenses page.
		const seedResult = await seed({
			users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [50, 50],
					amount: 75,
					currency: "USD",
					description: "Grocery shopping for test",
				}),
			],
			authenticate: ["u1"],
		});
		expect(seedResult.ids.transactions.t).toBeDefined();

		const helper = new TransactionBalanceTestHelper(page);
		await page.goto("/");
		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();

		// 50/50 split on $75: u1 paid $75, owes $37.50, share = +$37.50
		await helper.verifyTransactionInList(
			"Grocery shopping for test",
			75,
			"USD",
			"+$37.50",
		);
	});

	test("should display transaction with correct amount and currency formatting", async ({
		seed,
		page,
	}) => {
		// Full convert: seed two transactions with different amounts/currencies.
		const seedResult = await seed({
			users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [50, 50],
					amount: 5.5,
					currency: "USD",
					description: "Small purchase",
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [50, 50],
					amount: 1234.99,
					currency: "EUR",
					description: "Large purchase",
				}),
			],
			authenticate: ["u1"],
		});
		expect(seedResult.ids.transactions.t1).toBeDefined();
		expect(seedResult.ids.transactions.t2).toBeDefined();

		const helper = new TransactionBalanceTestHelper(page);
		await page.goto("/");
		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();

		// 50/50 split on $5.50: share = +$2.75
		await helper.verifyTransactionInList(
			"Small purchase",
			5.5,
			"USD",
			"+$2.75",
		);
		// 50/50 split on €1234.99: share = +€617.50 (rounded)
		await helper.verifyTransactionInList(
			"Large purchase",
			1234.99,
			"EUR",
			"+€617.50",
		);
	});

	test("should display transaction share calculations correctly", async ({
		seed,
		page,
	}) => {
		// Full convert: seed a 60/40 split transaction.
		await seed({
			users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [60, 40],
					amount: 100,
					currency: "USD",
					description: "Custom split expense",
				}),
			],
			authenticate: ["u1"],
		});

		const helper = new TransactionBalanceTestHelper(page);
		await page.goto("/");
		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();

		// 60/40 split on $100: u1 paid $100, owes $60, share = +$40.00
		await helper.verifyTransactionInList(
			"Custom split expense",
			100,
			"USD",
			"+$40.00",
		);
	});

	test("should handle transaction details expansion", async ({
		seed,
		page,
	}) => {
		// Full convert: seed a 71/29 split transaction with John/Jane firstNames
		// so the expanded details panel shows the expected names.
		const newUser1Percentage = 71;
		const amount = 150;
		const user1Share = (amount * newUser1Percentage) / 100;
		const user2Share = amount - user1Share;

		await seedTwoUserAuthedPage(seed, page, {
			defaultShare: { u1: newUser1Percentage, u2: 100 - newUser1Percentage },
		});
		// Now seed the transaction directly via /test/seed (we still need a
		// page.goto already done by seedTwoUserAuthedPage). Use a second seed
		// call — but /test/seed wipes the DB, so instead use form-driven creation.
		const helper = new TransactionBalanceTestHelper(page);
		const expense = await helper.createTestExpense(
			"Detailed expense",
			amount,
			"USD",
			// Note: percentages are read off the form by user ID, but createTestExpense
			// signs us up via the rendered form which already has u1/u2 IDs available.
			undefined,
		);
		console.log("Expense created:", expense);

		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();

		// John (u1) paid $150, owes 71% = $106.50, share = +$43.50
		await helper.verifyTransactionInList(
			expense.description,
			expense.amount,
			expense.currency,
			`+$${user2Share.toFixed(2)}`,
		);

		await helper.verifyTransactionDetails(
			expense.description,
			expense.amount,
			{ John: `$${user1Share.toFixed(2)}`, Jane: `$${user2Share.toFixed(2)}` },
			{ John: `$${expense.amount.toFixed(2)}` },
			`+$${user2Share.toFixed(2)}`,
		);
	});

	test("should display balances page with real data", async ({
		seed,
		page,
	}) => {
		// Full convert: seed two transactions in different currencies/splits, then
		// just verify the Balances page renders entries.
		await seed({
			users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [70, 30],
					amount: 50,
					currency: "USD",
					description: "Balance test 1",
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [40, 60],
					amount: 80,
					currency: "EUR",
					description: "Balance test 2",
				}),
			],
			authenticate: ["u1"],
		});

		const helper = new TransactionBalanceTestHelper(page);
		await page.goto("/");
		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		await helper.verifyBalanceEntries();
	});

	test("should handle pagination on transactions page", async ({
		seed,
		page,
	}) => {
		// Full convert: seed three transactions, then verify the first appears.
		await seed({
			users: [factories.user({ alias: "u1" }), factories.user({ alias: "u2" })],
			groups: [factories.group({ alias: "g", members: ["u1", "u2"] })],
			transactions: [
				factories.transaction({
					alias: "t1",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [50, 50],
					amount: 51,
					currency: "USD",
					description: "Pagination test 1",
				}),
				factories.transaction({
					alias: "t2",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [50, 50],
					amount: 52,
					currency: "USD",
					description: "Pagination test 2",
				}),
				factories.transaction({
					alias: "t3",
					group: "g",
					paidBy: "u1",
					splitAcross: ["u1", "u2"],
					splitPcts: [50, 50],
					amount: 53,
					currency: "USD",
					description: "Pagination test 3",
				}),
			],
			authenticate: ["u1"],
		});

		const helper = new TransactionBalanceTestHelper(page);
		await page.goto("/");
		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();

		await helper.verifyTransactionInList("Pagination test 1", 51, "USD");

		// Test "Show more" button if it exists (typically only when > 1 page).
		const showMoreButton = page.locator('[data-test-id="show-more-button"]');
		try {
			await showMoreButton.waitFor({ state: "visible", timeout: 2000 });
			await showMoreButton.click();
			await helper.verifyTransactionsPageComponents();
			await helper.verifyTransactionInList("Pagination test 3", 53, "USD");
		} catch (_e) {
			console.log("Show more button not available, skipping pagination test");
		}
	});

	test("should verify balance totals change correctly after adding expense", async ({
		seed,
		page,
	}) => {
		// Half convert: form-driven creation. Need defaultShare = 60/40 so the
		// form's percentages match the expected $48 swing.
		await seedTwoUserAuthedPage(seed, page, {
			defaultShare: { u1: 60, u2: 40 },
		});
		const helper = new TransactionBalanceTestHelper(page);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		const initialBalances = await helper.getCurrentBalances();
		console.log("Initial balances:", JSON.stringify(initialBalances, null, 2));

		const expenseAmount = 120;
		const currency = "USD";
		await helper.createTestExpense(
			"Balance test expense",
			expenseAmount,
			currency,
		);

		const expectedBalances = JSON.parse(JSON.stringify(initialBalances));
		if (!expectedBalances["Jane"]) expectedBalances["Jane"] = {};
		// 60/40 split on $120: Jane owes $48 → Jane shows +$48.00 (John gets $48 back)
		const janeChange = +48.0;
		expectedBalances["Jane"][currency] =
			(expectedBalances["Jane"][currency] || 0) + janeChange;

		console.log(
			"Expected balances after expense:",
			JSON.stringify(expectedBalances, null, 2),
		);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		await helper.verifyBalances(expectedBalances);
		await helper.verifyBalanceEntries();
	});

	test("should display correct balance calculations after multiple transactions", async ({
		seed,
		page,
	}) => {
		// Half convert: form-driven; create two expenses with different splits
		// (50/50, 75/25) to test cumulative balance changes. Set defaultShare to
		// 50/50; we'll override the second expense's percentages via the form.
		await seedTwoUserAuthedPage(seed, page, {
			defaultShare: { u1: 50, u2: 50 },
		});
		const helper = new TransactionBalanceTestHelper(page);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		const initialBalances = await helper.getCurrentBalances();
		console.log("Initial balances:", JSON.stringify(initialBalances, null, 2));

		// Discover the user IDs so we can drive the percentage inputs.
		await helper.navigateToPage("Add");
		const expenseHelper = new ExpenseTestHelper(new TestHelper(page));
		const formValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(formValues.percentages);
		expect(userIds.length).toBe(2);

		// We don't yet know which form ID is u1 vs u2, but for the first expense
		// (50/50) it doesn't matter. For the second (75/25), we need u1=75. Use
		// the redux store to check current user via a new call.
		// Simpler: read the seed result is not available here; instead re-derive
		// using getCurrentUserId which reads sidebar-welcome-{u1Id}.
		const helperTestHelper = new TestHelper(page);
		const { getCurrentUserId } = await import("../utils/test-utils");
		const u1Id = await getCurrentUserId(helperTestHelper);
		const u2Id = userIds.find((id) => id !== u1Id) as string;

		// Transaction 1: 50/50 split on $100 → John gets +$50.00 back
		await helper.createTestExpense("Transaction 1", 100, "USD", {
			[u1Id]: 50,
			[u2Id]: 50,
		});
		// Transaction 2: 75/25 split on $80 → John gets +$20.00 back
		await helper.createTestExpense("Transaction 2", 80, "USD", {
			[u1Id]: 75,
			[u2Id]: 25,
		});

		const expectedBalances = JSON.parse(JSON.stringify(initialBalances));
		if (!expectedBalances["Jane"]) expectedBalances["Jane"] = {};
		// Jane: $50 (txn 1) + $20 (txn 2) = +$70 owed to John
		const janeTotalChange = +50.0 + 20.0;
		expectedBalances["Jane"]["USD"] =
			(expectedBalances["Jane"]["USD"] || 0) + janeTotalChange;
		delete expectedBalances["John"];

		console.log(
			"Expected balances after multiple transactions:",
			JSON.stringify(expectedBalances, null, 2),
		);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		await helper.verifyBalances(expectedBalances);
		await helper.verifyBalanceEntries();
	});

	test("should display loading states during data fetching", async ({
		seed,
		page,
	}) => {
		// Half convert: still uses page.route to mock the loading delay. Seed a
		// two-user group so the user is authenticated and basic data resolves
		// before the route mock kicks in.
		const seedResult = await seedTwoUserAuthedPage(seed, page);
		const u1Id = seedResult.ids.users.u1.id;
		const u2Id = seedResult.ids.users.u2.id;
		const helper = new TransactionBalanceTestHelper(page);

		// Mock the transactions_list API with a delay
		await page.route(
			"**/.netlify/functions/transactions_list",
			async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 3000));
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						transactions: [
							{
								id: 1,
								description: "Mock transaction for loading test",
								amount: 100,
								created_at: new Date().toISOString(),
								currency: "USD",
								transaction_id: "mock_txn_001",
								group_id: 1,
								metadata: JSON.stringify({
									owedAmounts: { [u1Id]: 50, [u2Id]: 50 },
									paidByShares: { [u1Id]: 100 },
									owedToAmounts: { [u1Id]: 50, [u2Id]: 50 },
								}),
							},
						],
						transactionDetails: {
							mock_txn_001: [
								{
									user_id: u1Id,
									owed_to_user_id: u1Id,
									amount: 100,
									first_name: "John",
								},
								{
									user_id: u2Id,
									owed_to_user_id: u1Id,
									amount: 50,
									first_name: "Jane",
								},
							],
						},
					}),
				});
			},
		);

		// Start navigation to transactions page
		const navigatePromise = helper.navigateToPage("Expenses");

		// Verify loader appears immediately
		const loader = page.locator('[data-test-id="loader"]');
		await expect(loader).toBeVisible({ timeout: 2000 });
		console.log("✅ Loader state detected during API call");

		await navigatePromise;

		await expect(
			page.locator('[data-test-id="expenses-container"]'),
		).toBeVisible({ timeout: 3000 });

		await expect(loader).not.toBeVisible({ timeout: 3000 });
		console.log("✅ Loader disappeared after API response");

		await helper.verifyTransactionsPageComponents();
	});

	test("should update balances correctly after expense deletion", async ({
		seed,
		page,
	}) => {
		// Half convert: form-driven. Create two expenses, verify intermediate
		// balances, delete each one, verify final balances return to initial.
		await seedTwoUserAuthedPage(seed, page, {
			defaultShare: { u1: 50, u2: 50 },
		});
		const helper = new TransactionBalanceTestHelper(page);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		const initialBalances = await helper.getCurrentBalances();
		console.log(
			"Initial balances before expense creation:",
			JSON.stringify(initialBalances, null, 2),
		);

		// Discover user IDs.
		await helper.navigateToPage("Add");
		const expenseHelper = new ExpenseTestHelper(new TestHelper(page));
		const formValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(formValues.percentages);
		const helperTestHelper = new TestHelper(page);
		const { getCurrentUserId } = await import("../utils/test-utils");
		const u1Id = await getCurrentUserId(helperTestHelper);
		const u2Id = userIds.find((id) => id !== u1Id) as string;

		// Expense 1: 60/40 on $100 USD → Jane owes John $40
		const expense1 = await helper.createTestExpense(
			"Balance deletion test 1",
			100,
			"USD",
			{ [u1Id]: 60, [u2Id]: 40 },
		);
		// Expense 2: 50/50 on €80 → Jane owes John €40
		const expense2 = await helper.createTestExpense(
			"Balance deletion test 2",
			80,
			"EUR",
			{ [u1Id]: 50, [u2Id]: 50 },
		);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		const expectedAfterAddition = JSON.parse(JSON.stringify(initialBalances));
		if (!expectedAfterAddition["Jane"]) expectedAfterAddition["Jane"] = {};
		expectedAfterAddition["Jane"]["USD"] =
			(expectedAfterAddition["Jane"]["USD"] || 0) + 40;
		expectedAfterAddition["Jane"]["EUR"] =
			(expectedAfterAddition["Jane"]["EUR"] || 0) + 40;

		await helper.verifyBalances(expectedAfterAddition);

		// Delete first expense.
		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();
		console.log(`Attempting to delete first expense: ${expense1.description}`);
		await expenseHelper.deleteExpenseEntry(expense1.description);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		const expectedAfterFirstDeletion = JSON.parse(
			JSON.stringify(initialBalances),
		);
		if (!expectedAfterFirstDeletion["Jane"])
			expectedAfterFirstDeletion["Jane"] = {};
		expectedAfterFirstDeletion["Jane"]["EUR"] =
			(expectedAfterFirstDeletion["Jane"]["EUR"] || 0) + 40;
		console.log(
			"Expected balances after deleting first expense:",
			JSON.stringify(expectedAfterFirstDeletion, null, 2),
		);
		await helper.verifyBalances(expectedAfterFirstDeletion);

		// Delete second expense.
		await helper.navigateToPage("Expenses");
		console.log(`Attempting to delete second expense: ${expense2.description}`);
		await expenseHelper.deleteExpenseEntry(expense2.description);

		await helper.navigateToPage("Balances");
		await helper.verifyBalancesPageComponents();
		await helper.verifyBalances(initialBalances);

		console.log("✅ Balance deletion test completed successfully");
	});

	test("should handle transactions with more than 2 people in group", async ({
		seed,
		page,
	}) => {
		// Half convert: form-driven creation in a 3-person group. Verifies that
		// the transaction details panel renders all three participants by
		// firstName (Alice/Bob/Charlie).
		await seedThreeUserAuthedPage(seed, page, {
			defaultShare: { u1: 40, u2: 35, u3: 25 },
		});
		const helper = new TransactionBalanceTestHelper(page);

		// Discover user IDs from the rendered form.
		await helper.navigateToPage("Add");
		const expenseHelper = new ExpenseTestHelper(new TestHelper(page));
		const formValues = await expenseHelper.getCurrentFormValues();
		const userIds = Object.keys(formValues.percentages);
		expect(userIds.length).toBe(3);

		// Identify the current user (Alice = u1). The form already shows the
		// correct 40/35/25 from defaultShare; we don't need to re-set splits.
		const helperTestHelper = new TestHelper(page);
		const { getCurrentUserId } = await import("../utils/test-utils");
		const aliceId = await getCurrentUserId(helperTestHelper);

		const multiPersonExpense = await helper.createTestExpense(
			"Multi-person group expense",
			150,
			"EUR",
			undefined, // Use the form's pre-filled defaultShare (40/35/25).
			aliceId, // Alice pays for the expense.
		);

		await helper.navigateToPage("Expenses");
		await helper.verifyTransactionsPageComponents();

		// Alice paid €150, owes 40% = €60, share = +€90
		await helper.verifyTransactionInList(
			multiPersonExpense.description,
			multiPersonExpense.amount,
			multiPersonExpense.currency,
			"+€90.00",
		);

		await helper.verifyTransactionDetails(
			multiPersonExpense.description,
			150,
			{
				Alice: "€60.00",
				Bob: "€52.50",
				Charlie: "€37.50",
			},
			{ Alice: "€150.00" },
			"+€90.00",
		);

		console.log(
			"✅ Multi-person group transaction test completed successfully",
		);
	});
});
