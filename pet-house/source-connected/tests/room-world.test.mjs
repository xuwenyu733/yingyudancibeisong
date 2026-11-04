import test from 'node:test';
import {appendLegacyFloor} from './helpers/legacy-floor.mjs';
import assert from 'node:assert/strict';
import {createEstateStore,ESTATE_SUFFIX} from '../estate-state.mjs';
import {createEconomy} from '../economy.mjs';
import {createCompanionStore,COMPANION_SUFFIX} from '../companion-state.mjs';
import {exportAccountTransfer,restoreTransfer} from '../account-migration.mjs';

const base='user-world-123',estateKey=base+ESTATE_SUFFIX;
function memory(){return {values:new Map(),writes:[],getItem(key){return this.values.get(key)??null;},setItem(key,value){this.writes.push(key);this.values.set(key,value);},removeItem(key){this.values.delete(key);}};}
const store=adapter=>createEstateStore({storageAdapter:adapter,storageKey:base,initialPoints:10000});
const account=(estate,id='room-1')=>createEconomy({storageAdapter:estate.storageForRoom(id),storageKey:base+'-account-v1'});
const companion=(estate,id='room-1')=>createCompanionStore({adapter:estate.storageForRoom(id),key:base+COMPANION_SUFFIX});
const archive=estate=>estate.exportArchive().archive;
const room=(estate,id='room-1')=>archive(estate).estate.rooms.find(item=>item.id===id);
const definition={label:'物品',boxes:[{center:[0,.2,0],size:[.4,.4,.4]}],draggable:true,blocksNavigation:true,blocksPlacement:true};
function layout(x,extra=[]){return {version:3,furniture:Object.fromEntries(['table',...extra].map((id,i)=>[id,{position:[x+i,0,1],rotation:[0,0,0],scale:[1,1,1]}])),definitions:Object.fromEntries(['table',...extra].map(id=>[id,structuredClone(definition)])),lampSupport:null};}
function floors(estate){for(let n=2;n<=4;n++)assert.equal(appendLegacyFloor(estate,{name:`${n}楼`,requestId:`floor-${n}`}).ok,true);}

test('four floor worlds persist different layouts and revisions without duplicating a shared wallet',()=>{
  const adapter=memory(),estate=store(adapter);floors(estate);
  for(let n=1;n<=4;n++)assert.equal(account(estate,`room-${n}`).setLayout(layout(n)).ok,true);
  const revisions=estate.getState().rooms.map(item=>item.world.revision);
  assert.ok(revisions.every(value=>value>0));
  assert.equal(account(estate,'room-3').reward({eventId:'shared-world-reward',points:300}).ok,true);
  assert.deepEqual(estate.getState().rooms.map(item=>item.world.revision),revisions,'shared balance does not dirty local worlds');
  assert.equal(companion(estate,'room-2').update({petName:'共享伙伴'}).ok,true);
  assert.deepEqual(estate.getState().rooms.map(item=>item.world.revision),revisions,'shared pet preferences do not dirty local worlds');
  const reloaded=store(adapter);
  for(let n=1;n<=4;n++){assert.deepEqual(account(reloaded,`room-${n}`).getLayout(),layout(n));assert.equal(account(reloaded,`room-${n}`).getState().balance,8500);}
  assert.equal(reloaded.getState().valid,true);
});

test('five named checkpoints are bounded, nonrecursive and independent from other floors',()=>{
  const adapter=memory(),estate=store(adapter);floors(estate);account(estate).setLayout(layout(1));
  for(let n=1;n<=5;n++)assert.equal(estate.saveRoomWorld('room-1',{name:`书房${n}`}).ok,true);
  const before=adapter.getItem(estateKey),list=estate.listRoomWorldSaves('room-1');
  assert.equal(list.saves.length,5);assert.equal(list.world.checkpointCount,5);assert.equal(list.world.revision,list.revision);
  assert.equal(estate.saveRoomWorld('room-1',{name:'第六个'}).code,'ROOM_WORLD_LIMIT');assert.equal(adapter.getItem(estateKey),before);
  assert.equal(estate.listRoomWorldSaves('room-2').saves.length,0);
  const saved=room(estate).world.checkpoints[0].snapshot;
  assert.deepEqual(Object.keys(saved).sort(),['companion','extras','name','scene','template']);
  assert.equal('world'in saved,false);assert.equal('requests'in saved.scene,false);assert.equal('maxRoomLevel'in saved.scene,false);assert.equal('balance'in saved.scene,false);
  list.saves[0].name='mutated externally';assert.equal(estate.listRoomWorldSaves('room-1').saves[0].name,'书房1');
  const scene=room(estate).scene;
  assert.equal(estate.removeRoomWorldSave('room-1',list.saves[0].id).ok,true);
  assert.deepEqual(room(estate).scene,scene);assert.equal(estate.listRoomWorldSaves('room-1').saves.length,4);
});

