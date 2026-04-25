import { type Page, test as base } from "@playwright/test";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import { TestHelper } from "../utils/test-utils";
import { factories } from "./factories";
import { BACKEND_URL, callSeedEndpoint, isLocalBackend } from "./seed-client";
import { testData } from "./test-data";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

type AuthedGroupFactory = (
	n: number,
) => Promise<{ page: Page; users: string[] }>;

export type TestFixtures = {
	// Legacy (deprecated, retained for unconverted spec files)
	testHelper: TestHelper;
	authenticatedPage: TestHelper;
	authenticatedMultiPersonPage: TestHelper;
	mockHelper: TestHelper;

	// New fixture-based API (preferred for new tests)
	seed: SeedFn;
	authedPage: Page;
	authedPageWithGroupOf: AuthedGroupFactory;
};

export const test = base.extend<TestFixtures>({
	// ===== Legacy fixtures (kept working; new tests should not use these) =====
	testHelper: async ({ page }, use) => {
		await use(new TestHelper(page));
	},
	authenticatedPage: async ({ page }, use) => {
		const helper = new TestHelper(page);
		await helper.login(testData.users.user1);
		await use(helper);
		await helper.clearStorage();
	},
	authenticatedMultiPersonPage: async ({ page }, use) => {
		const helper = new TestHelper(page);
		await helper.login(testData.users.user3);
		await use(helper);
		await helper.clearStorage();
	},
	mockHelper: async ({ page }, use) => {
		const helper = new TestHelper(page);
		await helper.mockApiResponse("login", testData.mockResponses.login.success);
		await helper.mockApiResponse(
			"balances",
			testData.mockResponses.balances.success,
		);
		await helper.mockApiResponse(
			"transactions_list",
			testData.mockResponses.transactions.success,
		);
		await helper.mockApiResponse(
			"budget_total",
			testData.mockResponses.budgetTotal.success,
		);
		await helper.mockApiResponse(
			"budget_list",
			testData.mockResponses.budgetList.success,
		);
		await helper.mockApiResponse(
			"budget_monthly",
			testData.mockResponses.budgetMonthly.success,
		);
		await use(helper);
	},

	// ===== New fixtures =====

	seed: async ({ context }, use) => {
		const fn: SeedFn = async (payload, options) => {
			const result = await callSeedEndpoint(payload);
			const auth = options?.authenticateAs ?? payload.authenticate?.[0];
			if (auth && result.sessions[auth]) {
				await context.addCookies(
					result.sessions[auth].cookies.map((c) => ({
						name: c.name,
						value: c.value,
						url: BACKEND_URL,
						sameSite: c.sameSite,
						httpOnly: c.httpOnly,
						secure: c.secure,
						...(c.expires !== undefined ? { expires: c.expires } : {}),
					})),
				);
			}
			return result;
		};
		await use(fn);
	},

	authedPage: async ({ page, seed }, use) => {
		await seed({
			users: [{ alias: "u" }],
			groups: [
				{
					alias: "g",
					members: ["u"],
					budgets: [{ alias: "b", name: "Default" }],
				},
			],
			authenticate: ["u"],
		});
		await page.goto("/");
		await use(page);
	},

	authedPageWithGroupOf: async ({ page, seed }, use) => {
		const factory: AuthedGroupFactory = async (n: number) => {
			const aliases = Array.from({ length: n }, (_, i) => `u${i + 1}`);
			await seed({
				users: aliases.map((a) => factories.user({ alias: a })),
				groups: [factories.group({ alias: "g", members: aliases })],
				authenticate: [aliases[0]],
			});
			await page.goto("/");
			return { page, users: aliases };
		};
		await use(factory);
	},
});

/**
 * Skip a test (or describe) when running against a remote backend that
 * doesn't expose /test/seed.
 */
export function skipIfRemoteBackend(): void {
	test.skip(!isLocalBackend, "requires local backend with /test/seed enabled");
}

export { expect } from "@playwright/test";
export { factories } from "./factories";
