import test from 'node:test';
import assert from 'node:assert/strict';
import {planInteraction,createInteractionPlan,INTERACTION_EVENTS} from '../interaction-framework.mjs';

test('current room action sounds have a single predictable routing plan',()=>{
  const expected={'furniture-landed':'placement','furniture-placed':'placement','pet-purchased':'cheer','checkin-done':'stamp','makeup-done':'stamp','level-up':'levelup','room-expanded':'purchase','water-done':'water','learning-reward':'clap','badge-unlocked':'badge','error':'error','path-blocked':'error','water-blocked':'error','collect-all':'click','reset-layout':'placement','estate-room-entered':'click'};
  for(const [event,sound]of Object.entries(expected))assert.deepEqual(planInteraction(event).sounds,[sound],event);
  assert.equal(createInteractionPlan,planInteraction);assert.ok(INTERACTION_EVENTS.includes('estate-room-entered'));
});

test('first furniture acquisition has memory and cheering while warehouse placement does not duplicate it',()=>{
  const purchased=planInteraction('furniture-placed',{id:'shop-cloud-table',name:'小云桌'},{isNewFurniture:true,ownerName:'甜甜'});assert.ok(purchased.actions.some(a=>a.type==='land'));assert.ok(purchased.actions.some(a=>a.type==='remember'));assert.ok(purchased.actions.some(a=>a.type==='react'&&a.kind==='cheer'));assert.ok(purchased.bubble.includes('甜甜'));
  const stored=planInteraction('furniture-placed',{id:'shop-cloud-table'});assert.equal(stored.actions.some(a=>a.type==='remember'||a.type==='react'),false);assert.equal(stored.bubble,null);
});

test('replayed rewards produce no sound, animation, celebration or repeated growth',()=>{
  for(const event of ['learning-reward','checkin-done','pet-purchased','badge-unlocked','room-expanded','collect-all']){
    const result=planInteraction(event,{code:'ALREADY_CLAIMED',eventId:'lesson-1'});assert.equal(result.suppressed,true);assert.deepEqual(result.actions,[]);assert.deepEqual(result.sounds,[]);assert.equal(result.celebration,null);
  }
});

test('reduced motion retains information and sounds while omitting movement',()=>{
  const checkin=planInteraction('checkin-done',{streak:7},{reducedMotion:true});assert.deepEqual(checkin.sounds,['stamp']);assert.equal(checkin.celebration.name,'连续第 7 天');assert.equal(checkin.actions.some(a=>a.type==='react'),false);
  const reset=planInteraction('reset-layout',{},{});assert.ok(reset.actions.some(a=>a.type==='transition-layout'&&a.durationMs===300));assert.equal(planInteraction('reset-layout',{}, {reducedMotion:true}).actions.some(a=>a.type==='transition-layout'),false);
});

test('plans are immutable data, preserve useful errors and ignore unknown events',()=>{
  const detail={message:'存储配额已满，请先导出备份'},result=planInteraction('layout-persist-failed',detail);assert.equal(result.bubble,detail.message);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.sounds));assert.throws(()=>result.sounds.push('click'),TypeError);assert.deepEqual(detail,{message:'存储配额已满，请先导出备份'});
  assert.deepEqual(planInteraction('unrecognised').sounds,[]);assert.deepEqual(planInteraction('disposed').actions,[{type:'stop-all'}]);
  for(const event of ['asset-loaded','companion-change','lamp-change','layout-change','pet-state','quality-downgrade']){assert.ok(INTERACTION_EVENTS.includes(event));assert.deepEqual(planInteraction(event).sounds,[],'高频状态事件保持安静');assert.equal(planInteraction(event).bubble,null);}
});
