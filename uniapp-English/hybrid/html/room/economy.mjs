import {acquireStorageLock} from './storage.mjs';
import {SURFACE_CATALOG,WALL_PAINTS} from './surface-catalog.mjs';
import {giftProduct} from './gift-catalog.mjs';

/**
 * 单账户、单键的同步学习积分账本。积分、产权、房级、布局一次写入，成功后才更新内存。
 * 这是客户端原型账本；正式排位/付费项目应由宿主服务端验证学习事件与账户交易。
 */
export const SHOP_CATALOG = Object.freeze([
  Object.freeze({sku:'clover-planter',name:'四叶草盆栽',price:120,description:'把一小片幸运绿意带进房间。',kind:'furniture'}),
  Object.freeze({sku:'reading-shelf',name:'阅读书架',price:260,description:'为每天学会的新词留一处安静角落。',kind:'furniture'}),
  Object.freeze({sku:'cloud-table',name:'云朵小桌',price:180,description:'圆润的小桌，陪伴每一次学习。',kind:'furniture'}),
  Object.freeze({sku:'moon-ornament',name:'月亮摆件',price:220,description:'给小屋添上一弯柔和的月亮。',kind:'furniture'}),
  Object.freeze({sku:'star-lamp',name:'星星夜灯',price:240,description:'会发光的星星小夜灯，把梦照得亮晶晶。',kind:'furniture'}),
  Object.freeze({sku:'mushroom-stool',name:'蘑菇小板凳',price:150,description:'红伞伞白点点，坐在上面等一朵好消息。',kind:'furniture'}),
  Object.freeze({sku:'beehive-ornament',name:'蜂巢摆件',price:210,description:'嗡嗡的小蜂巢，藏着今天学到的甜头。',kind:'furniture'}),
  Object.freeze({sku:'rocket-toy',name:'小火箭摆件',price:260,description:'蓄满勇气的小火箭，带你去更远的远方。',kind:'furniture'}),
  Object.freeze({sku:'rainbow-arch',name:'彩虹小拱门',price:300,description:'走过彩虹门下，每次进步都有颜色。',kind:'furniture'}),
  Object.freeze({sku:'candy-tree',name:'糖果小树',price:180,description:'长满糖果的小树，努力了就摘一颗。',kind:'furniture'}),
  ...SURFACE_CATALOG,
]);
/** 原创伙伴均为唯一产权；v2.23 单宠制：每人同时只养一只宠物，可用积分兑换更换。 */
export const PET_CATALOG = Object.freeze([
  Object.freeze({sku:'apricot-fox',name:'杏橘狐',price:0,description:'陪你住进小屋的第一位学习伙伴。',kind:'pet'}),
  Object.freeze({sku:'cloud-bunny',name:'云朵兔',price:300,description:'长耳朵和棉花尾巴，收藏每一个温柔的进步。',kind:'pet'}),
  Object.freeze({sku:'mint-cat',name:'薄荷猫',price:400,description:'薄荷色的小猫，和你一起享受安静的学习时光。',kind:'pet'}),
  Object.freeze({sku:'cocoa-bear',name:'可可熊',price:500,description:'暖暖的圆耳小熊，给认真学习的你一个拥抱。',kind:'pet'}),
  Object.freeze({sku:'starlight-penguin',name:'星光企鹅',price:650,description:'戴着星光的小企鹅，陪你探索更远的知识。',kind:'pet'}),
]);
export const ROOM_TIERS = Object.freeze([
  Object.freeze({level:0,name:'初始小屋',width:8.8,depth:8.2,price:0}),
  Object.freeze({level:1,name:'温馨大屋',width:10.8,depth:10.2,price:600}),
  Object.freeze({level:2,name:'宽敞大屋',width:12.8,depth:12.2,price:1500}),
]);
// v2.8.2：房间核心家具（自带 GLB，无购买产权）与固有家具一样可收回仓库/从仓库摆回。
// 场景层按 id 分派重建：sofa/table/lamp 走 GLB 加载，其余走 decor 构件。
export const BUILTIN_STORAGE = Object.freeze([
  Object.freeze({id:'sofa',name:'大沙发'}),
  Object.freeze({id:'table',name:'书桌'}),
  Object.freeze({id:'lamp',name:'小台灯'}),
  Object.freeze({id:'rug',name:'大地毯'}),
  Object.freeze({id:'lamp-cabinet',name:'小柜子'}),
  Object.freeze({id:'plant-shelf',name:'花架'}),
  Object.freeze({id:'wall-pictures',name:'装饰画'}),
  Object.freeze({id:'floor-pot',name:'地面盆栽'}),
  Object.freeze({id:'ottoman-a',name:'软凳A'}),
  Object.freeze({id:'ottoman-b',name:'软凳B'}),
  Object.freeze({id:'front-fence',name:'前栅栏'}),
]);
// 仓库可收纳的完整目录：商店家具（需产权）+ 房间固有家具。
export const STORAGE_CATALOG = Object.freeze([...SHOP_CATALOG.filter(item=>item.category!=='flooring'), ...BUILTIN_STORAGE]);

