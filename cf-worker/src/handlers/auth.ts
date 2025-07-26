import { CFRequest, Env } from '../types';
import {
  createJsonResponse,
  createErrorResponse,
  formatSQLiteTime,
  generateRandomId,
  SUPPORTED_CURRENCIES
} from '../utils';
import { LoginRequest, LoginResponse, User, GroupMetadata } from '../../../shared-types';
import { getDb } from '../db';
import { users, groups, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';

// Handle user login
export async function handleLogin(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const body = await request.json() as LoginRequest;
    const db = getDb(env);

    // Get user from database using Drizzle
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);

    if (userResult.length === 0) {
      return createErrorResponse('Invalid credentials', 401, request, env);
    }

    const user = userResult[0];

    // Verify password (in production, this should be hashed)
    if (user.password !== body.password) {
      return createErrorResponse('Invalid credentials', 401, request, env);
    }

    // Get group data using Drizzle
    const groupResult = await db
      .select()
      .from(groups)
      .where(eq(groups.groupid, user.groupid))
      .limit(1);

    if (groupResult.length === 0) {
      return createErrorResponse('Group not found', 500, request, env);
    }

    const groupRow = groupResult[0];

    // Parse group data - use the raw group data without unnecessary conversion
    const budgets = JSON.parse(groupRow.budgets || '[]') as string[];
    const userIds = JSON.parse(groupRow.userids || '[]') as number[];
    const metadata = JSON.parse(groupRow.metadata || '{}') as GroupMetadata;

    // Get all users in group using Drizzle
    const usersResult = await db
      .select()
      .from(users)
      .where(eq(users.groupid, user.groupid));

    // Convert to expected User type
    const groupUsers: User[] = usersResult.map((u) => ({
      Id: u.id,
      username: u.username,
      FirstName: u.firstName || '',
      groupid: u.groupid
    }));

    // Generate session
    const sessionId = generateRandomId(32);
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 7); // 7 days

    // Create session in database using Drizzle
    await db.insert(sessions).values({
      username: body.username,
      sessionid: sessionId,
      expiryTime: formatSQLiteTime(expiration)
    });

    const response: LoginResponse = {
      username: body.username,
      groupId: user.groupid,
      budgets,
      users: groupUsers,
      userids: userIds,
      metadata,
      userId: user.id,
      token: sessionId,
      currencies: SUPPORTED_CURRENCIES
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Login error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle user logout
export async function handleLogout(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const body = await request.json() as { sessionId: string };
    const db = getDb(env);

    // Delete session from database using Drizzle
    await db
      .delete(sessions)
      .where(eq(sessions.sessionid, body.sessionId));

    return createJsonResponse({
      message: 'Logout successful'
    }, 200, {}, request, env);

  } catch (error) {
    console.error('Logout error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}
