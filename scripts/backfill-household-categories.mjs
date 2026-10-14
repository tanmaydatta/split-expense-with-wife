// Household-only, category-only maintenance. Preview is read-only; apply requires its exact digest.
import {readFile,writeFile,mkdir,mkdtemp,symlink,rm,chmod,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const args=Object.fromEntries(process.argv.slice(3).reduce((pairs,value,index,all)=>index%2?pairs:[...pairs,[value,all[index+1]]],[]));
if(process.argv.slice(3).length%2||Object.keys(args).some(key=>!['--group','--environment','--deployment','--file','--resume','--approve-preview','--batch'].includes(key)))throw Error('Invalid option pairs');
const mode=process.argv[2],group=args['--group'],environment=args['--environment'],deployment=args['--deployment'],file=args['--file'];
if(!['preview','apply'].includes(mode)||!group||!['dev','prod'].includes(environment)||!deployment||!file)throw Error('Usage: preview|apply --group EXACT_ID --environment dev|prod --deployment WORKER_VERSION --file PRIVATE_JSON [--resume true] [--approve-preview SHA256]');
if(!/^[\w-]{1,128}$/.test(group)||! /^[\w-]{1,128}$/.test(deployment))throw Error('Invalid group or deployment identifier');
const batch=Number(args['--batch']??20);if(!Number.isInteger(batch)||batch<1||batch>100)throw Error('Batch must be1–100 components');
const account=process.env.CF_ACCOUNT_ID,token=process.env.CF_API_TOKEN;if(!account||!token)throw Error('Set CF_ACCOUNT_ID and CF_API_TOKEN; credentials are never printed');
const databases={dev:'a721ee7e-a5ee-452d-88d4-ebb97a1f0786',prod:'56f19864-f964-4c28-b176-001047d58e00'},database=databases[environment];
const root=new URL('../',import.meta.url),temporary=await mkdtemp(join(tmpdir(),'household-category-backfill-'));
const digest=value=>createHash('sha256').update(value).digest('hex');
async function api(route,body){const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${route}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw Error(`Cloudflare request failed HTTP${response.status}`);const result=await response.json();if(!result.success)throw Error('Cloudflare operation rejected');return result.result;}
async function query(sql,params=[]){const results=await api(`d1/database/${database}/query`,{sql,params});if(!results[0]?.success)throw Error('D1 query rejected');return results[0];}
// Preserve input order while bounding both snapshot and classification requests.
async function mapLimit(items,limit,task){
 const results=new Array(items.length);let next=0,failure;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(next<items.length&&!failure){const index=next++;try{results[index]=await task(items[index]);}catch(error){failure=error;}}
 }));if(failure)throw failure;return results;
}
const DB={prepare(sql){const statement=params=>({bind(...values){return statement(values)},async all(){return query(sql,params)},async first(column){const result=await query(sql,params);return column?result.results[0]?.[column]??null:result.results[0]??null},async run(){return query(sql,params)}});return statement([])}};
try{
 // Verify the exact active deployment and migrated schema before reading financial descriptions.
 const active=await api(`workers/scripts/${environment==='prod'?'splitexpense':'splitexpense-dev'}/deployments`);
 if(!active.deployments?.[0]?.versions?.some(v=>v.version_id===deployment&&v.percentage===100))throw Error('Requested Worker version is not the active deployment');
 if(!(await query("SELECT name FROM d1_migrations WHERE name='0031_record_categories.sql'")).results.length)throw Error('Category migration0031 is missing');
 await symlink(new URL('node_modules',root).pathname,join(temporary,'node_modules'));
 for(const name of ['category-ai','categories','category-backfill']){const source=await readFile(new URL(`cf-worker/src/utils/${name}.ts`,root),'utf8');const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/(category-ai|categories)"/g,'from "./$1.mjs"');await writeFile(join(temporary,`${name}.mjs`),output);}
 const utility=await import(pathToFileURL(join(temporary,'category-backfill.mjs')));
 const policyHash=digest((await Promise.all(['category-ai','categories','category-backfill'].map(name=>readFile(new URL(`cf-worker/src/utils/${name}.ts`,root),'utf8')))).join('\n')); 
 const env={DB,CATEGORIES_ENABLED:'true',CATEGORY_AI_ENABLED:'true',CATEGORY_AI:{async run(model,input){return api(`ai/run/${model}`,input)}}};
 let manifest={format:1,schema:'0031',group,environment,database,deployment,policyHash,cursor:null,complete:false,plans:[],recordsWithoutRecurringHistory:0};
 if(mode==='apply'||args['--resume']==='true'){const bytes=await readFile(file,'utf8');if(mode==='apply'&&digest(bytes)!==args['--approve-preview'])throw Error('Exact reviewed preview digest required');manifest=JSON.parse(bytes);for(const key of ['format','schema','group','environment','database','deployment','policyHash'])if(manifest[key]!==({format:1,schema:'0031',group,environment,database,deployment,policyHash})[key])throw Error(`Preview ${key} does not match invocation`);}
 if(mode==='apply'){const counts={applied:0,'already-applied':0,stale:0,skipped:0};for(const plan of manifest.plans){counts[await utility.applyBackfillComponent(env,group,plan)]++;}console.log(JSON.stringify({group,environment,counts}));}
 else{
 const categories=(await query('SELECT id,group_id AS groupId,name,slug,archived_at AS archivedAt FROM group_categories WHERE group_id=?',[group])).results;if(!categories.length)throw Error('Household taxonomy is not initialized; open Categories settings before preview');
 const rules=(await query('SELECT match_kind AS kind,pattern,category_id AS categoryId FROM category_rules WHERE group_id=?',[group])).results;
 const seen=new Set(manifest.plans.flatMap(p=>p.records.map(r=>`${r.kind}:${r.id}`)));let processed=0,pages=0;
 while(!manifest.complete&&processed<batch&&pages++<10){const candidates=await utility.readBackfillCandidates(env,group,manifest.cursor);
 if(!candidates.length){manifest.complete=true;break;}

 // Select a bounded candidate window. Its cursor is published only after every
 // unique component in that window has a completed plan.
 const window=[];let windowEnd=-1;
 for(let index=0;index<candidates.length;index++){
  windowEnd=index;
  const candidate=candidates[index];
  if(!seen.has(`${candidate.kind}:${candidate.id}`))window.push(candidate);
  if(window.length>=Math.min(20,batch-processed))break;
 }
 const loaded=await mapLimit(window,4,async candidate=>utility.readBackfillComponent(env,group,candidate));
 const cohort=[];
 for(const records of loaded){
  if(!records.length)continue;
  const members=records.map(record=>`${record.kind}:${record.id}`);
  if(members.every(member=>seen.has(member)))continue;
  if(members.some(member=>seen.has(member)))throw Error('Linked membership changed during preview; start a fresh preview');
  for(const member of members)seen.add(member);
  cohort.push(records);
 }
 const results=await mapLimit(cohort,4,async records=>{
  const recurring=await utility.recurringBackfillChoices(env,group,records);
  const unmapped=records.filter(record=>!recurring.mapped.has(`${record.kind}:${record.id}`)).length;
  for(const record of records)record.scheduledChoices=recurring.choices.get(`${record.kind}:${record.id}`)?.filter(id=>id===null||categories.some(category=>category.id===id));
  // Promise.race does not cancel AI: retain this pool slot until its one remote
  // request settles, while preserving the classifier's 2.5-second decision.
  let inference;
  const componentEnv={...env,CATEGORY_AI:{run(model,input){inference=api(`ai/run/${model}`,input);return inference;}}};
  try{return {plan:await utility.planBackfillComponent(componentEnv,categories,rules,records),unmapped};}
  finally{if(inference)await inference.catch(()=>{});}
 });
 for(const result of results){manifest.plans.push(result.plan);manifest.recordsWithoutRecurringHistory+=result.unmapped;}
 processed+=results.length;
 manifest.cursor=candidates[windowEnd];

 }
 const output=JSON.stringify(manifest,null,2)+'\n';await mkdir(resolve(file,'..'),{recursive:true});try{if((await lstat(file)).isSymbolicLink())throw Error('Preview path must not be a symlink');}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(file,output,{mode:0o600});await chmod(file,0o600);const counts={};for(const plan of manifest.plans)counts[plan.status]=(counts[plan.status]??0)+1;console.log(JSON.stringify({group,environment,complete:manifest.complete,components:manifest.plans.length,counts,previewDigest:digest(output),file}));
 }
}finally{await rm(temporary,{recursive:true,force:true});}
