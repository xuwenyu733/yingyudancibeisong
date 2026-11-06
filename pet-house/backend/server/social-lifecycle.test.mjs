import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialService} from './social-service.mjs';

function fixture(){
 const a={accountKey:'user-online-aaaaaaaaaaaaaaaaaaaaaaaa',publicId:'PET-AAAAAAAAAA',name:'甲'},b={accountKey:'user-online-bbbbbbbbbbbbbbbbbbbbbbbb',publicId:'PET-BBBBBBBBBB',name:'乙'},id='1'.repeat(32);
 let state={link:{user_a:a.accountKey,user_b:b.accountKey,requester:a.accountKey,state:'accepted',updated_at:new Date(Date.now()-60000)},blocks:new Set(),invites:new Map([[id,{invitation_id:id,host_key:a.accountKey,guest_key:b.accountKey,state:'accepted',created_at:new Date(Date.now()-30000),expires_at:new Date(Date.now()+600000)}]]),messages:[]};
 let failRevoke=false;const trace=[];
 async function execute(sql,values=[],transaction=false){
  trace.push({sql,transaction});
  if(sql.startsWith('SELECT account_key,public_id,display_name FROM social_accounts'))return [[a,b].filter(person=>person.publicId===values[0]).map(person=>({account_key:person.accountKey,public_id:person.publicId,display_name:person.name})),[]];
  if(sql.startsWith('INSERT INTO social_friendships')){state.link||={user_a:values[0],user_b:values[1],requester:values[2],state:'removed'};return [{affectedRows:1},[]];}
  if(sql.startsWith('SELECT * FROM social_friendships'))return [state.link?[{...state.link}]:[],[]];
  if(sql.startsWith('SELECT owner_key FROM social_blocks'))return [[...state.blocks].filter(item=>item===values[0]+'|'+values[1]||item===values[2]+'|'+values[3]).map(item=>({owner_key:item.split('|')[0]})),[]];
  if(sql.startsWith('INSERT IGNORE INTO social_blocks')){state.blocks.add(values[0]+'|'+values[1]);return [{affectedRows:1},[]];}
  if(sql.startsWith('DELETE FROM social_blocks')){state.blocks.delete(values[0]+'|'+values[1]);return [{affectedRows:1},[]];}
  if(sql.startsWith('UPDATE social_friendships SET requester=')){state.link.requester=values[0];state.link.state='pending';return [{affectedRows:1},[]];}
  if(sql.startsWith("UPDATE social_friendships SET state='removed'")){if(state.link)state.link.state='removed';return [{affectedRows:1},[]];}
  if(sql.startsWith('UPDATE social_friendships SET state=?')){state.link.state=values[0];return [{affectedRows:1},[]];}
  if(sql.startsWith('SELECT invitation_id FROM social_invitations'))return [[...state.invites.values()].filter(item=>['pending','accepted'].includes(item.state)&&((item.host_key===values[0]&&item.guest_key===values[1])||(sql.includes('((host_key=')&&item.host_key===values[2]&&item.guest_key===values[3]))).map(item=>({invitation_id:item.invitation_id})),[]];
  if(sql.startsWith("UPDATE social_invitations SET state='revoked'")){if(failRevoke)throw new Error('simulated revoke write failure');const invite=state.invites.get(values[0]);if(invite&&['pending','accepted'].includes(invite.state))invite.state='revoked';return [{affectedRows:1},[]];}
  if(sql.startsWith('INSERT INTO social_invitations')){state.invites.set(values[0],{invitation_id:values[0],host_key:values[1],guest_key:values[2],state:'pending',expires_at:new Date(Date.now()+600000)});return [{affectedRows:1},[]];}
  if(sql.startsWith('SELECT * FROM social_invitations'))return [state.invites.has(values[0])?[{...state.invites.get(values[0])}]:[],[]];
  if(sql.startsWith('UPDATE social_invitations SET state=?')){const item=state.invites.get(values[1]);if(!item||values[2]&&item.state!==values[2])return [{affectedRows:0},[]];item.state=values[0];return [{affectedRows:1},[]];}
  if(sql.startsWith('INSERT INTO social_messages')){state.messages.push({message_id:String(state.messages.length+1),recipient_key:values[1],body:values[3],created_at:new Date(),client_id:values[2]});return [{affectedRows:1},[]];}
  if(sql.startsWith('SELECT CAST(message_id AS CHAR) message_id,recipient_key'))return [state.messages.filter(item=>item.client_id===values[1]),[]];
  throw new Error('Unexpected query: '+sql);
 }
 const pool={execute:(sql,values)=>execute(sql,values),async getConnection(){let snapshot;return{async beginTransaction(){snapshot=structuredClone(state);},execute:(sql,values)=>execute(sql,values,true),async commit(){},async rollback(){state=snapshot;},release(){}};}};
 const service=createSocialService(pool,{repository:{async load(){return {entries:{}};}}});
 return {a,b,id,service,trace,get state(){return state;},set failRevoke(value){failRevoke=value;}};
}

