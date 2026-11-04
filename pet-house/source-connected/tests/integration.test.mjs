import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createRoomBridge } from '../integration.mjs';

const flush=()=>setImmediate();
const command=(roomId,requestId,name,params={})=>({protocolVersion:1,roomId,requestId,type:'command',command:name,params});
function fixture(options={}) {
  const eventTarget=options.eventTarget??new EventTarget(),events=[],callbacks=[];
  eventTarget.addEventListener('room-event',event=>events.push(structuredClone(event.detail)));
  const api=options.api??{},roomId=options.roomId??'test-room';
  const bridge=createRoomBridge({api,getState:()=>({ready:true,position:{x:1,z:2}}),eventTarget,roomId,onEvent:envelope=>callbacks.push(envelope),...options});
  const send=(name,params={},requestId=`request-${events.length}`)=>eventTarget.dispatchEvent(new CustomEvent('room-command',{detail:command(roomId,requestId,name,params)}));
  const result=id=>events.filter(event=>event.type==='result'&&event.requestId===id).at(-1);
  return {bridge,eventTarget,events,callbacks,api,roomId,send,result};
}
function post(target,data,origin,source) {
  const event=new Event('message');Object.defineProperties(event,{data:{value:data},origin:{value:origin},source:{value:source}});target.dispatchEvent(event);
}
test('shop bridge uses envelope request IDs for ledger retries and forwards validated creditLearning',async()=>{
  const calls=[],f=fixture({api:{getShop:()=>({balance:100}),purchaseFurniture:(...args)=>{calls.push(['buy',...args]);return {ok:true};},expandRoom:(...args)=>{calls.push(['expand',...args]);return {ok:true};},creditLearning:(...args)=>{calls.push(['credit',...args]);return {ok:true};}}});
  await f.bridge.ready();f.send('purchaseFurniture',{sku:'clover-planter'},'buy-001');f.send('expandRoom',{},'expand-001');f.send('purchaseFurniture',{sku:'clover-planter',price:1},'bad-price');f.send('creditLearning',{eventId:'lesson-1',learned:100},'credit-001');await flush();
  assert.deepEqual(calls,[['buy','clover-planter','buy-001'],['expand','expand-001'],['credit',{eventId:'lesson-1',learned:100,reviewed:0,checkIn:false}]]);
  assert.equal(f.result('bad-price').error.code,'INVALID_PARAMS');assert.equal(f.result('credit-001').ok,true);f.bridge.dispose();
});

test('ready is idempotent and emits protocol-versioned JSON state once',async()=>{
  const f=fixture(),first=f.bridge.ready();assert.equal(f.bridge.ready(),first);assert.equal(await first,true);
  assert.deepEqual(f.events,[{protocolVersion:1,roomId:'test-room',requestId:null,type:'event',event:'ready',detail:{state:{ready:true,position:{x:1,z:2}}}}]);
  assert.deepEqual(f.callbacks,f.events);assert.equal(f.bridge.dispose(),true);assert.equal(f.bridge.dispose(),false);assert.equal(await f.bridge.ready(),false);
});

test('before readiness getState works while mutating commands return NOT_READY',async()=>{
  let calls=0;const f=fixture({api:{setLamp(){calls++;}}});
  f.send('getState',{},'state');f.send('setLamp',{on:true},'lamp');await flush();
  assert.equal(f.result('state').ok,true);assert.equal(f.result('lamp').error.code,'NOT_READY');assert.equal(calls,0);
});

test('typed commands route only JSON parameters to the original API signatures',async()=>{
  const calls=[],api={};
  for(const method of ['setLamp','toggleSofa','walkTo','setDecorationMode','setFurnitureTransform','setFurnitureCollider','getLayout','importLayout'])api[method]=function(...args){assert.equal(this,api);calls.push([method,...args]);return true;};
  const f=fixture({api});await f.bridge.ready();
  f.send('setLamp',{on:false},'a');f.send('toggleSofa',{},'b');f.send('walkTo',{x:1,z:-2},'c');
  f.send('setDecorationMode',{enabled:true},'d');f.send('setFurnitureTransform',{id:'table',position:[1,0,2],scale:1.2},'e');
  f.send('setFurnitureCollider',{id:'table',center:[0,.2,0],size:[1,.4,1],blocksNavigation:false,boxIndex:1},'f');
  f.send('getLayout',{},'g');f.send('importLayout',{layout:{version:3}},'h');await flush();
  assert.deepEqual(calls,[['setLamp',false],['toggleSofa'],['walkTo',1,-2],['setDecorationMode',true],['setFurnitureTransform','table',{position:[1,0,2],scale:1.2}],['setFurnitureCollider','table',{center:[0,.2,0],size:[1,.4,1],blocksNavigation:false},1],['getLayout'],['importLayout',{version:3}]]);
  for(const id of ['a','b','c','d','e','f','g','h'])assert.equal(f.result(id).ok,true);
});

