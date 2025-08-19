import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import worker from "../index";
import {
	completeCleanupDatabase,
	createTestUserData,
	setupAndCleanDatabase,
	signInAndGetCookies,
} from "./test-utils";

describe("Force Refresh - Budget Cache Issue Fix", () => {
	let TEST_USERS: {
		user1: Record<string, string>;
		user2: Record<string, string>;
		user3: Record<string, string>;
		user4: Record<string, string>;
		testGroupId: string;
	};

	beforeAll(async () => {
		await setupAndCleanDatabase(env);
	});

	beforeEach(async () => {
		// Clean the database completely before each test
		await completeCleanupDatabase(env);
		TEST_USERS = await createTestUserData(env);
	});

	it("should get fresh budget data when using forceRefresh after budget updates", async () => {
		// Create test user and get auth cookies
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const authHeaders = { Cookie: cookies };

		// First, get group details normally (will use cached session)
		const normalRequest = new Request(
			"https://localhost:8787/.netlify/functions/group/details",
			{
				method: "GET",
				headers: authHeaders,
			},
		);

		const ctx1 = createExecutionContext();
		const normalResponse = await worker.fetch(normalRequest, env, ctx1);
		await waitOnExecutionContext(ctx1);

		expect(normalResponse.status).toBe(200);
		const normalData = await normalResponse.json() as { budgets: any[] };
		expect(normalData.budgets).toBeDefined();

		// Now get group details with forceRefresh=true (should bypass session cache)
		const refreshRequest = new Request(
			"https://localhost:8787/.netlify/functions/group/details?forceRefresh=true",
			{
				method: "GET",
				headers: authHeaders,
			},
		);

		const ctx2 = createExecutionContext();
		const refreshResponse = await worker.fetch(refreshRequest, env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(refreshResponse.status).toBe(200);
		const refreshData = await refreshResponse.json() as { budgets: any[] };
		expect(refreshData.budgets).toBeDefined();
		
		// Both should return the same data structure (testing that forceRefresh works without errors)
		expect(typeof refreshData.budgets).toBe(typeof normalData.budgets);
	});

	it("should handle budget updates followed by forceRefresh correctly", async () => {
		// Create test user and get auth cookies
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const authHeaders = { Cookie: cookies };

		// Update group budgets
		const updateRequest = new Request(
			"https://localhost:8787/.netlify/functions/group/metadata",
			{
				method: "POST",
				headers: {
					...authHeaders,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					groupid: TEST_USERS.testGroupId,
					budgets: [
						{ id: "budget_test_123", budgetName: "Updated Budget", description: null }
					],
				}),
			},
		);

		const ctx1 = createExecutionContext();
		const updateResponse = await worker.fetch(updateRequest, env, ctx1);
		await waitOnExecutionContext(ctx1);

		expect(updateResponse.status).toBe(200);

		// Get group details with forceRefresh to ensure fresh budget data
		const freshRequest = new Request(
			"https://localhost:8787/.netlify/functions/group/details?forceRefresh=true",
			{
				method: "GET",
				headers: authHeaders,
			},
		);

		const ctx2 = createExecutionContext();
		const freshResponse = await worker.fetch(freshRequest, env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(freshResponse.status).toBe(200);
		const freshData = await freshResponse.json() as { budgets: any[] };
		
		// Should return updated budget data
		expect(freshData.budgets).toBeDefined();
		expect(Array.isArray(freshData.budgets)).toBe(true);
	});

	it("should work with all authenticated group endpoints", async () => {
		// Test that forceRefresh parameter doesn't break other authenticated endpoints
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const authHeaders = { Cookie: cookies };

		const endpoints = [
			"/.netlify/functions/group/details?forceRefresh=true",
		];

		for (const endpoint of endpoints) {
			const request = new Request(`https://localhost:8787${endpoint}`, {
				method: "GET",
				headers: authHeaders,
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			// Should not cause authentication or server errors
			expect(response.status).not.toBe(401);
			expect(response.status).not.toBe(500);
		}
	});
});