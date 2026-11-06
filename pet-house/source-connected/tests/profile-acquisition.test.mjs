import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile,xpForLevel} from '../profile.mjs';
import {exportArchive,restoreArchive} from '../archive.mjs';
import {createEconomy} from '../economy.mjs';
const memory=()=>({values:new Map(),blocked:false,getItem(key){return this.values.get(key)??null;},setItem(key,value){if(this.blocked)throw new Error('quota');this.values.set(key,value);},removeItem(key){this.values.delete(key);}});
const raw=state=>{const result=structuredClone(state);for(const k of ['valid','writable','error','catalog','tiers','nextTier','pets'])delete result[k];return result;};

test('the starter level medal is saved once and survives remount with another clock',()=>{
  const adapter=memory(),key='first-profile',first='2026-10-28T08:09:10.123Z';
  const p=createProfile({storageAdapter:adapter,storageKey:key,now:()=>new Date(first)});
  assert.equal(p.ensureAcquisitionBaseline().ok,true);const saved=adapter.getItem(key);
  const later=createProfile({storageAdapter:adapter,storageKey:key,now:()=>new Date('2028-01-01T00:00:00Z')});
  assert.equal(later.getState().levelBadgeAcquiredAt.bronze,first);assert.equal(later.ensureAcquisitionBaseline().unchanged,true);assert.equal(adapter.getItem(key),saved);
});
test('new achievements retain the first exact time across re-evaluation and remount',()=>{
  const adapter=memory();let at='2026-10-28T08:00:01.000Z';const p=createProfile({storageAdapter:adapter,storageKey:'a',now:()=>new Date(at)});
  p.checkIn('2026-10-28');assert.ok(p.evaluate({},'2026-10-28').unlocked.includes('first-checkin'));
  assert.equal(p.getState().badgeAcquiredAt['first-checkin'],at);at='2026-11-01T12:30:00.000Z';
  assert.deepEqual(p.evaluate({},'2026-11-01').unlocked,[]);assert.equal(createProfile({storageAdapter:adapter,storageKey:'a'}).getState().badgeAcquiredAt['first-checkin'],'2026-10-28T08:00:01.000Z');
});
test('level threshold medals are stamped on the actual level-up without rewriting earlier medals',()=>{
  const adapter=memory(),key='level',seed=raw(createProfile({storageAdapter:null,now:()=>new Date('2026-10-01T00:00:00Z')}).getState());seed.xp=xpForLevel(4)-1;seed.level=3;
  adapter.values.set(key,JSON.stringify(seed));const p=createProfile({storageAdapter:adapter,storageKey:key,now:()=>new Date('2026-10-28T12:34:56Z')});
  assert.equal(p.checkIn('2026-10-28').ok,true);assert.equal(p.getState().levelBadgeAcquiredAt.silver,'2026-10-28T12:34:56.000Z');assert.equal(p.getState().levelBadgeAcquiredAt.bronze,'2026-10-01T00:00:00.000Z');
});
test('legacy date-only achievements and already-owned medals never receive a fabricated precise time',()=>{
  const adapter=memory(),key='old',seed=raw(createProfile({storageAdapter:null}).getState());delete seed.badgeAcquiredAt;delete seed.levelBadgeAcquiredAt;
  seed.badges=['first-checkin'];seed.badgeUnlockedAt={'first-checkin':'2025-02-03'};seed.level=4;seed.xp=xpForLevel(4);
  adapter.values.set(key,JSON.stringify(seed));const saved=adapter.getItem(key),p=createProfile({storageAdapter:adapter,storageKey:key,now:()=>new Date('2030-01-01T00:00:00Z')});
  assert.equal(p.getState().valid,true);assert.equal(p.getState().badgeAcquiredAt['first-checkin'],null);assert.equal(p.getState().badgeUnlockedAt['first-checkin'],'2025-02-03');assert.deepEqual(p.getState().levelBadgeAcquiredAt,{bronze:null,silver:null});
  p.ensureAcquisitionBaseline();assert.equal(adapter.getItem(key),saved);p.setName('小主人');assert.equal(p.getState().levelBadgeAcquiredAt.silver,null);
});
test('failed achievement writes do not expose an earned timestamp and retry records the accepted time',()=>{
  const adapter=memory();let at='2026-10-28T01:00:00.000Z';const p=createProfile({storageAdapter:adapter,storageKey:'retry',now:()=>new Date(at)});p.ensureAcquisitionBaseline();
  adapter.blocked=true;assert.equal(p.evaluate({owned:['cloud-table']},'2026-10-28').ok,false);assert.equal(p.getState().badgeAcquiredAt['first-purchase'],undefined);
  adapter.blocked=false;at='2026-10-28T01:02:03.000Z';assert.equal(p.evaluate({owned:['cloud-table']},'2026-10-28').ok,true);assert.equal(p.getState().badgeAcquiredAt['first-purchase'],at);
});
test('invalid, unknown, unearned and malformed timestamps reject without overwriting the stored profile',()=>{
  for(const mutate of [p=>p.badgeAcquiredAt={'unknown':'2026-10-28T00:00:00.000Z'},p=>p.badgeAcquiredAt={'first-checkin':'2026-10-28T00:00:00.000Z'},p=>p.levelBadgeAcquiredAt.silver='2026-10-28T00:00:00.000Z',p=>p.levelBadgeAcquiredAt.bronze='2026-02-31T00:00:00.000Z']){
    const adapter=memory(),seed=raw(createProfile({storageAdapter:null}).getState());mutate(seed);const encoded=JSON.stringify(seed);adapter.values.set('bad',encoded);const p=createProfile({storageAdapter:adapter,storageKey:'bad'});assert.equal(p.getState().valid,false);assert.equal(p.setName('change').ok,false);assert.equal(adapter.getItem('bad'),encoded);
  }
});
test('exact times round trip through complete archive restoration',()=>{
  const adapter=memory(),p=createProfile({storageAdapter:adapter,storageKey:'src-profile',now:()=>new Date('2026-10-28T10:11:12Z')});p.checkIn('2026-10-28');p.evaluate({},'2026-10-28');
  const archive=exportArchive({profile:raw(p.getState()),economy:raw(createEconomy({storageAdapter:null}).getState())});
  assert.equal(restoreArchive({json:archive,storageAdapter:adapter,storageKey:'target'}).ok,true);
  const restored=createProfile({storageAdapter:adapter,storageKey:'target-profile-v1'}).getState();assert.equal(restored.badgeAcquiredAt['first-checkin'],'2026-10-28T10:11:12.000Z');assert.equal(restored.levelBadgeAcquiredAt.bronze,'2026-10-28T10:11:12.000Z');
});
