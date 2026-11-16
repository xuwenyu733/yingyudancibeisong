import test from 'node:test';
import assert from 'node:assert/strict';
import {visitAction,createVisitSnapshotGate,applyVisitSnapshot} from '../visit-sync.mjs';

test('visit intents never transmit caller-supplied coordinates or pet appearance',()=>{
 assert.deepEqual(visitAction({type:'furniture',targetId:'sofa',variant:'sit',seatId:'forged-seat',position:{x:999,z:999},pet:{sku:'unowned'}}),{type:'furniture',targetId:'sofa',variant:'sit'});
 assert.deepEqual(visitAction({type:'cancel',actionId:'a'}),{type:'cancel',actionId:'a'});
 assert.throws(()=>visitAction({type:'move'}),/不可用/);
});

test('late heartbeats cannot rewind an action snapshot or a later room revision',()=>{
 const gate=createVisitSnapshotGate();
 assert(gate.accept({revision:3,serverNow:1000},1));
 assert(gate.accept({revision:4,serverNow:1001},3));
 assert.equal(gate.accept({revision:3,serverNow:1000},2),false);
 assert.equal(gate.accept({revision:4,serverNow:1001},2),false);
 assert(gate.accept({revision:4,serverNow:1002},4));
 assert.equal(gate.accept({revision:5,serverNow:999},5),false);
 gate.reset();assert(gate.accept({revision:1,serverNow:1},1));
 assert(gate.accept({runtimeId:'old-server',revision:100,serverNow:10},2));
 assert(gate.accept({runtimeId:'new-server',revision:1,serverNow:20},3));
 assert.equal(gate.accept({runtimeId:'old-server',revision:101,serverNow:21},4),false);
});

test('scene projection keeps the current floor and immediately excludes revoked guests',()=>{
 const rows=[{id:'a',roomId:'room-1'},{id:'b',roomId:'room-1'},{id:'c',roomId:'room-2'}];let received;
 const snapshot={visitors:rows,owner:{publicId:'owner'},revision:1};
 applyVisitSnapshot({applyRoomVisitState:value=>received=value},snapshot,{roomId:'room-1',exclude:new Set(['b'])});
 assert.deepEqual(received.visitors,[rows[0]]);assert.equal(received.owner,snapshot.owner);assert.equal(snapshot.visitors.length,3);
});
