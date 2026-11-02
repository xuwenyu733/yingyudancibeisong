/**
 * 房间宿主桥接。此模块不读取 window/DOM，也不直接调用 uni。
 *
 * 入站 room-command.detail / message.data：
 * {protocolVersion:1,roomId,requestId,type:'command',command,params:{...}}
 * 出站 room-event.detail / onEvent(envelope)：
 * {protocolVersion:1,roomId,requestId:null,type:'event',event,detail}
 * 或 {protocolVersion:1,roomId,requestId,type:'result',command,ok,result|error}
 *
 * 跨文档通信必须显式给出 allowedOrigins 和 messageTarget；来源还必须在
 * allowedSources 中，默认仅接受 messageTarget 的实际 parent Window。
 * 结果只回复已验证的 source 和精确 origin。普通事件由宿主 onEvent 自行转发。
 */
export const ROOM_PROTOCOL_VERSION = 1;
let nextRoom = 0;
const COMMANDS = new Set(['setLamp','toggleSofa','walkTo','setDecorationMode','setFurnitureTransform','setFurnitureCollider','getState','getLayout','importLayout','getShop','purchaseFurniture','expandRoom','creditLearning','getProfile','checkIn','setProfileGender','setProfileName','addStudyTime']);
const DANGEROUS_KEYS = new Set(['__proto__','prototype','constructor']);
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);

class BridgeError extends Error {
  constructor(code,message) {super(message);this.code=code;}
}
const fail = (code,message) => {throw new BridgeError(code,message);};
const errorData = error => ({code:error instanceof BridgeError?error.code:'COMMAND_FAILED',message:String(error?.message??'宿主指令执行失败').slice(0,500)});

