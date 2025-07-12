import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../index";
import { setupAndCleanDatabase, createTestUserData, createTestSession } from "./test-utils";

describe("Budget Handlers", () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
  });

  describe("handleBalances", () => {
    it("should return calculated balances for the user", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Add some transaction data to create balances
      await env.DB.exec("INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES ('test-tx-1', 'Test transaction', 100, 'USD', 1, '2024-01-01 00:00:00')");
      await env.DB.exec("INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id) VALUES ('test-tx-1', 1, 50, 2, 'USD', 1), ('test-tx-1', 2, 20, 1, 'USD', 1)");

      const request = new Request("http://example.com/.netlify/functions/balances", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.Other.USD).toBe(-30);
    });
  });

  describe("handleBudget", () => {
    it("should create a budget entry successfully", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request("http://example.com/.netlify/functions/budget", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 100,
          description: "Groceries",
          pin: "1234",
          name: "house",
          groupid: 1,
          currency: "USD"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.message).toBe("Budget entry created successfully");
    });

    it("should return 401 if not authorized for budget", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);

      const request = new Request("http://example.com/.netlify/functions/budget", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 100,
          description: "Groceries",
          pin: "1234",
          name: "unauthorized_budget",
          groupid: 1,
          currency: "USD"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });
  });

  describe("handleBudgetDelete", () => {
    it("should delete a budget entry successfully", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Create a budget entry to delete with correct schema
      await env.DB.exec("INSERT INTO budget (id, description, price, added_time, amount, name, groupid, currency) VALUES (1, 'Test entry', '+100.00', '2024-01-01 00:00:00', 100, 'house', 1, 'USD')");

      const request = new Request("http://example.com/.netlify/functions/budget_delete", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: 1,
          pin: "1234"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json.message).toBe("Budget entry deleted successfully");
    });
  });

  describe("handleBudgetList", () => {
    it("should return a list of budget entries", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Create budget entries with correct schema
      await env.DB.exec("INSERT INTO budget (id, description, price, added_time, amount, name, groupid, currency) VALUES (1, 'Groceries', '+100.00', '2024-01-01 00:00:00', 100, 'house', 1, 'USD')");

      const request = new Request("http://example.com/.netlify/functions/budget_list", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "house",
          offset: 0,
          pin: "1234"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json[0].description).toBe("Groceries");
    });
  });

  describe("handleBudgetMonthly", () => {
    it("should return monthly budget totals", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Create budget entries with negative amounts for monthly totals
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Monthly expense', '-500.00', '2024-07-15 00:00:00', -500, 'house', 1, 'USD')");

      const request = new Request("http://example.com/.netlify/functions/budget_monthly", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "house"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json[0].amounts[0].amount).toBe(-500);
    });
  });

  describe("handleBudgetTotal", () => {
    it("should return budget totals", async () => {
      // Set up test data
      await createTestUserData(env);
      await createTestSession(env);
      
      // Create budget entries with correct schema
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Entry 1', '+500.00', '2024-01-01 00:00:00', 500, 'house', 1, 'USD')");
      await env.DB.exec("INSERT INTO budget (description, price, added_time, amount, name, groupid, currency) VALUES ('Entry 2', '+1000.00', '2024-02-01 00:00:00', 1000, 'house', 1, 'USD')");

      const request = new Request("http://example.com/.netlify/functions/budget_total", {
        method: "POST",
        headers: {
          "Authorization": "Bearer test-session-id",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "house",
          pin: "1234"
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const json = await response.json() as any;
      expect(json[0].amount).toBe(1500);
    });
  });
}); 