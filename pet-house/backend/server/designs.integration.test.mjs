import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {createDesignService} from './design-service.mjs';
import {createValidator} from './validation.mjs';

test('real MySQL four digit designs: authenticated publish, stable per-floor codes, revisions, persistence and privacy',{skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'},async()=>{
 const config={...await loadConfig(),socialEnabled:true,designCodesEnabled:true},app=await createAppServer(config),actors=[];let base;
 async function call(actor,path,data,method=data===undefined?'GET':'POST',headers={}){const res=await fetch(base+path,{method,headers:{Cookie:actor?.cookie||'',...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')};}
 const good=value=>{assert.equal(value.status,200,JSON.stringify(value.body));return value.body;};
 try{await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
  for(let i=0;i<2;i++){const res=await call(null,'/api/v1/social/enter',{}),identity=good(res).identity;actors.push({...identity,cookie:res.cookie.split(';')[0]});const map=new Map(),adapter={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)},estate=createEstateStore({storageAdapter:adapter,storageKey:identity.accountKey,initialPoints:5000});assert.equal(estate.createRoom().ok,true);const out=estate.exportArchive().archive;out.estate.rooms[0].extras={[identity.accountKey+'-private']:'secret'};assert.equal(estate.importArchive(out).ok,true);good(await call(actors[i],'/api/v1/save?namespace='+identity.accountKey,{baseRevision:0,entries:Object.fromEntries(map)},'PUT'));}
  const [a,b]=actors;assert.equal((await call(null,'/api/v1/designs/0000')).status,401);
  assert.equal((await call(a,'/api/v1/designs/publish',{roomId:'room-3'})).status,404);
  assert.equal((await call(a,'/api/v1/designs/publish',{roomId:'room-1',owner_key:b.accountKey})).status,400);
  assert.equal((await call(a,'/api/v1/designs/publish',{roomId:'room-1'},'POST',{Origin:'https://bad.example'})).status,403);
  const published=good(await call(a,'/api/v1/designs/publish',{roomId:'room-1'}));assert.match(published.code,/^\d{4}$/);
  const second=good(await call(a,'/api/v1/designs/publish',{roomId:'room-2'}));assert.notEqual(second.code,published.code);
  const concurrent=await Promise.all([a,a,b].map(actor=>call(actor,'/api/v1/designs/publish',{roomId:'room-1'})));for(const res of concurrent)good(res);assert.equal(concurrent[0].body.code,published.code);assert.equal(concurrent[1].body.code,published.code);assert.notEqual(concurrent[2].body.code,published.code);
  const found=good(await call(b,'/api/v1/designs/'+published.code));assert.equal(found.revision,3);assert.equal(found.owner_key,undefined);assert.equal(found.accountKey,undefined);assert.deepEqual(found.snapshot.extras,{});assert.deepEqual(found.snapshot.companion.photos,[]);assert.equal(JSON.stringify(found).includes('secret'),false);
  const service=await createDesignService(app.pool,{repository:app.repository,validate:await createValidator(config.sourceRoot),sourceRoot:config.sourceRoot,chooseCode:()=> '0000'});const leading=await service.publish(b,'room-2');assert.equal(leading.code,'0000');assert.equal((await service.find(a,'0000')).code,'0000');assert.equal((await call(b,'/api/v1/designs/000')).status,400);
  const [rows]=await app.pool.execute('SELECT design_code FROM social_room_designs WHERE owner_key=?',[a.accountKey]);assert.equal(rows.length,2);
  console.log(JSON.stringify({fourDigitDesigns:true,stableCodes:true,separateFloorCodes:true,concurrentSafe:true,leadingZeroPreserved:true,privateDataExcluded:true}));
 }finally{for(const actor of actors){await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[actor.accountKey]);await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[actor.accountKey]);await app.pool.execute('DELETE FROM social_accounts WHERE account_key=?',[actor.accountKey]);}await app.close();}
});
