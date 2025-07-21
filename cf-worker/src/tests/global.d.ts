/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:test' {
  export const env: any;
  export function createExecutionContext(): ExecutionContext;
  export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
  export const SELF: {
    fetch(request: Request): Promise<Response>;
  };
}
