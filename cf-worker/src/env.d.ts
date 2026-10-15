/// <reference types="vitest" />
/// <reference types="worker-configuration.d.ts" />

// Extend the generated Env interface with secrets not tracked in wrangler.toml
declare namespace Cloudflare {
	interface Env {
		E2E_SEED_SECRET: string;
		AUTH_PIN: string;
		DSN: string;
		DSN_D1: string;
		DSN_POSTGRES: string;
		GO_VERSION: string;
		PLANETSCALE_DATABASE_URL: string;
		PLANETSCALE_HOST: string;
		PLANETSCALE_PASSWORD: string;
		PLANETSCALE_USERNAME: string;
		SPLITWISE_API_KEY: string;
		NETLIFY_ORIGIN: string;
		MIGRATION_SECRET: string;
		AUTH_PRIVATE_KEY: string;
		REACT_APP_AUTH_BASE_URL: string;

	}
}

declare module "vitest" {
	interface TestContext {
		env: Env;
	}
}

interface ImportMeta {
	env: Env;
}

// Add cloudflare:test module declaration
declare module "cloudflare:test" {
	export const env: Env;
	export function createExecutionContext(): ExecutionContext;
	export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
	export const SELF: {
		fetch(
			request: Request,
			env?: Env,
			ctx?: ExecutionContext,
		): Promise<Response>;
		scheduled(
			controller: ScheduledController,
			env?: Env,
			ctx?: ExecutionContext,
		): Promise<void>;
	};
}

declare module "*.sql?raw" { const source: string; export default source; }
