import type { SeedRequest, SeedResponse } from "../../../shared-types";
import {
	test,
	expect,
	factories,
	skipIfRemoteBackend,
} from "../fixtures/setup";
import { testData } from "../fixtures/test-data";
import { TestHelper } from "../utils/test-utils";
import { getCITimeout } from "../utils/test-utils";

type SeedFn = (
	payload: SeedRequest,
	options?: { authenticateAs?: string },
) => Promise<SeedResponse>;

const KNOWN_PASSWORD = "test-password-12345";

/**
 * Seed a single user without authenticating (so the test can exercise the
 * login UI directly). Returns the seeded user's username + password so the
 * test can fill the login form deterministically.
 */
async function seedKnownUser(
	seed: SeedFn,
): Promise<{ username: string; password: string }> {
	const result = await seed({
		users: [
			factories.user({
				alias: "u",
				password: KNOWN_PASSWORD,
				name: "Test User",
			}),
		],
		groups: [
			factories.group({
				alias: "g",
				members: ["u"],
				budgets: [{ alias: "b", name: "Default" }],
			}),
		],
		// NO `authenticate` field — tests need to log in via UI.
	});
	return {
		username: result.ids.users.u.username,
		password: KNOWN_PASSWORD,
	};
}

test.describe("Authentication Flow", () => {
	test.beforeAll(skipIfRemoteBackend);

	test.beforeEach(async ({ page }) => {
		// Clear storage before each test - navigate to page first to avoid security errors
		await page.goto("/");
		await page.context().clearCookies();
		await page.evaluate(() => {
			try {
				localStorage.clear();
				sessionStorage.clear();
			} catch (e) {
				// Ignore security errors in restrictive environments
				console.log("Storage clear failed:", e);
			}
		});
	});

	test("should display login form when accessing protected route without authentication", async ({
		page,
	}) => {
		await page.goto("/expenses");

		// Should stay on root page but show login form instead of dashboard content
		await expect(page).toHaveURL("/login");

		// Verify login form elements are present
		await expect(
			page.locator('[data-test-id="username-input"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-test-id="password-input"]'),
		).toBeVisible();
		await expect(page.locator('[data-test-id="login-button"]')).toBeVisible();
		await expect(page.locator('[data-test-id="login-form"]')).toBeVisible();
	});

	test("should successfully login with valid credentials", async ({
		page,
		seed,
	}) => {
		const creds = await seedKnownUser(seed);

		await page.goto("/login");
		await page.fill('[data-test-id="username-input"]', creds.username);
		await page.fill('[data-test-id="password-input"]', creds.password);
		await page.click('[data-test-id="login-button"]');

		// Verify successful login - dashboard is visible
		await page.waitForURL("/");
		await expect(page).toHaveURL("/");
		await expect(
			page.locator('[data-test-id="dashboard-container"]'),
		).toBeVisible({ timeout: getCITimeout(10000) });

		// Verify authentication by checking session cookies exist
		const cookies = await page.context().cookies();
		const sessionCookie = cookies.find((cookie) =>
			cookie.name.includes("better-auth"),
		);
		expect(sessionCookie).toBeDefined();
	});

	test("should show error message with invalid credentials", async ({
		page,
	}) => {
		await page.goto("/login");
		await page.fill(
			'[data-test-id="username-input"]',
			testData.users.invalidUser.username,
		);
		await page.fill(
			'[data-test-id="password-input"]',
			testData.users.invalidUser.password,
		);
		await page.click('[data-test-id="login-button"]');

		// Should redirect to login page with login form visible
		await expect(page).toHaveURL("/login");
		await expect(page.locator('[data-test-id="login-form"]')).toBeVisible();

		// Verify no session cookies are set after failed login
		const cookies = await page.context().cookies();
		const sessionCookie = cookies.find((cookie) =>
			cookie.name.includes("better-auth"),
		);
		expect(sessionCookie).toBeUndefined();
	});

	test("should show loading state during login", async ({ page, seed }) => {
		const creds = await seedKnownUser(seed);

		// Increase timeout for this specific test due to network mocking and potential mobile Safari flakiness.
		test.setTimeout(30000);

		// Mock all network requests to be slow, simulating a real loading condition.
		await page.route("**/*", async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
			route.continue();
		});

		await page.goto("/login");
		await page.fill('[data-test-id="username-input"]', creds.username);
		await page.fill('[data-test-id="password-input"]', creds.password);

		// Click the login button to trigger the loading state.
		await page.click('[data-test-id="login-button"]');

		// --- Mobile Safari Robustness Strategy ---

		// Step 1: Confirm the form is gone. This is a reliable first indicator of a state change.
		await expect(page.locator('[data-test-id="login-form"]')).not.toBeVisible({
			timeout: 5000,
		});

		// Step 2: Check that the loader is at least in the DOM. This avoids issues with CSS animation/visibility.
		await expect(
			page.locator('[data-test-id="login-loader"]'),
		).toBeAttached({ timeout: 5000 });

		// Step 3 (Final Check): Wait for the page to navigate away, confirming the login was successful.
		await expect(page).toHaveURL("/", { timeout: 10000 });
		await expect(
			page.locator('[data-test-id="dashboard-container"]'),
		).toBeVisible();

		// Step 4: After navigation, confirm the loader is no longer in the DOM.
		await expect(
			page.locator('[data-test-id="login-loader"]'),
		).not.toBeAttached();
	});

	test("should preserve login state across page refreshes", async ({
		page,
		seed,
	}) => {
		const creds = await seedKnownUser(seed);
		const helper = new TestHelper(page);
		await helper.login({
			username: creds.username,
			password: creds.password,
			firstName: "Test",
			userId: 0,
		});

		// Verify initial login state (dashboard is visible)
		await expect(
			page.locator('[data-test-id="dashboard-container"]'),
		).toBeVisible();

		// Refresh the page
		await page.reload();
		await page.waitForTimeout(2000);

		// Should still be authenticated - dashboard should still be visible
		await expect(page).toHaveURL("/");
		await expect(
			page.locator('[data-test-id="dashboard-container"]'),
		).toBeVisible();

		// Verify session cookies still exist after refresh
		const cookies = await page.context().cookies();
		const sessionCookie = cookies.find((cookie) =>
			cookie.name.includes("better-auth"),
		);
		expect(sessionCookie).toBeDefined();
	});

	test("should handle accessing protected routes while unauthenticated", async ({
		page,
	}) => {
		// Try to access protected route directly
		await page.goto("/budget");

		// The app behavior: stays on /budget route but shows login form instead of content
		await expect(page).toHaveURL("/login");
		await expect(page.locator('[data-test-id="login-form"]')).toBeVisible();
	});

	test("should clear user data on logout", async ({ page, seed }) => {
		const creds = await seedKnownUser(seed);
		const helper = new TestHelper(page);
		await helper.login({
			username: creds.username,
			password: creds.password,
			firstName: "Test",
			userId: 0,
		});

		// Verify user is logged in (dashboard is visible)
		await expect(
			page.locator('[data-test-id="dashboard-container"]'),
		).toBeVisible();

		// Verify session cookies exist before logout
		let cookies = await page.context().cookies();
		let sessionCookie = cookies.find((cookie) =>
			cookie.name.includes("better-auth"),
		);
		expect(sessionCookie).toBeDefined();

		// Navigate to logout (simulating logout click)
		await page.goto("/logout");

		// Should redirect to login page after logout
		await expect(page).toHaveURL("/login");
		await expect(page.locator('[data-test-id="login-form"]')).toBeVisible();

		// Session cookies should be cleared after logout
		cookies = await page.context().cookies();
		sessionCookie = cookies.find((cookie) =>
			cookie.name.includes("better-auth"),
		);
		expect(sessionCookie).toBeUndefined();
	});
});
