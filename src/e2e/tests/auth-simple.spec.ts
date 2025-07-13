import { test, expect } from '../fixtures/setup';

test.describe('Simple Authentication Test', () => {
  test('should display login form when accessing home page', async ({ testHelper }) => {
    await testHelper.page.goto('/');
    
    // Verify we're redirected to login (AppWrapper shows LoginWrapper)
    await expect(testHelper.page.locator('.LoginWrapper')).toBeVisible();
    
    // Verify login form elements are present with correct selectors
    await expect(testHelper.page.locator('input[placeholder="Username"]')).toBeVisible();
    await expect(testHelper.page.locator('input[placeholder="Password"]')).toBeVisible();
    await expect(testHelper.page.locator('.LoginButton')).toBeVisible();
    
    // Verify sidebar is visible
    await expect(testHelper.page.locator('.Sidebar')).toBeVisible();
    await expect(testHelper.page.locator('.SidebarItem:has-text("Add")')).toBeVisible();
  });

  test('should try to login with mock data', async ({ testHelper }) => {
    // Mock the login API response
    await testHelper.mockApiResponse('login', {
      token: 'mock-jwt-token',
      userId: 1,
      groupId: 1,
      users: [
        { Id: 1, FirstName: 'John', LastName: 'Doe' },
        { Id: 2, FirstName: 'Jane', LastName: 'Smith' }
      ],
      metadata: {
        defaultCurrency: 'USD',
        defaultShare: { '1': 50, '2': 50 },
        budgets: ['house', 'food', 'transport', 'entertainment']
      }
    });

    await testHelper.page.goto('/');
    
    // Fill login form
    await testHelper.page.fill('input[placeholder="Username"]', 'testuser');
    await testHelper.page.fill('input[placeholder="Password"]', 'testpass');
    
    // Submit form
    await testHelper.page.click('.LoginButton');
    
    // Wait for navigation to complete
    await testHelper.page.waitForTimeout(2000);
    
    // Check if we're now on the main app (no longer showing LoginWrapper)
    const isLoginVisible = await testHelper.page.locator('.LoginWrapper').isVisible();
    console.log('Login form still visible:', isLoginVisible);
    
    // Check current URL
    const currentUrl = testHelper.page.url();
    console.log('Current URL:', currentUrl);
    
    // Take a screenshot to see the result
    await testHelper.page.screenshot({ path: 'after-login.png' });
  });
}); 