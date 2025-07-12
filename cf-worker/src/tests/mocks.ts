import { vi } from 'vitest';
import { Env, CFRequest, D1Database, D1PreparedStatement } from '../types';

export function createMockDb(): D1Database {
  const preparedStatement: D1PreparedStatement = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    raw: vi.fn(),
    send: vi.fn(),
  } as unknown as D1PreparedStatement;

  return {
    prepare: vi.fn(() => preparedStatement),
    exec: vi.fn(),
    batch: vi.fn(),
    dump: vi.fn(),
  } as unknown as D1Database;
}

export function createMockEnv(db?: D1Database): Env {
  return {
    DB: db || createMockDb(),
    AUTH_PIN: '1234',
    SPLITWISE_API_KEY: 'key',
    SPLITWISE_GROUP_ID: 'group',
    ALLOWED_ORIGINS: 'http://localhost',
    GROUP_IDS: '1',
  };
}

export function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost/',
  body?: unknown
): CFRequest {
  const headers = new Headers();
  if (body) {
    headers.set('Content-Type', 'application/json');
  }

  return {
    headers,
    method,
    url,
    json: body ? vi.fn().mockResolvedValue(body) : vi.fn(),
    text: body ? vi.fn().mockResolvedValue(JSON.stringify(body)) : vi.fn(),
  } as unknown as CFRequest;
} 