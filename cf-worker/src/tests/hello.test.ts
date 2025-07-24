import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../index';
import { TestHelloResponse } from './types';
import { createTestRequest } from './test-utils';

describe('Hello World handler', () => {
  it("should return a 'Hello World!' message", async () => {
    const request = createTestRequest('hello', 'GET', undefined, undefined, false);
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const json = await response.json() as TestHelloResponse;
    expect(json).toHaveProperty('message', 'Hello World!');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('worker', 'split-expense-worker');
  });

  it('should handle OPTIONS request', async () => {
    const request = createTestRequest('hello', 'OPTIONS', undefined, undefined, false);
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
