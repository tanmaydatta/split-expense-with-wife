import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../index';
import { setupAndCleanDatabase, createTestUserData, createTestSession } from './test-utils';

describe('Auth handlers', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
  });

  describe('Login', () => {
    it('should return a login response on successful login', async () => {
      // Set up test data
      await createTestUserData(env);

      const request = new Request('http://example.com/.netlify/functions/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as any;
      expect(json.username).toBe('testuser');
      expect(json.groupId).toBe(1);
      expect(json.budgets).toEqual(['house', 'food']);
      expect(json.users).toHaveLength(4);
      expect(json.token).toBeDefined();
      expect(json.userId).toBe(1);

      // Verify session was created in database using the token from response
      const session = await env.DB.prepare('SELECT * FROM sessions WHERE sessionid = ?')
        .bind(json.token)
        .first();
      expect(session).not.toBeNull();
      expect(session.username).toBe('testuser');
    });

    it('should return 401 for invalid credentials', async () => {
      const request = new Request('http://example.com/.netlify/functions/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'nonexistent',
          password: 'wrongpassword'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });

    it('should return 401 for wrong password', async () => {
      // Set up test data with different password
      await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (1, 'Test Group', '[\"house\"]', '[1]', '{}')");
      await env.DB.exec("INSERT INTO users (id, username, first_name, groupid, password) VALUES (1, 'testuser', 'Test', 1, 'correctpassword')");

      const request = new Request('http://example.com/.netlify/functions/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'testuser',
          password: 'wrongpassword'
        })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });

    it('should return 405 for non-POST methods', async () => {
      const request = new Request('http://example.com/.netlify/functions/login', {
        method: 'GET'
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(405);
    });
  });

  describe('Logout', () => {
    it('should return a success message on logout', async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request('http://example.com/.netlify/functions/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-session-id',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as any;
      expect(json.message).toBe('Logged out successfully');

      // Verify session was deleted from database
      const session = await env.DB.prepare('SELECT * FROM sessions WHERE sessionid = ?')
        .bind('test-session-id')
        .first();
      expect(session).toBeNull();
    });

    it('should return success even without valid session', async () => {
      const request = new Request('http://example.com/.netlify/functions/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const json = await response.json() as any;
      expect(json.message).toBe('Logged out successfully');
    });

    it('should return 405 for non-POST methods', async () => {
      const request = new Request('http://example.com/.netlify/functions/logout', {
        method: 'GET'
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(405);
    });
  });
});
