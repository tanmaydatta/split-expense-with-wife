/// <reference types="vitest" />
import { env } from "cloudflare:test";
// Vitest globals are available through the test environment
import {
	handleUpdateGroupMetadata,
	handleGroupDetails,
} from "../handlers/group";
import {
	setupAndCleanDatabase,
	createTestUserData,
	createMockRequest,
	signInAndGetCookies,
} from "./test-utils";
import { getDb } from "../db";
import { groups } from "../db/schema/schema";
import { eq } from "drizzle-orm";
import type {
	UpdateGroupMetadataRequest,
	UpdateGroupMetadataResponse,
	GroupDetailsResponse,
} from "../../../shared-types";

describe("Group Metadata Handler", () => {
	let TEST_USERS: Record<string, Record<string, string>>;
	beforeEach(async () => {
		await setupAndCleanDatabase(env);
		TEST_USERS = await createTestUserData(env);
	});

	it("should successfully update both defaultShare and defaultCurrency", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: 1,
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
			.where(eq(groups.groupid, 1))
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
			.where(eq(groups.groupid, 1));

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: 1,
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
			.where(eq(groups.groupid, 1))
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
			.where(eq(groups.groupid, 1));

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: 1,
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
			groupid: 1,
			defaultShare: { "1": 100 },
		};

		const request = createMockRequest("POST", requestBody); // No token
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(401);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Unauthorized");
	});

	it("should return 401 for invalid authentication token", async () => {
		const requestBody: UpdateGroupMetadataRequest = {
			groupid: 1,
			defaultShare: { "1": 100 },
		};

		const request = createMockRequest("POST", requestBody, "invalid-token");
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(401);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Unauthorized");
	});

	it("should return 401 for unauthorized group access", async () => {
		const requestBody: UpdateGroupMetadataRequest = {
			groupid: 999, // User is in group 1, not 999
			defaultShare: { "1": 100 },
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
			groupid: 1,
			defaultCurrency: "INVALID",
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe("Invalid currency code");
	});

	it("should return 400 when percentages do not add up to 100", async () => {
		const cookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);

		const requestBody: UpdateGroupMetadataRequest = {
			groupid: 1,
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
		expect(responseData.error).toBe(
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
			groupid: 1,
			defaultShare: {
				[TEST_USERS.user1.id]: 100, // Missing users 2, 3, 4
			},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe(
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
			groupid: 1,
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
			groupid: 1,
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
		expect(responseData.error).toBe(
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
			groupid: 1,
			defaultShare: {},
		};

		const request = createMockRequest("POST", requestBody, cookies);
		const response = await handleUpdateGroupMetadata(request, env);

		expect(response.status).toBe(400);
		const responseData = (await response.json()) as { error: string };
		expect(responseData.error).toBe(
			"All group members must have a default share percentage",
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
			groupid: 1,
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
			groupid: 1,
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
			groupid: 1,
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
	let TEST_USERS: Record<string, Record<string, string>>;
	beforeEach(async () => {
		await setupAndCleanDatabase(env);
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
			expect(responseData.groupid).toBe(1);
			expect(responseData.groupName).toBe("Test Group");
			expect(Array.isArray(responseData.budgets)).toBe(true);
			expect(responseData.metadata).toBeDefined();
			expect(Array.isArray(responseData.users)).toBe(true);

			// Check metadata structure
			expect(responseData.metadata.defaultCurrency).toBeDefined();
			expect(responseData.metadata.defaultShare).toBeDefined();

			// Check users have required fields
			expect(responseData.users.length).toBeGreaterThan(0);
			// biome-ignore lint/complexity/noForEach: test assertion iteration
			responseData.users.forEach((user) => {
				expect(user.Id).toBeDefined();
				expect(user.FirstName).toBeDefined();
				expect(user.LastName).toBeDefined();
				expect(user.groupid).toBe(1);
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

			// biome-ignore lint/complexity/noForEach: test assertion iteration
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
			expect(responseData.budgets).toContain("house");
			expect(responseData.budgets).toContain("food");
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
	let TEST_USERS: Record<string, Record<string, string>>;
	beforeEach(async () => {
		await setupAndCleanDatabase(env);
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
				groupid: 1,
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
				.where(eq(groups.groupid, 1))
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
				groupid: 1,
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
				.where(eq(groups.groupid, 1))
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
				groupid: 1,
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
				groupid: 1,
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
				.where(eq(groups.groupid, 1))
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

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: [
					"house",
					"food",
					"transportation",
					"entertainment",
					"vacation",
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets in database
			const db = getDb(env);
			const groupResult = await db
				.select({ budgets: groups.budgets })
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			const budgets = JSON.parse(groupResult[0].budgets || "[]");

			expect(budgets).toContain("vacation");
			expect(budgets).toContain("entertainment");
			expect(budgets).toContain("transportation");
		});

		it("should remove budget categories from existing list", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: ["food"], // Remove 'house' and 'transportation'
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets in database
			const db = getDb(env);
			const groupResult = await db
				.select({ budgets: groups.budgets })
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			const budgets = JSON.parse(groupResult[0].budgets || "[]");

			expect(budgets).toEqual(["food"]);
			expect(budgets).not.toContain("house");
		});

		it("should handle duplicate budget names (deduplicate)", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: [
					"house",
					"food",
					"house",
					"transportation",
					"food",
					"entertainment",
				],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify no duplicates in database
			const db = getDb(env);
			const groupResult = await db
				.select({ budgets: groups.budgets })
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			const budgets = JSON.parse(groupResult[0].budgets || "[]");

			expect(budgets.length).toBe(4); // Should be unique
			expect(budgets).toContain("house");
			expect(budgets).toContain("food");
			expect(budgets).toContain("transportation");
			expect(budgets).toContain("entertainment");
		});

		it("should handle empty budgets array", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: [],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify empty array in database
			const db = getDb(env);
			const groupResult = await db
				.select({ budgets: groups.budgets })
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			const budgets = JSON.parse(groupResult[0].budgets || "[]");

			expect(budgets).toEqual([]);
		});

		it("should preserve existing budgets when not updated", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// First update to set initial budgets
			const initialRequest: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: ["house", "food", "utilities"],
			};
			await handleUpdateGroupMetadata(
				createMockRequest("POST", initialRequest, cookies),
				env,
			);

			// Update only currency, should preserve budgets
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				defaultCurrency: "EUR",
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets are preserved
			const db = getDb(env);
			const groupResult = await db
				.select({ budgets: groups.budgets })
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			const budgets = JSON.parse(groupResult[0].budgets || "[]");

			expect(budgets).toContain("house");
			expect(budgets).toContain("food");
			expect(budgets).toContain("utilities");
		});

		it("should allow budget names with spaces and hyphens", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: ["house rent", "food-delivery", "car_maintenance"],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify budgets in database
			const db = getDb(env);
			const groupResult = await db
				.select({ budgets: groups.budgets })
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);
			const budgets = JSON.parse(groupResult[0].budgets || "[]");

			expect(budgets).toContain("house rent");
			expect(budgets).toContain("food-delivery");
			expect(budgets).toContain("car_maintenance");
		});

		it("should reject budget names with invalid characters", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				budgets: ["valid-budget", "invalid!@#"],
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

	describe("Combined Updates", () => {
		it("should update multiple fields in single request (groupName + budgets + currency + shares)", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				groupName: "Multi-Update Group",
				budgets: ["rent", "groceries", "utilities"],
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
					budgets: groups.budgets,
					metadata: groups.metadata,
				})
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);

			expect(groupResult[0].groupName).toBe("Multi-Update Group");

			const budgets = JSON.parse(groupResult[0].budgets || "[]");
			expect(budgets).toEqual(["rent", "groceries", "utilities"]);

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

			// Update only group name and budgets
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
				groupName: "Partial Update Group",
				budgets: ["new-category"],
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(200);

			// Verify only specified fields updated
			const db = getDb(env);
			const groupResult = await db
				.select({
					groupName: groups.groupName,
					budgets: groups.budgets,
					metadata: groups.metadata,
				})
				.from(groups)
				.where(eq(groups.groupid, 1))
				.limit(1);
			expect(groupResult).toHaveLength(1);

			expect(groupResult[0].groupName).toBe("Partial Update Group");

			const budgets = JSON.parse(groupResult[0].budgets || "[]");
			expect(budgets).toEqual(["new-category"]);

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
				groupid: 1,
				// No fields to update
			};

			const request = createMockRequest("POST", requestBody, cookies);
			const response = await handleUpdateGroupMetadata(request, env);

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthorized users", async () => {
			const requestBody: UpdateGroupMetadataRequest = {
				groupid: 1,
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
				groupid: 1,
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
				groupid: 1,
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
				groupid: 1,
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
				.where(eq(groups.groupid, 1));

			// Test case 1: Perfect precision - should pass (total = 100.000)
			const perfectRequest: UpdateGroupMetadataRequest = {
				groupid: 1,
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
				groupid: 1,
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
				groupid: 1,
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
				groupid: 1,
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
				groupid: 1,
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
				groupid: 1,
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
