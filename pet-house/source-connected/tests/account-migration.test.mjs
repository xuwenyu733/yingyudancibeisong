import test from 'node:test';
import {appendLegacyFloor} from './helpers/legacy-floor.mjs';
import assert from 'node:assert/strict';
import { createEconomy } from '../economy.mjs';
import { createProfile } from '../profile.mjs';
import { createCompanionStore } from '../companion-state.mjs';
import {
  registerAccount, registerAccountWithId, hasAccount,
  loginAccount, resolveStorageKey, readSession, readAccounts,
} from '../account-session.mjs';
import { buildTransfer, exportAccountTransfer, parseTransfer, describeTransfer, restoreTransfer } from '../account-migration.mjs';
import {createEstateStore, ESTATE_SUFFIX} from '../estate-state.mjs';
import { restoreArchive } from '../archive.mjs';

function memory(){return {values:new Map(),writes:[],getItem(k){return this.values.get(k)??null;},setItem(k,v){this.writes.push([k,v]);this.values.set(k,v);},removeItem(k){this.values.delete(k);}};}
const COMPANION_SUFFIX='-companion-v1';

function playableAccount(storage, id){
  const economy=createEconomy({storageAdapter:storage,storageKey:id+'-account-v1',initialBalance:1500});
  const profile=createProfile({storageAdapter:storage,storageKey:id+'-profile-v1'});
  const companion=createCompanionStore({adapter:storage,key:id+COMPANION_SUFFIX});
  // 制造一些进度：买宠物、加分、签到、改昵称、设置伙伴名字
  economy.reward({eventId:'seed',points:200});
  economy.purchasePet('mint-cat','mint');
  profile.setName('甜甜');
  profile.checkIn('2026-10-29');
  companion.update({petName:'团团'});
  return {economy,profile,companion};
}

test('registerAccountWithId 用指定 id 注册，重复调用幂等', () => {
  const storage=memory();
  const a=registerAccountWithId(storage,'user-abc-123','甜甜');
  assert.ok(a);assert.equal(a.id,'user-abc-123');assert.equal(a.name,'甜甜');
  assert.equal(hasAccount(storage,'user-abc-123'),true);
  // 再次导入同名 id：不改创建时间、可更新昵称
  const before=readAccounts(storage).list[0].createdAt;
  registerAccountWithId(storage,'user-abc-123','小甜');
  const list=readAccounts(storage).list;
  assert.equal(list.length,1);
  assert.equal(list[0].name,'小甜');
  assert.equal(list[0].createdAt,before);
  // 非法 id 拒绝
  assert.equal(registerAccountWithId(storage,'bad id!','X'),null);
});

test('迁移口令往返：导出→解析→另一台设备用同一 id 恢复全部进度', () => {
  const source=memory();
  const a=registerAccount(source,'甜甜');
  const {economy,profile,companion}=playableAccount(source,a.id);

  const transfer=buildTransfer({id:a.id,name:profile.getState().name,profile:profile.getState(),economy:economy.getState(),companion:companion.getState()});
  const verdict=parseTransfer(transfer);
  assert.equal(verdict.ok,true);
  assert.equal(verdict.id,a.id);
  assert.equal(verdict.name,'甜甜');
  assert.equal(verdict.archive.format,1,'内层存档格式沿用 archive.mjs ARCHIVE_FORMAT');

  // 模拟另一台设备：全新 localStorage，且【没有】这个账号
  const target=memory();
  assert.equal(hasAccount(target,a.id),false);

  // 用口令里的 id 注册 + 恢复存档
  const entry=registerAccountWithId(target,a.id,verdict.name);
  assert.ok(entry,'目标设备登记了同 id 账号');
  const restored=restoreTransfer(transfer,target,a.id);
  assert.equal(restored.ok,true);

  // 目标设备读回：进度与源设备一致
  loginAccount(target,a.id);
  const key=resolveStorageKey(target);assert.equal(key,a.id);
  const te=createEconomy({storageAdapter:target,storageKey:key+'-account-v1'});
  const tp=createProfile({storageAdapter:target,storageKey:key+'-profile-v1'});
  const tc=createCompanionStore({adapter:target,key:key+COMPANION_SUFFIX});
  assert.equal(te.getState().balance,1300);       // 1500 初始 + 200 reward - 400 买宠物
  assert.equal(te.getState().pets.active,'mint-cat');
  assert.equal(tp.getState().name,'甜甜');
  assert.ok(tp.getState().checkInDates.includes('2026-10-29'));
  assert.equal(tc.getState().petName,'团团');
});