const CATALOG=new Map(SHOP_CATALOG.map(item=>[item.sku,item]));
const PETS=new Map(PET_CATALOG.map(item=>[item.sku,item]));
const DEFAULT_PET='apricot-fox';
const BUILTIN=new Map(BUILTIN_STORAGE.map(item=>[item.id,item]));
const STORAGE=new Map(STORAGE_CATALOG.map(item=>[item.sku??item.id,item]));
const storageProduct=sku=>STORAGE.get(sku)||giftProduct(sku);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const natural=value=>Number.isSafeInteger(value)&&value>=0;
const validId=value=>typeof value==='string'&&value.length<=160&&value.trim().length>0;
const MAX_LAYOUT_BYTES=262144,MAX_ACCOUNT_BYTES=1048576,MAX_CLAIMS=10000;
const bytes=value=>new TextEncoder().encode(value).byteLength;
class AccountError extends Error {constructor(code,message){super(message);this.code=code;}}
const fail=(code,message)=>{throw new AccountError(code,message);};
const errorInfo=error=>({code:error instanceof AccountError?error.code:'INVALID_ARGUMENT',message:error instanceof AccountError?error.message:'参数不是有效的普通 JSON 数据'});

// 不执行 toJSON 或 getter；返回完全独立的普通 JSON 副本。
// v2.17：账户可携带每种房型的布局（至多 3 份），节点预算相应放宽，防止 getState 拒读。
function copyJSON(input,{maxDepth=24,maxNodes=200000}={}) {
  const ancestors=new Set();let count=0;
  function visit(value,depth){
    if(++count>maxNodes||depth>maxDepth)fail('INVALID_LAYOUT','数据过大或嵌套过深');
    if(value===null||typeof value==='boolean'||typeof value==='string')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(!Array.isArray(value)&&!plain(value))fail('INVALID_LAYOUT','只允许有限的普通 JSON 数据');
    if(ancestors.has(value))fail('INVALID_LAYOUT','数据不能循环引用');
    ancestors.add(value);let result;
    if(Array.isArray(value)){
      result=[];
      for(let index=0;index<value.length;index++){
        const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
        if(!descriptor||!own(descriptor,'value'))fail('INVALID_LAYOUT','数组不能包含空槽或访问器');
        result.push(visit(descriptor.value,depth+1));
      }
    }else{
      result={};
      for(const key of Object.keys(value)){
        if(['__proto__','prototype','constructor'].includes(key))fail('INVALID_LAYOUT','字段名无效');
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(!descriptor||!own(descriptor,'value'))fail('INVALID_LAYOUT','数据不能包含访问器');
        result[key]=visit(descriptor.value,depth+1);
      }
    }
    ancestors.delete(value);return result;
  }
  return visit(input,0);
}
function layoutCopy(layout){
  if(layout!==null&&!plain(layout))fail('INVALID_LAYOUT','布局必须为普通 JSON 对象或 null');
  const copy=copyJSON(layout,{maxDepth:12,maxNodes:20000});
  if(bytes(JSON.stringify(copy))>MAX_LAYOUT_BYTES)fail('INVALID_LAYOUT','布局超过 256KB 上限');
  return copy;
}
function onlyKeys(value,allowed,code='INVALID_ARGUMENT'){
  if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(code,'参数结构或字段无效');
}
function inputCopy(input,allowed){
  onlyKeys(input,allowed);const prepared={};
  for(const key of Object.keys(input)){
    const descriptor=Object.getOwnPropertyDescriptor(input,key);
    if(!descriptor||!own(descriptor,'value'))fail('INVALID_ARGUMENT','参数不能包含访问器');
    // 便于宿主转发解构后的可选参数；布局内部仍须为严格 JSON。
    if(descriptor.value!==undefined)prepared[key]=descriptor.value;
  }
  return copyJSON(prepared);
}
function parseAccount(raw){
  if(typeof raw!=='string'||bytes(raw)>MAX_ACCOUNT_BYTES)fail('INVALID_STATE','账户存档过大或不是 JSON 文本');
  let account;try{account=copyJSON(JSON.parse(raw));}catch{fail('INVALID_STATE','账户存档损坏，请由宿主恢复');}
  onlyKeys(account,['version','balance','roomLevel','maxRoomLevel','owned','stored','layout','layouts','claims','totalSpent','petOwned','activePet','appearance'],'INVALID_STATE');
  if(account.version!==1||!natural(account.balance)||!natural(account.roomLevel)||!ROOM_TIERS[account.roomLevel])fail('INVALID_STATE','账户版本、积分或房屋等级无效');
  // Older saves can have already switched down. Recover paid unlocks from
  // structurally valid expansion receipts instead of forgetting them.
  if(account.maxRoomLevel===undefined){
    account.maxRoomLevel=account.roomLevel;
    if(Array.isArray(account.claims?.requests))for(const request of account.claims.requests){
      if(plain(request)&&request.operation==='expand'&&validId(request.id)&&Number.isInteger(request.level)&&request.level>=1&&ROOM_TIERS[request.level])account.maxRoomLevel=Math.max(account.maxRoomLevel,request.level);
    }
  }
  if(!natural(account.maxRoomLevel)||!ROOM_TIERS[account.maxRoomLevel]||account.maxRoomLevel<account.roomLevel)fail('INVALID_STATE','账户房屋档位记录无效');
  // 旧存档没有 totalSpent：累计消费统计（购买/扩建）为 0，向后兼容。
  if(!natural(account.totalSpent))account.totalSpent=0;
  if(!Array.isArray(account.owned)||new Set(account.owned).size!==account.owned.length||account.owned.some(sku=>!CATALOG.has(sku)&&!giftProduct(sku)))fail('INVALID_STATE','家具产权存档无效');
  if(!own(account,'appearance'))account.appearance={wallColor:'cream',flooring:null};
  onlyKeys(account.appearance,['wallColor','flooring'],'INVALID_STATE');
  if(!validWallColor(account.appearance.wallColor)||!(account.appearance.flooring===null||(CATALOG.get(account.appearance.flooring)?.category==='flooring'&&account.owned.includes(account.appearance.flooring))))fail('INVALID_STATE','墙面或地砖存档无效');
  // 旧账户无宠物字段时保留全部家具、积分与布局，补发默认伙伴。
  if(!own(account,'petOwned'))account.petOwned=[DEFAULT_PET];
  if(!own(account,'activePet'))account.activePet=DEFAULT_PET;
  if(typeof account.activePet!=='string'||!PETS.has(account.activePet))fail('INVALID_STATE','当前宠物存档无效');
  if(!Array.isArray(account.petOwned)||new Set(account.petOwned).size!==account.petOwned.length||account.petOwned.some(sku=>!PETS.has(sku)))fail('INVALID_STATE','宠物产权存档无效');
  // v2.23 单宠制：每个人同时只养一只宠物，宠物列表恒为当前伙伴。
  // 唯一合法迁移是“旧档拥有多只合法宠物”→只保留当前陪伴的那只；
  // 其余不一致（空列表、宠物与当前伙伴对不上）一律拒绝，避免篡改或免费获得宠物。
  if(account.petOwned.length>1&&account.petOwned.includes(account.activePet))account.petOwned=[account.activePet];
  else if(account.petOwned.length!==1||account.petOwned[0]!==account.activePet)fail('INVALID_STATE','当前宠物存档无效');
  // v2.8：仓库（已购买但收进仓库、暂不摆放）。旧存档缺失补空数组；
  // 商店家具必须自己拥有；固有家具（BUILTIN）默认拥有。库存无重复。
  if(!Array.isArray(account.stored))account.stored=[];
  if(new Set(account.stored).size!==account.stored.length||account.stored.some(sku=>!storageProduct(sku)||(!BUILTIN.has(sku)&&!account.owned.includes(sku))))fail('INVALID_STATE','家具库存存档无效');
  try{account.layout=layoutCopy(account.layout);}catch{fail('INVALID_STATE','账户布局存档无效');}
  // v2.17：每种房型独立保存布局。layouts 以房级字符串为键，旧存档缺失时按当前房级回填。
  if(!own(account,'layouts'))account.layouts={};
  if(!plain(account.layouts))fail('INVALID_STATE','房型布局存档无效');
  const roomLevelKeys=ROOM_TIERS.map(tier=>String(tier.level));
  if(Object.keys(account.layouts).some(key=>!roomLevelKeys.includes(key))||Object.keys(account.layouts).length>8)fail('INVALID_STATE','房型布局存档无效');
  for(const key of roomLevelKeys){
    const value=account.layouts[key];
    if(value===undefined||value===null)continue;
    try{account.layouts[key]=layoutCopy(value);}catch{fail('INVALID_STATE','房型布局存档无效');}
  }
  // 当前房级的别名 account.layout 必须与 layouts[当前房级] 一致。
  // 仅当别名非空且槽位缺失时才回填：空布局不产生 {'0':null} 幽灵键，
  // 保证“运行态 getState()”与“重新解析后的 getState()”形状一致（存档冲突比对依赖这一点）。
  if(account.layout!==null&&account.layout!==undefined&&(account.layouts[String(account.roomLevel)]===null||account.layouts[String(account.roomLevel)]===undefined))account.layouts[String(account.roomLevel)]=account.layout;
  const claims=account.claims;
  onlyKeys(claims,['learning','requests','rewards','spends'],'INVALID_STATE');
  if(!Array.isArray(claims.learning)||claims.learning.length>MAX_CLAIMS||claims.learning.some(id=>!validId(id))||new Set(claims.learning).size!==claims.learning.length)fail('INVALID_STATE','学习事件记录无效');
  // 交易请求（购买/扩建/收仓/取出）幂等去重记录。上限与写入端一致（MAX_CLAIMS），
  // 不能按“仅购买+扩建”估算：v2.8 仓库的 store/unstore 也带 requestId 入账。
  if(!Array.isArray(claims.requests)||claims.requests.length>MAX_CLAIMS)fail('INVALID_STATE','交易记录无效');
  // 扣减记录（v2.7/batch1，补签卡等消耗积分用）：旧档缺失补空数组。
  if(!Array.isArray(claims.spends))claims.spends=[];
  if(claims.spends.length>MAX_CLAIMS||claims.spends.some(item=>!plain(item)||!validId(item.id)||!natural(item.points)||item.points<1||item.points>100000))fail('INVALID_STATE','扣减记录无效');
  const spendIds=new Set();for(const item of claims.spends){if(spendIds.has(item.id))fail('INVALID_STATE','扣减编号重复');spendIds.add(item.id);}
  const ids=new Set();
  for(const request of claims.requests){
    if(!plain(request)||!validId(request.id)||ids.has(request.id))fail('INVALID_STATE','交易编号记录无效');
    ids.add(request.id);
    if(request.operation==='purchase'){
      onlyKeys(request,['id','operation','sku','points'],'INVALID_STATE');
      if(request.points!==undefined&&request.points!==CATALOG.get(request.sku)?.price)fail('INVALID_STATE','购买积分记录无效');
      if(!account.owned.includes(request.sku))fail('INVALID_STATE','交易与家具产权不一致');
    }else if(request.operation==='grant-gift'){
      onlyKeys(request,['id','operation','sku'],'INVALID_STATE');
      if(!giftProduct(request.sku)||!account.owned.includes(request.sku))fail('INVALID_STATE','礼物领取记录无效');
    }else if(request.operation==='purchase-pet'){
      onlyKeys(request,['id','operation','sku'],'INVALID_STATE');
      // 单宠制下兑换会请新伙伴入住、旧伙伴去休息，因此只核对宠物目录，不与最终 petOwned 交叉校验。
      if(!PETS.has(request.sku))fail('INVALID_STATE','交易与宠物目录不一致');
    }else if(request.operation==='create-room'){
      onlyKeys(request,['id','operation','level','points'],'INVALID_STATE');
      if(request.points!==undefined&&(!natural(request.points)||request.points>100000))fail('INVALID_STATE','楼层扩建积分记录无效');
      if(!Number.isInteger(request.level)||request.level<0||request.level>6)fail('INVALID_STATE','楼层扩建交易记录无效');
    }else if(request.operation==='copy-design'){
      onlyKeys(request,['id','operation','level','designHash'],'INVALID_STATE');
      if(!Number.isInteger(request.level)||!ROOM_TIERS[request.level]||typeof request.designHash!=='string'||!/^[a-f0-9]{16}$/.test(request.designHash))fail('INVALID_STATE','装修复制记录无效');
    }else if(request.operation==='expand'){
      onlyKeys(request,['id','operation','level','points'],'INVALID_STATE');
      if(request.points!==undefined&&request.points!==ROOM_TIERS[request.level]?.price)fail('INVALID_STATE','房型扩建积分记录无效');
      if(!Number.isInteger(request.level)||request.level<1||request.level>account.maxRoomLevel)fail('INVALID_STATE','扩建交易记录无效');
    }else if(request.operation==='set-room'){
      onlyKeys(request,['id','operation','level'],'INVALID_STATE');
      if(!Number.isInteger(request.level)||request.level<0||request.level>account.maxRoomLevel)fail('INVALID_STATE','房屋切换交易记录无效');
    }else if(request.operation==='store'||request.operation==='unstore'){
      onlyKeys(request,['id','operation','sku'],'INVALID_STATE');
      if(!storageProduct(request.sku))fail('INVALID_STATE','回收/取出交易与仓库目录不一致');
      if(!BUILTIN.has(request.sku)&&!account.owned.includes(request.sku))fail('INVALID_STATE','回收/取出交易与家具产权不一致');
      // 不做「与最终 stored 状态」的交叉校验：store→unstore 成对出现时最终 stored 不含该件，
      // 若按终态校验会让正常操作序列在重载时被判 INVALID_STATE，账本无法复原。
    }else if(request.operation==='store-all'){
      onlyKeys(request,['id','operation'],'INVALID_STATE');
    }else fail('INVALID_STATE','交易类型无效');
  }
  // 旧存档可能没有 rewards 键；读取时补齐并校验（签到/升级等通用积分入账，幂等）。
  if(!Array.isArray(claims.rewards))claims.rewards=[];
  if(claims.rewards.length>MAX_CLAIMS||claims.rewards.some(item=>!plain(item)||!validId(item.id)||!natural(item.points)||item.points<1||item.points>100000))fail('INVALID_STATE','奖励记录无效');
  const rewardIds=new Set();for(const item of claims.rewards){if(rewardIds.has(item.id))fail('INVALID_STATE','奖励编号重复');rewardIds.add(item.id);}
  return account;
}

