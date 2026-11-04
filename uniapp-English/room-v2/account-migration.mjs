/** 账号迁移：新口令保存完整庄园，继续接受旧版单房间口令。 */
import {exportArchive, importArchive} from './archive.mjs';
import {createEstateStore, ESTATE_SUFFIX} from './estate-state.mjs';
import {COMPANION_SUFFIX} from './companion-state.mjs';
import {registerAccountWithId, loginAccount} from './account-session.mjs';
import {acquireStorageLock} from './storage.mjs';

export const TRANSFER_FORMAT = 'pet-room-transfer-v1';
export const ESTATE_TRANSFER_FORMAT = 'pet-room-transfer-v2';
const ACCOUNTS_KEY='pet-room-accounts-v1',SESSION_KEY='pet-room-session-v1';
const MAX_TRANSFER_BYTES=10*1024*1024,encoder=new TextEncoder();
const accountId=id=>typeof id==='string'&&/^user-[a-z0-9]+-[a-z0-9]+$/.test(id)&&id.length<=160;
const fail=(code,message)=>({ok:false,code,message});
const problem=error=>fail(error.code||'TRANSFER_INVALID',error.message||'迁移口令无效');
function requireResult(result){if(!result.ok)throw Object.assign(new Error(result.message),{code:result.code});return result;}
function memory(entries=[]){const values=new Map(entries);return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};}
function read(adapter,key){const raw=adapter.getItem(key);if(raw!==null&&typeof raw!=='string')throw new TypeError('存储需要返回文字或 null');return raw;}
function remapExtras(archive,from,to){
  if(from===to)return archive;
  const result=JSON.parse(JSON.stringify(archive));
  const extras=value=>Object.fromEntries(Object.entries(value).map(([key,raw])=>[key===from||key.startsWith(from+'-')?to+key.slice(from.length):key,raw]));
  for(const room of result.estate.rooms){
    room.extras=extras(room.extras);
    for(const checkpoint of room.world?.checkpoints||[])checkpoint.snapshot.extras=extras(checkpoint.snapshot.extras);
  }
  if(result.storageKey!==undefined)result.storageKey=to;
  return result;
}
function validatedEstate(archive,storageKey){
  const storage=memory(),estate=createEstateStore({storageAdapter:storage,storageKey});
  requireResult(estate.importArchive(archive));
  return {storage,estate,archive:requireResult(estate.exportArchive()).archive};
}

/** 旧单房间格式生成器；保留以兼容既有集成。新导出入口使用 exportAccountTransfer。 */
export function buildTransfer({id,name,profile,economy,companion=null}){
  const archive=exportArchive({profile,economy,meta:companion?{companion}:{}});
  return JSON.stringify({format:TRANSFER_FORMAT,id,name:name||'小屋主人',archive});
}

/** 只读快照：以庄园为权威来源，不读取已经迁入庄园的旧独立账户余额。 */
export function exportAccountTransfer({storageAdapter,id,storageKey=id,name}={}){
  if(!accountId(id))throw new TypeError('账号编号无效');
  if(typeof storageKey!=='string'||!storageKey.trim()||storageKey.length>160)throw new TypeError('账号存储键无效');
  if(!storageAdapter||typeof storageAdapter.getItem!=='function')throw new TypeError('无法读取当前账号存档');
  const keys=[storageKey+ESTATE_SUFFIX,storageKey+'-profile-v1',storageKey+'-account-v1',storageKey+COMPANION_SUFFIX,storageKey];
  const snapshot=memory(keys.map(key=>[key,read(storageAdapter,key)]));
  const estate=createEstateStore({storageAdapter:snapshot,storageKey,initialPoints:0});
  const state=estate.getState();if(!state.valid)requireResult({ok:false,...state.error});
  // 首间旧房的布局可能仍保留在旧布局键；将其纳入庄园附加记录。
  const saved=requireResult(estate.exportArchive()).archive,first=saved.estate.rooms.find(room=>room.id==='room-1');
  if(first&&!Object.hasOwn(first.extras,storageKey)){
    first.extras[storageKey]=snapshot.getItem(storageKey);
  }
  const archive=remapExtras(validatedEstate(saved,storageKey).archive,storageKey,id);
  return JSON.stringify({format:ESTATE_TRANSFER_FORMAT,id,name:name||'小屋主人',archive});
}

