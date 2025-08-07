/// <reference types="vitest/globals" />
/// <reference types="../worker-configuration.d.ts" />

declare module "cloudflare:test" {
	// ProvidedEnv controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv extends Env {}

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
