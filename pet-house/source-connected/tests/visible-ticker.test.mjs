import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisibleTicker} from '../visible-ticker.mjs';
test('hidden pages stop their periodic work, notify once and resume immediately',()=>{
 const timers=new Map(),events=new Map();let id=0,ticks=0,inactive=0,resumes=0;
 const doc={hidden:false,defaultView:{setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:id=>timers.delete(id)},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const ticker=createVisibleTicker({doc,interval:5000,onTick:()=>ticks++,onHidden:()=>inactive++,onVisible:()=>resumes++});
 assert.equal(timers.size,1);for(const fn of timers.values())fn();assert.equal(ticks,1);
 doc.hidden=true;events.get('visibilitychange')();events.get('visibilitychange')();assert.equal(timers.size,0);assert.equal(inactive,1);
 doc.hidden=false;events.get('visibilitychange')();assert.equal(resumes,1);assert.equal(timers.size,1);
 ticker.dispose();ticker.dispose();assert.equal(timers.size,0);assert.equal(events.size,0);
});
test('a page initially hidden starts no interval until it becomes visible',()=>{
 let timer=0,ticks=0,visibility;const doc={hidden:true,defaultView:{setInterval:()=>++timer,clearInterval:()=>--timer},addEventListener:(_name,fn)=>visibility=fn,removeEventListener:()=>{}};
 const ticker=createVisibleTicker({doc,interval:2500,onTick:()=>ticks++});assert.equal(timer,0);doc.hidden=false;visibility();assert.equal(timer,1);assert.equal(ticks,1);ticker.dispose();assert.equal(timer,0);
});
