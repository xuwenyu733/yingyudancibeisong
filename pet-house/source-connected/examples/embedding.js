import { mountRoom } from '../room.js';
import { createRoomView } from '../view.js';
import { createRoomBridge } from '../integration.mjs';
import { createOriginalFox } from '../characters/original-fox.js';

const runButton=document.querySelector('#run-self-test'),releaseButton=document.querySelector('#release-rooms');
const status=document.querySelector('#self-test-status'),results=document.querySelector('#self-test-results'),checks=document.querySelector('#self-test-checks');
const slots={a:document.querySelector('#room-a'),b:document.querySelector('#room-b')};
const assetsBaseUrl=new URL('../assets/',import.meta.url).href;
const active=new Set();let runNumber=0,requestNumber=0,running=false,currentRun=null;
const clone=value=>JSON.parse(JSON.stringify(value));
const assert=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'ASSERTION_FAILED'});};
const errorData=error=>({code:error?.code||'SELF_TEST_FAILED',message:String(error?.message||error)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a,b)=>Math.abs(a-b)<1e-7;
const abortError=()=>Object.assign(new Error('测试实例已经释放'),{code:'ABORTED'});
function placeholder(slot,message){slot.replaceChildren();const note=document.createElement('div');note.className='placeholder';note.textContent=message;slot.append(note);}
function deadline(promise,label,milliseconds=15000){
  let timer;return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(`${label} 超过 ${milliseconds/1000} 秒`),{code:'WATCHDOG_TIMEOUT'})),milliseconds);})]).finally(()=>clearTimeout(timer));
}
function pureJSON(value,ancestors=new Set()){
  if(value===null||typeof value==='string'||typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value!=='object'||ancestors.has(value))return false;
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  ancestors.add(value);const valid=Object.values(value).every(item=>pureJSON(item,ancestors));ancestors.delete(value);return valid;
}
function memoryStorage(){
  const data=new Map(),operations=[];
  return {data,operations,adapter:{getItem(key){operations.push({operation:'getItem',key});return data.get(key)??null;},setItem(key,value){operations.push({operation:'setItem',key});data.set(key,String(value));},removeItem(key){operations.push({operation:'removeItem',key});data.delete(key);}}};
}
function disposeRecord(record,{keepView=false}={}){
  if(!record||record.disposed)return;
  record.disposed=true;
  for(const cancel of [...record.pending])cancel();record.pending.clear();
  record.bridge?.dispose();record.controller?.dispose();active.delete(record);
  if(!keepView)record.view.dispose();
}
function cleanupAll(){for(const record of [...active])disposeRecord(record);releaseButton.disabled=true;}
function mountExample({slot,name,storage,storageKey,base=assetsBaseUrl,reuseView=null,displayErrors=true,characterFactory,onRoomEvent}){
  if(currentRun?.aborted)throw abortError();
  if(!reuseView)slot.replaceChildren();
  const view=reuseView??createRoomView(slot,{controls:false});
  const record={name,slot,view,storageKey,disposed:false,pending:new Set(),latestState:null,events:[],bridgeEvents:[],controller:null,bridge:null,api:null,ready:null};
  active.add(record);
  try {
    record.controller=mountRoom({canvas:view.canvas,uiRoot:view.controlsRoot,assetsBaseUrl:base,storageKey,storageAdapter:storage.adapter,persistLayout:false,quality:'low',loadTimeoutMs:12000,
      ...(characterFactory?{characterFactory}:{}),
      onState(state){record.latestState=state;if(!record.disposed)view.updateState(state);},
      onEvent(type,detail){record.events.push({type,detail:clone(detail??{})});if(record.events.length>300)record.events.shift();if(type!=='ready')record.bridge?.emit(type,detail);onRoomEvent?.(type,detail,record);}});
    record.api=record.controller.api;
    record.bridge=createRoomBridge({api:record.api,getState:()=>record.api.getState(),eventTarget:view.canvas,roomId:`embedding-${runNumber}-${name}`,
      onEvent(envelope){record.bridgeEvents.push(envelope);if(record.bridgeEvents.length>300)record.bridgeEvents.shift();}});
    record.ready=record.controller.ready.then(async api=>{
      if(record.disposed)throw abortError();record.api=api;view.ready();await record.bridge.ready();return record;
    }).catch(error=>{record.failure=errorData(error);if(!record.disposed&&displayErrors)view.error(error);throw error;});
    record.ready.catch(()=>{});return record;
  }catch(error){disposeRecord(record);throw error;}
}
function requireReady(record){assert(record&&!record.disposed&&record.api?.getState().ready,`${record?.name||'实例'} 尚未就绪`);return record.api;}
function sendCommand(record,command,params){
  requireReady(record);const requestId=`embedding-request-${++requestNumber}`,roomId=`embedding-${runNumber}-${record.name}`;
  return new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);record.view.canvas.removeEventListener('room-event',listener);record.pending.delete(cancel);};
    const cancel=()=>{cleanup();reject(abortError());};
    const listener=event=>{const message=event.detail;if(message?.type==='result'&&message.roomId===roomId&&message.requestId===requestId){cleanup();resolve(message);}};
    record.pending.add(cancel);record.view.canvas.addEventListener('room-event',listener);
    timer=setTimeout(()=>{cleanup();reject(Object.assign(new Error('room-command 未收到关联结果'),{code:'BRIDGE_TIMEOUT'}));},14000);
    record.view.canvas.dispatchEvent(new CustomEvent('room-command',{detail:{protocolVersion:1,roomId,requestId,type:'command',command,params}}));
  });
}
async function rejectedCode(promise,expected){
  try{await promise;}catch(error){assert(error.code===expected,`预期 ${expected}，实际 ${error.code||error.message}`);return errorData(error);}
  throw Object.assign(new Error(`预期 ${expected} 拒绝，Promise 却成功了`),{code:'EXPECTED_REJECTION'});
}
async function waitFor(predicate,label){
  const start=performance.now();
  while(performance.now()-start<14000){if(currentRun?.aborted)throw abortError();const value=predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,80));}
  throw Object.assign(new Error(`${label} 未产生可观察状态`),{code:'OBSERVATION_TIMEOUT'});
}
// 仅此开发者回归短暂包装构造器；实际仍使用原生 Observer，finally 原样恢复。
function trackObserverConstruction(){
  const counts={ResizeObserver:0,IntersectionObserver:0},restores=[];
  try{for(const name of Object.keys(counts)){
      const Original=window[name];if(typeof Original!=='function')continue;
      const Tracking=class extends Original{constructor(...args){counts[name]++;super(...args);}};
      window[name]=Tracking;assert(window[name]===Tracking,`${name} 构造器无法追踪`);
      restores.push(()=>{if(window[name]===Tracking)window[name]=Original;});
    }}catch(error){restores.reverse().forEach(restore=>restore());throw error;}
  return {counts,restore(){restores.reverse().forEach(restore=>restore());}};
}

