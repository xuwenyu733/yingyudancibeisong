import test from 'node:test';import assert from 'node:assert/strict';
import {createDecorationSession} from '../decoration-session.mjs';
function fixture(){let value=1,saved=0,fail=false;return {manager:{snapshot:()=>({value}),restore:s=>value=s.value,validate:()=>({valid:true}),persist:()=>{if(fail)return false;saved++;return true;}},get value(){return value;},set value(v){value=v;},get saved(){return saved;},set fail(v){fail=v;}};}
test('headless editing can cancel a pending transition without entering later',async()=>{
  const f=fixture();let resume;const session=createDecorationSession({manager:f.manager,prepare:()=>new Promise(resolve=>resume=resolve)});
  const pending=session.enter();assert.equal(session.pending,true);assert.equal(session.exit(false),true);
  resume(true);assert.equal(await pending,false);assert.equal(session.active,false);
});
test('headless cancellation restores the whole entry snapshot',async()=>{
  const f=fixture(),session=createDecorationSession({manager:f.manager,prepare:()=>true});
  await session.enter();f.value=8;assert.equal(session.exit(false),true);assert.equal(f.value,1);assert.equal(f.saved,0);
});
test('failed persistence preserves the open session and changes, while host-managed mode needs no localStorage',async()=>{
  const f=fixture(),session=createDecorationSession({manager:f.manager,prepare:()=>true});
  await session.enter();f.value=5;f.fail=true;assert.equal(session.exit(),false);assert.equal(session.active,true);assert.equal(f.value,5);
  session.dispose();const host=createDecorationSession({manager:f.manager,prepare:()=>true,persistLayout:false});await host.enter();assert.equal(host.exit(),true);
});
test('disposing an asynchronous session never emits an active event afterwards',async()=>{
  const f=fixture();let resume;const events=[];
  const session=createDecorationSession({manager:f.manager,prepare:()=>new Promise(resolve=>resume=resolve),onEvent:(...args)=>events.push(args)});
  const pending=session.enter();session.dispose();resume(true);assert.equal(await pending,false);assert.ok(!events.some(([type])=>type==='decoration-mode'));
});
test('cancel then reenter settles the first host request before the second prepare resolves',async()=>{
  const f=fixture();let resume;const session=createDecorationSession({manager:f.manager,prepare:()=>new Promise(resolve=>resume=resolve)});
  const first=session.enter();session.exit(false);const second=session.enter();
  assert.equal(await first,false);resume(true);assert.equal(await second,true);session.dispose();
});