/** 拒绝函数、循环引用、非有限数和 Object3D 等实例，不调用自定义 toJSON。 */
function jsonData(value,{undefinedAsNull=false}={}) {
  const ancestors=new Set();let count=0;
  function visit(current,depth) {
    if (++count>20000||depth>24) fail('SERIALIZATION_ERROR','JSON 数据过大或嵌套过深');
    if (current===null) return null;
    if (current===undefined&&undefinedAsNull&&depth===0) return null;
    if (typeof current==='string') {if(current.length>262144)fail('SERIALIZATION_ERROR','JSON 字符串过长');return current;}
    if (typeof current==='boolean') return current;
    if (typeof current==='number') {if(!Number.isFinite(current))fail('SERIALIZATION_ERROR','JSON 不能包含非有限数字');return current;}
    if (!Array.isArray(current)&&!plain(current)) fail('SERIALIZATION_ERROR','只允许普通 JSON 数据，不能包含函数或对象实例');
    if (ancestors.has(current)) fail('SERIALIZATION_ERROR','JSON 不能包含循环引用');
    ancestors.add(current);
    let result;
    if (Array.isArray(current)) {
      result=[];
      for(let index=0;index<current.length;index++) {
        if(!own(current,index))fail('SERIALIZATION_ERROR','JSON 数组不能包含空槽');
        result.push(visit(current[index],depth+1));
      }
    }
    else {
      result={};
      for (const key of Object.keys(current)) {
        if (DANGEROUS_KEYS.has(key)) fail('SERIALIZATION_ERROR','JSON 字段名无效');
        if (current[key]!==undefined) result[key]=visit(current[key],depth+1);
      }
    }
    ancestors.delete(current);return result;
  }
  return visit(value,0);
}
function keysOnly(params,keys) {
  if (!plain(params)||Object.keys(params).some(key=>!keys.includes(key))) fail('INVALID_PARAMS','指令参数包含未知字段');
}
function boolean(value,name) {if(typeof value!=='boolean')fail('INVALID_PARAMS',`${name} 必须为布尔值`);}
function vector(value,name,{positive=false}={}) {if(!finite3(value)||(positive&&value.some(number=>number<=0)))fail('INVALID_PARAMS',`${name} 必须包含三个${positive?'正的':''}有限数`);}
function furnitureId(value) {if(!identifier(value)||DANGEROUS_KEYS.has(value))fail('INVALID_PARAMS','家具 ID 无效');}
function validatedArguments(command,params) {
  switch(command) {
    case 'setLamp':keysOnly(params,['on']);boolean(params.on,'on');return [params.on];
    case 'toggleSofa':case 'getState':case 'getLayout':case 'getShop':case 'expandRoom':case 'getProfile':case 'checkIn':keysOnly(params,[]);return [];
    case 'purchaseFurniture':keysOnly(params,['sku']);if(!identifier(params.sku))fail('INVALID_PARAMS','商品编号无效');return [params.sku];
    case 'creditLearning': {
      // 与 economy.creditLearning 同款输入：至少一个学习事件字段，eventId 为合法标识符。
      keysOnly(params,['eventId','learned','reviewed','checkIn']);
      if(!params||typeof params.eventId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(params.eventId))fail('INVALID_PARAMS','事件编号无效');
      if(params.learned!==undefined&&(!Number.isSafeInteger(params.learned)||params.learned<0))fail('INVALID_PARAMS','learned 必须为非负整数');
      if(params.reviewed!==undefined&&(!Number.isSafeInteger(params.reviewed)||params.reviewed<0))fail('INVALID_PARAMS','reviewed 必须为非负整数');
      if(params.checkIn!==undefined&&typeof params.checkIn!=='boolean')fail('INVALID_PARAMS','checkIn 必须为布尔值');
      const learned=params.learned??0,reviewed=params.reviewed??0,checkIn=params.checkIn??false;
      if(!learned&&!reviewed&&!checkIn)fail('INVALID_PARAMS','至少提供 learned、reviewed 或 checkIn 之一');
      return [{eventId:params.eventId,learned,reviewed,checkIn}];
    }
    case 'walkTo':
      keysOnly(params,['x','z']);if(!Number.isFinite(params.x)||!Number.isFinite(params.z))fail('INVALID_PARAMS','行走坐标必须为有限数');return [params.x,params.z];
    case 'setDecorationMode':keysOnly(params,['enabled']);boolean(params.enabled,'enabled');return [params.enabled];
    case 'setProfileGender':keysOnly(params,['gender']);if(params.gender!=='male'&&params.gender!=='female')fail('INVALID_PARAMS','头像性别只能为 male 或 female');return [params.gender];
    case 'setProfileName':keysOnly(params,['name']);if(typeof params.name!=='string'||params.name.length>40)fail('INVALID_PARAMS','昵称必须为不超过 40 字符的字符串');return [params.name];
    case 'addStudyTime':keysOnly(params,['seconds']);if(!Number.isSafeInteger(params.seconds)||params.seconds<0||params.seconds>86400*90)fail('INVALID_PARAMS','学习时长需为 0–90 天内的整数秒');return [params.seconds];
    case 'setFurnitureTransform': {
      keysOnly(params,['id','position','rotation','scale']);furnitureId(params.id);
      const patch={};
      if(own(params,'position')){vector(params.position,'position');patch.position=params.position;}
      if(own(params,'rotation')){
        vector(params.rotation,'rotation');if(Math.abs(params.rotation[0])>1e-8||Math.abs(params.rotation[2])>1e-8)fail('INVALID_PARAMS','家具只允许绕 Y 轴旋转');patch.rotation=params.rotation;
      }
      if(own(params,'scale')){
        if(typeof params.scale==='number'){if(!Number.isFinite(params.scale)||params.scale<=0)fail('INVALID_PARAMS','scale 必须为正的有限数');}
        else vector(params.scale,'scale',{positive:true});patch.scale=params.scale;
      }
      if(!Object.keys(patch).length)fail('INVALID_PARAMS','至少提供一项家具变换');return [params.id,patch];
    }
    case 'setFurnitureCollider': {
      keysOnly(params,['id','center','size','blocksNavigation','blocksPlacement','boxIndex']);furnitureId(params.id);
      const patch={};
      if(own(params,'center')){vector(params.center,'center');patch.center=params.center;}
      if(own(params,'size')){vector(params.size,'size',{positive:true});patch.size=params.size;}
      for(const key of ['blocksNavigation','blocksPlacement'])if(own(params,key)){boolean(params[key],key);patch[key]=params[key];}
      if(!Object.keys(patch).length)fail('INVALID_PARAMS','至少提供一项碰撞盒设置');
      const index=params.boxIndex??0;if(!Number.isInteger(index)||index<0||index>31)fail('INVALID_PARAMS','boxIndex 必须为 0–31 的整数');return [params.id,patch,index];
    }
    case 'importLayout':keysOnly(params,['layout']);if(!plain(params.layout))fail('INVALID_PARAMS','layout 必须为 JSON 对象');return [params.layout];
    default:fail('UNKNOWN_COMMAND','未知房间指令');
  }
}

