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
    await testHelper.page.goto('/');

    // Should stay on root page but show login form instead of dashboard content
    await expect(testHelper.page).toHaveURL('/');

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

    // Verify authentication token is stored
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).not.toBeNull();
  });

  test('should show error message with invalid credentials', async ({ testHelper }) => {
    await testHelper.page.goto('/');
    await testHelper.page.fill('[data-test-id="username-input"]', testData.users.invalidUser.username);
    await testHelper.page.fill('[data-test-id="password-input"]', testData.users.invalidUser.password);
    await testHelper.page.click('[data-test-id="login-button"]');

    // Should redirect to login page with login form visible
    await expect(testHelper.page).toHaveURL('/login');
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBeNull();
  });

  test('should show loading state during login', async ({ testHelper }) => {
    // Mock delayed response using exact URL pattern
    await testHelper.page.route('**/.netlify/functions/login', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.login.success)
      });
    });

    await testHelper.page.goto('/login');
    await testHelper.page.fill('[data-test-id="username-input"]', testData.users.user1.username);
    await testHelper.page.fill('[data-test-id="password-input"]', testData.users.user1.password);

    // Start login process
    await testHelper.page.click('[data-test-id="login-button"]');

    // Check for the actual loading state - the Loader component should be visible
    await expect(testHelper.page.locator('[data-test-id="login-loader"]')).toBeVisible({ timeout: 1000 });

    // During loading, the form should not be visible (replaced by loader)
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).not.toBeVisible();

    // Wait for login to complete and redirect to dashboard
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();
    
    // Loader should disappear after login completes
    await expect(testHelper.page.locator('[data-test-id="login-loader"]')).not.toBeVisible();
  });

  test('should preserve login state across page refreshes', async ({ testHelper }) => {
    await testHelper.login(testData.users.user1);

    // Verify initial login state (dashboard is visible)
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();

    // Store token for verification
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).not.toBeNull();

    // Refresh the page
    await testHelper.page.reload();
    await testHelper.page.waitForTimeout(2000);

    // Should still be authenticated - session token should persist
    await expect(testHelper.page).toHaveURL('/');
    const sessionTokenAfterRefresh = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionTokenAfterRefresh).toBe(sessionToken);
  });

  test('should handle accessing protected routes while unauthenticated', async ({ testHelper }) => {
    // Try to access protected route directly
    await testHelper.page.goto('/budget');

    // The app behavior: stays on /budget route but shows login form instead of content
    await expect(testHelper.page).toHaveURL('/budget');
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();
  });

  test('should clear user data on logout', async ({ testHelper }) => {
    // Mock successful login first
    await testHelper.login(testData.users.user1);

    // Verify user is logged in (dashboard is visible)
    await expect(testHelper.page.locator('[data-test-id="dashboard-container"]')).toBeVisible();

    // Verify session token exists
    let sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).not.toBeNull();

    // Navigate to logout (simulating logout click)
    await testHelper.page.goto('/logout');

    // Should redirect to login page after logout
    await expect(testHelper.page).toHaveURL('/login');
    await expect(testHelper.page.locator('[data-test-id="login-form"]')).toBeVisible();

    // Session token should be cleared
    sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBeNull();
  });
}); 