import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEconomy} from '../economy.mjs';
import {createProfile,previousDay} from '../profile.mjs';
import {createEstateStore} from '../estate-state.mjs';
import {exportArchive as buildArchive,restoreArchive} from '../archive.mjs';

// Exercise the actual room orchestration with real profile, account, archive
// and estate stores. Only the renderer is omitted and storage faults injected.
const source=readFileSync(new URL('../room.js',import.meta.url),'utf8');
const start=source.indexOf('  function makeUpCheckIn(){'),end=source.indexOf('  function exportArchive(){',start);
assert(start>0&&end>start);
const memory=()=>({values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,value);},removeItem(key){this.values.delete(key);}});

function fixture({estate=false,balance=1000,volatile=false}={}){
  const base=memory(),storageKey='makeup-test',accountKey=storageKey+'-account-v1',profileKey=storageKey+'-profile-v1';
  const estateStore=estate?createEstateStore({storageAdapter:base,storageKey,initialPoints:balance}):null;
  const underlying=estateStore?estateStore.storageForRoom('room-1'):base;
  let fault=null;
  const storage={getItem:key=>underlying.getItem(key),setItem(key,value){const mode=fault?.(key,value);if(mode==='before')throw new Error('simulated quota');underlying.setItem(key,value);if(mode==='after')throw new Error('simulated adapter failure after write');},removeItem:key=>underlying.removeItem(key)};
  const roomStorage=volatile?null:storage;
  const economy=createEconomy({storageAdapter:roomStorage,storageKey:accountKey,initialBalance:balance});
  const profile=createProfile({storageAdapter:roomStorage,storageKey:profileKey});
  assert.equal(economy.setAppearance({wallColor:'mint'}).ok,true);
  assert.equal(profile.setName('测试主人').ok,true);
  assert.equal(profile.checkIn('2026-10-28').ok,true);
  const events=[];
  const context={disposed:false,lifecycle:'ready',localDate:()=> '2026-10-30',previousDay,MAKEUP_COST:100,economy,profile,
    roomStorage,storageKey,createEconomy,createProfile,buildArchive,restoreArchive,
    notify:(type,detail)=>events.push({type,detail}),tradeFailure:(code,message)=>({ok:false,code,message})};
  const makeUpCheckIn=new Function('context',`with(context){${source.slice(start,end)};return makeUpCheckIn;}`)(context);
  return {base,context,events,makeUpCheckIn,accountKey,profileKey,setFault(value){fault=value;}};
}

for(const estate of [false,true]){
  const label=estate?'estate projection':'ordinary storage';
  for(const phase of ['before','after'])test(`${label}: account failure ${phase} write rolls back stamp; retry charges once`,()=>{
    const f=fixture({estate}),before=new Map(f.base.values),profileBefore=f.context.profile.getState(),economyBefore=f.context.economy.getState();
    let attempts=0;
    f.setFault(key=>key===f.accountKey&&attempts++===0?phase:null);
    const failed=f.makeUpCheckIn();
    assert.equal(failed.ok,false);
    assert.equal(failed.pointsApplied,false);
    assert.deepEqual(f.base.values,before,'both persistent records must be restored');
    assert.deepEqual(f.context.profile.getState(),profileBefore,'live profile must remain unchanged');
    assert.deepEqual(f.context.economy.getState(),economyBefore,'live account must remain unchanged');
    assert.equal(f.events.length,0,'rejected candidates must not emit successful changes');
    f.setFault(null);
    const retry=f.makeUpCheckIn();
    assert.equal(retry.ok,true,retry.message);
    assert.equal(retry.pointsApplied,true);
    assert.equal(retry.balance,900);
    assert(f.context.profile.getState().checkInDates.includes('2026-10-29'));
    assert.equal(f.context.economy.getState().claims.spends.filter(item=>item.id==='makeup:2026-10-29').length,1);
    assert.equal(f.makeUpCheckIn().balance,900,'repeating the accepted request must not charge twice');
    assert.equal(f.context.economy.reward({eventId:'after-makeup',points:5}).ok,true,'subsequent room operations must use the refreshed account');
    assert.equal(f.context.profile.setName('更新后的主人').ok,true,'subsequent room operations must use the refreshed profile');
    assert.equal(f.context.economy.getState().balance,905);
    if(estate){
      const store=createEstateStore({storageAdapter:f.base,storageKey:'makeup-test'});
      const restored=createEconomy({storageAdapter:store.storageForRoom('room-1'),storageKey:f.accountKey});
      assert.equal(restored.getState().balance,905,'shared estate bank must retain the accepted debit');
    }
  });
  test(`${label}: profile write failure cannot debit the account`,()=>{
    const f=fixture({estate}),before=new Map(f.base.values);
    f.setFault(key=>key===f.profileKey?'before':null);
    assert.equal(f.makeUpCheckIn().ok,false);
    assert.deepEqual(f.base.values,before);
    assert.equal(f.context.economy.getState().balance,1000);
    f.setFault(null);
    assert.equal(f.makeUpCheckIn().balance,900);
  });
  test(`${label}: another instance's updated account is never overwritten`,()=>{
    const f=fixture({estate});
    const other=createEconomy({storageAdapter:f.context.roomStorage,storageKey:f.accountKey});
    assert.equal(other.reward({eventId:'other-instance',points:10}).ok,true);
    const before=new Map(f.base.values);
    assert.equal(f.makeUpCheckIn().code,'ARCHIVE_CONFLICT');
    assert.deepEqual(f.base.values,before);
    assert.equal(other.getState().balance,1010);
    assert(!f.context.profile.getState().checkInDates.includes('2026-10-29'));
  });
}

test('insufficient points leave all check-in records unchanged',()=>{
  const f=fixture({balance:50}),before=new Map(f.base.values);
  assert.equal(f.makeUpCheckIn().code,'INSUFFICIENT_POINTS');
  assert.deepEqual(f.base.values,before);
  assert(!f.context.profile.getState().checkInDates.includes('2026-10-29'));
});

test('an existing ordinary check-in is free even with a low balance',()=>{
  const f=fixture({balance:50});
  assert.equal(f.context.profile.checkIn('2026-10-29').ok,true);
  const before=new Map(f.base.values),result=f.makeUpCheckIn();
  assert.equal(result.ok,true);
  assert.equal(result.unchanged,true);
  assert.equal(result.balance,50);
  assert.deepEqual(f.base.values,before);
});

test('explicit in-memory mode retains both changes and idempotency',()=>{
  const f=fixture({volatile:true});
  assert.equal(f.makeUpCheckIn().balance,900);
  assert.equal(f.makeUpCheckIn().balance,900);
  assert.equal(f.context.profile.getState().makeups.count,1);
  assert.equal(f.context.economy.reward({eventId:'later-memory-reward',points:5}).ok,true);
  assert.equal(f.context.economy.getState().balance,905);
  assert.equal(f.base.values.size,0);
});

test('a failed rollback is reported as requiring recovery instead of success',()=>{
  const f=fixture();
  let profileWrites=0;
  f.setFault(key=>key===f.accountKey?'before':key===f.profileKey&&++profileWrites>1?'before':null);
  const result=f.makeUpCheckIn();
  assert.equal(result.ok,false);
  assert.equal(result.code,'STORAGE_ROLLBACK_FAILED');
  assert.equal(result.recoveryRequired,true);
  assert.equal(result.pointsApplied,false);
  assert.equal(f.context.economy.getState().balance,1000);
  f.setFault(null);
  assert.equal(f.makeUpCheckIn().code,'ARCHIVE_CONFLICT','a partial write must not be silently overwritten on retry');
});
