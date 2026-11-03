/** Floor-local worlds. Shared money, ownership, pets and transaction claims never enter a snapshot. */
import {createEconomy,SHOP_CATALOG,BUILTIN_STORAGE,ROOM_TIERS} from './economy.mjs';
import {defaultCompanion,validateCompanion} from './companion-state.mjs';
import {giftProduct} from './gift-catalog.mjs';

export const MAX_ROOM_WORLD_SAVES=5;
export const ROOM_WORLD_FORMAT='pet-room-world';
const sceneKeys=['roomLevel','layout','layouts','stored','appearance'];
const companionKeys=['furnitureStyles','theme','photos','wallDrawing'];
const templates=['cream','mint','candy'],encoder=new TextEncoder();
const builtin=new Set(BUILTIN_STORAGE.map(item=>item.id));
const catalog=new Map(SHOP_CATALOG.map(item=>[item.sku,item]));
const own=(value,key)=>Object.hasOwn(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const error=(code,message)=>Object.assign(new Error(message),{code});
const only=(value,keys)=>{if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key)))throw error('ROOM_WORLD_INVALID','楼层存档包含不支持的字段');};
const date=value=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/.test(value);
const historyKey=key=>/-(?:estate-)?backups-v1$/.test(key);
export function worldName(value,max=40){
  if(typeof value!=='string')throw error('ROOM_WORLD_NAME','请给存档点填写名字');
  const text=value.trim().replace(/[\u0000-\u001f<>]/g,'');
  if(!text||[...text].length>max)throw error('ROOM_WORLD_NAME',`名字需要1至${max}个字`);
  return text;
}
export function worldJSON(value){
  const ancestors=new Set();let count=0;
  function visit(item,depth){
    if(++count>500000||depth>26)throw error('ROOM_WORLD_INVALID','楼层存档内容过多或嵌套过深');
    if(item===null||typeof item==='string'||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return item;
    if(!Array.isArray(item)&&!plain(item)||ancestors.has(item))throw error('ROOM_WORLD_INVALID','楼层存档需要无循环的普通JSON数据');
    if(Array.isArray(item)&&Object.keys(item).length!==item.length)throw error('ROOM_WORLD_INVALID','楼层存档列表不能有空缺');
    ancestors.add(item);const result=Array.isArray(item)?[]:{};
    for(const key of Object.keys(item)){
      const descriptor=Object.getOwnPropertyDescriptor(item,key);
      if(['__proto__','prototype','constructor'].includes(key)||!descriptor||!own(descriptor,'value'))throw error('ROOM_WORLD_INVALID','楼层存档字段不安全');
      result[key]=visit(descriptor.value,depth+1);
    }
    ancestors.delete(item);return result;
  }
  const result=visit(typeof value==='string'?JSON.parse(value):value,0);
  if(encoder.encode(JSON.stringify(result)).byteLength>8*1024*1024)throw error('ROOM_WORLD_FULL','楼层存档超过8MB上限');
  return result;
}

/** Economy validates storage, appearance and size slots using a temporary synthetic inventory. */
export function validateRoomSnapshot(input){
  const value=worldJSON(input);only(value,['name','template','scene','companion','extras']);
  value.name=worldName(value.name,18);
  if(!templates.includes(value.template))throw error('ROOM_WORLD_INVALID','楼层主题无效');
  only(value.scene,sceneKeys);only(value.companion,companionKeys);
  if(!plain(value.extras)||Object.keys(value.extras).length>20||Object.values(value.extras).some(raw=>raw!==null&&typeof raw!=='string'))throw error('ROOM_WORLD_INVALID','楼层附加记录无效');
  if(!Number.isInteger(value.scene.roomLevel)||!ROOM_TIERS[value.scene.roomLevel])throw error('ROOM_WORLD_INVALID','楼层房型无效');
  const gifts=new Set((Array.isArray(value.scene.stored)?value.scene.stored:[]).filter(sku=>giftProduct(sku)));
  for(const layout of [value.scene.layout,...Object.values(value.scene.layouts||{})]){
    validateSnapshotLayout(layout);
    if(layout?.furniture)for(const key of Object.keys(layout.furniture))if(key.startsWith('shop-')&&giftProduct(key.slice(5)))gifts.add(key.slice(5));
  }
  const baseline=createEconomy({storageAdapter:null}).getState();
  const raw=JSON.stringify({version:1,balance:0,totalSpent:0,petOwned:baseline.petOwned,activePet:baseline.activePet,claims:{learning:[],requests:[],rewards:[],spends:[]},
    owned:[...catalog.keys(),...gifts],maxRoomLevel:ROOM_TIERS.length-1,...value.scene});
  const account=createEconomy({storageAdapter:{getItem:()=>raw,setItem(){throw new Error('validation only');}}}).getState();
  if(!account.valid)throw error('ROOM_WORLD_INVALID',account.error?.message||'楼层场景无效');
  value.scene=Object.fromEntries(sceneKeys.map(key=>[key,account[key]]));
  const companion=validateCompanion({...defaultCompanion(),roomName:value.name,...value.companion});
  value.companion=Object.fromEntries(companionKeys.map(key=>[key,companion[key]]));
  value.extras=Object.fromEntries(Object.entries(value.extras).filter(([key])=>!historyKey(key)));
  return value;
}

export function snapshotRoom(room,{storageKey,legacyLayout}={}){
  const snapshot=validateRoomSnapshot({name:room.name,template:room.template,scene:Object.fromEntries(sceneKeys.map(key=>[key,room.scene[key]])),companion:room.companion,extras:room.extras});
  // Before the account ledger owned layouts, the renderer loaded this local
  // key directly. Promote the displayed legacy design into its actual size
  // slot so restoring a world cannot silently turn it into a default room.
  const raw=storageKey&&own(snapshot.extras,storageKey)?snapshot.extras[storageKey]:legacyLayout;
  if(snapshot.scene.layout===null&&typeof raw==='string'&&raw.trim()){
    snapshot.scene.layout=worldJSON(raw);
    snapshot.scene.layouts[String(snapshot.scene.roomLevel)]=snapshot.scene.layout;
    return validateRoomSnapshot(snapshot);
  }
  return snapshot;
}
function validateSnapshotLayout(layout){
  if(layout===null||layout===undefined)return;
  if(!plain(layout)||layout.version!==3||!plain(layout.furniture)||Object.keys(layout.furniture).length>256||layout.definitions!==undefined&&!plain(layout.definitions))throw error('ROOM_WORLD_INVALID','楼层布局版本或结构无效');
  const vector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
  for(const [key,transform]of Object.entries(layout.furniture)){
    const sku=key.startsWith('shop-')?key.slice(5):null;
    if(!builtin.has(key)&&!(sku&&(catalog.has(sku)&&catalog.get(sku).category!=='flooring'||giftProduct(sku))))throw error('ROOM_WORLD_INVALID','楼层存档包含未知家具');
    if(plain(transform)&&Number.isFinite(transform.scale))transform.scale=[transform.scale,transform.scale,transform.scale];
    if(!key||key.length>160||!plain(transform)||!vector(transform.position)||!vector(transform.rotation)||!vector(transform.scale)||transform.position.some(n=>Math.abs(n)>1000)||transform.scale.some(n=>n<.0001||n>100)||transform.rotation.some(n=>Math.abs(n)>1e6)||Math.abs(transform.rotation[0])>1e-8||Math.abs(transform.rotation[2])>1e-8)throw error('ROOM_WORLD_INVALID','家具位置、旋转或缩放无效');
    const definition=layout.definitions?.[key];
    if(sku&&!definition)throw error('ROOM_WORLD_INVALID','商店家具缺少碰撞定义');
    if(definition){
      if(!plain(definition)||!Array.isArray(definition.boxes)||!definition.boxes.length||definition.boxes.length>32||definition.boxes.some(box=>!plain(box)||!vector(box.center)||box.center.some(n=>Math.abs(n)>100)||!vector(box.size)||box.size.some(n=>n<.0001||n>100)))throw error('ROOM_WORLD_INVALID','家具碰撞定义无效');
      for(const flag of ['blocksNavigation','blocksPlacement','draggable'])if(own(definition,flag)&&typeof definition[flag]!=='boolean')throw error('ROOM_WORLD_INVALID','家具碰撞选项无效');
    }
  }
  if(layout.lampSupport!==undefined&&layout.lampSupport!==null&&(typeof layout.lampSupport!=='string'||!own(layout.furniture,layout.lampSupport)))throw error('ROOM_WORLD_INVALID','台灯支架无效');
}
export function defaultRoomWorld(createdAt){return {version:1,revision:0,updatedAt:createdAt,checkpoints:[]};}
export function validateRoomWorld(input,room){
  if(input===undefined)return defaultRoomWorld(room.createdAt);
  const value=worldJSON(input);only(value,['version','revision','updatedAt','checkpoints']);
  if(value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!date(value.updatedAt)||!Array.isArray(value.checkpoints)||value.checkpoints.length>MAX_ROOM_WORLD_SAVES)throw error('ROOM_WORLD_INVALID','楼层存档目录无效');
  const ids=new Set();
  for(const save of value.checkpoints){
    only(save,['id','roomId','name','createdAt','snapshot']);
    if(!id(save.id)||ids.has(save.id)||save.roomId!==room.id||!date(save.createdAt))throw error('ROOM_WORLD_INVALID','存档点编号、所属楼层或时间无效');
    ids.add(save.id);save.name=worldName(save.name);save.snapshot=validateRoomSnapshot(save.snapshot);
  }
  return value;
}
export function worldMetadata(room){const world=room.world||defaultRoomWorld(room.createdAt);return {revision:world.revision,updatedAt:world.updatedAt,checkpointCount:world.checkpoints.length};}
export const checkpointMetadata=save=>({id:save.id,roomId:save.roomId,name:save.name,createdAt:save.createdAt});
export function nextWorldRevision(world){if(world.revision===Number.MAX_SAFE_INTEGER)throw error('ROOM_WORLD_FULL','楼层存档版本已满，请先导出备份');world.revision++;world.updatedAt=new Date().toISOString();}
export function makeCheckpointId(existing){let value;do{value=`world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;}while(existing.some(item=>item.id===value));return value;}

/** Reconcile old local designs against today's inventory; never restore ownership or claims. */
export function applyRoomSnapshot(room,input,{owned,rewards=[],storageKey,sourceStorageKey=storageKey}={}){
  const saved=validateRoomSnapshot(input),current=room.scene;
  if(saved.scene.roomLevel>current.maxRoomLevel)throw error('ROOM_WORLD_LOCKED','这个存档使用尚未解锁的大房型，请先用积分扩建当前楼层');
  const owns=new Set(owned),now=Date.now();
  const available=sku=>{if(!owns.has(sku))return false;const gift=giftProduct(sku);if(!gift)return true;const reward=rewards.find(item=>item.id===gift.rewardId&&item.kind===gift.giftKind);return !!reward&&(!reward.expiresAt||Date.parse(reward.expiresAt)>now);};
  const storable=sku=>builtin.has(sku)||owns.has(sku)&&(catalog.get(sku)?.category!=='flooring'&&catalog.has(sku)||!!giftProduct(sku));
  const permitted=id=>!id.startsWith('shop-')||available(id.slice(5));
  function cleanLayout(input){
    if(input===null||input===undefined)return null;
    const layout=worldJSON(input);
    if(!plain(layout.furniture))throw error('ROOM_WORLD_INVALID','楼层布局缺少家具记录');
    for(const key of Object.keys(layout.furniture))if(!permitted(key))delete layout.furniture[key];
    if(plain(layout.definitions))for(const key of Object.keys(layout.definitions))if(!permitted(key))delete layout.definitions[key];
    if(layout.lampSupport&&!own(layout.furniture,layout.lampSupport))layout.lampSupport=null;
    return layout;
  }
  const layouts=Object.fromEntries(Object.entries(saved.scene.layouts).filter(([level])=>Number(level)<=current.maxRoomLevel).map(([level,layout])=>[level,cleanLayout(layout)]));
  const layout=cleanLayout(saved.scene.layout);layouts[String(saved.scene.roomLevel)]=layout;
  const placed=new Set(Object.keys(layout?.furniture||{}).map(key=>key.startsWith('shop-')?key.slice(5):key));
  const stored=new Set(saved.scene.stored.filter(storable));
  // Anything bought after this snapshot remains owned and waits in this floor's warehouse.
  for(const sku of owned)if(storable(sku)&&(!placed.has(sku)||!available(sku)))stored.add(sku);
  for(const slot of [layout,...Object.values(layouts)])if(slot?.furniture)for(const sku of stored){const key=builtin.has(sku)?sku:`shop-${sku}`;delete slot.furniture[key];if(slot.definitions)delete slot.definitions[key];if(slot.lampSupport===key)slot.lampSupport=null;}
  const appearance={...saved.scene.appearance};if(appearance.flooring&&!owns.has(appearance.flooring))appearance.flooring=null;
  room.name=saved.name;room.template=saved.template;
  room.scene={roomLevel:saved.scene.roomLevel,maxRoomLevel:current.maxRoomLevel,layout,layouts,stored:[...stored],appearance,requests:current.requests};
  room.companion=saved.companion;
  for(const key of Object.keys(room.companion.furnitureStyles))if(!permitted(key))delete room.companion.furnitureStyles[key];
  room.extras={...Object.fromEntries(Object.entries(room.extras).filter(([key])=>historyKey(key))),...Object.fromEntries(Object.entries(saved.extras).map(([key,value])=>[sourceStorageKey&&sourceStorageKey!==storageKey&&(key===sourceStorageKey||key.startsWith(sourceStorageKey+'-'))?storageKey+key.slice(sourceStorageKey.length):key,value]))};
  // Use the reconciled current layout, never a legacy extras copy containing unavailable gifts.
  room.extras[storageKey]=layout===null?null:JSON.stringify(layout);
  return room;
}

export function parseRoomWorldArchive(input){
  const archive=worldJSON(input);only(archive,['format','version','roomId','storageKey','exportedAt','snapshot']);
  if(archive.format!==ROOM_WORLD_FORMAT||archive.version!==1||!/^room-[1-6]$/.test(archive.roomId)||!date(archive.exportedAt)||archive.storageKey!==undefined&&(typeof archive.storageKey!=='string'||!archive.storageKey.trim()||archive.storageKey.length>160))throw error('ROOM_WORLD_INVALID','单层房屋存档格式无效');
  archive.snapshot=validateRoomSnapshot(archive.snapshot);return archive;
}
