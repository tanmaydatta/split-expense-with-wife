import { 
  Env, 
  CurrentSession, 
  Session, 
  User, 
  Group, 
  CookieOptions,
  CFRequest,
  CFResponse,
  CFResponseInit
} from './types';



// Generate a random session ID
export function generateRandomId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Format current time for SQLite
export function formatSQLiteTime(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

// Parse cookie header
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });
  
  return cookies;
}

// Create cookie string
export function createCookie(options: CookieOptions): string {
  let cookieString = `${options.name}=${options.value}`;
  
  if (options.expires) {
    cookieString += `; Expires=${options.expires.toUTCString()}`;
  }
  
  if (options.httpOnly) {
    cookieString += '; HttpOnly';
  }
  
  if (options.path) {
    cookieString += `; Path=${options.path}`;
  }
  
  if (options.secure) {
    cookieString += '; Secure';
  }
  
  if (options.sameSite) {
    cookieString += `; SameSite=${options.sameSite}`;
  }
  
  return cookieString;
}

// Validate session and return current session data
export async function validateSession(sessionId: string, env: Env): Promise<CurrentSession | null> {
    console.log('authenticate');
  if (!sessionId) {
    return null;
  }
  
  try {
    // Get session from database
    const sessionStmt = env.DB.prepare(`
      SELECT username, sessionid, expiry_time 
      FROM sessions 
      WHERE sessionid = ?
    `);
    
    const sessionResult = await sessionStmt.bind(sessionId).first();
    if (!sessionResult) {
      return null;
    }
    
    const session = sessionResult as Session;
    
    // Check if session has expired
    const expiryTime = new Date(session.expiry_time);
    if (expiryTime < new Date()) {
      return null;
    }
    
    // Get user data
    const userStmt = env.DB.prepare(`
      SELECT id, username, first_name, groupid 
      FROM users 
      WHERE username = ?
    `);
    
    const userResult = await userStmt.bind(session.username).first();
    if (!userResult) {
      return null;
    }
    
    const userRow = userResult as any;
    const user = {
      Id: userRow.id,
      username: userRow.username,
      FirstName: userRow.first_name,
      groupid: userRow.groupid
    } as User;
    
    // Get group data
    const groupStmt = env.DB.prepare(`
      SELECT groupid, budgets, userids, metadata 
      FROM groups 
      WHERE groupid = ?
    `);
    
    const groupResult = await groupStmt.bind(user.groupid).first();
    if (!groupResult) {
      return null;
    }
    
    const group = groupResult as Group;
    
    // Parse userids and get all users in group
    const userIds = JSON.parse(group.userids) as number[];
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
    
    // Create users by ID map
    const usersById: Record<number, User> = {};
    users.forEach(u => {
      usersById[u.Id] = u;
    });
    
    return {
      session,
      user,
      group,
      usersById
    };
    
  } catch (error) {
    console.error('Error validating session:', error);
    return null;
  }
}

// Authenticate request using cookies
export async function authenticate(request: CFRequest, env: Env): Promise<CurrentSession | null> {
  console.log('authenticate');
  const cookieHeader = request.headers.get('cookie');
  console.log('cookieHeader ',cookieHeader ? "cookieHeader" : "no cookieHeader", cookieHeader);
  if (!cookieHeader) {
    return null;
  }
  
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies.sessionid;
  
  if (!sessionId) {
    return null;
  }
  
  return await validateSession(sessionId, env);
}

// CORS headers for all responses - simplified version that works with credentials
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:3000', // Set to your React app's URL
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400', // 24 hours
};

// Create CORS response for OPTIONS preflight requests
export function createOptionsResponse(): Response {
  return new Response(null, {
    status: 200,
    headers: CORS_HEADERS
  });
}

// Create JSON response with CORS headers
export function createJsonResponse(data: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...headers
    }
  });
}

// Create error response with CORS headers
export function createErrorResponse(error: string, status: number = 500): Response {
  return createJsonResponse({ error }, status);
}

// Execute database batch operations
export async function executeBatch(env: Env, statements: { sql: string; params: unknown[] }[]): Promise<void> {
  const preparedStatements = statements.map(stmt => 
    env.DB.prepare(stmt.sql).bind(...stmt.params)
  );
  
  const results = await env.DB.batch(preparedStatements);
  
  // Check if any statement failed
  for (const result of results) {
    if (!result.success) {
      throw new Error(`Database batch operation failed: ${result.error}`);
    }
  }
}

// Helper function to check if user is authorized for a budget
export function isAuthorizedForBudget(session: CurrentSession, budgetName: string): boolean {
  try {
    const budgets = JSON.parse(session.group.budgets) as string[];
    return budgets.includes(budgetName);
  } catch (error) {
    console.error('Error parsing budgets:', error);
    return false;
  }
}

// Helper function to validate currency
export function isValidCurrency(currency: string): boolean {
  const currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SGD'];
  return currencies.includes(currency);
}

// Helper function to validate PIN
export function isValidPin(pin: string, env: Env): boolean {
  return pin === env.AUTH_PIN;
}

// Helper function to validate split percentages
export function validateSplitPercentages(splitPctShares: Record<string, number>): boolean {
    console.log('validateSplitPercentages', splitPctShares);
  const totalPct = Object.values(splitPctShares).reduce((sum, pct) => sum + pct, 0);
  console.log('totalPct', totalPct);
  return Math.abs(totalPct - 100) < 0.01; // Allow small floating point errors
}

// Helper function to validate paid amounts
export function validatePaidAmounts(paidByShares: Record<string, number>, totalAmount: number): boolean {
  const totalPaid = Object.values(paidByShares).reduce((sum, amount) => sum + amount, 0);
  return Math.abs(totalPaid - totalAmount) < 0.01; // Allow small floating point errors
}

// Helper function to calculate split amounts
export function calculateSplitAmounts(
  amount: number,
  paidByShares: Record<number, number>,
  splitPctShares: Record<number, number>,
  currency: string
): Array<{ user_id: number; amount: number; owed_to_user_id: number; currency: string }> {
  const amounts: Array<{ user_id: number; amount: number; owed_to_user_id: number; currency: string }> = [];
  
  // Calculate what each user owes or is owed
  const owed: Record<number, number> = {};
  const owedToUserIds: number[] = [];
  let totalOwed = 0;
  
  for (const [userIdStr, splitPct] of Object.entries(splitPctShares)) {
    const userId = parseInt(userIdStr);
    const paidAmount = paidByShares[userId] || 0;
    const owedAmount = amount * splitPct / 100;
    const netAmount = paidAmount - owedAmount;
    
    owed[userId] = netAmount;
    
    if (netAmount >= 0) {
      owedToUserIds.push(userId);
      totalOwed += netAmount;
    }
  }
  
  // Calculate who owes whom
  for (const [userIdStr, netAmount] of Object.entries(owed)) {
    const userId = parseInt(userIdStr);
    
    if (netAmount >= 0) {
      // This user is owed money
      continue;
    }
    
    // This user owes money
    const amountOwed = Math.abs(netAmount);
    
    for (const owedToUserId of owedToUserIds) {
      if (totalOwed === 0) break;
      
      const owedToAmount = owed[owedToUserId];
      const proportion = owedToAmount / totalOwed;
      const splitAmount = amountOwed * proportion;
      
      if (splitAmount > 0.01) { // Only add if amount is significant
        amounts.push({
          user_id: userId,
          amount: splitAmount,
          owed_to_user_id: owedToUserId,
          currency
        });
      }
    }
  }
  
  return amounts;
} 