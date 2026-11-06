import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy} from '../economy.mjs';
import {createProfile} from '../profile.mjs';
import {exportArchive,importArchive,restoreArchive} from '../archive.mjs';

function memory(){return {values:new Map(),writes:[],getItem(key){return this.values.get(key)??null;},setItem(key,value){this.writes.push([key,value]);this.values.set(key,value);},removeItem(key){this.values.delete(key);}};}
function sample(name='新昵称',balance=1000){
  const profile=createProfile({storageAdapter:null}),economy=createEconomy({storageAdapter:null,initialBalance:balance});
  profile.setName(name);economy.purchasePet('mint-cat','mint');
  return exportArchive({profile:profile.getState(),economy:economy.getState(),meta:{from:'test'}});
}
function seed(storage){
  const profile=createProfile({storageAdapter:storage,storageKey:'user-a-profile-v1'}),economy=createEconomy({storageAdapter:storage,storageKey:'user-a-account-v1',initialBalance:1500});
  profile.setName('原昵称');economy.purchase('cloud-table',{requestId:'table'});
  return {profile,economy};
}

test('two first-mounted profiles cannot overwrite the first saved profile',()=>{
  const storage=memory(),first=createProfile({storageAdapter:storage,storageKey:'profile'}),stale=createProfile({storageAdapter:storage,storageKey:'profile'});
  assert.equal(first.setName('first').ok,true);assert.equal(stale.setName('stale').code,'ARCHIVE_CONFLICT');
  assert.equal(createProfile({storageAdapter:storage,storageKey:'profile'}).getState().name,'first');
});

test('a stale profile cannot send pending rewards before detecting an account-storage conflict',()=>{
  const storage=memory(),profile=createProfile({storageAdapter:storage,storageKey:'profile'});
  profile.checkIn('2026-10-26');const newer=createProfile({storageAdapter:storage,storageKey:'profile'});newer.setName('new owner');
  let paid=0;const result=profile.settlePending(()=>{paid++;return {ok:true};});
  assert.equal(result.code,'ARCHIVE_CONFLICT');assert.equal(paid,0);assert.equal(profile.pendingCount,1);
});

test('stale replay requests do not return a success snapshot from the previous account',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,storageKey:'economy',initialBalance:1000});
  economy.purchasePet('cloud-bunny','pet');const newer=createEconomy({storageAdapter:storage,storageKey:'economy'});newer.reward({eventId:'changed',points:1});
  assert.equal(economy.purchasePet('cloud-bunny','pet').code,'ARCHIVE_CONFLICT');
});

test('explicit account namespaces stay isolated across profiles, points and pets',()=>{
  const storage=memory();
  const a=createEconomy({storageAdapter:storage,storageKey:'user-a-account-v1',initialBalance:1000}),b=createEconomy({storageAdapter:storage,storageKey:'user-b-account-v1',initialBalance:1000});
  const pa=createProfile({storageAdapter:storage,storageKey:'user-a-profile-v1'}),pb=createProfile({storageAdapter:storage,storageKey:'user-b-profile-v1'});
  a.purchasePet('cocoa-bear','pet');b.purchasePet('cloud-bunny','pet');pa.setName('A');pb.setName('B');
  assert.equal(createEconomy({storageAdapter:storage,storageKey:'user-a-account-v1'}).getState().pets.active,'cocoa-bear');
  assert.equal(createEconomy({storageAdapter:storage,storageKey:'user-b-account-v1'}).getState().balance,700);
  assert.equal(createProfile({storageAdapter:storage,storageKey:'user-a-profile-v1'}).getState().name,'A');
  assert.equal(createProfile({storageAdapter:storage,storageKey:'user-b-profile-v1'}).getState().name,'B');
});

test('known async storage methods are rejected before their write bodies can run',()=>{
  let writes=0;const adapter={getItem:()=>null,async setItem(){writes++;}};
  assert.equal(createEconomy({storageAdapter:adapter}).creditLearning({eventId:'x',learned:1}).code,'STORAGE_UNAVAILABLE');
  assert.equal(createProfile({storageAdapter:adapter}).setName('x').code,'STORAGE_UNAVAILABLE');assert.equal(writes,0);
});

test('temporarily unreadable host storage returns a read error without charging points or changing profile',()=>{
  const storage=memory(),{profile,economy}=seed(storage);const read=storage.getItem;storage.getItem=()=>{throw new Error('offline');};
  assert.equal(economy.purchasePet('cloud-bunny').code,'STORAGE_READ_FAILED');assert.equal(profile.setName('lost').code,'STORAGE_READ_FAILED');
  assert.equal(economy.getState().balance,1320);assert.equal(profile.getState().name,'原昵称');
  storage.getItem=read;assert.equal(profile.setName('retry').ok,true);assert.equal(economy.purchasePet('cloud-bunny').ok,true);
});

test('late and duplicate check-in callbacks cannot write an unloadable date history',()=>{
  const storage=memory(),profile=createProfile({storageAdapter:storage,storageKey:'profile'});
  profile.checkIn('2026-10-26');profile.checkIn('2026-10-27');
  assert.equal(profile.checkIn('2026-10-26').code,'ALREADY_CHECKED_IN');assert.equal(profile.checkIn('2026-10-25').code,'DATE_OUT_OF_ORDER');
  assert.throws(()=>profile.checkIn('2026-02-30'),error=>error.code==='INVALID_DATE');
  const loaded=createProfile({storageAdapter:storage,storageKey:'profile'});assert.equal(loaded.getState().valid,true);assert.deepEqual(loaded.getState().checkInDates,['2026-10-26','2026-10-27']);
});

