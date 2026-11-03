import {createDesignPanel} from './design-ui.js';
import {mountPetHouse} from './pet-house.js';
import {createEstateStore} from './estate-state.mjs';
import {createEstatePanel} from './estate-ui.js';
import {createRoomMusic} from './room-music.mjs';
import {DESIGNER_MUSIC_CONFIG} from './designer-config.mjs';
import {resolveRoomStorage,roomError} from './runtime.mjs';
import {addBackup,readBackups,findBackup,removeBackup,backupStorageApply} from './backup.mjs';
import {planInteraction} from './interaction-framework.mjs';
import {COMPANION_SUFFIX} from './companion-state.mjs';
import {createTravelCurtain} from './moving-ceremony.js';

const mounted=new WeakMap();
/** Keep a pre-expansion copy only after the atomic floor transaction accepts
 * the request. Rejected attempts must never evict a useful older backup. */
export function expandEstateWithBackup({estate,storage,backupsKey,input}){
  const saved=estate.exportArchive(),floor=estate.getState().rooms.length+1,result=estate.createRoom(input);
  if(!result.ok||result.unchanged)return result;
  try{if(saved.ok)backupStorageApply(storage,backupsKey,()=>addBackup({adapter:storage,key:backupsKey,archive:saved.archive,note:`扩建第${floor}层前的自动副本`}));}catch{/* Backups remain best effort; the accepted floor is durable. */}
  return result;
}
/** Stable host API: worlds share one wallet while the active renderer is replaced on travel. */
export function mountPetEstate(options={}){
  const {container,music:musicConfiguration=DESIGNER_MUSIC_CONFIG,onState,onEvent,onInteraction,onEstateEvent,designService,...roomOptions}=options;
  const doc=container?.ownerDocument,win=doc?.defaultView;
  if(!win||typeof container.append!=='function')throw roomError('INVALID_CONTAINER','需要一个浏览器容器');
  if(mounted.has(container))throw roomError('ALREADY_MOUNTED','此容器已经有庄园，请先卸载');
  const storageKey=roomOptions.storageKey||'hamster-room-layout-v3',storage=resolveRoomStorage(roomOptions.storageAdapter,win);
  const estate=createEstateStore({storageAdapter:storage,storageKey,initialPoints:roomOptions.initialPoints??0});
  const initial=estate.getState();if(initial.valid===false)throw roomError(initial.error?.code||'ESTATE_INVALID',initial.error?.message||'房间目录暂时打不开');
  const stage=doc.createElement('div');stage.className='pet-estate-stage';stage.style.cssText='position:relative;width:100%;height:100%;min-height:240px';container.append(stage);
  let initialSound={muted:true,volume:'quiet'};
  try{const saved=JSON.parse(estate.storageForRoom(initial.activeRoomId).getItem(storageKey+COMPANION_SUFFIX));if(saved?.sound)initialSound=saved.sound;}catch{/* Remain silent until the room can validate preferences. */}
  const music=createRoomMusic({eventTarget:doc,configuration:musicConfiguration,sound:initialSound});
  let current=null,panel=null,disposed=false,busy=false,generation=0,autoBackupTimer=0,controller=null,activeCurtain=null,suppressDesignShare=false;
  const backupsKey=storageKey+'-estate-backups-v1';
  const safe=(fn,...args)=>{try{fn?.(...args);}catch{/* Host observers cannot reverse an accepted operation. */}};
  const hasDrawingDraft=()=>current?.view.root.dataset.roomDrawingDirty==='true'||current?.view.root.dataset.roomWallDrawingDirty==='true';
  const unavailable=()=>hasDrawingDraft()?{ok:false,code:'UNSAVED_DRAWING',message:'画纸上还有没保存的小作品，先保存手绘或点「放弃未保存手绘」，再去新楼层吧～'}:{ok:false,code:'NOT_READY',message:'小屋正在整理，等伙伴站稳小脚丫再试试～'};
  function canTravel(){if(disposed||busy||!current?.api.getState().ready||hasDrawingDraft())return false;const state=current.api.getState();return !state.decoration&&!current.api.getShop().busy;}
  function getEstate(){const state=estate.getState();return {ok:state.valid!==false,estate:{...state,balance:current?.api.getShop().balance??roomOptions.initialPoints??0,music:music.getState(),busy},message:state.error?.message};}
  function refresh(){if(disposed)return;const state=current?.api.getState()||{ready:false,lifecycle:'loading'};panel?.update(state);safe(onState,state);}
  function emit(type,detail={}){safe(onEstateEvent,type,detail);safe(onEvent,type,detail);const room=estate.getState().rooms?.find(item=>item.id===estate.getState().activeRoomId);safe(onInteraction,planInteraction(type,detail,{ownerName:current?.api.getCompanion?.().companion?.ownerName,roomName:room?.name,reducedMotion:!!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches}));}
  function scheduleBackup(){if(disposed||roomOptions.autoBackup===false)return;win.clearTimeout(autoBackupTimer);autoBackupTimer=win.setTimeout(()=>{if(!disposed&&canTravel())createBackup('自动备份');},2500);}
  function exportArchive(){if(disposed||busy)return unavailable();return estate.exportArchive();}
  function exportSave(){const result=exportArchive();return result.ok?{ok:true,json:JSON.stringify(result.archive),message:'整座城堡都装进记忆盒子啦～'}:result;}
  function listBackups(){if(disposed)return unavailable();return readBackups(storage,backupsKey);}
  function createBackup(note='手动备份'){
    if(!canTravel())return unavailable();const saved=estate.exportArchive();if(!saved.ok)return saved;
    const result=backupStorageApply(storage,backupsKey,()=>addBackup({adapter:storage,key:backupsKey,archive:saved.archive,note}));
    return result.ok?{...result,message:'所有房间、共享积分和伙伴记忆都备份好啦～'}:result;
  }
  function removeBackupEntry(id){if(disposed||busy)return unavailable();return backupStorageApply(storage,backupsKey,()=>removeBackup(storage,backupsKey,id));}
  async function importSave(json){
    if(!canTravel())return unavailable();busy=true;refresh();
    try{const result=estate.importArchive(json);if(!result.ok)return result;await loadRoom(estate.getState().activeRoomId);emit('archive-imported',{allRooms:true});return {...result,relaunchRequired:false,message:'所有房间都找回来啦，欢迎回家～'};}
    catch(error){return {ok:false,code:error.code||'RELOAD_FAILED',message:`存档已写入，但房间暂未打开：${error.message}。请刷新页面。`};}
    finally{busy=false;refresh();}
  }
  function restoreBackup(id){const entry=findBackup(storage,backupsKey,id);return entry?importSave(entry.archive):Promise.resolve({ok:false,message:'这份记忆盒子没有找到哦'});}
  function listRoomWorldSaves(id=estate.getState().activeRoomId){
    if(disposed)return unavailable();return estate.listRoomWorldSaves(id);
  }
  function exportRoomWorld(id=estate.getState().activeRoomId){
    if(!canTravel())return unavailable();return estate.exportRoomWorld(id);
  }
  function saveRoomWorld(id=estate.getState().activeRoomId,input={}){
    if(!canTravel())return unavailable();
    const result=estate.saveRoomWorld(id,input);if(result.ok){refresh();emit('room-world-saved',{roomId:id,saveId:result.save?.id});}return result;
  }
  function removeRoomWorldSave(id=estate.getState().activeRoomId,saveId){
    if(!canTravel())return unavailable();
    const result=estate.removeRoomWorldSave(id,saveId);if(result.ok){refresh();emit('room-world-save-removed',{roomId:id,saveId});}return result;
  }
  async function applyRoomWorld(method,id,input){
    if(!canTravel())return unavailable();busy=true;refresh();
    try{
      const result=estate[method](id,input);if(!result.ok)return result;
      if(id===estate.getState().activeRoomId){
        try{await loadRoom(id);}
        catch{return {ok:false,code:'ROOM_LOAD_FAILED',message:'这层的存档已经读入，画面暂时没有打开，请刷新页面重新进入。'};}
      }
      emit('room-world-loaded',{roomId:id});
      return {...result,relaunchRequired:false,message:method==='createRoomWorld'?result.message:'这层楼的布置已经读回，其他楼层和共享积分保持原样。'};
    }catch(error){return {ok:false,code:error.code||'ROOM_WORLD_FAILED',message:error.message||'这次没有完成，请保留存档文件后重试。'};}
    finally{busy=false;refresh();}
  }
  function restoreRoomWorld(id=estate.getState().activeRoomId,saveId){return applyRoomWorld('restoreRoomWorld',id,saveId);}
  function importRoomWorld(id=estate.getState().activeRoomId,json){return applyRoomWorld('importRoomWorld',id,json);}
  function createRoomWorld(id=estate.getState().activeRoomId,input={}){return applyRoomWorld('createRoomWorld',id,input);}
  async function selectEstateRoom(id){
    if(!canTravel())return unavailable();const previous=estate.getState().activeRoomId;
    if(previous===id)return {ok:true,unchanged:true,message:'我们已经在这间小屋里啦～'};
    busy=true;refresh();
    try{const result=estate.selectRoom(id);if(!result.ok)return result;try{await loadRoom(id);}catch(error){const rolledBack=estate.selectRoom(previous);if(rolledBack.ok)await loadRoom(previous);return {ok:false,code:'ROOM_LOAD_FAILED',message:`新房还没准备好，已回到原房间：${error.message}`};}
      emit('estate-room-entered',{roomId:id,roomName:estate.getState().rooms.find(item=>item.id===id)?.name});scheduleBackup();return {ok:true,message:'推开新门啦！每间房的布置都好好记着～'};
    }finally{busy=false;refresh();}
  }
  async function createEstateRoom(input){
    if(!canTravel())return unavailable();busy=true;refresh();const previous=estate.getState().activeRoomId;
    try{
      const requestId=`room-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const result=expandEstateWithBackup({estate,storage,backupsKey,input:{...(input||{}),requestId}});if(!result.ok)return result;
      if(result.unchanged)return {...result,message:'这层楼已经建好啦，我们就在原来的房间里～'};
      const id=result.room?.id||result.roomId;const selected=estate.selectRoom(id);if(!selected.ok)return selected;
      try{await loadRoom(id);}catch(error){estate.selectRoom(previous);await loadRoom(previous);return {ok:false,code:'ROOM_LOAD_FAILED',message:`新房已经留在目录中，但这次没打开，已回原房间：${error.message}`};}
      emit('estate-room-entered',{roomId:id,roomName:result.room?.name,created:true});scheduleBackup();
      return {...result,message:`二楼已建好，消耗 ${result.cost} 积分。现在可以按照自己的喜好布置了。`};
    }finally{busy=false;refresh();}
  }
  function setEstateMode(mode){if(disposed||busy)return unavailable();const result=estate.setMode(mode);if(result.ok){refresh();scheduleBackup();emit('estate-mode-changed',{mode});}return result;}
  const connected=()=>designService?null:{ok:false,code:'DESIGNS_OFFLINE',message:'装修码需要连接共享服务器；请联网后刷新小屋，当前装修已保存在本机'};
  async function publishDesign(){if(!canTravel())return unavailable();const offline=connected();if(offline)return offline;busy=true;refresh();try{return await designService.publish(estate.getState().activeRoomId);}finally{busy=false;refresh();}}
  async function findDesign(code){const offline=connected();return offline||designService.get(code);}
  function previewDesign(design){if(!canTravel())return unavailable();return estate.previewRoomDesign(estate.getState().activeRoomId,design.snapshot);}
  async function applyDesign(design,input){
    if(!canTravel())return unavailable();const offline=connected();if(offline)return offline;busy=true;refresh();
    try{const latest=await designService.get(design.code);if(!latest.ok)return latest;if(latest.revision!==design.revision)return {ok:false,code:'DESIGN_CHANGED',message:'主人已更新装修，请重新查询再确认购买'};
      const id=estate.getState().activeRoomId,result=estate.applyRoomDesign(id,{snapshot:latest.snapshot,buyMissing:input.buyMissing,requestId:input.requestId,expectedFingerprint:design.quote.fingerprint});if(!result.ok)return result;
      try{await loadRoom(id);}catch{return {...result,message:'装修和备份已保存，画面未能打开，请刷新小屋；重试不会重复扣积分。'};}
      emit('room-design-copied',{roomId:id,code:design.code});return {...result,relaunchRequired:false};
    }catch(error){return {ok:false,code:error.code||'DESIGN_FAILED',message:error.message||'装修复制暂未完成，请稍后重试'};}finally{busy=false;refresh();}
  }
  const designPanel=createDesignPanel({doc,api:{publishDesign,findDesign,previewDesign,applyDesign}});
  async function openDesignPanel(mode='share'){
    if(hasDrawingDraft()||disposed||busy)return unavailable();
    if(current?.api.getState().decoration){suppressDesignShare=true;try{const saved=await current.api.setDecorationMode(false);if(saved?.ok===false)return saved;}finally{suppressDesignShare=false;}}
    if(!canTravel())return unavailable();designPanel.open(mode);return {ok:true};
  }
  const methods={openDesignPanel,publishDesign,findDesign,previewDesign,applyDesign,getEstate,createEstateRoom,selectEstateRoom,setEstateMode,getMusic:()=>music.getState(),exportArchive,importArchive:importSave,exportSave,importSave,createBackup,listBackups,removeBackup:removeBackupEntry,restoreBackup,
    listRoomWorldSaves,exportRoomWorld,saveRoomWorld,removeRoomWorldSave,restoreRoomWorld,importRoomWorld,createRoomWorld,
    collectAllFurniture:requestId=>canTravel()?current.api.collectAllFurniture(requestId):Promise.resolve(unavailable()),
    resetRoomLayout:()=>canTravel()?current.api.resetRoomLayout():Promise.resolve(unavailable()),
    dispose:()=>dispose(),
  };
  const api=new Proxy({}, {get(target,name){if(Object.hasOwn(target,name))return target[name];if(Object.hasOwn(methods,name))return methods[name];if(name==='then')return undefined;const value=current?.api[name];return typeof value==='function'?(...args)=>{if(disposed)return unavailable();const fn=current?.api[name];return typeof fn==='function'?fn(...args):unavailable();}:value;},has(target,name){return Object.hasOwn(target,name)||Object.hasOwn(methods,name)||!!current&&name in current.api;}});
  async function loadRoom(id){
    let curtain=null;
    if(current?.api.getState().ready){current.api.setPresentationPaused(true);curtain=createTravelCurtain({container,source:stage.querySelector('[data-room-control="room-poster"]')||stage.querySelector('canvas'),roomName:estate.getState().rooms.find(room=>room.id===id)?.name,reducedMotion:!!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches});activeCurtain=curtain;}
    try{
    const serial=++generation;panel?.dispose();panel=null;current?.dispose();current=null;stage.replaceChildren();
    if(disposed)throw roomError('ABORTED','庄园已关闭');
    const roomMount=doc.createElement('div');roomMount.style.cssText='width:100%;height:100%';stage.append(roomMount);
    let next;
    next=mountPetHouse({...roomOptions,container:roomMount,storageKey,storageAdapter:estate.storageForRoom(id),autoBackup:false,
      extendApi:core=>{const extended={...core,getEstate,createEstateRoom,selectEstateRoom,setEstateMode,getMusic:methods.getMusic,exportArchive,importArchive:importSave,exportSave,importSave,createBackup,listBackups,removeBackup:removeBackupEntry,restoreBackup,...Object.fromEntries(Object.entries(methods).filter(([name])=>name.includes('RoomWorld')))};return typeof roomOptions.extendApi==='function'?roomOptions.extendApi(extended):extended;},
      onInteraction:plan=>safe(onInteraction,plan),
      onState(state){if(disposed||serial!==generation)return;music.configureSound(next?.api.getCompanion?.().companion?.sound||{});panel?.update(state);safe(onState,state);},
      onEvent(type,detail){if(disposed||serial!==generation)return;safe(onEvent,type,detail);if(designService&&type==='decoration-mode'&&detail?.active===false&&detail.saved&&!suppressDesignShare){win.setTimeout(()=>{if(!disposed&&serial===generation&&canTravel())designPanel.open('share',{autoPublish:!!designService});},0);}if(['layout-change','room-expanded','companion-change','profile-change','gift-unlocked','checkin-done','makeup-done','level-up','learning-reward'].includes(type))scheduleBackup();},
    });
    current=next;
    const actions=next.view.root.querySelector('[data-room-control="decoration-panel"] .edit-actions');
    if(actions){const row=doc.createElement('div');row.className='design-open-buttons';for(const [label,mode]of [['分享装修码','share'],['输入装修码','import']]){const button=doc.createElement('button');button.type='button';button.className='edit-button';button.textContent=label;button.setAttribute('aria-label',mode==='import'?'输入4位装修码':'分享当前楼层装修码');button.onclick=()=>void openDesignPanel(mode);row.append(button);}actions.prepend(row);}

    if(roomOptions.panels!==false)panel=createEstatePanel({root:next.view.root,api});
    await next.ready;
    if(disposed||serial!==generation){next.dispose();throw roomError('ABORTED','房间切换已取消');}
    music.configureSound(next.api.getCompanion().companion?.sound||{});refresh();
    if(curtain){next.api.playMoveInCeremony?.();await curtain.finish();}
    if(disposed||serial!==generation)throw roomError('ABORTED','房间切换已取消');
    return api;
    }finally{curtain?.dispose();if(activeCurtain===curtain)activeCurtain=null;}
  }
  const onAbort=()=>dispose();
  function dispose(){if(disposed)return;disposed=true;++generation;win.clearTimeout(autoBackupTimer);activeCurtain?.dispose();activeCurtain=null;options.signal?.removeEventListener('abort',onAbort);panel?.dispose();designPanel.dispose();current?.dispose();music.dispose();stage.remove();if(mounted.get(container)===controller)mounted.delete(container);}
  controller={api,ready:null,dispose,get version(){return current?.version||'unmounted';},protocolVersion:1};mounted.set(container,controller);
  if(options.signal?.aborted){dispose();controller.ready=Promise.reject(roomError('ABORTED','庄园加载已取消'));}
  else {options.signal?.addEventListener('abort',onAbort,{once:true});controller.ready=loadRoom(initial.activeRoomId);}
  controller.ready.catch(()=>{});return controller;
}