async function runSelfTest(){
  if(running)return;running=true;cleanupAll();runNumber++;runButton.disabled=true;releaseButton.disabled=true;checks.replaceChildren();
  document.body.dataset.selfTest='running';status.textContent='接入自检运行中…';
  const context={aborted:false};currentRun=context;
  const report={selfTestVersion:1,status:'running',startedAt:new Date().toISOString(),assetsBaseUrl,quality:'low',watchdogPerStepMs:15000,checks:[],metrics:null,
    storage:{kind:'isolated in-memory Map',persistLayout:false},note:'真实浏览器接入检查，不代表任意设备的帧率或性能保证。'};
  const storage=memoryStorage();let a=null,b=null,baseline=null,persistedLayout=null;
  const keyA=`embedding-memory-${runNumber}-a`,keyB=`embedding-memory-${runNumber}-b`;
  const criticalRegressions=[
    {name:'角色工厂永不 resolve，进入工厂后 dispose 仍及时 ABORTED',run:async()=>{
      disposeRecord(b);b=null;let entered=false,temp=null;
      try{
        temp=mountExample({slot:slots.b,name:'pending-factory',storage,storageKey:`${keyB}-pending-factory`,displayErrors:false,
          characterFactory:()=>{entered=true;return new Promise(()=>{});}});
        await waitFor(()=>entered,'角色工厂进入标记');
        const rejected=rejectedCode(temp.controller.ready,'ABORTED');disposeRecord(temp);
        return {factoryEntered:entered,expectedError:await rejected};
      }finally{disposeRecord(temp);}
    }},
    {name:'缺少 amount/contactY 的真实角色被拒绝，原 canvas 可重新挂载',run:async()=>{
      let disposedCharacters=0,temp=null,recovered=null;
      try{
        temp=mountExample({slot:slots.b,name:'invalid-character',storage,storageKey:`${keyB}-invalid-character`,displayErrors:false,characterFactory:()=>{
          const character=createOriginalFox();return {...character,pose:{...character.pose,amount:undefined,contactY:undefined},dispose(){disposedCharacters++;character.dispose();}};
        }});
        const error=await rejectedCode(temp.controller.ready,'INVALID_CHARACTER');
        assert(disposedCharacters===1,'无效角色的真实资源必须恰好回收一次');
        const view=temp.view,canvas=view.canvas;disposeRecord(temp,{keepView:true});
        recovered=mountExample({slot:slots.b,name:'after-invalid-character',storage,storageKey:`${keyB}-after-invalid-character`,reuseView:view});
        await recovered.ready;assert(recovered.view.canvas===canvas&&recovered.api.getState().ready,'无效角色失败后原 canvas 重挂未成功');
        return {expectedError:error,disposedCharacters,sameCanvasRecovered:true};
      }finally{disposeRecord(temp);disposeRecord(recovered);}
    }},
    {name:'lamp-change 宿主同步销毁，不再 ready 或重建 Observers',run:async()=>{
      const tracker=trackObserverConstruction();let disposedInCallback=false,temp=null;
      try{
        temp=mountExample({slot:slots.b,name:'callback-dispose',storage,storageKey:`${keyB}-callback-dispose`,displayErrors:false,
          onRoomEvent(type,detail,record){if(type==='lamp-change'&&!disposedInCallback){disposedInCallback=true;record.controller.dispose();}}});
        const error=await rejectedCode(temp.controller.ready,'ABORTED');await new Promise(resolve=>setTimeout(resolve,80));
        assert(disposedInCallback,'测试没有进入 lamp-change 同步销毁回调');
        assert(!temp.events.some(event=>event.type==='ready'),'销毁后仍发出了 ready');
        assert(Object.values(tracker.counts).every(count=>count===0),'销毁回调返回后仍创建了 Observer');
        assert(temp.api.getState().lifecycle==='disposed','同步销毁后的状态不正确');
        return {expectedError:error,disposedInCallback,lateReadyEvents:0,observerConstructions:{...tracker.counts}};
      }finally{disposeRecord(temp);tracker.restore();}
    }},
  ];
  const expectedChecks=13+criticalRegressions.length;report.expectedChecks=expectedChecks;
  const render=()=>{results.textContent=JSON.stringify(report,null,2);};
  async function step(name,action){
    if(context.aborted)throw abortError();
    const row=document.createElement('li'),title=document.createElement('span'),duration=document.createElement('span');
    row.dataset.status='running';title.textContent=`运行中 · ${name}`;duration.className='check-duration';row.append(title,duration);checks.append(row);
    status.textContent=name;const started=performance.now();
    try{
      const detail=await deadline(Promise.resolve().then(action),name);
      const entry={name,status:'passed',durationMs:Math.round(performance.now()-started),detail:detail??null};report.checks.push(entry);
      row.dataset.status='passed';title.textContent=`通过 · ${name}`;duration.textContent=`${entry.durationMs} ms`;
    }catch(error){
      const entry={name,status:'failed',durationMs:Math.round(performance.now()-started),error:errorData(error)};report.checks.push(entry);
      row.dataset.status='failed';title.textContent=`失败 · ${name}：${entry.error.message}`;duration.textContent=`${entry.durationMs} ms`;
      if(error.code==='WATCHDOG_TIMEOUT'){context.aborted=true;throw error;}
    }finally{render();}
  }
  try{
    await step('两个独立 WebGL 实例分别 ready',async()=>{
      a=mountExample({slot:slots.a,name:'a',storage,storageKey:keyA});b=mountExample({slot:slots.b,name:'b',storage,storageKey:keyB});
      await Promise.all([a.ready,b.ready]);assert(a.view.canvas!==b.view.canvas,'实例必须使用不同 canvas');
      assert(a.api.getState().ready&&b.api.getState().ready,'两实例都应 ready');
      return {a:a.api.getState().lifecycle,b:b.api.getState().lifecycle,independentCanvases:true};
    });
    await step('灯光状态互不干扰',()=>{
      const apiA=requireReady(a),apiB=requireReady(b);
      assert(apiA.setLamp(false)===true&&apiB.setLamp(true)===true,'灯光 API 应返回成功');
      assert(apiA.getState().lampOn===false&&apiB.getState().lampOn===true,'A 关灯不能影响 B');
      apiB.setLamp(false);apiA.setLamp(true);assert(apiA.getState().lampOn===true&&apiB.getState().lampOn===false,'B 关灯不能影响 A');apiB.setLamp(true);
      return {isolated:true};
    });
    await step('room-command 有效及非法参数往返',async()=>{
      const valid=await sendCommand(a,'setLamp',{on:false});assert(valid.ok&&valid.result===true,'合法桥接命令应成功');
      const invalid=await sendCommand(a,'setLamp',{on:'yes'});assert(!invalid.ok&&invalid.error.code==='INVALID_PARAMS','非法布尔应返回 INVALID_PARAMS');
      assert(a.api.getState().lampOn===false,'非法参数不能修改灯光');assert(pureJSON(valid)&&pureJSON(invalid),'桥接结果必须为纯 JSON');a.api.setLamp(true);
      return {valid,invalid};
    });
    await step('getLayout 为纯 JSON，序列化往返保持一致',async()=>{
      baseline=clone(requireReady(a).getLayout());assert(pureJSON(baseline),'布局包含非 JSON 数据');
      assert(same(JSON.parse(JSON.stringify(baseline)),baseline),'JSON 往返改变布局');
      const reply=await sendCommand(a,'getLayout',{});assert(reply.ok&&same(reply.result,baseline),'桥接 getLayout 与本地 API 不一致');
      return {version:baseline.version,furnitureCount:Object.keys(baseline.furniture).length};
    });
    await step('非法导入事务拒绝，当前布局保持不变',async()=>{
      const api=requireReady(a),before=clone(api.getLayout()),invalid=clone(before);invalid.furniture.table.position[0]=100;
      const imported=await api.importLayout(invalid);assert(imported?.ok===false,'越界布局必须拒绝');assert(same(api.getLayout(),before),'非法导入改变了原布局');
      return {rejected:true,reason:imported.reason};
    });
    await step('合法桌子变换后可导入原布局恢复',async()=>{
      const api=requireReady(a),before=clone(api.getLayout()),position=[...before.furniture.table.position];position[0]+=.15;
      assert(api.setFurnitureTransform('table',{position})===true,'合法桌子移动未成功');assert(near(api.getLayout().furniture.table.position[0],position[0]),'桌子位置未更新');
      const restored=await api.importLayout(JSON.stringify(before));assert(restored?.ok===true,'合法 JSON 布局导入失败');assert(same(api.getLayout(),before),'原布局恢复不完整');
      return {movedTo:position,restored:true};
    });
    await step('调整独立碰撞盒不改变家具模型 scale',async()=>{
      const api=requireReady(a),before=clone(api.getLayout()),size=[...before.definitions.table.boxes[0].size];size[0]*=.98;size[2]*=.98;
      assert(api.setFurnitureCollider('table',{size})===true,'合法碰撞盒编辑失败');
      const after=api.getLayout();assert(same(after.furniture.table.scale,before.furniture.table.scale),'调碰撞盒改变了家具 scale');assert(same(after.definitions.table.boxes[0].size,size),'碰撞盒尺寸未更新');
      assert((await api.importLayout(before))?.ok===true,'调盒后的原布局恢复失败');return {modelScale:after.furniture.table.scale,colliderSize:size};
    });
    await step('persistLayout:false 不自动写存档，显式导入使用内存适配器',async()=>{
      const api=requireReady(a),writesBefore=storage.operations.filter(item=>item.operation==='setItem').length;
      assert((await api.setDecorationMode(true))===true,'无装修 UI 的逻辑装修模式未开启');assert((await api.setDecorationMode(false))===true,'退出逻辑装修模式失败');
      assert(storage.operations.filter(item=>item.operation==='setItem').length===writesBefore,'persistLayout:false 仍自动写入了存储');
      const changed=clone(api.getLayout());changed.furniture.table.position[0]+=.15;
      const imported=await api.importLayout(changed,{persist:true});assert(imported?.ok===true,'显式持久化导入失败');
      persistedLayout=clone(api.getLayout());assert(same(JSON.parse(storage.data.get(keyA+'-account-v1')).layout,persistedLayout),'账户中的布局保存内容不一致');assert(!storage.data.has(keyB+'-account-v1'),'A 存档污染了 B 的键');
      return {persistLayoutFalseRespected:true,storedKeys:[...storage.data.keys()],adapterOperations:clone(storage.operations)};
    });
    await step('dispose 后在同一个旧 canvas 重新挂载并恢复适配器存档',async()=>{
      const old=a;requireReady(old);const canvas=old.view.canvas,view=old.view;disposeRecord(old,{keepView:true});
      assert(old.api.getState().lifecycle==='disposed','旧实例没有进入 disposed');
      a=mountExample({slot:slots.a,name:'a-remounted',storage,storageKey:keyA,reuseView:view});await a.ready;
      assert(a.view.canvas===canvas,'测试必须复用同一个 canvas');assert(same(a.api.getLayout(),persistedLayout),'重新挂载未恢复内存适配器存档');
      return {sameCanvas:true,lifecycle:a.api.getState().lifecycle,layoutRestored:true};
    });
    await step('加载中立即 dispose，ready 明确拒绝 ABORTED',async()=>{
      disposeRecord(b);b=null;
      const temp=mountExample({slot:slots.b,name:'abort',storage,storageKey:`${keyB}-abort`,displayErrors:false});
      const rejected=rejectedCode(temp.controller.ready,'ABORTED');disposeRecord(temp);const error=await rejected;
      return {expectedError:error};
    });
    await step('不存在的 assetsBaseUrl 明确失败 ASSET_LOAD_FAILED',async()=>{
      const badBase=new URL('../__missing_assets_self_test__/',import.meta.url).href;
      const temp=mountExample({slot:slots.b,name:'bad-assets',storage,storageKey:`${keyB}-bad`,base:badBase,displayErrors:false});
      try{return {expectedError:await rejectedCode(temp.controller.ready,'ASSET_LOAD_FAILED')};}finally{disposeRecord(temp);}
    });
    await step('资产加载失败后可以新建有效实例恢复',async()=>{
      b=mountExample({slot:slots.b,name:'b-recovered',storage,storageKey:keyB});await b.ready;assert(b.api.getState().ready,'恢复实例未 ready');
      return {lifecycle:b.api.getState().lifecycle,error:b.api.getState().error};
    });
    await step('记录实际 renderer.info 指标与双实例最终状态',async()=>{
      const apiA=requireReady(a),apiB=requireReady(b);
      await waitFor(()=>apiA.getState().metrics.triangles>0&&apiA.getState().metrics.drawCalls>0,'实例 A 渲染指标');
      const stateA=apiA.getState(),stateB=apiB.getState();
      report.metrics={a:clone(stateA.metrics),b:clone(stateB.metrics),note:'来自真实渲染器；不可见实例可能暂停，FPS 不是性能保证。'};
      assert(Object.values(stateA.metrics).every(value=>typeof value!=='number'||Number.isFinite(value)),'渲染指标包含非有限数字');
      return {a:stateA.metrics,b:stateB.metrics};
    });
    for(const regression of criticalRegressions)await step(regression.name,regression.run);
  }catch(error){report.runError=errorData(error);}
  finally{
    let survivor=null;
    for(const record of [a,b])if(record&&!record.disposed&&record.api?.getState().ready){survivor=record;break;}
    for(const record of [...active])if(record!==survivor)disposeRecord(record);
    for(const slot of Object.values(slots))if(!survivor||slot!==survivor.slot)placeholder(slot,'临时测试场景已释放。重新运行可再次挂载。');
    const failed=report.checks.filter(check=>check.status==='failed').length;
    report.status=failed===0&&!report.runError&&report.checks.length===expectedChecks?'passed':'failed';
    report.summary={passed:report.checks.filter(check=>check.status==='passed').length,failed,completed:report.checks.length,expected:expectedChecks,retainedRooms:survivor?1:0};
    report.finishedAt=new Date().toISOString();report.storage.operations=clone(storage.operations);report.storage.keys=[...storage.data.keys()];
    document.body.dataset.selfTest=report.status;status.textContent=report.status==='passed'?`全部通过 · ${report.summary.passed} 项检查`:`自检失败 · ${failed} 项未通过，见结果 JSON`;
    render();running=false;runButton.disabled=false;releaseButton.disabled=!survivor;currentRun=null;
  }
}
runButton.addEventListener('click',()=>{void runSelfTest();});
releaseButton.addEventListener('click',()=>{cleanupAll();for(const slot of Object.values(slots))placeholder(slot,'示例房间已释放。可以重新运行自检。');status.textContent='示例房间已释放';});
window.addEventListener('pagehide',()=>{if(currentRun)currentRun.aborted=true;cleanupAll();});
