import { TestUser, TestExpense, TestBudget } from '../utils/test-utils';

// Test users for different scenarios
export const testUsers: Record<string, TestUser> = {
  user1: {
    username: 'john.doe',
    password: 'password123',
    firstName: 'John',
    userId: 1
  },
  user2: {
    username: 'testuser2',
    password: 'testpass456',
    firstName: 'Jane',
    userId: 2
  },
  invalidUser: {
    username: 'invalid',
    password: 'wrongpass',
    firstName: 'Invalid',
    userId: 0
  }
};

// Test expenses for different scenarios
export const testExpenses: Record<string, TestExpense> = {
  groceries: {
    description: 'Grocery shopping',
    amount: 150.50,
    currency: 'USD',
    paidBy: 'John',
    splitPercentages: {
      '1': 50,
      '2': 50
    }
  },
  restaurant: {
    description: 'Dinner at restaurant',
    amount: 80.00,
    currency: 'USD',
    paidBy: 'Jane',
    splitPercentages: {
      '1': 40,
      '2': 60
    }
  },
  utilities: {
    description: 'Monthly utilities',
    amount: 120.00,
    currency: 'USD',
    paidBy: 'John',
    splitPercentages: {
      '1': 70,
      '2': 30
    }
  },
  multiCurrency: {
    description: 'International purchase',
    amount: 100.00,
    currency: 'EUR',
    paidBy: 'Jane',
    splitPercentages: {
      '1': 50,
      '2': 50
    }
  }
};

// Test budgets for different scenarios
export const testBudgets: Record<string, TestBudget> = {
  houseCredit: {
    name: 'house',
    amount: 500.00,
    currency: 'USD',
    type: 'Credit'
  },
  houseDebit: {
    name: 'house',
    amount: 200.00,
    currency: 'USD',
    type: 'Debit'
  },
  foodCredit: {
    name: 'food',
    amount: 300.00,
    currency: 'USD',
    type: 'Credit'
  },
  transportDebit: {
    name: 'transport',
    amount: 150.00,
    currency: 'USD',
    type: 'Debit'
  }
};

// Test PIN for authentication
export const testPin = '7689';

// Mock API responses
export const mockApiResponses = {
  login: {
    success: {
      token: 'mock-jwt-token',
      userId: 1,
      groupId: 1,
      users: [
        { Id: 1, FirstName: 'John', LastName: 'Doe' },
        { Id: 2, FirstName: 'Jane', LastName: 'Smith' }
      ],
      metadata: {
        defaultCurrency: 'USD',
        defaultShare: { '1': 50, '2': 50 },
        budgets: ['house', 'food', 'transport', 'entertainment']
      }
    },
    error: {
      error: 'Invalid username or password'
    }
  },
  balances: {
    success: {
      'John': { 'USD': 125.50, 'EUR': 50.00 },
      'Jane': { 'USD': -125.50, 'EUR': -50.00 }
    }
  },
  transactions: {
    success: {
      transactions: [
        {
          id: 1,
          description: 'Grocery shopping',
          amount: 150.50,
          created_at: new Date().toISOString(),
          currency: 'USD',
          transaction_id: 'txn_001',
          group_id: 1,
          metadata: {
            owedAmounts: { '1': 75.25, '2': 75.25 },
            paidByShares: { '1': 150.50 },
            owedToAmounts: { '1': 75.25, '2': 75.25 }
          }
        }
      ],
      transactionDetails: {
        'txn_001': [
          {
            user_id: 1,
            owed_to_user_id: 1,
            amount: 150.50
          },
          {
            user_id: 2,
            owed_to_user_id: 1,
            amount: 75.25
          }
        ]
      }
    }
  },
  budgetTotal: {
    success: [
      { currency: 'USD', amount: 1000.00 },
      { currency: 'EUR', amount: 500.00 }
    ]
  },
  budgetList: {
    success: [
      {
        id: 1,
        amount: 500.00,
        description: 'House budget credit',
        created_at: new Date().toISOString(),
        currency: 'USD'
      },
      {
        id: 2,
        amount: -200.00,
        description: 'House budget debit',
        created_at: new Date().toISOString(),
        currency: 'USD'
      }
    ]
  },
  budgetMonthly: {
    success: [
      {
        month: '2024-01',
        totalCredit: 1000.00,
        totalDebit: 800.00,
        net: 200.00,
        currency: 'USD'
      },
      {
        month: '2024-02',
        totalCredit: 1200.00,
        totalDebit: 900.00,
        net: 300.00,
        currency: 'USD'
      }
    ]
  }
};

// Common test data
export const testData = {
  users: testUsers,
  expenses: testExpenses,
  budgets: testBudgets,
  pin: testPin,
  mockResponses: mockApiResponses
}; 