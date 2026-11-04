import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {createCompanionStore} from '../../source-connected/companion-state.mjs';
import {createValidator} from './validation.mjs';
import {createSaveRepository} from './repository.mjs';

test('v2.27 two-floor paid expansion, create-room receipts and friend settings survive validation, projection and reload (mock database)',async()=>{
  const namespace='latest-save',map=new Map(),adapter={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const estate=createEstateStore({storageAdapter:adapter,storageKey:namespace,initialPoints:3000});
  for(let floor=2;floor<=2;floor++)assert.equal(estate.createRoom({name:floor+'楼',requestId:'floor-'+floor}).ok,true);
  const companion=createCompanionStore({adapter:estate.storageForRoom('room-1'),key:namespace+'-companion-v1'});
  assert.equal(companion.update({homeFriendLimit:3,friendNames:['小月亮','豆豆','新朋友']}).ok,true);
  const entries=Object.fromEntries(map),sourceRoot=fileURLToPath(new URL('../../source-connected',import.meta.url)),validate=await createValidator(sourceRoot),projected=[];
  let saved;
  const conn={async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,values){
    if(sql.startsWith('INSERT INTO sys_save_slots')){saved||={revision:0,extras:{entries:null}};return [[],[]];}
    if(sql.startsWith('SELECT revision,extras'))return [[saved],[]];
    if(sql.startsWith('UPDATE sys_save_slots')){saved={revision:values[0],archive:JSON.parse(values[1]),extras:JSON.parse(values[2])};return [[],[]];}
    projected.push({sql,values});return [[],[]];
  }};
  const pool={async getConnection(){return conn;},async execute(){return [[saved],[]];}},repository=createSaveRepository(pool,validate,{sourceRoot});
  assert.deepEqual(await repository.save(namespace,0,entries),{ok:true,revision:1});
  assert.deepEqual((await repository.load(namespace)).entries,entries);
  assert.equal(saved.archive.estate.bank.balance,2400);assert.equal(saved.archive.estate.bank.totalSpent,600);
  assert.equal(saved.archive.estate.companion.homeFriendLimit,3);assert.deepEqual(saved.archive.estate.companion.friendNames,['小月亮','豆豆','新朋友']);
  const receipts=projected.filter(call=>call.sql.startsWith('INSERT INTO wallet_receipts'));
  assert.equal(receipts.filter(call=>call.values.includes('create-room')).length,1);
  assert.equal(projected.filter(call=>call.sql.startsWith('INSERT INTO room_floors')).length,2);
  const recovered=new Map(Object.entries((await repository.load(namespace)).entries)),restore=createEstateStore({storageAdapter:{getItem:k=>recovered.get(k)??null,setItem:(k,v)=>recovered.set(k,v),removeItem:k=>recovered.delete(k)},storageKey:namespace});
  assert.equal(restore.exportArchive().archive.estate.rooms.length,2);assert.deepEqual(restore.exportArchive().archive.estate.companion.friendNames,['小月亮','豆豆','新朋友']);
});
