/**
 * 单账户、单键的同步学习积分账本。积分、产权、房级、布局一次写入，成功后才更新内存。
 * 这是客户端原型账本；正式排位/付费项目应由宿主服务端验证学习事件与账户交易。
 */
export const SHOP_CATALOG = Object.freeze([
  Object.freeze({sku:'clover-planter',name:'四叶草盆栽',price:120,description:'把一小片幸运绿意带进房间。',kind:'furniture'}),
  Object.freeze({sku:'reading-shelf',name:'阅读书架',price:260,description:'为每天学会的新词留一处安静角落。',kind:'furniture'}),
  Object.freeze({sku:'cloud-table',name:'云朵小桌',price:180,description:'圆润的小桌，陪伴每一次学习。',kind:'furniture'}),
  Object.freeze({sku:'moon-ornament',name:'月亮摆件',price:220,description:'给小屋添上一弯柔和的月亮。',kind:'furniture'}),
]);
export const ROOM_TIERS = Object.freeze([
  Object.freeze({level:0,name:'初始小屋',width:8.8,depth:8.2,price:0}),
  Object.freeze({level:1,name:'温馨大屋',width:10.8,depth:10.2,price:600}),
  Object.freeze({level:2,name:'宽敞大屋',width:12.8,depth:12.2,price:1500}),
]);

const CATALOG=new Map(SHOP_CATALOG.map(item=>[item.sku,item]));
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
function copyJSON(input,{maxDepth=20,maxNodes=50000}={}) {
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
  onlyKeys(account,['version','balance','roomLevel','owned','layout','claims','totalSpent'],'INVALID_STATE');
  if(account.version!==1||!natural(account.balance)||!natural(account.roomLevel)||!ROOM_TIERS[account.roomLevel])fail('INVALID_STATE','账户版本、积分或房屋等级无效');
  // 旧存档没有 totalSpent：累计消费统计（购买/扩建）为 0，向后兼容。
  if(!natural(account.totalSpent))account.totalSpent=0;
  if(!Array.isArray(account.owned)||new Set(account.owned).size!==account.owned.length||account.owned.some(sku=>!CATALOG.has(sku)))fail('INVALID_STATE','家具产权存档无效');
  try{account.layout=layoutCopy(account.layout);}catch{fail('INVALID_STATE','账户布局存档无效');}
  const claims=account.claims;
  onlyKeys(claims,['learning','requests','rewards','spends'],'INVALID_STATE');
  if(!Array.isArray(claims.learning)||claims.learning.length>MAX_CLAIMS||claims.learning.some(id=>!validId(id))||new Set(claims.learning).size!==claims.learning.length)fail('INVALID_STATE','学习事件记录无效');
  if(!Array.isArray(claims.requests)||claims.requests.length>SHOP_CATALOG.length+ROOM_TIERS.length-1)fail('INVALID_STATE','交易记录无效');
  // 扣减记录（v2.7/batch1，补签卡等消耗积分用）：旧档缺失补空数组。
  if(!Array.isArray(claims.spends))claims.spends=[];
  if(claims.spends.length>MAX_CLAIMS||claims.spends.some(item=>!plain(item)||!validId(item.id)||!natural(item.points)||item.points<1||item.points>100000))fail('INVALID_STATE','扣减记录无效');
  const spendIds=new Set();for(const item of claims.spends){if(spendIds.has(item.id))fail('INVALID_STATE','扣减编号重复');spendIds.add(item.id);}
  const ids=new Set();
  for(const request of claims.requests){
    if(!plain(request)||!validId(request.id)||ids.has(request.id))fail('INVALID_STATE','交易编号记录无效');
    ids.add(request.id);
    if(request.operation==='purchase'){
      onlyKeys(request,['id','operation','sku'],'INVALID_STATE');
      if(!account.owned.includes(request.sku))fail('INVALID_STATE','交易与家具产权不一致');
    }else if(request.operation==='expand'){
      onlyKeys(request,['id','operation','level'],'INVALID_STATE');
      if(!Number.isInteger(request.level)||request.level<1||request.level>account.roomLevel)fail('INVALID_STATE','扩建交易记录无效');
    }else fail('INVALID_STATE','交易类型无效');
  }
  // 旧存档可能没有 rewards 键；读取时补齐并校验（签到/升级等通用积分入账，幂等）。
  if(!Array.isArray(claims.rewards))claims.rewards=[];
  if(claims.rewards.length>MAX_CLAIMS||claims.rewards.some(item=>!plain(item)||!validId(item.id)||!natural(item.points)||item.points<1||item.points>100000))fail('INVALID_STATE','奖励记录无效');
  const rewardIds=new Set();for(const item of claims.rewards){if(rewardIds.has(item.id))fail('INVALID_STATE','奖励编号重复');rewardIds.add(item.id);}
  return account;
}

