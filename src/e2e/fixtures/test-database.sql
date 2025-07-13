-- Test Database Setup for E2E Tests
-- This file contains comprehensive dummy data for testing various scenarios

-- Clear existing data (in order due to foreign key constraints)
DELETE FROM transaction_users;
DELETE FROM transactions;
DELETE FROM budget;
DELETE FROM sessions;
DELETE FROM users;
DELETE FROM groups;

-- Insert Test Groups
INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES 
(1, 'Couple Group', '["house", "food", "transport", "entertainment"]', '[1, 2]', '{"defaultCurrency": "USD", "defaultShare": {"1": 50, "2": 50}}'),
(2, 'Roommate Group', '["vacation", "house", "food"]', '[3, 4, 5]', '{"defaultCurrency": "EUR", "defaultShare": {"3": 40, "4": 30, "5": 30}}'),
(3, 'Solo Business Group', '["business", "meals"]', '[6]', '{"defaultCurrency": "GBP", "defaultShare": {"6": 100}}');

-- Insert Test Users
INSERT INTO users (id, username, first_name, last_name, groupid, password, created_at) VALUES
-- Group 1 - Couple scenario
(1, 'john.doe', 'John', 'Doe', 1, 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', '2024-01-01 10:00:00'), -- password123
(2, 'jane.smith', 'Jane', 'Smith', 1, 'c6ba91b90d922e159893f46c387e5dc1b3dc5c101a5a4522f03b987177a24a91', '2024-01-01 10:05:00'), -- password456

-- Group 2 - Roommates scenario  
(3, 'alice.wilson', 'Alice', 'Wilson', 2, '5efc2b017da4f7736d192a74dde5891369e0685d4d38f2a455b6fcdab282df9c', '2024-01-01 10:10:00'), -- password789
(4, 'bob.johnson', 'Bob', 'Johnson', 2, '5c773b22ea79d367b38810e7e9ad108646ed62e231868cefb0b1280ea88ac4f0', '2024-01-01 10:15:00'), -- password101
(5, 'charlie.brown', 'Charlie', 'Brown', 2, 'd46b5cd9c1456e3059258a411faf8bbb0253c190cc5acb488f999e1b1421f83b', '2024-01-01 10:20:00'), -- password112

-- Group 3 - Single user scenario
(6, 'solo.user', 'Solo', 'User', 3, '4b8a7c00cee5d73f6a094a7095fba692247d3de6a261df071ab59db42df78bf5', '2024-01-01 10:25:00'); -- password131

-- Insert Test Sessions (valid for 24 hours from creation)
INSERT INTO sessions (username, sessionid, expiry_time) VALUES
('john.doe', 'session_john_123456789', '2024-12-31 23:59:59'),
('jane.smith', 'session_jane_987654321', '2024-12-31 23:59:59'),
('alice.wilson', 'session_alice_456789123', '2024-12-31 23:59:59'),
('bob.johnson', 'session_bob_789123456', '2024-12-31 23:59:59'),
('charlie.brown', 'session_charlie_321654987', '2024-12-31 23:59:59'),
('solo.user', 'session_solo_147258369', '2024-12-31 23:59:59');

-- Insert Test Budget Entries
INSERT INTO budget (id, description, added_time, price, amount, name, groupid, currency, deleted) VALUES
-- Group 1 Budget Entries
(1, 'Monthly house budget allocation', '2024-01-01 12:00:00', '+500.00', 500.00, 'house', 1, 'USD', NULL),
(2, 'Groceries weekly budget', '2024-01-01 12:30:00', '+300.00', 300.00, 'food', 1, 'USD', NULL),
(3, 'Gas and transport expenses', '2024-01-01 13:00:00', '+200.00', 200.00, 'transport', 1, 'USD', NULL),
(4, 'Movie and entertainment fund', '2024-01-01 13:30:00', '+150.00', 150.00, 'entertainment', 1, 'USD', NULL),
(5, 'House maintenance debit', '2024-01-05 14:00:00', '-120.00', -120.00, 'house', 1, 'USD', NULL),
(6, 'Food shopping debit', '2024-01-05 14:30:00', '-85.50', -85.50, 'food', 1, 'USD', NULL),

-- Group 2 Budget Entries (EUR)
(7, 'Vacation fund credit', '2024-01-02 12:00:00', '+1000.00', 1000.00, 'vacation', 2, 'EUR', NULL),
(8, 'Shared house expenses', '2024-01-02 12:30:00', '+600.00', 600.00, 'house', 2, 'EUR', NULL),
(9, 'Group meal budget', '2024-01-02 13:00:00', '+400.00', 400.00, 'food', 2, 'EUR', NULL),
(10, 'Vacation expense - flight', '2024-01-10 15:00:00', '-450.00', -450.00, 'vacation', 2, 'EUR', NULL),
(11, 'House utilities payment', '2024-01-10 15:30:00', '-180.00', -180.00, 'house', 2, 'EUR', NULL),

-- Group 3 Budget Entries (GBP)
(12, 'Business expense fund', '2024-01-03 12:00:00', '+800.00', 800.00, 'business', 3, 'GBP', NULL),
(13, 'Meals and catering budget', '2024-01-03 12:30:00', '+200.00', 200.00, 'meals', 3, 'GBP', NULL),
(14, 'Office supplies purchase', '2024-01-08 14:00:00', '-95.00', -95.00, 'business', 3, 'GBP', NULL),
(15, 'Client lunch meeting', '2024-01-08 14:30:00', '-45.00', -45.00, 'meals', 3, 'GBP', NULL),

-- Deleted budget entry example
(16, 'Cancelled entertainment budget', '2024-01-01 16:00:00', '+100.00', 100.00, 'entertainment', 1, 'USD', '2024-01-02 10:00:00');

-- Insert Test Transactions
INSERT INTO transactions (id, description, amount, created_at, metadata, currency, transaction_id, group_id, deleted) VALUES
-- Group 1 Transactions
(1, 'Grocery shopping at Whole Foods', 150.75, '2024-01-05 18:00:00', '{"paidByShares": {"John": 150.75}, "owedAmounts": {"John": 75.38, "Jane": 75.37}, "owedToAmounts": {"John": 75.38, "Jane": 75.37}}', 'USD', 'txn_grocery_001', 1, NULL),
(2, 'Dinner at Italian restaurant', 89.50, '2024-01-06 19:30:00', '{"paidByShares": {"Jane": 89.50}, "owedAmounts": {"John": 44.75, "Jane": 44.75}, "owedToAmounts": {"John": 44.75, "Jane": 44.75}}', 'USD', 'txn_dinner_002', 1, NULL),
(3, 'Gas station fill-up', 65.00, '2024-01-07 08:15:00', '{"paidByShares": {"John": 65.00}, "owedAmounts": {"John": 45.50, "Jane": 19.50}, "owedToAmounts": {"John": 45.50, "Jane": 19.50}}', 'USD', 'txn_gas_003', 1, NULL),
(4, 'Movie tickets and popcorn', 45.00, '2024-01-08 20:00:00', '{"paidByShares": {"Jane": 45.00}, "owedAmounts": {"John": 22.50, "Jane": 22.50}, "owedToAmounts": {"John": 22.50, "Jane": 22.50}}', 'USD', 'txn_movie_004', 1, NULL),
(5, 'Utility bill payment', 180.00, '2024-01-09 14:00:00', '{"paidByShares": {"John": 180.00}, "owedAmounts": {"John": 90.00, "Jane": 90.00}, "owedToAmounts": {"John": 90.00, "Jane": 90.00}}', 'USD', 'txn_utility_005', 1, NULL),

-- Group 2 Transactions (EUR)
(6, 'Shared grocery shopping', 120.50, '2024-01-10 16:00:00', '{"paidByShares": {"Alice": 120.50}, "owedAmounts": {"Alice": 48.20, "Bob": 36.15, "Charlie": 36.15}, "owedToAmounts": {"Alice": 48.20, "Bob": 36.15, "Charlie": 36.15}}', 'EUR', 'txn_grocery_006', 2, NULL),
(7, 'House cleaning service', 80.00, '2024-01-11 10:30:00', '{"paidByShares": {"Bob": 80.00}, "owedAmounts": {"Alice": 32.00, "Bob": 24.00, "Charlie": 24.00}, "owedToAmounts": {"Alice": 32.00, "Bob": 24.00, "Charlie": 24.00}}', 'EUR', 'txn_cleaning_007', 2, NULL),
(8, 'Group dinner at restaurant', 95.00, '2024-01-12 19:00:00', '{"paidByShares": {"Charlie": 95.00}, "owedAmounts": {"Alice": 38.00, "Bob": 28.50, "Charlie": 28.50}, "owedToAmounts": {"Alice": 38.00, "Bob": 28.50, "Charlie": 28.50}}', 'EUR', 'txn_dinner_008', 2, NULL),
(9, 'Internet bill for house', 50.00, '2024-01-13 12:00:00', '{"paidByShares": {"Alice": 50.00}, "owedAmounts": {"Alice": 20.00, "Bob": 15.00, "Charlie": 15.00}, "owedToAmounts": {"Alice": 20.00, "Bob": 15.00, "Charlie": 15.00}}', 'EUR', 'txn_internet_009', 2, NULL),

-- Group 3 Transactions (GBP)
(10, 'Business lunch with client', 75.00, '2024-01-14 13:30:00', '{"paidByShares": {"Solo": 75.00}, "owedAmounts": {"Solo": 75.00}, "owedToAmounts": {"Solo": 75.00}}', 'GBP', 'txn_lunch_010', 3, NULL),
(11, 'Office supplies purchase', 125.00, '2024-01-15 11:00:00', '{"paidByShares": {"Solo": 125.00}, "owedAmounts": {"Solo": 125.00}, "owedToAmounts": {"Solo": 125.00}}', 'GBP', 'txn_supplies_011', 3, NULL),

-- Deleted transaction example
(12, 'Cancelled movie night', 30.00, '2024-01-16 20:00:00', '{"paidByShares": {"John": 30.00}, "owedAmounts": {"John": 15.00, "Jane": 15.00}, "owedToAmounts": {"John": 15.00, "Jane": 15.00}}', 'USD', 'txn_cancelled_012', 1, '2024-01-17 09:00:00');

-- Insert Test Transaction Users (Split details)
INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, group_id, currency, deleted) VALUES
-- Transaction 1: Grocery shopping
('txn_grocery_001', 1, 150.75, 1, 1, 'USD', NULL), -- John paid
('txn_grocery_001', 2, 75.37, 1, 1, 'USD', NULL),  -- Jane owes John

