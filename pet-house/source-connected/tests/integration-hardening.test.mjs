import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {createRoomBridge} from '../integration.mjs';
import {createEconomy} from '../economy.mjs';
const flush=()=>setImmediate();
const command=(id,name,params={})=>({protocolVersion:1,roomId:'hardening-room',requestId:id,type:'command',command:name,params});
function fixture(api={},options={}){
  const target=new EventTarget(),events=[];target.addEventListener('room-event',event=>events.push(event.detail));
  const bridge=createRoomBridge({api,eventTarget:target,roomId:'hardening-room',getState:()=>({ready:true}),...options});
  return {bridge,target,events,send:data=>target.dispatchEvent(new CustomEvent('room-command',{detail:data})),result:id=>events.filter(event=>event.requestId===id).at(-1)};
}

test('live DOM objects cannot invoke parameter or envelope accessors',async()=>{
  let getterCalls=0,apiCalls=0;const f=fixture({setLamp:()=>{apiCalls++;}});await f.bridge.ready();
  const params={};Object.defineProperty(params,'on',{enumerable:true,get(){getterCalls++;return true;}});
  f.send(command('param-getter','setLamp',params));
  const top=command('top-getter','setLamp',{on:true});Object.defineProperty(top,'requestId',{enumerable:true,get(){getterCalls++;return 'side-effect';}});f.send(top);
  const route=command('route-getter','setLamp',{on:true});Object.defineProperty(route,'roomId',{enumerable:true,get(){getterCalls++;return 'hardening-room';}});f.send(route);
  await flush();assert.equal(getterCalls,0);assert.equal(apiCalls,0);assert.equal(f.result('param-getter').error.code,'INVALID_PARAMS');
  assert.equal(f.events.some(event=>event.requestId==='side-effect'),false);f.bridge.dispose();
});

test('inherited and accessor API methods are not callable through the bridge',async()=>{
  let calls=0;const api=Object.create({setLamp(){calls++;}});
  Object.defineProperty(api,'toggleSofa',{get(){calls++;return ()=>true;}});
  const f=fixture(api);await f.bridge.ready();f.send(command('inherited','setLamp',{on:true}));f.send(command('api-getter','toggleSofa'));await flush();
  assert.equal(calls,0);assert.equal(f.result('inherited').error.code,'UNSUPPORTED_COMMAND');assert.equal(f.result('api-getter').error.code,'UNSUPPORTED_COMMAND');f.bridge.dispose();
});

test('missing required parameters cannot be supplied through Object.prototype',async()=>{
  let calls=0;const f=fixture({setLamp:()=>{calls++;}});await f.bridge.ready();
  const previous=Object.getOwnPropertyDescriptor(Object.prototype,'on');
  try{Object.defineProperty(Object.prototype,'on',{configurable:true,value:true});f.send(command('polluted','setLamp',{}));await flush();}
  finally{if(previous)Object.defineProperty(Object.prototype,'on',previous);else delete Object.prototype.on;}
  assert.equal(calls,0);assert.equal(f.result('polluted').error.code,'INVALID_PARAMS');f.bridge.dispose();
});

test('routing does not accept a prototype envelope and null is not an empty parameter object',async()=>{
  const f=fixture();await f.bridge.ready();f.send(Object.create(command('prototype','getState')));f.send(command('null','getState',null));await flush();
  assert.equal(f.result('prototype'),undefined);assert.equal(f.result('null').error.code,'INVALID_PARAMS');f.bridge.dispose();
});

test('canonical retries accept reordered nested JSON but reject changed arguments',async()=>{
  let calls=0;const f=fixture({importLayout:()=>++calls});await f.bridge.ready();
  f.send(command('order','importLayout',{layout:{version:3,furniture:{table:{x:1,z:2}}}}));
  f.send(command('order','importLayout',{layout:{furniture:{table:{z:2,x:1}},version:3}}));await flush();
  assert.equal(calls,1);assert.equal(f.events.filter(event=>event.requestId==='order'&&event.ok).length,2);
  f.send(command('order','importLayout',{layout:{version:3,furniture:{table:{x:2,z:2}}}}));await flush();
  assert.equal(f.result('order').error.code,'REQUEST_ID_REUSED');f.bridge.dispose();
});

