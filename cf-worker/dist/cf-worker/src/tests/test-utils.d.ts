export declare function createMockRequest(method: string, body?: object, cookies?: string): Request;
export declare function createTestRequest(endpoint: string, method?: string, body?: unknown, cookies?: string, isNetlifyFunction?: boolean): Request;
export declare function setupDatabase(env: Env): Promise<void>;
export declare function cleanupDatabase(env: Env): Promise<void>;
export declare function setupAndCleanDatabase(env: Env): Promise<void>;
export declare function createTestUserData(env: Env): Promise<Record<string, Record<string, string>>>;
export declare function populateMaterializedTables(env: Env): Promise<void>;
export declare function signInAndGetCookies(env: Env, email: string, password: string): Promise<string>;