export function createEconomy({storageAdapter,storageKey='original-pet-room-account-v1',onEvent,initialBalance=0}={}){
  let account={version:1,balance:natural(initialBalance)?initialBalance:0,roomLevel:0,maxRoomLevel:0,owned:[],stored:[],layout:null,layouts:{},appearance:{wallColor:'cream',flooring:null},claims:{learning:[],requests:[],rewards:[],spends:[]},totalSpent:0,petOwned:[DEFAULT_PET],activePet:DEFAULT_PET};
  let adapter=null,loadError=null,writeError=null,busy=false,lastPersisted=null;
  try{
    if(!natural(initialBalance))fail('INVALID_INITIAL_BALANCE','初始积分必须为非负安全整数');
    if(typeof storageKey!=='string'||!storageKey.trim())fail('INVALID_STORAGE_KEY','账户存储键无效');
    // 仅在创建账户时读取宿主存储；模块导入本身不访问 window/localStorage。
    if(storageAdapter===undefined){
      try{adapter=globalThis.localStorage;}catch{fail('STORAGE_UNAVAILABLE','当前环境无法访问账户存储');}
      if(!adapter)fail('STORAGE_UNAVAILABLE','当前环境没有账户存储，请显式传入存储适配器');
    }else adapter=storageAdapter;
    if(adapter!==null&&(typeof adapter?.getItem!=='function'||typeof adapter?.setItem!=='function'))fail('STORAGE_UNAVAILABLE','账户存储适配器无效');
    if(adapter&&[adapter.getItem,adapter.setItem].some(fn=>fn.constructor?.name==='AsyncFunction'))fail('STORAGE_UNAVAILABLE','账户需要同步存储适配器，请先加载宿主数据到同步缓存');
    if(adapter){
      let raw;try{raw=adapter.getItem(storageKey);}catch{fail('STORAGE_READ_FAILED','无法读取账户存档，未创建替代账户');}
      if(raw!==null){account=parseAccount(raw);lastPersisted=raw;}
    }
  }catch(error){loadError=error instanceof AccountError?{code:error.code,message:error.message}:{code:'STORAGE_READ_FAILED',message:'无法读取账户存档'};}

  function getState(){
    return copyJSON({...account,valid:!loadError&&!writeError,writable:!loadError&&!writeError,error:loadError||writeError,
      pets:{catalog:PET_CATALOG,owned:account.petOwned,active:account.activePet},
      catalog:SHOP_CATALOG,tiers:ROOM_TIERS,nextTier:ROOM_TIERS[account.maxRoomLevel+1]||null});
  }
  const reply=(ok,code,message)=>({ok,code,message,state:getState()});
  function ensureCurrentArchive(){
    if(!adapter)return;
    let current;
    try{current=adapter.getItem(storageKey);}catch{writeError={code:'STORAGE_READ_FAILED',message:'无法确认账户存档，本次未变更'};fail(writeError.code,writeError.message);}
    if(current!==lastPersisted){writeError={code:'ARCHIVE_CONFLICT',message:'账户存档已被其他页面或账户修改，请重新挂载房间'};fail(writeError.code,writeError.message);}
  }
  function transaction(operation,mutate){
    if(loadError)return reply(false,loadError.code,loadError.message);
    if(busy)return reply(false,'BUSY','账户正在保存，请稍后重试');
    const releaseLock=acquireStorageLock(adapter,[storageKey]);
    if(!releaseLock)return reply(false,'BUSY','另一个房间实例正在保存此账户，请稍后重试');
    busy=true;let changed=false,result;
    try{
      ensureCurrentArchive();
      const candidate=copyJSON(account),verdict=mutate(candidate);
      if(verdict?.unchanged)result=reply(true,verdict.code||'ALREADY_APPLIED',verdict.message||'此事件已处理');
      else{
        if(!natural(candidate.balance))fail('BALANCE_OVERFLOW','积分超出安全整数范围');
        if(!natural(candidate.totalSpent))fail('BALANCE_OVERFLOW','累计消费超出安全整数范围');
        if(candidate.claims.learning.length>MAX_CLAIMS||candidate.claims.requests.length>MAX_CLAIMS||candidate.claims.rewards.length>MAX_CLAIMS||candidate.claims.spends.length>MAX_CLAIMS)fail('ACCOUNT_FULL','事件记录已满，请联系宿主归档');
        const encoded=JSON.stringify(candidate);
        if(bytes(encoded)>MAX_ACCOUNT_BYTES)fail('ACCOUNT_FULL','账户存档超过 1MB 上限');
        if(adapter){
          try{
            // 多标签页并发写保护：落盘前重读一次，外部已改则拒绝本次写入，避免旧快照覆盖新数据。
            // 初始为空的两个页面也必须比较 null，避免第二个页面覆盖第一个页面的购买与扣分。
            ensureCurrentArchive();
            const saved=adapter.setItem(storageKey,encoded);if(saved&&typeof saved.then==='function'){Promise.resolve(saved).catch(()=>{});throw new Error('需要同步存储适配器');}
            lastPersisted=encoded;
          }catch{if(!writeError)writeError={code:'STORAGE_WRITE_FAILED',message:'账户保存失败，本次积分、产权和布局均未变更'};fail(writeError.code,writeError.message);}
        }
        account=candidate;writeError=null;changed=true;result=reply(true,'OK',verdict?.message||'账户已保存');
      }
    }catch(error){const detail=errorInfo(error);result=reply(false,detail.code,detail.message);}
    finally{busy=false;releaseLock();}
    if(changed)try{onEvent?.('account-change',{operation,state:getState()});}catch{/* 宿主回调异常不能推翻已经保存的交易。 */}
    return result;
  }
  function optionsCopy(options){
    if(options===undefined)return {};
    const copy=inputCopy(options,['layout','requestId']);
    if(own(copy,'requestId')&&!validId(copy.requestId))fail('INVALID_REQUEST_ID','交易编号必须为非空短字符串');
    if(own(copy,'layout'))copy.layout=layoutCopy(copy.layout);
    return copy;
  }
  function replay(candidate,requestId,operation,sku){
    if(requestId===undefined)return false;
    const previous=candidate.claims.requests.find(request=>request.id===requestId);
    if(!previous)return false;
    if(previous.operation!==operation||((operation==='purchase'||operation==='grant-gift'||operation==='purchase-pet'||operation==='store'||operation==='unstore')&&previous.sku!==sku))fail('REQUEST_ID_REUSED','交易编号已用于其他操作');
    return true;
  }
  // v2.17：布局别名与房型槽位同步写入，保证 account.layout === layouts[当前房级]。
  function applyLayoutInput(candidate,input){
    candidate.layout=input.layout;
    if(candidate.layouts)candidate.layouts[String(candidate.roomLevel)]=candidate.layout;
  }
  function purchase(sku,options){
    return transaction('purchase',candidate=>{
      if(typeof sku!=='string'||!CATALOG.has(sku))fail('UNKNOWN_SKU','没有这件商店家具');
      const input=optionsCopy(options);
      if(replay(candidate,input.requestId,'purchase',sku))return {unchanged:true};
      if(candidate.owned.includes(sku))fail('ALREADY_OWNED','你已经拥有这件家具');
      const item=CATALOG.get(sku);if(candidate.balance<item.price)fail('INSUFFICIENT_POINTS','学习积分不足');
      candidate.balance-=item.price;candidate.owned.push(sku);candidate.totalSpent+=item.price;
      if(item.category==='flooring')candidate.appearance.flooring=sku;
      if(own(input,'layout'))applyLayoutInput(candidate,input);
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'purchase',sku});
      return {message:`已购买${item.name}`};
    });
  }
  function grantGift(sku,requestId){
    return transaction('grant-gift',candidate=>{
      const product=giftProduct(sku);if(!product)fail('UNKNOWN_GIFT','没有这份礼物');
      if(!validId(requestId))fail('INVALID_REQUEST_ID','礼物需要唯一领取编号');
      if(replay(candidate,requestId,'grant-gift',sku))return {unchanged:true};
      if(candidate.owned.includes(sku))return {unchanged:true};
      candidate.owned.push(sku);candidate.stored.push(sku);candidate.claims.requests.push({id:requestId,operation:'grant-gift',sku});
      return {message:'礼物已经收进仓库，可以自由摆放啦～'};
    });
  }
  function expand(options){
    return transaction('expand',candidate=>{
      const input=optionsCopy(options);if(replay(candidate,input.requestId,'expand'))return {unchanged:true};
      const tier=ROOM_TIERS[candidate.maxRoomLevel+1];if(!tier)fail('MAX_ROOM_LEVEL','房屋已经扩建到最高等级');
      if(candidate.balance<tier.price)fail('INSUFFICIENT_POINTS','学习积分不足');
      candidate.balance-=tier.price;candidate.totalSpent+=tier.price;
      // v2.17：先保存扩建前的房型布置；新房型第一次进入时沿用当前布置。
      const previous=candidate.roomLevel;
      if(own(input,'layout'))candidate.layouts[String(previous)]=input.layout;
      if(tier.level>candidate.maxRoomLevel)candidate.maxRoomLevel=tier.level;
      candidate.roomLevel=tier.level;
      const saved=candidate.layouts[String(tier.level)];
      if(saved!==undefined&&saved!==null){candidate.layout=saved;}
      else if(own(input,'layout')){candidate.layouts[String(tier.level)]=input.layout;candidate.layout=input.layout;}
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'expand',level:tier.level});
      return {message:`已扩建为${tier.name}`};
    });
  }
  // v2.10：在已购档位内随意切换房屋大小（换回原来的尺寸）。缩小/同档免费、不退款、不扣积分；
  // 仅改变房级与布局快照，家具产权与积分不变。换小前需先收回仓库一些家具。
  function setRoomLevel(level,options){
    return transaction('set-room',candidate=>{
      if(!Number.isInteger(level)||level<0||!ROOM_TIERS[level])fail('INVALID_ROOM_LEVEL','目标房屋档位不存在');
      if(level>candidate.maxRoomLevel)fail('LOCKED_ROOM_LEVEL','尚未解锁这一档房屋，请先扩建');
      const input=optionsCopy(options);
      if(replay(candidate,input.requestId,'set-room'))return {unchanged:true};
      if(level===candidate.roomLevel)return {unchanged:true,code:'SAME_ROOM_LEVEL',message:'小屋已是这个大小'};
      const tier=ROOM_TIERS[level],previous=candidate.roomLevel;
      // v2.17：每种房型独立保存布局——先把当前房型的摆放存入对应槽位，
      // 再切换到目标房型自己的布局（第一次进入时沿用当前布置）。
      if(own(input,'layout'))candidate.layouts[String(previous)]=input.layout;
      else { // 宿主导航（不带布局快照）也不能让当前房型槽位悬空：以当前别名为准。
        candidate.layouts[String(previous)]=candidate.layout;
      }
      candidate.roomLevel=level;
      const saved=candidate.layouts[String(level)];
      if(saved!==undefined&&saved!==null){candidate.layout=saved;}
      else if(own(input,'layout')){candidate.layouts[String(level)]=input.layout;candidate.layout=input.layout;}
      else {candidate.layouts[String(level)]=candidate.layout;}
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'set-room',level});
      return {message:`小屋已切换为${tier.name}`};
    });
  }
  function purchasePet(sku,options){
    return transaction('purchase-pet',candidate=>{
      if(typeof sku!=='string'||!PETS.has(sku))fail('UNKNOWN_PET','没有这只商店宠物');
      const input=typeof options==='string'?{requestId:options}:options===undefined?{}:inputCopy(options,['requestId']);
      if(own(input,'requestId')&&!validId(input.requestId))fail('INVALID_REQUEST_ID','交易编号必须为非空短字符串');
      if(replay(candidate,input.requestId,'purchase-pet',sku))return {unchanged:true};
      // v2.23 单宠制：同一时刻只养一只宠物。兑换即“请新伙伴入住、原来的伙伴先去休息”，
      // 宠物产权列表始终只有当前陪伴的一只；重复兑换当前伙伴视为已拥有。
      if(candidate.activePet===sku)return {unchanged:true,code:'ALREADY_OWNED',message:'这只宠物正在陪伴你'};
      const item=PETS.get(sku);
      if(candidate.balance<item.price)fail('INSUFFICIENT_POINTS','学习积分不足');
      candidate.balance-=item.price;candidate.totalSpent+=item.price;
      candidate.petOwned=[sku];candidate.activePet=sku;
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'purchase-pet',sku});
      return {message:`已兑换${item.name}，它已来到你的小屋（原来的伙伴先去休息啦）`};
    });
  }
  function selectPet(sku){
    return transaction('select-pet',candidate=>{
      if(typeof sku!=='string'||!PETS.has(sku))fail('UNKNOWN_PET','没有这只宠物');
      if(!candidate.petOwned.includes(sku))fail('NOT_OWNED','请先用积分兑换这只宠物');
      if(candidate.activePet===sku)return {unchanged:true,code:'ALREADY_SELECTED',message:'这只宠物正在陪伴你'};
      candidate.activePet=sku;return {message:`已切换为${PETS.get(sku).name}`};
    });
  }
  // 通用积分入账（签到、升级奖励等）：eventId 幂等，与学习事件互相独立，供个人主页等模块调用。
  function reward(input){
    return transaction('reward',candidate=>{
      const copy=inputCopy(input,['eventId','points','reason']);
      if(!validId(copy.eventId))fail('INVALID_EVENT_ID','奖励编号需要非空短字符串');
      if(!natural(copy.points)||copy.points<1||copy.points>100000)fail('INVALID_REWARD','奖励积分需为 1–100000 的整数');
      if(candidate.claims.rewards.some(item=>item.id===copy.eventId))return {unchanged:true,code:'ALREADY_APPLIED',message:'此奖励已入账'};
      candidate.balance+=copy.points;candidate.claims.rewards.push({id:copy.eventId,points:copy.points});
      return {message:`已获得 ${copy.points} 积分`};
    });
  }
  function creditLearning(input){
    return transaction('learning',candidate=>{
      const copy=inputCopy(input,['eventId','learned','reviewed','checkIn']);
      const {eventId,learned=0,reviewed=0,checkIn=false}=copy;
      if(!validId(eventId))fail('INVALID_EVENT_ID','学习事件需要非空短编号');
      if(!natural(learned)||learned>100||!natural(reviewed)||reviewed>100||typeof checkIn!=='boolean')fail('INVALID_LEARNING','新词、复习各限 0–100 个整数，签到必须为布尔值');
      if(candidate.claims.learning.includes(eventId))return {unchanged:true,code:'ALREADY_CLAIMED',message:'此学习事件已领取积分'};
      const earned=learned*10+reviewed*5+(checkIn?20:0);
      if(!earned)fail('EMPTY_LEARNING','此学习事件没有可领取的积分');
      candidate.balance+=earned;candidate.claims.learning.push(eventId);return {message:`已获得${earned}学习积分`};
    });
  }
    // 幂等扣减（v2.7/batch1，补签卡等消耗积分用）：eventId 去重，余额不足拒绝，不产生负余额。
  function spend(input){
    return transaction('spend',candidate=>{
      const copy=inputCopy(input,['eventId','points','reason']);
      if(!validId(copy.eventId))fail('INVALID_EVENT_ID','扣减编号需要非空短字符串');
      if(!natural(copy.points)||copy.points<1||copy.points>100000)fail('INVALID_SPEND','扣减积分需为 1–100000 的整数');
      if(candidate.claims.spends.some(item=>item.id===copy.eventId))return {unchanged:true,code:'ALREADY_APPLIED',message:'此扣减已入账'};
      if(candidate.balance<copy.points)fail('INSUFFICIENT_POINTS','学习积分不足');
      candidate.balance-=copy.points;candidate.claims.spends.push({id:copy.eventId,points:copy.points});
      return {message:`已扣除 ${copy.points} 积分`};
    });
  }
  function setLayout(layout){return transaction('layout',candidate=>{candidate.layout=layoutCopy(layout);if(candidate.layouts)candidate.layouts[String(candidate.roomLevel)]=candidate.layout;return {message:'装修布局已保存'};});}
  function setAppearance(patch){return transaction('appearance',candidate=>{
    const input=inputCopy(patch,['wallColor','flooring']);
    if(own(input,'wallColor')){if(!validWallColor(input.wallColor))fail('INVALID_COLOR','请选择墙面颜色');candidate.appearance.wallColor=input.wallColor;}
    if(own(input,'flooring')){
      if(input.flooring!==null&&(CATALOG.get(input.flooring)?.category!=='flooring'||!candidate.owned.includes(input.flooring)))fail('NOT_OWNED','请先兑换这套地砖');
      candidate.appearance.flooring=input.flooring;
    }
    return {message:'房间配色已保存'};
  });}
  // v2.8 仓库：已购买家具可在装修里收回仓库（不出现在房间），也可从仓库重新摆回。
  // 回收/取出都不改变积分与产权，只改变库存（stored）与摆放布局，一次事务落账。
  function storeFurniture(sku,options){
    return transaction('store',candidate=>{
      const meta=storageProduct(sku);
      if(!meta)return fail('UNKNOWN_SKU','没有这件家具');
      const input=optionsCopy(options);
      if(replay(candidate,input.requestId,'store',sku))return {unchanged:true};
      if(!BUILTIN.has(sku)&&!candidate.owned.includes(sku))fail('NOT_OWNED','你还没有这件家具');
      if(candidate.stored.includes(sku))fail('ALREADY_STORED','这件家具已经在仓库里');
      candidate.stored.push(sku);
      if(own(input,'layout'))applyLayoutInput(candidate,input);
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'store',sku});
      return {message:'家具已收回仓库'};
    });
  }
  function unstoreFurniture(sku,options){
    return transaction('unstore',candidate=>{
      const meta=storageProduct(sku);
      if(!meta)return fail('UNKNOWN_SKU','没有这件家具');
      const input=optionsCopy(options);
      if(replay(candidate,input.requestId,'unstore',sku))return {unchanged:true};
      if(!candidate.stored.includes(sku))fail('NOT_STORED','这件家具不在仓库里');
      candidate.stored=candidate.stored.filter(item=>item!==sku);
      if(own(input,'layout'))applyLayoutInput(candidate,input);
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'unstore',sku});
      return {message:'家具已摆回房间'};
    });
  }
  function storeAllFurniture(options){return transaction('store-all',candidate=>{
    const input=optionsCopy(options);if(replay(candidate,input.requestId,'store-all'))return {unchanged:true};
    if(!own(input,'layout'))fail('INVALID_LAYOUT','全部收纳需要完整布局快照');
    const layout=layoutCopy(input.layout);
    if(!layout||layout.version!==3||!plain(layout.furniture)||Object.keys(layout.furniture).length||!plain(layout.definitions)||Object.keys(layout.definitions).length||layout.lampSupport!==null)fail('INVALID_LAYOUT','全部收纳后的布局应为空');
    const stored=[...BUILTIN_STORAGE.map(item=>item.id),...candidate.owned.filter(sku=>CATALOG.get(sku)?.category!=='flooring')];
    const count=stored.filter(sku=>!candidate.stored.includes(sku)).length;
    candidate.stored=stored;applyLayoutInput(candidate,{layout});
    if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'store-all'});
    return {count,message:count?`收好啦！${count} 件家具都回仓库休息啦，积分和收藏都还在～`:'房间已经收拾干净啦，宝贝们都在仓库里～'};
  });}
  // v2.17：读取某一种房型自己保存的布局（未保存过返回 null），供切换房型时恢复摆放。
  function getRoomLayout(level){
    const key=String(Number.isInteger(level)&&level>=0?level:account.roomLevel);
    const value=account.layouts&&own(account.layouts,key)?account.layouts[key]:null;
    return value===null||value===undefined?null:layoutCopy(value);
  }
  return {getState,getLayout:()=>layoutCopy(account.layout),getRoomLayout,purchase,grantGift,expand,setRoomLevel,purchasePet,selectPet,creditLearning,reward,spend,setLayout,setAppearance,storeFurniture,unstoreFurniture,storeAllFurniture};
}
function validWallColor(value){return typeof value==='string'&&(/^#[0-9a-fA-F]{6}$/.test(value)||WALL_PAINTS.some(paint=>paint.id===value));}
