import test from 'node:test';
import assert from 'node:assert/strict';
import {entryTransaction} from './entry-transaction.mjs';
const deadlock=()=>Object.assign(Error('fixture deadlock'),{code:'ER_LOCK_DEADLOCK',errno:1213});
function fixture({rollbackFails=false,commitError}={}){const trace=[];let connections=0;return {trace,pool:{async getConnection(){const id=++connections;trace.push('get'+id);return {id,async beginTransaction(){trace.push('begin'+id);},async commit(){trace.push('commit'+id);if(commitError)throw commitError;},async rollback(){trace.push('rollback'+id);if(rollbackFails)throw Error('rollback unavailable');},release(){trace.push('release'+id);}};}},pause:async()=>trace.push('pause')};}
test('deadlock retries only after rollback and releasing connection; commits exactly one result',async()=>{
 const f=fixture();let calls=0;const result=await entryTransaction(f.pool,async c=>{f.trace.push('operation'+c.id);if(++calls===1)throw deadlock();return 'committed';},{pause:f.pause});assert.equal(result,'committed');
 assert.deepEqual(f.trace,['get1','begin1','operation1','rollback1','release1','pause','get2','begin2','operation2','commit2','release2']);
});
test('deadlock retry count is bounded and final failure is surfaced',async()=>{
 const f=fixture();let calls=0;await assert.rejects(entryTransaction(f.pool,async()=>{calls++;throw deadlock();},{pause:f.pause}),e=>e.code==='ER_LOCK_DEADLOCK');assert.equal(calls,4);assert.equal(f.trace.filter(x=>x==='pause').length,3);assert.equal(f.trace.filter(x=>x.startsWith('rollback')).length,4);assert.equal(f.trace.filter(x=>x.startsWith('release')).length,4);
});
for(const code of ['ER_DUP_ENTRY','PROTOCOL_CONNECTION_LOST','ER_LOCK_WAIT_TIMEOUT','IDENTITY_REQUIRED'])test('does not retry unclassified or potentially uncertain failure '+code,async()=>{
 const f=fixture(),error=Object.assign(Error('fixture error'),{code});let calls=0;await assert.rejects(entryTransaction(f.pool,async()=>{calls++;throw error;},{pause:f.pause}),e=>e===error);assert.equal(calls,1);assert(!f.trace.includes('pause'));
});
test('rollback failure and uncertain commit are never replayed',async()=>{
 const f=fixture({rollbackFails:true});let calls=0;await assert.rejects(entryTransaction(f.pool,async()=>{calls++;throw deadlock();},{pause:f.pause}));assert.equal(calls,1);
 const commitError=Object.assign(Error('connection lost during commit'),{code:'PROTOCOL_CONNECTION_LOST'}),g=fixture({commitError});let operations=0;await assert.rejects(entryTransaction(g.pool,async()=>++operations,{pause:g.pause}),e=>e===commitError);assert.equal(operations,1);
});