test('坏口令被拒绝并给出中文提示', () => {
  assert.equal(parseTransfer('').ok,false);
  assert.equal(parseTransfer('not json').ok,false);
  assert.equal(parseTransfer('{"format":"别的"}').ok,false);
  assert.equal(parseTransfer('{"format":"pet-room-transfer-v1","id":"bad","archive":{}}').ok,false);
  assert.equal(parseTransfer('{"format":"pet-room-transfer-v1","id":"user-a-1","archive":{"format":123}}').ok,false);
});

test('describeTransfer 摘要正确', () => {
  const storage=memory();
  const a=registerAccount(storage,'甜甜');
  const {economy,profile}=playableAccount(storage,a.id);
  const transfer=buildTransfer({id:a.id,name:profile.getState().name,profile:profile.getState(),economy:economy.getState()});
  const d=describeTransfer(transfer);
  assert.equal(d.ok,true);
  assert.equal(d.id,a.id);
  assert.equal(d.balance,1300);
  assert.ok(d.petCount>=1,'买过的宠物在摘要里可见');
});

function multiRoomAccount(source,id='user-estate-123'){
  registerAccountWithId(source,id,'城堡主人');
  playableAccount(source,id);
  const estate=createEstateStore({storageAdapter:source,storageKey:id});
  const economy=()=>createEconomy({storageAdapter:estate.storageForRoom('room-1'),storageKey:id+'-account-v1'});
  assert.equal(economy().reward({eventId:'estate-only-reward',points:1500}).ok,true);
  assert.equal(economy().purchase('cloud-table',{requestId:'estate-only-table'}).ok,true);
  assert.equal(appendLegacyFloor(estate,{name:'二楼',requestId:'new-floor-2'}).ok,true);
  assert.equal(appendLegacyFloor(estate,{name:'三楼',template:'mint',requestId:'new-floor-3'}).ok,true);
  const second=createCompanionStore({adapter:estate.storageForRoom('room-2'),key:id+COMPANION_SUFFIX});
  assert.equal(second.update({roomName:'专属二楼',petName:'新伙伴名',friendNames:['小明'],homeFriendLimit:1}).ok,true);
  assert.equal(second.customize('sofa',{color:'#abcdef',sticker:'heart'}).ok,true);
  estate.storageForRoom('room-3').setItem(id+'-custom-setting',JSON.stringify({message:'三楼记录'}));
  for(let n=1;n<=3;n++)assert.equal(createEconomy({storageAdapter:estate.storageForRoom('room-'+n),storageKey:id+'-account-v1'}).setLayout({version:3,furniture:{table:{position:[n,0,1],rotation:[0,0,0],scale:[1,1,1]}}}).ok,true);
  assert.equal(estate.selectRoom('room-3').ok,true);
  return {id,estate};
}

