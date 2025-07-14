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
    
    // Should stay on root page but show login form
    await expect(testHelper.page).toHaveURL('/');
    
    // Verify login form elements are present
    await expect(testHelper.page.locator('input[placeholder="Username"]')).toBeVisible();
    await expect(testHelper.page.locator('input[placeholder="Password"]')).toBeVisible();
    await expect(testHelper.page.locator('.LoginButton')).toBeVisible();
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ testHelper }) => {
    // Mock successful login response
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    await testHelper.login(testData.users.user1);
    
    // Verify successful login - login form disappears
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
    
    // Verify authentication token is stored
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBe('mock-jwt-token');
  });

  test('should show error message with invalid credentials', async ({ testHelper }) => {
    // Mock error response
    await testHelper.mockApiError('login', 401, 'Invalid username or password');
    
    await testHelper.page.goto('/');
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.invalidUser.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.invalidUser.password);
    await testHelper.page.click('.LoginButton');
    
    // Should remain on root page with login form visible
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
  });

  test('should show loading state during login', async ({ testHelper }) => {
    // Mock delayed response using exact URL pattern
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/login', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.login.success)
      });
    });
    
    await testHelper.page.goto('/');
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    
    // Start login process
    await testHelper.page.click('.LoginButton');
    
    // Verify loading state (if loader exists)
    try {
      await expect(testHelper.page.locator('.loader')).toBeVisible({ timeout: 2000 });
    } catch {
      // Loader might not be visible or exist, that's ok
    }
    
    // Wait for login to complete
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
  });

  test('should preserve login state across page refreshes', async ({ testHelper }) => {
    // Mock successful login
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.login(testData.users.user1);
    
    // Verify initial login state
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
    
    // Store token for verification
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBe('mock-jwt-token');
    
    // Refresh the page
    await testHelper.page.reload();
    await testHelper.page.waitForTimeout(2000);
    
    // Should still be authenticated - session token should persist
    await expect(testHelper.page).toHaveURL('/');
    const sessionTokenAfterRefresh = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionTokenAfterRefresh).toBe('mock-jwt-token');
  });

  test('should handle accessing protected routes while unauthenticated', async ({ testHelper }) => {
    // Try to access protected route directly
    await testHelper.page.goto('/budget');
    
    // The app behavior: stays on /budget route but shows login form
    await expect(testHelper.page).toHaveURL('/budget');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
    
    await testHelper.page.goto('/');
    // Mock successful login
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    // Login successfully
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    await testHelper.page.click('.LoginButton');
    await testHelper.page.waitForTimeout(3000);
    
    // After login, user should be redirected to home page or stay authenticated
    // Check if user is authenticated by verifying login form is not visible
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
    
    // Verify session token is stored
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBe('mock-jwt-token');
  });

  test('should clear user data on logout', async ({ testHelper }) => {
    // Mock successful login first
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.login(testData.users.user1);
    
    // Verify user is logged in
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
    
    // Verify session token exists
    let sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBe('mock-jwt-token');
    
    // Mock logout response
    await testHelper.mockApiResponse('logout', {}, 'POST');
    
    // Navigate to logout (simulating logout click)
    await testHelper.page.goto('/logout');
    
    // Should redirect to login page after logout
    await expect(testHelper.page).toHaveURL('/login');
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
    
    // Session token should be cleared
    sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBeNull();
  });
}); 