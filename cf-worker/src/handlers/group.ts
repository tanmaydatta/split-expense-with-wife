import { CFRequest, Env, UpdateGroupMetadataRequest, UpdateGroupMetadataResponse } from '../types';
import {
  createJsonResponse,
  createErrorResponse,
  authenticate,
  isValidCurrency
} from '../utils';
import { GroupMetadata } from '../../../shared-types';

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
      if (Math.abs(totalPercentage - 100) > 0.01) { // Allow for small floating point errors
        return createErrorResponse('Default share percentages must add up to 100%', 400, request, env);
      }

      // Check that all percentages are positive
      const hasNegativePercentage = Object.values(body.defaultShare).some(pct => pct < 0);
      if (hasNegativePercentage) {
        return createErrorResponse('Default share percentages must be positive', 400, request, env);
      }
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

    // Update the group metadata in database
    const updateStmt = env.DB.prepare(`
      UPDATE groups 
      SET metadata = ?
      WHERE groupid = ?
    `);

    await updateStmt.bind(
      JSON.stringify(finalMetadata),
      session.group.groupid
    ).run();

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