test('malformed boolean, finite coordinates, arrays and unknown fields never reach API',async()=>{
  let calls=0;const api=new Proxy({},{get:()=>()=>{calls++;}}),f=fixture({api});await f.bridge.ready();
  const cases=[['setLamp',{on:'yes'}],['walkTo',{x:NaN,z:1}],['setDecorationMode',{enabled:1}],['toggleSofa',{extra:true}],
    ['setFurnitureTransform',{id:'table',position:[1,2]}],['setFurnitureTransform',{id:'table',position:new Array(3)}],
    ['setFurnitureTransform',{id:'table',rotation:[1,0,0]}],['setFurnitureCollider',{id:'table',size:[1,0,1]}],
    ['setFurnitureCollider',{id:'table',center:[0,0,0],boxIndex:-1}],['importLayout',{layout:null}],
    ['creditLearning',{}],['creditLearning',{eventId:5}],['creditLearning',{eventId:'lesson-1',learned:-1}],
    ['creditLearning',{eventId:'lesson-1',checkIn:'yes'}],['creditLearning',{eventId:'lesson-1',extra:true}],
    ['setProfileGender',{gender:'x'}],['setProfileName',{name:42}],['setProfileName',{name:'a'.repeat(41)}],
    ['addStudyTime',{seconds:-1}],['addStudyTime',{seconds:86400*90+1}],['addStudyTime',{seconds:1.5}],
    ['checkIn',{extra:1}],['getProfile',{x:1}]];
  cases.forEach(([name,params],index)=>f.send(name,params,`bad-${index}`));await flush();
  cases.forEach((_,index)=>assert.equal(f.result(`bad-${index}`).error.code,'INVALID_PARAMS'));
  assert.equal(calls,0);
});

test('unknown commands and optional unsupported methods return structured errors',async()=>{
  let debugCalls=0;const f=fixture({api:{getFurniture(){debugCalls++;}}});await f.bridge.ready();
  f.send('getFurniture',{id:'sofa'},'unknown');f.send('importLayout',{layout:{version:3}},'unsupported');
  f.eventTarget.dispatchEvent(new CustomEvent('room-command',{detail:{...command(f.roomId,'version','getState'),protocolVersion:99}}));await flush();
  assert.equal(f.result('unknown').error.code,'UNKNOWN_COMMAND');assert.equal(f.result('unsupported').error.code,'UNSUPPORTED_COMMAND');
  assert.equal(f.result('version').error.code,'UNSUPPORTED_PROTOCOL');assert.equal(debugCalls,0);assert.equal(typeof f.api.getFurniture,'function');
});

test('profile commands route parsed arguments to the original API signatures',async()=>{
  const calls=[],f=fixture({api:{getProfile(){calls.push(['getProfile']);return {ok:true,profile:{level:1}};},checkIn(){calls.push(['checkIn']);return {ok:true,streak:1};},setProfileGender:g=>calls.push(['gender',g]),setProfileName:n=>calls.push(['name',n]),addStudyTime:s=>calls.push(['time',s])}});
  await f.bridge.ready();
  f.send('getProfile',{},'a');f.send('checkIn',{},'b');f.send('setProfileGender',{gender:'female'},'c');f.send('setProfileName',{name:'小狐狸'},'d');f.send('addStudyTime',{seconds:1200},'e');await flush();
  assert.deepEqual(calls,[['getProfile'],['checkIn'],['gender','female'],['name','小狐狸'],['time',1200]]);
  for(const id of ['a','b','c','d','e'])assert.equal(f.result(id).ok,true);
});

test('async results and failures are correlated and class instances never enter JSON transport',async()=>{
  class Object3D {isObject3D=true;}
  const f=fixture({api:{async walkTo(){return {arrived:true};},async toggleSofa(){throw new Error('seat unavailable');},getLayout(){return new Object3D();}}});
  await f.bridge.ready();f.send('walkTo',{x:0,z:1},'async');f.send('toggleSofa',{},'error');f.send('getLayout',{},'object');await flush();
  assert.deepEqual(f.result('async').result,{arrived:true});assert.deepEqual(f.result('error').error,{code:'COMMAND_FAILED',message:'seat unavailable'});
  assert.equal(f.result('object').error.code,'SERIALIZATION_ERROR');assert.equal(f.bridge.emit('invalid',{callback(){}}),false);
  assert.equal(f.bridge.emit('invalid',{node:new Object3D()}),false);
  assert.ok(f.events.every(event=>!JSON.stringify(event).includes('isObject3D')));
});