test('restoring one world restores its design while keeping current money, ownership, pets, local receipts and paid size unlocks',()=>{
  const adapter=memory(),estate=store(adapter);floors(estate);
  account(estate).setLayout(layout(1));companion(estate).update({roomName:'旧书房',theme:'candy'});
  companion(estate).customize('table',{color:'#abcdef',sticker:'heart'});
  estate.storageForRoom('room-1').setItem(base+'-custom',JSON.stringify({value:'before'}));
  const saved=estate.saveRoomWorld('room-1',{name:'旧布置'});assert.equal(saved.ok,true);
  assert.equal(account(estate).expand({requestId:'paid-size',layout:layout(2)}).ok,true);
  assert.equal(account(estate).purchase('cloud-table',{requestId:'later-purchase',layout:layout(3,['shop-cloud-table'])}).ok,true);
  assert.equal(account(estate,'room-2').purchasePet('mint-cat','shared-pet').ok,true);
  assert.equal(account(estate,'room-4').reward({eventId:'later-learning',points:130}).ok,true);
  companion(estate).update({roomName:'新名字',theme:'light'});
  estate.storageForRoom('room-1').setItem(base+'-custom',JSON.stringify({value:'after'}));
  account(estate,'room-2').setLayout(layout(9));estate.selectRoom('room-3');
  const before=archive(estate),result=estate.restoreRoomWorld('room-1',saved.save.id);
  assert.equal(result.ok,true);assert.equal(result.relaunchRequired,true);
  const after=archive(estate);
  assert.deepEqual(after.estate.bank,before.estate.bank);assert.deepEqual(after.estate.companion,before.estate.companion);
  assert.deepEqual(after.estate.rooms.slice(1),before.estate.rooms.slice(1));assert.equal(after.estate.activeRoomId,'room-3');
  assert.deepEqual(room(estate).scene.requests,before.estate.rooms[0].scene.requests);
  assert.equal(room(estate).scene.maxRoomLevel,1);assert.equal(room(estate).scene.roomLevel,0);
  assert.deepEqual(account(estate).getLayout(),layout(1));assert.equal(room(estate).name,'旧书房');assert.equal(room(estate).companion.theme,'candy');
  assert.equal(estate.storageForRoom('room-1').getItem(base+'-custom'),JSON.stringify({value:'before'}));
  assert.ok(account(estate).getState().stored.includes('cloud-table'),'newly bought furniture moves into the restored floors warehouse');
  const balance=account(estate).getState().balance;
  assert.equal(account(estate).expand({requestId:'paid-size'}).code,'ALREADY_APPLIED');
  assert.equal(account(estate).getState().balance,balance);assert.equal(account(estate).getState().maxRoomLevel,1);
});

test('single-floor files and checkpoint ids cannot be restored into a different floor',()=>{
  const adapter=memory(),estate=store(adapter);floors(estate);account(estate).setLayout(layout(1));
  const saved=estate.saveRoomWorld('room-1',{name:'一楼快照'}),file=estate.exportRoomWorld('room-1'),before=adapter.getItem(estateKey);
  assert.equal(file.ok,true);assert.equal(estate.restoreRoomWorld('room-2',saved.save.id).code,'ROOM_WORLD_NOT_FOUND');
  assert.equal(estate.importRoomWorld('room-2',file.json).code,'ROOM_WORLD_MISMATCH');
  assert.equal(estate.removeRoomWorldSave('room-2',saved.save.id).code,'ROOM_WORLD_NOT_FOUND');assert.equal(adapter.getItem(estateKey),before);
});

test('import cannot unlock a larger house or replace current shared transaction history',()=>{
  const adapter=memory(),estate=store(adapter),file=estate.exportRoomWorld('room-1').archive,before=adapter.getItem(estateKey);
  file.snapshot.scene.roomLevel=2;
  assert.equal(estate.importRoomWorld('room-1',file).code,'ROOM_WORLD_LOCKED');assert.equal(adapter.getItem(estateKey),before);
  file.snapshot.scene.roomLevel=0;file.snapshot.scene.requests=[];
  assert.equal(estate.importRoomWorld('room-1',file).ok,false);assert.equal(adapter.getItem(estateKey),before);
  delete file.snapshot.scene.requests;file.snapshot.scene.maxRoomLevel=2;
  assert.equal(estate.importRoomWorld('room-1',file).ok,false);assert.equal(adapter.getItem(estateKey),before);
});

