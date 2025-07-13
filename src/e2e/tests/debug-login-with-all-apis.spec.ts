import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Debug Login With All APIs', () => {
  test('should debug login with all necessary API mocks', async ({ testHelper }) => {
    // Mock all necessary APIs
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    await testHelper.mockApiResponse('balances', testData.mockResponses.balances.success);
    await testHelper.mockApiResponse('transactions_list', testData.mockResponses.transactions.success);
    await testHelper.mockApiResponse('budget_total', testData.mockResponses.budgetTotal.success);
    await testHelper.mockApiResponse('budget_list', testData.mockResponses.budgetList.success);
    
    await testHelper.page.goto('/');
    
    console.log('Before login - URL:', testHelper.page.url());
    console.log('Before login - Login wrapper visible:', await testHelper.page.locator('.LoginWrapper').isVisible());
    
    // Fill login form
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    await testHelper.page.click('.LoginButton');
    
    // Wait longer for all API calls to complete
    await testHelper.page.waitForTimeout(3000);
    
    console.log('After login - URL:', testHelper.page.url());
    console.log('After login - Login wrapper visible:', await testHelper.page.locator('.LoginWrapper').isVisible());
    console.log('After login - Sidebar visible:', await testHelper.page.locator('.Sidebar').isVisible());
    
    // Check what sidebar items exist
    const sidebarItems = await testHelper.page.locator('.SidebarItem').all();
    console.log('Number of sidebar items:', sidebarItems.length);
    
    for (let i = 0; i < sidebarItems.length; i++) {
      const text = await sidebarItems[i].textContent();
      console.log(`Sidebar item ${i}: "${text}"`);
    }
    
    // Check if expense form is visible
    const descriptionInput = testHelper.page.locator('input[placeholder="Description"]');
    const amountInput = testHelper.page.locator('input[placeholder="Amount"]');
    console.log('Description input visible:', await descriptionInput.isVisible());
    console.log('Amount input visible:', await amountInput.isVisible());
    
    // Check for any elements on the page
    const allElements = await testHelper.page.locator('*').all();
    console.log('Total elements on page:', allElements.length);
    
    // Check page content
    const pageContent = await testHelper.page.content();
    console.log('Page length:', pageContent.length);
    console.log('Page title:', await testHelper.page.title());
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 