test('same request retries execute once and changed commands cannot reuse the ID',async()=>{
  let calls=0;const f=fixture({api:{toggleSofa(){return ++calls;}}});await f.bridge.ready();
  f.send('toggleSofa',{},'same');f.send('toggleSofa',{},'same');await flush();assert.equal(calls,1);
  assert.equal(f.events.filter(event=>event.requestId==='same').length,2);
  f.send('getState',{},'same');await flush();assert.equal(f.result('same').error.code,'REQUEST_ID_REUSED');
});

test('events are independently cloned for DOM and callback observers',()=>{
  const target=new EventTarget();target.addEventListener('room-event',event=>{event.detail.detail.nested.value=99;});
  const callbacks=[],source={nested:{value:1}},bridge=createRoomBridge({api:{},getState:()=>({}),roomId:'clone-room',eventTarget:target,onEvent:event=>callbacks.push(event)});
  assert.equal(bridge.emit('change',source),true);assert.equal(callbacks[0].detail.nested.value,1);assert.equal(source.nested.value,1);bridge.dispose();
});

test('multiple instances share an event target without cross-executing commands',async()=>{
  const target=new EventTarget(),calls=[];
  const a=fixture({eventTarget:target,roomId:'room-a',api:{setLamp:on=>calls.push(['a',on])}});
  const b=fixture({eventTarget:target,roomId:'room-b',api:{setLamp:on=>calls.push(['b',on])}});
  await Promise.all([a.bridge.ready(),b.bridge.ready()]);a.send('setLamp',{on:true},'isolated');await flush();
  assert.deepEqual(calls,[['a',true]]);a.bridge.dispose();b.send('setLamp',{on:false},'still-active');await flush();assert.deepEqual(calls,[['a',true],['b',false]]);b.bridge.dispose();
});

test('legacy global names are opt-in, never overwritten and only their owner deletes them',()=>{
  const host={},apiA={},apiB={};
  const a=createRoomBridge({api:apiA,getState:()=>({}),globalObject:host});assert.equal(host.HamsterRoom,apiA);
  const b=createRoomBridge({api:apiB,getState:()=>({}),globalObject:host});assert.equal(host.HamsterRoom,apiA);b.dispose();assert.equal(host.HamsterRoom,apiA);
  host.HamsterRoom=apiB;a.dispose();assert.equal(host.HamsterRoom,apiB);
  const c=createRoomBridge({api:apiA,getState:()=>({}),globalObject:host,legacyName:'OtherRoom'});assert.equal(host.OtherRoom,apiA);c.dispose();assert.ok(!own(host,'OtherRoom'));
});
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

test('cross-document messaging is disabled by default and requires both origin and source',async()=>{
  const messageTarget=new EventTarget(),responses=[],source={postMessage:(data,origin)=>responses.push({data,origin})},stranger={postMessage(){throw new Error('must not reply');}};
  let calls=0;const disabled=fixture({messageTarget,api:{setLamp(){calls++;}}});await disabled.bridge.ready();
  post(messageTarget,command(disabled.roomId,'disabled','setLamp',{on:true}),'https://host.example',source);await flush();assert.equal(calls,0);disabled.bridge.dispose();
  const enabled=fixture({messageTarget,allowedOrigins:['https://host.example'],allowedSources:[source],api:{setLamp(){return ++calls;}}});await enabled.bridge.ready();
  post(messageTarget,command(enabled.roomId,'evil-origin','setLamp',{on:true}),'https://evil.example',source);
  post(messageTarget,command(enabled.roomId,'evil-source','setLamp',{on:true}),'https://host.example',stranger);
  post(messageTarget,command(enabled.roomId,'null-source','setLamp',{on:true}),'https://host.example',null);
  post(messageTarget,command(enabled.roomId,'trusted','setLamp',{on:true}),'https://host.example',source);await flush();
  assert.equal(calls,1);assert.equal(responses.length,1);assert.equal(responses[0].origin,'https://host.example');assert.equal(responses[0].data.requestId,'trusted');
  enabled.bridge.dispose();post(messageTarget,command(enabled.roomId,'disposed','setLamp',{on:true}),'https://host.example',source);await flush();assert.equal(calls,1);
});

