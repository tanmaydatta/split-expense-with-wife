import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Debug Complete Mock', () => {
  test('should test with all APIs mocked using exact patterns', async ({ testHelper }) => {
    console.log('Setting up all exact URL mocks');
    
    // Mock all APIs with exact URL patterns
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/login', (route) => {
      console.log('INTERCEPTED LOGIN:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.login.success)
      });
    });
    
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/balances', (route) => {
      console.log('INTERCEPTED BALANCES:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.balances.success)
      });
    });
    
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/transactions_list', (route) => {
      console.log('INTERCEPTED TRANSACTIONS:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.transactions.success)
      });
    });
    
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/budget_total', (route) => {
      console.log('INTERCEPTED BUDGET_TOTAL:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.budgetTotal.success)
      });
    });
    
    await testHelper.page.route('**/splitexpense.tanmaydatta.workers.dev/.netlify/functions/budget_list', (route) => {
      console.log('INTERCEPTED BUDGET_LIST:', route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testData.mockResponses.budgetList.success)
      });
    });
    
    // Track requests
    testHelper.page.on('request', (request) => {
      console.log('REQUEST:', request.method(), request.url());
    });
    
    await testHelper.page.goto('/');
    
    console.log('Filling login form');
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    
    console.log('Clicking login button');
    await testHelper.page.click('.LoginButton');
    
    // Wait longer for all API calls
    await testHelper.page.waitForTimeout(5000);
    
    console.log('Checking page state after login');
    console.log('Login wrapper visible:', await testHelper.page.locator('.LoginWrapper').isVisible());
    console.log('Sidebar visible:', await testHelper.page.locator('.Sidebar').isVisible());
    
    // Check sidebar items
    const sidebarItems = await testHelper.page.locator('.SidebarItem').all();
    console.log('Number of sidebar items:', sidebarItems.length);
    
    for (let i = 0; i < sidebarItems.length; i++) {
      const text = await sidebarItems[i].textContent();
      console.log(`Sidebar item ${i}: "${text}"`);
    }
    
    // Check expense form
    console.log('Description input visible:', await testHelper.page.locator('input[placeholder="Description"]').isVisible());
    console.log('Amount input visible:', await testHelper.page.locator('input[placeholder="Amount"]').isVisible());
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 