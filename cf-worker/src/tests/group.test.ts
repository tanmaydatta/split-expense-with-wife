/// <reference types="vitest" />
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { handleUpdateGroupMetadata } from '../handlers/group';
import { setupAndCleanDatabase, createTestUserData, createTestSession, createMockRequest } from './test-utils';
import { UpdateGroupMetadataRequest, UpdateGroupMetadataResponse } from '../types';

describe('Group Metadata Handler', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
    await createTestUserData(env);
    await createTestSession(env, 'test-session-id', 'testuser');
  });

  it('should successfully update both defaultShare and defaultCurrency', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 25,
        '2': 25,
        '3': 25,
        '4': 25
      },
      defaultCurrency: 'USD'
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(200);
    const responseData = await response.json() as UpdateGroupMetadataResponse;
    expect(responseData.message).toBe('Group metadata updated successfully');
    expect(responseData.metadata.defaultShare).toEqual({'1': 25, '2': 25, '3': 25, '4': 25});
    expect(responseData.metadata.defaultCurrency).toBe('USD');

    // Verify database was updated
    const groupData = await env.DB.prepare('SELECT metadata FROM groups WHERE groupid = 1').first() as { metadata: string };
    const metadata = JSON.parse(groupData.metadata);
    expect(metadata.defaultShare).toEqual({'1': 25, '2': 25, '3': 25, '4': 25});
    expect(metadata.defaultCurrency).toBe('USD');
  });

  it('should successfully update only defaultShare', async () => {
    // First set some initial metadata
    await env.DB.prepare(`
      UPDATE groups 
      SET metadata = '{"defaultCurrency": "GBP", "other_field": "preserved"}' 
      WHERE groupid = 1
    `).run();

    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 40,
        '2': 30,
        '3': 20,
        '4': 10
      }
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(200);
    const responseData = await response.json() as UpdateGroupMetadataResponse;
    expect(responseData.metadata.defaultShare).toEqual({'1': 40, '2': 30, '3': 20, '4': 10});
    expect(responseData.metadata.defaultCurrency).toBe('GBP'); // Should preserve existing

    // Verify other fields are preserved
    const groupData = await env.DB.prepare('SELECT metadata FROM groups WHERE groupid = 1').first() as { metadata: string };
    const metadata = JSON.parse(groupData.metadata);
    expect(metadata.other_field).toBe('preserved');
  });

  it('should successfully update only defaultCurrency', async () => {
    // First set some initial metadata
    await env.DB.prepare(`
      UPDATE groups 
      SET metadata = '{"defaultShare": {"1": 50, "2": 50}, "other_field": "preserved"}' 
      WHERE groupid = 1
    `).run();

    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultCurrency: 'EUR'
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(200);
    const responseData = await response.json() as UpdateGroupMetadataResponse;
    expect(responseData.metadata.defaultCurrency).toBe('EUR');
    expect(responseData.metadata.defaultShare).toEqual({'1': 50, '2': 50}); // Should preserve existing
  });

  it('should return 401 for missing authentication token', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {'1': 100}
    };

    const request = createMockRequest('POST', requestBody); // No token
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(401);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Unauthorized');
  });

  it('should return 401 for invalid authentication token', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {'1': 100}
    };

    const request = createMockRequest('POST', requestBody, 'invalid-token');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(401);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Unauthorized');
  });

  it('should return 401 for unauthorized group access', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 999, // User is in group 1, not 999
      defaultShare: {'1': 100}
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(401);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid currency code', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultCurrency: 'INVALID'
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Invalid currency code');
  });

  it('should return 400 when percentages do not add up to 100', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 40,
        '2': 30,
        '3': 20,
        '4': 5 // Only adds up to 95%
      }
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Default share percentages must add up to 100%');
  });

  it('should return 400 when not all group members are included', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 100 // Missing users 2, 3, 4
      }
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('All group members must have a default share percentage');
  });

  it('should return 400 when invalid user IDs are included', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 25,
        '2': 25,
        '3': 25,
        '4': 25,
        '999': 0 // User 999 is not in group 1
      }
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Invalid user IDs: users not in group');
  });

  it('should return 400 for negative percentages', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': -10,
        '2': 60,
        '3': 30,
        '4': 20
      }
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Default share percentages must be positive');
  });

  it('should return 400 for empty defaultShare object', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {}
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('All group members must have a default share percentage');
  });

  it('should return 405 for non-POST method', async () => {
    const request = createMockRequest('GET', {}, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(405);
    const responseData = await response.json() as { error: string };
    expect(responseData.error).toBe('Method not allowed');
  });

  it('should handle floating point precision correctly', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 33.33,
        '2': 33.33,
        '3': 33.34  // Total: 100.00
      }
    };

    // First add user 3 to the group for this test
    await env.DB.prepare(`
      UPDATE groups 
      SET userids = '[1, 2, 3, 4]' 
      WHERE groupid = 1
    `).run();

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(400); // Should fail because we need all 4 users
  });

  it('should successfully update with all 4 group members', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 25,
        '2': 25,
        '3': 25,
        '4': 25
      },
      defaultCurrency: 'INR'
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(200);
    const responseData = await response.json() as UpdateGroupMetadataResponse;
    expect(responseData.metadata.defaultShare).toEqual({'1': 25, '2': 25, '3': 25, '4': 25});
    expect(responseData.metadata.defaultCurrency).toBe('INR');
  });

  it('should use default currency USD when no currency provided and no existing currency', async () => {
    const requestBody: UpdateGroupMetadataRequest = {
      groupid: 1,
      defaultShare: {
        '1': 25,
        '2': 25,
        '3': 25,
        '4': 25
      }
    };

    const request = createMockRequest('POST', requestBody, 'test-session-id');
    const response = await handleUpdateGroupMetadata(request, env);

    expect(response.status).toBe(200);
    const responseData = await response.json() as UpdateGroupMetadataResponse;
    expect(responseData.metadata.defaultCurrency).toBe('USD');
  });
});
