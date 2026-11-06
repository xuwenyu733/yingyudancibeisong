import {quoteDesign,designFingerprint} from './design-plan.mjs';
import {createEconomy,SHOP_CATALOG,BUILTIN_STORAGE} from './economy.mjs';
import {createProfile} from './profile.mjs';
import {defaultCompanion,validateCompanion,COMPANION_SUFFIX} from './companion-state.mjs';
import {acquireStorageLock} from './storage.mjs';
import {giftProduct} from './gift-catalog.mjs';
import {MAX_ROOM_WORLD_SAVES,ROOM_WORLD_FORMAT,snapshotRoom,validateRoomWorld,worldMetadata,checkpointMetadata,nextWorldRevision,makeCheckpointId,worldName,applyRoomSnapshot,parseRoomWorldArchive} from './room-world.mjs';

export const ESTATE_SUFFIX='-estate-v1';
export const MAX_ESTATE_ROOMS=2;
// Keep older five/six-room saves readable. New expansion always stops at two;
// refusing or truncating a legacy save would lose the child's existing designs.
const LEGACY_ESTATE_ROOMS=6;
// v2.27：最多新建两层，从一楼扩建二楼收取 600 积分。旧版多层存档继续可读。
export const FLOOR_EXPANSION_COSTS=Object.freeze([0,600]);
export function floorExpansionCost(roomCount){return Number.isSafeInteger(roomCount)&&roomCount>=0?FLOOR_EXPANSION_COSTS[Math.min(roomCount,FLOOR_EXPANSION_COSTS.length-1)]:0;}
const MAX_BYTES=8*1024*1024,encoder=new TextEncoder();
const roomAccountKeys=['roomLevel','maxRoomLevel','layout','layouts','stored','appearance'];
const localCompanionFields=['furnitureStyles','theme','photos','wallDrawing'];
const localCompanionKeys=['roomName',...localCompanionFields];
const roomCompanion=companion=>Object.fromEntries(localCompanionFields.filter(key=>Object.hasOwn(companion,key)).map(key=>[key,clone(companion[key])]));
const localOperations=new Set(['expand','set-room','store','unstore','store-all','copy-design']);
const builtin=new Set(BUILTIN_STORAGE.map(item=>item.id));
const movable=new Set(SHOP_CATALOG.filter(item=>item.category!=='flooring').map(item=>item.sku));
const defaults={cream:{wallColor:'cream',theme:'light'},mint:{wallColor:'mint',theme:'eye-care'},candy:{wallColor:'rose',theme:'candy'}};
const own=(value,key)=>Object.hasOwn(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>Object.assign(new Error(message),{code});
const problem=(error,fallback='ESTATE_INVALID')=>({code:error.code||fallback,message:error.message||'小屋记录暂时无法读取'});
const only=(value,keys)=>{if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key)))throw fail('INVALID_ARGUMENT','记录包含未知字段');};
const nameOf=value=>{if(typeof value!=='string')throw fail('INVALID_NAME','小屋名字要用文字填写');const text=value.trim().replace(/[\u0000-\u001f<>]/g,'');if(!text||[...text].length>18)throw fail('INVALID_NAME','请给小屋起一个1至18字的名字');return text;};
function safeJSON(value,depth=0,ancestors=new Set(),budget={count:0}){
  if(++budget.count>500000||depth>26)throw fail('ESTATE_INVALID','小屋记录过大或嵌套过深');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
  if(!Array.isArray(value)&&!plain(value))throw fail('ESTATE_INVALID','小屋记录只接受普通JSON数据');
  if(ancestors.has(value))throw fail('ESTATE_INVALID','小屋记录不能循环引用');
  ancestors.add(value);const result=Array.isArray(value)?[]:{};
  if(Array.isArray(value)&&Object.keys(value).length!==value.length)throw fail('ESTATE_INVALID','记录列表含有空缺');
  for(const key of Object.keys(value)){
    if(['__proto__','constructor','prototype'].includes(key))throw fail('ESTATE_INVALID','记录字段不安全');
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!own(descriptor,'value'))throw fail('ESTATE_INVALID','记录不能包含访问器');
    result[key]=safeJSON(descriptor.value,depth+1,ancestors,budget);
  }
  ancestors.delete(value);return result;
}
function jsonText(raw){if(typeof raw!=='string'||encoder.encode(raw).byteLength>MAX_BYTES)throw fail('ESTATE_INVALID','小屋记录过大或不是JSON文本');return safeJSON(JSON.parse(raw));}
function strip(state,keys){const result=clone(state);for(const key of keys)delete result[key];return result;}
function accountOf(value){
  const raw=typeof value==='string'?value:JSON.stringify(safeJSON(value));
  const state=createEconomy({storageAdapter:{getItem:()=>raw,setItem(){throw new Error('validation only');}}}).getState();
  if(!state.valid)throw fail('ESTATE_INVALID',state.error?.message||'共享积分记录无效');
  return strip(state,['valid','writable','error','catalog','tiers','nextTier','pets']);
}
function profileOf(value){
  const raw=value===null?null:typeof value==='string'?value:JSON.stringify(safeJSON(value));
  const state=createProfile({storageAdapter:{getItem:()=>raw,setItem(){throw new Error('validation only');}}}).getState();
  if(!state.valid)throw fail('ESTATE_INVALID',state.error?.message||'个人主页记录无效');
  return strip(state,['valid','writable','error']);
}
function bankOf(account){const bank=clone(account);for(const key of roomAccountKeys)delete bank[key];bank.claims.requests=bank.claims.requests.filter(request=>!localOperations.has(request.operation));return bank;}
function sceneOf(account){return {...Object.fromEntries(roomAccountKeys.map(key=>[key,clone(account[key])])),requests:account.claims.requests.filter(request=>localOperations.has(request.operation)).map(clone)};}
function sharedCompanion(companion){const result=clone(companion);for(const key of localCompanionKeys)delete result[key];return result;}
function companionFor(estate,room,validate=true){const value={...defaultCompanion(),...estate.companion,roomName:room.name,...room.companion};return validate?validateCompanion(value):value;}
function accountFor(estate,room,validate=true){const value={...estate.bank,...Object.fromEntries(roomAccountKeys.map(key=>[key,clone(room.scene[key])])),claims:{...estate.bank.claims,requests:[...estate.bank.claims.requests,...room.scene.requests]}};return validate?accountOf(value):value;}
const metadata=room=>({id:room.id,name:room.name,template:room.template,floor:room.floor,createdAt:room.createdAt,world:worldMetadata(room)});
function validateEstate(input){
  const value=safeJSON(input);only(value,['version','activeRoomId','mode','bank','companion','rooms']);
  if(value.version!==1||!['courtyard','castle'].includes(value.mode)||!Array.isArray(value.rooms)||!value.rooms.length||value.rooms.length>LEGACY_ESTATE_ROOMS)throw fail('ESTATE_INVALID','庄园格式或房间数量无效');
  if(!plain(value.bank)||!plain(value.companion))throw fail('ESTATE_INVALID','庄园共享记录无效');
  only(value.bank,['version','balance','owned','claims','totalSpent','petOwned','activePet']);
  only(value.bank.claims,['learning','requests','rewards','spends']);
  if(!Array.isArray(value.bank.claims.requests)||value.bank.claims.requests.some(request=>!['purchase','purchase-pet','grant-gift','create-room'].includes(request.operation)))throw fail('ESTATE_INVALID','共享交易记录不能包含房间操作');
  const ids=new Set();
  for(const room of value.rooms){
    only(room,['id','name','template','floor','createdAt','scene','companion','extras','world']);
    if(!/^room-[1-6]$/.test(room.id)||ids.has(room.id)||!own(defaults,room.template)||!Number.isInteger(room.floor)||room.floor<0||room.floor>=LEGACY_ESTATE_ROOMS||typeof room.createdAt!=='string'||!Number.isFinite(Date.parse(room.createdAt)))throw fail('ESTATE_INVALID','小屋编号、模板或楼层无效');
    ids.add(room.id);room.name=nameOf(room.name);
    only(room.scene,[...roomAccountKeys,'requests']);only(room.companion,localCompanionFields);
    if(!Array.isArray(room.scene.requests)||room.scene.requests.some(request=>!localOperations.has(request.operation)))throw fail('ESTATE_INVALID','房间交易记录无效');
    const account=accountFor(value,room);
    if(account.claims.requests.some(request=>!localOperations.has(request.operation)&&!['purchase','purchase-pet','grant-gift','create-room'].includes(request.operation)))throw fail('ESTATE_INVALID','共享交易记录无效');
    // Reuse the ledgers' strict schemas; do not silently drop unknown bank keys.
    const canonicalBank=bankOf(account);if(Object.keys(value.bank).some(key=>!own(canonicalBank,key)))throw fail('ESTATE_INVALID','共享账户包含未知字段');
    room.scene=sceneOf(account);room.companion=roomCompanion(companionFor(value,room));
    if(!plain(room.extras)||Object.keys(room.extras).length>20||Object.values(room.extras).some(raw=>raw!==null&&typeof raw!=='string'))throw fail('ESTATE_INVALID','房间附加记录无效');
    room.world=validateRoomWorld(room.world,room);
  }
  if(!ids.has(value.activeRoomId))throw fail('ESTATE_INVALID','当前小屋不存在');
  // Older courtyard estates allowed several rooms on one floor. Keep every
  // room and its identity, then give the stable original floor order one level
  // each. This normalization also applies when an old full archive is imported.
  value.rooms=value.rooms.map((room,index)=>({room,index})).sort((a,b)=>a.room.floor-b.room.floor||a.index-b.index).map(({room},floor)=>({...room,floor}));
  value.mode='castle';
  const first=value.rooms[0],canonicalAccount=accountFor(value,first),canonicalCompanion=companionFor(value,first);
  value.bank=bankOf(canonicalAccount);value.companion=sharedCompanion(canonicalCompanion);
  if(encoder.encode(JSON.stringify(value)).byteLength>MAX_BYTES)throw fail('ESTATE_FULL','庄园记录太大，请先导出存档');
  return value;
}

