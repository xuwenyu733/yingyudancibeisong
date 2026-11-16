import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requestWindow} from './request-window.mjs';
const fail=(message,code='ECONOMY_REJECTED',status=409)=>Object.assign(new Error(message),{status,code});
const hash=x=>createHash('sha256').update(x).digest('hex');
const parse=x=>typeof x==='string'?JSON.parse(x):x;
class BeijingDate extends Date {getFullYear(){return new Date(this.getTime()+8*3600000).getUTCFullYear();}getMonth(){return new Date(this.getTime()+8*3600000).getUTCMonth();}getDate(){return new Date(this.getTime()+8*3600000).getUTCDate();}}
const schemas={visit:[],purchase:['sku'],'purchase-pet':['sku'],'select-pet':['sku'],expand:[],'set-room-level':['level'],'create-room':['name','template'],'apply-design':['code','buyMissing','expectedFingerprint'],'check-in':[],'makeup-check-in':[],'redeem-secret':['code'],'claim-learning':['eventId'],'restore-decoration':['archive']};
export async function createEconomicAuthority(pool,{repository,validate,sourceRoot,clock=Date.now,learningApi='http://127.0.0.1:3010/api',learningFetcher=fetch}={}){
 const load=x=>import(pathToFileURL(resolve(sourceRoot,x)).href);
 const [{createEstateStore},{createEconomy,furnitureProduct},{createProfile,previousDay},{createCompanionStore},{giftSku}]=await Promise.all(['estate-state.mjs','economy.mjs','profile.mjs','companion-state.mjs','gift-catalog.mjs'].map(load));
 const {snapshotRoom,applyRoomSnapshot}=await load('room-world.mjs');
 const valueNow=()=>Number(clock()),today=now=>new Date(now+8*3600000).toISOString().slice(0,10);
 const success=result=>{if(!result?.ok)throw fail(result?.message||'这次操作未完成',result?.code);return result;};
 function context(account,entries,roomId,now){const map=entries instanceof Map?entries:new Map(Object.entries(entries||{})),adapter={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},estate=createEstateStore({storageAdapter:adapter,storageKey:account,initialPoints:0});const room=roomId||estate.getState().activeRoomId,storage=estate.storageForRoom(room);return {map,estate,room,economy:createEconomy({storageAdapter:storage,storageKey:account+'-account-v1'}),profile:createProfile({storageAdapter:storage,storageKey:account+'-profile-v1',now:()=>new Date(now)}),companion:createCompanionStore({adapter:storage,key:account+'-companion-v1',now:()=>new BeijingDate(now)})};}
 function settle(ctx,now){success(ctx.profile.ensureAcquisitionBaseline());success(ctx.profile.evaluate(ctx.economy.getState(),today(now)));success(ctx.profile.settlePending(input=>ctx.economy.reward(input)));for(const reward of ctx.companion.getState().rewards){const sku=giftSku(reward);if(sku)success(ctx.economy.grantGift(sku,'gift:'+reward.id));}}
 async function act(account,input){
  const now=valueNow();if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(x=>!['requestId','baseRevision','roomId','issuedAt','action'].includes(x))||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)throw fail('操作格式无效','INVALID_REQUEST',400);
  requestWindow(input,now);const a=input.action;if(!a||Object.getPrototypeOf(a)!==Object.prototype||!Object.hasOwn(schemas,a.type)||Object.keys(a).some(k=>k!=='type'&&!schemas[a.type].includes(k)))throw fail('不支持此资产操作','INVALID_REQUEST',400);
  if(input.roomId!==undefined&&!/^room-[1-6]$/.test(input.roomId))throw fail('楼层编号无效');
  const id='economy:'+input.requestId,digest=hash(JSON.stringify({action:a,roomId:input.roomId||null,issuedAt:input.issuedAt})),c=await pool.getConnection();
  try{await c.beginTransaction();const [owners]=await c.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[account]);if(!owners.length)throw fail('小屋身份已失效','UNAUTHORIZED',401);
   const [seen]=await c.execute('SELECT body_hash,response FROM room_life_requests WHERE account_key=? AND request_id=?',[account,id]);
   if(seen.length){if(seen[0].body_hash!==digest)throw fail('操作编号已经用于其他内容','REQUEST_ID_REUSED');const home=await repository.load(account,{connection:c});await c.commit();return {...parse(seen[0].response).result,replayed:true,home};}
   const home=await repository.load(account,{connection:c});if(home.revision!==input.baseRevision)throw fail('另一窗口已经更新小屋，请刷新后重新确认','SAVE_CONFLICT');
   const ctx=context(account,home.entries,input.roomId,now),{estate,economy,profile,companion,room}=ctx;let result;
   switch(a.type){
    case 'visit':result=success(companion.visit());break;
    case 'purchase':result=success(economy.purchase(a.sku,{requestId:input.requestId}));if(furnitureProduct(a.sku)?.category!=='flooring'){success(economy.storeFurniture(a.sku));result.stored=true;result.message+='，已放入仓库';}break;
    case 'purchase-pet':result=success(economy.purchasePet(a.sku,{requestId:input.requestId}));break;
    case 'select-pet':result=success(economy.selectPet(a.sku));break;
    case 'expand':result=success(economy.expand({requestId:input.requestId}));break;
    case 'set-room-level':result=success(economy.setRoomLevel(a.level,{requestId:input.requestId}));break;
    case 'create-room':result=success(estate.createRoom({...(a.name===undefined?{}:{name:a.name}),...(a.template===undefined?{}:{template:a.template}),requestId:input.requestId}));if(result.roomId)success(estate.selectRoom(result.roomId));break;
    case 'apply-design':{if(!/^\d{4}$/.test(a.code||'')||typeof a.buyMissing!=='boolean')throw fail('请重新查询装修码并确认购买');const [rows]=await c.execute('SELECT snapshot_json FROM social_room_designs WHERE design_code=?',[a.code]);if(!rows.length)throw fail('装修码不存在');result=success(estate.applyRoomDesign(room,{snapshot:parse(rows[0].snapshot_json),buyMissing:a.buyMissing,requestId:input.requestId,...a.expectedFingerprint===undefined?{}:{expectedFingerprint:a.expectedFingerprint}}));break;}
    case 'check-in':result=success(profile.checkIn(today(now)));success(companion.checkin(profile.getState().streakDays));break;
    case 'makeup-check-in':{const date=today(now),target=previousDay(date);result=success(profile.makeUp(target,date));if(!result.unchanged)success(economy.spend({eventId:'makeup:'+target,points:100,reason:'profile'}));success(companion.checkin(profile.getState().streakDays));break;}
    case 'redeem-secret':if(typeof a.code!=='string'||a.code.length>40)throw fail('口令格式无效');result=success(companion.redeem(a.code));break;
    case 'claim-learning':{if(typeof a.eventId!=='string'||!economy.getState().claims.learning.includes(a.eventId))throw fail('学习积分需由学习服务器核验，请从学习页面重新进入小屋','LEARNING_UNVERIFIED');result={ok:true,unchanged:true,code:'ALREADY_CLAIMED',message:'这笔学习奖励已由服务器核验入账'};break;}
    case 'restore-decoration':{
     const restored=createEstateStore({storageAdapter:null,storageKey:account});success(restored.importArchive(a.archive));const incoming=restored.exportArchive().archive,baseline=estate.exportArchive().archive;
     for(const current of baseline.estate.rooms){const old=incoming.estate.rooms.find(x=>x.id===current.id);if(!old)continue;const snapshot=snapshotRoom(old,{storageKey:account});if(snapshot.scene.roomLevel>current.scene.maxRoomLevel){snapshot.scene.roomLevel=current.scene.maxRoomLevel;snapshot.scene.layout=snapshot.scene.layouts[String(snapshot.scene.roomLevel)]||null;}applyRoomSnapshot(current,snapshot,{owned:baseline.estate.bank.owned,rewards:baseline.estate.companion.rewards,storageKey:account});current.world=old.world;for(const style of Object.values(current.companion.furnitureStyles||{})){if(style.skinId&&!baseline.profile.badges.includes(style.skinId)){style.skinId="";style.achievementSkin=false;}if(style.achievementSkin&&!baseline.profile.badges.length)style.achievementSkin=false;}}
     result=success(estate.importArchive(baseline));result.message='已恢复房间装修，当前积分、宠物、物品和解锁进度保持不变';break;
    }
   }
   settle(context(account,ctx.map,null,now),now);const saved=await repository.saveWithin(c,account,home.revision,Object.fromEntries(ctx.map),{trustedAuthority:true});if(!saved.ok)throw fail(saved.message,saved.code);
   // Do not persist full snapshots in the receipt: reload current server state
   // on retry, so an old successful response cannot roll back later purchases.
   const compact={ok:true,message:result.message||'已经保存',code:result.code,unchanged:!!result.unchanged,stored:!!result.stored,roomId:result.roomId,relaunchRequired:true};
   await c.execute('INSERT INTO room_life_requests(account_key,request_id,body_hash,response) VALUES(?,?,?,?)',[account,id,digest,JSON.stringify({result:compact,requestWindowUntil:input.issuedAt+5*60000})]);const updated=await repository.load(account,{connection:c});await c.commit();return {...compact,home:updated};
  }catch(error){await c.rollback();throw error;}finally{c.release();}
 }
 async function syncLearning(account,authorization){
  if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_.-]{20,4096}$/.test(authorization))return {ok:false,code:'LEARNING_UNVERIFIED'};
  const fetchJson=async suffix=>{const r=await learningFetcher(learningApi.replace(/\/$/,'')+suffix,{headers:{Authorization:authorization},signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw fail('学习奖励暂时无法核验','LEARNING_UNAVAILABLE',503);return r.json();};
  const wallet=await fetchJson('/economy/wallet');if(typeof wallet?.childId!=='string'||'learner-'+hash(learningApi+'|'+wallet.childId).slice(0,48)!==account||!Array.isArray(wallet.ledger))throw fail('学习奖励身份不一致','LEARNING_UNVERIFIED');
  const rows=wallet.ledger.filter(x=>typeof x?.eventId==='string'&&x.eventId.startsWith('study:'+wallet.childId+':')&&x.eventId.length<=128&&Number.isSafeInteger(x.delta)&&x.delta>0&&x.delta<=100000).slice(0,30),now=valueNow(),c=await pool.getConnection();
  try{await c.beginTransaction();await c.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[account]);const home=await repository.load(account,{connection:c});let ctx=context(account,home.entries,null,now),credited=0;
   for(const row of rows){const state=ctx.economy.getState();if(state.claims.learning.includes(row.eventId))continue;success(ctx.economy.reward({eventId:'upstream:'+row.eventId,points:row.delta,reason:'verified-learning'}));const raw=JSON.parse(ctx.estate.storageForRoom(ctx.room).getItem(account+'-account-v1'));raw.claims.learning.push(row.eventId);ctx.estate.storageForRoom(ctx.room).setItem(account+'-account-v1',JSON.stringify(raw));credited++;ctx=context(account,ctx.map,null,now);const seconds=row.delta*120;for(let remaining=seconds;remaining>0;remaining-=86400*90)success(ctx.profile.addStudyTime(Math.min(remaining,86400*90)));success(ctx.companion.learning(row.eventId,seconds));ctx=context(account,ctx.map,null,now);}
   if(credited){settle(ctx,now);const saved=await repository.saveWithin(c,account,home.revision,Object.fromEntries(ctx.map),{trustedAuthority:true});if(!saved.ok)throw fail(saved.message,saved.code);}await c.commit();return {ok:true,credited};
  }catch(error){await c.rollback();throw error;}finally{c.release();}
 }
 return {act,syncLearning};
}
