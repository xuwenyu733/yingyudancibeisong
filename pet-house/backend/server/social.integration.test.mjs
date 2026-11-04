import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {createProfile} from '../../source-connected/profile.mjs';
test('real MySQL automatic identities without login, consent, private chat, read-only visits and sessions',
 {skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'?'需要显式设置 PET_ROOM_SOCIAL_INTEGRATION=1':false},async()=>{
const config={...await loadConfig(),socialEnabled:true};
let app=await createAppServer(config),base;const actors=[];
async function listen(){await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;}
async function call(actor,path,data,method=data===undefined?'GET':'POST',extra={}){const response=await fetch(base+path,{method,headers:{...(actor?.cookie?{Cookie:actor.cookie}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(data!==undefined?{body:JSON.stringify(data)}:{})});let body;try{body=await response.json();}catch{body={};}return{status:response.status,body,cookie:response.headers.get('set-cookie')};}
const good=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const social=(actor,path,data)=>call(actor,'/api/v1/social/'+path,data);
const report={};
try{
 await listen();
 for(let i=0;i<3;i++){const result=await social(null,'enter',{});const value=good(result);assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/SameSite=Strict/);actors.push({identity:value.identity,cookie:result.cookie.split(';')[0]});}
 const [a,b,c]=actors,aid=a.identity.publicId,bid=b.identity.publicId;assert.equal(new Set(actors.map(actor=>actor.identity.publicId)).size,3);
 assert.equal((await social(null,'me')).status,401);assert.equal((await social(null,'login',{publicId:bid,password:'not-used'})).status,410);assert.equal((await social(null,'register',{})).status,410);
 assert.equal((await call(a,'/api/v1/social/request',{peerId:bid},'POST',{Origin:'https://untrusted.example'})).status,403);
 good(await social(a,'request',{peerId:bid}));assert.equal((await social(a,'respond',{peerId:bid,accept:true})).status,409);
 assert.equal((await social(c,'respond',{peerId:aid,accept:true})).status,409);
 assert.equal((await social(a,'messages',{peerId:bid,text:'尚未成为好友',clientId:'before-friends'})).status,403);
 good(await social(b,'respond',{peerId:aid,accept:true}));assert.equal(good(await social(a,'overview')).friends[0].publicId,bid);assert.equal(good(await social(a,'search?id='+bid)).user.accountKey,undefined);
 let first;
 for(let i=0;i<12;i++){const sent=good(await social(a,'messages',{peerId:bid,text:i===0?'<img src=x onerror="window.attack=true">':'测试消息 '+i,clientId:'api-test-'+i}));first||=sent.message.id;}
 assert.equal(good(await social(a,'messages',{peerId:bid,text:'<img src=x onerror="window.attack=true">',clientId:'api-test-0'})).message.id,first);
 assert.equal((await social(a,'messages',{peerId:bid,text:'不同内容',clientId:'api-test-0'})).status,409);
 const history=good(await social(b,'messages?peerId='+aid)).messages;assert.equal(history.length,12);for(let i=1;i<history.length;i++)assert(BigInt(history[i].id)>BigInt(history[i-1].id));
 assert.equal((await social(c,'messages?peerId='+aid)).status,403);
 const map=new Map(),adapter={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)},key=a.identity.accountKey;
 const estate=createEstateStore({storageAdapter:adapter,storageKey:key,initialPoints:7777});assert.equal(estate.createRoom({name:'主人二楼'}).ok,true);
 createProfile({storageAdapter:adapter,storageKey:key+'-profile-v1'}).setName('不应泄露的私人资料');
 estate.storageForRoom('room-1').setItem(key+'-private-extra','不应泄露的备份内容');estate.saveRoomWorld('room-1',{name:'不应泄露的历史方案'});
 good(await call(a,'/api/v1/save?namespace='+key,{baseRevision:0,entries:Object.fromEntries(map)},'PUT'));
 assert.equal((await call(b,'/api/v1/save?namespace='+key)).status,403);
 assert.equal((await call(b,'/api/v1/save?namespace='+key,{baseRevision:1,entries:{}},'PUT')).status,403);
 const before=good(await call(a,'/api/v1/save?namespace='+key));
 const invitation=good(await social(a,'invite',{peerId:bid})).id;
 assert.equal((await social(b,'visit?id='+invitation)).status,403);assert.equal((await social(c,'invitation',{id:invitation,action:'accept'})).status,403);
 good(await social(b,'invitation',{id:invitation,action:'accept'}));const visit=good(await social(b,'visit?id='+invitation));assert.equal(visit.floors.length,2);
 const publicHome=JSON.stringify(visit);for(const secret of ['7777','不应泄露','password','claims','checkpoints','accountKey'])assert.equal(publicHome.includes(secret),false,secret+' leaked into visit');
 assert.equal((await social(a,'visit?id='+invitation)).status,403);
 assert.deepEqual(good(await call(a,'/api/v1/save?namespace='+key)),before);
 good(await social(a,'invitation',{id:invitation,action:'revoke'}));assert.equal((await social(b,'invitation',{id:invitation,action:'accept'})).status,409);assert.equal((await social(b,'visit?id='+invitation)).status,403);
 const removedInvite=good(await social(a,'invite',{peerId:bid})).id;good(await social(b,'invitation',{id:removedInvite,action:'accept'}));good(await social(a,'remove',{peerId:bid}));
 good(await social(a,'request',{peerId:bid}));good(await social(b,'respond',{peerId:aid,accept:true}));assert.equal((await social(b,'visit?id='+removedInvite)).status,403);assert.equal((await social(b,'invitation',{id:removedInvite,action:'accept'})).status,403);
 const second=good(await social(a,'invite',{peerId:bid})).id;good(await social(b,'invitation',{id:second,action:'accept'}));good(await social(b,'block',{peerId:aid,block:true}));
 assert.equal((await social(b,'visit?id='+second)).status,403);assert.equal((await social(a,'messages',{peerId:bid,text:'屏蔽后不允许',clientId:'blocked'})).status,403);
 good(await social(b,'block',{peerId:aid,block:false}));good(await social(a,'request',{peerId:bid}));good(await social(b,'respond',{peerId:aid,accept:true}));assert.equal((await social(b,'visit?id='+second)).status,403);
 const [racingInvite,racingBlock]=await Promise.all([social(a,'invite',{peerId:bid}),social(b,'block',{peerId:aid,block:true})]);good(racingBlock);assert([200,403].includes(racingInvite.status));
 const [activeInvites]=await app.pool.execute("SELECT COUNT(*) n FROM social_invitations WHERE ((host_key=? AND guest_key=?) OR (host_key=? AND guest_key=?)) AND state IN ('pending','accepted')",[a.identity.accountKey,b.identity.accountKey,b.identity.accountKey,a.identity.accountKey]);assert.equal(Number(activeInvites[0].n),0);assert.equal(good(await social(a,'overview')).invitations.length,0);
 assert.equal((await call(a,'/api/v1/schema',undefined,'GET',{'X-Forwarded-For':'203.0.113.10'})).status,403);
 await app.close();app=await createAppServer(config);await listen();assert.equal(good(await social(a,'me')).identity.publicId,aid);
 const reentered=good(await social(b,'enter',{}));assert.equal(reentered.identity.accountKey,b.identity.accountKey);assert.equal(reentered.created,false);
 const [identityRows]=await app.pool.execute('SELECT password_hash,password_salt FROM social_accounts WHERE account_key=?',[a.identity.accountKey]);assert.equal(identityRows[0].password_hash,null);assert.equal(identityRows[0].password_salt,null);
 Object.assign(report,{ok:true,uniqueIds:true,friendConsent:true,privateChatAndRetry:true,numericMessageOrdering:true,unauthorizedAccessRejected:true,readOnlyVisitNoPrivateData:true,revocationAndBlocking:true,loginAfterRestart:true,originalHomeUnchanged:true});
}finally{
 for(const actor of actors){const key=actor.identity.accountKey;assert.match(key,/^user-online-[a-f0-9]{24}$/);await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[key]);await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[key]);await app.pool.execute('DELETE FROM social_accounts WHERE account_key=?',[key]);}
 await app.close();
}
});
