import { test as base } from "@playwright/test";
import { TestHelper } from "../utils/test-utils";
import { testData } from "./test-data";

// Define the fixtures type
type TestFixtures = {
	testHelper: TestHelper;
	authenticatedPage: TestHelper;
	authenticatedMultiPersonPage: TestHelper;
	mockHelper: TestHelper;
};

// Extend the base test with custom fixtures
export const test = base.extend<TestFixtures>({
	// Basic test helper fixture
	testHelper: async ({ page }, use) => {
		const helper = new TestHelper(page);
		await use(helper);
	},

	// Authenticated page fixture - automatically logs in a user
	authenticatedPage: async ({ page }, use) => {
		const helper = new TestHelper(page);

		// Mock successful login response

		// Login with test user
		await helper.login(testData.users.user1);

		await use(helper);

		// Cleanup after test
		await helper.clearStorage();
	},

	// Authenticated multi-person group page fixture - logs in user from 3-person group
	authenticatedMultiPersonPage: async ({ page }, use) => {
		const helper = new TestHelper(page);

		// Login with Group 2 user (alice.wilson) who is in a 3-person group
		await helper.login(testData.users.user3);

		await use(helper);

		// Cleanup after test
		await helper.clearStorage();
	},

	// Mock helper fixture - sets up common mocks
	mockHelper: async ({ page }, use) => {
		const helper = new TestHelper(page);

		// Set up common mocks
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
});

export { expect } from "@playwright/test";
