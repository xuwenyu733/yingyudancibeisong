import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDirectHome,rememberDirectHome,carryLocalHouse} from '../direct-home.mjs';
import {createEstateStore} from '../estate-state.mjs';
function memory(){const values=new Map();return {values,get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('direct entry reuses this browser house without an account selection or session',()=>{
 const storage=memory(),key=resolveDirectHome(storage);assert.match(key,/^pet-room-guest-/);assert.equal(resolveDirectHome(storage),key);assert.equal(storage.getItem('pet-room-session-v1'),null);
 rememberDirectHome(storage,'user-online-012345678901234567890123');assert.equal(resolveDirectHome(storage),'user-online-012345678901234567890123');
});
test('existing guest progress is selected before creating another empty house',()=>{
 const storage=memory();storage.setItem('pet-room-guest-aaa-one-estate-v1','{}');storage.setItem('pet-room-guest-bbb-two-estate-v1','{}');storage.setItem('user-online-secret-estate-v1','{}');assert.equal(resolveDirectHome(storage),'pet-room-guest-bbb-two');
});
test('moving local progress to the automatic identity preserves floors, wallet, checkpoints and the original copy',()=>{
 const storage=memory(),from='pet-room-guest-aaa-one',to='user-online-012345678901234567890123',estate=createEstateStore({storageAdapter:storage,storageKey:from,initialPoints:7777});
 assert.equal(estate.createRoom({name:'保留的二楼'}).ok,true);estate.storageForRoom('room-1').setItem(from+'-note','独立的小世界');assert.equal(estate.saveRoomWorld('room-1',{name:'装修一'}).ok,true);
 const original=new Map(storage.values),before=estate.exportArchive().archive;assert.equal(carryLocalHouse(storage,from,to).copied,true);
 const after=createEstateStore({storageAdapter:storage,storageKey:to}).exportArchive().archive;assert.deepEqual(after.estate.bank,before.estate.bank);assert.equal(after.estate.rooms.length,2);assert.equal(after.estate.rooms[1].name,'保留的二楼');assert.equal(after.estate.rooms[0].world.checkpoints.length,1);assert.equal(after.estate.rooms[0].extras[to+'-note'],'独立的小世界');
 for(const [key,value]of original)assert.equal(storage.getItem(key),value);assert.equal(carryLocalHouse(storage,from,to).copied,false);
});
test('copy failure does not destroy local progress or leave a partially imported house',()=>{
 const storage=memory(),from='pet-room-guest-aaa-one',to='user-online-012345678901234567890123';createEstateStore({storageAdapter:storage,storageKey:from});const original=new Map(storage.values),set=storage.setItem;let writes=0;storage.setItem=(key,value)=>{if(++writes===2)throw new Error('quota');set(key,value);};
 assert.throws(()=>carryLocalHouse(storage,from,to),/quota/);assert.deepEqual(storage.values,original);
});
test('carrying progress into a namespace extending the old prefix remaps exactly once',()=>{
 const storage=memory(),from='house',to='house-next',estate=createEstateStore({storageAdapter:storage,storageKey:from});estate.storageForRoom('room-1').setItem(from+'-note','只移动一次');estate.storageForRoom('room-1').setItem(from+'-next-note','保留原重叠键');estate.saveRoomWorld('room-1',{name:'带走的备份'});
 assert.equal(carryLocalHouse(storage,from,to).copied,true);const imported=createEstateStore({storageAdapter:storage,storageKey:to}).exportArchive().archive;
 assert.equal(imported.estate.rooms[0].extras[to+'-note'],'只移动一次');assert.equal(imported.estate.rooms[0].extras['house-next-next-note'],'保留原重叠键');assert.equal(imported.estate.rooms[0].world.checkpoints[0].snapshot.extras[to+'-note'],'只移动一次');
});
