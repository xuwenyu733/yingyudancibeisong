import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {createEconomy} from '../../source-connected/economy.mjs';
import {createCompanionStore} from '../../source-connected/companion-state.mjs';
import {createValidator} from './validation.mjs';
import {createSaveRepository} from './repository.mjs';

test('separate floor checkpoints, single-floor restore and transactional database projection preserve the other floor and shared wallet',async()=>{
  const namespace='world-projection',values=new Map(),adapter={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const estate=createEstateStore({storageAdapter:adapter,storageKey:namespace,initialPoints:3000});assert.equal(estate.createRoom({name:'二楼花园'}).ok,true);
  const account=room=>createEconomy({storageAdapter:estate.storageForRoom(room),storageKey:namespace+'-account-v1'});
  const companion=room=>createCompanionStore({adapter:estate.storageForRoom(room),key:namespace+'-companion-v1'});
  assert.equal(account('room-1').setAppearance({wallColor:'#113355'}).ok,true);assert.equal(companion('room-1').update({roomName:'一楼阅读屋',theme:'eye-care'}).ok,true);
  const first=estate.saveRoomWorld('room-1',{name:'蓝色阅读角'});assert.equal(first.ok,true);
  assert.equal(account('room-2').setAppearance({wallColor:'#aabbcc'}).ok,true);assert.equal(companion('room-2').update({roomName:'二楼花园',theme:'candy'}).ok,true);
  const second=estate.saveRoomWorld('room-2',{name:'花园布置'});assert.equal(second.ok,true);
  const sourceRoot=fileURLToPath(new URL('../../source-connected',import.meta.url)),validate=await createValidator(sourceRoot);
  let slot,worldRows=[],backup;
  const conn={async beginTransaction(){backup=structuredClone({slot,worldRows});},async commit(){},async rollback(){({slot,worldRows}=backup);},release(){},async execute(sql,params=[]){
    if(sql.startsWith('INSERT INTO sys_save_slots')){slot||={revision:0,extras:{entries:null}};return [[],[]];}
    if(sql.startsWith('SELECT revision,extras'))return [[slot],[]];
    if(sql.startsWith('UPDATE sys_save_slots')){slot={revision:params[0],archive:JSON.parse(params[1]),extras:JSON.parse(params[2])};return [[],[]];}
    if(sql.startsWith('DELETE FROM usr_accounts'))worldRows=worldRows.filter(row=>row.account_key!==params[0]);
    if(sql.startsWith('INSERT INTO room_world_saves')){const columns=sql.match(/\(([^)]+)\)/)[1].split(',');worldRows.push(Object.fromEntries(columns.map((key,i)=>[key,params[i]])));}
    return [[],[]];
  }};
  const repository=createSaveRepository({async getConnection(){return conn;},async execute(){return [[slot],[]];}},validate,{sourceRoot});
  assert.equal((await repository.save(namespace,0,Object.fromEntries(values))).ok,true);
  assert.equal(worldRows.length,4);assert.equal(worldRows.filter(row=>row.save_kind==='checkpoint').length,2);
  const rowFor=id=>worldRows.find(row=>row.room_id===id&&row.save_kind==='checkpoint');
  assert.equal(rowFor('room-1').save_name,'蓝色阅读角');assert.equal(rowFor('room-2').save_name,'花园布置');
  assert.equal(JSON.parse(rowFor('room-1').snapshot_json).scene.appearance.wallColor,'#113355');assert.equal(JSON.parse(rowFor('room-2').snapshot_json).scene.appearance.wallColor,'#aabbcc');
  const before=estate.exportArchive().archive,otherFloor=structuredClone(before.estate.rooms[1]),bank=structuredClone(before.estate.bank);
  assert.equal(account('room-1').setAppearance({wallColor:'#ff0000'}).ok,true);assert.equal(estate.restoreRoomWorld('room-1',first.save.id).ok,true);
  const after=estate.exportArchive().archive;assert.deepEqual(after.estate.rooms[1],otherFloor);assert.deepEqual(after.estate.bank,bank);assert.equal(after.estate.rooms[0].scene.appearance.wallColor,'#113355');
  assert.equal((await repository.save(namespace,1,Object.fromEntries(values))).revision,2);
  const loaded=await repository.load(namespace);assert.deepEqual(loaded.entries,Object.fromEntries(values));assert.deepEqual(slot.archive.estate.rooms[1],otherFloor);
  for(const row of worldRows){const snapshot=JSON.parse(row.snapshot_json);assert.equal('world'in snapshot,false);assert.equal('bank'in snapshot,false);assert.equal('requests'in snapshot.scene,false);assert.equal('maxRoomLevel'in snapshot.scene,false);}
  assert.equal(estate.removeRoomWorldSave('room-1',first.save.id).ok,true);assert.equal((await repository.save(namespace,2,Object.fromEntries(values))).ok,true);
  assert.equal(worldRows.some(row=>row.room_id==='room-1'&&row.save_kind==='checkpoint'),false);assert.equal(worldRows.some(row=>row.room_id==='room-2'&&row.save_kind==='checkpoint'),true);
});
