import { CFRequest, Env, UpdateGroupMetadataRequest, UpdateGroupMetadataResponse, UserRow } from '../types';
import {
  createJsonResponse,
  createErrorResponse,
  authenticate,
  isValidCurrency
} from '../utils';
import { GroupMetadata, User, GroupDetailsResponse } from '../../../shared-types';

// Handle group details retrieval
export async function handleGroupDetails(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    // Get group data including group name
    const groupStmt = env.DB.prepare(`
      SELECT groupid, group_name, budgets, userids, metadata 
      FROM groups 
      WHERE groupid = ?
    `);

    const groupResult = await groupStmt.bind(session.group.groupid).first();
    if (!groupResult) {
      return createErrorResponse('Group not found', 500, request, env);
    }

    const group = groupResult as {
      groupid: number;
      group_name: string;
      budgets: string;
      userids: string;
      metadata: string;
    };

    // Parse group data
    const budgets = JSON.parse(group.budgets || '[]') as string[];
    const userIds = JSON.parse(group.userids || '[]') as number[];
    const metadata = JSON.parse(group.metadata || '{}') as GroupMetadata;

    // Get all users in group
    const usersStmt = env.DB.prepare(`
      SELECT id, first_name, last_name, groupid 
      FROM users 
      WHERE id IN (${userIds.map(() => '?').join(',')})
    `);

    const usersResult = await usersStmt.bind(...userIds).all();
    const users = (usersResult.results as UserRow[]).map((row) => ({
      Id: row.id,
      username: '', // Not needed for settings
      FirstName: row.first_name,
      LastName: row.last_name,
      groupid: row.groupid
    })) as User[];

    // Create response
    const response: GroupDetailsResponse = {
      groupid: group.groupid,
      groupName: group.group_name || 'Unnamed Group',
      budgets,
      metadata,
      users
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Group details error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle group metadata update
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

    // Validate request - user must belong to the group being modified
    if (session.group.groupid !== body.groupid) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    // Validate currency if provided
    if (body.defaultCurrency && !isValidCurrency(body.defaultCurrency)) {
      return createErrorResponse('Invalid currency code', 400, request, env);
    }

    // Validate defaultShare if provided
    if (body.defaultShare) {
      // Get all users in the group
      const groupUserIds = JSON.parse(session.group.userids) as number[];

      // Check that all users in the group have a percentage assigned
      const shareUserIds = Object.keys(body.defaultShare).map(id => parseInt(id, 10));
      const missingUsers = groupUserIds.filter(userId => !shareUserIds.includes(userId));
      if (missingUsers.length > 0) {
        return createErrorResponse('All group members must have a default share percentage', 400, request, env);
      }

      // Check that no extra users are included
      const extraUsers = shareUserIds.filter(userId => !groupUserIds.includes(userId));
      if (extraUsers.length > 0) {
        return createErrorResponse('Invalid user IDs: users not in group', 400, request, env);
      }

      // Check that percentages add up to 100
      const totalPercentage = Object.values(body.defaultShare).reduce((sum, pct) => sum + pct, 0);
      if (Math.abs(totalPercentage - 100) > 0.001) { // Allow for small floating point errors with 0.001 precision
        return createErrorResponse('Default share percentages must add up to 100%', 400, request, env);
      }

      // Check that all percentages are positive
      const hasNegativePercentage = Object.values(body.defaultShare).some(pct => pct < 0);
      if (hasNegativePercentage) {
        return createErrorResponse('Default share percentages must be positive', 400, request, env);
      }
    }

    // Validate groupName if provided
    if (body.groupName !== undefined) {
      if (typeof body.groupName !== 'string') {
        return createErrorResponse('Group name must be a string', 400, request, env);
      }
      if (body.groupName.trim().length === 0) {
        return createErrorResponse('Group name cannot be empty', 400, request, env);
      }
      if (body.groupName.length > 100) {
        return createErrorResponse('Group name cannot exceed 100 characters', 400, request, env);
      }
    }

    // Validate budgets if provided
    if (body.budgets !== undefined) {
      if (!Array.isArray(body.budgets)) {
        return createErrorResponse('Budgets must be an array', 400, request, env);
      }

      // Validate budget names
      const invalidBudgets = body.budgets.filter(budget =>
        typeof budget !== 'string' ||
        budget.trim().length === 0 ||
        !/^[a-zA-Z0-9_-]+$/.test(budget.trim())
      );

      if (invalidBudgets.length > 0) {
        return createErrorResponse('Budget names can only contain letters, numbers, hyphens, and underscores', 400, request, env);
      }

      // Remove duplicates and trim
      body.budgets = [...new Set(body.budgets.map(b => b.trim().toLowerCase()))];
    }

    // Get current metadata
    const currentMetadata = JSON.parse(session.group.metadata || '{}') as GroupMetadata;

    // Build updated metadata object
    const updatedMetadata: GroupMetadata = {
      defaultShare: body.defaultShare || currentMetadata.defaultShare || {},
      defaultCurrency: body.defaultCurrency || currentMetadata.defaultCurrency || 'USD'
    };

    // Preserve any other metadata fields that might exist
    const existingMetadata = JSON.parse(session.group.metadata || '{}');
    const finalMetadata = {
      ...existingMetadata,
      ...updatedMetadata
    };

    // Build update query and parameters based on what fields were provided
    const updateFields: string[] = [];
    const updateParams: (string | number)[] = [];

    // Always update metadata if any metadata fields were provided
    if (body.defaultShare || body.defaultCurrency) {
      updateFields.push('metadata = ?');
      updateParams.push(JSON.stringify(finalMetadata));
    }

    // Update group name if provided
    if (body.groupName !== undefined) {
      updateFields.push('group_name = ?');
      updateParams.push(body.groupName.trim());
    }

    // Update budgets if provided
    if (body.budgets !== undefined) {
      updateFields.push('budgets = ?');
      updateParams.push(JSON.stringify(body.budgets));
    }

    // Only update if there are fields to update
    if (updateFields.length === 0) {
      return createErrorResponse('No fields provided to update', 400, request, env);
    }

    // Add WHERE clause parameter
    updateParams.push(session.group.groupid);

    // Execute update
    const updateStmt = env.DB.prepare(`
      UPDATE groups 
      SET ${updateFields.join(', ')}
      WHERE groupid = ?
    `);

    await updateStmt.bind(...updateParams).run();

    // Create response
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
