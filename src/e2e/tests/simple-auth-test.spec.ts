import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Simple Authentication Test', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test - navigate to page first to avoid security errors
    await page.goto('/');
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.log('Storage clear failed:', e);
      }
    });
  });

  test('should successfully authenticate user', async ({ testHelper }) => {
    // Mock successful login response
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    // Go to home page
    await testHelper.page.goto('/');
    
    // Should show login form
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
    await expect(testHelper.page.locator('input[placeholder="Username"]')).toBeVisible();
    await expect(testHelper.page.locator('input[placeholder="Password"]')).toBeVisible();
    
    // Fill and submit login form
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    await testHelper.page.click('.LoginButton');
    
    // Wait for login to complete
    await testHelper.page.waitForTimeout(3000);
    
    // Verify login was successful
    await expect(testHelper.page).toHaveURL('/');
    await expect(testHelper.page.locator('.LoginWrapper')).not.toBeVisible();
    
    // Verify authentication token is stored
    const sessionToken = await testHelper.page.evaluate(() => localStorage.getItem('sessionToken'));
    expect(sessionToken).toBe('mock-jwt-token');
  });
}); 