-- Transaction 2: Dinner
('txn_dinner_002', 1, 44.75, 2, 1, 'USD', NULL), -- John owes Jane
('txn_dinner_002', 2, 89.50, 2, 1, 'USD', NULL), -- Jane paid

-- Transaction 3: Gas
('txn_gas_003', 1, 65.00, 1, 1, 'USD', NULL), -- John paid
('txn_gas_003', 2, 19.50, 1, 1, 'USD', NULL), -- Jane owes John

-- Transaction 4: Movie
('txn_movie_004', 1, 22.50, 2, 1, 'USD', NULL), -- John owes Jane
('txn_movie_004', 2, 45.00, 2, 1, 'USD', NULL), -- Jane paid

-- Transaction 5: Utility
('txn_utility_005', 1, 180.00, 1, 1, 'USD', NULL), -- John paid
('txn_utility_005', 2, 90.00, 1, 1, 'USD', NULL),  -- Jane owes John

-- Transaction 6: Group grocery (Group 2)
('txn_grocery_006', 3, 120.50, 3, 2, 'EUR', NULL), -- Alice paid
('txn_grocery_006', 4, 36.15, 3, 2, 'EUR', NULL),  -- Bob owes Alice
('txn_grocery_006', 5, 36.15, 3, 2, 'EUR', NULL),  -- Charlie owes Alice

