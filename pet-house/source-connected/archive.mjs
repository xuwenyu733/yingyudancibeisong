/** 存档导出/导入（v2.7/batch1）：
 * 把个人主页 + 经济账本打包成一个可下载/可恢复的 JSON 快照。
 * 纯函数、Node 可测；恢复时由调用方用 createProfile/createEconomy 走常规校验入账。
 */
import {createEconomy} from './economy.mjs';
import {createProfile} from './profile.mjs';
import {acquireStorageLock} from './storage.mjs';
import {validateCompanion,COMPANION_SUFFIX} from './companion-state.mjs';

export const ARCHIVE_FORMAT = 1;
export const ARCHIVE_VERSION = '2.28.1';

const plain = value => value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const economyViewKeys=['valid','writable','error','catalog','tiers','nextTier','pets'];
const profileViewKeys=['valid','writable','error'];
const companionViewKeys=['valid','error'];
const encoder=new TextEncoder();
function jsonCopy(input){
  const ancestors=new Set();let nodes=0;
  function copy(value,depth){
    if(++nodes>200000||depth>24)throw new TypeError('存档嵌套过深或内容过多');
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(!Array.isArray(value)&&!plain(value))throw new TypeError('存档只接受普通 JSON 数据');
    if(ancestors.has(value))throw new TypeError('存档不能循环引用');
    ancestors.add(value);
    const result=Array.isArray(value)?[]:{};
    const keys=Array.isArray(value)?Array.from({length:value.length},(_,index)=>String(index)):Object.keys(value);
    for(const key of keys){
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new TypeError('存档不能包含访问器或数组空槽');
      Object.defineProperty(result,key,{value:copy(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
    }
    ancestors.delete(value);return result;
  }
  return copy(input,0);
}
function strip(input,keys){const result=jsonCopy(input);for(const key of keys)delete result[key];return result;}

export function exportArchive({ profile, economy, meta = {} } = {}) {
  if (!plain(profile) || !plain(economy)) throw new TypeError('导出需要个人主页与经济账本数据对象');
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    meta: plain(meta) ? jsonCopy(meta) : {},
    profile: strip(profile,profileViewKeys),
    economy: strip(economy,economyViewKeys),
  };
}

/**
 * 校验并解包存档。返回 { ok:true, profile, economy, meta }，
 * 或 { ok:false, code, message }（不抛异常，便于 UI 展示）。
 */
export function importArchive(json) {
  let archive;
  try {
    if(typeof json==='string'&&encoder.encode(json).byteLength>1572864)return fail('ARCHIVE_BIG','完整存档超过 1.5MB 上限');
    archive = jsonCopy(typeof json === 'string' ? JSON.parse(json) : json);
  } catch { return fail('ARCHIVE_BROKEN', '存档不是合法的普通 JSON 数据'); }
  if (!plain(archive)) return fail('ARCHIVE_BROKEN', '存档结构无效');
  if (archive.format !== ARCHIVE_FORMAT) return fail('ARCHIVE_VERSION', `存档格式不受支持（期望 format ${ARCHIVE_FORMAT}）`);
  if (!plain(archive.profile) || !plain(archive.economy)) return fail('ARCHIVE_BROKEN', '存档缺少个人主页或经济账本数据');
  // 防御：剔除 getState() 的装饰键（valid/writable/error/catalog/tiers/nextTier）。
  // 它们不是持久化字段，若带入存档，createProfile/createEconomy 的严格键校验会判为 INVALID_STATE。
  for (const key of economyViewKeys) delete archive.economy[key];
  for (const key of profileViewKeys) delete archive.profile[key];
  const profileRaw = JSON.stringify(archive.profile), economyRaw = JSON.stringify(archive.economy);
  // 基本体积防线（具体字段校验交由 createProfile/createEconomy 的 parse 完成）。
  if (new TextEncoder().encode(profileRaw).byteLength > 262144) return fail('ARCHIVE_BIG', '个人主页数据超出 256KB 上限');
  if (new TextEncoder().encode(economyRaw).byteLength > 1048576) return fail('ARCHIVE_BIG', '经济账本数据超出 1MB 上限');
  // 在写宿主存储前使用与运行时相同的严格解析，拒绝会使房间下次启动锁死的坏存档。
  const profile=createProfile({storageAdapter:{getItem:()=>profileRaw,setItem(){throw new Error('read-only validation');}}}).getState();
  const economy=createEconomy({storageAdapter:{getItem:()=>economyRaw,setItem(){throw new Error('read-only validation');}}}).getState();
  if(!profile.valid||!economy.valid)return fail('ARCHIVE_INVALID',(!profile.valid?profile.error:economy.error)?.message||'存档账户数据无效');
  const meta=plain(archive.meta)?jsonCopy(archive.meta):{};
  if(Object.hasOwn(meta,'companion')){
    try{meta.companion=validateCompanion(strip(meta.companion,companionViewKeys));}
    catch(error){return fail('ARCHIVE_INVALID',`伙伴手册无效：${error.message}`);}
  }
  return { ok: true, profile: strip(profile,profileViewKeys), economy: strip(economy,economyViewKeys), meta };
}

/**
 * 同步宿主存储的可回滚导入。先验证、备份与预检，再写账户及可选伙伴手册；失败恢复旧值。
 * 任意 get/set 适配器无法提供跨键崩溃原子性；若连回滚也失败，明确报告恢复需求。
 * 真正需要跨进程原子提交的宿主应在自己的数据库事务里保存这些数据。
 */
export function restoreArchive({json,storageAdapter:adapter,storageKey,expectedState}={}){
  const verdict=importArchive(json);if(!verdict.ok)return verdict;
  if(typeof storageKey!=='string'||!storageKey.trim())return fail('INVALID_STORAGE_KEY','需要当前账户的存储键');
  if(!adapter||typeof adapter.getItem!=='function'||typeof adapter.setItem!=='function')return fail('STORAGE_UNAVAILABLE','导入需要可读写的同步存储适配器');
  if([adapter.getItem,adapter.setItem,adapter.removeItem].filter(Boolean).some(fn=>fn.constructor?.name==='AsyncFunction'))return fail('STORAGE_UNAVAILABLE','导入需要同步存储；请由宿主数据库事务处理异步存档');
  const entries=[{key:storageKey+'-profile-v1',kind:'profile',value:JSON.stringify(verdict.profile)},{key:storageKey+'-account-v1',kind:'economy',value:JSON.stringify(verdict.economy)}];
  if(Object.hasOwn(verdict.meta,'companion'))entries.push({key:storageKey+COMPANION_SUFFIX,kind:'companion',value:JSON.stringify(verdict.meta.companion)});
  const releaseLock=acquireStorageLock(adapter,entries.map(entry=>entry.key));
  if(!releaseLock)return fail('BUSY','此账户正在保存，请稍后再导入');
  try{
  function read(key){const raw=adapter.getItem(key);if(raw!==null&&typeof raw!=='string')throw new TypeError('getItem must return a string or null');return raw;}
  try{for(const entry of entries)entry.before=read(entry.key);}catch{return fail('STORAGE_READ_FAILED','无法备份当前存档，导入未开始');}
  if(entries.some(entry=>entry.before===null)&&typeof adapter.removeItem!=='function')return fail('STORAGE_UNAVAILABLE','当前适配器缺少 removeItem，无法安全回滚新建存档，导入未开始');
  if(expectedState){
    try{
      for(const entry of entries){
        if(entry.kind==='companion'){
          if(entry.before!==null&&expectedState.companion!==undefined){
            const current=validateCompanion(JSON.parse(entry.before));
            const expected=validateCompanion(strip(expectedState.companion,companionViewKeys));
            if(JSON.stringify(current)!==JSON.stringify(expected))return fail('ARCHIVE_CONFLICT','伙伴手册已被其他实例修改，请重新挂载后再导入');
          }
          continue;
        }
        const factory=entry.kind==='profile'?createProfile:createEconomy;
        const current=factory({storageAdapter:{getItem:()=>entry.before,setItem(){}}}).getState();
        const viewKeys=entry.kind==='profile'?profileViewKeys:economyViewKeys;
        // 首次创建账户的初始积分由宿主提供，空键没有可比持久化快照。
        if(entry.before!==null&&JSON.stringify(strip(current,viewKeys))!==JSON.stringify(strip(expectedState[entry.kind],viewKeys)))return fail('ARCHIVE_CONFLICT','当前账户已被其他实例修改，请重新挂载后再导入');
      }
    }catch{return fail('ARCHIVE_CONFLICT','无法确认当前账户版本，导入未开始');}
  }
  const touched=[];
  try{
    for(const entry of entries){
      if(read(entry.key)!==entry.before)throw new Error('conflict');
      touched.push(entry);
      const result=adapter.setItem(entry.key,entry.value);
      if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('async storage');}
      if(read(entry.key)!==entry.value)throw new Error('write not retained');
    }
  }catch{
    let rollbackFailed=false;
    for(const entry of touched.reverse())try{
      const current=read(entry.key);
      if(current===entry.before)continue;
      if(current!==entry.value)throw new Error('external change');
      const result=entry.before===null?adapter.removeItem(entry.key):adapter.setItem(entry.key,entry.before);
      if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('async rollback');}
      if(read(entry.key)!==entry.before)throw new Error('rollback not retained');
    }catch{rollbackFailed=true;}
    return rollbackFailed?{...fail('STORAGE_ROLLBACK_FAILED','存档写入失败且未能完整恢复，请保留备份并重新挂载检查'),recoveryRequired:true}:fail('STORAGE_WRITE_FAILED','写入存储失败，已恢复导入前的存档');
  }
  return {ok:true,message:'存档已写入，重新挂载房间后生效',relaunchRequired:true,meta:verdict.meta};
  }finally{releaseLock();}
}

function fail(code, message) { return { ok: false, code, message }; }
