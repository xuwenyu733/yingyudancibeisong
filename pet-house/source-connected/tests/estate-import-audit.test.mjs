import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstateStore} from '../estate-state.mjs';
const layout=x=>({version:3,furniture:{table:{position:[x,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null});
function fixture(key){const values=new Map(),adapter={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};return {values,adapter,store:createEstateStore({storageAdapter:adapter,storageKey:key,initialPoints:1000})};}
test('malformed transforms in any current or alternate floor layout are rejected before replacing a house',()=>{
 const source=fixture('source-house');source.store.createRoom({requestId:'second'});const original=source.store.exportArchive().archive;
 for(const alter of [archive=>{archive.estate.rooms[0].scene.layout={...layout(1),furniture:{table:{position:[0,0,0],rotation:[0,0,0],scale:null}}};},archive=>{archive.estate.rooms[1].scene.layouts={'0':{...layout(1),version:99}};},archive=>{archive.estate.rooms[0].scene.layout={...layout(1),lampSupport:'missing-table'};}]){
  const target=fixture('target-house'),before=new Map(target.values),candidate=structuredClone(original);alter(candidate);const fileBefore=JSON.stringify(candidate);
  assert.equal(target.store.importArchive(candidate).ok,false);assert.deepEqual(target.values,before);assert.equal(JSON.stringify(candidate),fileBefore);assert.equal(target.store.getState().valid,true);
 }
});
test('full exports carry root legacy layouts without modifying source storage and import into another automatic house',()=>{
 const from='source-house',to='target-house',source=fixture(from),target=fixture(to);source.adapter.setItem(from,JSON.stringify(layout(3)));source.store.storageForRoom('room-1').setItem(from+'-custom','我的附加设置');source.store.saveRoomWorld('room-1',{name:'旧布置'});
 const sourceBefore=new Map(source.values),file=source.store.exportArchive().archive;assert.equal(file.storageKey,from);assert.deepEqual(file.estate.rooms[0].scene.layout,layout(3));assert.deepEqual(source.values,sourceBefore);
 assert.equal(target.store.importArchive(file).ok,true);let imported=target.store.exportArchive().archive;assert.equal(imported.storageKey,to);assert.equal(imported.estate.rooms[0].extras[to+'-custom'],'我的附加设置');assert.equal(imported.estate.rooms[0].extras[from+'-custom'],undefined);assert.equal(imported.estate.rooms[0].world.checkpoints[0].snapshot.extras[to+'-custom'],'我的附加设置');
 assert.equal(target.store.restoreRoomWorld('room-1',file.estate.rooms[0].world.checkpoints[0].id).ok,true);imported=target.store.exportArchive().archive;assert.deepEqual(imported.estate.rooms[0].scene.layout,layout(3));assert.equal(target.store.storageForRoom('room-1').getItem(to+'-custom'),'我的附加设置');assert.equal(imported.estate.rooms[0].extras[from],undefined);
});
test('old archives without a source key stay readable without guessing or renaming unrelated extra keys',()=>{
 const source=fixture('old-house'),target=fixture('new-house');source.store.storageForRoom('room-1').setItem('old-house-unrelated','保留原键');const file=source.store.exportArchive().archive;delete file.storageKey;
 assert.equal(target.store.importArchive(file).ok,true);assert.equal(target.store.exportArchive().archive.estate.rooms[0].extras['old-house-unrelated'],'保留原键');
});
test('remapping overlapping source and destination prefixes does not overwrite another original extra',()=>{
 const from='house',to='house-next',source=fixture(from),target=fixture(to);source.store.storageForRoom('room-1').setItem(from,JSON.stringify(layout(7)));source.store.storageForRoom('room-1').setItem(from+'-next','附加记录');
 assert.equal(target.store.importArchive(source.store.exportArchive().archive).ok,true);assert.equal(target.store.storageForRoom('room-1').getItem(to+'-next'),'附加记录');assert.deepEqual(target.store.exportRoomWorld('room-1').archive.snapshot.scene.layout,layout(7));
});
