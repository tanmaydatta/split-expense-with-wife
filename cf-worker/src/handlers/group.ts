import { CFRequest, Env } from '../types';
import {
  createJsonResponse,
  createErrorResponse,
  authenticate
} from '../utils';
import {
  GroupDetailsResponse,
  UpdateGroupMetadataRequest,
  UpdateGroupMetadataResponse,
  User,
  GroupMetadata
} from '../../../shared-types';
import { getDb } from '../db';
import { users, groups } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

// Handle getting group details
export async function handleGroupDetails(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const db = getDb(env);

    // Get group data using Drizzle
    const groupResult = await db
      .select({
        groupid: groups.groupid,
        groupName: groups.groupName,
        budgets: groups.budgets,
        userids: groups.userids,
        metadata: groups.metadata
      })
      .from(groups)
      .where(eq(groups.groupid, session.group.groupid))
      .limit(1);

    if (groupResult.length === 0) {
      return createErrorResponse('Group not found', 404, request, env);
    }

    const group = groupResult[0];

    // Parse user IDs from group data
    const userIds = JSON.parse(group.userids || '[]') as number[];

    // Get all users in the group using Drizzle
    const usersResult = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        groupid: users.groupid
      })
      .from(users)
      .where(inArray(users.id, userIds));

    // Convert to User type format
    const groupUsers: User[] = usersResult.map(user => ({
      Id: user.id,
      username: user.username,
      FirstName: user.firstName || '',
      LastName: user.lastName || '',
      groupid: user.groupid
    }));

    const response: GroupDetailsResponse = {
      groupName: group.groupName,
      groupid: group.groupid,
      budgets: JSON.parse(group.budgets || '[]') as string[],
      users: groupUsers,
      metadata: JSON.parse(group.metadata || '{}') as GroupMetadata
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Group details error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle updating group metadata
export async function handleUpdateGroupMetadata(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as UpdateGroupMetadataRequest;
    const db = getDb(env);

    // Check if user is authorized to modify this group
    if (body.groupid && body.groupid !== session.group.groupid) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    // Validation logic
    if (body.defaultCurrency !== undefined) {
      // Validate currency code (3-letter codes)
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ZAR', 'KRW', 'SGD', 'HKD', 'NZD', 'THB', 'MYR', 'IDR', 'PHP', 'VND'];
      if (!validCurrencies.includes(body.defaultCurrency)) {
        return createErrorResponse('Invalid currency code', 400, request, env);
      }
    }

    if (body.defaultShare !== undefined) {
      // Validate defaultShare is not empty
      if (Object.keys(body.defaultShare).length === 0) {
        return createErrorResponse('All group members must have a default share percentage', 400, request, env);
      }

      // Get all users in the group from session (no DB query needed)
      const groupUserIds = new Set(Object.keys(session.usersById));
      const shareUserIds = new Set(Object.keys(body.defaultShare));

      // Check if all group members are included
      for (const userId of groupUserIds) {
        if (!shareUserIds.has(userId)) {
          return createErrorResponse('All group members must have a default share percentage', 400, request, env);
        }
      }

      // Check if any invalid user IDs are included
      for (const userId of shareUserIds) {
        if (!groupUserIds.has(userId)) {
          return createErrorResponse('Invalid user IDs: users not in group', 400, request, env);
        }
      }

      // Validate percentages
      const percentages = Object.values(body.defaultShare);

      // Check for negative percentages
      if (percentages.some(p => p < 0)) {
        return createErrorResponse('Default share percentages must be positive', 400, request, env);
      }

      // Check percentages add up to 100 (with floating point tolerance)
      const total = percentages.reduce((sum, p) => sum + p, 0);
      if (Math.abs(total - 100) > 0.001) {
        return createErrorResponse('Default share percentages must add up to 100%', 400, request, env);
      }
    }

    if (body.groupName !== undefined) {
      // Trim and validate group name
      const trimmedName = body.groupName.trim();
      if (trimmedName.length === 0) {
        return createErrorResponse('Group name cannot be empty', 400, request, env);
      }
      body.groupName = trimmedName;
    }

    if (body.budgets !== undefined) {
      // Validate budget names
      for (const budgetName of body.budgets) {
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(budgetName)) {
          return createErrorResponse('Budget names can only contain letters, numbers, spaces, hyphens, and underscores', 400, request, env);
        }
      }
      // Remove duplicates
      body.budgets = [...new Set(body.budgets)];
    }

    // Check if no changes were provided
    if (body.defaultShare === undefined && body.defaultCurrency === undefined &&
        body.groupName === undefined && body.budgets === undefined) {
      return createErrorResponse('No changes provided', 400, request, env);
    }

    // Prepare update data
    const updates: { metadata?: string; groupName?: string; budgets?: string } = {};

    // Update metadata if provided
    if (body.defaultShare !== undefined || body.defaultCurrency !== undefined) {
      const currentGroup = await db
        .select({ metadata: groups.metadata })
        .from(groups)
        .where(eq(groups.groupid, session.group.groupid))
        .limit(1);

      const currentMetadata = JSON.parse(currentGroup[0]?.metadata || '{}') as GroupMetadata;
      const newMetadata: GroupMetadata = {
        ...currentMetadata,
        ...(body.defaultShare !== undefined && { defaultShare: body.defaultShare }),
        ...(body.defaultCurrency !== undefined && { defaultCurrency: body.defaultCurrency })
      };

      // Set default USD currency if no currency is provided and none exists
      if (body.defaultCurrency === undefined && !currentMetadata.defaultCurrency) {
        newMetadata.defaultCurrency = 'USD';
      }

      updates.metadata = JSON.stringify(newMetadata);
    }

    // Update group name if provided
    if (body.groupName !== undefined) {
      updates.groupName = body.groupName;
    }

    // Update budgets if provided
    if (body.budgets !== undefined) {
      updates.budgets = JSON.stringify(body.budgets);
    }

    // Update group using Drizzle
    if (Object.keys(updates).length > 0) {
      await db
        .update(groups)
        .set(updates)
        .where(eq(groups.groupid, session.group.groupid));
    }

    // Get updated metadata for response
    const updatedGroup = await db
      .select({ metadata: groups.metadata })
      .from(groups)
      .where(eq(groups.groupid, session.group.groupid))
      .limit(1);

    const updatedMetadata = JSON.parse(updatedGroup[0]?.metadata || '{}') as GroupMetadata;

    const response: UpdateGroupMetadataResponse = {
      message: 'Group metadata updated successfully',
      metadata: updatedMetadata
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Update group metadata error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}
