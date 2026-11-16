import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';

test('real MySQL authority rejects forged assets and commits concurrent commands exactly once',{skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'},async()=>{
 const config={...await loadConfig(),roomAccessEnabled:true,lifeEnabled:true},child='economy-qa-'+randomBytes(8).toString('hex');let app,actor,base,seq=0,admission=0;
 const learningFetcher=async url=>Response.json(url.endsWith('/economy/wallet')?{childId:child,ledger:[]}:{currentChildId:child,items:[{id:child,nickname:'资产隔离测试'}]});
 async function request(path,data,{token=actor?.accessToken,method=data===undefined?'GET':'POST'}={}){const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()};}
 const good=x=>{assert.equal(x.status,200,JSON.stringify(x.body));return x.body;};
 const envelope=async action=>{const issuedAt=Date.now();return {issuedAt,requestId:issuedAt.toString(36)+'_'+(++seq),baseRevision:(await app.repository.load(actor.identity.accountKey)).revision,roomId:'room-1',action};};
 const archive=home=>JSON.parse(home.entries[actor.identity.accountKey+'-estate-v1']);
 try{
  app=await createAppServer(config,{learningFetcher,admissionClock:()=>admission+=1000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
  const ticket=good(await request('/api/v1/room-access/ticket',{}, {token:'a'.repeat(40)})).ticket;actor=good(await request('/api/v1/room-access/redeem',{ticket}));const key=actor.identity.accountKey,map=new Map();const estate=createEstateStore({storageKey:key,initialPoints:3000,storageAdapter:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});const backup=estate.exportArchive().archive;await app.repository.save(key,0,Object.fromEntries(map),{trustedAuthority:true});
  const forged=structuredClone(Object.fromEntries(map)),bad=JSON.parse(forged[key+'-estate-v1']);bad.bank.balance=999999;forged[key+'-estate-v1']=JSON.stringify(bad);const rejected=await request('/api/v1/save?namespace='+key,{baseRevision:1,entries:forged},{method:'PUT'});assert.equal(rejected.status,409);assert.equal(rejected.body.code,'ECONOMY_AUTHORITY_REQUIRED');assert.equal(archive(await app.repository.load(key)).bank.balance,3000);
  const command=await envelope({type:'purchase',sku:'clover-planter'}),responses=await Promise.all([0,1].map(()=>request('/api/v1/economy/action',command)));responses.forEach(good);assert.equal(responses.filter(x=>x.body.replayed).length,1);const purchased=await app.repository.load(key);assert.equal(archive(purchased).bank.balance,2880);assert.equal(archive(purchased).bank.owned.filter(x=>x==='clover-planter').length,1);
  assert.equal((await request('/api/v1/economy/action',{...command,action:{type:'purchase',sku:'cloud-table'}})).status,409);
  const checked=good(await request('/api/v1/economy/action',await envelope({type:'check-in'})));assert(archive(checked.home).bank.balance>2880);const beforeRestore=archive(checked.home).bank;
  const restored=good(await request('/api/v1/economy/action',await envelope({type:'restore-decoration',archive:backup})));assert.deepEqual(archive(restored.home).bank,beforeRestore);const visit=good(await request('/api/v1/economy/action',await envelope({type:'visit'})));assert(archive(visit.home).companion.lastVisit);
  assert.equal((await request('/api/v1/economy/action',await envelope({type:'claim-learning',eventId:'client-forged'}))).status,409);
  const [wallet]=await app.pool.execute('SELECT balance_points FROM wallet_accounts WHERE account_key=?',[key]);assert.equal(wallet[0].balance_points,archive(await app.repository.load(key)).bank.balance);
 }finally{if(actor){const key=actor.identity.accountKey;await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[key]);await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[key]);await app.pool.execute('DELETE FROM social_accounts WHERE account_key=?',[key]);}await app?.close();}
});
