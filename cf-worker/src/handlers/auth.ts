import { CFRequest, Env, LoginRequest, LoginResponse, GroupMetadata, User, Group } from '../types';
import { 
  createJsonResponse, 
  createErrorResponse, 
  generateRandomId, 
  formatSQLiteTime,
  authenticate
} from '../utils';

// Handle login
export async function handleLogin(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }
  
  try {
    const body = await request.json() as LoginRequest;
    // Get user from database
    const userStmt = env.DB.prepare(`
      SELECT id, username, first_name, groupid, password 
      FROM users 
      WHERE username = ?
    `);
    
    const userResult = await userStmt.bind(body.username).first();

    if (!userResult) {
      return createErrorResponse('Invalid credentials', 401, request, env);
    }
    const userRow = userResult as any;
    const user = {
      Id: userRow.id,
      username: userRow.username,
      FirstName: userRow.first_name,
      groupid: userRow.groupid,
      password: userRow.password
    } as User & { password: string };
    
    // Check password
    if (user.password !== body.password) {
      return createErrorResponse('Invalid credentials', 401, request, env);
    }
    
    // Generate session ID
    const sessionId = generateRandomId(16);
    const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const url = new URL(request.url);

    // Get group data
    const groupStmt = env.DB.prepare(`
      SELECT groupid, budgets, userids, metadata 
      FROM groups 
      WHERE groupid = ?
    `);
    
    const groupResult = await groupStmt.bind(user.groupid).first();
    if (!groupResult) {
      return createErrorResponse('Group not found', 500, request, env);
    }
    
    const group = groupResult as Group;
    
    // Parse group data
    const budgets = JSON.parse(group.budgets) as string[];
    const userIds = JSON.parse(group.userids) as number[];
    const metadata = JSON.parse(group.metadata) as GroupMetadata;
    
    // Get all users in group
    const usersStmt = env.DB.prepare(`
      SELECT id, username, first_name, groupid 
      FROM users 
      WHERE id IN (${userIds.map(() => '?').join(',')})
    `);
    
    const usersResult = await usersStmt.bind(...userIds).all();
    const users = usersResult.results.map((row: any) => ({
      Id: row.id,
      username: row.username,
      FirstName: row.first_name,
      groupid: row.groupid
    })) as User[];
    
    // Create session
    const sessionStmt = env.DB.prepare(`
      INSERT INTO sessions (username, sessionid, expiry_time) 
      VALUES (?, ?, ?)
    `);
    
    await sessionStmt.bind(
      body.username,
      sessionId,
      formatSQLiteTime(expiration)
    ).run();
    
    // Create response
    const response: LoginResponse = {
      username: body.username,
      groupId: user.groupid,
      budgets,
      users,
      userids: userIds,
      metadata,
      userId: user.Id,
      token: sessionId,
    };
    
    return createJsonResponse(response, 200, {}, request, env);
    
  } catch (error) {
    console.error('Login error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle logout
export async function handleLogout(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }
  
  try {
    const session = await authenticate(request, env);
    if (session) {
      // Delete session from database
      const deleteStmt = env.DB.prepare(`
        DELETE FROM sessions WHERE sessionid = ?
      `);
      await deleteStmt.bind(session.session.sessionid).run();
    }
    
    return createJsonResponse({ message: 'Logged out successfully' }, 200, {}, request, env);
    
  } catch (error) {
    console.error('Logout error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
} 