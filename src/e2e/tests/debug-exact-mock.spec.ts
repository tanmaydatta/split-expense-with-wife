import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Debug Exact Mock', () => {
  test('should test exact URL mock pattern', async ({ testHelper }) => {
    console.log('Setting up exact URL mock');
    
    // Use exact URL pattern
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/login', (route) => {
      console.log('INTERCEPTED:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.login.success)
      });
    });
    
    // Track requests
    testHelper.page.on('request', (request) => {
      console.log('REQUEST:', request.method(), request.url());
    });
    
    testHelper.page.on('response', (response) => {
      console.log('RESPONSE:', response.status(), response.url());
    });
    
    await testHelper.page.goto('/');
    
    console.log('Filling login form');
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    
    console.log('Clicking login button');
    await testHelper.page.click('.LoginButton');
    
    // Wait for response
    await testHelper.page.waitForTimeout(3000);
    
    console.log('Checking page state after login');
    console.log('Login wrapper visible:', await testHelper.page.locator('.LoginWrapper').isVisible());
    console.log('Sidebar visible:', await testHelper.page.locator('.Sidebar').isVisible());
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 