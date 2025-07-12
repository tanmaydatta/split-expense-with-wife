import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import worker from "../index";
import { setupAndCleanDatabase, createTestUserData, createTestSession } from "./test-utils";

describe("Split Handlers", () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
  });

  describe("handleSplit", () => {
    it("should create a split successfully with Splitwise", async () => {
      // Mock the external Splitwise API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12345 })
      });
      
      // Replace global fetch with our mock
      vi.stubGlobal('fetch', mockFetch);

      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request("http://example.com/.netlify/functions/split", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 100,
          currency: "USD",
          description: "Dinner",
          splitPctShares: { "1": 50, "2": 50 },
          paidByShares: { "1": 100, "2": 0 },
          pin: "1234"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.message).toBe("Split created successfully");
      
      // Verify the mock was called with the correct URL
      expect(mockFetch).toHaveBeenCalledWith(
        "https://secure.splitwise.com/api/v3.0/create_expense",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": expect.stringContaining("Bearer"),
            "Content-Type": "application/json"
          }),
          body: expect.stringContaining("Dinner")
        })
      );
      
      // Restore global fetch
      vi.unstubAllGlobals();
    });
  });

  describe("handleSplitDelete", () => {
    it("should delete a split successfully", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Create a transaction to delete using correct schema
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('123', 'Test split', 100, 'USD', 1, '2024-01-01 00:00:00')");
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('123', 1, 50, 2, 'USD', 1)");

      const request = new Request("http://example.com/.netlify/functions/split_delete", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "123",
          pin: "1234"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.message).toBe("Transaction deleted successfully");
    });
  });

  describe("handleSplitNew", () => {
    it("should create a new split in the database", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request("http://example.com/.netlify/functions/split_new", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 100,
          currency: "USD",
          description: "Dinner",
          splitPctShares: { "1": 50, "2": 50 },
          paidByShares: { "1": 100, "2": 0 },
          pin: "1234"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.message).toBe("Transaction created successfully");
    });
  });

  describe("handleTransactionsList", () => {
    it("should return a list of transactions", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Create some transactions using correct schema
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('1', 'Transaction 1', 100, 'USD', 1, '2024-01-01 00:00:00')");

      const request = new Request("http://example.com/.netlify/functions/transactions_list", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offset: 0
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.transactions[0].description).toBe("Transaction 1");
    });
  });
}); 