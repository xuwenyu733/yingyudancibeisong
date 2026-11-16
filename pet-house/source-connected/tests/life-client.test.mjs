import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifeClient} from '../life-client.mjs';

function fixture(){
 let tick=1000,serverNow=1700000000000,reply=()=>({ok:true,serverNow,homeChanged:false});
 const calls=[],room={api:{getState:()=>({ready:true}),getEstate:()=>({estate:{activeRoomId:'room-1'}})}},transport={revision:7,flush:async()=>({ok:true})};
 const client=createLifeClient({monotonicNow:()=>tick,getRoom:()=>room,getTransport:()=>transport,fetcher:async(path,options)=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  if(path.endsWith('/state'))return Response.json({ok:true,serverNow,state:{plants:[],materials:{seed:3}}});
  const result=await reply(body);return Response.json(result,{status:result.ok?200:result.status||409});
 }});
 return {client,calls,room,transport,get actions(){return calls.filter(x=>x.body);},advance:n=>tick+=n,server:n=>serverNow=n,respond:fn=>reply=fn};
}
const plant={type:'plant',slot:0,crop:'carrot'};

test('planting uses server epoch plus elapsed time, independent of the phone wall clock',async()=>{
 const f=fixture();await f.client.refresh();f.advance(3500);await f.client.act(plant);
 assert.equal(f.actions[0].body.issuedAt,1700000003500);assert(f.actions[0].body.requestId.startsWith((1700000003500).toString(36)+'_'));assert.equal(f.actions[0].body.baseRevision,7);
});
test('opening an action directly and waking after a minute both synchronize server time first',async()=>{
 const f=fixture();await f.client.act(plant);f.advance(120000);f.server(1700000120000);await f.client.act({...plant,slot:1});
 assert.equal(f.calls.filter(x=>x.path.endsWith('/state')).length,2);assert.equal(f.actions[1].body.issuedAt,1700000120000);
});
test('a lost response retries the same receipt',async()=>{
 const f=fixture();f.respond(()=>{throw new TypeError('network lost');});await assert.rejects(()=>f.client.act(plant),/network lost/);const original=f.actions[0].body;
 f.respond(()=>({ok:true,homeChanged:false,replayed:true}));await f.client.act(plant);assert.equal(f.actions[1].body.requestId,original.requestId);assert.equal(f.actions[1].body.issuedAt,original.issuedAt);
});
test('choosing another action after a lost reply resolves the old receipt first, then unlocks the next choice',async()=>{
 const f=fixture();f.respond(()=>{throw new TypeError('lost');});await assert.rejects(()=>f.client.act(plant));const first=f.actions[0].body;
 await f.client.refresh();f.room.api.getEstate=()=>({estate:{activeRoomId:'room-2'}});f.respond(()=>({ok:true,homeChanged:false,replayed:true}));
 await assert.rejects(()=>f.client.act({...plant,slot:1}),e=>!!e.recoveredState);assert.equal(f.actions[1].body.requestId,first.requestId);assert.deepEqual(f.actions[1].body.action,plant);assert.equal(f.actions[1].body.roomId,'room-1');
 f.respond(()=>({ok:true,homeChanged:false}));await f.client.act({...plant,slot:1});assert.notEqual(f.actions[2].body.requestId,first.requestId);assert.equal(f.actions[2].body.roomId,'room-2');
});
test('an old acknowledged reward receipt cannot overwrite newer decoration',async()=>{
 const f=fixture();f.transport.acceptRemote=()=>{throw Error('must not overwrite');};f.respond(()=>({ok:true,replayed:true,homeChanged:true,home:{revision:6,entries:{}}}));
 await assert.rejects(()=>f.client.act(plant),e=>!!e.recoveredState);f.respond(()=>({ok:true,homeChanged:false}));await f.client.act(plant);assert.notEqual(f.actions[0].body.requestId,f.actions[1].body.requestId);
});
test('expired requests refresh visible materials but require manual reconfirmation with a fresh receipt',async()=>{
 const f=fixture();f.respond(()=>({ok:false,code:'REQUEST_EXPIRED',message:'expired'}));
 await assert.rejects(()=>f.client.act(plant),error=>error.code==='REQUEST_EXPIRED'&&error.recoveredState.state.materials.seed===3);
 assert.equal(f.actions.length,1,'no automatic second POST');const first=f.actions[0].body;
 f.advance(1000);f.respond(()=>({ok:true,homeChanged:false}));await f.client.act(plant);assert.notEqual(f.actions[1].body.requestId,first.requestId);assert.equal(f.actions[1].body.issuedAt,first.issuedAt+1000);
});
test('definitive validation failures can be corrected and do not leave a pending-spend lock',async()=>{
 const f=fixture();f.respond(()=>({ok:false,status:400,message:'invalid slot'}));await assert.rejects(()=>f.client.act(plant),/invalid slot/);
 f.respond(()=>({ok:true,homeChanged:false}));await f.client.act({...plant,slot:1});assert.notEqual(f.actions[0].body.requestId,f.actions[1].body.requestId);
});
test('a duplicate tap while saving cannot create a second operation',async()=>{
 const f=fixture();let release;f.respond(()=>new Promise(resolve=>release=resolve));const first=f.client.act(plant);
 while(!release)await new Promise(resolve=>setImmediate(resolve));await assert.rejects(()=>f.client.act(plant),/上一项操作还在保存/);release({ok:true,homeChanged:false});await first;assert.equal(f.actions.length,1);
});
test('a successful reward whose local adoption fails keeps its original receipt for recovery',async()=>{
 const f=fixture();let attempts=0;f.transport.acceptRemote=()=>{if(!attempts++)throw Error('local save conflict');};f.room.api.reloadFromStorage=async()=>({ok:true});f.room.api.setPresentationPaused=()=>{};
 f.respond(()=>({ok:true,homeChanged:true,home:{revision:8,entries:{}}}));await assert.rejects(()=>f.client.act(plant),/local save conflict/);await f.client.act(plant);assert.equal(f.actions[0].body.requestId,f.actions[1].body.requestId);
});
