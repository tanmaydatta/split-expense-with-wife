import {CATEGORY_AI_CRITERIA} from "../utils/category-ai";
import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import { setupAndCleanDatabase, completeCleanupDatabase, createTestUserData, signInAndGetCookies } from "./test-utils";
import { listCategories, editRecordCategory } from "../utils/categories";
import { prepareCategoryJobItem, applyCategoryJobItem, finishCategoryJob } from "../utils/category-jobs";
const env = {...testEnv,CATEGORIES_ENABLED:"true"} as Env;
describe("Bulk category job authorization",()=>{
 beforeAll(()=>setupAndCleanDatabase(env));beforeEach(()=>completeCleanupDatabase(env));afterEach(()=>vi.restoreAllMocks());
 const request=(path:string,body?:unknown,cookie="",config=env)=>worker.fetch(new Request(`https://localhost:8787/.netlify/functions/${path}`,{method:body?"POST":"GET",headers:{Cookie:cookie,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}),config,createExecutionContext());
 it.each(["category-jobs","category-jobs?id=foreign"])("rejects unauthenticated %s",async (path:string)=>{expect((await request(path)).status).toBe(401)});
 it("validates selection size before dispatch",async()=>{
 const users=await createTestUserData(env);const cookie=await signInAndGetCookies(env,users.user1.email,users.user1.password);
 expect((await request("category-jobs",{requestId:"test-request",records:[]},cookie)).status).toBe(400);
 expect((await request("category-jobs",{requestId:"test-request",records:Array.from({length:101},(_,i)=>({kind:"expense",id:`e${i}`}))},cookie)).status).toBe(400);
 });
 async function fixture(){
 const users=await createTestUserData(env);const cookie=await signInAndGetCookies(env,users.user1.email,users.user1.password);
 await env.DB.prepare("INSERT INTO transactions(transaction_id,description,amount,currency,group_id) VALUES('bulk-e','Synthetic groceries',10,'GBP',?)").bind(users.testGroupId).run();
 const taxonomy=await listCategories(env,users.testGroupId);const grocery=taxonomy.categories.find(c=>c.slug==="groceries")!.id;
 await env.DB.prepare("INSERT INTO category_rules(id,group_id,pattern,match_kind,category_id,created_by) VALUES('bulk-rule',?,'groceries','description',?,?)").bind(users.testGroupId,grocery,users.user1.id).run();
 const create=vi.fn().mockResolvedValue({id:"workflow"});const config={...env,CATEGORY_JOBS_WORKFLOW:{create}} as unknown as Env;
 const body={requestId:"bulk-request-1",records:[{kind:"expense",id:"bulk-e"}]};
 const response=await request("category-jobs",body,cookie,config);expect(response.status).toBe(202);
 const {job}=await response.json() as {job:{id:string}};
 return {users,cookie,grocery,body,config,create,id:job.id};
 }
 it("deduplicates requests and keeps job status private to its initiator",async()=>{
 const f=await fixture();expect((await request("category-jobs",f.body,f.cookie,f.config)).status).toBe(202);
 expect(await env.DB.prepare("SELECT count(*) AS n FROM category_jobs").first("n")).toBe(1);
 const cookie=await signInAndGetCookies(env,f.users.user2.email,f.users.user2.password);
 expect((await request(`category-jobs?id=${f.id}`,undefined,cookie)).status).toBe(404);
 expect((await request("category-jobs",{...f.body,requestId:"another-request"},f.cookie,f.config)).status).toBe(429);
 });
 it("applies a rule once and records durable results",async()=>{
 const f=await fixture();await prepareCategoryJobItem(env,f.id,0);await applyCategoryJobItem(env,f.id,0);await applyCategoryJobItem(env,f.id,0);await finishCategoryJob(env,f.id);
 expect(await env.DB.prepare("SELECT category_id FROM record_categories WHERE record_id='bulk-e'").first("category_id")).toBe(f.grocery);
 expect(await env.DB.prepare("SELECT version FROM record_categories WHERE record_id='bulk-e'").first("version")).toBe(1);
 expect(await env.DB.prepare("SELECT status FROM category_jobs WHERE id=?").bind(f.id).first("status")).toBe("completed");
 });
 it("preserves concurrent explicit clears",async()=>{
 const f=await fixture();await prepareCategoryJobItem(env,f.id,0);expect(await editRecordCategory(env,f.users.testGroupId,"expense","bulk-e",null,0)).toBe(true);
 await applyCategoryJobItem(env,f.id,0);
 expect(await env.DB.prepare("SELECT source FROM record_categories WHERE record_id='bulk-e'").first("source")).toBe("manual");
 expect(await env.DB.prepare("SELECT status FROM category_job_items WHERE job_id=?").bind(f.id).first("status")).toBe("skipped");
 });
 it("prevents writes after the initiator changes group",async()=>{
 const f=await fixture();await prepareCategoryJobItem(env,f.id,0);
 await env.DB.prepare("UPDATE user SET groupid=NULL WHERE id=?").bind(f.users.user1.id).run();await applyCategoryJobItem(env,f.id,0);
 expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first("n")).toBe(0);
 });
 it("rejects unauthenticated starts before reading selection",async()=>{expect((await request("category-jobs",{requestId:"no-session",records:[{kind:"expense",id:"e"}]})).status).toBe(401);});
 it("skips inaccessible foreign-group roots without inference",async()=>{
 const f=await fixture();await env.DB.prepare("UPDATE category_jobs SET selection=? WHERE id=?").bind(JSON.stringify([{kind:"expense",id:"foreign-record"}]),f.id).run();
 await prepareCategoryJobItem(env,f.id,0);await applyCategoryJobItem(env,f.id,0);
 expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first("n")).toBe(0);
 });
 it("deduplicates selected linked siblings into one classification",async()=>{
 const f=await fixture();await env.DB.prepare("INSERT INTO budget_entries(budget_entry_id,description,amount,currency,budget_id) VALUES('bulk-b','Synthetic sibling',-10,'GBP',?)").bind(f.users.budgetIds.food).run();
 await env.DB.prepare("INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('bulk-link','bulk-e','bulk-b',?,?)").bind(f.users.testGroupId,new Date().toISOString()).run();
 await env.DB.prepare("UPDATE category_jobs SET selection=? WHERE id=?").bind(JSON.stringify([{kind:"expense",id:"bulk-e"},{kind:"budget",id:"bulk-b"}]),f.id).run();await env.DB.prepare("INSERT INTO category_job_items(job_id,position) VALUES(?,1)").bind(f.id).run();
 await prepareCategoryJobItem(env,f.id,0);await applyCategoryJobItem(env,f.id,0);await prepareCategoryJobItem(env,f.id,1);
 expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories WHERE category_id=? AND version=1").bind(f.grocery).first("n")).toBe(2);
 expect(await env.DB.prepare("SELECT status FROM category_job_items WHERE job_id=? AND position=1").bind(f.id).first("status")).toBe("skipped");
 });
 it("does not repeat an inference reservation after an ambiguous crash",async()=>{
 const f=await fixture();await env.DB.prepare("UPDATE category_job_items SET status='resolving' WHERE job_id=?").bind(f.id).run();
 await prepareCategoryJobItem(env,f.id,0);
 expect(await env.DB.prepare("SELECT status FROM category_job_items WHERE job_id=?").bind(f.id).first("status")).toBe("failed");
 expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first("n")).toBe(0);
 });
 it("marks a dispatch failure visible and allows the same request to retry",async()=>{
 const f=await fixture();await env.DB.prepare("DELETE FROM category_jobs WHERE id=?").bind(f.id).run();
 const failed={...env,CATEGORY_JOBS_WORKFLOW:{create:vi.fn().mockRejectedValue(Error("offline")),get:vi.fn().mockRejectedValue(Error("absent"))}} as unknown as Env;
 const response=await request("category-jobs",f.body,f.cookie,failed);const body=await response.json() as {job:{id:string;status:string}};expect(body.job.status).toBe("failed");
 const retry=await request("category-jobs",f.body,f.cookie,f.config);expect((await retry.json() as {job:{status:string}}).job.status).toBe("queued");
 });
 it("accepts an ambiguous dispatch when the deterministic instance exists",async()=>{
 const f=await fixture();const config={...env,CATEGORY_JOBS_WORKFLOW:{create:vi.fn().mockRejectedValue(Error("timeout")),get:vi.fn().mockResolvedValue({id:f.id})}} as unknown as Env;
 expect((await request("category-jobs",f.body,f.cookie,config)).status).toBe(202);
 expect(await env.DB.prepare("SELECT status FROM category_jobs WHERE id=?").bind(f.id).first("status")).toBe("queued");
 });
 it("releases a stale active job when its owner returns",async()=>{
 const f=await fixture();await env.DB.prepare("UPDATE category_jobs SET updated_at=? WHERE id=?").bind(Date.now()-600000,f.id).run();
 const response=await request("category-jobs",undefined,f.cookie);expect((await response.json() as {job:{status:string}}).job.status).toBe("failed");
 });
 it("stops before inference or writes when the durable read budget is exhausted",async()=>{
 const f=await fixture();await env.DB.prepare("UPDATE category_jobs SET rows_read=50000 WHERE id=?").bind(f.id).run();await prepareCategoryJobItem(env,f.id,0);
 expect(await env.DB.prepare("SELECT status FROM category_job_items WHERE job_id=?").bind(f.id).first("status")).toBe("failed");expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first("n")).toBe(0);
 });

 it("uses indexed component reads despite unrelated ledger history",async()=>{
 const f=await fixture();
 await env.DB.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO transactions(transaction_id,description,amount,currency,group_id) SELECT 'unrelated-'||x,'Synthetic unrelated',1,'GBP',? FROM n").bind(f.users.testGroupId).run();
 await prepareCategoryJobItem(env,f.id,0);await applyCategoryJobItem(env,f.id,0);
 const read=await env.DB.prepare("SELECT rows_read FROM category_jobs WHERE id=?").bind(f.id).first<number>("rows_read");expect(read).toBeLessThan(500);expect(read).toBeGreaterThan(0);
 });
 it("checks actor membership again inside the atomic write",async()=>{
 const f=await fixture();await prepareCategoryJobItem(env,f.id,0);const original=env.DB.prepare.bind(env.DB);let moved=false;
 vi.spyOn(env.DB,"prepare").mockImplementation((sql:string)=>{
 const stmt=original(sql);if(sql.includes("INSERT INTO record_categories")&&!moved){moved=true;const bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{await original("UPDATE user SET groupid=NULL WHERE id=?").bind(f.users.user1.id).run();return run();};return bound;};}return stmt;
 });
 await applyCategoryJobItem(env,f.id,0);vi.restoreAllMocks();expect(moved).toBe(true);expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first("n")).toBe(0);
 });


 it("processes 100 independent selected roots within the measured read budget",async()=>{
 const f=await fixture(),records=Array.from({length:100},(_,i)=>({kind:'expense',id:`selected-${i}`}));
 await env.DB.prepare("INSERT INTO transactions(transaction_id,description,amount,currency,group_id) SELECT json_extract(value,'$.id'),'Synthetic groceries',1,'GBP',? FROM json_each(?)").bind(f.users.testGroupId,JSON.stringify(records)).run();
 await env.DB.batch([env.DB.prepare("UPDATE category_jobs SET selection=? WHERE id=?").bind(JSON.stringify(records),f.id),env.DB.prepare("INSERT INTO category_job_items(job_id,position) SELECT ?,CAST(key AS INTEGER) FROM json_each(?) WHERE CAST(key AS INTEGER)>0").bind(f.id,JSON.stringify(records))]);
 for(let i=0;i<100;i++){await prepareCategoryJobItem(env,f.id,i);await applyCategoryJobItem(env,f.id,i);}
 expect(await env.DB.prepare("SELECT count(*) AS n FROM category_job_items WHERE job_id=? AND status='categorised'").bind(f.id).first('n')).toBe(100);
 const reads=await env.DB.prepare("SELECT rows_read FROM category_jobs WHERE id=?").bind(f.id).first<number>('rows_read');expect(reads).toBeLessThan(50000);console.log(`Synthetic selected100 job charged D1 reads: ${reads}`);
 },15000);
 it("fails closed if D1 does not report query read cost",async()=>{
 const f=await fixture(),original=env.DB.prepare.bind(env.DB);let intercepted=false;
 vi.spyOn(env.DB,'prepare').mockImplementation((sql:string)=>{
 const stmt=original(sql);if(sql.includes('SELECT 1 AS ok FROM user')){intercepted=true;const bind=stmt.bind.bind(stmt);stmt.bind=(...values)=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();delete (result.meta as {rows_read?:number}).rows_read;return result;};return bound;};}return stmt;
 });
 await prepareCategoryJobItem(env,f.id,0);vi.restoreAllMocks();expect(intercepted).toBe(true);expect(await env.DB.prepare("SELECT rows_read FROM category_jobs WHERE id=?").bind(f.id).first('rows_read')).toBe(50000);expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first('n')).toBe(0);
 });

 it("returns one durable job for concurrent identical starts",async()=>{
 const f=await fixture();await env.DB.prepare("DELETE FROM category_jobs WHERE id=?").bind(f.id).run();
 const responses=await Promise.all([request('category-jobs',f.body,f.cookie,f.config),request('category-jobs',f.body,f.cookie,f.config)]);
 expect(responses.map(r=>r.status)).toEqual([202,202]);const bodies=await Promise.all(responses.map(r=>r.json())) as Array<{job:{id:string}}>;
 expect(bodies[0].job.id).toBe(bodies[1].job.id);expect(await env.DB.prepare("SELECT count(*) AS n FROM category_jobs").first('n')).toBe(1);
 });

 it("does not query job sidecars while categories are disabled",async()=>{
 const f=await fixture(),spy=vi.spyOn(env.DB,'prepare');
 const response=await request('category-jobs',undefined,f.cookie,{...env,CATEGORIES_ENABLED:'false'} as Env);
 expect(response.status).toBe(503);expect(spy.mock.calls.filter((call:unknown[])=>String(call[0]).includes('category_jobs'))).toHaveLength(0);
 });

 it("does not infer a selected linked sibling again after AI plan publication fails",async()=>{
 const f=await fixture();await env.DB.prepare("DELETE FROM category_rules").run();
 await env.DB.prepare("INSERT INTO budget_entries(budget_entry_id,description,amount,currency,budget_id) VALUES('ai-sibling','Synthetic linked groceries',-10,'GBP',?)").bind(f.users.budgetIds.food).run();
 await env.DB.prepare("INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('ai-link','bulk-e','ai-sibling',?,?)").bind(f.users.testGroupId,new Date().toISOString()).run();
 await env.DB.prepare("UPDATE category_jobs SET selection=? WHERE id=?").bind(JSON.stringify([{kind:'expense',id:'bulk-e'},{kind:'budget',id:'ai-sibling'}]),f.id).run();await env.DB.prepare("INSERT INTO category_job_items(job_id,position) VALUES(?,1)").bind(f.id).run();
 const run=vi.fn().mockResolvedValue({answers:{category:{choice:'groceries',probabilities:Object.fromEntries(Object.keys(CATEGORY_AI_CRITERIA).map(key=>[key,key==='groceries'?.9:.01]))}}});
 const config={...env,CATEGORY_AI_ENABLED:'true',CATEGORY_AI:{run}} as unknown as Env;
 const original=env.DB.prepare.bind(env.DB);let publicationFailed=false;
 const prepareSpy=vi.spyOn(env.DB,'prepare').mockImplementation((sql:string)=>{
 const stmt=original(sql);if(sql.includes('SET status=?,plan=?')&&!publicationFailed){publicationFailed=true;const bind=stmt.bind.bind(stmt);stmt.bind=(...values)=>{const bound=bind(...values);bound.run=async()=>{throw Error('Synthetic plan publication failure');};return bound;};}return stmt;
 });
 await prepareCategoryJobItem(config,f.id,0);prepareSpy.mockRestore();await prepareCategoryJobItem(config,f.id,1);await applyCategoryJobItem(config,f.id,0);await applyCategoryJobItem(config,f.id,1);
 expect(publicationFailed).toBe(true);expect(run).toHaveBeenCalledTimes(1);expect(await env.DB.prepare("SELECT status FROM category_job_items WHERE job_id=? AND position=1").bind(f.id).first('status')).toBe('skipped');expect(await env.DB.prepare("SELECT count(*) AS n FROM record_categories").first('n')).toBe(0);
 });

});
