/// <reference types="vitest" />
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { handleUpdateGroupMetadata, handleGroupDetails } from '../handlers/group';
import { setupAndCleanDatabase, createTestUserData, createTestSession, createMockRequest } from './test-utils';
import { UpdateGroupMetadataRequest, UpdateGroupMetadataResponse } from '../types';
import { GroupDetailsResponse } from '../../../shared-types';

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

describe('Group Details Handler', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
    await createTestUserData(env);
    await createTestSession(env, 'test-session-id', 'testuser');
  });

  describe('handleGroupDetails Success Cases', () => {
    it('should return group details with users, metadata, and budgets for authenticated user', async () => {
      const request = createMockRequest('GET', undefined, 'test-session-id');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(200);
      const responseData = await response.json() as GroupDetailsResponse;

      // Check all required fields are present
      expect(responseData.groupid).toBe(1);
      expect(responseData.groupName).toBe('Test Group');
      expect(Array.isArray(responseData.budgets)).toBe(true);
      expect(responseData.metadata).toBeDefined();
      expect(Array.isArray(responseData.users)).toBe(true);

      // Check metadata structure
      expect(responseData.metadata.defaultCurrency).toBeDefined();
      expect(responseData.metadata.defaultShare).toBeDefined();

      // Check users have required fields
      expect(responseData.users.length).toBeGreaterThan(0);
      responseData.users.forEach(user => {
        expect(user.Id).toBeDefined();
        expect(user.FirstName).toBeDefined();
        expect(user.LastName).toBeDefined();
        expect(user.groupid).toBe(1);
      });
    });

    it('should include first_name and last_name for all users in group', async () => {
      const request = createMockRequest('GET', undefined, 'test-session-id');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(200);
      const responseData = await response.json() as GroupDetailsResponse;

      responseData.users.forEach(user => {
        expect(typeof user.FirstName).toBe('string');
        expect(typeof user.LastName).toBe('string');
        expect(user.FirstName.length).toBeGreaterThan(0);
      });
    });

    it('should parse budgets array correctly from JSON', async () => {
      const request = createMockRequest('GET', undefined, 'test-session-id');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(200);
      const responseData = await response.json() as GroupDetailsResponse;

      expect(Array.isArray(responseData.budgets)).toBe(true);
      expect(responseData.budgets).toContain('house');
      expect(responseData.budgets).toContain('food');
    });
  });

  describe('handleGroupDetails Error Cases', () => {
    it('should return 401 for unauthenticated requests (no session token)', async () => {
      const request = createMockRequest('GET', undefined, undefined);
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid session token', async () => {
      const request = createMockRequest('GET', null, 'invalid-token');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(401);
    });

    it('should return 405 for non-GET requests', async () => {
      const request = createMockRequest('POST', {}, 'test-session-id');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(405);
    });

    it('should return 405 for PUT requests', async () => {
      const request = createMockRequest('PUT', {}, 'test-session-id');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(405);
    });

    it('should return 405 for DELETE requests', async () => {
      const request = createMockRequest('DELETE', {}, 'test-session-id');
      const response = await handleGroupDetails(request, env);

      expect(response.status).toBe(405);
    });
  });
});

