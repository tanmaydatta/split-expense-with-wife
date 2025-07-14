import { test, expect } from '../fixtures/setup';

test.describe('Debug Tests', () => {
  test('should show what elements are actually on the page', async ({ testHelper }) => {
    await testHelper.page.goto('/');
    
    // Take a screenshot to see what's on the page
    await testHelper.page.screenshot({ path: 'debug-homepage.png' });
    
    // Get the page title
    const title = await testHelper.page.title();
    console.log('Page title:', title);
    
    // Get the page URL
    const url = testHelper.page.url();
    console.log('Page URL:', url);
    
    // Check if the page has loaded by looking for the root element
    const bodyContent = await testHelper.page.locator('body').innerHTML();
    console.log('Body content (first 500 chars):', bodyContent.substring(0, 500));
    
    // Look for any forms on the page
    const forms = await testHelper.page.locator('form').count();
    console.log('Number of forms found:', forms);
    
    // Look for any inputs
    const inputs = await testHelper.page.locator('input').count();
    console.log('Number of inputs found:', inputs);
    
    // Look for any buttons
    const buttons = await testHelper.page.locator('button').count();
    console.log('Number of buttons found:', buttons);
    
    // Check what's in the main div
    const appElement = await testHelper.page.locator('#root').innerHTML();
    console.log('Root element content (first 1000 chars):', appElement.substring(0, 1000));
    
    // The test should pass - we're just inspecting
    expect(true).toBe(true);
  });
}); 