/** 先在隔离内存中使用运行时校验所有房间，不写目标设备。 */
export function parseTransfer(text){
  if(typeof text!=='string'||!text.trim())return fail('EMPTY','口令是空的，先复制导出的迁移口令');
  if(encoder.encode(text).byteLength>MAX_TRANSFER_BYTES)return fail('TRANSFER_BIG','迁移口令超过 10MB 上限');
  let parsed;
  try{parsed=JSON.parse(text);}catch{return fail('BROKEN','口令不是合法的 JSON 文本');}
  if(!parsed||![TRANSFER_FORMAT,ESTATE_TRANSFER_FORMAT].includes(parsed.format))return fail('FORMAT','口令格式不受支持（请确认是从萌宠小屋导出的迁移口令）');
  if(!accountId(parsed.id))return fail('BAD_ID','口令里的账号编号无效');
  try{
    const kind=parsed.format===ESTATE_TRANSFER_FORMAT?'estate':'single';
    let archive;
    if(kind==='estate')archive=validatedEstate(parsed.archive,parsed.id).archive;
    else{
      const validated=requireResult(importArchive(parsed.archive));
      archive={...parsed.archive,profile:validated.profile,economy:validated.economy,meta:validated.meta};
    }
    return {ok:true,id:parsed.id,name:typeof parsed.name==='string'?parsed.name:'小屋主人',kind,archive};
  }catch(error){return problem(error);}
}

export function describeTransfer(text){
  const verdict=parseTransfer(text);if(!verdict.ok)return verdict;
  const profile=verdict.archive.profile||{},economy=verdict.kind==='estate'?verdict.archive.estate.bank:verdict.archive.economy;
  return {ok:true,id:verdict.id,name:verdict.name,level:typeof profile.level==='number'?profile.level:1,balance:economy.balance||0,
    roomCount:verdict.kind==='estate'?verdict.archive.estate.rooms.length:1,ownedCount:economy.owned?.length||0,petCount:economy.petOwned?.length||0};
}

/** 对全部存档键及可选账号/会话做同一次同步提交；任何写入失败即回滚。 */
function commitTransfer(adapter,entries,account){
  if(!adapter||typeof adapter.getItem!=='function'||typeof adapter.setItem!=='function')return fail('STORAGE_UNAVAILABLE','恢复需要可读写的同步存储');
  if([adapter.getItem,adapter.setItem,adapter.removeItem].filter(Boolean).some(fn=>fn.constructor?.name==='AsyncFunction'))return fail('STORAGE_UNAVAILABLE','恢复需要同步存储适配器');
  const keys=[...entries.map(entry=>entry.key),...(account?.register?[ACCOUNTS_KEY]:[]),...(account?.login?[SESSION_KEY]:[])];
  const release=acquireStorageLock(adapter,keys);if(!release)return fail('BUSY','此账户正在保存，请稍后再恢复');
  try{
    try{
      const before=new Map(keys.map(key=>[key,read(adapter,key)]));
      if([...before.values()].some(raw=>raw===null)&&typeof adapter.removeItem!=='function')return fail('STORAGE_UNAVAILABLE','当前存储无法安全回滚新建存档，恢复未开始');
      if(account?.register||account?.login){
        const staged=memory(before);
        if(account.register){
          const raw=before.get(ACCOUNTS_KEY);
          if(raw!==null&&!Array.isArray(JSON.parse(raw)?.list))return fail('ACCOUNTS_INVALID','账号列表无效，请先备份检查，恢复未开始');
          registerAccountWithId(staged,account.id,account.name);
          entries.push({key:ACCOUNTS_KEY,value:staged.getItem(ACCOUNTS_KEY)});
        }
        if(account.login){loginAccount(staged,account.id);entries.push({key:SESSION_KEY,value:staged.getItem(SESSION_KEY)});}
      }
      for(const entry of entries)entry.before=before.get(entry.key);
    }catch{return fail('STORAGE_READ_FAILED','无法备份当前存档，恢复未开始');}
    const touched=[];
    try{
      for(const entry of entries){
        if(read(adapter,entry.key)!==entry.before)throw new Error('记录已被其他窗口更新');
        touched.push(entry);
        const result=adapter.setItem(entry.key,entry.value);
        if(result?.then){Promise.resolve(result).catch(()=>{});throw new TypeError('恢复需要同步存储');}
        if(read(adapter,entry.key)!==entry.value)throw new Error('存储没有保留写入');
      }
    }catch{
      let recoveryRequired=false;
      for(const entry of touched.reverse())try{
        const current=read(adapter,entry.key);if(current===entry.before)continue;if(current!==entry.value)throw new Error('外部存档冲突');
        const result=entry.before===null?adapter.removeItem(entry.key):adapter.setItem(entry.key,entry.before);
        if(result?.then){Promise.resolve(result).catch(()=>{});throw new Error('异步回滚');}
        if(read(adapter,entry.key)!==entry.before)throw new Error('回滚失败');
      }catch{recoveryRequired=true;}
      return recoveryRequired?{...fail('STORAGE_ROLLBACK_FAILED','恢复失败且未能完整回滚，请保留口令并检查原存档'),recoveryRequired:true}:fail('STORAGE_WRITE_FAILED','恢复写入失败，已保留恢复前的存档和账号');
    }
    return {ok:true,relaunchRequired:true,message:'全部房间、积分和伙伴进度已恢复'};
  }finally{release();}
}

