// Import all shared types
export * from '../../shared-types';
import type { User, Session, Group, GroupMetadata } from '../../shared-types';

// Cloudflare Workers specific types
export interface CFHeaders {
  get(name: string): string | null;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  has(name: string): boolean;
}

export interface CFRequest {
  headers: CFHeaders;
  method: string;
  url: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface CFResponseInit {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

export interface CFResponse {
  status: number;
  statusText: string;
  headers: CFHeaders;
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface CFContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<D1ExecResult>;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all(): Promise<D1Result>;
  first(): Promise<unknown>;
}

export interface D1Result {
  results: unknown[];
  success: boolean;
  error?: string;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
  };
}

export interface D1ExecResult {
  results: D1Result[];
  success: boolean;
  error?: string;
}

// Environment variables
export interface Env {
  DB: D1Database;
  SPLITWISE_API_KEY: string;
  SPLITWISE_GROUP_ID: string;
  ALLOWED_ORIGINS: string; // Comma-separated list of allowed origins
  GROUP_IDS: string; // Comma-separated list of group IDs
}

// Session context (CF Worker specific)
export interface CurrentSession {
  session: Session;
  user: User;
  group: Group;
  usersById: Record<number, User>;
}

// Cookie options (CF Worker specific)
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  maxAge?: number;
  expires?: Date;
  domain?: string;
}

// Database result types
export interface UserRow {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  groupid: number;
  password: string;
  created_at: string;
}

export interface TransactionRow {
  id: number;
  description: string;
  amount: number;
  created_at: string;
  metadata: string;
  currency: string;
  transaction_id: string;
  group_id: number;
  deleted?: string;
}

export interface TransactionDetailRow {
  transaction_id: string;
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  group_id: number;
  currency: string;
  deleted?: string;
  first_name: string;
}

// Utility types for balance calculations
export interface SplitAmount {
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  currency: string;
}

export interface BatchStatement {
  sql: string;
  params: (string | number)[];
}

export interface UserBalance {
  user_id: number;
  owed_to_user_id: number;
  currency: string;
  amount: number;
}

export interface BudgetTotal {
  currency: string;
  amount: number;
}

// Budget handler types
export interface BudgetEntry {
  name: string;
  currency: string;
  amount: number;
}

export type UserBalancesByUser = Record<string, Record<string, number>>;

// Split handler types
export interface SplitwiseResponse {
  id: number;
}

export interface TransactionCreateResponse {
  message: string;
  transactionId: string;
}

// Group metadata update types
export interface UpdateGroupMetadataRequest {
  groupid: number;
  defaultShare?: Record<string, number>;
  defaultCurrency?: string;
  groupName?: string;
  budgets?: string[];
}

export interface UpdateGroupMetadataResponse {
  message: string;
  metadata: GroupMetadata;
}
