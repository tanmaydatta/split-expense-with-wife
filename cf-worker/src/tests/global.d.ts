/// <reference types="@cloudflare/workers-types" />
/// <reference types="worker-configuration.d.ts" />

declare module "cloudflare:test" {
	// biome-ignore lint/suspicious/noExplicitAny: cloudflare test env type
	export const env: any;
	export function createExecutionContext(): ExecutionContext;
	export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
	export const SELF: {
		fetch(request: Request): Promise<Response>;
	};
}
