import { test, expect } from '../fixtures/setup';
import { testData } from '../fixtures/test-data';

test.describe('Debug Network Activity', () => {
  test('should debug network requests during login', async ({ testHelper }) => {
    // Track all network requests
    const requests: any[] = [];
    const responses: any[] = [];
    
    testHelper.page.on('request', (request) => {
      requests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData()
      });
      console.log('REQUEST:', request.method(), request.url());
      if (request.postData()) {
        console.log('POST DATA:', request.postData());
      }
    });
    
    testHelper.page.on('response', (response) => {
      responses.push({
        url: response.url(),
        status: response.status()
      });
      console.log('RESPONSE:', response.status(), response.url());
    });
    
    // Mock login response
    await testHelper.mockApiResponse('login', testData.mockResponses.login.success);
    
    await testHelper.page.goto('/');
    
    // Fill login form
    await testHelper.page.fill('input[placeholder="Username"]', testData.users.user1.username);
    await testHelper.page.fill('input[placeholder="Password"]', testData.users.user1.password);
    
    console.log('About to click login button');
    await testHelper.page.click('.LoginButton');
    
    // Wait for requests to complete
    await testHelper.page.waitForTimeout(3000);
    
    console.log('Total requests:', requests.length);
    console.log('Total responses:', responses.length);
    
    // Check if login request was made
    const loginRequest = requests.find(r => r.url.includes('login'));
    if (loginRequest) {
      console.log('Login request found:', loginRequest);
    } else {
      console.log('No login request found');
    }
    
    // Check response
    const loginResponse = responses.find(r => r.url.includes('login'));
    if (loginResponse) {
      console.log('Login response found:', loginResponse);
    } else {
      console.log('No login response found');
    }
    
    // Check console errors
    const messages: any[] = [];
    testHelper.page.on('console', (msg) => {
      messages.push({
        type: msg.type(),
        text: msg.text()
      });
    });
    
    console.log('Console messages:', messages.length);
    
    // Always pass the test since this is just for debugging
    expect(true).toBe(true);
  });
}); 