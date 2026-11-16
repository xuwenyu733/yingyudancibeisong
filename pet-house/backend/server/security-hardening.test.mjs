import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createAppServer} from './server.mjs';
import {createRequestAdmission} from './request-admission.mjs';
import {assertSafeExposure,connectionOptions} from './config.mjs';
import {limitAccountSessions,createSessionMaintenance} from './session-maintenance.mjs';
import {createSocialService} from './social-service.mjs';

async function fixture(t,{fetcher=async()=>Response.json({}, {status:401})}={}){
 const trace=[],key='learner-security-fixture',token='a'.repeat(64);let live=true;
 const execute=async(sql,args=[])=>{
  trace.push({sql,args});
  if(sql.includes('information_schema.TABLES'))return [[...['room_world_saves','social_accounts','room_usage_days','room_usage_sessions','room_entry_tickets'].map(TABLE_NAME=>({TABLE_NAME}))],[]];
  if(sql.includes('information_schema.CHECK_CONSTRAINTS'))return [[],[]];
  if(sql.includes('information_schema.COLUMNS'))return [[{IS_NULLABLE:'YES'}],[]];
  if(sql.startsWith('SELECT a.account_key'))return [live?[{account_key:key,public_id:'PET-0000000000',display_name:'隔离账号'}]:[],[]];
  if(sql.startsWith('SELECT account_key FROM room_entry_tickets'))return [[],[]];
  if(sql.startsWith('SELECT account_key FROM social_accounts'))return [[{account_key:key}],[]];
  if(sql.startsWith('SELECT revision, extras'))return [[],[]];
  if(sql.startsWith('DELETE FROM social_sessions')){live=false;return [{affectedRows:1},[]];}
  if(sql.startsWith('DELETE FROM room_entry_tickets'))return [{affectedRows:1},[]];
  throw Error('Unexpected SQL: '+sql);
 };
 const pool={async query(){return [[],[]];},execute,async getConnection(){return{execute,async beginTransaction(){},async commit(){},async rollback(){},release(){}};},async end(){}};
 const sourceRoot=fileURLToPath(new URL('../../source-connected',import.meta.url));
 const app=await createAppServer({sourceRoot,database:'pet_room',socialEnabled:true,designCodesEnabled:false,lifeEnabled:false,roomAccessEnabled:true},{pool,learningFetcher:fetcher});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
 const call=async(path,{data,auth=true}={})=>{const response=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:data===undefined?'GET':'POST',headers:{...(auth?{Authorization:'Bearer '+token}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie'),retry:response.headers.get('retry-after')};};
 return {call,trace,key};
}

test('normal learner enter preserves short session, clears legacy persistent cookie and authenticates once',async t=>{
 const f=await fixture(t),result=await f.call('/api/v1/social/enter',{data:{}});
 assert.equal(result.status,200);assert.equal(result.body.identity.accountKey,f.key);assert.equal(result.body.created,false);
 assert.match(result.cookie,/Max-Age=0/);assert.equal(f.trace.filter(row=>row.sql.startsWith('SELECT a.account_key')).length,1);
 assert.equal(f.trace.some(row=>row.sql.includes('UPDATE social_sessions')),false);
 assert(f.trace.some(row=>row.sql.includes('s.created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)')),'historical overlong learner sessions must also be age-bounded');
 const at=f.trace.length;assert.equal((await f.call('/api/v1/save?namespace='+f.key)).status,200);assert.equal(f.trace.slice(at).filter(row=>row.sql.startsWith('SELECT a.account_key')).length,1);
});

for(const all of [false,true])test('authenticated revoke removes only the selected account sessions; all='+all,async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/v1/room-access/revoke',{data:{all:'yes'}})).status,400);
 const result=await f.call('/api/v1/room-access/revoke',{data:{all}});assert.equal(result.status,200);assert.match(result.cookie,/Max-Age=0/);
 const deletion=f.trace.find(row=>row.sql.startsWith('DELETE FROM social_sessions'));assert.equal(deletion.args[0],f.key);assert.equal(deletion.sql.includes('token_hash=?'),!all);
 assert.equal(f.trace.some(row=>row.sql==='DELETE FROM room_entry_tickets WHERE account_key=?'),all);
 assert.equal((await f.call('/api/v1/social/me')).status,401);
});

test('invalid entry requests are throttled before reaching upstream or database',async t=>{
 let upstream=0;const f=await fixture(t,{fetcher:async()=>{upstream++;return Response.json({}, {status:401});}});
 for(let i=0;i<60;i++){const r=await f.call('/api/v1/room-access/ticket',{data:{}});assert.equal(r.status,i<20?401:429);if(i>=20)assert(Number(r.retry)>0);}
 for(let i=0;i<60;i++){const r=await f.call('/api/v1/room-access/redeem',{auth:false,data:{ticket:'0'.repeat(64)}});assert.equal(r.status,i<40?401:429);}
 assert.equal(upstream,20);assert.equal(f.trace.filter(row=>row.sql.startsWith('SELECT account_key FROM room_entry_tickets')).length,40);
});

test('admission caps concurrent work, releases idempotently, expires buckets and bounds attacker keys',()=>{
 let now=0;const admission=createRequestAdmission({now:()=>now,maxKeys:2});
 const release=admission.enter('one',{max:2,concurrency:1});assert.throws(()=>admission.enter('one',{max:2,concurrency:1}),e=>e.status===429);release();release();
 assert.throws(()=>admission.enter('one',{max:2,concurrency:1}),e=>e.status===429);
 admission.rate('two',1);assert.throws(()=>admission.rate('three',1),e=>e.status===429);
 now=60001;admission.enter('three',{max:1,concurrency:1})();
});

test('public exposure cannot disable authentication while local legacy tooling remains available',()=>{
 assert.doesNotThrow(()=>assertSafeExposure({httpHost:'127.0.0.1',socialEnabled:false}));
 for(const exposure of [{httpHost:'0.0.0.0'},{publicOrigin:'https://pets.example.com'}])for(const flags of [{socialEnabled:false,roomAccessEnabled:true},{socialEnabled:true,roomAccessEnabled:false}])assert.throws(()=>assertSafeExposure({...exposure,...flags}),/鉴权/);
 assert.doesNotThrow(()=>assertSafeExposure({httpHost:'0.0.0.0',socialEnabled:true,roomAccessEnabled:true}));
 const options=connectionOptions({});assert.equal(options.connectionLimit,4);assert.equal(options.queueLimit,32);assert.equal(options.waitForConnections,true);assert.equal(options.multipleStatements,false);
});

test('session cap retains the new token and never deletes another account',async()=>{
 const trace=[],keep=Array.from({length:8},(_,i)=>({token_hash:'hash-'+i})),connection={async execute(sql,args){trace.push({sql,args});return sql.startsWith('SELECT')?[keep,[]]:[{affectedRows:1},[]];}};
 await limitAccountSessions(connection,'learner-cap-test','hash-0');
 assert(trace[1].sql.includes('ORDER BY (token_hash=?) DESC'));assert.deepEqual(trace[1].args,['learner-cap-test','hash-0']);assert(trace[1].sql.endsWith('LIMIT 8 FOR UPDATE'));
 assert.deepEqual(trace[2].args,['learner-cap-test',...keep.map(row=>row.token_hash)]);assert(trace.every(row=>row.sql.includes('account_key=?')));
});

test('session maintenance is bounded, single-flight and stops on disposal',async()=>{
 const trace=[];let unblock;const pool={async execute(sql){trace.push(sql);if(trace.length===1)await new Promise(r=>unblock=r);return [{affectedRows:0},[]];}};
 const maintenance=createSessionMaintenance(pool,{intervalMs:60000});const first=maintenance.run(),second=maintenance.run();assert.equal(trace.length,1);unblock();await Promise.all([first,second]);assert.equal(trace.length,2);assert(trace.every(sql=>sql.endsWith('LIMIT 500')));
 await maintenance.close();await maintenance.run();assert.equal(trace.length,2);
});

test('visitor floor cache follows save revisions while every roster poll rechecks consent',async()=>{
 const id='1'.repeat(32),host={accountKey:'learner-host'},guest={accountKey:'learner-guest',publicId:'PET-1111111111',name:'访客'};
 let revision=1,loads=0,blocked=false;const trace=[];
 const pool={async execute(sql,args){trace.push(sql);
  if(sql.startsWith('SELECT * FROM social_invitations'))return [[{invitation_id:id,host_key:host.accountKey,guest_key:guest.accountKey,state:'accepted',created_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+60000)}],[]];
  if(sql.startsWith('SELECT * FROM social_friendships'))return [[{state:'accepted',updated_at:new Date(Date.now()-2000)}],[]];
  if(sql.startsWith('SELECT owner_key FROM social_blocks'))return [blocked?[{owner_key:host.accountKey}]:[],[]];
  if(sql.startsWith('SELECT revision FROM sys_save_slots'))return [[{revision}],[]];
  if(sql.startsWith('SELECT namespace,revision FROM sys_save_slots'))return [args.map(namespace=>({namespace,revision})),[]];
  if(sql.startsWith('SELECT i.invitation_id')){assert(sql.includes("f.state='accepted'"));assert(sql.includes('NOT EXISTS'));assert(sql.includes('i.expires_at>'));assert(sql.includes('i.created_at>=f.updated_at'));assert.equal(args[0],host.accountKey);return [blocked?[]:[{invitation_id:id}],[]];}
  throw Error('Unexpected query');
 }};
 const service=createSocialService(pool,{repository:{async load(){loads++;return {revision,entries:{}};}},validate:()=>({archive:{estate:{rooms:[{id:'room-1',floor:0,name:'房间'+revision}]}}})});
 for(let i=1;i<=3;i++)await service.visitPresence(guest,{id,sessionId:'test-session',sequence:i,active:true,roomId:'room-1'});
 assert.equal(loads,2);let start=trace.length;assert.equal((await service.visitors(host)).visitors.length,1);assert.equal(trace.slice(start).filter(sql=>sql.startsWith('SELECT i.invitation_id')).length,1);assert.equal(loads,2,'unchanged public host and guest saves stay cached');
 revision=2;await service.visitPresence(guest,{id,sessionId:'test-session',sequence:4,active:true,roomId:'room-1'});assert.equal(loads,4);assert.equal((await service.visitors(host)).visitors[0].roomName,'房间2');
 blocked=true;assert.equal((await service.visitors(host)).visitors.length,0);await assert.rejects(service.visitPresence(guest,{id,sessionId:'test-session',sequence:5,active:true,roomId:'room-1'}),e=>e.code==='FRIEND_REQUIRED');
});
