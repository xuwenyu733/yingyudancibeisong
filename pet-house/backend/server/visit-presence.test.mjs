import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitPresence} from './visit-presence.mjs';
test('presence is scoped, deduplicated, expires and cannot be revived by stale requests',()=>{
 let now=100;const store=createVisitPresence({now:()=>now}),row={id:'invite',guestKey:'guest',hostKey:'host',sessionId:'one',sequence:1,active:true,roomId:'room-1'};
 store.update(row);assert.equal(store.list('other').length,0);assert.equal(store.list('host').length,1);
 now++;store.update({...row,sessionId:'two',roomId:'room-2'});assert.equal(store.list('host').length,1);assert.equal(store.list('host')[0].roomId,'room-2');
 store.update({...row,sessionId:'two',sequence:3,active:false});assert.equal(store.update({...row,sessionId:'two',sequence:2}),false);assert.equal(store.list('host')[0].roomId,'room-1');
 now+=15000;assert.equal(store.list('host').length,0);store.update({...row,sequence:4});assert.equal(store.list('host').length,1);store.removeInvitation('invite');assert.equal(store.list('host').length,0);
});