test('完整账号迁移读取庄园最新余额，保留所有楼层、物品、伙伴、资料及当前楼层',()=>{
  const source=memory(),{id,estate}=multiRoomAccount(source);
  const before=new Map(source.values),expected=estate.exportArchive().archive;
  expected.estate.rooms[0].extras[id]=null;
  assert.notEqual(JSON.parse(source.getItem(id+'-account-v1')).balance,expected.estate.bank.balance,'独立旧账本确实已过期');
  const text=exportAccountTransfer({storageAdapter:source,id,name:'城堡主人'});
  assert.deepEqual(source.values,before,'导出不写源设备');
  const info=describeTransfer(text);
  assert.equal(info.roomCount,3);assert.equal(info.balance,expected.estate.bank.balance);
  const target=memory();
  assert.equal(restoreTransfer(text,target,id,{registerAccount:true,login:true}).ok,true);
  assert.equal(readSession(target).id,id);assert.equal(hasAccount(target,id),true);
  const imported=createEstateStore({storageAdapter:target,storageKey:id}).exportArchive().archive;
  assert.deepEqual(imported.estate,expected.estate);
  assert.deepEqual(imported.profile,expected.profile);
  assert.equal(imported.estate.activeRoomId,'room-3');
  assert.equal(imported.estate.rooms[1].name,'专属二楼');
  assert.equal(imported.estate.companion.petName,'新伙伴名');
  assert.deepEqual(imported.estate.companion.friendNames,['小明']);
});

test('旧版单房间口令导入已有庄园时覆盖旧庄园，不会恢复后仍读到旧余额',()=>{
  const source=memory(),id='user-legacy-123',views=playableAccount(source,id);
  const text=buildTransfer({id,name:'旧设备',profile:views.profile.getState(),economy:views.economy.getState(),companion:views.companion.getState()});
  const target=memory(),old=createEstateStore({storageAdapter:target,storageKey:id,initialPoints:9000});
  old.createRoom({name:'应被替换的旧楼层'});
  target.setItem(id,'目标设备的旧装修');
  assert.equal(restoreTransfer(text,target,id).ok,true);
  const imported=createEstateStore({storageAdapter:target,storageKey:id}).exportArchive().archive;
  assert.equal(imported.estate.rooms.length,1);
  assert.equal(imported.estate.bank.balance,1300);
  assert.equal(imported.estate.companion.petName,'团团');
  assert.equal(createEstateStore({storageAdapter:target,storageKey:id}).storageForRoom('room-1').getItem(id),null,'不继承目标设备旧布局');
});

test('任何楼层校验失败都拒绝恢复，目标存档与账号索引保持原样',()=>{
  const source=memory(),{id}=multiRoomAccount(source),parsed=JSON.parse(exportAccountTransfer({storageAdapter:source,id}));
  parsed.archive.estate.rooms[2].scene.roomLevel=99;
  const target=memory();registerAccountWithId(target,'user-other-123','其他人');loginAccount(target,'user-other-123');
  const before=new Map(target.values);
  assert.equal(restoreTransfer(JSON.stringify(parsed),target,id,{registerAccount:true,login:true}).ok,false);
  assert.deepEqual(target.values,before);
});

test('恢复任一键写入失败都回滚全部楼层、独立账本、账号列表和会话（包括新设备）',()=>{
  const source=memory(),{id}=multiRoomAccount(source),text=exportAccountTransfer({storageAdapter:source,id,name:'新昵称'});
  const failingKeys=[id+ESTATE_SUFFIX,id+'-profile-v1',id+'-account-v1',id+COMPANION_SUFFIX,'pet-room-accounts-v1','pet-room-session-v1'];
  for(const existing of [false,true])for(const failingKey of failingKeys){
    const target=memory();
    if(existing){multiRoomAccount(target,id);registerAccountWithId(target,'user-other-123','其他账号');loginAccount(target,'user-other-123');}
    const before=new Map(target.values),write=target.setItem.bind(target);let failed=false;
    target.setItem=(key,value)=>{if(key===failingKey&&!failed){failed=true;throw new Error('quota');}return write(key,value);};
    const result=restoreTransfer(text,target,id,{registerAccount:true,login:true});
    assert.equal(result.code,'STORAGE_WRITE_FAILED',`${existing}:${failingKey}`);
    assert.deepEqual(target.values,before,`${existing}:${failingKey}`);
  }
});

