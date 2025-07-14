import { test, expect } from '@playwright/test';

test.describe('Debug Page Content', () => {
  test('should debug what is on the root page', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Get page title
    const title = await page.title();
    console.log('Page title:', title);
    
    // Get current URL
    const url = page.url();
    console.log('Current URL:', url);
    
    // Check if login form is present
    const loginWrapper = page.locator('.LoginWrapper');
    const loginWrapperVisible = await loginWrapper.isVisible();
    console.log('Login wrapper visible:', loginWrapperVisible);
    
    // Check if sidebar is present
    const sidebar = page.locator('.Sidebar');
    const sidebarVisible = await sidebar.isVisible();
    console.log('Sidebar visible:', sidebarVisible);
    
    // Check for input fields
    const usernameInput = page.locator('input[placeholder="Username"]');
    const passwordInput = page.locator('input[placeholder="Password"]');
    const usernameVisible = await usernameInput.isVisible();
    const passwordVisible = await passwordInput.isVisible();
    console.log('Username input visible:', usernameVisible);
    console.log('Password input visible:', passwordVisible);
    
    // Check for expense form
    const descriptionInput = page.locator('input[placeholder="Description"]');
    const amountInput = page.locator('input[placeholder="Amount"]');
    const descriptionVisible = await descriptionInput.isVisible();
    const amountVisible = await amountInput.isVisible();
    console.log('Description input visible:', descriptionVisible);
    console.log('Amount input visible:', amountVisible);
    
    // Get page content
    const pageContent = await page.content();
    console.log('Page contains "login":', pageContent.includes('login'));
    console.log('Page contains "Login":', pageContent.includes('Login'));
    console.log('Page contains "expense":', pageContent.includes('expense'));
    console.log('Page contains "Expense":', pageContent.includes('Expense'));
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 