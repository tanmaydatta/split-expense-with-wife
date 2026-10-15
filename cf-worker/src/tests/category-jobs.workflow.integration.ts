import { env, createExecutionContext } from "cloudflare:test";
import worker from "../index";
import { setupAndCleanDatabase, completeCleanupDatabase, createTestUserData, signInAndGetCookies } from "./test-utils";
import { listCategories } from "../utils/categories";
it("runs a real local Workflow from authenticated selection through atomic category publication",async()=>{
 await setupAndCleanDatabase(env);await completeCleanupDatabase(env);
 const users=await createTestUserData(env),cookie=await signInAndGetCookies(env,users.user1.email,users.user1.password);
 const taxonomy=await listCategories(env,users.testGroupId),grocery=taxonomy.categories.find(c=>c.slug==='groceries')!.id;
 await env.DB.prepare("INSERT INTO transactions(transaction_id,description,amount,currency,group_id) VALUES('workflow-e','Synthetic groceries',10,'GBP',?)").bind(users.testGroupId).run();
 await env.DB.prepare("INSERT INTO category_rules(id,group_id,pattern,match_kind,category_id,created_by) VALUES('workflow-rule',?,'groceries','description',?,?)").bind(users.testGroupId,grocery,users.user1.id).run();
 const response=await worker.fetch(new Request("https://localhost:8787/.netlify/functions/category-jobs",{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({requestId:'local-workflow',records:[{kind:'expense',id:'workflow-e'}]})}),env,createExecutionContext());
 expect(response.status).toBe(202);const {job}=await response.json() as {job:{id:string;status:string}};expect(job.status).not.toBe('failed');
 await vi.waitFor(async()=>expect(await env.DB.prepare("SELECT status FROM category_jobs WHERE id=?").bind(job.id).first('status')).toBe('completed'),{timeout:15000,interval:100});
 expect(await env.DB.prepare("SELECT category_id FROM record_categories WHERE record_id='workflow-e'").first('category_id')).toBe(grocery);
 expect(await env.DB.prepare("SELECT status FROM category_job_items WHERE job_id=?").bind(job.id).first('status')).toBe('categorised');
});
