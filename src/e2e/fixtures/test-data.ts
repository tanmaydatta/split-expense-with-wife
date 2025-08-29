import { TestUser, TestExpense, TestBudget } from "../utils/test-utils";

// Test users for different scenarios
export const testUsers: Record<string, TestUser> = {
	user1: {
		username: "john.doe",
		password: "password123",
		firstName: "John",
		userId: 1,
	},
	user2: {
		username: "testuser2",
		password: "testpass456",
		firstName: "Jane",
		userId: 2,
	},
	// Group 2 user for multi-person testing (3-person group)
	user3: {
		username: "alice.wilson",
		password: "password789",
		firstName: "Alice",
		userId: 3,
	},
	invalidUser: {
		username: "invalid",
		password: "wrongpass",
		firstName: "Invalid",
		userId: 0,
	},
};

// Helper function to create test expenses with dynamic user IDs
export function createTestExpenses(
	userIds: string[],
): Record<string, TestExpense> {
	if (userIds.length < 2) {
		throw new Error("At least 2 user IDs are required for test expenses");
	}

	const [userId1, userId2] = userIds;

	return {
		groceries: {
			description: "Grocery shopping",
			amount: 150.5,
			currency: "USD",
			paidBy: userId1,
			splitPercentages: {
				[userId1]: 50,
				[userId2]: 50,
			},
		},
		restaurant: {
			description: "Dinner at restaurant",
			amount: 80.0,
			currency: "USD",
			paidBy: userId2,
			splitPercentages: {
				[userId1]: 40,
				[userId2]: 60,
			},
		},
		utilities: {
			description: "Monthly utilities",
			amount: 120.0,
			currency: "USD",
			paidBy: userId1,
			splitPercentages: {
				[userId1]: 70,
				[userId2]: 30,
			},
		},
		multiCurrency: {
			description: "International purchase",
			amount: 100.0,
			currency: "EUR",
			paidBy: userId2,
			splitPercentages: {
				[userId1]: 50,
				[userId2]: 50,
			},
		},
	};
}

// Test budgets for different scenarios
export const testBudgets: Record<string, TestBudget> = {
	houseCredit: {
		budgetId: "budget_house_01",
		name: "house",
		amount: 500.0,
		currency: "USD",
		type: "Credit",
	},
	houseDebit: {
		budgetId: "budget_house_01",
		name: "house",
		amount: 200.0,
		currency: "USD",
		type: "Debit",
	},
	foodCredit: {
		budgetId: "budget_food_01",
		name: "food",
		amount: 300.0,
		currency: "USD",
		type: "Credit",
	},
	transportDebit: {
		budgetId: "budget_transport_01",
		name: "transport",
		amount: 150.0,
		currency: "USD",
		type: "Debit",
	},
};

// PIN authentication has been removed

// Mock API responses
export const mockApiResponses = {
	login: {
		success: {
			token: "mock-jwt-token",
			userId: 1,
			groupId: 1,
			users: [
				{ Id: 1, FirstName: "John", LastName: "Doe" },
				{ Id: 2, FirstName: "Jane", LastName: "Smith" },
			],
			metadata: {
				defaultCurrency: "USD",
				defaultShare: { "1": 50, "2": 50 },
				budgets: [
					{ id: "budget_house_01", budgetName: "house", description: null },
					{ id: "budget_food_01", budgetName: "food", description: null },
					{
						id: "budget_transport_01",
						budgetName: "transport",
						description: null,
					},
					{
						id: "budget_entertainment_01",
						budgetName: "entertainment",
						description: null,
					},
				],
			},
		},
		error: {
			error: "Invalid username or password",
		},
	},
	balances: {
		success: {
			John: { USD: 125.5, EUR: 50.0 },
			Jane: { USD: -125.5, EUR: -50.0 },
		},
	},
	transactions: {
		success: {
			transactions: [
				{
					id: 1,
					description: "Grocery shopping",
					amount: 150.5,
					created_at: new Date().toISOString(),
					currency: "USD",
					transaction_id: "txn_001",
					group_id: 1,
					metadata: {
						owedAmounts: { "1": 75.25, "2": 75.25 },
						paidByShares: { "1": 150.5 },
						owedToAmounts: { "1": 75.25, "2": 75.25 },
					},
				},
			],
			transactionDetails: {
				txn_001: [
					{
						user_id: 1,
						owed_to_user_id: 1,
						amount: 150.5,
					},
					{
						user_id: 2,
						owed_to_user_id: 1,
						amount: 75.25,
					},
				],
			},
		},
	},
	budgetTotal: {
		success: [
			{ currency: "USD", amount: 1000.0 },
			{ currency: "EUR", amount: 500.0 },
		],
	},
	budgetList: {
		success: [
			{
				id: 1,
				amount: 500.0,
				description: "House budget credit",
				created_at: new Date().toISOString(),
				currency: "USD",
			},
			{
				id: 2,
				amount: -200.0,
				description: "House budget debit",
				created_at: new Date().toISOString(),
				currency: "USD",
			},
		],
	},
	budgetMonthly: {
		success: {
			monthlyBudgets: [
				{
					month: "January",
					year: 2024,
					amounts: [
						{
							currency: "USD",
							amount: -800.0,
						},
						{
							currency: "GBP",
							amount: -600.0,
						},
					],
				},
				{
					month: "February",
					year: 2024,
					amounts: [
						{
							currency: "USD",
							amount: -900.0,
						},
						{
							currency: "GBP",
							amount: -700.0,
						},
					],
				},
				{
					month: "March",
					year: 2024,
					amounts: [
						{
							currency: "USD",
							amount: -950.0,
						},
						{
							currency: "GBP",
							amount: -750.0,
						},
					],
				},
			],
			averageMonthlySpend: [
				{
					currency: "USD",
					averageMonthlySpend: 883.33,
					totalSpend: 2650.0,
					periodMonths: 3,
					averages: [],
				},
				{
					currency: "GBP",
					averageMonthlySpend: 683.33,
					totalSpend: 2050.0,
					periodMonths: 3,
					averages: [],
				},
			],
			periodAnalyzed: {
				startDate: "2024-01-01",
				endDate: "2024-03-31",
			},
		},
	},
	getSession: {
		user: {
			id: 1,
			name: "John Doe",
		},
		session: {
			id: 1,
			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
			token: "mock-jwt-token",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
		extra: {
			currentUser: {
				id: 1,
				name: "John Doe",
			},
		},
	},
};

// Common test data
export const testData = {
	users: testUsers,
	budgets: testBudgets,
	mockResponses: mockApiResponses,
};