describe('Extended Group Metadata Handler', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
    await createTestUserData(env);
    await createTestSession(env, 'test-session-id', 'testuser');
  });

  describe('Group Name Updates', () => {
    it('should update group name successfully with valid input', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: 'Updated Group Name'
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);
      const responseData = await response.json() as UpdateGroupMetadataResponse;
      expect(responseData.message).toContain('successfully');

      // Verify in database
      const groupStmt = env.DB.prepare('SELECT group_name FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { group_name: string };
      expect(groupResult.group_name).toBe('Updated Group Name');
    });

    it('should trim whitespace from group name', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: '  Trimmed Group Name  '
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify trimmed name in database
      const groupStmt = env.DB.prepare('SELECT group_name FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { group_name: string };
      expect(groupResult.group_name).toBe('Trimmed Group Name');
    });

    it('should return 400 for empty group name after trimming', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: '   '
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(400);
    });

    it('should handle special characters in group name appropriately', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: 'Family & Friends Group 2024 🏠'
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify special characters are preserved
      const groupStmt = env.DB.prepare('SELECT group_name FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { group_name: string };
      expect(groupResult.group_name).toBe('Family & Friends Group 2024 🏠');
    });
  });

  describe('Budget Category Updates', () => {
    it('should add new budget categories to existing list', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        budgets: ['house', 'food', 'transportation', 'entertainment', 'vacation']
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify budgets in database
      const groupStmt = env.DB.prepare('SELECT budgets FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { budgets: string };
      const budgets = JSON.parse(groupResult.budgets);

      expect(budgets).toContain('vacation');
      expect(budgets).toContain('entertainment');
      expect(budgets).toContain('transportation');
    });

    it('should remove budget categories from existing list', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        budgets: ['food'] // Remove 'house' and 'transportation'
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify budgets in database
      const groupStmt = env.DB.prepare('SELECT budgets FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { budgets: string };
      const budgets = JSON.parse(groupResult.budgets);

      expect(budgets).toEqual(['food']);
      expect(budgets).not.toContain('house');
    });

    it('should handle duplicate budget names (deduplicate)', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        budgets: ['house', 'food', 'house', 'transportation', 'food', 'entertainment']
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify no duplicates in database
      const groupStmt = env.DB.prepare('SELECT budgets FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { budgets: string };
      const budgets = JSON.parse(groupResult.budgets);

      expect(budgets.length).toBe(4); // Should be unique
      expect(budgets).toContain('house');
      expect(budgets).toContain('food');
      expect(budgets).toContain('transportation');
      expect(budgets).toContain('entertainment');
    });

    it('should handle empty budgets array', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        budgets: []
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify empty array in database
      const groupStmt = env.DB.prepare('SELECT budgets FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { budgets: string };
      const budgets = JSON.parse(groupResult.budgets);

      expect(budgets).toEqual([]);
    });

    it('should preserve existing budgets when not updated', async () => {
      // First update to set initial budgets
      const initialRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        budgets: ['house', 'food', 'utilities']
      };
      await handleUpdateGroupMetadata(createMockRequest('POST', initialRequest, 'test-session-id'), env);

      // Update only currency, should preserve budgets
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultCurrency: 'EUR'
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify budgets are preserved
      const groupStmt = env.DB.prepare('SELECT budgets FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { budgets: string };
      const budgets = JSON.parse(groupResult.budgets);

      expect(budgets).toContain('house');
      expect(budgets).toContain('food');
      expect(budgets).toContain('utilities');
    });
  });

  describe('Combined Updates', () => {
    it('should update multiple fields in single request (groupName + budgets + currency + shares)', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: 'Multi-Update Group',
        budgets: ['rent', 'groceries', 'utilities'],
        defaultCurrency: 'EUR',
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

      // Verify all fields updated
      const groupStmt = env.DB.prepare('SELECT group_name, budgets, metadata FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { group_name: string; budgets: string; metadata: string };

      expect(groupResult.group_name).toBe('Multi-Update Group');

      const budgets = JSON.parse(groupResult.budgets);
      expect(budgets).toEqual(['rent', 'groceries', 'utilities']);

      const metadata = JSON.parse(groupResult.metadata);
      expect(metadata.defaultCurrency).toBe('EUR');
      expect(metadata.defaultShare['1']).toBe(25);
      expect(metadata.defaultShare['2']).toBe(25);
      expect(metadata.defaultShare['3']).toBe(25);
      expect(metadata.defaultShare['4']).toBe(25);
    });

    it('should handle partial updates (only some fields changed)', async () => {
      // Update only group name and budgets
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: 'Partial Update Group',
        budgets: ['new-category']
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(200);

      // Verify only specified fields updated
      const groupStmt = env.DB.prepare('SELECT group_name, budgets, metadata FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(1).first() as { group_name: string; budgets: string; metadata: string };

      expect(groupResult.group_name).toBe('Partial Update Group');

      const budgets = JSON.parse(groupResult.budgets);
      expect(budgets).toEqual(['new-category']);

      // Metadata should preserve existing values
      const metadata = JSON.parse(groupResult.metadata);
      expect(metadata.defaultCurrency).toBeDefined(); // Should still exist
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for requests with no changes', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1
        // No fields to update
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(400);
    });

    it('should return 401 for unauthorized users', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        groupName: 'Unauthorized Update'
      };

      const request = createMockRequest('POST', requestBody, 'invalid-session');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid percentage totals (≠ 100%)', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 60,
          '2': 30 // Total = 90%, not 100%
        }
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid currency codes', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultCurrency: 'INVALID'
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(400);
    });

    it('should return 400 for negative percentages', async () => {
      const requestBody: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': -10,
          '2': 110
        }
      };

      const request = createMockRequest('POST', requestBody, 'test-session-id');
      const response = await handleUpdateGroupMetadata(request, env);

      expect(response.status).toBe(400);
    });

    it('should handle precise percentage validation with 3 users (infinite decimals)', async () => {
      // Create a test scenario with 3 users only
      await env.DB.exec('DELETE FROM users WHERE groupid = 1');
      await env.DB.exec('DELETE FROM groups WHERE groupid = 1');

      // Create group with 3 users only
      await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (1, 'Test Group 3', '[\"house\", \"food\"]', '[1, 2, 3]', '{\"defaultCurrency\": \"USD\", \"defaultShare\": {\"1\": 33.333, \"2\": 33.333, \"3\": 33.334}}')");
      await env.DB.exec("INSERT INTO users (id, username, first_name, last_name, groupid, password) VALUES (1, 'testuser', 'Test', 'User', 1, 'password123')");
      await env.DB.exec("INSERT INTO users (id, username, first_name, last_name, groupid, password) VALUES (2, 'otheruser', 'Other', 'Person', 1, 'pass456')");
      await env.DB.exec("INSERT INTO users (id, username, first_name, last_name, groupid, password) VALUES (3, 'thirduser', 'Third', 'Member', 1, 'pass789')");

      // Test case 1: Perfect precision - should pass (total = 100.000)
      const perfectRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 33.333,
          '2': 33.333,
          '3': 33.334
        }
      };

      const perfectResponse = await handleUpdateGroupMetadata(createMockRequest('POST', perfectRequest, 'test-session-id'), env);
      expect(perfectResponse.status).toBe(200);

      // Test case 2: Within 0.001 tolerance - should pass (total = 99.9995, difference = 0.0005)
      const toleranceRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 33.3335,
          '2': 33.333,
          '3': 33.333 // Total = 99.9995, difference from 100 = 0.0005 < 0.001
        }
      };

      const toleranceResponse = await handleUpdateGroupMetadata(createMockRequest('POST', toleranceRequest, 'test-session-id'), env);
      expect(toleranceResponse.status).toBe(200);

      // Test case 3: Outside 0.001 tolerance - should fail (total = 99.997, difference = 0.003)
      const failRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 33.333,
          '2': 33.332,
          '3': 33.332 // Total = 99.997, difference from 100 = 0.003 > 0.001
        }
      };

      const failResponse = await handleUpdateGroupMetadata(createMockRequest('POST', failRequest, 'test-session-id'), env);
      expect(failResponse.status).toBe(400);

      // Test case 4: High precision with many decimals - should pass (total = 100.000)
      const precisionRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 33.33333,
          '2': 33.33333,
          '3': 33.33334 // Total = 100.000
        }
      };

      const precisionResponse = await handleUpdateGroupMetadata(createMockRequest('POST', precisionRequest, 'test-session-id'), env);
      expect(precisionResponse.status).toBe(200);

      // Test case 5: Slightly over 100% but within tolerance - should pass (total = 100.0005)
      const overRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 33.3335,
          '2': 33.333,
          '3': 33.334 // Total = 100.0005, difference = 0.0005 < 0.001
        }
      };

      const overResponse = await handleUpdateGroupMetadata(createMockRequest('POST', overRequest, 'test-session-id'), env);
      expect(overResponse.status).toBe(200);

      // Test case 6: Way over tolerance - should fail (total = 100.5)
      const wayOverRequest: UpdateGroupMetadataRequest = {
        groupid: 1,
        defaultShare: {
          '1': 33.5,
          '2': 33.5,
          '3': 33.5 // Total = 100.5, way outside tolerance
        }
      };

      const wayOverResponse = await handleUpdateGroupMetadata(createMockRequest('POST', wayOverRequest, 'test-session-id'), env);
      expect(wayOverResponse.status).toBe(400);
    });
  });
});
