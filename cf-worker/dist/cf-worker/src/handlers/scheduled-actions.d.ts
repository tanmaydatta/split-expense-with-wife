export declare function calculateNextExecutionDate(startDate: string, frequency: "daily" | "weekly" | "monthly"): string;
export declare function handleScheduledActionCreate(request: Request, env: Env): Promise<Response>;
export declare function handleScheduledActionList(request: Request, env: Env): Promise<Response>;
export declare function handleScheduledActionUpdate(request: Request, env: Env): Promise<Response>;
export declare function handleScheduledActionDelete(request: Request, env: Env): Promise<Response>;
export declare function handleScheduledActionHistory(request: Request, env: Env): Promise<Response>;
