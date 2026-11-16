import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {createProfile} from '../../source-connected/profile.mjs';
import {createEconomy} from '../../source-connected/economy.mjs';
import {createCompanionStore} from '../../source-connected/companion-state.mjs';
test('real MySQL automatic identities without login, consent, private chat, read-only visits and sessions',
 {skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'?'需要显式设置 PET_ROOM_SOCIAL_INTEGRATION=1':false},async()=>{
const config={...await loadConfig(),socialEnabled:true,roomAccessEnabled:false};
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
 const hostRoomEconomy=createEconomy({storageAdapter:estate.storageForRoom('room-1'),storageKey:key+'-account-v1'});
 for(const sku of ['reading-shelf','star-lamp','rocket-toy','moon-ornament'])assert.equal(hostRoomEconomy.purchase(sku).ok,true);
 assert.equal(hostRoomEconomy.storeFurniture('moon-ornament').ok,true);
 createProfile({storageAdapter:adapter,storageKey:key+'-profile-v1'}).setName('不应泄露的私人资料');
 estate.storageForRoom('room-1').setItem(key+'-private-extra','不应泄露的备份内容');estate.saveRoomWorld('room-1',{name:'不应泄露的历史方案'});
 assert.equal((await call(a,'/api/v1/save?namespace='+key,{baseRevision:0,entries:Object.fromEntries(map)},'PUT')).status,409,'browser cannot create its own funded bank');
 // Trusted fixture setup only: the HTTP client cannot mint these test assets.
 assert.equal((await app.repository.save(key,0,Object.fromEntries(map),{trustedAuthority:true})).ok,true);
 good(await call(a,'/api/v1/save?namespace='+key,{baseRevision:1,entries:Object.fromEntries(map)},'PUT'));
 assert.equal((await call(b,'/api/v1/save?namespace='+key)).status,403);
 assert.equal((await call(b,'/api/v1/save?namespace='+key,{baseRevision:1,entries:{}},'PUT')).status,403);
 const before=good(await call(a,'/api/v1/save?namespace='+key));
 const invitation=good(await social(a,'invite',{peerId:bid})).id;
 const heartbeat={id:invitation,sessionId:'real-test-guest-session',sequence:1,active:true,roomId:'room-1'};
 assert.equal((await social(b,'visit-presence',heartbeat)).status,403);assert.equal(good(await social(a,'visitors')).visitors.length,0);
 assert.equal((await social(b,'visit?id='+invitation)).status,403);assert.equal((await social(c,'invitation',{id:invitation,action:'accept'})).status,403);
 good(await social(b,'invitation',{id:invitation,action:'accept'}));const visit=good(await social(b,'visit?id='+invitation));assert.equal(visit.floors.length,2);
 assert.equal(visit.floors[0].scene.layout,null,'legacy automatic placement is retained');assert.deepEqual(visit.floors[0].scene.displayedItems,['reading-shelf','star-lamp','rocket-toy']);
 assert(!visit.floors[0].scene.displayedItems.includes('moon-ornament'),'hidden warehouse item is not shared');assert.equal(visit.floors[0].scene.owned,undefined);assert.equal(visit.bank,undefined);
 const publicHome=JSON.stringify(visit);for(const secret of ['7777','不应泄露','password','claims','checkpoints','accountKey'])assert.equal(publicHome.includes(secret),false,secret+' leaked into visit');
 assert.equal((await social(a,'visit?id='+invitation)).status,403);
 assert.equal((await social(c,'visit-presence',heartbeat)).status,403);assert.equal((await social(a,'visit-presence',heartbeat)).status,403);
 assert.equal((await social(b,'visit-presence',{...heartbeat,roomId:'room-99'})).status,400);
 good(await social(b,'visit-presence',heartbeat));let present=good(await social(a,'visitors')).visitors;assert.equal(present.length,1);assert.equal(present[0].publicId,bid);assert.equal(present[0].roomId,'room-1');assert.equal(JSON.stringify(present).includes('accountKey'),false);assert.equal(good(await social(c,'visitors')).visitors.length,0);
 // Trusted isolated guest fixture: the public animal must come from the guest save.
 const guestKey=b.identity.accountKey,guestMap=new Map(),guestAdapter={getItem:key=>guestMap.get(key)??null,setItem:(key,value)=>guestMap.set(key,value),removeItem:key=>guestMap.delete(key)},guestEstate=createEstateStore({storageAdapter:guestAdapter,storageKey:guestKey,initialPoints:1000}),guestStorage=guestEstate.storageForRoom('room-1');
 assert.equal(createEconomy({storageAdapter:guestStorage,storageKey:guestKey+'-account-v1'}).purchasePet('cloud-bunny').ok,true);
 assert.equal(createCompanionStore({adapter:guestStorage,key:guestKey+'-companion-v1'}).update({petName:'来访兔兔',outfit:{hat:'star',scarf:'mint',backpack:'school'}}).ok,true);
 assert.equal((await app.repository.save(guestKey,0,Object.fromEntries(guestMap),{trustedAuthority:true})).ok,true);
 const joined=good(await social(b,'visit-presence',heartbeat));assert.deepEqual(joined.visitors[0].pet,{sku:'cloud-bunny',petName:'来访兔兔',outfit:{hat:'star',scarf:'mint',backpack:'school'},growthStage:'baby'});
 const hostBeat={sessionId:'real-test-owner-session',sequence:1,active:true,roomId:'room-1',busy:false,position:{x:0,z:2}};good(await social(a,'host-presence',hostBeat));
 const act=(action,requestId)=>social(b,'visit-action',{id:invitation,sessionId:heartbeat.sessionId,generation:joined.generation,requestId,roomId:'room-1',action});
 const sitting=good(await act({type:'furniture',targetId:'sofa'},'real-seat-1'));assert.equal(sitting.visitors[0].action.kind,'seat');assert.equal(sitting.visitors[0].action.slotId,'main');
 assert.equal(good(await act({type:'furniture',targetId:'sofa'},'real-seat-1')).visitors[0].action.id,sitting.visitors[0].action.id);
 assert.equal((await social(a,'host-presence',{...hostBeat,sequence:2,action:{type:'furniture',targetId:'sofa'}})).status,409);
 good(await act({type:'cancel',actionId:sitting.visitors[0].action.id},'real-cancel-1'));
 const hostSeated=good(await social(a,'host-presence',{...hostBeat,sequence:3,action:{type:'furniture',targetId:'sofa'}}));assert.equal(hostSeated.owner.seatId,'sofa');
 assert.equal((await act({type:'furniture',targetId:'sofa'},'real-seat-2')).status,409);
 good(await social(a,'host-presence',{...hostBeat,sequence:4,action:{type:'cancel',actionId:hostSeated.owner.action.id}}));
 const greeting=good(await act({type:'greet'},'real-greet-1'));assert.equal(greeting.owner.action.id,greeting.visitors[0].action.id);assert.equal(greeting.owner.action.actorPublicId,bid);
 const ended=good(await social(a,'host-presence',{...hostBeat,sequence:5,busy:true}));assert.equal(ended.owner.action,null);assert.equal(ended.visitors[0].action,null);
 good(await social(a,'host-presence',{...hostBeat,sequence:6,active:false}));
 const guestPublic=JSON.stringify(good(await social(a,'visitors')));for(const secret of ['learningSeconds','learningEvents','balance','claims','accountKey','sessionId'])assert.equal(guestPublic.includes('"'+secret+'"'),false);
 good(await social(b,'visit-presence',{...heartbeat,sequence:2,roomId:'room-2'}));assert.equal(good(await social(a,'visitors')).visitors[0].roomId,'room-2');
 good(await social(b,'visit-presence',{...heartbeat,sequence:4,active:false}));good(await social(b,'visit-presence',{...heartbeat,sequence:3}));assert.equal(good(await social(a,'visitors')).visitors.length,0,'stale heartbeat cannot revive a departed guest');
 good(await social(b,'visit-presence',{...heartbeat,sequence:5}));
 assert.deepEqual(good(await call(a,'/api/v1/save?namespace='+key)),before);
 good(await social(a,'invitation',{id:invitation,action:'revoke'}));assert.equal((await social(b,'invitation',{id:invitation,action:'accept'})).status,409);assert.equal((await social(b,'visit?id='+invitation)).status,403);
 assert.equal(good(await social(a,'visitors')).visitors.length,0);assert.equal((await social(b,'visit-presence',{...heartbeat,sequence:6})).status,403);
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
