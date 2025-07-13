import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Debug Login Process', () => {
  test('should debug what happens after login', async ({ testHelper }) => {
    // Mock successful login
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    await testHelper.page.goto('/');
    
    console.log('Before login - URL:', testHelper.page.url());
    console.log('Before login - Login wrapper visible:', await testHelper.page.locator('.LoginWrapper').isVisible());
    
    // Fill login form
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    await testHelper.page.click('.LoginButton');
    
    // Wait a moment for changes
    await testHelper.page.waitForTimeout(2000);
    
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
    
    // Check page content for any references
    const pageContent = await testHelper.page.content();
    console.log('Page contains "Add":', pageContent.includes('>Add<'));
    console.log('Page contains "Expenses":', pageContent.includes('>Expenses<'));
    console.log('Page contains "Budget":', pageContent.includes('>Budget<'));
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 