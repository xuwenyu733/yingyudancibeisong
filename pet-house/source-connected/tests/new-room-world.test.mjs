import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstateStore} from '../estate-state.mjs';
import {createEconomy,BUILTIN_STORAGE} from '../economy.mjs';
import {createCompanionStore} from '../companion-state.mjs';
const key='new-world-check';
function fixture(){const values=new Map(),adapter={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};return {values,adapter,store:createEstateStore({storageAdapter:adapter,storageKey:key,initialPoints:5000})};}
const account=(store,id='room-1')=>createEconomy({storageAdapter:store.storageForRoom(id),storageKey:key+'-account-v1'}),data=store=>store.exportArchive().archive.estate;
const layout={version:3,furniture:{table:{position:[2,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null};
test('backup and new design commit together, keep the shared wallet and second floor, and restore the complete first-floor design',()=>{
 const {adapter,store}=fixture();assert.equal(store.createRoom({name:'二楼原样',requestId:'second-floor'}).ok,true);assert.equal(account(store).purchase('cloud-table',{requestId:'own-table'}).ok,true);assert.equal(account(store).expand({requestId:'size',layout}).ok,true);
 const companion=createCompanionStore({adapter:store.storageForRoom('room-1'),key:key+'-companion-v1'});companion.update({roomName:'原来的书房'});companion.customize('table',{color:'#abcdef',sticker:'heart'});store.storageForRoom('room-1').setItem(key+'-work','以前的作品');
 const before=data(store),made=store.createRoomWorld('room-1',{name:'新森林屋',template:'mint',backupName:'我的旧书房'});assert.equal(made.ok,true);
 const after=data(store);assert.deepEqual(after.bank,before.bank);assert.deepEqual(after.rooms[1],before.rooms[1]);assert.equal(after.rooms.length,2);assert.equal(after.rooms[0].name,'新森林屋');assert.equal(after.rooms[0].scene.appearance.wallColor,'mint');assert.deepEqual(after.rooms[0].scene.layout.furniture,{});assert.equal(after.rooms[0].scene.maxRoomLevel,1);assert.equal(after.rooms[0].scene.roomLevel,1);assert.deepEqual(after.rooms[0].scene.requests,before.rooms[0].scene.requests);
 assert(BUILTIN_STORAGE.every(item=>after.rooms[0].scene.stored.includes(item.id)));assert(after.rooms[0].scene.stored.includes('cloud-table'));assert.equal(after.rooms[0].world.checkpoints.length,1);
 const reloaded=createEstateStore({storageAdapter:adapter,storageKey:key});assert.equal(reloaded.restoreRoomWorld('room-1',made.save.id).ok,true);const restored=data(reloaded);assert.equal(restored.rooms[0].name,'原来的书房');assert.equal(restored.rooms[0].companion.furnitureStyles.table.color,'#abcdef');assert.equal(restored.rooms[0].extras[key+'-work'],'以前的作品');assert.deepEqual(restored.bank,before.bank);assert.deepEqual(restored.rooms[1],before.rooms[1]);assert.equal(restored.rooms[0].world.checkpoints[0].name,'我的旧书房');
});
test('each floor can create a new design with its own backup without consuming another expansion payment',()=>{
 const {store}=fixture();store.createRoom({requestId:'paid-second'});const before=data(store),result=store.createRoomWorld('room-2',{name:'二楼星空',template:'candy'});assert.equal(result.ok,true);const after=data(store);assert.deepEqual(after.bank,before.bank);assert.deepEqual(after.rooms[0],before.rooms[0]);assert.equal(after.rooms[1].world.checkpoints.length,1);assert.equal(after.rooms[1].template,'candy');assert.equal(after.rooms[1].scene.appearance.wallColor,'rose');assert.equal(store.restoreRoomWorld('room-1',result.save.id).code,'ROOM_WORLD_NOT_FOUND');
});
test('a full backup list refuses the new design and leaves the exact room and wallet intact',()=>{
 const {values,store}=fixture();for(let i=0;i<5;i++)assert.equal(store.saveRoomWorld('room-1',{name:'备份'+i}).ok,true);const before=new Map(values);assert.equal(store.createRoomWorld('room-1',{name:'不能覆盖'}).code,'ROOM_WORLD_LIMIT');assert.deepEqual(values,before);
});
test('storage failures before or after a write roll back both backup and new design',()=>{
 for(const afterWrite of [false,true]){const {values,adapter,store}=fixture(),before=new Map(values),write=adapter.setItem;let failed=false;adapter.setItem=(key,value)=>{if(!failed){failed=true;if(afterWrite)write(key,value);throw new Error('quota');}write(key,value);};assert.equal(store.createRoomWorld('room-1',{name:'失败保留旧房'}).ok,false);assert.deepEqual(values,before);assert.equal(store.getState().valid,true);}
});
test('invalid theme or room name cannot create a backup or replace a design',()=>{
 const {values,store}=fixture(),before=new Map(values);for(const input of [{template:'unknown'},{name:''},{backupName:''},{unexpected:true},JSON.parse('{"__proto__":{"x":1}}')])assert.equal(store.createRoomWorld('room-1',input).ok,false);assert.deepEqual(values,before);
});