for(const action of ['remove','block'])test(`${action} revokes both directions of visits and re-adding a friend cannot reactivate old invitations`,async()=>{
 const f=fixture(),reverse='2'.repeat(32);f.state.invites.set(reverse,{...f.state.invites.get(f.id),invitation_id:reverse,host_key:f.b.accountKey,guest_key:f.a.accountKey});
 if(action==='remove')await f.service.remove(f.a,f.b.publicId);else{await f.service.block(f.a,f.b.publicId,true);await f.service.block(f.a,f.b.publicId,false);}
 assert.equal(f.state.invites.get(f.id).state,'revoked');assert.equal(f.state.invites.get(reverse).state,'revoked');
 await f.service.request(f.a,f.b.publicId);await f.service.respond(f.b,f.a.publicId,true);assert.equal(f.state.link.state,'accepted');await assert.rejects(f.service.visit(f.b,f.id),error=>error.code==='NOT_INVITED');
 const fresh=await f.service.invite(f.a,f.b.publicId);assert.notEqual(fresh.id,f.id);assert.equal(f.state.invites.get(fresh.id).state,'pending');
});

test('historical active invitations from an already-removed friendship are revoked before accepting a new friendship',async()=>{
 const f=fixture();f.state.link.state='removed';await f.service.request(f.a,f.b.publicId);assert.equal(f.state.invites.get(f.id).state,'revoked');await f.service.respond(f.b,f.a.publicId,true);await assert.rejects(f.service.visit(f.b,f.id),error=>error.code==='NOT_INVITED');
});

test('a pre-upgrade invitation from before the latest friendship consent cannot be reused',async()=>{
 const f=fixture();f.state.link.updated_at=new Date();await assert.rejects(f.service.visit(f.b,f.id),error=>error.code==='INVITATION_GONE');await assert.rejects(f.service.respondInvite(f.b,f.id,'accept'),error=>error.code==='INVITATION_GONE');
});

test('an invitation created in the same millisecond as friendship consent is still valid',async()=>{
 const f=fixture();f.state.invites.get(f.id).created_at=new Date(f.state.link.updated_at);assert.equal((await f.service.respondInvite(f.b,f.id,'accept')).ok,true);
});

test('a failed revoke rolls back the block and friendship removal together',async()=>{
 const f=fixture();f.failRevoke=true;await assert.rejects(f.service.block(f.a,f.b.publicId,true),/simulated/);assert.equal(f.state.link.state,'accepted');assert.equal(f.state.blocks.size,0);assert.equal(f.state.invites.get(f.id).state,'accepted');
});

test('message and invitation writes share the friendship transaction instead of authorizing on a separate pool connection',async()=>{
 const f=fixture();await f.service.send(f.a,{peerId:f.b.publicId,text:'你好',clientId:'one'});f.state.invites.clear();await f.service.invite(f.a,f.b.publicId);
 for(const prefix of ['INSERT INTO social_messages','INSERT INTO social_invitations']){const at=f.trace.findIndex(item=>item.sql.startsWith(prefix));assert(at>=0);assert.equal(f.trace[at].transaction,true);assert(f.trace.slice(0,at).some(item=>item.transaction&&item.sql.endsWith('FOR UPDATE')));}
});

test('message cursors above MySQL unsigned BIGINT range fail before reaching a message query',async()=>{
 const f=fixture();await assert.rejects(f.service.messages(f.a,f.b.publicId,'18446744073709551616'),error=>error.code==='INVALID_CURSOR');assert.equal(f.trace.some(item=>item.sql.includes('FROM social_messages')),false);
});
