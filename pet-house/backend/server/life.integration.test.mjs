import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';

test('real MySQL life: atomic rewards, all nine activities, privacy, restart and recovery', {skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'},async()=>{
 const suffix=randomBytes(8).toString('hex'),ids=['a','b','c'].map(x=>'life-qa-'+x+'-'+suffix),actors=[];
 let admissionTime=0;
 let selected=ids[0],now=Date.UTC(2026,10,7,4),app,base,sequence=0;
 const config={...await loadConfig(),lifeEnabled:true,roomAccessEnabled:true},learningFetcher=async()=>Response.json({currentChildId:selected,items:ids.map((id,i)=>({id,nickname:'生活测试'+i}))});
 const jpeg='data:image/jpeg;base64,'+(await readFile(new URL('../../source-connected/tests/fixtures/life.jpg',import.meta.url))).toString('base64');
 async function start(){app=await createAppServer(config,{roomClock:()=>now,learningFetcher,admissionClock:()=>admissionTime+=1000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
 async function call(actor,path,data){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(actor?{Authorization:'Bearer '+actor.accessToken}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
 const good=r=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);return r.body;};
 const state=a=>call(a,'/api/v1/life/state').then(good);
 async function envelope(a,action){const s=await state(a);return {requestId:now.toString(36)+'_life-qa-'+(++sequence),issuedAt:now,baseRevision:s.homeRevision,roomId:s.activeRoomId,action};}
 async function act(a,action){return good(await call(a,'/api/v1/life/action',await envelope(a,action)));}
 try{
  await start();assert.equal((await call(null,'/api/v1/life/state')).status,401);
  for(const id of ids){selected=id;const ticket=good(await call({accessToken:'a'.repeat(40)},'/api/v1/room-access/ticket',{})).ticket,a=good(await call(null,'/api/v1/room-access/redeem',{ticket}));actors.push(a);const map=new Map(),adapter={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},estate=createEstateStore({storageAdapter:adapter,storageKey:a.identity.accountKey,initialPoints:10000});assert.equal(estate.createRoom().ok,true);good({status:200,body:await app.repository.save(a.identity.accountKey,0,Object.fromEntries(map),{trustedAuthority:true})});}
  const [a,b,c]=actors,key=a.identity.accountKey;let s=await state(a);assert.equal(s.stars,undefined);assert.equal(s.state.stars,12);assert.equal(s.activeRoomId,'room-1');
  await act(a,{type:'accept-quest',id:'welcome'});const once=await envelope(a,{type:'claim-quest',id:'welcome'}),repeated=await Promise.all([0,1].map(()=>call(a,'/api/v1/life/action',once)));repeated.forEach(good);assert.equal(repeated.filter(x=>x.body.replayed).length,1);s=await state(a);assert.equal(s.state.stats.quests,1);
  const stars=s.state.stars;await act(a,{type:'claim-quest',id:'welcome'});assert.equal((await state(a)).state.stars,stars);
  assert.equal((await call(a,'/api/v1/life/action',{...once,action:{type:'plant',slot:0,crop:'carrot'}})).status,409);
  assert.equal((await call(a,'/api/v1/life/action',{...await envelope(a,{type:'craft',id:'cloud-table'}),account_key:b.identity.accountKey})).status,400);
  // New optional state migrates old records without resetting the actual account.
  await app.pool.execute("UPDATE room_life_accounts SET state=JSON_REMOVE(state,'$.adventures') WHERE account_key=?",[b.identity.accountKey]);assert.equal((await state(b)).state.adventures.pet.meals,0);
  // Unlock alternatives use server-owned activity, never a client-reported counter.
  assert.equal((await call(b,'/api/v1/life/action',await envelope(b,{type:'craft',id:'star-lamp',stats:{crafted:1}}))).status,400);
  await act(b,{type:'craft',id:'clover-planter'});await act(b,{type:'craft',id:'star-lamp'});assert.equal((await state(b)).state.story.completed.length,0);
  assert.equal((await call(b,'/api/v1/life/action',await envelope(b,{type:'craft',id:'candy-tree'}))).status,400);
  await act(b,{type:'plant',slot:0,crop:'carrot'});await act(b,{type:'water',slot:0});now+=120001;await act(b,{type:'harvest',slot:0});await act(b,{type:'cook',id:'cookies'});await act(b,{type:'craft',id:'candy-tree'});
  const directUnlock=await state(b);assert.equal(directUnlock.state.story.completed.length,0);assert.equal(directUnlock.state.stats.crafted,3);assert.equal(directUnlock.state.stats.cooked,1);assert(directUnlock.ownedFurniture.includes('candy-tree'));assert.equal(directUnlock.state.inventory.wood,2);
  s=await act(a,{type:'focus-challenge',id:'cozy'});assert.equal(s.state.adventures.focus,'cozy');assert.equal(s.challenges.find(x=>x.id==='cozy').complete,true);
  const creative=await envelope(a,{type:'claim-challenge',id:'cozy'}),claimed=await Promise.all([0,1].map(()=>call(a,'/api/v1/life/action',creative)));claimed.forEach(good);assert.equal(claimed.filter(x=>x.body.replayed).length,1);assert.equal(Object.keys((await state(a)).state.adventures.completed).length,1);
  await act(a,{type:'collect-stamp',id:'first-home'});await act(a,{type:'collect-stamp',id:'first-home'});assert.deepEqual((await state(a)).state.adventures.stamps,['first-home']);assert.deepEqual((await state(b)).state.adventures.completed,{});
  assert.equal((await call(a,'/api/v1/life/action',await envelope(a,{type:'claim-challenge',id:'space',roomArt:'space'}))).status,400);
  assert.equal((await call(a,'/api/v1/life/action',await envelope(a,{type:'feed-pet',id:'cookies'}))).status,400);
  const before=await state(a),homeBefore=await app.repository.load(key),save=app.repository.saveWithin;app.repository.saveWithin=async()=>{throw Object.assign(new Error('injected storage failure'),{status:500});};
  const rejected=await call(a,'/api/v1/life/action',await envelope(a,{type:'craft',id:'cloud-table'}));assert.equal(rejected.status,500,JSON.stringify(rejected.body));app.repository.saveWithin=save;
  assert.deepEqual((await state(a)).state,before.state);assert.deepEqual(await app.repository.load(key),homeBefore);
  await act(a,{type:'choose-job',id:'designer'});
  for(const id of ['clover-planter','cloud-table','reading-shelf'])await act(a,{type:'craft',id});
  s=await act(a,{type:'claim-set',id:'forest'});assert.equal(s.state.sets.length,1);assert.equal(s.state.stats.crafted,3);
  const house=await app.repository.load(key),map=new Map(Object.entries(house.entries)),estate=createEstateStore({storageAdapter:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},storageKey:key}),archive=estate.exportArchive().archive;
  assert(archive.estate.bank.owned.includes('cloud-table'));assert(archive.estate.rooms[1].scene.stored.includes('cloud-table'));assert.equal(archive.estate.bank.balance,9400,'life rewards must not consume or mint learning points');
  s=await act(a,{type:'claim-career',id:'designer-craft'});assert(s.state.outfits.includes('designer'));await act(a,{type:'wear-career',id:'designer'});
  assert.equal((await call(a,'/api/v1/life/action',await envelope(a,{type:'photo-save',title:'拒绝SVG',image:'data:image/svg+xml,<svg/>'}))).status,400);
  s=await act(a,{type:'photo-save',title:'新家照片',image:jpeg});const photo=s.photos[0];assert.equal((await state(b)).photos.length,0);
  const code=good(await call(a,'/api/v1/designs/publish',{roomId:s.activeRoomId})).code;
  s=await act(a,{type:'publish',photoId:photo.id,title:'森林小屋',theme:'forest'});let g=good(await call(a,'/api/v1/life/gallery'));assert.equal(g.posts[0].designCode,code);assert.equal(g.total,1);assert.equal(good(await call(b,'/api/v1/life/gallery')).total,0);
  const [left,right]=[key,b.identity.accountKey].sort();await app.pool.execute("INSERT INTO social_friendships(user_a,user_b,requester,state) VALUES(?,?,?,'accepted')",[left,right,key]);
  g=good(await call(b,'/api/v1/life/gallery'));assert.equal(g.total,1);const post=g.posts[0].id;
  await act(b,{type:'reaction',id:post,reaction:'like'});await act(b,{type:'reaction',id:post,reaction:'cozy'});await act(b,{type:'favorite',id:post,enabled:true});g=good(await call(b,'/api/v1/life/gallery?favorites=1'));assert.equal(g.total,1);assert.equal(Number(g.posts[0].reactions),1);
  assert.equal((await call(c,'/api/v1/life/action',await envelope(c,{type:'reaction',id:post,reaction:'like'}))).status,404);
  await app.pool.execute('INSERT INTO social_blocks(owner_key,peer_key) VALUES(?,?)',[key,b.identity.accountKey]);assert.equal(good(await call(b,'/api/v1/life/gallery')).total,0);await app.pool.execute('DELETE FROM social_blocks WHERE owner_key=? AND peer_key=?',[key,b.identity.accountKey]);
  await act(a,{type:'choose-job',id:'gardener'});for(const [slot,crop]of ['carrot','berry','mint'].entries()){await act(a,{type:'plant',slot,crop});await act(a,{type:'water',slot});}
  const planted=(await state(a)).state;assert.equal((await call(a,'/api/v1/life/action',await envelope(a,{type:'harvest',slot:0}))).status,400);assert.deepEqual((await state(a)).state,planted);
  now+=120001;for(let slot=0;slot<3;slot++)await act(a,{type:'harvest',slot});await act(a,{type:'claim-career',id:'gardener-water'});await act(a,{type:'choose-job',id:'chef'});
  for(const [i,id]of ['cookies','juice','tea'].entries()){await act(a,{type:'cook',id});await act(a,{type:'deliver',id:'order-'+i});}s=await act(a,{type:'claim-career',id:'chef-order'});assert(s.state.outfits.includes('chef'));
  await act(a,{type:'plant',slot:1,crop:'carrot'});await act(a,{type:'water',slot:1});now+=120001;await act(a,{type:'harvest',slot:1});await act(a,{type:'cook',id:'cookies'});
  const meal=await envelope(a,{type:'feed-pet',id:'cookies'}),mealStars=(await state(a)).state.stars,meals=await Promise.all([0,1].map(()=>call(a,'/api/v1/life/action',meal)));meals.forEach(good);assert.equal(meals.filter(x=>x.body.replayed).length,1);s=await state(a);assert.equal(s.state.adventures.pet.meals,1);assert.equal(s.state.inventory.cookies,0);assert.equal(s.state.stars,mealStars);assert.equal((await state(b)).state.adventures.pet.meals,0);
  assert.equal((await call(a,'/api/v1/life/action',await envelope(a,{type:'feed-pet',id:'cookies'}))).status,400);await act(a,{type:'collect-stamp',id:'first-share'});await act(a,{type:'collect-stamp',id:'three-recipes'});s=await act(a,{type:'claim-challenge',id:'tea'});assert.equal(s.state.adventures.completed.tea.roomId,'room-1');
  await act(a,{type:'story-next',choice:'先布置阅读角'});await act(a,{type:'story-next'});await act(a,{type:'story-next'});
  await act(a,{type:'story-next',choice:'甜甜的草莓'});await act(a,{type:'story-next'});await act(a,{type:'story-next'});for(let i=0;i<3;i++)s=await act(a,{type:'story-next'});assert.equal(s.state.story.completed.length,3);
  await act(a,{type:'cook',id:'cookies'});const race=[await envelope(a,{type:'feed-pet',id:'cookies'}),await envelope(a,{type:'feed-pet',id:'cookies'})];const racing=await Promise.all(race.map(input=>call(a,'/api/v1/life/action',input)));assert.deepEqual(racing.map(r=>r.status).sort(),[200,400]);s=await state(a);assert.equal(s.state.adventures.pet.meals,2);assert.equal(s.state.inventory.cookies,0);
  for(const type of ['claim-challenge','collect-stamp'])assert.equal((await call(a,'/api/v1/life/action',await envelope(a,{type,id:'unknown'}))).status,400);
  const progress=s.state,photoId=photo.id;await app.close();await start();assert.deepEqual((await state(a)).state,progress);assert.equal((await state(a)).photos[0].id,photoId);
  // Restoring decoration must recover earned items without issuing materials again.
  const current=await app.repository.load(key);assert.equal((await app.repository.save(key,current.revision,homeBefore.entries,{trustedAuthority:true})).ok,true);s=await act(a,{type:'restore-rewards'});assert.deepEqual(s.state,progress);assert(s.ownedFurniture.includes('cloud-table'));
  const [views]=await app.pool.execute('SELECT * FROM `新手_14_小屋生活进度` WHERE `账号编号`=?',[key]);assert.equal(views[0]['当前职业'],'邻里小厨师');
  const [adventureView]=await app.pool.execute('SELECT * FROM `新手_16_创作与伙伴纪念` WHERE `账号编号`=?',[key]);assert.equal(adventureView[0]['已完成创作数'],2);assert.equal(adventureView[0]['分享料理次数'],2);assert.equal(adventureView[0]['已收藏印章数'],3);
  const floorHome=await app.repository.load(key),floorMap=new Map(Object.entries(floorHome.entries)),floors=createEstateStore({storageAdapter:{getItem:k=>floorMap.get(k)??null,setItem:(k,v)=>floorMap.set(k,v),removeItem:k=>floorMap.delete(k)},storageKey:key});assert(floors.selectRoom('room-2').ok);assert((await app.repository.save(key,floorHome.revision,Object.fromEntries(floorMap))).ok);const onSecondFloor=await state(a);assert.equal(onSecondFloor.activeRoomId,'room-2');assert.equal(onSecondFloor.challenges.find(x=>x.id==='forest').checks.find(x=>x.key==='photo').done,false);assert.equal(onSecondFloor.state.adventures.completed.cozy.roomId,'room-1');
  console.log(JSON.stringify({creativeRewardsAndStamps:true,realMealInventory:true,concurrentMealSafe:true,perFloorPhotoEvidence:true,readableAdventureView:true,lifeNineActivities:true,atomicRollback:true,exactlyOnce:true,twoFloorInventory:true,learningPointsUnchanged:true,friendsOnlyGallery:true,realDesignCode:true,restartPersistence:true,recoverWithoutDuplicateRewards:true}));
 }finally{if(app){for(const a of actors){const key=a.identity.accountKey;await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[key]);await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[key]);await app.pool.execute('DELETE FROM social_accounts WHERE account_key=?',[key]);}await app.close();}}
});
