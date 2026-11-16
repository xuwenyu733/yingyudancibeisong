import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
import {databaseNow} from './database-clock.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';

test('real MySQL clock is zone-independent and a fresh planting request succeeds without a mock clock',{skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'},async()=>{
 const id='clock-qa-'+randomBytes(8).toString('hex');let actor;
 const app=await createAppServer({...await loadConfig(),lifeEnabled:true,roomAccessEnabled:true},{learningFetcher:async()=>Response.json({currentChildId:id,items:[{id,nickname:'时钟测试'}]})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 async function call(path,body,token){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:await r.json()};}
 const good=result=>{assert.equal(result.status,200,JSON.stringify(result.value));assert.equal(result.value.ok,true);return result.value;};
 try{
  const c=await app.pool.getConnection();const [[original]]=await c.query('SELECT @@session.time_zone AS zone');
  try{for(const zone of ['+08:00','+00:00','-07:00']){await c.query('SET time_zone = ?',[zone]);const before=Date.now(),actual=await databaseNow(c),after=Date.now();assert(actual>=before-1000&&actual<=after+1000,'epoch must match real time in '+zone);}}
  finally{await c.query('SET time_zone = ?',[original.zone]);c.release();}
  const ticket=good(await call('/api/v1/room-access/ticket',{},'a'.repeat(40))).ticket;actor=good(await call('/api/v1/room-access/redeem',{ticket}));const key=actor.identity.accountKey;
  const values=new Map(),adapter={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};createEstateStore({storageAdapter:adapter,storageKey:key,initialPoints:1000});assert((await app.repository.save(key,0,Object.fromEntries(values),{trustedAuthority:true})).ok);
  const state=good(await call('/api/v1/life/state',undefined,actor.accessToken));assert(Math.abs(state.serverNow-Date.now())<2000,'life endpoint must use the real UTC epoch');
  const issuedAt=state.serverNow,input={requestId:issuedAt.toString(36)+'_'+randomBytes(12).toString('hex'),issuedAt,baseRevision:state.homeRevision,roomId:state.activeRoomId,action:{type:'plant',slot:0,crop:'carrot'}};
  const planted=good(await call('/api/v1/life/action',input,actor.accessToken));const replay=good(await call('/api/v1/life/action',input,actor.accessToken));assert.equal(replay.replayed,true);assert.deepEqual(replay.state,planted.state,'duplicate tap cannot spend another seed');
  const expired={...input,issuedAt:issuedAt-600000,requestId:(issuedAt-600000).toString(36)+'_'+randomBytes(12).toString('hex')};const refused=await call('/api/v1/life/action',expired,actor.accessToken);assert.equal(refused.value.code,'REQUEST_EXPIRED');assert.deepEqual(good(await call('/api/v1/life/state',undefined,actor.accessToken)).state,planted.state);
 }finally{if(actor){const key=actor.identity.accountKey;await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[key]);await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[key]);await app.pool.execute('DELETE FROM social_accounts WHERE account_key=?',[key]);}await app.close();}
});
