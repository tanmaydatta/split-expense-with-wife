import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
test('CLI requires exact scope, emits private resumable readonly preview and rejects changed digest',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'backfill-cli-test-'));try{
 const preload=join(dir,'mock.mjs'),file=join(dir,'preview.json');
 await writeFile(preload,`globalThis.fetch=async(url,options)=>{let result;if(url.endsWith('/deployments'))result={deployments:[{versions:[{version_id:'version',percentage:100}]}]};else{const {sql,params}=JSON.parse(options.body);if(/INSERT|UPDATE|DELETE/.test(sql))throw Error('Preview attempted write');let rows=[];if(sql.includes('d1_migrations'))rows=[{name:'0032_category_maintenance_paging.sql'}];else if(sql.includes('FROM group_categories'))rows=[{id:'grocery',name:'Groceries',slug:'groceries',archivedAt:null}];else if(sql.includes("SELECT 'expense' AS kind,transaction_id")&&!params[0])rows=[{kind:'expense',id:'record'}];else if(sql.includes('l.description,r.category_id'))rows=[{kind:'expense',id:'record',description:'payment',categoryId:null,source:null,version:0}];result=[{success:true,results:rows,meta:{changes:0,rows_read:1}}];}return {ok:true,json:async()=>({success:true,result})};};`);
 const run=(...options)=>spawnSync(process.execPath,['--import',preload,'scripts/backfill-household-categories.mjs',...options],{encoding:'utf8',env:{...process.env,CF_ACCOUNT_ID:'synthetic',CF_API_TOKEN:'synthetic'}});
 assert.notEqual(run('preview').status,0);
 const common=['--group','household','--environment','prod','--deployment','version','--file',file];
 const first=run('preview',...common);assert.equal(first.status,0,first.stderr);
 const text=await readFile(file,'utf8'),manifest=JSON.parse(text);assert.equal(manifest.complete,true);assert.equal(manifest.plans.length,1);assert.equal(manifest.plans[0].status,'abstained');assert(!text.includes('payment'));assert.equal((await stat(file)).mode&0o777,0o600);
 const resumed=run('preview',...common,'--resume','true');assert.equal(resumed.status,0,resumed.stderr);assert.equal(JSON.parse(await readFile(file,'utf8')).plans.length,1);
 assert.notEqual(run('apply',...common,'--approve-preview','changed').status,0);
 const digest=createHash('sha256').update(await readFile(file)).digest('hex');const apply=run('apply',...common,'--approve-preview',digest);assert.equal(apply.status,0,apply.stderr);assert.equal(JSON.parse(apply.stdout).counts.skipped,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('four-request cohorts deduplicate linked members, preserve stable cursor/resume and retain timeout slots',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'backfill-cohort-test-'));try{
 const preload=join(dir,'mock.mjs'),file=join(dir,'preview.json'),stats=join(dir,'stats.json');
 await writeFile(preload,`import {writeFileSync} from 'node:fs';
let active=0,maxActive=0,aiCalls=0,activeAI=0,activeMetadata=0,maxAI=0,maxMetadata=0;const candidates=['budget','expense'].flatMap(kind=>Array.from({length:11},(_,i)=>({kind,id:(kind==='budget'?'b':'e')+String(i).padStart(2,'0')})));
process.on('exit',()=>writeFileSync(${JSON.stringify(stats)},JSON.stringify({maxActive,aiCalls,maxAI,maxMetadata})));
globalThis.fetch=async(url,options)=>{const isAI=url.includes('/ai/run/');if(isAI){activeAI++;maxAI=Math.max(maxAI,activeAI);}else{activeMetadata++;maxMetadata=Math.max(maxMetadata,activeMetadata);}active++;maxActive=Math.max(maxActive,active);let result,delay=5;
if(url.endsWith('/deployments'))result={deployments:[{versions:[{version_id:'version',percentage:100}]}]};
else if(url.includes('/ai/run/')){const input=JSON.parse(options.body);aiCalls++;delay=aiCalls===1?3000:1000;result={answers:{category:{choice:'groceries',probabilities:Object.fromEntries(Object.keys(input.questions.category.criteria).map(key=>[key,key==='groceries'?.9:.01]))}}};}
else{const {sql,params}=JSON.parse(options.body);if(/INSERT|UPDATE|DELETE/.test(sql))throw Error('Readonly cohort attempted write');let rows=[];
if(sql.includes('d1_migrations'))rows=[{name:'0032_category_maintenance_paging.sql'}];
else if(sql.includes('FROM group_categories'))rows=[{id:'grocery',name:'Groceries',slug:'groceries',archivedAt:null}];
else if(sql.includes('SELECT id FROM group_budgets'))rows=[{id:'pot'}];
else if(sql.includes("SELECT 'budget' AS kind,budget_entry_id"))rows=candidates.filter(r=>r.kind==='budget'&&r.id>params[1]);
else if(sql.includes("SELECT 'expense' AS kind,transaction_id"))rows=candidates.filter(r=>r.kind==='expense'&&r.id>params[0]);
else if(sql.includes('l.description,r.category_id')){const suffix=params[1].slice(1);rows=['budget','expense'].map(kind=>({kind,id:(kind==='budget'?'b':'e')+suffix,description:'Milk and bread grocery purchase',categoryId:null,source:null,version:0}));}
result=[{success:true,results:rows,meta:{changes:0,rows_read:1}}];}
await new Promise(resolve=>setTimeout(resolve,delay));active--;if(isAI)activeAI--;else activeMetadata--;return {ok:true,json:async()=>({success:true,result})};};`);
 const run=(...options)=>spawnSync(process.execPath,['--import',preload,'scripts/backfill-household-categories.mjs',...options],{encoding:'utf8',env:{...process.env,CF_ACCOUNT_ID:'synthetic',CF_API_TOKEN:'synthetic'}});
 const common=['--group','household','--environment','prod','--deployment','version','--file',file];
 const first=run('preview',...common,'--batch','5');assert.equal(first.status,0,first.stderr);const checkpoint=JSON.parse(await readFile(file,'utf8'));assert.equal(checkpoint.plans.length,5);assert.deepEqual(checkpoint.cursor,{kind:'budget',id:'b04'});assert.equal(checkpoint.complete,false);const firstStats=JSON.parse(await readFile(stats));assert.equal(firstStats.aiCalls,5);assert.equal(firstStats.maxActive,4);assert.equal(firstStats.maxAI,4);assert.equal(firstStats.maxMetadata,4);
 const resumed=run('preview',...common,'--batch','20','--resume','true');assert.equal(resumed.status,0,resumed.stderr);const manifest=JSON.parse(await readFile(file,'utf8'));assert.equal(manifest.complete,true);assert.equal(manifest.plans.length,11);assert.deepEqual(manifest.plans.slice(0,5),checkpoint.plans);assert.deepEqual(manifest.plans.map(p=>p.id),Array.from({length:11},(_,i)=>'budget:b'+String(i).padStart(2,'0')));assert.equal(new Set(manifest.plans.flatMap(p=>p.records.map(r=>r.kind+':'+r.id))).size,22);assert.equal(manifest.plans[0].status,'abstained');const lastStats=JSON.parse(await readFile(stats));assert.equal(lastStats.aiCalls,6);assert.equal(lastStats.maxActive,4);assert.equal(lastStats.maxAI,4);assert.equal(lastStats.maxMetadata,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
