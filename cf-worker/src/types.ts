// Cloudflare Workers types
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
  AUTH_PIN: string;
  SPLITWISE_API_KEY: string;
  SPLITWISE_GROUP_ID: string;
  ALLOWED_ORIGINS: string; // Comma-separated list of allowed origins
}

// Database models
export interface User {
  Id: number;
  username: string;
  FirstName: string;
  groupid: number;
  password?: string; // Only used in login
}

export interface Session {
  username: string;
  sessionid: string;
  expiry_time: string; // ISO string format
}

export interface Group {
  groupid: number;
  budgets: string; // JSON string
  userids: string; // JSON string
  metadata: string; // JSON string
}

export interface BudgetEntry {
  id: number;
  description: string;
  added_time: string; // ISO string format
  price: string;
  amount: number;
  name: string;
  deleted?: string; // ISO string format
  groupid: number;
  currency: string;
}

export interface Transaction {
  id: number;
  description: string;
  amount: number;
  created_at: string; // ISO string format
  metadata: string; // JSON string
  currency: string;
  transaction_id: string;
  group_id: number;
  deleted?: string; // ISO string format
}

export interface TransactionUser {
  transaction_id: string;
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  group_id: number;
  currency: string;
  deleted?: string; // ISO string format
}

// Parsed metadata types
export interface GroupMetadata {
  defaultShare: Record<string, number>;
  defaultCurrency: string;
}

export interface TransactionMetadata {
  paidByShares: Record<string, number>;
  owedAmounts: Record<string, number>;
  owedToAmounts: Record<string, number>;
}

// Session context
export interface CurrentSession {
  session: Session;
  user: User;
  group: Group;
  usersById: Record<number, User>;
}

// Request/Response types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  username: string;
  groupId: number;
  budgets: string[];
  users: User[];
  userids: number[];
  metadata: GroupMetadata;
  userId: number;
}

export interface BudgetRequest {
  amount: number;
  description: string;
  pin: string;
  name: string;
  groupid: number;
  currency: string;
}

export interface BudgetListRequest {
  offset: number;
  pin: string;
  name: string;
}

export interface BudgetTotalRequest {
  pin: string;
  name: string;
}

export interface BudgetDeleteRequest {
  pin: string;
  id: number;
}

export interface BudgetMonthlyRequest {
  name: string;
}

export interface MonthlyAmount {
  currency: string;
  amount: number;
}

export interface MonthlyBudget {
  month: string;
  year: number;
  amounts: MonthlyAmount[];
}

export interface SplitRequest {
  amount: number;
  description: string;
  paidByShares: Record<string, number>;
  pin: string;
  splitPctShares: Record<string, number>;
  currency: string;
}

export interface SplitNewRequest {
  amount: number;
  description: string;
  paidByShares: Record<string, number>;
  pin: string;
  splitPctShares: Record<string, number>;
  currency: string;
}

export interface SplitDeleteRequest {
  id: string;
  pin: string;
}

export interface TransactionsListRequest {
  offset: number;
}

export interface TransactionsListResponse {
  transactions: Transaction[];
  transactionDetails: Record<string, TransactionUser[]>;
}

export interface TransactionBalances {
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  currency: string;
}

// Constants
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SGD'];

// Utility types
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface ErrorResponse {
  error: string;
  statusCode: number;
}

// Cookie utilities
export interface CookieOptions {
  name: string;
  value: string;
  expires?: Date;
  httpOnly?: boolean;
  path?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  domain?: string;
} 