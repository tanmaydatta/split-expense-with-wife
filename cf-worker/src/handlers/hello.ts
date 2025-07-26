import { CFRequest, Env } from '../types';
import { createJsonResponse } from '../utils';

// Handle hello world
export async function handleHelloWorld(request: CFRequest, env: Env): Promise<Response> {
  return createJsonResponse({
    message: 'Hello from Cloudflare Worker!',
    timestamp: new Date().toISOString(),
    worker: 'cf-worker'
  }, 200, {}, request, env);
}