test('failed badge persistence does not emit a badge-unlocked event or claim a new badge',()=>{
  const storage=memory(),events=[],profile=createProfile({storageAdapter:storage,onEvent:(type)=>events.push(type)});
  profile.addStudyTime(3600);storage.setItem=()=>{throw new Error('quota');};
  const result=profile.evaluate({});assert.equal(result.ok,false);assert.deepEqual(result.unlocked,[]);assert.equal(events.includes('badge-unlocked'),false);assert.deepEqual(profile.getState().badges,[]);
});

test('archive parsing validates both ledgers before host storage is touched',()=>{
  const storage=memory();seed(storage);const before=new Map(storage.values),archive=sample();archive.economy.balance=-1;
  assert.equal(importArchive(archive).code,'ARCHIVE_INVALID');assert.equal(restoreArchive({json:archive,storageAdapter:storage,storageKey:'user-a'}).code,'ARCHIVE_INVALID');assert.deepEqual(storage.values,before);
});

test('archive import neither mutates caller objects nor invokes accessors',()=>{
  const archive=sample(),before=JSON.stringify(archive);assert.equal(importArchive(archive).ok,true);assert.equal(JSON.stringify(archive),before);
  let reads=0;const unsafe={format:1,economy:archive.economy};Object.defineProperty(unsafe,'profile',{enumerable:true,get(){reads++;return archive.profile;}});
  assert.equal(importArchive(unsafe).code,'ARCHIVE_BROKEN');assert.equal(reads,0);
  const cyclic=sample();cyclic.meta.self=cyclic.meta;assert.equal(importArchive(cyclic).code,'ARCHIVE_BROKEN');
  const meta={nested:{value:1}},copy=exportArchive({profile:archive.profile,economy:archive.economy,meta});meta.nested.value=9;assert.equal(copy.meta.nested.value,1);
});

test('a second-key archive write failure restores the first key and preserves the original account',()=>{
  const storage=memory();seed(storage);const before=new Map(storage.values),write=storage.setItem;let failOnce=true;
  storage.setItem=function(key,value){if(key==='user-a-account-v1'&&failOnce){failOnce=false;throw new Error('quota');}write.call(this,key,value);};
  const result=restoreArchive({json:sample(),storageAdapter:storage,storageKey:'user-a'});
  assert.equal(result.code,'STORAGE_WRITE_FAILED');assert.deepEqual(storage.values,before);
  assert.equal(createProfile({storageAdapter:storage,storageKey:'user-a-profile-v1'}).getState().name,'原昵称');
});

test('rollback removes a newly created first key when the second key cannot be written',()=>{
  const storage=memory(),write=storage.setItem;
  storage.setItem=function(key,value){if(key==='user-a-account-v1')throw new Error('quota');write.call(this,key,value);};
  assert.equal(restoreArchive({json:sample(),storageAdapter:storage,storageKey:'user-a'}).code,'STORAGE_WRITE_FAILED');assert.equal(storage.values.size,0);
});

test('an adapter without removeItem cannot begin a non-reversible new-account import',()=>{
  const storage=memory();delete storage.removeItem;
  assert.equal(restoreArchive({json:sample(),storageAdapter:storage,storageKey:'user-a'}).code,'STORAGE_UNAVAILABLE');assert.equal(storage.writes.length,0);
});

test('rollback failure reports recoveryRequired instead of claiming the import had no effect',()=>{
  const storage=memory();seed(storage);const write=storage.setItem;let attempts=0;
  storage.setItem=function(key,value){if(++attempts>1)throw new Error('storage went offline');write.call(this,key,value);};
  const result=restoreArchive({json:sample(),storageAdapter:storage,storageKey:'user-a'});
  assert.equal(result.code,'STORAGE_ROLLBACK_FAILED');assert.equal(result.recoveryRequired,true);
});

test('successful archive restore reloads both ledgers and protects against stale current snapshots',()=>{
  const storage=memory(),{profile,economy}=seed(storage),expectedState={profile:profile.getState(),economy:economy.getState()};
  const first=restoreArchive({json:sample(),storageAdapter:storage,storageKey:'user-a',expectedState});assert.equal(first.ok,true);assert.equal(first.relaunchRequired,true);
  assert.equal(createProfile({storageAdapter:storage,storageKey:'user-a-profile-v1'}).getState().name,'新昵称');
  assert.equal(createEconomy({storageAdapter:storage,storageKey:'user-a-account-v1'}).getState().pets.active,'mint-cat');
  const before=new Map(storage.values);assert.equal(restoreArchive({json:sample('another'),storageAdapter:storage,storageKey:'user-a',expectedState}).code,'ARCHIVE_CONFLICT');assert.deepEqual(storage.values,before);
});

test('a host setItem callback cannot reenter another ledger instance for the same account',()=>{
  const storage=memory(),first=createEconomy({storageAdapter:storage,storageKey:'same',initialBalance:1000}),second=createEconomy({storageAdapter:storage,storageKey:'same',initialBalance:1000});
  const write=storage.setItem;let inner,inCallback=false;
  storage.setItem=function(key,value){if(!inCallback){inCallback=true;inner=second.purchasePet('mint-cat','nested');}write.call(this,key,value);};
  assert.equal(first.purchasePet('cloud-bunny','outer').ok,true);assert.equal(inner.code,'BUSY');
  assert.equal(second.getState().balance,1000);assert.equal(createEconomy({storageAdapter:storage,storageKey:'same'}).getState().pets.active,'cloud-bunny');
});
