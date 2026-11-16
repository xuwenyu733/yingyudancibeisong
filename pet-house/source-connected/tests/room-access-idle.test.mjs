import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {connectRoomAccess} from '../room-access.mjs';
test('online recording sends the final inactive update, stops hidden polling and resumes immediately',async()=>{
 const timers=new Map(),events=new Map(),beats=[];let serial=0,release;
 const win={location:{hash:''},crypto:webcrypto,sessionStorage:{getItem:()=> 'a'.repeat(64)},setInterval:fn=>{timers.set(++serial,fn);return serial;},clearInterval:id=>timers.delete(id),addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},CustomEvent:class{}};
 const doc={defaultView:win,hidden:false,visibilityState:'visible',querySelector:()=>null,getElementById:()=>null,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const fetcher=async(url,options)=>{if(url.endsWith('/social/me'))return Response.json({identity:{accountKey:'learner-test'}});const body=JSON.parse(options.body);beats.push(body);if(beats.length===2)await new Promise(resolve=>release=resolve);return Response.json({ok:true});};
 const access=await connectRoomAccess({apiBase:'http://localhost',doc,fetcher});assert.equal(beats.length,1);assert.equal(timers.size,1);
 for(const fn of timers.values())fn();await Promise.resolve();assert.equal(beats.length,2);
 doc.hidden=true;doc.visibilityState='hidden';events.get('visibilitychange')();assert.equal(timers.size,0);release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(beats.length,3);assert.equal(beats.at(-1).active,false);
 events.get('visibilitychange')();await Promise.resolve();assert.equal(beats.length,3);
 doc.hidden=false;doc.visibilityState='visible';events.get('visibilitychange')();await new Promise(resolve=>setImmediate(resolve));assert.equal(timers.size,1);assert.equal(beats.length,4);assert.equal(beats.at(-1).active,true);
 access.dispose();assert.equal(timers.size,0);assert.equal(events.size,0);
});
