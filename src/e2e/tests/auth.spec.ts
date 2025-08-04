import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test - navigate to page first to avoid security errors
    await page.goto('/');
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        // Ignore security errors in restrictive environments
        console.log('Storage clear failed:', e);
      }
    });
  });

  test('should display login form when accessing protected route without authentication', async ({ testHelper }) => {
    await testHelper.page.goto('/expenses');

    // Should stay on root page but show login form instead of dashboard content
    await expect(testHelper.page).toHaveURL('/login');

    // Verify login form elements are present
    await expect(testHelper.page.locator('[data-test-id="username-input"]')).toBeVisible();
    await expect(testHelper.page.locator('[data-test-id="password-input"]')).toBeVisible();
    await expect(testHelper.page.locator('[data-test-id="login-button"]')).toBeVisible();
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ testHelper }) => {
    await testHelper.login(testData.users.user1);

    // Verify successful login - dashboard is visible
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();

    // Verify authentication by checking session cookies exist
    const cookies = await testHelper.page.context().cookies();
    const sessionCookie = cookies.find(cookie => 
      cookie.name.includes('better-auth')
    );
    expect(sessionCookie).toBeDefined();
  });

  test('should show error message with invalid credentials', async ({ testHelper }) => {
    await testHelper.page.goto('/login');
    await testHelper.page.fill('[data-test-id="username-input"]', testData.users.invalidUser.username);
    await testHelper.page.fill('[data-test-id="password-input"]', testData.users.invalidUser.password);
    await testHelper.page.click('[data-test-id="login-button"]');

    // Should redirect to login page with login form visible
    await expect(testHelper.page).toHaveURL('/login');
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();
    
    // Verify no session cookies are set after failed login
    const cookies = await testHelper.page.context().cookies();
    const sessionCookie = cookies.find(cookie => 
      cookie.name.includes('better-auth')
    );
    expect(sessionCookie).toBeUndefined();
  });

  test('should show loading state during login', async ({ page, testHelper }) => {
    // Increase timeout for this specific test due to network mocking and potential mobile Safari flakiness.
    test.setTimeout(30000);

    // Mock all network requests to be slow, simulating a real loading condition.
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
      route.continue();
    });

    await testHelper.page.goto('/login');
    await testHelper.page.fill('[data-test-id="username-input"]', testData.users.user1.username);
    await testHelper.page.fill('[data-test-id="password-input"]', testData.users.user1.password);

    // Click the login button to trigger the loading state.
    await testHelper.page.click('[data-test-id="login-button"]');

    // --- Mobile Safari Robustness Strategy ---

    // Step 1: Confirm the form is gone. This is a reliable first indicator of a state change.
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).not.toBeVisible({ timeout: 5000 });

    // Step 2: Check that the loader is at least in the DOM. This avoids issues with CSS animation/visibility.
    await expect(testHelper.page.locator('[data-test-id="login-loader"]')).toBeAttached({ timeout: 5000 });
    
    // Step 3 (Final Check): Wait for the page to navigate away, confirming the login was successful.
    await expect(testHelper.page).toHaveURL('/', { timeout: 10000 });
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();

    // Step 4: After navigation, confirm the loader is no longer in the DOM.
    await expect(testHelper.page.locator('[data-test-id="login-loader"]')).not.toBeAttached();
  });

  test('should preserve login state across page refreshes', async ({ testHelper }) => {
    await testHelper.login(testData.users.user1);

    // Verify initial login state (dashboard is visible)
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();

    // Refresh the page
    await testHelper.page.reload();
    await testHelper.page.waitForTimeout(2000);

    // Should still be authenticated - dashboard should still be visible
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();
    
    // Verify session cookies still exist after refresh
    const cookies = await testHelper.page.context().cookies();
    const sessionCookie = cookies.find(cookie => 
      cookie.name.includes('better-auth')
    );
    expect(sessionCookie).toBeDefined();
  });

  test('should handle accessing protected routes while unauthenticated', async ({ testHelper }) => {
    // Try to access protected route directly
    await testHelper.page.goto('/budget');

    // The app behavior: stays on /budget route but shows login form instead of content
    await expect(testHelper.page).toHaveURL('/login');
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();
  });

  test('should clear user data on logout', async ({ testHelper }) => {
    // Mock successful login first
    await testHelper.login(testData.users.user1);

    // Verify user is logged in (dashboard is visible)
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();

    // Verify session cookies exist before logout
    let cookies = await testHelper.page.context().cookies();
    let sessionCookie = cookies.find(cookie => 
      cookie.name.includes('better-auth')
    );
    expect(sessionCookie).toBeDefined();

    // Navigate to logout (simulating logout click)
    await testHelper.page.goto('/logout');

    // Should redirect to login page after logout
    await expect(testHelper.page).toHaveURL('/login');
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();

    // Session cookies should be cleared after logout
    cookies = await testHelper.page.context().cookies();
    sessionCookie = cookies.find(cookie => 
      cookie.name.includes('better-auth')
    );
    expect(sessionCookie).toBeUndefined();
  });
}); 