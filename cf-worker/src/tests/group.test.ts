/// <reference types="vitest" />
import { env } from "cloudflare:test";
// Vitest globals are available through the test environment
import { and, eq, isNull, isNotNull, or } from "drizzle-orm";
import type {
	GroupDetailsResponse,
	UpdateGroupMetadataRequest,
	UpdateGroupMetadataResponse,
} from "../../../shared-types";
import { getDb } from "../db";
import { groupBudgets, groups } from "../db/schema/schema";
import {
	handleGroupDetails,
	handleUpdateGroupMetadata,
} from "../handlers/group";
import {
	completeCleanupDatabase,
	createMockRequest,
	createTestUserData,
	setupAndCleanDatabase,
	signInAndGetCookies,
} from "./test-utils";

describe("Group Metadata Handler", () => {
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

	it("should successfully update both defaultShare and defaultCurrency", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 25,
				[TEST_USERS.user2.id]: 25,
				[TEST_USERS.user3.id]: 25,
				[TEST_USERS.user4.id]: 25,
			},
			defaultCurrency: "USD",
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(200);
		const responseData = (await response.json()) as UpdateGroupMetadataResponse;
		expect(responseData.message).toBe("Group metadata updated successfully");
		expect(responseData.metadata.defaultShare).toEqual({
			[TEST_USERS.user1.id]: 25,
			[TEST_USERS.user2.id]: 25,
			[TEST_USERS.user3.id]: 25,
			[TEST_USERS.user4.id]: 25,
		});
		expect(responseData.metadata.defaultCurrency).toBe("USD");

		// Verify database was updated
		const db = getDb(env);
		const groupData = await db
			.select({ metadata: groups.metadata })
			.from(groups)
			.where(eq(groups.groupid, TEST_USERS.testGroupId))
			.limit(1);
		expect(groupData).toHaveLength(1);
		const metadata = JSON.parse(groupData[0].metadata || "{}");
		expect(metadata.defaultShare).toEqual({
			[TEST_USERS.user1.id]: 25,
			[TEST_USERS.user2.id]: 25,
			[TEST_USERS.user3.id]: 25,
			[TEST_USERS.user4.id]: 25,
		});
		expect(metadata.defaultCurrency).toBe("USD");
	});

	it("should successfully update only defaultShare", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);
		const db = getDb(env);

		// First set some initial metadata
		await db
			.update(groups)
			.set({
				metadata: '{"defaultCurrency": "GBP", "other_field": "preserved"}',
			})
			.where(eq(groups.groupid, TEST_USERS.testGroupId));

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 40,
				[TEST_USERS.user2.id]: 30,
				[TEST_USERS.user3.id]: 20,
				[TEST_USERS.user4.id]: 10,
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(200);
		const responseData = (await response.json()) as UpdateGroupMetadataResponse;
		expect(responseData.metadata.defaultShare).toEqual({
			[TEST_USERS.user1.id]: 40,
			[TEST_USERS.user2.id]: 30,
			[TEST_USERS.user3.id]: 20,
			[TEST_USERS.user4.id]: 10,
		});
		expect(responseData.metadata.defaultCurrency).toBe("GBP"); // Should preserve existing

		// Verify other fields are preserved
		const groupData = await db
			.select({ metadata: groups.metadata })
			.from(groups)
			.where(eq(groups.groupid, TEST_USERS.testGroupId))
			.limit(1);
		expect(groupData).toHaveLength(1);
		const metadata = JSON.parse(groupData[0].metadata || "{}");
		expect(metadata.other_field).toBe("preserved");
	});

	it("should successfully update only defaultCurrency", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		// First set some initial metadata
		const db = getDb(env);
		await db
			.update(groups)
			.set({
				metadata: `{"defaultShare": {"${TEST_USERS.user1.id}": 50, "${TEST_USERS.user2.id}": 50}, "other_field": "preserved"}`,
			})
			.where(eq(groups.groupid, TEST_USERS.testGroupId));

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultCurrency: "EUR",
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(200);
		const responseData = (await response.json()) as UpdateGroupMetadataResponse;
		expect(responseData.metadata.defaultCurrency).toBe("EUR");
		expect(responseData.metadata.defaultShare).toEqual({
			[TEST_USERS.user1.id]: 50,
			[TEST_USERS.user2.id]: 50,
		}); // Should preserve existing
	});

	it("should return 401 for missing authentication token", async () => {
		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: { [TEST_USERS.user1.id]: 100 },
		};

		const request = createMockRequest("POST", requestBody); // No token
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(401);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Unauthorized");
	});

	it("should return 401 for invalid authentication token", async () => {
		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: { [TEST_USERS.user1.id]: 100 },
		};

		const request = createMockRequest("POST", requestBody, "invalid-token");
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(401);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Unauthorized");
	});

	it("should return 401 for unauthorized group access", async () => {
		const requestBody: UpdateGroupMetadataRequest = {
			groupid: "999", // User is in group TEST_USERS.testGroupId, not 999
			defaultShare: { [TEST_USERS.user1.id]: 100 },
		};

		const request = createMockRequest("POST", requestBody, "test-session-id");
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(401);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Unauthorized");
	});

	it("should return 400 for invalid currency code", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultCurrency: "INVALID",
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toContain("Invalid option");
	});

	it("should return 400 when percentages do not add up to 100", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 40,
				[TEST_USERS.user2.id]: 30,
				[TEST_USERS.user3.id]: 20,
				[TEST_USERS.user4.id]: 5, // Only adds up to 95%
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toContain(
			"Default share percentages must add up to 100%",
		);
	});

	it("should return 400 when not all group members are included", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 100, // Missing users 2, 3, 4
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toContain(
			"All group members must have a default share percentage",
		);
	});

	it("should return 400 when invalid user IDs are included", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 25,
				[TEST_USERS.user2.id]: 25,
				[TEST_USERS.user3.id]: 25,
				[TEST_USERS.user4.id]: 25,
				"999": 0, // User 999 is not in group 1
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Invalid user IDs: users not in group");
	});

	it("should return 400 for negative percentages", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: -10,
				[TEST_USERS.user2.id]: 60,
				[TEST_USERS.user3.id]: 30,
				[TEST_USERS.user4.id]: 20,
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toContain(
			"Default share percentages must be positive",
		);
	});

	it("should return 400 for empty defaultShare object", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toContain(
			"Default share percentages must add up to 100%",
		);
	});

	it("should return 405 for non-POST method", async () => {
		const request = createMockRequest("GET", {}, "test-session-id");
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(405);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Method not allowed");
	});

	it("should handle floating point precision correctly", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 25.25,
				[TEST_USERS.user2.id]: 25.25,
				[TEST_USERS.user3.id]: 25.25,
				[TEST_USERS.user4.id]: 24.25, // Total: 100.00
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(200); // Should succeed with proper floating point percentages
	});

	it("should successfully update with all 4 group members", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 25,
				[TEST_USERS.user2.id]: 25,
				[TEST_USERS.user3.id]: 25,
				[TEST_USERS.user4.id]: 25,
			},
			defaultCurrency: "INR",
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(200);
		const responseData = (await response.json()) as UpdateGroupMetadataResponse;
		expect(responseData.metadata.defaultShare).toEqual({
			[TEST_USERS.user1.id]: 25,
			[TEST_USERS.user2.id]: 25,
			[TEST_USERS.user3.id]: 25,
			[TEST_USERS.user4.id]: 25,
		});
		expect(responseData.metadata.defaultCurrency).toBe("INR");
	});

	it("should use default currency USD when no currency provided and no existing currency", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: TEST_USERS.testGroupId,
			defaultShare: {
				[TEST_USERS.user1.id]: 25,
				[TEST_USERS.user2.id]: 25,
				[TEST_USERS.user3.id]: 25,
				[TEST_USERS.user4.id]: 25,
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(200);
		const responseData = (await response.json()) as UpdateGroupMetadataResponse;
		expect(responseData.metadata.defaultCurrency).toBe("USD");
	});
});

