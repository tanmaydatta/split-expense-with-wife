// Test response types
export interface TestSuccessResponse {
  message: string;
}

export interface TestErrorResponse {
  error: string;
}

export interface TestHelloResponse {
  message: string;
  timestamp: string;
  worker: string;
}

export interface TestTransactionResponse {
  message: string;
  transactionId: string;
}

export interface TestBudgetListItem {
  id: number;
  description: string;
  added_time: string;
  price: string;
  amount: number;
  name: string;
  deleted: string | null;
  groupid: number;
  currency: string;
}

export interface TestTransactionRecord {
  transaction_id: string;
  description: string;
  amount: number;
  currency: string;
  group_id: number;
  created_at: string;
  metadata: string;
}

export interface TestTransactionDetail {
  transaction_id: string;
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  group_id: number;
  currency: string;
  deleted: string | null;
  first_name: string;
}

export interface TestTransactionsListResponse {
  transactions: TestTransactionRecord[];
  transactionDetails: Record<string, TestTransactionDetail[]>;
}

// API Response types for specific endpoints
export interface TestMonthlyBudgetItem {
  month: string;
  year: number;
  amounts: Array<{ currency: string; amount: number }>;
}

export interface TestAverageSpendItem {
  periodMonths: number;
  averages: Array<{
    currency: string;
    averageMonthlySpend: number;
    totalSpend: number;
    monthsAnalyzed: number;
  }>;
}

export interface TestBudgetMonthlyResponse {
  monthlyBudgets: TestMonthlyBudgetItem[];
  averageMonthlySpend: TestAverageSpendItem[];
  periodAnalyzed: {
    startDate: string;
    endDate: string;
  };
}

export interface TestBudgetTotalResponse {
  currency: string;
  amount: number;
}

export interface TestTransactionCreateResponse {
  message: string;
  transactionId: string;
}

// Database result types for tests
export interface TestTransactionDbResult {
  transaction_id: string;
  description: string;
  amount: number;
  currency: string;
  group_id: number;
  created_at: string;
  metadata?: string;
  deleted?: string | null;
}

export interface TestTransactionUserDbResult {
  transaction_id: string;
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  currency: string;
  group_id: number;
  deleted?: string | null;
}
