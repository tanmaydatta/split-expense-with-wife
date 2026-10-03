import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { getDb } from "../db";
import { budgetEntries, transactions, transactionUsers } from "../db/schema/schema";
import worker from "../index";
import { completeCleanupDatabase, createTestRequest, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";
import type { BudgetEntry, TransactionsListResponse } from "../../../shared-types";

describe("Finance list filters", () => {
 let users: Awaited<ReturnType<typeof createTestUserData>>;
 let cookie: string;
 beforeAll(async () => { await setupAndCleanDatabase(env); });
 beforeEach(async () => {
  await completeCleanupDatabase(env);
  users = await createTestUserData(env);
  cookie = await signInAndGetCookies(env, users.user1.email, users.user1.password);
 });
 async function call(endpoint: string, body: object, cookies = cookie) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(createTestRequest(endpoint, "POST", body, cookies), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
 }
 it("combines UTC dates, signed magnitude, currency, substring and budget direction before stable pagination", async () => {
  const db = getDb(env);
  await db.insert(budgetEntries).values(Array.from({length: 8}, (_, i) => ({budgetEntryId: `filter-${i}`, budgetId: users.budgetIds.house, description: "market", amount: -50, currency: "GBP", addedTime: "2024-02-29 23:59:59"})));
  await db.insert(budgetEntries).values([
   {budgetEntryId: "credit", budgetId: users.budgetIds.house, description: "market", amount: 50, currency: "GBP", addedTime: "2024-02-29 00:00:00"},
   {budgetEntryId: "next-day", budgetId: users.budgetIds.house, description: "market", amount: -50, currency: "GBP", addedTime: "2024-03-01 00:00:00"},
   {budgetEntryId: "other-currency", budgetId: users.budgetIds.house, description: "market", amount: -50, currency: "USD", addedTime: "2024-02-29 00:00:00"},
  ]);
  const filters = {budgetId: users.budgetIds.house, q: "50", dateFrom: "2024-02-29", dateTo: "2024-02-29", minAmount: 50, maxAmount: 50, currency: "GBP", direction: "debit", sort: "amount-asc"};
  const first = await (await call("budget_list", {...filters, offset: 0})).json() as BudgetEntry[];
  const second = await (await call("budget_list", {...filters, offset: 5})).json() as BudgetEntry[];
  expect(first.map(e => e.id)).toEqual(["filter-7", "filter-6", "filter-5", "filter-4", "filter-3"]);
  expect(second.map(e => e.id)).toEqual(["filter-2", "filter-1", "filter-0"]);
  const credits = await (await call("budget_list", {...filters, direction: "credit", offset: 0})).json() as BudgetEntry[];
  expect(credits.map(e => e.id)).toEqual(["credit"]);
 });
 it("filters expense net positions for the authenticated user, including mixed and self shares, before pagination", async () => {
  const db = getDb(env);
  const rows = ["owed", "owe", "zero", "self", "precision", "deleted-share", "other-group-share", ...Array.from({length:12}, (_, i) => `noise-${i}`)];
  for (const transactionId of rows) await db.insert(transactions).values({transactionId, groupId: users.testGroupId, description: "dinner", amount: 120, currency: "GBP", createdAt: "2024-02-29 23:59:59"});
  await db.insert(transactions).values(["previous-day", "next-day"].map((transactionId, i) => ({transactionId, groupId:users.testGroupId, description:"dinner", amount:120, currency:"GBP", createdAt:i ? "2024-03-01 00:00:00" : "2024-02-28 23:59:59"})));
  await db.insert(transactionUsers).values([
   {transactionId:"owed", userId:users.user2.id, owedToUserId:users.user1.id, amount:60},
   {transactionId:"owe", userId:users.user1.id, owedToUserId:users.user2.id, amount:60},
   {transactionId:"zero", userId:users.user2.id, owedToUserId:users.user1.id, amount:60},
   {transactionId:"zero", userId:users.user1.id, owedToUserId:users.user2.id, amount:60},
   {transactionId:"precision", userId:users.user2.id, owedToUserId:users.user1.id, amount:0.1},
   {transactionId:"precision", userId:users.user3.id, owedToUserId:users.user1.id, amount:0.2},
   {transactionId:"precision", userId:users.user1.id, owedToUserId:users.user2.id, amount:0.3},
   {transactionId:"self", userId:users.user1.id, owedToUserId:users.user1.id, amount:120},
  ].map(row => ({...row, groupId:users.testGroupId, currency:"GBP"})));
  await db.insert(transactionUsers).values([{transactionId:"deleted-share", userId:users.user2.id, owedToUserId:users.user1.id, amount:100, groupId:users.testGroupId, currency:"GBP", deleted:"2024-03-01 00:00:00"}, {transactionId:"other-group-share", userId:users.user2.id, owedToUserId:users.user1.id, amount:100, groupId:"unrelated-group", currency:"GBP"}]);
  const filters = {offset:0, dateFrom:"2024-02-29", dateTo:"2024-02-29", minAmount:120, maxAmount:120, currency:"GBP", q:"dinner"};
  const ids = async (direction: string, cookies = cookie) => {
   const response = await call("transactions_list", {...filters, direction, userId:users.user2.id}, cookies);
   expect(response.status).toBe(200);
   return ((await response.json()) as TransactionsListResponse).transactions.map(t=>t.transaction_id);
  };
  expect(await ids("owed")).toEqual(["owed"]);
  expect(await ids("owe")).toEqual(["owe"]);
  const secondCookie = await signInAndGetCookies(env, users.user2.email, users.user2.password);
  expect(await ids("owed", secondCookie)).toEqual(["precision", "owe"]);
  expect(await ids("zero")).toContain("zero");
  expect(await ids("zero")).toContain("self");
  expect(await ids("zero")).not.toContain("owed");
  expect(await ids("zero")).toContain("precision");
  expect(await ids("zero")).not.toContain("next-day");
  expect(await ids("zero")).not.toContain("previous-day");
  const noMatch = await call("transactions_list", {...filters, minAmount:121, maxAmount:200});
  expect(((await noMatch.json()) as TransactionsListResponse).transactions).toEqual([]);
 });
 it("rejects invalid filters on both APIs", async () => {
  for (const endpoint of ["budget_list", "transactions_list"]) {
   for (const invalid of [{dateFrom:"2024-02-30"}, {dateFrom:"2024-03-01", dateTo:"2024-02-01"}, {minAmount:-1}, {maxAmount:"Infinity"}, {minAmount:5,maxAmount:4}, {direction:"settled"}, {currency:"gbp"}, {sort:"random"}, {offset:-1}, {q:123}]) {
    const response = await call(endpoint, {budgetId:users.budgetIds.house, offset:0, ...invalid});
    expect(response.status).toBe(400);
   }
  }
 });
});
