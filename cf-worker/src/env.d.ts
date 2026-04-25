/// <reference types="vitest" />
/// <reference types="worker-configuration.d.ts" />

// Extend the generated Env interface with secrets not tracked in wrangler.toml
declare namespace Cloudflare {
	interface Env {
		E2E_SEED_SECRET: string;
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