export function createEconomy({storageAdapter,storageKey='original-pet-room-account-v1',onEvent,initialBalance=0}={}){
  let account={version:1,balance:natural(initialBalance)?initialBalance:0,roomLevel:0,owned:[],layout:null,claims:{learning:[],requests:[],rewards:[],spends:[]},totalSpent:0};
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
    if(adapter){
      let raw;try{raw=adapter.getItem(storageKey);}catch{fail('STORAGE_READ_FAILED','无法读取账户存档，未创建替代账户');}
      if(raw!==null){account=parseAccount(raw);lastPersisted=raw;}
    }
  }catch(error){loadError=error instanceof AccountError?{code:error.code,message:error.message}:{code:'STORAGE_READ_FAILED',message:'无法读取账户存档'};}

  function getState(){
    return copyJSON({...account,valid:!loadError&&!writeError,writable:!loadError&&!writeError,error:loadError||writeError,
      catalog:SHOP_CATALOG,tiers:ROOM_TIERS,nextTier:ROOM_TIERS[account.roomLevel+1]||null});
  }
  const reply=(ok,code,message)=>({ok,code,message,state:getState()});
  function transaction(operation,mutate){
    if(loadError)return reply(false,loadError.code,loadError.message);
    if(busy)return reply(false,'BUSY','账户正在保存，请稍后重试');
    busy=true;let changed=false,result;
    try{
      const candidate=copyJSON(account),verdict=mutate(candidate);
      if(verdict?.unchanged)result=reply(true,verdict.code||'ALREADY_APPLIED',verdict.message||'此事件已处理');
      else{
        if(!natural(candidate.balance))fail('BALANCE_OVERFLOW','积分超出安全整数范围');
        if(candidate.claims.learning.length>MAX_CLAIMS||candidate.claims.requests.length>MAX_CLAIMS||candidate.claims.rewards.length>MAX_CLAIMS)fail('ACCOUNT_FULL','事件记录已满，请联系宿主归档');
        const encoded=JSON.stringify(candidate);
        if(bytes(encoded)>MAX_ACCOUNT_BYTES)fail('ACCOUNT_FULL','账户存档超过 1MB 上限');
        if(adapter){
          try{
            // 多标签页并发写保护：落盘前重读一次，外部已改则拒绝本次写入，避免旧快照覆盖新数据。
            if(lastPersisted!==null){
              let current;try{current=adapter.getItem(storageKey);}catch{current=undefined;}
              if(current!==lastPersisted){writeError={code:'ARCHIVE_CONFLICT',message:'账户存档已被其他页面修改，本次未保存'};fail('ARCHIVE_CONFLICT',writeError.message);}
            }
            const saved=adapter.setItem(storageKey,encoded);if(saved&&typeof saved.then==='function'){Promise.resolve(saved).catch(()=>{});throw new Error('需要同步存储适配器');}
            lastPersisted=encoded;
          }catch{if(!writeError)writeError={code:'STORAGE_WRITE_FAILED',message:'账户保存失败，本次积分、产权和布局均未变更'};fail(writeError.code,writeError.message);}
        }
        account=candidate;writeError=null;changed=true;result=reply(true,'OK',verdict?.message||'账户已保存');
      }
    }catch(error){const detail=errorInfo(error);result=reply(false,detail.code,detail.message);}
    finally{busy=false;}
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
    if(previous.operation!==operation||(operation==='purchase'&&previous.sku!==sku))fail('REQUEST_ID_REUSED','交易编号已用于其他操作');
    return true;
  }
  function purchase(sku,options){
    return transaction('purchase',candidate=>{
      if(typeof sku!=='string'||!CATALOG.has(sku))fail('UNKNOWN_SKU','没有这件商店家具');
      const input=optionsCopy(options);
      if(replay(candidate,input.requestId,'purchase',sku))return {unchanged:true};
      if(candidate.owned.includes(sku))fail('ALREADY_OWNED','你已经拥有这件家具');
      const item=CATALOG.get(sku);if(candidate.balance<item.price)fail('INSUFFICIENT_POINTS','学习积分不足');
      candidate.balance-=item.price;candidate.owned.push(sku);candidate.totalSpent+=item.price;
      if(own(input,'layout'))candidate.layout=input.layout;
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'purchase',sku});
      return {message:`已购买${item.name}`};
    });
  }
  function expand(options){
    return transaction('expand',candidate=>{
      const input=optionsCopy(options);if(replay(candidate,input.requestId,'expand'))return {unchanged:true};
      const tier=ROOM_TIERS[candidate.roomLevel+1];if(!tier)fail('MAX_ROOM_LEVEL','房屋已经扩建到最高等级');
      if(candidate.balance<tier.price)fail('INSUFFICIENT_POINTS','学习积分不足');
      candidate.balance-=tier.price;candidate.roomLevel=tier.level;candidate.totalSpent+=tier.price;
      if(own(input,'layout'))candidate.layout=input.layout;
      if(input.requestId!==undefined)candidate.claims.requests.push({id:input.requestId,operation:'expand',level:tier.level});
      return {message:`已扩建为${tier.name}`};
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
  function setLayout(layout){return transaction('layout',candidate=>{candidate.layout=layoutCopy(layout);return {message:'装修布局已保存'};});}
  return {getState,getLayout:()=>layoutCopy(account.layout),purchase,expand,creditLearning,reward,spend,setLayout};
}
