import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitRuntime} from './visit-runtime.mjs';
function fixture(){
 let now=1000;const runtime=createVisitRuntime({now:()=>now}),pet={sku:'cloud-bunny',petName:'花花',outfit:{hat:'none',scarf:'none',backpack:'none'},growthStage:'young'},target={id:'sofa',kind:'seat',fingerprint:'original'},floor={id:'room-1',targets:new Map([['sofa',target]]),greetPoint:p=>({x:p.x,z:p.z+1.15})};
 const guest=(key='guest',extra={})=>runtime.updateGuest({guestKey:key,hostKey:'host',id:'invitation-'+key,sessionId:'session-'+key,sequence:1,active:true,publicId:'PET-'+key,name:key,pet,roomId:'room-1',...extra});
 const host=(extra={})=>runtime.updateHost({hostKey:'host',sessionId:'session-host',sequence:1,active:true,publicId:'PET-host',name:'主人',pet,position:{x:0,z:0},roomId:'room-1',busy:false,...extra});
 return {runtime,guest,host,target,floor,advance(ms){now+=ms;},snapshot:()=>runtime.snapshot('host',1)};
}
test('active generation replaces old tab, stale departure and old action cannot affect the new tab',()=>{
 const f=fixture(),old=f.guest(),next=f.guest('guest',{sessionId:'session-new',sequence:1,join:true});assert.notEqual(old.generation,next.generation);
 assert.throws(()=>f.guest('guest',{sequence:20}),e=>e.code==='VISIT_SESSION_REPLACED');assert.throws(()=>f.guest('guest',{sequence:21,join:true}),e=>e.code==='VISIT_SESSION_REPLACED');
 assert.throws(()=>f.runtime.currentGuest('guest','session-guest',old.generation));assert.equal(f.snapshot().visitors.length,1);
});
test('out-of-order heartbeat cannot revive a departed guest, room changes cancel actions',()=>{
 const f=fixture(),g=f.guest();f.runtime.perform(g,{type:'furniture',targetId:'sofa'},{floor:f.floor,target:f.target});
 f.guest('guest',{sequence:3,active:false});f.guest('guest',{sequence:2});assert.equal(f.snapshot().visitors.length,0);
 f.guest('guest',{sequence:4});f.guest('guest',{sequence:5,roomId:'room-2'});assert.equal(f.snapshot().visitors[0].action,null);
});
test('one physical seat cannot be reserved concurrently by host and two guests; busy heartbeat preserves lease',()=>{
 const f=fixture(),owner=f.host(),a=f.guest('a'),b=f.guest('b');f.runtime.perform(owner,{type:'furniture',targetId:'sofa'},{host:true,floor:f.floor,target:f.target});
 f.host({sequence:2,busy:true});assert.equal(f.snapshot().owner.action.kind,'seat');
 for(const row of [a,b])assert.throws(()=>f.runtime.perform(row,{type:'furniture',targetId:'sofa'},{floor:f.floor,target:f.target}),e=>e.code==='VISIT_SEAT_OCCUPIED');
 f.runtime.perform(f.runtime.currentHost('host','session-host',owner.generation),{type:'cancel'},{host:true});f.runtime.perform(a,{type:'furniture',targetId:'sofa'},{floor:f.floor,target:f.target});
 assert.throws(()=>f.runtime.perform(b,{type:'furniture',targetId:'sofa'},{floor:f.floor,target:f.target}),e=>e.code==='VISIT_SEAT_OCCUPIED');
});
test('floor-local seats are independent; expiry, revoke and furniture mutation release reservations',()=>{
 const f=fixture(),a=f.guest('a'),b=f.guest('b',{roomId:'room-2'});for(const g of [a,b])f.runtime.perform(g,{type:'furniture',targetId:'sofa'},{floor:f.floor,target:f.target});
 assert.equal(f.snapshot().visitors.filter(x=>x.action).length,2);f.runtime.removeInvitation('invitation-a');assert.equal(f.snapshot().visitors.length,1);
 f.runtime.reconcile('host',{floors:[{...f.floor,id:'room-2',targets:new Map([['sofa',{...f.target,fingerprint:'moved'}]])}]});assert.equal(f.snapshot().visitors[0].action,null);
 f.advance(15000);assert.equal(f.snapshot().visitors.length,0);
});
test('action retries are idempotent and cancelled old action cannot restart or cancel a newer action',()=>{
 const f=fixture(),g=f.guest(),options={floor:f.floor,target:f.target,requestId:'request-1'};f.runtime.perform(g,{type:'furniture',targetId:'sofa'},options);const first=g.action.id;
 f.runtime.perform(g,{type:'furniture',targetId:'sofa'},options);assert.equal(g.action.id,first);
 assert.throws(()=>f.runtime.perform(g,{type:'cancel'},{requestId:'cancel-1'}),e=>e.code==='VISIT_ACTION_CHANGED');
 f.runtime.perform(g,{type:'cancel',actionId:first},{requestId:'cancel-2'});f.runtime.perform(g,{type:'furniture',targetId:'sofa'},options);assert.equal(g.action,undefined);
 f.runtime.perform(g,{type:'furniture',targetId:'sofa'},{...options,requestId:'request-2'});const second=g.action.id;
 f.runtime.perform(g,{type:'cancel',actionId:first},{requestId:'cancel-3'});assert.equal(g.action.id,second);
 assert.throws(()=>f.runtime.perform(g,{type:'cancel',actionId:second},options),e=>e.code==='VISIT_REQUEST_REUSED');
});
test('greeting requires present idle owner, shares action identity and both cancel on movement/busy',()=>{
 const f=fixture(),g=f.guest();assert.throws(()=>f.runtime.perform(g,{type:'greet'},{floor:f.floor}),e=>e.code==='VISIT_OWNER_OFFLINE');
 f.host({busy:true});assert.throws(()=>f.runtime.perform(g,{type:'greet'},{floor:f.floor}),e=>e.code==='VISIT_OWNER_BUSY');
 f.host({sequence:2});f.runtime.perform(g,{type:'greet'},{floor:f.floor});let snapshot=f.snapshot();assert.equal(snapshot.owner.action.id,snapshot.visitors[0].action.id);assert.deepEqual(snapshot.visitors[0].action.facing,{x:0,z:0});assert.deepEqual(snapshot.visitors[0].action.approach,{x:0,z:1.15});
 f.host({sequence:3,busy:true});assert.equal(f.snapshot().owner.action,null);assert.equal(f.snapshot().visitors[0].action,null);
 f.host({sequence:4});f.runtime.perform(g,{type:'greet'},{floor:f.floor});f.host({sequence:5,position:{x:2,z:0}});f.runtime.reconcile('host',{floors:[f.floor]});assert.equal(f.snapshot().visitors[0].action,null);
});
test('public snapshots exclude session/account identifiers and cap occupancy',()=>{
 const f=fixture();f.host();for(let i=0;i<12;i++)f.guest('guest-'+i);assert.throws(()=>f.guest('overflow'),e=>e.code==='VISIT_ROOM_FULL');
 const snapshot=f.snapshot();for(const key of ['hostKey','actorKey','guestKey','sessionId','generation','learningSeconds','balance'])assert(!JSON.stringify(snapshot).includes('"'+key+'"'));
 assert.equal(snapshot.visitors[0].pet.sku,'cloud-bunny');assert(Number.isSafeInteger(snapshot.revision));
});