test('actual parent may be inferred, but wildcard/opaque origins and malformed options are refused',async()=>{
  const parent={postMessage(){}},target=new EventTarget();target.parent=parent;
  const f=fixture({messageTarget:target,allowedOrigins:['https://host.example']});await f.bridge.ready();
  post(target,command(f.roomId,'parent','getState'),'https://host.example',parent);await flush();assert.equal(f.result('parent').ok,true);f.bridge.dispose();
  for(const origin of ['*','null','https://host.example/path'])assert.throws(()=>createRoomBridge({api:{},getState:()=>({}),messageTarget:target,allowedOrigins:[origin]}),TypeError);
  assert.throws(()=>createRoomBridge({api:{},getState:()=>({}),allowedOrigins:['https://host.example']}),TypeError);
});

test('dispose suppresses pending async replies and removes command listeners',async()=>{
  let resolve,calls=0;const pending=new Promise(done=>{resolve=done;});
  const f=fixture({api:{walkTo(){calls++;return pending;}}});await f.bridge.ready();f.send('walkTo',{x:1,z:2},'pending');await flush();assert.equal(calls,1);
  const count=f.events.length;f.bridge.dispose();resolve({arrived:true});await flush();assert.equal(f.events.length,count);
  f.send('walkTo',{x:1,z:2},'after-dispose');await flush();assert.equal(calls,1);assert.equal(f.bridge.emit('late',{}),false);
});

test('dispose before the execution microtask prevents API work and cancels pending readiness',async()=>{
  let calls=0;const f=fixture({getState:()=>{calls++;return {};}});
  const ready=f.bridge.ready();f.bridge.dispose();assert.equal(await ready,false);assert.equal(calls,0);assert.equal(f.events.length,0);
  let resolve;const pending=new Promise(done=>{resolve=done;}),g=fixture({getState:()=>pending});const loading=g.bridge.ready();await flush();g.bridge.dispose();resolve({ready:true});assert.equal(await loading,false);assert.equal(g.events.length,0);
});

test('bridge 白名单覆盖 v2.8 仓库/补签/存档指令并透传 requestId（回归：5 个命令曾被漏在 COMMANDS 外）',async()=>{
  const calls=[],api={};
  for(const method of ['storeFurniture','unstoreFurniture','makeUpCheckIn','exportArchive','importArchive'])api[method]=function(...args){calls.push([method,...args]);return {ok:true};};
  const f=fixture({api});await f.bridge.ready();
  f.send('storeFurniture',{sku:'sofa'},'store-001');f.send('unstoreFurniture',{sku:'sofa'},'unstore-001');
  f.send('makeUpCheckIn',{},'makeup-001');f.send('exportArchive',{},'export-001');f.send('importArchive',{archive:'{"a":1}'},'import-001');
  f.send('storeFurniture',{sku:42},'store-bad');f.send('importArchive',{archive:{a:1}},'import-bad');
  await flush();
  assert.deepEqual(calls,[['storeFurniture','sofa','store-001'],['unstoreFurniture','sofa','unstore-001'],['makeUpCheckIn'],['exportArchive'],['importArchive','{"a":1}']]);
  assert.equal(f.result('store-bad').error.code,'INVALID_PARAMS');
  assert.equal(f.result('import-bad').error.code,'INVALID_PARAMS');
  f.bridge.dispose();
});

test('bridge 白名单覆盖 v2.10 切换小屋大小 setRoomLevel 并透传 requestId（回归：曾漏在 COMMANDS 外）',async()=>{
  const calls=[],api={setRoomLevel:function(...args){calls.push(['setRoomLevel',...args]);return {ok:true};}};
  const f=fixture({api});await f.bridge.ready();
  f.send('setRoomLevel',{level:1},'room-001');
  f.send('setRoomLevel',{level:-1},'room-bad-1');
  f.send('setRoomLevel',{level:1.5},'room-bad-2');
  f.send('setRoomLevel',{level:2,extra:true},'room-bad-3');
  f.send('setRoomLevel',{},'room-bad-4');
  await flush();
  assert.deepEqual(calls,[['setRoomLevel',1,'room-001']]);
  for(const id of ['room-bad-1','room-bad-2','room-bad-3','room-bad-4'])assert.equal(f.result(id).error.code,'INVALID_PARAMS');
  f.bridge.dispose();
});