/** 旧口令也转成庄园后恢复，避免被目标设备已有的庄园覆盖。 */
export function restoreTransfer(text,storageAdapter,storageKey,options={}){
  const verdict=parseTransfer(text);if(!verdict.ok)return verdict;
  if(typeof storageKey!=='string'||!storageKey.trim()||storageKey.length>160)return fail('INVALID_STORAGE_KEY','需要当前账户的存储键');
  if((options.registerAccount||options.login)&&storageKey!==verdict.id)return fail('INVALID_STORAGE_KEY','登录恢复必须使用口令中的账号编号');
  try{
    let restored;
    if(verdict.kind==='estate')restored=validatedEstate(remapExtras(verdict.archive,verdict.id,storageKey),storageKey);
    else{
      const staged=memory([[storageKey+'-profile-v1',JSON.stringify(verdict.archive.profile)],[storageKey+'-account-v1',JSON.stringify(verdict.archive.economy)],
        ...(verdict.archive.meta.companion?[[storageKey+COMPANION_SUFFIX,JSON.stringify(verdict.archive.meta.companion)]]:[])]);
      const estate=createEstateStore({storageAdapter:staged,storageKey});
      restored={storage:staged,estate,archive:requireResult(estate.exportArchive()).archive};
    }
    // 明确记录首层没有旧布局，阻止目标设备旧布局键意外污染恢复结果。
    const first=restored.archive.estate.rooms.find(room=>room.id==='room-1');
    if(first&&!Object.hasOwn(first.extras,storageKey)){
      first.extras[storageKey]=null;
      requireResult(restored.estate.importArchive(restored.archive));
      restored.archive=requireResult(restored.estate.exportArchive()).archive;
    }
    const active=restored.estate.storageForRoom(restored.archive.estate.activeRoomId);
    const entries=[
      {key:storageKey+ESTATE_SUFFIX,value:JSON.stringify(restored.archive.estate)},
      {key:storageKey+'-profile-v1',value:JSON.stringify(restored.archive.profile)},
      {key:storageKey+'-account-v1',value:active.getItem(storageKey+'-account-v1')},
      {key:storageKey+COMPANION_SUFFIX,value:active.getItem(storageKey+COMPANION_SUFFIX)},
    ];
    return commitTransfer(storageAdapter,entries,{id:verdict.id,name:verdict.name,register:!!options.registerAccount,login:!!options.login});
  }catch(error){return problem(error);}
}
