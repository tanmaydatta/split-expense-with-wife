import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir,writeFile,mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

test('production migration schema: component, snapshots and keysets do not scan unrelated records',async()=>{
 const root=new URL('../../cf-worker/',import.meta.url).pathname;
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("synthetic")}}',compatibilityDate:'2025-08-01',d1Databases:{DB:'query-cost'}});
 const temporary=await mkdtemp(join(tmpdir(),'category-query-cost-'));
 const db=await mf.getD1Database('DB');
 try{
 for(const file of (await readdir(root+'src/db/migrations')).filter(f=>f.endsWith('.sql')).sort()){
 const statements=(await readFile(root+'src/db/migrations/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
 for(const sql of statements)await db.prepare(sql).run();
 }
 await symlink(root+'../node_modules',join(temporary,'node_modules'));
 for(const name of ['category-ai','categories','category-backfill','category-backfill-audit']){
 const source=await readFile(root+'src/utils/'+name+'.ts','utf8');
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/(category-ai|categories)"/g,'from "./$1.mjs"');
 await writeFile(join(temporary,name+'.mjs'),output);
 }
 const utility=await import(pathToFileURL(join(temporary,'category-backfill.mjs')));
 const audit=await import(pathToFileURL(join(temporary,'category-backfill-audit.mjs')));
 const categories=await import(pathToFileURL(join(temporary,'categories.mjs')));
 await db.prepare("INSERT INTO groups(groupid,group_name) VALUES('cost','Synthetic'),('foreign','Other synthetic')").run();
 await db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,first_name,last_name,groupid) VALUES('cost-user','Synthetic','synthetic@example.invalid',0,0,0,'Synthetic','Test','cost')").run();
 await db.prepare("INSERT INTO group_budgets(id,group_id,budget_name) VALUES('cost-budget','cost','Synthetic'),('foreign-budget','foreign','Other synthetic')").run();
 await db.prepare("INSERT INTO scheduled_actions(id,user_id,action_type,frequency,start_date,created_at,updated_at,action_data,next_execution_date) VALUES('cost-action','cost-user','add_expense','monthly','2026-01-01','2026-01-01','2026-01-01','{}','2026-11-01')").run();
async function seed(from,to){const cte='WITH RECURSIVE n(x) AS(SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?) ';
for(const [sql,values] of [
["INSERT INTO transactions(transaction_id,group_id,description,amount,currency) SELECT 'cost-t-'||printf('%05d',x),'cost','Synthetic groceries',10,'GBP' FROM n",[]],
["INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency) SELECT 'cost-b-'||printf('%05d',x),'cost-budget','Synthetic groceries',-10,'GBP' FROM n",[]],
["INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) SELECT 'cost-l-'||x,'cost-t-'||printf('%05d',x),'cost-b-'||printf('%05d',x),'cost','2026-10-14' FROM n",[]],
["INSERT INTO scheduled_action_history(id,scheduled_action_id,user_id,action_type,executed_at,execution_status,action_data,result_data) SELECT 'cost-h-'||x,'cost-action','cost-user','add_expense','2026-01-01','success','{}',json_object('transactionId','cost-t-'||printf('%05d',x)) FROM n",[]],
["INSERT INTO transaction_users(transaction_id,user_id,owed_to_user_id,group_id,amount,currency) SELECT 'cost-t-'||printf('%05d',x),'cost-user','cost-user','cost',10,'GBP' FROM n",[]]])await db.prepare(cte+sql).bind(from,to,...values).run();}

 const rootRecord={kind:'expense',id:'cost-t-00001'};
 let reads=0,queryCount=0;const plans=[];
 const wrapped={prepare(sql){const statement=values=>({bind(...values){return statement(values)},async all(){const result=await db.prepare(sql).bind(...values).all();reads+=result.meta.rows_read;queryCount++;plans.push(...(await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...values).all()).results.map(r=>r.detail));return result;}});return statement([])}};
 const env={DB:wrapped,CATEGORIES_ENABLED:'true'};
 async function measure(label,run){reads=0;plans.length=0;const result=await run();console.log(JSON.stringify({label,reads,plans}));return {reads,result,plans:[...plans]};}
 const measurements=[];
 for(const [from,to] of [[1,250],[251,2500]]){
 await seed(from,to);
 // Other households sort before the wanted IDs, so global PK scans would fail.
 await db.prepare("WITH RECURSIVE n(x) AS(SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO transactions(transaction_id,group_id,description,amount,currency) SELECT 'aaa-foreign-'||x,'foreign','Synthetic',1,'GBP' FROM n").bind(from,to).run();
 await db.prepare("WITH RECURSIVE n(x) AS(SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency) SELECT 'aaa-foreign-'||x,'foreign-budget','Synthetic',1,'GBP' FROM n").bind(from,to).run();
 const component=await measure('component-'+to,()=>utility.readBackfillComponent(env,'cost',rootRecord));assert.equal(component.result.length,2);assert(component.reads<40);
 const traversal=await measure('traversal-'+to,()=>wrapped.prepare(categories.CATEGORY_COMPONENT_SQL+' SELECT kind,id FROM component').bind('expense',rootRecord.id,'cost').all());assert(traversal.reads<20);
 const candidate=await measure('budget-page-'+to,()=>utility.readBackfillCandidates(env,'cost',null));assert.equal(candidate.result.length,100);assert(candidate.result.every(r=>r.id.startsWith('cost-b-')));assert(candidate.reads<=105);
 const expense=await measure('expense-page-'+to,()=>utility.readBackfillCandidates(env,'cost',{kind:'expense',id:''}));assert.equal(expense.result.length,100);assert(expense.reads<=100);
 const history=await measure('history-preload-'+to,()=>utility.loadBackfillRecurringIndex(env,'cost'));assert(history.reads<=3*to+5);
 const prior=queryCount;for(let n=0;n<100;n++){const recurring=await utility.recurringBackfillChoices(env,'cost',component.result,history.result);assert(recurring.mapped.has('expense:'+rootRecord.id));}assert.equal(queryCount,prior);
 const ids=Array.from({length:100},(_,i)=>({kind:'expense',id:'cost-t-'+String(i+1).padStart(5,'0')}));
 const financial=await measure('audit-'+to,()=>audit.readBackfillAudit(env,'cost',ids));assert.equal(financial.result.financial.length,100);assert.equal(financial.result.shares.length,100);assert.equal(financial.result.links.length,100);assert(financial.reads<=1200);
 measurements.push({component:component.reads,traversal:traversal.reads,candidate:candidate.reads,expense:expense.reads,audit:financial.reads});
 }
 assert.deepEqual(measurements[1],measurements[0]);
 // Selective category enrichment is also an indexed bounded lookup, including
 // historical uncategorised records with no sidecar.
 const enrichment=await measure('category-enrichment',()=>categories.readRecordCategories(env,'cost','expense',['cost-t-00001','missing']));assert.equal(enrichment.result.size,0);assert(enrichment.reads<10);
 }finally{await mf.dispose();await rm(temporary,{recursive:true,force:true});}
});
