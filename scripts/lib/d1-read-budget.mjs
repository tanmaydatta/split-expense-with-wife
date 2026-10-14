import {readFile,writeFile,rename,lstat,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Hard limits apply across process restarts, not just a single cohort. A response
// can exceed its limit once; persist the stop before any subsequent request.
export async function createD1ReadBudget(file,scope,{queryLimit=10000,jobLimit=250000}={}){
 let state={format:1,scope,rowsRead:0,queries:0,blocked:false,inFlight:0,queryLimit,jobLimit,shapes:{}},pending=0,writing=Promise.resolve();
 try{if((await lstat(file)).isSymbolicLink())throw Error('Read budget must not be a symlink');const saved=JSON.parse(await readFile(file,'utf8'));if(JSON.stringify(saved.scope)!==JSON.stringify(scope)||saved.format!==1||!Number.isSafeInteger(saved.rowsRead)||saved.rowsRead<0||saved.queryLimit!==queryLimit||saved.jobLimit!==jobLimit||!Number.isSafeInteger(saved.inFlight)||saved.inFlight<0)throw Error('Read budget scope/state mismatch');state=saved;if(state.inFlight)state.blocked=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 async function persist(){writing=writing.then(async()=>{const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'w'});await chmod(temporary,0o600);await rename(temporary,file);});return writing;}
 return {async run(sql,request){
  if(state.blocked||state.rowsRead+pending+queryLimit>jobLimit)throw Error('D1 read budget exhausted; maintenance stopped');
  pending+=queryLimit;state.inFlight++;
  try{await persist();const result=await request();const rows=result?.meta?.rows_read;
   if(!Number.isSafeInteger(rows)||rows<0){state.blocked=true;await persist();throw Error('D1 rows_read metadata missing; maintenance stopped');}
   state.rowsRead+=rows;state.queries++;const key=createHash('sha256').update(sql).digest('hex');const shape=state.shapes[key]??={queries:0,rowsRead:0,maxRowsRead:0};shape.queries++;shape.rowsRead+=rows;shape.maxRowsRead=Math.max(shape.maxRowsRead,rows);
   if(rows>queryLimit||state.rowsRead>jobLimit)state.blocked=true;
   await persist();if(state.blocked)throw Error('D1 query read limit exceeded; maintenance stopped');return result;
  }catch(error){state.blocked=true;await persist();throw error;}finally{pending-=queryLimit;state.inFlight--;await persist();}
 },summary(){return {rowsRead:state.rowsRead,queries:state.queries,blocked:state.blocked}}};
}