test('archive transport supports the documented size above 262 KB',async()=>{
  let received='';const f=fixture({importArchive:value=>{received=value;return {ok:true};}});await f.bridge.ready();
  const archive=JSON.stringify({padding:'x'.repeat(1100000)});f.send(command('large','importArchive',{archive}));await flush();
  assert.equal(received,archive);assert.equal(f.result('large').result.ok,true);
  f.send(command('utf8-large','importArchive',{archive:'汉'.repeat(530000)}));await flush();assert.equal(f.result('utf8-large').error.code,'INVALID_PARAMS');
  assert.equal(f.bridge.emit('oversized',{a:'x'.repeat(1048576),b:'x'.repeat(1048576),c:'x'}),false);f.bridge.dispose();
});

test('avatar bridge validation matches the profile raster/base64 contract',async()=>{
  let calls=0;const f=fixture({setProfileAvatar:value=>{calls++;return {ok:true,value};}});await f.bridge.ready();
  const png='data:image/png;base64,iVBORw0KGgoAAAAA';
  f.send(command('valid','setProfileAvatar',{avatar:png}));f.send(command('invalid','setProfileAvatar',{avatar:'data:image/png;base64,not-image'}));
  f.send(command('clear','setProfileAvatar',{avatar:null}));await flush();assert.equal(calls,2);assert.equal(f.result('invalid').error.code,'INVALID_PARAMS');f.bridge.dispose();
});

test('ready does not emit until the snapshot confirms readiness and remains retryable',async()=>{
  let ready=false;const f=fixture({}, {getState:()=>({ready,lifecycle:ready?'ready':'loading'})});
  assert.equal(await f.bridge.ready(),false);assert.equal(f.events.length,0);
  ready=true;assert.equal(await f.bridge.ready(),true);assert.equal(f.events.length,1);assert.equal(f.events[0].event,'ready');f.bridge.dispose();
});

test('outgoing JSON accessors are rejected without executing them',async()=>{
  let calls=0;const response={};Object.defineProperty(response,'value',{enumerable:true,get(){calls++;return 1;}});
  const f=fixture({getLayout:()=>response});await f.bridge.ready();f.send(command('output','getLayout'));await flush();
  assert.equal(calls,0);assert.equal(f.result('output').error.code,'SERIALIZATION_ERROR');assert.equal(f.bridge.emit('bad',response),false);f.bridge.dispose();
});

test('learning ledger deduplication survives a bridge remount and stays scoped to account keys',async()=>{
  const records=new Map(),storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
  const make=key=>createEconomy({storageAdapter:storage,storageKey:key,initialBalance:100});
  let account=make('user-a'),f=fixture({creditLearning:input=>account.creditLearning(input)});await f.bridge.ready();
  f.send(command('first','creditLearning',{eventId:'lesson-123',learned:10}));await flush();assert.equal(account.getState().balance,200);f.bridge.dispose();
  account=make('user-a');f=fixture({creditLearning:input=>account.creditLearning(input)});await f.bridge.ready();
  f.send(command('retry','creditLearning',{eventId:'lesson-123',learned:10}));await flush();assert.equal(account.getState().balance,200);f.bridge.dispose();
  account=make('user-b');f=fixture({creditLearning:input=>account.creditLearning(input)});await f.bridge.ready();
  f.send(command('other-user','creditLearning',{eventId:'lesson-123',learned:10}));await flush();assert.equal(account.getState().balance,200);f.bridge.dispose();
});

test('an API exception with a throwing message getter still produces a bounded result',async()=>{
  let getters=0;const error={};Object.defineProperty(error,'message',{get(){getters++;throw error;}});
  const f=fixture({toggleSofa:()=>{throw error;}});await f.bridge.ready();f.send(command('hostile-error','toggleSofa'));await flush();
  assert.equal(getters,0);assert.deepEqual(f.result('hostile-error').error,{code:'COMMAND_FAILED',message:'宿主指令执行失败'});f.bridge.dispose();
});

