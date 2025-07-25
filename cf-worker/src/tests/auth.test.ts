import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { handleLogin, handleLogout } from '../handlers/auth';
import { cleanupDatabase, createTestUserData, setupDatabase } from './test-utils';
import { getDb } from '../db';
import { sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { LoginResponse, ErrorResponse, ApiEndpoints } from '../../../shared-types';

// Type alias for logout response
type LogoutResponse = ApiEndpoints['/logout']['response'];

describe('Auth handlers', () => {
  beforeEach(async () => {
    await setupDatabase(env);
    await cleanupDatabase(env);
    await createTestUserData(env);
  });

  describe('Login', () => {
    it('should return a login response on successful login', async () => {
      const request = new Request('https://example.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpass'
        })
      });

      const response = await handleLogin(request, env);
      expect(response.status).toBe(200);

      const json = await response.json() as LoginResponse;
      expect(json.username).toBe('testuser');
      expect(json.token).toBeDefined();

      // Verify session was created using Drizzle
      expect(json.token).toBeDefined();
      const db = getDb(env);
      const sessionResult = await db.select().from(sessions).where(eq(sessions.sessionid, json.token)).limit(1);
      expect(sessionResult.length).toBe(1);
      expect(sessionResult[0].username).toBe('testuser');
    });

    it('should return error for invalid credentials', async () => {
      const request = new Request('https://example.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'wrongpassword'
        })
      });

      const response = await handleLogin(request, env);
      expect(response.status).toBe(401);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toBe('Invalid credentials');
    });

    it('should return error for missing user', async () => {
      const request = new Request('https://example.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nonexistent',
          password: 'testpass'
        })
      });

      const response = await handleLogin(request, env);
      expect(response.status).toBe(401);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toBe('Invalid credentials');
    });

    it('should return error for wrong HTTP method', async () => {
      const request = new Request('https://example.com/login', {
        method: 'GET'
      });

      const response = await handleLogin(request, env);
      expect(response.status).toBe(405);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toBe('Method not allowed');
    });
  });

  describe('Logout', () => {
    it('should successfully logout and remove session', async () => {
      // First login to create a session
      const loginRequest = new Request('https://example.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpass'
        })
      });

      const loginResponse = await handleLogin(loginRequest, env);
      const loginJson = await loginResponse.json() as LoginResponse;
      const sessionId = loginJson.token;

      // Now logout
      const logoutRequest = new Request('https://example.com/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId
        })
      });

      const logoutResponse = await handleLogout(logoutRequest, env);
      expect(logoutResponse.status).toBe(200);

      const logoutJson = await logoutResponse.json() as LogoutResponse;
      expect(logoutJson.message).toBe('Logout successful');

      // Verify session was deleted using Drizzle
      const db = getDb(env);
      const sessionResult = await db.select().from(sessions).where(eq(sessions.sessionid, sessionId)).limit(1);
      expect(sessionResult.length).toBe(0);
    });

    it('should return error for wrong HTTP method', async () => {
      const request = new Request('https://example.com/logout', {
        method: 'GET'
      });

      const response = await handleLogout(request, env);
      expect(response.status).toBe(405);

      const json = await response.json() as ErrorResponse;
      expect(json.error).toBe('Method not allowed');
    });
  });
});