describe("Group Details Handler", () => {
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

	describe("handleGroupDetails Success Cases", () => {
		it("should return group details with users, metadata, and budgets for authenticated user", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const request = createMockRequest("GET", undefined, cookies);
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(200);
			const responseData = (await response.json()) as GroupDetailsResponse;

			// Check all required fields are present
			expect(responseData.groupid).toBe(TEST_USERS.testGroupId);
			expect(responseData.groupName).toBe("Test Group");
			expect(Array.isArray(responseData.budgets)).toBe(true);
			expect(responseData.metadata).toBeDefined();
			expect(Array.isArray(responseData.users)).toBe(true);

			// Check metadata structure
			expect(responseData.metadata.defaultCurrency).toBeDefined();
			expect(responseData.metadata.defaultShare).toBeDefined();

			// Check users have required fields
			expect(responseData.users.length).toBeGreaterThan(0);
			responseData.users.forEach((user) => {
				expect(user.Id).toBeDefined();
				expect(user.FirstName).toBeDefined();
				expect(user.LastName).toBeDefined();
				expect(user.groupid).toBe(TEST_USERS.testGroupId);
			});
		});

		it("should include first_name and last_name for all users in group", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const request = createMockRequest("GET", undefined, cookies);
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(200);
			const responseData = (await response.json()) as GroupDetailsResponse;

			responseData.users.forEach((user) => {
				expect(typeof user.FirstName).toBe("string");
				expect(typeof user.LastName).toBe("string");
				expect(user.FirstName?.length).toBeGreaterThan(0);
			});
		});

		it("should parse budgets array correctly from JSON", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const request = createMockRequest("GET", undefined, cookies);
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(200);
			const responseData = (await response.json()) as GroupDetailsResponse;

			expect(Array.isArray(responseData.budgets)).toBe(true);
			expect(responseData.budgets.some(b => b.budgetName === "house")).toBe(true);
			expect(responseData.budgets.some(b => b.budgetName === "food")).toBe(true);
		});
	});

	describe("handleGroupDetails Error Cases", () => {
		it("should return 401 for unauthenticated requests (no session token)", async () => {
			const request = createMockRequest("GET", undefined, undefined);
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(401);
		});

		it("should return 401 for invalid session token", async () => {
			const request = createMockRequest("GET", undefined, "invalid-token");
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(401);
		});

		it("should return 405 for non-GET requests", async () => {
			const request = createMockRequest("POST", {}, "test-session-id");
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(405);
		});

		it("should return 405 for PUT requests", async () => {
			const request = createMockRequest("PUT", {}, "test-session-id");
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(405);
		});

		it("should return 405 for DELETE requests", async () => {
			const request = createMockRequest("DELETE", {}, "test-session-id");
			const response = await handleGroupDetails(request, env);

			expect(response.status).toBe(405);
		});
	});
});

