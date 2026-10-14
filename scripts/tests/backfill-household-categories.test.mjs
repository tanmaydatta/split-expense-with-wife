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
 await writeFile(preload,`globalThis.fetch=async(url,options)=>{let result;if(url.endsWith('/deployments'))result={deployments:[{versions:[{version_id:'version',percentage:100}]}]};else{const {sql,params}=JSON.parse(options.body);if(/INSERT|UPDATE|DELETE/.test(sql))throw Error('Preview attempted write');let rows=[];if(sql.includes('d1_migrations'))rows=[{name:'0031_record_categories.sql'}];else if(sql.includes('FROM group_categories'))rows=[{id:'grocery',name:'Groceries',slug:'groceries',archivedAt:null}];else if(sql.includes('SELECT kind,id FROM live')&&!params[2])rows=[{kind:'expense',id:'record'}];else if(sql.includes('l.description,r.category_id'))rows=[{kind:'expense',id:'record',description:'payment',categoryId:null,source:null,version:0}];result=[{success:true,results:rows,meta:{changes:0}}];}return {ok:true,json:async()=>({success:true,result})};};`);
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
