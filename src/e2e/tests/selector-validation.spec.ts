import { test, expect } from '@playwright/test';

test.describe('Selector Validation Tests', () => {
  test('should validate basic login form selectors', async ({ page }) => {
    // Skip if no server running
    try {
      await page.goto('http://localhost:3000/');
    } catch (error) {
      test.skip();
      return;
    }
    
    // Check if we get redirected to login
    await expect(page).toHaveURL('http://localhost:3000/login');
    
    // Verify login form elements with correct selectors
    await expect(page.locator('input[placeholder="Username"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Password"]')).toBeVisible();
    await expect(page.locator('.LoginButton')).toBeVisible();
    
    // Verify login form wrapper
    await expect(page.locator('.LoginWrapper')).toBeVisible();
  });
}); 