describe("Extended Group Metadata Handler", () => {
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

	describe("Group Name Updates", () => {
		it("should update group name successfully with valid input", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "Updated Group Name",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);
			const responseData =
				(await response.json()) as UpdateGroupMetadataResponse;
			expect(responseData.message).toContain("successfully");

			// Verify in database
			const db = getDb(env);
			const groupResult = await db
				.select({ groupName: groups.groupName })
				.from(groups)
				.where(eq(groups.groupid, TEST_USERS.testGroupId))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			expect(groupResult[0].groupName).toBe("Updated Group Name");
		});

		it("should trim whitespace from group name", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "  Trimmed Group Name  ",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify trimmed name in database
			const db = getDb(env);
			const groupResult = await db
				.select({ groupName: groups.groupName })
				.from(groups)
				.where(eq(groups.groupid, TEST_USERS.testGroupId))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			expect(groupResult[0].groupName).toBe("Trimmed Group Name");
		});

		it("should return 400 for empty group name after trimming", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "   ",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
		});

		it("should handle special characters in group name appropriately", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "Family & Friends Group 2024 🏠",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify special characters are preserved
			const db = getDb(env);
			const groupResult = await db
				.select({ groupName: groups.groupName })
				.from(groups)
				.where(eq(groups.groupid, TEST_USERS.testGroupId))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			expect(groupResult[0].groupName).toBe("Family & Friends Group 2024 🏠");
		});
	});

	describe("Budget Category Updates", () => {
		it("should add new budget categories to existing list", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = Date.now().toString();
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `house_${testId}`, description: null },
					{ budgetName: `food_${testId}`, description: null },
					{ budgetName: `transportation_${testId}`, description: null },
					{ budgetName: `entertainment_${testId}`, description: null },
					{ budgetName: `vacation_${testId}`, description: null },
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets in new group_budgets table
			const db = getDb(env);
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			const budgetNames = budgetResults.map(b => b.budgetName);
			expect(budgetNames.some(name => name.startsWith("vacation_"))).toBe(true);
			expect(budgetNames.some(name => name.startsWith("entertainment_"))).toBe(true);
			expect(budgetNames.some(name => name.startsWith("transportation_"))).toBe(true);
		});

		it("should remove budget categories from existing list", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// First, create some initial budgets using newBudgets
			const testId = `removal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const initialRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `house_${testId}`, description: null },
					{ budgetName: `food_${testId}`, description: null },
					{ budgetName: `transportation_${testId}`, description: null },
				],
			};
			
			await handleUpdateGroupMetadata(
				createMockRequest("POST", initialRequest, cookies),
				env,
			);

			// Get the actual IDs of the created budgets
			const db = getDb(env);
			const createdBudgets = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						or(
							eq(groupBudgets.budgetName, `house_${testId}`),
							eq(groupBudgets.budgetName, `food_${testId}`),
							eq(groupBudgets.budgetName, `transportation_${testId}`)
						),
						isNull(groupBudgets.deleted)
					)
				);
			
			const foodBudgetId = createdBudgets.find(b => b.budgetName === `food_${testId}`)!.id;

			// Then remove some budgets (keep only food)
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [{ id: foodBudgetId, budgetName: `food_${testId}`, description: null }], // Remove 'house' and 'transportation'
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets in new group_budgets table
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			const budgetNames = budgetResults.map(b => b.budgetName);
			expect(budgetNames.length).toBe(1);
			expect(budgetNames[0].startsWith("food_")).toBe(true);
			expect(budgetNames.some(name => name.startsWith("house_"))).toBe(false);
		});

		it("should return 400 for duplicate budget names in request", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = Date.now().toString();
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					{ id: `budget_1_${testId}`, budgetName: `house_${testId}`, description: null },
					{ id: `budget_2_${testId}`, budgetName: `food_${testId}`, description: null },
					{ id: `budget_3_${testId}`, budgetName: `house_${testId}`, description: null }, // Duplicate name
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
			const result = (await response.json()) as { error: string };
			expect(result.error).toContain("Budget names must be unique");
		});

		it("should return 400 for budget name conflict with existing budget", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = Date.now().toString();
			
			// First, add some budgets
			const setupRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					{ id: `budget_existing_${testId}`, budgetName: `existing_budget_${testId}`, description: null },
				],
			};
			const setupReq = createMockRequest("POST", setupRequest, cookies);
			const setupResponse = await handleUpdateGroupMetadata(setupReq, env);
			expect(setupResponse.status).toBe(200);

			// Now try to add a budget with the same name (but different ID)
			const conflictRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					{ id: `budget_existing_${testId}`, budgetName: `existing_budget_${testId}`, description: null }, // Keep existing
					{ id: `budget_new_${testId}`, budgetName: `existing_budget_${testId}`, description: null }, // Conflict!
				],
			};

			const request = createMockRequest("POST", conflictRequest, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
			const result = (await response.json()) as { error: string };
			expect(result.error).toContain("Budget names must be unique");
		});

		it("should handle empty budgets array", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify no budgets in new group_budgets table
			const db = getDb(env);
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			expect(budgetResults).toEqual([]);
		});

		it("should preserve existing budgets when not updated", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// First update to set initial budgets using newBudgets
			const testId = Date.now().toString();
			const initialRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `house_${testId}`, description: null },
					{ budgetName: `food_${testId}`, description: null },
					{ budgetName: `utilities_${testId}`, description: null }
				],
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", initialRequest, cookies),
				env,
			);

			// Update only currency, should preserve budgets
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultCurrency: "EUR",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets are preserved in new group_budgets table
			const db = getDb(env);
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			const budgetNames = budgetResults.map(b => b.budgetName);
			expect(budgetNames.some(name => name.startsWith("house_"))).toBe(true);
			expect(budgetNames.some(name => name.startsWith("food_"))).toBe(true);
			expect(budgetNames.some(name => name.startsWith("utilities_"))).toBe(true);
		});

		it("should allow budget names with spaces and hyphens", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = Date.now().toString();
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: "house rent", description: null },
					{ budgetName: "food-delivery", description: null },
					{ budgetName: "car_maintenance", description: null }
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets in new group_budgets table
			const db = getDb(env);
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			const budgetNames = budgetResults.map(b => b.budgetName);
			expect(budgetNames).toContain("house rent");
			expect(budgetNames).toContain("food-delivery");
			expect(budgetNames).toContain("car_maintenance");
		});

		it("should reject budget names with invalid characters", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = Date.now().toString();
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					{ id: `budget_1_${testId}`, budgetName: "valid-budget", description: null },
					{ id: `budget_2_${testId}`, budgetName: "invalid!@#", description: null }
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
			const responseData = (await response.json()) as { error: string };
			expect(responseData.error).toContain(
				"Budget names can only contain letters, numbers, spaces, hyphens, and underscores",
			);
		});
	});

	describe("Budget Separation Logic (budgets vs newBudgets)", () => {
		it("should ignore non-existent budget IDs in body.budgets", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = `separation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			
			// First create one existing budget using newBudgets (correct way)
			const setupRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `existing_${testId}`, description: null },
				],
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", setupRequest, cookies),
				env,
			);

			const db = getDb(env);
			
			// Get the actual ID of the created budget
			const createdBudgets = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						eq(groupBudgets.budgetName, `existing_${testId}`),
						isNull(groupBudgets.deleted)
					)
				);
			expect(createdBudgets.length).toBe(1);
			const existingBudgetId = createdBudgets[0].id;
			
			// Count budgets before the problematic request
			const budgetsBeforeRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// Now send a request with mix of existing and non-existent budget IDs
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					// This exists, should be processed
					{ id: existingBudgetId, budgetName: `existing_updated_${testId}`, description: "updated" },
					// These don't exist, should be IGNORED (not created)
					{ id: `budget_nonexistent_1_${testId}`, budgetName: `fake1_${testId}`, description: null },
					{ id: `budget_nonexistent_2_${testId}`, budgetName: `fake2_${testId}`, description: null },
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify that only existing budget was updated, non-existent ones were ignored
			const budgetsAfterRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// The key test: non-existent budget IDs should be ignored (not created)
			// Our specific budget should be updated, others from previous tests may be deleted (that's expected behavior)
			// So let's focus on testing the specific behavior we care about

			// The existing budget should be updated
			const existingBudget = budgetsAfterRequest.find(b => b.id === existingBudgetId);
			expect(existingBudget).toBeDefined();
			expect(existingBudget?.budgetName).toBe(`existing_updated_${testId}`);
			expect(existingBudget?.description).toBe("updated");

			// Non-existent budget names should not appear anywhere (key test: they were ignored, not created)
			const budgetNames = budgetsAfterRequest.map(b => b.budgetName);
			expect(budgetNames.some(name => name.includes(`fake1_${testId}`))).toBe(false);
			expect(budgetNames.some(name => name.includes(`fake2_${testId}`))).toBe(false);
			
			// Verify that only 1 budget exists now (our updated budget - the fake ones were ignored)
			// Other budgets from previous tests getting deleted is expected behavior for body.budgets
			expect(budgetsAfterRequest.length).toBe(1);
		});

		it("should create new budgets only from body.newBudgets", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = `newbudgets_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const db = getDb(env);
			
			// Count budgets before request
			const budgetsBeforeRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// Send request with newBudgets only
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `newbudget1_${testId}`, description: "First new budget" },
					{ budgetName: `newbudget2_${testId}`, description: null },
					{ budgetName: `newbudget3_${testId}`, description: "Third new budget" },
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify new budgets were created
			const budgetsAfterRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// Should have 3 more budgets than before
			expect(budgetsAfterRequest.length).toBe(budgetsBeforeRequest.length + 3);

			// All new budgets should exist with proper generated IDs
			const budgetNames = budgetsAfterRequest.map(b => b.budgetName);
			expect(budgetNames).toContain(`newbudget1_${testId}`);
			expect(budgetNames).toContain(`newbudget2_${testId}`);
			expect(budgetNames).toContain(`newbudget3_${testId}`);

			// New budgets should have generated IDs starting with 'budget_'
			const newBudgets = budgetsAfterRequest.filter(b => b.budgetName.includes(`newbudget`));
			expect(newBudgets.length).toBe(3);
			newBudgets.forEach(budget => {
				expect(budget.id).toMatch(/^budget_[a-zA-Z0-9]+$/);
			});
		});

		it("should handle mixed scenario: existing budgets + new budgets", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = `mixed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			
			// First create some existing budgets using newBudgets
			const setupRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `existing1_${testId}`, description: null },
					{ budgetName: `existing2_${testId}`, description: null },
				],
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", setupRequest, cookies),
				env,
			);

			const db = getDb(env);
			
			// Get the actual IDs of the created budgets
			const createdBudgets = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						or(
							eq(groupBudgets.budgetName, `existing1_${testId}`),
							eq(groupBudgets.budgetName, `existing2_${testId}`)
						),
						isNull(groupBudgets.deleted)
					)
				);
			expect(createdBudgets.length).toBe(2);
			const existing1Id = createdBudgets.find(b => b.budgetName === `existing1_${testId}`)!.id;
			const existing2Id = createdBudgets.find(b => b.budgetName === `existing2_${testId}`)!.id;
			
			const budgetsBeforeRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// Mixed request: update existing + ignore non-existent + create new
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					// Update existing
					{ id: existing1Id, budgetName: `existing1_updated_${testId}`, description: "updated" },
					// Keep existing 
					{ id: existing2Id, budgetName: `existing2_${testId}`, description: null },
					// Non-existent (should be ignored)
					{ id: `budget_fake_${testId}`, budgetName: `fake_${testId}`, description: null },
				],
				newBudgets: [
					// Create new budgets
					{ budgetName: `brand_new1_${testId}`, description: "New budget 1" },
					{ budgetName: `brand_new2_${testId}`, description: null },
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			const budgetsAfterRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// Should have 4 total budgets: 2 existing (kept/updated) + 2 new budgets (created)
			// Previous tests' budgets get deleted by the replacement logic (expected behavior)
			expect(budgetsAfterRequest.length).toBe(4);

			const budgetNames = budgetsAfterRequest.map(b => b.budgetName);

			// Existing budget should be updated
			expect(budgetNames).toContain(`existing1_updated_${testId}`);
			expect(budgetNames).toContain(`existing2_${testId}`);

			// New budgets should be created
			expect(budgetNames).toContain(`brand_new1_${testId}`);
			expect(budgetNames).toContain(`brand_new2_${testId}`);

			// Non-existent budget should be ignored
			expect(budgetNames.some(name => name.includes(`fake_${testId}`))).toBe(false);
		});

		it("should handle edge case: only non-existent budget IDs in body.budgets", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const db = getDb(env);
			
			const budgetsBeforeRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			// Send request with only non-existent budget IDs
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [
					// All non-existent, should all be ignored
					{ id: `budget_fake1_${testId}`, budgetName: `fake1_${testId}`, description: null },
					{ id: `budget_fake2_${testId}`, budgetName: `fake2_${testId}`, description: null },
					{ id: `budget_fake3_${testId}`, budgetName: `fake3_${testId}`, description: null },
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Should have 0 budgets because all budget IDs were non-existent (ignored)
			// and body.budgets is a replacement operation, so all existing budgets get deleted
			const budgetsAfterRequest = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			expect(budgetsAfterRequest.length).toBe(0);

			// None of the fake budget names should exist
			const budgetNames = budgetsAfterRequest.map(b => b.budgetName);
			expect(budgetNames.some(name => name.includes(`fake1_${testId}`))).toBe(false);
			expect(budgetNames.some(name => name.includes(`fake2_${testId}`))).toBe(false);
			expect(budgetNames.some(name => name.includes(`fake3_${testId}`))).toBe(false);
		});

		it("should delete all existing budgets when empty budgets array is provided", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const testId = `delete_all_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const db = getDb(env);
			
			// First create some budgets to delete
			const setupRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				newBudgets: [
					{ budgetName: `budget1_${testId}`, description: "Budget 1" },
					{ budgetName: `budget2_${testId}`, description: "Budget 2" },
					{ budgetName: `budget3_${testId}`, description: "Budget 3" },
				],
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", setupRequest, cookies),
				env,
			);

			// Verify budgets were created
			const budgetsBeforeDelete = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			expect(budgetsBeforeDelete.length).toBeGreaterThanOrEqual(3);
			
			// Find our test budgets
			const testBudgets = budgetsBeforeDelete.filter(b => b.budgetName.includes(`${testId}`));
			expect(testBudgets.length).toBe(3);

			// Now delete all budgets by providing empty budgets array
			const deleteRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [], // Empty array should delete all existing budgets
			};

			const request = createMockRequest("POST", deleteRequest, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify all budgets are deleted
			const budgetsAfterDelete = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);

			expect(budgetsAfterDelete.length).toBe(0);

			// Double-check by looking for our specific test budgets
			const testBudgetsAfterDelete = budgetsAfterDelete.filter(b => b.budgetName.includes(`${testId}`));
			expect(testBudgetsAfterDelete.length).toBe(0);

			// Verify the budgets are marked as deleted (soft delete), not actually removed from DB
			const deletedBudgets = await db
				.select()
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNotNull(groupBudgets.deleted)
					)
				);

			const deletedTestBudgets = deletedBudgets.filter(b => b.budgetName.includes(`${testId}`));
			expect(deletedTestBudgets.length).toBe(3);

			// Verify deleted timestamp is set
			deletedTestBudgets.forEach(budget => {
				expect(budget.deleted).not.toBeNull();
				expect(budget.deleted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/); // SQLite datetime format
			});
		});
	});

	describe("Combined Updates", () => {
		it("should update multiple fields in single request (groupName + budgets + currency + shares)", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// First clear any existing budgets by setting empty budgets array
			const clearRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [], // Clear all existing budgets
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", clearRequest, cookies),
				env,
			);

			const testId = Date.now().toString();
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "Multi-Update Group",
				newBudgets: [
					{ budgetName: "rent", description: null },
					{ budgetName: "groceries", description: null },
					{ budgetName: "utilities", description: null }
				],
				defaultCurrency: "EUR",
				defaultShare: {
					[TEST_USERS.user1.id]: 25,
					[TEST_USERS.user2.id]: 25,
					[TEST_USERS.user3.id]: 25,
					[TEST_USERS.user4.id]: 25,
				},
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify all fields updated
			const db = getDb(env);
			const groupResult = await db
				.select({
					groupName: groups.groupName,
					metadata: groups.metadata,
				})
				.from(groups)
				.where(eq(groups.groupid, TEST_USERS.testGroupId))
				.limit(1);
			expect(groupResult).toHaveLength(1);

			expect(groupResult[0].groupName).toBe("Multi-Update Group");

			// Verify budgets in new group_budgets table
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			const budgetNames = budgetResults.map(b => b.budgetName);
			expect(budgetNames).toEqual(["rent", "groceries", "utilities"]);

			const metadata = JSON.parse(groupResult[0].metadata || "{}");
			expect(metadata.defaultCurrency).toBe("EUR");
			expect(metadata.defaultShare[TEST_USERS.user1.id]).toBe(25);
			expect(metadata.defaultShare[TEST_USERS.user2.id]).toBe(25);
			expect(metadata.defaultShare[TEST_USERS.user3.id]).toBe(25);
			expect(metadata.defaultShare[TEST_USERS.user4.id]).toBe(25);
		});

		it("should handle partial updates (only some fields changed)", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// First clear any existing budgets by setting empty budgets array
			const clearRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				budgets: [], // Clear all existing budgets
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", clearRequest, cookies),
				env,
			);

			// Update only group name and budgets
			const testId = Date.now().toString();
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "Partial Update Group",
				newBudgets: [{ budgetName: "new-category", description: null }],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify only specified fields updated
			const db = getDb(env);
			const groupResult = await db
				.select({
					groupName: groups.groupName,
					metadata: groups.metadata,
				})
				.from(groups)
				.where(eq(groups.groupid, TEST_USERS.testGroupId))
				.limit(1);
			expect(groupResult).toHaveLength(1);

			expect(groupResult[0].groupName).toBe("Partial Update Group");

			// Verify budgets in new group_budgets table
			const budgetResults = await db
				.select({ budgetName: groupBudgets.budgetName })
				.from(groupBudgets)
				.where(
					and(
						eq(groupBudgets.groupId, TEST_USERS.testGroupId),
						isNull(groupBudgets.deleted)
					)
				);
			
			const budgetNames = budgetResults.map(b => b.budgetName);
			expect(budgetNames).toEqual(["new-category"]);

			// Metadata should preserve existing values
			const metadata = JSON.parse(groupResult[0].metadata || "{}");
			expect(metadata.defaultCurrency).toBeDefined(); // Should still exist
		});
	});

	describe("Error Cases", () => {
		it("should return 400 for requests with no changes", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				// No fields to update
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthorized users", async () => {
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				groupName: "Unauthorized Update",
			};

			const request = createMockRequest("POST", requestBody, "invalid-session");
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid percentage totals (≠ 100%)", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 60,
					[TEST_USERS.user2.id]: 30, // Total = 90%, not 100%
				},
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
		});

		it("should return 400 for invalid currency codes", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultCurrency: "INVALID",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
		});

		it("should return 400 for negative percentages", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: -10,
					[TEST_USERS.user2.id]: 110,
				},
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
		});

		it("should handle precise percentage validation with 3 users (infinite decimals)", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Update group to use only 3 users for this test
			const db = getDb(env);
			await db
				.update(groups)
				.set({
					userids: `["${TEST_USERS.user1.id}", "${TEST_USERS.user2.id}", "${TEST_USERS.user3.id}"]`,
					metadata: `{"defaultCurrency": "USD", "defaultShare": {"${TEST_USERS.user1.id}": 33.333, "${TEST_USERS.user2.id}": 33.333, "${TEST_USERS.user3.id}": 33.334}}`,
				})
				.where(eq(groups.groupid, TEST_USERS.testGroupId));

			// Test case 1: Perfect precision - should pass (total = 100.000)
			const perfectRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 33.333,
					[TEST_USERS.user2.id]: 33.333,
					[TEST_USERS.user3.id]: 33.334,
				},
			};

			const perfectResponse = await handleUpdateGroupMetadata(
				createMockRequest("POST", perfectRequest, cookies),
				env,
			);
			expect(perfectResponse.status).toBe(200);

			// Test case 2: Within 0.001 tolerance - should pass (total = 99.9995, difference = 0.0005)
			const toleranceRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 33.3335,
					[TEST_USERS.user2.id]: 33.333,
					[TEST_USERS.user3.id]: 33.333, // Total = 99.9995, difference from 100 = 0.0005 < 0.001
				},
			};

			const toleranceResponse = await handleUpdateGroupMetadata(
				createMockRequest("POST", toleranceRequest, cookies),
				env,
			);
			expect(toleranceResponse.status).toBe(200);

			// Test case 3: Outside 0.001 tolerance - should fail (total = 99.997, difference = 0.003)
			const failRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 33.333,
					[TEST_USERS.user2.id]: 33.332,
					[TEST_USERS.user3.id]: 33.332, // Total = 99.997, difference from 100 = 0.003 > 0.001
				},
			};

			const failResponse = await handleUpdateGroupMetadata(
				createMockRequest("POST", failRequest, cookies),
				env,
			);
			expect(failResponse.status).toBe(400);

			// Test case 4: High precision with many decimals - should pass (total = 100.000)
			const precisionRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 33.33333,
					[TEST_USERS.user2.id]: 33.33333,
					[TEST_USERS.user3.id]: 33.33334, // Total = 100.000
				},
			};

			const precisionResponse = await handleUpdateGroupMetadata(
				createMockRequest("POST", precisionRequest, cookies),
				env,
			);
			expect(precisionResponse.status).toBe(200);

			// Test case 5: Slightly over 100% but within tolerance - should pass (total = 100.0005)
			const overRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 33.3335,
					[TEST_USERS.user2.id]: 33.333,
					[TEST_USERS.user3.id]: 33.334, // Total = 100.0005, difference = 0.0005 < 0.001
				},
			};

			const overResponse = await handleUpdateGroupMetadata(
				createMockRequest("POST", overRequest, cookies),
				env,
			);
			expect(overResponse.status).toBe(200);

			// Test case 6: Way over tolerance - should fail (total = 100.5)
			const wayOverRequest: UpdateGroupMetadataRequest = {
				groupid: TEST_USERS.testGroupId,
				defaultShare: {
					[TEST_USERS.user1.id]: 33.5,
					[TEST_USERS.user2.id]: 33.5,
					[TEST_USERS.user3.id]: 33.5, // Total = 100.5, way outside tolerance
				},
			};

			const wayOverResponse = await handleUpdateGroupMetadata(
				createMockRequest("POST", wayOverRequest, cookies),
				env,
			);
			expect(wayOverResponse.status).toBe(400);
		});
	});
});
