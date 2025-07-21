import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../index';
import { TestHelloResponse } from './types';

describe('Hello World handler', () => {
  it("should return a 'Hello World!' message", async () => {
    const request = new Request('http://example.com/hello', {
      method: 'GET'
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const json = await response.json() as TestHelloResponse;
    expect(json).toHaveProperty('message', 'Hello World!');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('worker', 'split-expense-worker');
  });

  it('should work on root path', async () => {
    const request = new Request('http://example.com/', {
      method: 'GET'
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const json = await response.json() as TestHelloResponse;
    expect(json).toHaveProperty('message', 'Hello World!');
  });

  it('should handle OPTIONS request', async () => {
    const request = new Request('http://example.com/hello', {
      method: 'OPTIONS'
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