test('源庄园损坏或读取失败时拒绝导出口令，不回退到过期独立账户',()=>{
  const source=memory(),{id}=multiRoomAccount(source);
  source.setItem(id+ESTATE_SUFFIX,'{broken');
  assert.throws(()=>exportAccountTransfer({storageAdapter:source,id}));
  assert.throws(()=>exportAccountTransfer({storageAdapter:{getItem(){throw new Error('blocked');}},id}));
});

test('恢复无法完整回滚时明确标记需要恢复，不误报已经保存成功',()=>{
  const source=memory(),{id}=multiRoomAccount(source),text=exportAccountTransfer({storageAdapter:source,id});
  const target=memory();multiRoomAccount(target,id);
  const write=target.setItem.bind(target);let estateWrites=0;
  target.setItem=(key,value)=>{if(key===id+'-profile-v1')throw new Error('profile blocked');if(key===id+ESTATE_SUFFIX&&++estateWrites>1)throw new Error('rollback blocked');return write(key,value);};
  const result=restoreTransfer(text,target,id);
  assert.equal(result.code,'STORAGE_ROLLBACK_FAILED');assert.equal(result.recoveryRequired,true);
});

test('从单房间源导出完整口令时包含旧布局，支持恢复到不同存储前缀',()=>{
  const source=memory(),id='user-layout-123';playableAccount(source,id);
  source.setItem(id,JSON.stringify({version:3,furniture:{},definitions:{},lampSupport:null}));
  const text=exportAccountTransfer({storageAdapter:source,id}),target=memory(),key='user-target-123';
  assert.equal(restoreTransfer(text,target,key).ok,true);
  const estate=createEstateStore({storageAdapter:target,storageKey:key});
  assert.equal(estate.storageForRoom('room-1').getItem(key),source.getItem(id));
});

test('旧庭院楼层重排时原布局始终属于room-1，不按显示顺序污染其他房间',()=>{
  const source=memory(),id='user-courtyard-123',estate=createEstateStore({storageAdapter:source,storageKey:id,initialPoints:1000});
  assert.equal(estate.createRoom({name:'二号屋'}).ok,true);
  const archive=estate.exportArchive().archive;archive.estate.mode='courtyard';
  archive.estate.rooms.find(room=>room.id==='room-1').floor=1;
  archive.estate.rooms.find(room=>room.id==='room-2').floor=0;
  assert.equal(estate.importArchive(archive).ok,true);
  const layout=JSON.stringify({version:3,furniture:{table:{position:[4,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null});
  source.setItem(id,layout);
  const target=memory(),key='user-courtyardtarget-123';
  assert.equal(restoreTransfer(exportAccountTransfer({storageAdapter:source,id}),target,key).ok,true);
  const restored=createEstateStore({storageAdapter:target,storageKey:key});
  assert.equal(restored.getState().rooms[0].id,'room-2');
  assert.equal(restored.storageForRoom('room-1').getItem(key),layout);
  assert.equal(restored.storageForRoom('room-2').getItem(key),null);
});

test('迁移到不同存储前缀后每层存档点中的附加键同步重定位',()=>{
  const source=memory(),id='user-worldsource-123',estate=createEstateStore({storageAdapter:source,storageKey:id,initialPoints:1000});
  estate.storageForRoom('room-1').setItem(id+'-custom','这一层的作品');
  const saved=estate.saveRoomWorld('room-1',{name:'迁移中的房屋'});assert.equal(saved.ok,true);
  const target=memory(),key='user-worldtarget-123';
  assert.equal(restoreTransfer(exportAccountTransfer({storageAdapter:source,id}),target,key).ok,true);
  const restored=createEstateStore({storageAdapter:target,storageKey:key});
  assert.equal(restored.restoreRoomWorld('room-1',saved.save.id).ok,true);
  assert.equal(restored.storageForRoom('room-1').getItem(key+'-custom'),'这一层的作品');
  assert.equal(restored.exportArchive().archive.estate.rooms[0].world.checkpoints[0].snapshot.extras[id+'-custom'],undefined);
});
