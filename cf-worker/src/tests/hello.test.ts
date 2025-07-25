import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../index';

// Hello response type (keeping local since it's specific to the hello endpoint)
interface HelloResponse {
  message: string;
  timestamp: string;
  worker: string;
}

describe('Hello handler', () => {
  it('should return hello message', async () => {
    const request = new Request('https://example.com/.netlify/functions/hello', {
      method: 'GET'
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const json = await response.json() as HelloResponse;
    expect(json.message).toBe('Hello from Cloudflare Worker!');
    expect(json.timestamp).toBeDefined();
    expect(json.worker).toBe('cf-worker');
  });
});
