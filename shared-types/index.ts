// Shared types for both frontend and backend
// These types ensure consistency across API requests and responses

// User and authentication types
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

// Budget types
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

// Transaction types
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

// API Request types
export interface LoginRequest {
  username: string;
  password: string;
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
  timeRange?: '6M' | '1Y' | '2Y' | 'All';
  currency?: string;
}

export interface CreateBudgetRequest {
  name: string;
  groupid: number;
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

// API Response types
export interface LoginResponse {
  username: string;
  groupId: number;
  budgets: string[];
  users: User[];
  userids: number[];
  metadata: GroupMetadata;
  userId: number;
  token: string;
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

export interface AverageSpendData {
  currency: string;
  averageMonthlySpend: number;
  totalSpend: number;
  monthsAnalyzed: number;
}

export interface AverageSpendPeriod {
  periodMonths: number;
  averages: AverageSpendData[];
}

export interface BudgetMonthlyResponse {
  monthlyBudgets: MonthlyBudget[];
  averageMonthlySpend: AverageSpendPeriod[];
  periodAnalyzed: {
    startDate: string;
    endDate: string;
  };
}

export interface CreateBudgetResponse {
  message: string;
  budgetName: string;
}

export interface DeleteBudgetRequest {
  name: string;
  groupid: number;
}

export interface DeleteBudgetResponse {
  message: string;
  budgetName: string;
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

// Generic API response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ErrorResponse {
  error: string;
  statusCode: number;
}

// Frontend-specific types (extending the backend types)
export interface FrontendTransaction {
  id: number;
  transactionId: string;
  description: string;
  totalAmount: number;
  date: string;
  amountOwed: Record<string, number>;
  paidBy: Record<string, number>;
  owedTo: Record<string, number>;
  totalOwed: number;
  currency: string;
}

export interface FrontendUser {
  Id: number;
  Name: string;
}

// Budget display types
export interface BudgetDisplayEntry {
  id: number;
  date: string;
  description: string;
  amount: string;
  deleted?: string;
  currency: string;
}

export interface BudgetTotal {
  currency: string;
  amount: number;
}

// API endpoint types for type-safe API calls
export interface ApiEndpoints {
  '/login': {
    request: LoginRequest;
    response: LoginResponse;
  };
  '/budget': {
    request: BudgetRequest;
    response: { message: string };
  };
  '/budget_create': {
    request: CreateBudgetRequest;
    response: CreateBudgetResponse;
  };
  '/budget_delete_category': {
    request: DeleteBudgetRequest;
    response: DeleteBudgetResponse;
  };
  '/budget_list': {
    request: BudgetListRequest;
    response: BudgetEntry[];
  };
  '/budget_total': {
    request: BudgetTotalRequest;
    response: BudgetTotal[];
  };
  '/budget_delete': {
    request: BudgetDeleteRequest;
    response: { message: string };
  };
  '/budget_monthly': {
    request: BudgetMonthlyRequest;
    response: BudgetMonthlyResponse;
  };
  '/split_new': {
    request: SplitNewRequest;
    response: { message: string; transactionId: string };
  };
  '/split_delete': {
    request: SplitDeleteRequest;
    response: { message: string };
  };
  '/transactions_list': {
    request: TransactionsListRequest;
    response: TransactionsListResponse;
  };
  '/balances': {
    request: {};
    response: Record<string, Record<string, number>>;
  };
  '/logout': {
    request: {};
    response: { message: string };
  };
}

// Type-safe API client interface
export interface TypedApiClient {
  post<K extends keyof ApiEndpoints>(
    endpoint: K,
    data: ApiEndpoints[K]['request']
  ): Promise<ApiEndpoints[K]['response']>;
}

// Constants
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'] as const;
export type Currency = typeof CURRENCIES[number]; 