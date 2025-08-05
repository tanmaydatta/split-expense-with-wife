import { drizzle } from "drizzle-orm/d1";
import { schema } from "./schema/schema";

/**
 * Get Drizzle database instance for the given environment
 */
export function getDb(env: Env) {
	// Type assertion to work around D1Database interface mismatch
	// biome-ignore lint/suspicious/noExplicitAny: D1Database interface mismatch
	return drizzle(env.DB as any, { schema });
}
