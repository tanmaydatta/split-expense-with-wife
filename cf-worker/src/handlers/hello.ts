import { CFRequest, Env } from '../types';
import { createJsonResponse } from '../utils';

// Handle hello world
export async function handleHelloWorld(request: CFRequest, env: Env): Promise<Response> {
  return createJsonResponse({
    message: 'Hello World!',
    timestamp: new Date().toISOString(),
    worker: 'split-expense-worker'
  }, 200, {}, request, env);
}
