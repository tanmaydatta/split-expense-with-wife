import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import worker from "../index";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions, budgetEntries, expenseBudgetLinks, transactions, transactionUsers } from "../db/schema/schema";
import { encryptBankToken } from "../utils/bank-token";
import { syncBankConnection } from "../utils/bank-sync";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";
const env={...(testEnv as unknown as Env),LUNCH_FLOW_ENABLED:"true",BANK_TOKEN_ENCRYPTION_KEY:"bank-test-key-with-at-least-32-characters"} as Env;
const date=new Date().toISOString().slice(0,10);
describe("Bank review existing records and provisional selections",()=>{
 beforeAll(async()=>setupAndCleanDatabase(env));beforeEach(async()=>completeCleanupDatabase(env));afterEach(()=>vi.restoreAllMocks());
 async function fixture(){
  const users=await createTestUserData(env);const db=getDb(env);const cookie=await signInAndGetCookies(env,users.user1.email,users.user1.password);const other=await signInAndGetCookies(env,users.user2.email,users.user2.password);const now=new Date().toISOString();
  await db.insert(bankConnections).values({id:"c",userId:users.user1.id,groupId:users.testGroupId,provider:"lunch_flow",plaidItemId:"c",providerConnectionId:"c",institutionName:"Synthetic",status:"connected",accessTokenEncrypted:await encryptBankToken(env,"synthetic-key","lunch_flow"),createdAt:now,updatedAt:now});
  await db.insert(bankAccounts).values({id:"c:1",connectionId:"c",providerAccountId:"1",name:"Synthetic",type:"bank",selected:true,amountMultiplier:1});
  await db.insert(bankTransactions).values({id:"c:1:charge",connectionId:"c",userId:users.user1.id,accountId:"c:1",date,name:"Synthetic purchase",amountMinor:1000,currency:"GBP",pending:false,createdAt:now,updatedAt:now});
  await db.insert(transactions).values({transactionId:"expense",description:"Existing expense",amount:10,currency:"GBP",groupId:users.testGroupId,createdAt:date});
  await db.insert(budgetEntries).values({budgetEntryId:"budget",description:"Existing debit",amount:-10,currency:"GBP",budgetId:users.budgetIds.food,addedTime:date});
  const call=(route:string,method="GET",body?:unknown,auth=cookie)=>worker.fetch(new Request(`https://localhost:8787/.netlify/functions/${route.startsWith("dashboard")?route:`bank-import/${route}`}`,{method,headers:{"Content-Type":"application/json",Cookie:auth},...(body?{body:JSON.stringify(body)}:{})}),env,createExecutionContext());
  return {users,db,call,other};
 }
 it("returns full bounded current-group candidate metadata and owner-private source summary", async () => {
  const {users,db,call,other}=await fixture();
  const metadata=JSON.stringify({paidByShares:{[users.user1.id]:10},owedAmounts:{[users.user2.id]:5},owedToAmounts:{[users.user1.id]:5}});
  await db.update(transactions).set({metadata:JSON.parse(metadata)});
  await db.insert(transactionUsers).values({transactionId:"expense",userId:users.user2.id,owedToUserId:users.user1.id,amount:5,currency:"GBP",groupId:users.testGroupId});
  const result=await(await call("review-candidates?bankTransactionId=c:1:charge&kind=expense")).json() as {candidates:Array<{transaction:{metadata:string};transactionUsers:Array<{amount:number;owed_to_user_id:string}>}>};
  expect(result.candidates).toHaveLength(1);expect(result.candidates[0].transaction.metadata).toBe(metadata);expect(result.candidates[0].transactionUsers).toHaveLength(1);expect(result.candidates[0].transactionUsers[0]).toMatchObject({amount:5,owed_to_user_id:users.user1.id});
  const budgets=await(await call("review-candidates?bankTransactionId=c:1:charge&kind=budget")).json() as {candidates:Array<{budgetEntry:{name:string;price:string;groupid:string}}>};
  expect(budgets.candidates[0].budgetEntry).toMatchObject({price:"-10.00",groupid:users.testGroupId});expect(budgets.candidates[0].budgetEntry.name).toBeTruthy();
  await db.update(bankTransactions).set({pending:true});
  expect((await call("provisional","POST",{bankTransactionId:"c:1:charge",sourceVersion:0,transactionId:"expense"})).status).toBe(200);
  const links=await(await call("record-link?transactionId=expense")).json() as {links:unknown[]};
  expect(links.links[0]).toMatchObject({name:"Synthetic purchase",amountMinor:1000,currency:"GBP",accountName:"Synthetic",pending:true,provisional:true});
  expect(await(await call("record-link?transactionId=expense","GET",undefined,other)).json()).toEqual({links:[]});
 });
 it("matches budget independently, extends with expense, creates only metadata and rejects replay",async()=>{
  const {db,call}=await fixture();expect((await call("match","POST",{bankTransactionId:"c:1:charge",budgetEntryId:"budget",sourceVersion:0})).status).toBe(200);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",transactionId:"expense",sourceVersion:1})).status).toBe(200);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(1);expect((await db.select().from(budgetEntries))[0].amount).toBe(-10);expect((await db.select().from(transactions))[0].amount).toBe(10);
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",transactionId:"expense",sourceVersion:1})).status).toBe(409);
 });
 it("keeps compatible historic multi-links but rejects a conflicting new pair",async()=>{
  const {users,db,call}=await fixture();await db.insert(expenseBudgetLinks).values({id:"other",transactionId:"expense",budgetEntryId:"other-budget",groupId:users.testGroupId,createdAt:date});
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",transactionId:"expense",budgetEntryId:"budget",sourceVersion:0})).status).toBe(409);
  expect((await db.select().from(bankTransactions))[0].linkedTransactionId).toBeNull();
  await db.insert(expenseBudgetLinks).values({id:"pair",transactionId:"expense",budgetEntryId:"budget",groupId:users.testGroupId,createdAt:date});
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",transactionId:"expense",budgetEntryId:"budget",sourceVersion:0})).status).toBe(200);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(2);
 });
 it("validates signed budget amounts and owner-only detail/reverse lookup",async()=>{
  const {db,call,other}=await fixture();await db.update(budgetEntries).set({amount:10});
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",budgetEntryId:"budget",sourceVersion:0})).status).toBe(400);
  await db.update(bankTransactions).set({amountMinor:-1000});
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",budgetEntryId:"budget",sourceVersion:0})).status).toBe(200);
  expect((await call("transaction?id=c:1:charge","GET",undefined,other)).status).toBe(404);
  expect(await (await call("record-link?budgetEntryId=budget","GET",undefined,other)).json()).toEqual({links:[]});
  expect((await (await call("record-link?budgetEntryId=budget")).json() as {links:unknown[]}).links).toHaveLength(1);
 });
 it("saves pending privately without financial links; stable-ID posting requires confirmation",async()=>{
  const {db,call,other}=await fixture();await db.update(bankTransactions).set({pending:true});
  expect((await call("provisional","POST",{bankTransactionId:"c:1:charge",sourceVersion:0,transactionId:"expense",budgetEntryId:"budget"})).status).toBe(200);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);expect((await db.select().from(bankTransactions))[0].reviewStatus).toBe("unreviewed");
  expect(await (await call("record-link?transactionId=expense","GET",undefined,other)).json()).toEqual({links:[]});
  await db.update(bankTransactions).set({pending:false,rowVersion:1});
  const detail=await (await call("transaction?id=c:1:charge")).json() as {transaction:{draftId:string;provisionalBudgetEntryId:string}};
  expect(detail.transaction.provisionalBudgetEntryId).toBe("budget");
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",sourceVersion:1,transactionId:"expense",budgetEntryId:"budget",draftId:detail.transaction.draftId})).status).toBe(200);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(1);
 });
 it("preserves identical anonymous pending multiplicity and vanished selections without identity guessing",async()=>{
  const {db,call}=await fixture();const pending={id:null,accountId:1,amount:10,currency:"GBP",date,merchant:"Synthetic",isPending:true};
  const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({transactions:[pending,pending],total:2}));await syncBankConnection(env,db,{id:"c"});
  const inbox=await (await call("inbox?status=pending")).json() as {transactions:Array<{id:string}>};expect(inbox.transactions).toHaveLength(2);expect(new Set(inbox.transactions.map(r=>r.id)).size).toBe(2);
  const id=inbox.transactions[0].id;expect((await call("provisional","POST",{bankTransactionId:id,sourceVersion:0,transactionId:"expense"})).status).toBe(200);
  fetchMock.mockResolvedValue(Response.json({transactions:[],total:0}));await syncBankConnection(env,db,{id:"c"});
  const detail=await (await call(`transaction?id=${id}`)).json() as {transaction:{noLongerPending:number}};expect(detail.transaction.noLongerPending).toBe(1);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);expect(await db.select().from(transactions)).toHaveLength(1);
 });
 it("failed complete-snapshot validation retains pending generation and posted rows",async()=>{
  const {db,call}=await fixture();const pending={id:null,accountId:1,amount:10,currency:"GBP",date,isPending:true};const mock=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({transactions:[pending],total:1}));await syncBankConnection(env,db,{id:"c"});
  const before=await(await call("inbox?status=pending")).json();const rowsBefore=await db.select().from(bankTransactions);
  mock.mockResolvedValue(Response.json({transactions:[],total:1}));await expect(syncBankConnection(env,db,{id:"c"})).rejects.toThrow("invalid_data");
  expect(await(await call("inbox?status=pending")).json()).toEqual(before);expect(await db.select().from(bankTransactions)).toEqual(rowsBefore);
 });
 it("creates via existing dashboard atomically using authenticated bank amount/date and rejects duplicate/tampered saves",async()=>{
  const {users,db,call}=await fixture();const body={bankSource:{bankTransactionId:"c:1:charge",sourceVersion:0},expense:{description:"New synthetic",amount:10,currency:"GBP",paidByShares:{[users.user1.id]:10},splitPctShares:{[users.user1.id]:50,[users.user2.id]:50}},budget:{description:"New synthetic",amount:-10,currency:"GBP",budgetId:users.budgetIds.food}};
  expect((await call("dashboard_submit","POST",{...body,expense:{...body.expense,amount:99}})).status).toBe(400);
  expect((await call("dashboard_submit","POST",body)).status).toBe(200);expect((await call("dashboard_submit","POST",body)).status).toBe(409);
  const bank=(await db.select().from(bankTransactions))[0];const expense=(await db.select().from(transactions).where(eq(transactions.transactionId,bank.linkedTransactionId as string)))[0];expect(expense.createdAt).toBe(`${date} 00:00:00`);expect(await db.select().from(expenseBudgetLinks)).toHaveLength(1);expect(await db.select().from(transactions)).toHaveLength(2);
 });
 it("refuses missing-side creation when previously matched record was deleted, rolling back claim and ledger",async()=>{
  const {users,db,call}=await fixture();await db.update(bankTransactions).set({linkedTransactionId:"expense",reviewStatus:"matched"});await db.update(transactions).set({deleted:date});
  expect((await call("dashboard_submit","POST",{bankSource:{bankTransactionId:"c:1:charge",sourceVersion:0},budget:{description:"No partial",amount:-10,currency:"GBP",budgetId:users.budgetIds.food}})).status).toBe(409);
  expect(await db.select().from(budgetEntries)).toHaveLength(1);expect((await db.select().from(bankTransactions))[0].linkedBudgetEntryId).toBeNull();expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);
 });
 it("cancel/reactivate preserves draft identity and rejects stale versions",async()=>{
  const {db,call}=await fixture();await db.update(bankTransactions).set({pending:true});
  const input={bankTransactionId:"c:1:charge",sourceVersion:0,transactionId:"expense"};
  const first=await(await call("provisional","POST",input)).json() as {draftId:string};
  expect((await call("provisional-cancel","POST",{draftId:first.draftId,draftVersion:0})).status).toBe(200);
  expect((await call("provisional","POST",{...input,draftVersion:0})).status).toBe(409);
  const second=await(await call("provisional","POST",{...input,draftVersion:1})).json() as {draftId:string};expect(second.draftId).toBe(first.draftId);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);
 });
 it("a concurrent draft cancellation rolls back final bank claim and pair insertion",async()=>{
  const {db,call}=await fixture();await db.update(bankTransactions).set({pending:true});
  const saved=await(await call("provisional","POST",{bankTransactionId:"c:1:charge",sourceVersion:0,transactionId:"expense",budgetEntryId:"budget"})).json() as {draftId:string};
  await db.update(bankTransactions).set({pending:false,rowVersion:1});const original=env.DB.batch.bind(env.DB);
  vi.spyOn(env.DB,"batch").mockImplementationOnce(async(statements:D1PreparedStatement[])=>{await env.DB.prepare("UPDATE bank_review_drafts SET status='cancelled',version=version+1 WHERE id=?").bind(saved.draftId).run();return original(statements);});
  expect((await call("match","POST",{bankTransactionId:"c:1:charge",sourceVersion:1,transactionId:"expense",budgetEntryId:"budget",draftId:saved.draftId,draftVersion:0})).status).toBe(409);
  expect((await db.select().from(bankTransactions))[0].linkedTransactionId).toBeNull();expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);
 });
 it("failed staging and failed publication retain the old visible pending generation",async()=>{
  const {db,call}=await fixture();const pending={id:null,accountId:1,amount:10,currency:"GBP",date,isPending:true};const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({transactions:[pending],total:1}));await syncBankConnection(env,db,{id:"c"});
  const before=await(await call("inbox?status=pending")).json();const bankBefore=await db.select().from(bankTransactions);const original=env.DB.batch.bind(env.DB);
  fetchMock.mockResolvedValue(Response.json({transactions:Array.from({length:101},()=>pending),total:101}));let batches=0;
  const batchMock=vi.spyOn(env.DB,"batch").mockImplementation(async(statements:D1PreparedStatement[])=>{batches++;if(batches===2)throw new Error("synthetic stage failure");return original(statements);});
  await expect(syncBankConnection(env,db,{id:"c"})).rejects.toThrow("synthetic stage failure");expect(await(await call("inbox?status=pending")).json()).toEqual(before);expect(await db.select().from(bankTransactions)).toEqual(bankBefore);
  batches=0;fetchMock.mockResolvedValue(Response.json({transactions:[pending,pending],total:2}));batchMock.mockImplementation(async(statements:D1PreparedStatement[])=>{batches++;return original(batches===2?[...statements,env.DB.prepare("INSERT INTO missing_synthetic_failure VALUES(1)")]:statements);});
  await expect(syncBankConnection(env,db,{id:"c"})).rejects.toThrow();expect(await(await call("inbox?status=pending")).json()).toEqual(before);
 });

 it("round-trips SQL null draft versions for first identified pending selection but requires versions for existing choices",async()=>{
  const {db,call}=await fixture();await db.update(bankTransactions).set({pending:true});
  const first=await(await call("transaction?id=c:1:charge")).json() as {transaction:{id:string;rowVersion:number;draftVersion:number|null}};
  expect(first.transaction.draftVersion).toBeNull();
  const body={bankTransactionId:first.transaction.id,sourceVersion:first.transaction.rowVersion,draftVersion:first.transaction.draftVersion,transactionId:"expense"};
  expect((await call("provisional","POST",body)).status).toBe(200);
  expect((await call("provisional","POST",body)).status).toBe(409);
  expect((await call("provisional","POST",{...body,draftVersion:0,budgetEntryId:"budget"})).status).toBe(200);
  expect((await call("provisional","POST",{...body,draftVersion:0})).status).toBe(409);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);
 });
 it("round-trips anonymous pending SQL null draft versions without creating financial links",async()=>{
  const {db,call}=await fixture();const pending={id:null,accountId:1,amount:10,currency:"GBP",date,isPending:true};
  vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({transactions:[pending],total:1}));await syncBankConnection(env,db,{id:"c"});
  const inbox=await(await call("inbox?status=pending")).json() as {transactions:Array<{id:string}>};
  const first=await(await call(`transaction?id=${inbox.transactions[0].id}`)).json() as {transaction:{id:string;rowVersion:number;draftVersion:number|null}};
  expect(first.transaction.draftVersion).toBeNull();
  expect((await call("provisional","POST",{bankTransactionId:first.transaction.id,sourceVersion:first.transaction.rowVersion,draftVersion:first.transaction.draftVersion,budgetEntryId:"budget"})).status).toBe(200);
  expect(await db.select().from(expenseBudgetLinks)).toHaveLength(0);expect((await db.select().from(transactions))[0].amount).toBe(10);
 });

});