test('single-floor import uses current ownership and removes unowned or expired gift placement without deleting collection history',()=>{
  const adapter=memory(),estate=store(adapter),sku='gift-star-old-gift';
  assert.equal(account(estate).grantGift(sku,'gift-old').ok,true);
  let data=archive(estate);data.estate.companion.rewards.push({id:'old-gift',kind:'star',name:'星星',at:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'});assert.equal(estate.importArchive(data).ok,true);
  assert.equal(account(estate).unstoreFurniture(sku,{requestId:'place-gift',layout:layout(1,[`shop-${sku}`])}).ok,true);
  const file=estate.exportRoomWorld('room-1').archive;
  data=archive(estate);data.estate.companion.rewards[0].expiresAt='2000-01-01T00:00:00Z';assert.equal(estate.importArchive(data).ok,true);
  const bank=archive(estate).estate.bank;
  assert.equal(estate.importRoomWorld('room-1',file).ok,true);
  assert.equal(account(estate).getLayout().furniture[`shop-${sku}`],undefined);assert.ok(account(estate).getState().stored.includes(sku));
  assert.deepEqual(archive(estate).estate.bank,bank,'expired gift remains in ownership/history');
  const unowned=structuredClone(file);unowned.snapshot.scene.layout=layout(2,['shop-cloud-table']);unowned.snapshot.scene.layouts={'0':unowned.snapshot.scene.layout};
  assert.equal(estate.importRoomWorld('room-1',unowned).ok,true);assert.equal(account(estate).getLayout().furniture['shop-cloud-table'],undefined);
  assert.equal(account(estate).getState().owned.includes('cloud-table'),false);
});

test('failed world saves, restores, deletes and imports atomically retain exact previous bytes and valid reloadable state',()=>{
  for(const afterWrite of [false,true])for(const operation of ['save','restore','delete','import']){
    const adapter=memory(),estate=store(adapter);account(estate).setLayout(layout(1));const saved=estate.saveRoomWorld('room-1',{name:'最初'});
    account(estate).setLayout(layout(2));const file=estate.exportRoomWorld('room-1').archive;file.snapshot.name='文件名字';
    const before=adapter.getItem(estateKey),write=adapter.setItem.bind(adapter);let failed=false;
    adapter.setItem=(key,value)=>{if(key===estateKey&&!failed){failed=true;if(afterWrite)write(key,value);throw new Error('quota');}return write(key,value);};
    const result=operation==='save'?estate.saveRoomWorld('room-1',{name:'失败的新存档'}):operation==='restore'?estate.restoreRoomWorld('room-1',saved.save.id):operation==='delete'?estate.removeRoomWorldSave('room-1',saved.save.id):estate.importRoomWorld('room-1',file);
    assert.equal(result.ok,false,`${operation}:${afterWrite}`);assert.equal(adapter.getItem(estateKey),before);
    assert.equal(estate.getState().valid,true,`${operation}: cached store stays usable`);assert.equal(store(adapter).getState().valid,true);
  }
});

test('old archives gain default world metadata without losing original layout, balance or floor identities',()=>{
  const adapter=memory(),estate=store(adapter);floors(estate);account(estate,'room-2').setLayout(layout(2));
  const old=archive(estate);for(const record of old.estate.rooms)delete record.world;
  const target=store(memory());assert.equal(target.importArchive(old).ok,true);
  assert.deepEqual(archive(target).estate.bank,old.estate.bank);assert.deepEqual(account(target,'room-2').getLayout(),layout(2));
  assert.deepEqual(target.getState().rooms.map(item=>item.id),['room-1','room-2','room-3','room-4']);
  for(const item of target.getState().rooms){assert.equal(item.world.revision,0);assert.equal(item.world.updatedAt,item.createdAt);assert.equal(item.world.checkpointCount,0);}
});

test('whole-account migration retains named floor checkpoints and can read and restore them after reload',()=>{
  const adapter=memory(),estate=store(adapter);account(estate).setLayout(layout(1));const saved=estate.saveRoomWorld('room-1',{name:'迁移前'});account(estate).setLayout(layout(2));
  const text=exportAccountTransfer({storageAdapter:adapter,id:base}),target=memory();assert.equal(restoreTransfer(text,target,base).ok,true);
  const reloaded=store(target);assert.equal(reloaded.listRoomWorldSaves('room-1').saves[0].id,saved.save.id);
  assert.equal(reloaded.restoreRoomWorld('room-1',saved.save.id).ok,true);assert.deepEqual(account(reloaded).getLayout(),layout(1));
});

test('floor checkpoints do not recursively embed backup histories or replace current backup history on restore',()=>{
  const adapter=memory(),estate=store(adapter),key=base+'-backups-v1';account(estate).setLayout(layout(1));
  estate.storageForRoom('room-1').setItem(key,JSON.stringify({archives:[{balance:9999}]}));
  const saved=estate.saveRoomWorld('room-1',{name:'不嵌套备份'});assert.equal(saved.ok,true);
  assert.equal(room(estate).world.checkpoints[0].snapshot.extras[key],undefined);
  estate.storageForRoom('room-1').setItem(key,JSON.stringify({archives:[{balance:1111}]}));account(estate).setLayout(layout(2));
  assert.equal(estate.restoreRoomWorld('room-1',saved.save.id).ok,true);
  assert.equal(estate.storageForRoom('room-1').getItem(key),JSON.stringify({archives:[{balance:1111}]}));
  assert.equal(estate.exportRoomWorld('room-1').archive.snapshot.extras[key],undefined);
});

test('legacy-only first-floor layouts are promoted into named snapshots and single-floor files before later edits',()=>{
  const adapter=memory();adapter.setItem(base,JSON.stringify(layout(4)));
  const estate=store(adapter),saved=estate.saveRoomWorld('room-1',{name:'旧版装修'}),file=estate.exportRoomWorld('room-1');
  assert.equal(saved.ok,true);assert.equal(file.ok,true);assert.equal(JSON.parse(adapter.getItem(estateKey)).rooms[0].scene.layout,null,'read-only capture does not rewrite the live ledger');
  assert.deepEqual(file.archive.snapshot.scene.layout,layout(4));assert.deepEqual(file.archive.snapshot.scene.layouts['0'],layout(4));
  account(estate).setLayout(layout(2));assert.equal(estate.restoreRoomWorld('room-1',saved.save.id).ok,true);
  assert.deepEqual(account(estate).getLayout(),layout(4));
  account(estate).setLayout(layout(3));assert.equal(estate.importRoomWorld('room-1',file.json).ok,true);assert.deepEqual(account(estate).getLayout(),layout(4));
});

test('per-floor legacy extras use their actual size and never read another floors root legacy key',()=>{
  const adapter=memory();adapter.setItem(base,JSON.stringify(layout(8)));
  const estate=store(adapter);estate.createRoom({name:'二楼'});
  assert.equal(account(estate,'room-2').expand({requestId:'second-size'}).ok,true);
  // Simulate a historical large-room ledger whose layout alias is empty.
  const data=archive(estate),second=data.estate.rooms.find(item=>item.id==='room-2');second.scene.layout=null;second.scene.layouts={};second.extras[base]=JSON.stringify(layout(6));assert.equal(estate.importArchive(data).ok,true);
  const file=estate.exportRoomWorld('room-2');assert.equal(file.ok,true);assert.deepEqual(file.archive.snapshot.scene.layouts['1'],layout(6));assert.equal(file.archive.snapshot.scene.layouts['0'],undefined);
  account(estate,'room-2').setLayout(layout(2));assert.equal(estate.importRoomWorld('room-2',file.archive).ok,true);assert.deepEqual(account(estate,'room-2').getLayout(),layout(6));
  assert.equal(estate.storageForRoom('room-1').getItem(base),JSON.stringify(layout(8)));
});

test('malformed or recursive files fail before changing a floor, while reads and exports remain side effect free',()=>{
  const adapter=memory(),estate=store(adapter);account(estate).setLayout(layout(1));const file=estate.exportRoomWorld('room-1').archive,before=adapter.getItem(estateKey),writes=adapter.writes.length;
  estate.getState();estate.listRoomWorldSaves('room-1');estate.exportRoomWorld('room-1');assert.equal(adapter.writes.length,writes);
  file.snapshot.scene.layout.furniture.table.position=[0,'not-a-number',0];assert.equal(estate.importRoomWorld('room-1',file).ok,false);
  const recursive=estate.exportRoomWorld('room-1').archive;recursive.snapshot.world={checkpoints:[]};assert.equal(estate.importRoomWorld('room-1',recursive).ok,false);
  assert.equal(estate.importRoomWorld('room-1','{bad').ok,false);assert.equal(adapter.getItem(estateKey),before);
});
