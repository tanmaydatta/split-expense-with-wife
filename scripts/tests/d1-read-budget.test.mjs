import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createD1ReadBudget} from '../lib/d1-read-budget.mjs';
const scope={group:'synthetic',environment:'prod',database:'synthetic',deployment:'version'};
async function fixture(run){const dir=await mkdtemp(join(tmpdir(),'d1-meter-'));try{await run(join(dir,'reads.json'));}finally{await rm(dir,{recursive:true,force:true})}}
test('persists aggregate query reads and stops on per-query limit across restart',()=>fixture(async file=>{
 const meter=await createD1ReadBudget(file,scope,{queryLimit:100,jobLimit:500});await meter.run('synthetic sql',async()=>({meta:{rows_read:50}}));assert.equal((await stat(file)).mode&0o777,0o600);
 await assert.rejects(meter.run('costly',async()=>({meta:{rows_read:101}})),/limit exceeded/);const saved=JSON.parse(await readFile(file));assert.equal(saved.rowsRead,151);assert.equal(saved.inFlight,0);assert.equal(saved.blocked,true);assert(!JSON.stringify(saved).includes('synthetic sql'));
 const resumed=await createD1ReadBudget(file,scope,{queryLimit:100,jobLimit:500});let called=false;await assert.rejects(resumed.run('blocked',async()=>{called=true}),/budget exhausted/);assert.equal(called,false);
}));
test('reserves concurrent requests before dispatch and persists crash/unknown-response stops',()=>fixture(async file=>{
 const meter=await createD1ReadBudget(file,scope,{queryLimit:100,jobLimit:200});let release;const waiting=new Promise(resolve=>release=resolve);let started;const entered=new Promise(resolve=>started=resolve);
 const first=meter.run('first',async()=>{started();await waiting;return {meta:{rows_read:1}}});await entered;
 const saved=JSON.parse(await readFile(file));assert.equal(saved.inFlight,1);
 const crashed=await createD1ReadBudget(file,scope,{queryLimit:100,jobLimit:200});await assert.rejects(crashed.run('unsafe retry',async()=>({meta:{rows_read:1}})),/budget exhausted/);
 const second=meter.run('second',async()=>{await waiting;return {meta:{rows_read:1}}});await assert.rejects(meter.run('third',async()=>({meta:{rows_read:1}})),/budget exhausted/);release();await Promise.all([first,second]);assert.equal(meter.summary().rowsRead,2);
 await assert.rejects(meter.run('unknown',async()=>{throw Error('transport failure')}),/transport failure/);assert.equal(JSON.parse(await readFile(file)).blocked,true);
}));
test('rejects missing read metadata, scope changes and overspent durable jobs',()=>fixture(async file=>{
 const meter=await createD1ReadBudget(file,scope,{queryLimit:10,jobLimit:20});await assert.rejects(meter.run('missing',async()=>({meta:{}})),/metadata missing/);
 await assert.rejects(createD1ReadBudget(file,{...scope,group:'other'},{queryLimit:10,jobLimit:20}),/mismatch/);
 const saved=JSON.parse(await readFile(file));saved.blocked=false;saved.rowsRead=15;await writeFile(file,JSON.stringify(saved));const resumed=await createD1ReadBudget(file,scope,{queryLimit:10,jobLimit:20});await assert.rejects(resumed.run('no reserve',async()=>({meta:{rows_read:1}})),/budget exhausted/);
}));