-- Transaction 7: House cleaning (Group 2)
('txn_cleaning_007', 3, 32.00, 4, 2, 'EUR', NULL), -- Alice owes Bob
('txn_cleaning_007', 4, 80.00, 4, 2, 'EUR', NULL), -- Bob paid
('txn_cleaning_007', 5, 24.00, 4, 2, 'EUR', NULL), -- Charlie owes Bob

-- Transaction 8: Group dinner (Group 2)
('txn_dinner_008', 3, 38.00, 5, 2, 'EUR', NULL), -- Alice owes Charlie
('txn_dinner_008', 4, 28.50, 5, 2, 'EUR', NULL), -- Bob owes Charlie
('txn_dinner_008', 5, 95.00, 5, 2, 'EUR', NULL), -- Charlie paid

-- Transaction 9: Internet (Group 2)
('txn_internet_009', 3, 50.00, 3, 2, 'EUR', NULL), -- Alice paid
('txn_internet_009', 4, 15.00, 3, 2, 'EUR', NULL), -- Bob owes Alice
('txn_internet_009', 5, 15.00, 3, 2, 'EUR', NULL), -- Charlie owes Alice

-- Transaction 10: Business lunch (Group 3)
('txn_lunch_010', 6, 75.00, 6, 3, 'GBP', NULL), -- Solo paid (self)

-- Transaction 11: Office supplies (Group 3)
('txn_supplies_011', 6, 125.00, 6, 3, 'GBP', NULL), -- Solo paid (self)

-- Deleted transaction user records
('txn_cancelled_012', 1, 30.00, 1, 1, 'USD', '2024-01-17 09:00:00'),
('txn_cancelled_012', 2, 15.00, 1, 1, 'USD', '2024-01-17 09:00:00');

-- Test data summary:
-- Group 1 (john.doe, jane.smith): 5 active transactions in USD
-- Group 2 (alice.wilson, bob.johnson, charlie.brown): 4 active transactions in EUR
-- Group 3 (solo.user): 2 active transactions in GBP
-- Various budget entries with credits and debits
-- Sample deleted records for testing soft delete functionality
-- Multiple currencies for international testing
-- Different split scenarios (50/50, custom percentages, single user)
-- Realistic transaction descriptions and amounts
-- Valid session tokens for authentication testing 