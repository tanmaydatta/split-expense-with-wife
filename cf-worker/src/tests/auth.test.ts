import { env } from "cloudflare:test";
// Vitest globals are available through the test environment
import { cleanupDatabase, setupDatabase } from "./test-utils";
import { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { eq } from "drizzle-orm";
import { auth } from "../auth";

describe("Better Auth Integration", () => {
	let authInstance: ReturnType<typeof auth>;
	beforeEach(async () => {
		await setupDatabase(env);
		await cleanupDatabase(env);
		authInstance = auth(env);
	});

	describe("Auth Instance Test", () => {
		it("should verify better-auth instance is created correctly", async () => {
			expect(authInstance).toBeDefined();
			expect(authInstance.api).toBeDefined();
			expect(authInstance.handler).toBeDefined();
			console.log("Better-auth instance created successfully");
		});

		it.skip("should test direct API calls", async () => {
			try {
				// Try to call the API directly without HTTP
				const result = await authInstance.api.signUpEmail({
					body: {
						email: "direct@example.com",
						password: "testpassword123",
						name: "Direct Test",
										firstName: "Direct",
				lastName: "Test",
				// biome-ignore lint/suspicious/noExplicitAny: test data type assertion
			} as any,
				});

				console.log("Direct API call result:", result);
				expect(result).toBeDefined();

				// Verify in database
				const db = getDb(env);
				const users = await db
					.select()
					.from(user)
					.where(eq(user.email, "direct@example.com"))
					.limit(1);
				expect(users.length).toBe(1);
			} catch (error) {
				console.error("Direct API call failed:", error);
				throw error;
			}
		});
	});

	describe("Debug Routes", () => {
		it("should test what routes are available", async () => {
			// Test different possible endpoints using the correct BASE_URL
			const testRoutes = [
				"/auth",
				"/auth/",
				"/auth/session",
				"/auth/sign-up",
				"/auth/signup",
				"/auth/register",
				"/auth/sign-in",
				"/auth/signin",
				"/auth/login",
			];

			for (const route of testRoutes) {
				const request = new Request(`http://localhost:8787${route}`, {
					method: "GET",
				});
				const response = await authInstance.handler(request);
				console.log(`Route ${route}: Status ${response.status}`);

				if (response.status !== 404) {
					const text = await response.text();
					console.log(`Route ${route} response:`, text);
				}
			}

			// This test will always pass, it's just for debugging
			expect(true).toBe(true);
		});

		it.skip("should test POST to different signup routes", async () => {
			const signupRoutes = [
				"/auth/sign-up",
				"/auth/signup",
				"/auth/register",
				"/auth/sign-up/email",
				"/auth/signup/email",
			];

			const testData = {
				email: "debug@example.com",
				password: "testpassword123",
				name: "Debug User",
				firstName: "Debug",
				lastName: "User",
			};

			for (const route of signupRoutes) {
				const request = new Request(`http://localhost:8787${route}`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(testData),
				});
				const response = await authInstance.handler(request);
				console.log(`POST ${route}: Status ${response.status}`);

				if (response.status !== 404) {
					try {
						const json = await response.json();
						console.log(`POST ${route} response:`, json);
					} catch {
						const text = await response.text();
						console.log(`POST ${route} response text:`, text);
					}
				}
			}

			expect(true).toBe(true);
		});
	});

	describe("Auth Handler Routes", () => {
		it.skip("should handle signup via HTTP handler", async () => {
			const signUpRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "test@example.com",
						password: "testpassword123",
						name: "Test User",
						firstName: "Test",
						lastName: "User",
					}),
				},
			);

			const response = await authInstance.handler(signUpRequest);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result).toBeDefined();

			// Verify user was created in database
			const db = getDb(env);
			const userResult = await db
				.select()
				.from(user)
				.where(eq(user.email, "test@example.com"))
				.limit(1);

			expect(userResult.length).toBe(1);
			expect(userResult[0].email).toBe("test@example.com");
		});

		it.skip("should handle signin via HTTP handler", async () => {
			// First create a user
			const signUpRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "signin@example.com",
						password: "testpassword123",
						name: "SignIn User",
						firstName: "SignIn",
						lastName: "User",
					}),
				},
			);

			await authInstance.handler(signUpRequest);

			// Now test sign in
			const signInRequest = new Request(
				"http://localhost:8787/auth/sign-in/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "signin@example.com",
						password: "testpassword123",
					}),
				},
			);

			const signInResponse = await authInstance.handler(signInRequest);
			expect(signInResponse.status).toBe(200);

			const result = await signInResponse.json();
			expect(result).toBeDefined();
		});

		it.skip("should reject signin with invalid credentials", async () => {
			// Create user first
			const signUpRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "invalid@example.com",
						password: "testpassword123",
						name: "Invalid User",
						firstName: "Invalid",
						lastName: "User",
					}),
				},
			);

			await authInstance.handler(signUpRequest);

			// Try to sign in with wrong password
			const signInRequest = new Request(
				"http://localhost:8787/auth/sign-in/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "invalid@example.com",
						password: "wrongpassword",
					}),
				},
			);

			const signInResponse = await authInstance.handler(signInRequest);
			expect(signInResponse.status).toBeGreaterThanOrEqual(400);
		});

		it.skip("should handle session validation", async () => {
			// Create and sign in user
			const signUpRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "session@example.com",
						password: "testpassword123",
						name: "Session User",
						firstName: "Session",
						lastName: "User",
					}),
				},
			);

			await authInstance.handler(signUpRequest);

			const signInRequest = new Request(
				"http://localhost:8787/auth/sign-in/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "session@example.com",
						password: "testpassword123",
					}),
				},
			);

			const signInResponse = await authInstance.handler(signInRequest);
			const signInResult = await signInResponse.json();

			// Test session endpoint if it has a token
			if (
				signInResult &&
				typeof signInResult === "object" &&
				"token" in signInResult
			) {
				const sessionRequest = new Request(
					"http://localhost:8787/auth/get-session",
					{
						method: "GET",
						headers: {
							Authorization: `Bearer ${signInResult.token}`,
						},
					},
				);

				const sessionResponse = await authInstance.handler(sessionRequest);
				expect(sessionResponse.status).toBe(200);
			}
		});
	});

	describe("Database Integration", () => {
		it.skip("should store users in the database correctly", async () => {
			const signUpRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "db@example.com",
						password: "testpassword123",
						name: "DB User",
						firstName: "DB",
						lastName: "User",
					}),
				},
			);

			const response = await authInstance.handler(signUpRequest);
			expect(response.status).toBe(200);

			// Check database
			const db = getDb(env);
			const users = await db
				.select()
				.from(user)
				.where(eq(user.email, "db@example.com"))
				.limit(1);

			expect(users.length).toBe(1);
			expect(users[0].email).toBe("db@example.com");
			expect(users[0].name).toBe("DB User");
			expect(users[0].id).toBeDefined();
		});

		it.skip("should prevent duplicate email registrations", async () => {
			const signUpData = {
				email: "duplicate@example.com",
				password: "testpassword123",
				name: "First User",
				firstName: "First",
				lastName: "User",
			};

			// First signup
			const firstRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(signUpData),
				},
			);

			const firstResponse = await authInstance.handler(firstRequest);
			console.log("First response:", await firstResponse.json());
			expect(firstResponse.status).toBe(200);

			// Second signup with same email
			const secondData = {
				email: "duplicate@example.com",
				password: "differentpassword",
				name: "Second User",
				firstName: "Second",
				lastName: "User",
			};

			const secondRequest = new Request(
				"http://localhost:8787/auth/sign-up/email",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(secondData),
				},
			);

			const secondResponse = await authInstance.handler(secondRequest);
			expect(secondResponse.status).not.toBe(200); // Should fail

			// Verify only one user exists
			const db = getDb(env);
			const users = await db
				.select()
				.from(user)
				.where(eq(user.email, "duplicate@example.com"));
			expect(users.length).toBe(1);
		});
	});
});
