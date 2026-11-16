import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
test('real MySQL child identities and unlimited online statistics survive legacy locks and restarts', {skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'},async()=>{
 const suffix=randomBytes(8).toString('hex'),aId='room-qa-a-'+suffix,bId='room-qa-b-'+suffix,cId='room-qa-c-'+suffix;
 let selected=aId,now=Date.UTC(2026,10,5,2),app,base;const keys=new Set(),config={...await loadConfig(),roomAccessEnabled:true};
 const learningFetcher=async(url,options)=>{assert([config.learningApi+'/children',config.learningApi+'/economy/wallet'].includes(url));if(options.headers.Authorization!=='Bearer '+ 'a'.repeat(40))return new Response('{}',{status:401});if(url.endsWith('/economy/wallet'))return Response.json({childId:selected,ledger:[]});return Response.json({currentChildId:selected,items:[{id:aId,nickname:'小屋限时测试甲'},{id:bId,nickname:'小屋限时测试乙'},{id:cId,nickname:'并发首次入屋'}]});};
 async function start(){app=await createAppServer(config,{roomClock:()=>now,learningFetcher});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
 async function call(path,{token,data,origin}={}){const res=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,body:await res.json()};}
 const ok=value=>{assert.equal(value.status,200,JSON.stringify(value.body));assert.equal(value.body.ok,true);return value.body;};
 async function enter(id){selected=id;const issued=ok(await call('/api/v1/room-access/ticket',{token:'a'.repeat(40),data:{}}));const entered=ok(await call('/api/v1/room-access/redeem',{data:{ticket:issued.ticket}}));keys.add(entered.identity.accountKey);return entered;}
 const beat=(actor,sessionId,sequence,active=true)=>call('/api/v1/room-access/heartbeat',{token:actor.accessToken,data:{sessionId,sequence,active}});
 try{
  await start();assert.equal((await call('/api/v1/social/enter',{data:{}})).status,401);assert.equal((await call('/api/v1/room-access/ticket',{token:'x'.repeat(40),data:{}})).status,401);
  assert.equal((await call('/api/v1/room-access/ticket',{token:'a'.repeat(40),data:{childId:bId}})).status,400);
  assert.equal((await call('/api/v1/room-access/ticket',{token:'a'.repeat(40),data:{},origin:'https://untrusted.example'})).status,403);
  const a=await enter(aId),b=await enter(bId);assert.notEqual(a.identity.accountKey,b.identity.accountKey);
  const concurrent=await Promise.all([enter(cId),enter(cId)]);assert.equal(concurrent[0].identity.accountKey,concurrent[1].identity.accountKey);assert.notEqual(concurrent[0].accessToken,concurrent[1].accessToken);
  const [beforeEnter]=await app.pool.execute('SELECT expires_at FROM social_sessions WHERE token_hash=SHA2(?,256)',[a.accessToken]);
  ok(await call('/api/v1/social/enter',{token:a.accessToken,data:{}}));
  const [afterEnter]=await app.pool.execute('SELECT expires_at FROM social_sessions WHERE token_hash=SHA2(?,256)',[a.accessToken]);assert.equal(+afterEnter[0].expires_at,+beforeEnter[0].expires_at,'normal frontend enter cannot renew protected session');
  selected=aId;const oneUse=ok(await call('/api/v1/room-access/ticket',{token:'a'.repeat(40),data:{}}));
  const redeemed=await Promise.all([0,1].map(()=>call('/api/v1/room-access/redeem',{data:{ticket:oneUse.ticket}})));assert.deepEqual(redeemed.map(x=>x.status).sort(),[200,401]);
  ok(await beat(a,'tab-a',1));now+=10_000;ok(await beat(a,'tab-b',1));now+=4000;assert.equal(ok(await beat(a,'tab-a',2)).usedMs,14_000);
  assert.equal(ok(await call('/api/v1/room-access/status',{token:b.accessToken})).usedMs,0);
  // Inactive visibility events close only their own lease, including two overlapping tabs.
  ok(await beat(a,'tab-a',3,false));ok(await beat(a,'tab-b',2,false));now+=60_000;assert.equal(ok(await call('/api/v1/room-access/status',{token:a.accessToken})).usedMs,14_000);
  // Legacy restrictions and both old thresholds must be ignored, while online statistics continue.
  await app.pool.execute('UPDATE room_usage_days SET used_ms=1795000,continuous_ms=895000,last_active_ms=?,settled_ms=?,rest_until_ms=? WHERE account_key=?',[now,now,now+300000,a.identity.accountKey]);
  ok(await beat(a,'tab-a',4));now+=10000;const unlimited=ok(await beat(a,'tab-a',5));assert.equal(unlimited.allowed,true);assert.equal(unlimited.limitsEnabled,false);assert.equal(unlimited.usedMs,1805000);assert.equal(unlimited.restUntil,0);assert.equal(unlimited.remainingMs,null);
  const designResponse=await call('/api/v1/designs/0000',{token:a.accessToken});assert.notEqual(designResponse.body.code,'ROOM_TIME_LIMIT');assert.notEqual(designResponse.status,403);
  assert.equal(ok(await beat(b,'other-child',1)).usedMs,0);
  const reopened=await enter(aId);assert.equal(reopened.identity.accountKey,a.identity.accountKey);assert.equal(ok(await beat(reopened,'new-device',1)).allowed,true);
  await app.close();await start();assert.equal(ok(await call('/api/v1/room-access/status',{token:a.accessToken})).allowed,true);
  now=Math.floor(now/86400000)*86400000+86400000;const next=ok(await beat(a,'next-day',1));assert.equal(next.allowed,true);assert.equal(next.usedMs,0);assert.equal(next.limitMs,null);
  const [views]=await app.pool.execute('SELECT * FROM `新手_13_仓鼠屋在线时长` WHERE `账号编号`=?',[a.identity.accountKey]);assert.equal(views.length,2);
  const sessions=[];for(let i=0;i<9;i++)sessions.push(await enter(aId));
  const [sessionCount]=await app.pool.execute('SELECT COUNT(*) n FROM social_sessions WHERE account_key=?',[a.identity.accountKey]);assert.equal(Number(sessionCount[0].n),8);
  assert.equal((await call('/api/v1/social/me',{token:a.accessToken})).status,401);
  const current=sessions.at(-1),other=sessions.at(-2);ok(await call('/api/v1/room-access/revoke',{token:current.accessToken,data:{all:false}}));assert.equal((await call('/api/v1/social/me',{token:current.accessToken})).status,401);ok(await call('/api/v1/social/me',{token:other.accessToken}));
  ok(await call('/api/v1/room-access/revoke',{token:other.accessToken,data:{all:true}}));assert.equal((await call('/api/v1/social/me',{token:other.accessToken})).status,401);ok(await call('/api/v1/social/me',{token:b.accessToken}));
  const legacy=await enter(aId);await app.pool.execute('UPDATE social_sessions SET created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY),expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 400 DAY) WHERE token_hash=SHA2(?,256)',[legacy.accessToken]);assert.equal((await call('/api/v1/social/me',{token:legacy.accessToken})).status,401,'historical 400-day learner tokens cannot outlive the 24-hour age bound');
  console.log(JSON.stringify({verifiedChildIdentity:true,ticketsSingleUse:true,perUserIsolation:true,multipleTabsCountOnce:true,noMandatoryBreak:true,noDailyLimit:true,reopenAndRestartAllowed:true,reportingBoundaryOnly:true}));
 }finally{if(app){for(const key of keys){await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[key]);await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[key]);await app.pool.execute('DELETE FROM social_accounts WHERE account_key=?',[key]);}await app.close();}}
});