export function createRoomBridge({api,getState,onEvent,eventTarget,legacyName='HamsterRoom',globalObject,
  roomId=`room-${++nextRoom}`,allowedOrigins=[],messageTarget=globalObject,allowedSources}={}) {
  if(!api||typeof api!=='object'||typeof getState!=='function'||!identifier(roomId))throw new TypeError('桥接需要 api、getState 和有效 roomId');
  if(onEvent!==undefined&&typeof onEvent!=='function')throw new TypeError('onEvent 必须为函数');
  if(eventTarget!==undefined&&(!eventTarget?.addEventListener||!eventTarget?.removeEventListener||!eventTarget?.dispatchEvent))throw new TypeError('eventTarget 必须支持事件监听与派发');
  if(!Array.isArray(allowedOrigins))throw new TypeError('allowedOrigins 必须为明确的来源列表');
  const origins=new Set(allowedOrigins.map(origin=>{
    let parsed;try{parsed=new URL(origin);}catch{throw new TypeError('跨文档来源必须为完整 HTTP(S) origin');}
    if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin)throw new TypeError('来源须为精确 HTTP(S) origin，不能使用 *、null 或 URL 路径');return origin;
  }));
  if(origins.size&&(!messageTarget?.addEventListener||!messageTarget?.removeEventListener))throw new TypeError('跨文档通信需要显式 messageTarget');
  if(allowedSources!==undefined&&!Array.isArray(allowedSources))throw new TypeError('allowedSources 必须为 Window 引用数组');
  let inferredParent;try{if(messageTarget?.parent&&messageTarget.parent!==messageTarget)inferredParent=messageTarget.parent;}catch{/* 未显式允许的跨上下文引用不启用。 */}
  const sources=new Set(allowedSources??(inferredParent?[inferredParent]:[]));
  let disposed=false,isReady=false,readyPromise=null,legacyRegistered=false;
  const history=new Map();
  const base=(type,requestId=null)=>({protocolVersion:ROOM_PROTOCOL_VERSION,roomId,requestId,type});

  function deliver(envelope,reply) {
    if(disposed)return false;
    // 每个观察者获得独立 JSON 副本，不能改写下一个观察者或网络响应。
    if(eventTarget) {
      try {
        const CustomEventClass=eventTarget.ownerDocument?.defaultView?.CustomEvent??globalObject?.CustomEvent??globalThis.CustomEvent;
        eventTarget.dispatchEvent(new CustomEventClass('room-event',{bubbles:true,detail:jsonData(envelope)}));
      }catch{/* 一个宿主监听器失败不能中断房间状态机。 */}
    }
    if(!disposed)try{onEvent?.(jsonData(envelope));}catch{/* 宿主处理异常由宿主负责。 */}
    if(reply&&!disposed)try{reply.source.postMessage(jsonData(envelope),reply.origin);}catch{/* 对端窗口可能已关闭。 */}
    return !disposed;
  }
  function emit(type,detail={}) {
    if(disposed||typeof type!=='string'||!type||type.length>100)return false;
    try{return deliver({...base('event'),event:type,detail:jsonData(detail)});}catch{return false;}
  }
  const result=(requestId,command,ok,value)=>({...base('result',requestId),command,ok,...(ok?{result:value}:{error:value})});
  async function receive(input,reply) {
    if(disposed||input?.roomId!==roomId||input?.type!=='command')return;
    const requestId=identifier(input.requestId)?input.requestId:null;
    const command=typeof input.command==='string'&&input.command.length<=100?input.command:null;
    let envelope;
    try {
      if(input.protocolVersion!==ROOM_PROTOCOL_VERSION)fail('UNSUPPORTED_PROTOCOL','不支持此房间协议版本');
      if(!requestId||!command)fail('INVALID_REQUEST','需要有效 requestId 和 command');
      if(!plain(input))fail('INVALID_REQUEST','指令必须为普通 JSON 对象');
      if(!COMMANDS.has(command))fail('UNKNOWN_COMMAND','未知房间指令');
      let params;try{params=jsonData(input.params??{});}catch{fail('INVALID_PARAMS','参数必须为有限、普通的 JSON 数据');}
      const args=validatedArguments(command,params);
      if(command==='purchaseFurniture'||command==='expandRoom')args.push(requestId);
      if(!isReady&&command!=='getState')fail('NOT_READY','房间尚未就绪');
      const method=command==='getState'?getState:api[command];
      if(typeof method!=='function')fail('UNSUPPORTED_COMMAND','当前房间未实现此指令');
      const fingerprint=JSON.stringify({command,params});
      const previous=history.get(requestId);
      if(previous) {
        if(previous.fingerprint!==fingerprint)fail('REQUEST_ID_REUSED','requestId 已用于另一条指令');
        envelope=await previous.promise;
      } else {
        if(history.size>=256) {
          const completed=[...history].find(([,entry])=>entry.completed);
          if(completed)history.delete(completed[0]);else fail('BUSY','待处理指令过多');
        }
        const entry={fingerprint,completed:false,promise:null};
        // 延迟到微任务调用，先登记 requestId，重试不会重复触发切换等副作用。
        entry.promise=Promise.resolve().then(()=>{
          if(disposed)throw new BridgeError('DISPOSED','房间已销毁');
          return method.apply(command==='getState'?undefined:api,args);
        }).then(value=>result(requestId,command,true,jsonData(value,{undefinedAsNull:true})),error=>result(requestId,command,false,errorData(error)))
          .catch(error=>result(requestId,command,false,errorData(error))).finally(()=>{entry.completed=true;});
        history.set(requestId,entry);envelope=await entry.promise;
      }
    } catch(error) {envelope=result(requestId,command,false,errorData(error));}
    if(!disposed)deliver(envelope,reply);
  }
  const onCommand=event=>{void receive(event.detail);};
  const onMessage=event=>{
    if(disposed||!origins.has(event.origin)||!event.source||!sources.has(event.source))return;
    void receive(event.data,{source:event.source,origin:event.origin});
  };
  eventTarget?.addEventListener('room-command',onCommand);
  if(origins.size)messageTarget.addEventListener('message',onMessage);
  if(globalObject&&legacyName!==null&&legacyName!==false) {
    if(typeof legacyName!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(legacyName)||DANGEROUS_KEYS.has(legacyName)) {
      // 清理已经安装的监听器后再报告配置错误。
      eventTarget?.removeEventListener('room-command',onCommand);if(origins.size)messageTarget.removeEventListener('message',onMessage);
      throw new TypeError('legacyName 无效');
    }
    try {
      if(!(legacyName in globalObject)) {globalObject[legacyName]=api;legacyRegistered=globalObject[legacyName]===api;}
      else emit('bridge-warning',{code:'LEGACY_NAME_IN_USE',message:'兼容全局名称已被占用，未覆盖已有实例'});
    }catch{emit('bridge-warning',{code:'LEGACY_UNAVAILABLE',message:'宿主不允许注册兼容全局接口'});}
  }
  function ready() {
    if(disposed)return Promise.resolve(false);
    if(readyPromise)return readyPromise;
    readyPromise=Promise.resolve().then(()=>disposed?undefined:getState()).then(state=>{
      if(disposed)return false;
      const detail={state:jsonData(state,{undefinedAsNull:true})};isReady=true;
      return emit('ready',detail);
    }).catch(error=>{
      if(!disposed)emit('bridge-error',errorData(error));readyPromise=null;return false;
    });
    return readyPromise;
  }
  function dispose() {
    if(disposed)return false;disposed=true;isReady=false;
    eventTarget?.removeEventListener('room-command',onCommand);
    if(origins.size)messageTarget.removeEventListener('message',onMessage);
    if(legacyRegistered)try{if(globalObject[legacyName]===api)delete globalObject[legacyName];}catch{/* 不删除后来接管该名称的实例。 */}
    history.clear();return true;
  }
  return {ready,emit,dispose};
}
