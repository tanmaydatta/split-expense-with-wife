import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Debug Comprehensive', () => {
  test('should track all network activity and errors after login', async ({ testHelper }) => {
    const allRequests: any[] = [];
    const allResponses: any[] = [];
    const consoleMessages: any[] = [];
    const pageErrors: any[] = [];
    
    // Track console messages
    testHelper.page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
      console.log(`CONSOLE ${msg.type()}: ${msg.text()}`);
    });
    
    // Track page errors
    testHelper.page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.log('PAGE ERROR:', error.message);
    });
    
    // Track all requests and responses
    testHelper.page.on('request', (request) => {
      allRequests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData(),
        headers: request.headers()
      });
    });
    
    testHelper.page.on('response', async (response) => {
      allResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers()
      });
    });
    
    // Track failed requests
    testHelper.page.on('requestfailed', (request) => {
      console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
    });
    
    console.log('Setting up login mock');
    
    // Mock login with exact URL
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/login', (route) => {
      console.log('INTERCEPTED LOGIN:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.login.success)
      });
    });
    
    await testHelper.page.goto('/');
    
    console.log('=== FILLING LOGIN FORM ===');
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    
    console.log('=== CLICKING LOGIN BUTTON ===');
    await testHelper.page.click('.LoginButton');
    
    // Wait for all activity to settle
    await testHelper.page.waitForTimeout(5000);
    
    console.log('=== POST-LOGIN ANALYSIS ===');
    console.log('Total requests made:', allRequests.length);
    console.log('Total responses received:', allResponses.length);
    console.log('Console messages:', consoleMessages.length);
    console.log('Page errors:', pageErrors.length);
    
    // Show all requests after login button click
    const postLoginRequests = allRequests.slice(2); // Skip initial page load requests
    console.log('Post-login requests:');
    postLoginRequests.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req.method} ${req.url}`);
    });
    
    // Show failed responses
    const failedResponses = allResponses.filter(r => r.status >= 400);
    console.log('Failed responses:');
    failedResponses.forEach((resp, i) => {
      console.log(`  ${i + 1}. ${resp.status} ${resp.url}`);
    });
    
    // Check current page state
    console.log('=== CURRENT PAGE STATE ===');
    console.log('URL:', testHelper.page.url());
    console.log('Login wrapper visible:', await testHelper.page.locator('.LoginWrapper').isVisible());
    console.log('Sidebar visible:', await testHelper.page.locator('.Sidebar').isVisible());
    console.log('Page title:', await testHelper.page.title());
    
    // Check local storage
    const localStorage = await testHelper.page.evaluate(() => {
      const storage: any = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) {
          storage[key] = window.localStorage.getItem(key);
        }
      }
      return storage;
    });
    console.log('LocalStorage:', localStorage);
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 