/** A single atomic estate key owns the shared bank and all room scene projections. */
export function createEstateStore({storageAdapter,storageKey='hamster-room-layout-v3',initialPoints=0}={}){
  const keyBase=typeof storageKey==='string'?storageKey:'';
  const estateKey=keyBase+ESTATE_SUFFIX,accountKey=keyBase+'-account-v1',companionKey=keyBase+COMPANION_SUFFIX,profileKey=keyBase+'-profile-v1';
  let adapter=storageAdapter,state=null,configError=null,lastError=null,initializationError=null,seen=false,volatileRaw=null,validatedRaw=null,validatedValue=null;
  const roomAdapters=new Map(),globalMemory=new Map();
  try{
    if(typeof storageKey!=='string'||!storageKey.trim()||storageKey.length>160)throw fail('INVALID_STORAGE_KEY','庄园需要独立的存储名字');
    if(!Number.isSafeInteger(initialPoints)||initialPoints<0)throw fail('INVALID_INITIAL_BALANCE','初始积分必须为非负整数');
    if(adapter===undefined){try{adapter=globalThis.localStorage;}catch{}if(!adapter)throw fail('STORAGE_UNAVAILABLE','请提供可读写的同步存储');}
    if(adapter!==null&&(typeof adapter?.getItem!=='function'||typeof adapter?.setItem!=='function'||[adapter.getItem,adapter.setItem,adapter.removeItem].filter(Boolean).some(fn=>fn.constructor?.name==='AsyncFunction')))throw fail('STORAGE_UNAVAILABLE','庄园需要同步存储适配器');
  }catch(error){configError=problem(error);}
  function readRaw(key){const result=adapter===null?(key===estateKey?volatileRaw:globalMemory.get(key)??null):adapter.getItem(key);if(result!==null&&typeof result!=='string')throw fail('STORAGE_READ_FAILED','存储应返回字符串或null');return result;}
  function writeRaw(key,value){if(adapter===null){if(key===estateKey)volatileRaw=value;else globalMemory.set(key,value);return;}const result=adapter.setItem(key,value);if(result?.then){Promise.resolve(result).catch(()=>{});throw fail('STORAGE_UNAVAILABLE','庄园需要同步存储');}}
  function removeRaw(key){if(adapter===null){if(key===estateKey)volatileRaw=null;else globalMemory.delete(key);return;}if(typeof adapter.removeItem!=='function')throw fail('STORAGE_ROLLBACK_FAILED','当前存储无法移除新建记录');const result=adapter.removeItem(key);if(result?.then){Promise.resolve(result).catch(()=>{});throw fail('STORAGE_UNAVAILABLE','庄园需要同步存储');}}
  function initial(){
    const oldAccount=readRaw(accountKey),oldCompanion=readRaw(companionKey);
    const account=oldAccount===null?strip(createEconomy({storageAdapter:null,initialBalance:initialPoints}).getState(),['valid','writable','error','catalog','tiers','nextTier','pets']):accountOf(oldAccount);
    const companion=oldCompanion===null?defaultCompanion():validateCompanion(jsonText(oldCompanion));
    return validateEstate({version:1,activeRoomId:'room-1',mode:'castle',bank:bankOf(account),companion:sharedCompanion(companion),rooms:[{id:'room-1',name:companion.roomName,template:'cream',floor:0,createdAt:new Date().toISOString(),scene:sceneOf(account),companion:roomCompanion(companion),extras:{}}]});
  }
  function fresh(mutable=false){if(configError)throw Object.assign(new Error(configError.message),configError);const raw=readRaw(estateKey);if(raw===null){if(seen)throw fail('ESTATE_MISSING','庄园记录被移除了，请重新加载并检查备份');return {raw,value:initial()};}if(raw!==validatedRaw){validatedValue=validateEstate(jsonText(raw));validatedRaw=raw;}seen=true;return {raw,value:mutable?clone(validatedValue):validatedValue};}
  function commitEntries(entries){
    const touched=[];
    try{for(const entry of entries){if(readRaw(entry.key)!==entry.before)throw fail('ARCHIVE_CONFLICT','记录已被另一个窗口更新');touched.push(entry);writeRaw(entry.key,entry.value);if(readRaw(entry.key)!==entry.value)throw fail('STORAGE_WRITE_FAILED','存储没有保留写入');}}
    catch(error){let failed=false;for(const entry of touched.reverse())try{const actual=readRaw(entry.key);if(actual===entry.before)continue;if(actual!==entry.value)throw new Error('external change');if(entry.before===null)removeRaw(entry.key);else writeRaw(entry.key,entry.before);if(readRaw(entry.key)!==entry.before)throw new Error('rollback missing');}catch{failed=true;}
      if(failed)throw Object.assign(fail('STORAGE_ROLLBACK_FAILED','保存失败且未能完整恢复，请保留备份后重新加载'),{recoveryRequired:true});throw error;}
  }
  function transact(operation){
    if(configError)return {ok:false,...configError};const release=acquireStorageLock(adapter,[estateKey]);if(!release)return {ok:false,code:'BUSY',message:'另一间小屋正在收拾，请稍等'};
    try{const {raw,value}=fresh(true),before=new Map(value.rooms.map(room=>[room.id,{revision:room.world.revision,fingerprint:roomFingerprint(room)}])),detail=operation(value)||{};if(detail.ok===false)return detail;
      const canonical=validateEstate(value);
      for(const room of canonical.rooms){const previous=before.get(room.id);if(previous&&previous.fingerprint!==roomFingerprint(room)){room.world.revision=previous.revision;nextWorldRevision(room.world);}}
      const encoded=JSON.stringify(canonical);if(!detail.unchanged||raw!==encoded)commitEntries([{key:estateKey,before:raw,value:encoded}]);state=canonical;seen=true;lastError=null;initializationError=null;return {ok:true,...detail,...(detail.roomId?{world:worldMetadata(canonical.rooms.find(room=>room.id===detail.roomId)),revision:canonical.rooms.find(room=>room.id===detail.roomId).world.revision}:{})};}
    catch(error){lastError=problem(error,'STORAGE_WRITE_FAILED');return {ok:false,...lastError,...(error.recoveryRequired?{recoveryRequired:true}:{})};}finally{release();}
  }
  function roomFingerprint(room){return JSON.stringify({name:room.name,template:room.template,scene:room.scene,companion:room.companion,extras:room.extras,checkpoints:room.world.checkpoints});}
  const requireRoom=(estate,id)=>{if(typeof id!=='string')throw fail('ROOM_NOT_FOUND','这间小屋还不存在');const room=estate.rooms.find(room=>room.id===id);if(!room)throw fail('ROOM_NOT_FOUND','这间小屋还不存在');return room;};
  const ownsNamespace=key=>typeof key==='string'&&(key===storageKey||key.startsWith(storageKey+'-'))&&key!==estateKey;
  if(!configError){const started=transact(()=>({unchanged:true}));if(!started.ok)initializationError={code:started.code,message:started.message};}
  function getState(){try{state=fresh().value;lastError=initializationError;}catch(error){lastError=problem(error);}return {version:1,activeRoomId:state?.activeRoomId||null,mode:'castle',rooms:state?state.rooms.map(metadata):[],valid:!configError&&!lastError,error:configError||lastError};}
  function storageForRoom(id){
    requireRoom(fresh().value,id);if(roomAdapters.has(id))return roomAdapters.get(id);
    const projections=new Map();
    function project(estate,key){const room=requireRoom(estate,id);return JSON.stringify(key===accountKey?accountFor(estate,room,false):companionFor(estate,room,false));}
    function readProjection(key){const {value}=fresh(),fingerprint=project(value,key),cached=projections.get(key);if(cached?.fingerprint===fingerprint)return cached.raw;projections.set(key,{fingerprint,raw:fingerprint});return fingerprint;}
    function assertNamespace(key){if(!ownsNamespace(key))throw fail('INVALID_STORAGE_KEY','房间不能访问其他项目的存储');}
    const facade={
      getItem(key){assertNamespace(key);if(key===accountKey||key===companionKey)return readProjection(key);if(key===profileKey)return readRaw(key);const {value}=fresh(),room=requireRoom(value,id);if(own(room.extras,key))return room.extras[key];return id==='room-1'?readRaw(key):null;},
      setItem(key,raw){
        assertNamespace(key);if(typeof raw!=='string')throw fail('INVALID_ARGUMENT','存储内容应为JSON文本');
        if(key===profileKey){const release=acquireStorageLock(adapter,[profileKey]);if(!release)throw fail('BUSY','个人主页正在保存');try{profileOf(raw);commitEntries([{key,before:readRaw(key),value:raw}]);}finally{release();}return;}
        const result=transact(estate=>{
          const room=requireRoom(estate,id);
          if(key===accountKey){const account=accountOf(raw),added=account.owned.filter(sku=>!estate.bank.owned.includes(sku)&&(movable.has(sku)||!!giftProduct(sku)));estate.bank=bankOf(account);room.scene=sceneOf(account);
            for(const other of estate.rooms)if(other!==room){other.scene.stored=[...new Set([...other.scene.stored.filter(sku=>builtin.has(sku)||account.owned.includes(sku)),...added])];other.scene.requests=other.scene.requests.filter(request=>!['store','unstore'].includes(request.operation)||builtin.has(request.sku)||account.owned.includes(request.sku));}}
          else if(key===companionKey){const companion=validateCompanion(jsonText(raw));estate.companion=sharedCompanion(companion);room.name=nameOf(companion.roomName);room.companion=roomCompanion(companion);}
          else room.extras[key]=raw;
        });
        if(!result.ok)throw Object.assign(new Error(result.message),result);
        if(key===accountKey||key===companionKey)projections.set(key,{fingerprint:project(fresh().value,key),raw});
      },
      removeItem(key){assertNamespace(key);if(key===accountKey||key===companionKey)throw fail('INVALID_ARGUMENT','共享账本不能单独删除，请恢复完整庄园存档');if(key===profileKey){removeRaw(key);return;}const result=transact(estate=>{requireRoom(estate,id).extras[key]=null;});if(!result.ok)throw Object.assign(new Error(result.message),result);},
    };
    roomAdapters.set(id,facade);return facade;
  }
  function exportArchive(){try{
    const {value}=fresh(),profile=profileOf(readRaw(profileKey)),exported=clone(value),first=exported.rooms.find(room=>room.id==='room-1');
    // Old standalone designs can still live under the separate root layout
    // key. Make that visible design portable instead of exporting a null scene.
    if(first&&first.scene.layout===null&&!own(first.extras,storageKey)){
      const layout=readRaw(storageKey);if(typeof layout==='string'&&layout.trim()){const snapshot=snapshotRoom(first,{storageKey,legacyLayout:layout});first.scene.layout=snapshot.scene.layout;first.scene.layouts=snapshot.scene.layouts;}
    }
    return {ok:true,archive:{format:'pet-estate-save',version:1,storageKey,exportedAt:new Date().toISOString(),estate:exported,profile}};
  }catch(error){return {ok:false,...problem(error)};}}
  function importArchive(input){
    let archive;try{
      archive=typeof input==='string'?jsonText(input):safeJSON(input);if(!plain(archive))throw fail('ARCHIVE_INVALID','庄园存档格式无效');if(archive.format!=='pet-estate-save'||archive.version!==1)return {ok:false,code:'ARCHIVE_VERSION',message:'这是旧版单房间存档，请先用旧版导入，再自动迁移到庄园'};only(archive,['format','version','storageKey','exportedAt','estate','profile']);
      if(typeof archive.exportedAt!=='string'||!Number.isFinite(Date.parse(archive.exportedAt))||!plain(archive.profile)||archive.storageKey!==undefined&&(typeof archive.storageKey!=='string'||!archive.storageKey.trim()||archive.storageKey.length>160))throw fail('ARCHIVE_INVALID','存档日期、来源小屋或个人主页格式无效');
      archive.estate=validateEstate(archive.estate);archive.profile=profileOf(archive.profile);
      const from=archive.storageKey;
      if(from&&from!==storageKey){
        const remap=extras=>{const mapped=new Map();for(const [key,raw]of Object.entries(extras)){const target=key===from||key.startsWith(from+'-')?storageKey+key.slice(from.length):key;if(mapped.has(target)&&mapped.get(target)!==raw)throw fail('ARCHIVE_INVALID','存档中存在冲突的小屋附加记录');mapped.set(target,raw);}return Object.fromEntries(mapped);};
        for(const room of archive.estate.rooms){room.extras=remap(room.extras);for(const save of room.world.checkpoints)save.snapshot.extras=remap(save.snapshot.extras);}
      }
      // The wallet parser only checks that layouts are JSON. Validate the
      // renderer's transforms before committing over the existing house.
      for(const room of archive.estate.rooms)snapshotRoom(room,{storageKey});
    }catch(error){return {ok:false,...problem(error,'ARCHIVE_INVALID')};}
    if(configError)return {ok:false,...configError};const release=acquireStorageLock(adapter,[estateKey,profileKey]);if(!release)return {ok:false,code:'BUSY',message:'庄园正在保存，请稍后恢复'};
    try{commitEntries([{key:estateKey,before:readRaw(estateKey),value:JSON.stringify(archive.estate)},{key:profileKey,before:readRaw(profileKey),value:JSON.stringify(archive.profile)}]);state=archive.estate;seen=true;lastError=null;initializationError=null;return {ok:true,relaunchRequired:true,message:'整个庄园都找回来啦！'};}catch(error){lastError=problem(error,'STORAGE_WRITE_FAILED');return {ok:false,...lastError,...(error.recoveryRequired?{recoveryRequired:true}:{})};}finally{release();}
  }
  function roomSnapshot(room){
    const legacyLayout=room.scene.layout===null&&room.id==='room-1'&&!own(room.extras,storageKey)?readRaw(storageKey):undefined;
    const snapshot=snapshotRoom(room,{storageKey,legacyLayout});
    if(room.id==='room-1'&&!own(snapshot.extras,storageKey))snapshot.extras[storageKey]=legacyLayout??null;
    return snapshot;
  }
  function listRoomWorldSaves(id){
    try{const room=requireRoom(fresh().value,id),world=worldMetadata(room);return {ok:true,roomId:id,...world,world,saves:room.world.checkpoints.map(checkpointMetadata)};}
    catch(error){return {ok:false,...problem(error,'ROOM_WORLD_INVALID')};}
  }
  function saveRoomWorld(id,input={}){
    let options;try{options=safeJSON(input);only(options,['name']);if(options.name!==undefined)options.name=worldName(options.name);}catch(error){return {ok:false,...problem(error,'ROOM_WORLD_INVALID')};}
    return transact(estate=>{const room=requireRoom(estate,id);if(room.world.checkpoints.length>=MAX_ROOM_WORLD_SAVES)throw fail('ROOM_WORLD_LIMIT','每层最多保留5个存档点，请先删除不需要的存档');const save={id:makeCheckpointId(room.world.checkpoints),roomId:id,name:options.name||`存档点 ${room.world.checkpoints.length+1}`,createdAt:new Date().toISOString(),snapshot:roomSnapshot(room)};room.world.checkpoints.push(save);return {roomId:id,save:checkpointMetadata(save),message:'这一层的布置已保存到存档点'};});
  }
  function restoreRoomWorld(id,saveId){return transact(estate=>{const room=requireRoom(estate,id),save=room.world.checkpoints.find(item=>item.id===saveId);if(!save)throw fail('ROOM_WORLD_NOT_FOUND','这个存档点不属于当前楼层或已被删除');applyRoomSnapshot(room,save.snapshot,{owned:estate.bank.owned,rewards:estate.companion.rewards,storageKey});return {roomId:id,relaunchRequired:true,message:'这一层的布置已恢复，共享积分和其他楼层保持不变'};});}
  function createRoomWorld(id,input={}){
    let options;try{options=safeJSON(input);only(options,['name','template','backupName']);if(options.name!==undefined)options.name=nameOf(options.name);if(options.backupName!==undefined)options.backupName=worldName(options.backupName);if(options.template!==undefined&&!own(defaults,options.template))throw fail('INVALID_TEMPLATE','请选择已有的小屋风格');}catch(error){return {ok:false,...problem(error,'ROOM_WORLD_INVALID')};}
    return transact(estate=>{
      const room=requireRoom(estate,id);if(room.world.checkpoints.length>=MAX_ROOM_WORLD_SAVES)throw fail('ROOM_WORLD_LIMIT','备份位置已满，请先导出或删除一个旧备份，再新建装修');
      const save={id:makeCheckpointId(room.world.checkpoints),roomId:id,name:options.backupName||`${room.name} · 新建前备份`,createdAt:new Date().toISOString(),snapshot:roomSnapshot(room)};
      const template=options.template||room.template,layout={version:3,furniture:{},definitions:{},lampSupport:null},level=room.scene.roomLevel;
      room.world.checkpoints.push(save);room.name=options.name||`${room.floor+1}楼新房间`;room.template=template;
      room.scene={roomLevel:level,maxRoomLevel:room.scene.maxRoomLevel,layout,layouts:{[String(level)]:clone(layout)},stored:[...builtin,...estate.bank.owned.filter(sku=>movable.has(sku)||!!giftProduct(sku))],appearance:{wallColor:defaults[template].wallColor,flooring:null},requests:room.scene.requests};
      room.companion={furnitureStyles:{},theme:defaults[template].theme,photos:[],wallDrawing:null};
      room.extras={...Object.fromEntries(Object.entries(room.extras).filter(([key])=>/-(?:estate-)?backups-v1$/.test(key))),[storageKey]:JSON.stringify(layout)};
      return {roomId:id,save:checkpointMetadata(save),relaunchRequired:true,message:`旧装修已备份为「${save.name}」，现在可以布置「${room.name}」了`};
    });
  }
  function removeRoomWorldSave(id,saveId){return transact(estate=>{const room=requireRoom(estate,id),index=room.world.checkpoints.findIndex(item=>item.id===saveId);if(index<0)throw fail('ROOM_WORLD_NOT_FOUND','这个存档点不属于当前楼层或已被删除');room.world.checkpoints.splice(index,1);return {roomId:id,message:'存档点已删除，当前布置仍然保留'};});}
  function exportRoomWorld(id){try{const room=requireRoom(fresh().value,id),archive={format:ROOM_WORLD_FORMAT,version:1,roomId:id,storageKey,exportedAt:new Date().toISOString(),snapshot:roomSnapshot(room)};return {ok:true,roomId:id,archive,json:JSON.stringify(archive)};}catch(error){return {ok:false,...problem(error,'ROOM_WORLD_INVALID')};}}
  function importRoomWorld(id,input){
    let archive;try{archive=parseRoomWorldArchive(input);if(archive.roomId!==id)throw fail('ROOM_WORLD_MISMATCH','存档属于其他楼层，请切换到对应楼层再导入');}catch(error){return {ok:false,...problem(error,'ROOM_WORLD_INVALID')};}
    return transact(estate=>{const room=requireRoom(estate,id);applyRoomSnapshot(room,archive.snapshot,{owned:estate.bank.owned,rewards:estate.companion.rewards,storageKey,sourceStorageKey:archive.storageKey||storageKey});return {roomId:id,relaunchRequired:true,message:'单层房屋已导入，共享账户和其他楼层保持不变'};});
  }
  function designQuote(estate,room,input){return quoteDesign(input,{owned:estate.bank.owned,maxRoomLevel:room.scene.maxRoomLevel,balance:estate.bank.balance,rewards:estate.companion.rewards,badges:profileOf(readRaw(profileKey)).badges});}
  function previewRoomDesign(id,input){try{const estate=fresh().value,room=requireRoom(estate,id);return {ok:true,roomId:id,...designQuote(estate,room,input)};}catch(error){return {ok:false,...problem(error,'DESIGN_INVALID')};}}
  function applyRoomDesign(id,input={}){
    let options,hash;
    try{options=safeJSON(input);only(options,['snapshot','buyMissing','requestId','expectedFingerprint']);if(typeof options.buyMissing!=='boolean'||typeof options.requestId!=='string'||!/^[a-zA-Z0-9:_-]{1,64}$/.test(options.requestId))throw fail('INVALID_ARGUMENT','装修复制请求无效');
      const text=designFingerprint(options.snapshot);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}hash=(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
    }catch(error){return {ok:false,...problem(error,'DESIGN_INVALID')};}
    return transact(estate=>{
      const room=requireRoom(estate,id),previous=[...estate.bank.claims.requests,...estate.rooms.flatMap(item=>item.scene.requests)].find(item=>item.id===options.requestId);
      if(previous){if(previous.operation!=='copy-design'||previous.designHash!==hash||!room.scene.requests.includes(previous))throw fail('REQUEST_ID_REUSED','复制编号已用于其他操作');return {roomId:id,unchanged:true,spent:0,message:'这份装修已经复制，无需再次扣积分'};}
      const quote=designQuote(estate,room,options.snapshot);
      if(options.expectedFingerprint!==undefined&&options.expectedFingerprint!==quote.fingerprint)throw fail('DESIGN_CHANGED','装修内容已更新，请重新查询后确认');
      if(quote.unavailable.length)return {ok:false,code:'DESIGN_LOCKED',message:'装修中有尚未解锁的限定物品或成就装扮',...quote};
      if(quote.needsPurchase&&!options.buyMissing)return {ok:false,code:'DESIGN_PURCHASE_REQUIRED',message:'请先确认购买缺少物品和房型扩建',...quote};
      if(!quote.canApply)throw fail('INSUFFICIENT_POINTS',`需要 ${quote.total} 积分，当前只有 ${quote.balance} 积分`);
      if(room.world.checkpoints.length>=MAX_ROOM_WORLD_SAVES)throw fail('ROOM_WORLD_LIMIT','备份位置已满，请先在楼层存档中删除一个旧备份，再复制装修');
      const save={id:makeCheckpointId(room.world.checkpoints),roomId:id,name:`${room.name} · 复制前备份`,createdAt:new Date().toISOString(),snapshot:roomSnapshot(room)};
      for(const item of quote.missing){estate.bank.owned.push(item.sku);estate.bank.claims.requests.push({id:options.requestId+':buy:'+item.sku,operation:'purchase',sku:item.sku,points:item.price});for(const other of estate.rooms)if(other!==room&&movable.has(item.sku)&&!other.scene.stored.includes(item.sku))other.scene.stored.push(item.sku);}
      for(const item of quote.upgrades){room.scene.maxRoomLevel=item.level;room.scene.requests.push({id:options.requestId+':expand:'+item.level,operation:'expand',level:item.level,points:item.price});}
      estate.bank.balance-=quote.total;estate.bank.totalSpent+=quote.total;
      room.world.checkpoints.push(save);
      applyRoomSnapshot(room,{...quote.snapshot,name:room.name},{owned:estate.bank.owned,rewards:estate.companion.rewards,storageKey});
      room.scene.requests.push({id:options.requestId,operation:'copy-design',level:room.scene.roomLevel,designHash:hash});
      return {roomId:id,save:checkpointMetadata(save),spent:quote.total,relaunchRequired:true,message:`已备份原装修并复制摆设，消耗 ${quote.total} 积分`};
    });
  }
  return {
    getState,storageForRoom,previewRoomDesign,applyRoomDesign,exportArchive,importArchive,saveRoomWorld,listRoomWorldSaves,restoreRoomWorld,createRoomWorld,removeRoomWorldSave,exportRoomWorld,importRoomWorld,
    createRoom(input={}){let options;try{options=safeJSON(input);only(options,['name','template','stacked','requestId']);if(options.stacked!==undefined&&typeof options.stacked!=='boolean')throw fail('INVALID_ARGUMENT','楼层选项无效');if(options.requestId!==undefined&&!(typeof options.requestId==='string'&&options.requestId.length>=1&&options.requestId.length<=64))throw fail('INVALID_ARGUMENT','楼层扩建编号无效');}catch(error){return {ok:false,...problem(error,'INVALID_ARGUMENT')};}return transact(estate=>{if(options.requestId!==undefined){const replayRequest=estate.bank.claims.requests.find(request=>request.id===options.requestId);if(replayRequest){if(replayRequest.operation!=='create-room')throw fail('REQUEST_ID_REUSED','扩建编号已用于其他操作');return {unchanged:true,message:'这层楼已经建好啦'};}}if(estate.rooms.length>=MAX_ESTATE_ROOMS)throw fail('ROOM_LIMIT','小屋最高两层，可以给每层备份并创建不同装修');const template=options.template||'cream';if(!own(defaults,template))throw fail('INVALID_TEMPLATE','请选择已有的小屋模板');const cost=floorExpansionCost(estate.rooms.length);if(cost>0){if(estate.bank.balance<cost)throw fail('INSUFFICIENT_POINTS',`学习积分不足：扩建第 ${estate.rooms.length+1} 层需要 ${cost} 积分，完成学习后再来`);estate.bank.balance-=cost;estate.bank.totalSpent+=cost;}const index=Array.from({length:MAX_ESTATE_ROOMS},(_,i)=>i+1).find(n=>!estate.rooms.some(room=>room.id===`room-${n}`)),id=`room-${index}`,name=options.name===undefined?`${estate.rooms.length+1} 楼小屋`:nameOf(options.name),account=strip(createEconomy({storageAdapter:null}).getState(),['valid','writable','error','catalog','tiers','nextTier','pets']);account.appearance.wallColor=defaults[template].wallColor;account.stored=estate.bank.owned.filter(sku=>(movable.has(sku)||!!giftProduct(sku)));const room={id,name,template,floor:estate.rooms.length,createdAt:new Date().toISOString(),scene:sceneOf(account),companion:{furnitureStyles:{},theme:defaults[template].theme},extras:{}};estate.rooms.push(room);estate.bank.claims.requests.push({id:options.requestId||('floor-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)),operation:'create-room',level:estate.rooms.length-1,points:cost});return {room:metadata(room),roomId:id,cost,free:cost===0};});},
    selectRoom(id){return transact(estate=>{const room=requireRoom(estate,id);if(estate.activeRoomId===id)return {unchanged:true,room:metadata(room)};estate.activeRoomId=id;return {room:metadata(room)};});},
    setMode(mode){return transact(()=>{if(mode!=='castle')throw fail('MODE_UNSUPPORTED','现在只支持城堡叠层，每间小屋独占一层');return {unchanged:true};});},
    renameRoom(id,name){return transact(estate=>{const room=requireRoom(estate,id);room.name=nameOf(name);return {room:metadata(room)};});},
  };
}
