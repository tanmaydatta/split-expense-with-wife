import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import { executeActionStatements, processBudgetAction, processExpenseAction } from "../workflows/scheduled-actions-processor";
import { getDb } from "../db";
import { bills, scheduledActions, budgetEntries, expenseBudgetLinks, groups, transactions } from "../db/schema/schema";
import { categoriesEnabled, editRecordCategory, listCategories, readRecordCategories, resolveCategory } from "../utils/categories";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";
const env={...testEnv,CATEGORIES_ENABLED:"true"} as Env;
describe("Optional group category sidecars",()=>{
 beforeAll(async()=>setupAndCleanDatabase(env));beforeEach(async()=>completeCleanupDatabase(env));afterEach(()=>vi.restoreAllMocks());
 async function fixture(){
  const users=await createTestUserData(env);const db=getDb(env);const cookie=await signInAndGetCookies(env,users.user1.email,users.user1.password);
  const taxonomy=await listCategories(env,users.testGroupId);const grocery=taxonomy.categories.find(c=>c.slug==="groceries")!.id;const transport=taxonomy.categories.find(c=>c.slug==="transport")!.id;
  await db.insert(transactions).values([{transactionId:"e1",description:"Synthetic groceries",amount:10,currency:"GBP",groupId:users.testGroupId},{transactionId:"e2",description:"Synthetic second",amount:10,currency:"GBP",groupId:users.testGroupId}]);
  await db.insert(budgetEntries).values([{budgetEntryId:"b1",description:"Synthetic debit",amount:-10,currency:"GBP",budgetId:users.budgetIds.food},{budgetEntryId:"b2",description:"Synthetic debit second",amount:-10,currency:"GBP",budgetId:users.budgetIds.food}]);
  await db.insert(expenseBudgetLinks).values([{id:"l1",transactionId:"e1",budgetEntryId:"b1",groupId:users.testGroupId,createdAt:new Date().toISOString()},{id:"l2",transactionId:"e2",budgetEntryId:"b1",groupId:users.testGroupId,createdAt:new Date().toISOString()},{id:"l3",transactionId:"e2",budgetEntryId:"b2",groupId:users.testGroupId,createdAt:new Date().toISOString()}]);
  const call=(route:string,body?:unknown)=>worker.fetch(new Request(`https://localhost:8787/.netlify/functions/${route}`,{method:body?"POST":"GET",headers:{Cookie:cookie,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}),env,createExecutionContext());
  return {users,db,grocery,transport,call};
 }
 it("disabled and missing-schema paths do not touch optional tables or block resolution",async()=>{
  const spy=vi.spyOn(env.DB,"prepare");const disabled={...env,CATEGORIES_ENABLED:"false"};expect(categoriesEnabled(disabled)).toBe(false);expect(await listCategories(disabled,"group")).toEqual({enabled:false,categories:[]});expect(await resolveCategory(disabled,"group",{description:"Example"})).toBeUndefined();expect(spy).not.toHaveBeenCalled();
  spy.mockImplementation(()=>{throw Error("D1_ERROR: no such table: group_categories")});expect(await listCategories(env,"group")).toEqual({enabled:false,categories:[]});
 });
 it("defaults are stable, distinct groceries/eating-out and do not repeatedly write",async()=>{
  const {users}=await fixture();const spy=vi.spyOn(env.DB,"batch");const first=await listCategories(env,users.testGroupId);const second=await listCategories(env,users.testGroupId);expect(first.categories).toEqual(second.categories);expect(first.categories.map(c=>c.slug)).toContain("eating_out");expect(spy).not.toHaveBeenCalled();expect(await env.DB.prepare("SELECT count(*) AS count FROM record_categories").first("count")).toBe(0);
 });
 it("manual edit updates an entire many-to-many component atomically and keeps manual clear",async()=>{
  const {users,grocery}=await fixture();expect(await editRecordCategory(env,users.testGroupId,"expense","e1",grocery,0)).toBe(true);
  const rows=await env.DB.prepare("SELECT category_id,source FROM record_categories WHERE group_id=?").bind(users.testGroupId).all();expect(rows.results).toHaveLength(4);expect(rows.results.every(r=>r.category_id===grocery&&r.source==="manual")).toBe(true);
  expect(await editRecordCategory(env,users.testGroupId,"budget","b2",null,1)).toBe(true);const cleared=await readRecordCategories(env,users.testGroupId,"expense",["e1","e2"]);expect(cleared.get("e1")).toMatchObject({categoryId:null,categorySource:"manual"});
  expect(await editRecordCategory(env,users.testGroupId,"expense","e1",grocery,1)).toBe(false);expect((await readRecordCategories(env,users.testGroupId,"expense",["e1"])).get("e1")?.categoryId).toBeNull();
 });
 it("cross-group categories fail API validation and composite database ownership constraints",async()=>{
  const {users,call}=await fixture();await getDb(env).insert(groups).values({groupid:"foreign",groupName:"Foreign"});const other=(await listCategories(env,"foreign")).categories[0].id;
  expect((await call("record-category",{kind:"expense",id:"e1",categoryId:other,version:0})).status).toBe(400);
  await expect(env.DB.prepare("INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,?,?,?,?)").bind(users.testGroupId,"expense","e1",other,"manual").run()).rejects.toThrow();
  expect(await env.DB.prepare("SELECT count(*) AS count FROM record_categories").first("count")).toBe(0);
 });
 it("archives preserve saved labels and explicit rules require group consent",async()=>{
  const {users,grocery,call}=await fixture();expect((await call("categories",{action:"rule",categoryId:grocery,pattern:"Example Market",kind:"merchant"})).status).toBe(400);
  expect((await call("categories",{action:"rule",categoryId:grocery,pattern:"Example Market",kind:"merchant",sharedGroupConsent:true})).status).toBe(200);
  expect(await resolveCategory(env,users.testGroupId,{description:"Weekly",merchant:"  EXAMPLE MARKET "})).toEqual({categoryId:grocery,source:"rule"});expect(await resolveCategory(env,users.testGroupId,{categoryId:null,description:"Weekly",merchant:"Example Market"})).toEqual({categoryId:null,source:"manual"});
  expect(await editRecordCategory(env,users.testGroupId,"expense","e1",grocery,0)).toBe(true);expect((await call("categories",{action:"archive",id:grocery,archived:true})).status).toBe(200);
  expect((await readRecordCategories(env,users.testGroupId,"expense",["e1"])).get("e1")?.categoryName).toBe("Groceries");expect(await resolveCategory(env,users.testGroupId,{description:"Weekly",merchant:"Example Market"})).toEqual({categoryId:null,source:"uncategorised"});
 });
 it("concurrent edits through different linked roots cannot partially overwrite the component",async()=>{
  const {users,grocery,transport}=await fixture();await editRecordCategory(env,users.testGroupId,"expense","e1",grocery,0);
  const results=await Promise.all([editRecordCategory(env,users.testGroupId,"expense","e1",transport,1),editRecordCategory(env,users.testGroupId,"budget","b2",null,1)]);
  expect(results.filter(Boolean)).toHaveLength(1);const rows=await env.DB.prepare("SELECT category_id,source,version FROM record_categories WHERE group_id=?").bind(users.testGroupId).all();expect(new Set(rows.results.map(r=>r.category_id)).size).toBe(1);expect(rows.results.every(r=>r.source==="manual"&&r.version===2)).toBe(true);
 });
 it("dashboard atomic pairs persist one manual category and historical Uncategorised filters include old records",async()=>{
  const {users,grocery,call}=await fixture();const saved=await(await call("dashboard_submit",{categoryId:grocery,categorySource:"ai",expense:{description:"Synthetic new purchase",amount:10,currency:"GBP",paidByShares:{[users.user1.id]:10},splitPctShares:{[users.user1.id]:50,[users.user2.id]:50}},budget:{description:"Synthetic new debit",amount:-10,currency:"GBP",budgetId:users.budgetIds.food}})).json() as {transactionId:string;budgetEntryId:string};
  const categories=await env.DB.prepare("SELECT category_id,source FROM record_categories").all();expect(categories.results).toHaveLength(2);expect(categories.results.every(r=>r.category_id===grocery&&r.source==="manual")).toBe(true);
  const detail=await(await call("transaction_get",{id:saved.transactionId})).json() as {transaction:{categoryId:string;categoryName:string};linkedBudgetEntry:{categoryId:string}};expect(detail.transaction).toMatchObject({categoryId:grocery,categoryName:"Groceries"});expect(detail.linkedBudgetEntry.categoryId).toBe(grocery);
  const classified=await(await call("transactions_list",{offset:0,categoryId:grocery})).json() as {transactions:Array<{transaction_id:string}>};expect(classified.transactions.map(r=>r.transaction_id)).toEqual([saved.transactionId]);
  const uncategorised=await(await call("transactions_list",{offset:0,categoryId:"uncategorised"})).json() as {transactions:Array<{transaction_id:string}>};expect(uncategorised.transactions.map(r=>r.transaction_id).sort()).toEqual(["e1","e2"]);
 });

 it.each(["expense-first","budget-first"])("scheduled bill pairs share expense default and protect later manual clear (%s)",async(order:string)=>{
  const {users,db,grocery,transport}=await fixture();const date="2026-10-14";const now=`${date}T00:00:00Z`;
  await db.insert(scheduledActions).values([
   {id:"expense-action",userId:users.user1.id,actionType:"add_expense",frequency:"monthly",startDate:date,nextExecutionDate:date,createdAt:now,updatedAt:now,actionData:{amount:10,description:"Shared recurring",currency:"GBP",paidByUserId:users.user1.id,splitPctShares:{[users.user1.id]:100},categoryId:grocery}},
   {id:"budget-action",userId:users.user1.id,actionType:"add_budget",frequency:"monthly",startDate:date,nextExecutionDate:date,createdAt:now,updatedAt:now,actionData:{amount:10,description:"Recurring debit",currency:"GBP",budgetId:users.budgetIds.food,type:"Debit",categoryId:transport}},
  ]);
  await db.insert(bills).values({id:"category-bill",groupId:users.testGroupId,title:"Recurring",amountMinor:1000,currency:"GBP",firstDueDate:date,recurrence:"monthly",payerUserId:users.user1.id,splitBasisPoints:{[users.user1.id]:10000},scheduledActionId:"expense-action",scheduledBudgetActionId:"budget-action",createdAt:now,updatedAt:now});
  const actions=await db.select().from(scheduledActions);const owner={groupid:users.testGroupId} as Parameters<typeof processExpenseAction>[2];
  const ids=order==="expense-first"?["expense-action","budget-action"]:["budget-action","expense-action"];
  for(const [index,id] of ids.entries()){
   const action=actions.find(a=>a.id===id)!;const result=id==="expense-action"?await processExpenseAction(env,action,owner,date):await processBudgetAction(env,action,owner,date);
   // Between planning the second half and its publication, a member clears the first.
   if(index===1)expect(await editRecordCategory(env,users.testGroupId,ids[0]==="expense-action"?"expense":"budget",ids[0]==="expense-action"?`tx_expense-action_${date}`:`bge_budget-action_${date}`,null,1)).toBe(true);
   await executeActionStatements(env,action,`history-${id}`,1,result.resultData,result.statements,new Date(now));
   if(index===0){const category=(await readRecordCategories(env,users.testGroupId,id==="expense-action"?"expense":"budget",[id==="expense-action"?`tx_expense-action_${date}`:`bge_budget-action_${date}`])).values().next().value;expect(category?.categoryId).toBe(grocery);}
  }
  const rows=await env.DB.prepare("SELECT category_id,source FROM record_categories WHERE record_id IN (?,?)").bind(`tx_expense-action_${date}`,`bge_budget-action_${date}`).all();expect(rows.results).toHaveLength(2);expect(rows.results.every(r=>r.category_id===null)).toBe(true);expect(rows.results.some(r=>r.source==="manual")).toBe(true);
  expect((await db.select().from(expenseBudgetLinks)).some(l=>l.transactionId===`tx_expense-action_${date}`)).toBe(true);
 });

 it("recurring defaults validate group ownership and preserve unchanged archived categories",async()=>{
  const {users,grocery,call}=await fixture();const data={amount:10,description:"Recurring category",currency:"GBP",paidByUserId:users.user1.id,splitPctShares:{[users.user1.id]:100},categoryId:"foreign"};
  expect((await call("scheduled-actions",{actionType:"add_expense",frequency:"monthly",startDate:"2026-11-01",actionData:data})).status).toBe(400);
  const created=await call("scheduled-actions",{actionType:"add_expense",frequency:"monthly",startDate:"2026-11-01",actionData:{...data,categoryId:grocery}});expect(created.status).toBe(201);const saved=await created.json() as {id:string};
  expect((await call("categories",{action:"archive",id:grocery,archived:true})).status).toBe(200);
  expect((await call("scheduled-actions/update",{id:saved.id,actionData:{...data,categoryId:grocery,description:"Updated title"}})).status).toBe(200);
  expect((await call("scheduled-actions/update",{id:saved.id,actionData:data})).status).toBe(400);
 });

});
