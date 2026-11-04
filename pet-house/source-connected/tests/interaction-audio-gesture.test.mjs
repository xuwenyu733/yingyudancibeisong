import test from 'node:test';
import assert from 'node:assert/strict';
import {createSfx} from '../sfx.mjs';
import {createTouchHold} from '../touch-hold.mjs';
import {normalizeRoomTheme} from '../theme.mjs';

test('audio waits for a real gesture, supports three levels, and mute stops playing voices',()=>{
  const listeners=new Map(),peaks=[];let starts=0,stops=0,factories=0;
  const target={addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  const context={state:'running',currentTime:0,destination:{},close(){},
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(value){peaks.push(value);}},connect(){return context.destination;}};},
    createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(gain){return gain;},start(){starts++;},stop(){stops++;}};},
  };
  const sfx=createSfx({eventTarget:target});sfx.setContextFactory(()=>{factories++;return context;});
  assert.equal(sfx.play('placement'),false);assert.equal(factories,0);
  listeners.get('pointerdown')({type:'pointerdown',isTrusted:false});assert.equal(sfx.play('placement'),false);
  listeners.get('pointerdown')({type:'pointerdown',isTrusted:true});assert.equal(sfx.play('placement'),true);assert.equal(factories,1);
  const quiet=Math.max(...peaks);peaks.length=0;
  sfx.setVolume('standard');sfx.play('placement');const standard=Math.max(...peaks);peaks.length=0;
  sfx.setVolume('loud');sfx.play('placement');const loud=Math.max(...peaks);
  assert.ok(quiet<standard&&standard<loud);assert.ok(loud<=.16);
  const scheduledStops=stops;sfx.setMuted(true);assert.ok(stops>scheduledStops);assert.equal(sfx.play('cheer'),false);
  sfx.configure({muted:false,volume:'quiet'});assert.equal(sfx.play('stamp'),true);assert.ok(starts>0);
  sfx.dispose();assert.equal(listeners.size,0);assert.equal(sfx.play('badge'),false);
});

test('touch hold rotates once while still; drag, scroll, another pointer and release cancel it',()=>{
  const timers=new Map();let id=0;const held=[];
  const hold=createTouchHold({onHold:value=>held.push(value),setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:value=>timers.delete(value)});
  const pointer={pointerId:1,pointerType:'touch',isPrimary:true,clientX:30,clientY:40};
  hold.begin(pointer);hold.move({...pointer,clientX:36});assert.equal(timers.size,0);
  hold.begin(pointer);hold.end();assert.equal(timers.size,0);
  hold.begin(pointer);hold.move({...pointer,pointerId:2});assert.equal(timers.size,0);
  hold.begin(pointer);const fire=[...timers.values()].at(-1);fire();fire();assert.deepEqual(held,[1]);
  assert.equal(hold.begin({...pointer,pointerType:'mouse'}),false);
  assert.equal(hold.begin({...pointer,isPrimary:false}),false);
});

test('candy theme and old host aliases normalize consistently',()=>{
  assert.equal(normalizeRoomTheme('candy'),'candy');assert.equal(normalizeRoomTheme('eye'),'eye-care');
  assert.equal(normalizeRoomTheme('dark'),'eye-care');assert.equal(normalizeRoomTheme('unknown'),'light');
});
