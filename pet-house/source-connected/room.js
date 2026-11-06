import * as THREE from './vendor/three/three.module.js';
import { DEFAULT_ASSET_URLS } from './assets.mjs';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { ROOM, FURNITURE, SOFA, PALETTE, COLLIDERS, PLACEMENT_BOUNDS } from './layout.js';
import { buildDecor, buildDecorItem } from './decor.js';
import { MovementController } from './movement.mjs';
import { createPath } from './navigation.mjs';
import { createOriginalFox } from './characters/original-fox.js';
import { createPetCharacter } from './characters/pet-models.js';
import { createLayoutManager } from './layout-manager.js';
import { createDecoration } from './decoration.js';
import { createDecorationSession } from './decoration-session.mjs';
import { resolveQuality,resolveRoomStorage,resolveAssetURL,createDisposer,roomError } from './runtime.mjs';
import { SEATS, fitSeat, resolveSeatApproach } from './seats.mjs';
import { WATER_TARGETS, fitWater, resolveWaterApproach } from './seats.mjs';
import { placementOrder } from './placement.mjs';
import { createEconomy, SHOP_CATALOG, ROOM_TIERS, BUILTIN_STORAGE, STORAGE_CATALOG } from './economy.mjs';
import { applyRoomTier } from './scene-economy.js';
import {createShopFurniture} from './inventory-models.mjs';
import {giftProduct,giftSku,giftCatalog,giftPreview} from './gift-catalog.mjs';
import {FLOOR_CATALOG,WALL_CATALOG,WALL_PAINTS} from './surface-catalog.mjs';
import {createWallHanging,createFloorFinish,applyWallPaint} from './surface-models.mjs';
import {createAchievementDisplays,emblemDataUrl} from './achievement-display.mjs';
import { createProfile, BADGES, BADGE_TIERS, checkInReward, previousDay, buildMonthCalendar, badgeHint, buildStats, xpForLevel, xpNeededBetween } from './profile.mjs';
import { exportArchive as buildArchive, restoreArchive } from './archive.mjs';
import { addBackup, readBackups, removeBackup, findBackup, BACKUP_KEY_SUFFIX, backupStorageApply } from './backup.mjs';
import { createSfx } from './sfx.mjs';
import {activeElementFor} from './dom.mjs';
import {createCompanionStore,COMPANION_SUFFIX} from './companion-state.mjs';
import {createCompanionScene} from './companion-scene.js';
import {createCompanionFx} from './companion-fx.js';
import {compatibleRoomLayout} from './room-layout.mjs';
import {planInteraction} from './interaction-framework.mjs';
import {createRendererSurface} from './renderer-surface.mjs';
import {growthFor} from './growth.mjs';
import {ACHIEVEMENT_SKINS} from './achievement-skins.mjs';
import {createPetVoice} from './pet-voice.mjs';
import {createCreativeScene} from './creative-scene.js';
import {createPlayScene} from './play-scene.js';
import {createMovingCeremony} from './moving-ceremony.js';
import {PET_BODY_RADIUS,petNavigationBounds,insidePetBounds} from './pet-boundary.mjs';
import {humMelody,xylophoneNote,nextHoliday,dailyFeature,roomMood,comfortAfterFails,petApology,gentleMissedMessage,collectionProgress,isFreshThisWeek,furnitureLine,bedtimeStory,guestNote,friendEntrance,readFriendsNotesToday,markFriendNote,seasonalWish,weeklyChallenge,hiddenAchievements,previewCalendar,monthlyFable,cheerLine,attachmentLevel,potGrowth,seasonWindow,achievementStory,hiddenCritter,milestoneMoments,growthPage,fadeOutNotes} from './companion-extra.mjs';

const mountedRooms=new WeakMap();
/**
 * 独立挂载入口。导入模块不访问DOM、不创建渲染器、不注册全局变量。
 * const room=mountRoom({canvas,assetsBaseUrl,onEvent}); await room.ready;
 * room.api.getState()/getLayout()返回纯数据；卸载时room.dispose()，同一canvas可重挂。
 */
export function mountRoom(options={}) {
  const {canvas,uiRoot=null,characterFactory=createOriginalFox,persistLayout=true}=options;
  if(!canvas?.getContext||!canvas.ownerDocument?.defaultView)throw roomError('INVALID_CANVAS','需要一个页面canvas元素');
  if(mountedRooms.has(canvas))throw roomError('ALREADY_MOUNTED','同一canvas已有房间实例，请先销毁');
  if(typeof characterFactory!=='function')throw roomError('INVALID_CHARACTER','角色工厂必须为函数');
  if(options.initialPoints!==undefined&&(!Number.isSafeInteger(options.initialPoints)||options.initialPoints<0))throw roomError('INVALID_POINTS','初始积分必须为非负整数');
  if(options.loadTimeoutMs!==undefined&&(!Number.isFinite(options.loadTimeoutMs)||options.loadTimeoutMs<=0))throw roomError('INVALID_TIMEOUT','加载超时必须为正的有限毫秒数');
  const doc=canvas.ownerDocument,win=doc.defaultView;
  const quality={...resolveQuality(options.quality||'auto',{coarsePointer:win.matchMedia?.('(pointer: coarse)')?.matches,deviceMemory:win.navigator.deviceMemory})};
  // 空闲省电（清单106）：静止无操作时自动降到低帧率，任意手指/键盘交互立刻恢复流畅。动态生效、可回退。
  let idleSince=0,idleFps=false;
  const touchActivity=()=>{if(idleFps){idleFps=false;idleSince=0;}else idleSince=win.performance.now();};
  const assetsBaseUrl=options.assetsBaseUrl===undefined?null:new URL(options.assetsBaseUrl,doc.baseURI||win.location?.href).href;
  const events=new win.AbortController(),eventOptions={signal:events.signal},loadAbort=new win.AbortController();
  const sfx=createSfx(); // 程序化音效：Node/无 AudioContext 时静默 no-op，不崩溃
  // 触觉反馈（清单44）：封装 navigator.vibrate，无支持或静音时安全 no-op。
  function vibrate(pattern){try{if(win.navigator?.vibrate)win.navigator.vibrate(pattern);}catch{}}
  const disposer=createDisposer(),scene=new THREE.Scene();scene.background=new THREE.Color(PALETTE.background);
  let renderer=null,disposed=false,lifecycle='loading',lastError=null,loadTimedOut=false,loadFailure=null;
  let frameId=0,resizeObserver=null,intersectionObserver=null,canvasVisible=true;
  let presentationPaused=false,renderSurface=null,renderCount=0,themeMode='light';
  let initTimer=0,previous=0,lastRender=0,lastMetrics=0,metricsFrames=0,fps=0,lowFpsStreak=0;
  let lampOn=true,actor=null,lampRoot,sofaRoot,lampLight,lampBulb,seatWorld=new THREE.Vector3(),approachWorld=new THREE.Vector3();
  let obstacles=[],layoutManager=null,decoration=null,decorationReady=null,commerceBusy=false,defaultRoomLayout=null;
  const storageKey=options.storageKey||'hamster-room-layout-v3';
  const roomStorage=resolveRoomStorage(options.storageAdapter,win);
  let economy=createEconomy({storageAdapter:roomStorage,storageKey:storageKey+'-account-v1',initialBalance:options.initialPoints??0});
  let profile=createProfile({storageAdapter:roomStorage,storageKey:storageKey+'-profile-v1',onEvent:(type,detail)=>notify(type,detail)});
  const companionStore=createCompanionStore({adapter:roomStorage,key:storageKey+COMPANION_SUFFIX});
  const reducedMotion=!!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let feel=null,fx=null,ceremony=null,lastTouched=0,lastIdleCheck=0,returnVisit=null,nightActive=false,nightChecked=0,ritualPoints=[],lastHiddenAt=0,giftTimer=0,lastSnore=0,pendingVoiceGreeting=true;
  const voice=createPetVoice({win,eventTarget:doc});
  let play=null,creative=null;
  const lastLandTimes=new Map();
  sfx.arm?.(doc);sfx.configure?.(companionStore.getState().sound);
  const initialAccount=economy.getState();
  let roomTier=ROOM_TIERS[initialAccount.roomLevel]||ROOM_TIERS[0];
  const bounds=petNavigationBounds(roomTier.width,roomTier.depth),placementBounds={...PLACEMENT_BOUNDS};
  const camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,80);
  camera.position.set(9,11.8,17);camera.lookAt(0,1.35,0);camera.updateMatrixWorld(true);camera.layers.enable(1);
  const skyLight=new THREE.HemisphereLight(0xfff7df,0xe1b782,1.0);scene.add(skyLight);
  const sun=new THREE.DirectionalLight(0xffefd0,1.3);sun.position.set(-3,9,7);sun.castShadow=true;
  sun.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);sun.shadow.camera.left=-7;sun.shadow.camera.right=7;
  sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;
  sun.shadow.radius=4;scene.add(sun);sun.target.position.set(0,0,-1);scene.add(sun.target);
  const gradient=new THREE.DataTexture(new Uint8Array([132,180,217,255]),4,1,THREE.RedFormat);
  gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
  const materialCache=new Map();
  function solidMaterial(color){if(!materialCache.has(color))materialCache.set(color,new THREE.MeshToonMaterial({color,gradientMap:gradient}));return materialCache.get(color);}
  const {items:decor}=buildDecor(scene,solidMaterial);
  scene.traverse(object=>{if(object.isMesh)object.layers.enable(1);});
  const furniture=new Map(decor),interactive=[],loader=new GLTFLoader(),lampGlow={value:.22},keys=new Set();
  // 光照过渡（清单85）：白天/夜晚/护眼主题的切换不是"啪"地跳变，而是在渲染帧里指数趋近目标，柔和渐变。
  // 清单32 学习光点复用同一通道：学习成功时 lampGlow 短暂脉冲并回落。
  let themeTargets=null,glowPulseUntil=0,glowPulsePeak=0;
  // 间歇强化（清单45）：不定时轻轻鼓励一句，保持陪伴感（概率低、间隔长，不打扰）。
  let lastCheer=0,lastLeash=0;
  feel=createCompanionScene({THREE,scene,doc,getActor:()=>actor,getFurniture:()=>furniture,getSize:()=>({width:roomTier.width,depth:roomTier.depth}),canVisit:point=>insidePetBounds(point,bounds)&&!insideObstacle(point.x,point.z),reducedMotion});
  creative=createCreativeScene({THREE,scene,doc,getSize:()=>({width:roomTier.width,depth:roomTier.depth})});
  play=createPlayScene({THREE,scene,doc,getActor:()=>actor,getSize:()=>({width:roomTier.width,depth:roomTier.depth}),getObstacles:()=>obstacles,getFurniture:()=>furniture,canVisit:point=>insidePetBounds(point,bounds)&&!insideObstacle(point.x,point.z),reducedMotion,onEvent:(type,detail)=>notify(type,detail)});
  ceremony=createMovingCeremony({scene,camera,root:uiRoot,getFurniture:()=>furniture,reducedMotion,onFinish:()=>{if(!disposed)resize();}});
  if(uiRoot)fx=createCompanionFx({root:uiRoot,doc,getOwner:()=>profile.getState().name,onSound:name=>sfx.play(name),reducedMotion});
  let floorFinish=null;
  function syncAppearance(){
    const appearance=economy.getState().appearance;
    applyWallPaint(furniture,appearance.wallColor,solidMaterial);
    if(floorFinish){floorFinish.removeFromParent();floorFinish.traverse(node=>{if(node.isMesh)node.geometry.dispose();});floorFinish=null;}
    if(appearance.flooring){floorFinish=createFloorFinish(appearance.flooring,roomTier.width,roomTier.depth,solidMaterial);scene.add(floorFinish);floorFinish.traverse(node=>{if(node.isMesh)node.layers.enable(1);});}
  }
  const furnitureDefinitions=JSON.parse(JSON.stringify(COLLIDERS));
  for(const sku of initialAccount.owned){
    if((initialAccount.stored||[]).includes(sku))continue; // v2.8：仓库里的家具不自动摆放
    if(FLOOR_CATALOG.some(item=>item.sku===sku))continue;
    const item=WALL_CATALOG.some(item=>item.sku===sku)?createWallHanging(sku,solidMaterial):createShopFurniture(sku,solidMaterial);
    if(item.root.userData.wallHanging){const saved=initialAccount.layout?.furniture?.[item.root.name];if(saved){item.root.position.fromArray(saved.position);item.root.rotation.fromArray(saved.rotation);}else item.root.position.set(-2.6,3.7,-roomTier.depth/2+.22);}
    scene.add(item.root);furniture.set(item.root.name,item.root);furnitureDefinitions[item.root.name]=item.definition;
    if(WATER_TARGETS[item.root.name]){item.root.userData.interaction='water';item.root.userData.waterTargetId=item.root.name;}
  }
  applyRoomTier({furniture,width:roomTier.width,depth:roomTier.depth,bounds,placementBounds});
  Object.assign(bounds,petNavigationBounds(roomTier.width,roomTier.depth));
  syncAppearance();
  // 软凳是可坐家具：与沙发共用“坐下/起立”交互。
  for(const id of ['ottoman-a','ottoman-b']){const root=furniture.get(id);if(root){root.userData.interaction='seat';root.userData.seatId=id;interactive.push(root);}}
  // 地面盆栽与商店四叶草盆栽是可浇水目标：悬停提示、点击后过去浇水。
  for(const id of Object.keys(WATER_TARGETS)){const root=furniture.get(id);if(!root)continue;root.userData.interaction='water';root.userData.waterTargetId=id;interactive.push(root);}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.09),pointerTarget=new THREE.Vector3();
  const originalTouchAction=canvas.style.touchAction,originalTabIndex=canvas.getAttribute('tabindex');
  canvas.style.touchAction='none';if(canvas.tabIndex<0)canvas.tabIndex=0;
  const rightAxis=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);rightAxis.y=0;rightAxis.normalize();
  const downAxis=new THREE.Vector3(-rightAxis.z,0,rightAxis.x);
  function safeCall(callback,...args){try{callback?.(...args);}catch(error){if(options.debug)console.warn('Room host callback failed',error);}}
  function getState(){
    const rounded=value=>+value.toFixed(3);
    return {protocolVersion:1,version:'2.28.1',lifecycle,ready:lifecycle==='ready',character:actor?.character.metadata||null,lampOn,shop:getShop(),
      petState:actor?.state||'loading',petPosition:actor?.root.position.toArray().map(rounded)||null,
      petYaw:actor?rounded(actor.root.rotation.y):0,desiredSeated:actor?.desiredSeated||false,
      seatId:actor?.seatId||null,sitting:actor?rounded(actor.pose.amount):0,poseStage:actor?.pose.stage||'',
      watering:actor?.state==='watering'||false,waterTarget:actor?.waterTarget?.id||null,
      decoration:decoration?.active||false,selected:decoration?.selected||null,error:lastError,
      metrics:{fps:Math.round(fps),triangles:renderer?.info.render.triangles||0,drawCalls:renderer?.info.render.calls||0,quality:quality.autoDowngraded?'low':quality.profile,maxPixelRatio:quality.autoDowngraded?1:quality.maxPixelRatio,autoDowngraded:quality.autoDowngraded||false,presentationPaused,renderCount}};
  }
  function getShop(){
    const account=economy.getState();
    return {balance:account.balance,owned:account.owned,stored:account.stored||[],roomLevel:account.roomLevel,maxRoomLevel:account.maxRoomLevel,roomName:roomTier.name,width:roomTier.width,depth:roomTier.depth,
      catalog:SHOP_CATALOG,storageCatalog:[...STORAGE_CATALOG,...giftCatalog(companionStore.getState().rewards).filter(item=>account.owned.includes(item.sku))],pets:account.pets,appearance:account.appearance,wallPaints:WALL_PAINTS,totalSpent:account.totalSpent,tiers:ROOM_TIERS,nextTier:account.nextTier,busy:commerceBusy,valid:account.valid,error:account.error,
      // v2.17/F4：心愿目标等商店个性化设置按 storageKey 独立存取。
      storageKey};
  }
  function updateStatus(){
    canvas.dataset.petState=actor?.state||lifecycle;canvas.dataset.lampOn=String(lampOn);canvas.dataset.lifecycle=lifecycle;
    renderHint?.();
    safeCall(options.onState,getState());
  }
  function notify(type,detail={}){
    if(disposed&&type!=='disposed')return;
    const plan=planInteraction(type,detail,{ownerName:profile.getState().name,isNewFurniture:type==='furniture-placed'&&!!detail.sku&&!companionStore.getState().memories[detail.sku],reducedMotion,night:nightActive});
    let landSoundAllowed=true;
    if(type==='decoration-mode')resize();
    if(type==='room-expanded'){syncCompanion();ceremony?.start({fromWidth:detail.fromWidth||roomTier.width,fromDepth:detail.fromDepth||roomTier.depth,toWidth:roomTier.width,toDepth:roomTier.depth,roomName:companionStore.getState().roomName});feel?.ritual();fx?.say('{owner}，搬进新家啦！我先转一圈看看～');if(actor){const x=actor.ctrl.x,z=actor.ctrl.z;ritualPoints=[{x:x+.55,z},{x:x+.55,z:z+.55},{x,z:z+.55},{x,z}].filter(p=>p.x>bounds.minX&&p.x<bounds.maxX&&p.z>bounds.minZ&&p.z<bounds.maxZ&&!insideObstacle(p.x,p.z));}schedule();}
    if(presentationPaused&&['furniture-placed','furniture-stored','flooring-applied','wall-color-changed','room-expanded','pet-selected','pet-purchased','layout-change'].includes(type))capturePoster();
    if(type==='water-done')lastWateredAt=(win.performance?.now?.()||Date.now());
    if(type==='seat-blocked')fx?.say(detail.message||'座椅边的通道太窄啦，往屋里挪一点再坐吧～');
    // v2.17/F6：摆放、收纳、扩建、切房型等影响布局的落账后自动留一份最近备份。
    if(type==='layout-change'||type==='room-expanded')scheduleAutoBackup();
    // 把 changelog 承诺的音效真正接进事件流（v2.8 之前只有模块与测试，UI 从未发声）。
    if(type==='furniture-landed'||type==='furniture-placed'){if(Date.now()-(lastLandTimes.get(detail.id)||0)>160){lastLandTimes.set(detail.id,Date.now());feel?.land(detail.id);}else landSoundAllowed=false;}
    if(type==='furniture-placed'&&detail.sku){const gift=giftProduct(detail.sku),existing=companionStore.getState().memories[gift?.rewardId||detail.sku];if(!existing&&!gift){companionStore.remember(detail.sku,profile.getState().name||'小主人');feel?.react('cheer');fx?.say('{owner}，新家具来啦！我好喜欢～');}syncCompanion();}
    if(type==='furniture-stored')syncCompanion();
    if(type==='pet-purchased'){companionStore.remember(detail.sku,profile.getState().name||'小主人','一起认识的新伙伴');syncCompanion();feel?.react('cheer');fx?.say('{owner}，又认识一位新朋友啦～');}
    if(type==='pet-selected')syncCompanion();
    if(landSoundAllowed)for(const name of plan.sounds)sfx.play(name);
    safeCall(options.onInteraction,plan);
    if(uiRoot&&typeof win.CustomEvent==='function')uiRoot.dispatchEvent(new win.CustomEvent('pet-room-interaction',{detail:{type,detail}}));
    safeCall(options.onEvent,type,detail);updateStatus();
  }
  function waitForLoad(promise,lateCleanup){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const abort=()=>{if(settled)return;settled=true;loadAbort.signal.removeEventListener('abort',abort);reject(roomError(disposed?'ABORTED':'INITIALIZATION_TIMEOUT',disposed?'房间加载已取消':'房间初始化已超时'));};
      if(loadAbort.signal.aborted){abort();Promise.resolve(promise).then(value=>lateCleanup?.(value),()=>{});return;}
      loadAbort.signal.addEventListener('abort',abort,{once:true});
      Promise.resolve(promise).then(value=>{
        if(settled){lateCleanup?.(value);return;}settled=true;loadAbort.signal.removeEventListener('abort',abort);resolve(value);
      },error=>{if(settled)return;settled=true;loadAbort.signal.removeEventListener('abort',abort);reject(error);});
    });
  }
function toonModel(model,isLamp=false) {
  model.traverse(obj=>{
    if(!obj.isMesh) return;
    const replace=(old)=>{
      const m=new THREE.MeshToonMaterial({map:old.map,color:old.color,gradientMap:gradient,
        transparent:old.transparent,opacity:old.opacity,alphaTest:old.alphaTest,side:old.side,
        normalMap:old.normalMap,normalScale:old.normalScale});
      if(old.map) { old.map.colorSpace=THREE.SRGBColorSpace; old.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy()); }
      if(isLamp) {
        // 输入灯只有一个材质。按局部高度限制发光区域，只照亮灯罩，不让底座一起发光。
        m.onBeforeCompile=shader=>{
          shader.uniforms.uLampGlow=lampGlow;
          shader.vertexShader='varying float vLampHeight;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLampHeight=position.y;');
          shader.fragmentShader='uniform float uLampGlow; varying float vLampHeight;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,0.56,0.20)*smoothstep(0.59,0.68,vLampHeight)*uLampGlow;');
        };
        m.customProgramCacheKey=()=> 'lamp-height-glow-v1';
      }
      old.dispose(); return m;
    };
    obj.material=Array.isArray(obj.material)?obj.material.map(replace):replace(obj.material);
    obj.castShadow=true; obj.receiveShadow=true;
    if(!isLamp)obj.layers.enable(1);
  });
}
async function loadFurniture(id,config) {
  const url=options.assetUrls?.[id]?new URL(options.assetUrls[id],doc.baseURI||win.location?.href).href:assetsBaseUrl?resolveAssetURL(config.asset||config.url.replace('./assets/',''),assetsBaseUrl):DEFAULT_ASSET_URLS[id];
  let gltf;
  try {
    const response=await fetch(url,{signal:loadAbort.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();
    if(disposed||loadAbort.signal.aborted)throw roomError('ABORTED','房间加载已取消');
    gltf=await waitForLoad(loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1)),late=>disposer.tree(late.scene));
    if(disposed||loadAbort.signal.aborted){disposer.tree(gltf.scene);throw roomError('ABORTED','房间加载已取消');}
    toonModel(gltf.scene,id==='lamp');
    const root=new THREE.Group();root.name=id;root.userData.furnitureId=id;root.add(gltf.scene);
    root.position.fromArray(config.position);root.rotation.fromArray(config.rotation);root.scale.setScalar(config.scale);
    scene.add(root);root.updateMatrixWorld(true);furniture.set(id,root);
    if(id==='sofa'){root.userData.interaction='seat';root.userData.seatId='sofa';interactive.push(root);}
    else if(id==='lamp'){root.userData.interaction='lamp';interactive.push(root);}
    notify('asset-loaded',{id});return root;
  } catch(error) {
    if(gltf&&!gltf.scene.parent)disposer.tree(gltf.scene);
    const failure=roomError(loadTimedOut?'ASSET_TIMEOUT':disposed?'ABORTED':'ASSET_LOAD_FAILED',`家具 ${id} 加载失败`,error);
    if(!loadAbort.signal.aborted){loadFailure=failure;loadAbort.abort();}
    throw failure;
  }
}
function setLamp(on) {
  if(typeof on!=='boolean'||disposed)return false;
  lampOn=on;
  if(lampBulb) lampBulb.visible=lampOn;
  setLightTargets();
  notify('lamp-change',{on:lampOn});return true;
}
function insideObstacle(x,z) { return obstacles.some(o=>x>=o.minX&&x<=o.maxX&&z>=o.minZ&&z<=o.maxZ); }
function clearSegment(a,b) {
  // 连续线段测试：低帧率时也不会跨过薄家具。碰撞盒已含宠物半径。
  for(const o of obstacles) {
    let lo=0,hi=1;
    for(const axis of ['x','z']) {
      const d=b[axis]-a[axis],min=o[axis==='x'?'minX':'minZ'],max=o[axis==='x'?'maxX':'maxZ'];
      if(Math.abs(d)<1e-9) { if(a[axis]<min||a[axis]>max) {lo=2;break;} }
      else {let t1=(min-a[axis])/d,t2=(max-a[axis])/d; if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}
    }
    if(lo<=hi&&hi>=0&&lo<=1) return false;
  }
  return true;
}
function resolveSeat() {
  if(!sofaRoot)return; // 沙发被收回仓库时没有座位可解析
  const anchor=new THREE.Vector3(...SOFA.seat); const r=SOFA.seatRegion;
  // 从候选座面上方向下取交点，先变回模型局部坐标过滤，不能误用靠背最高点。
  const start=sofaRoot.localToWorld(new THREE.Vector3(anchor.x,r.maxY+.03,anchor.z));
  const seatRay=new THREE.Raycaster(start,new THREE.Vector3(0,-1,0),0,.7);
  const hits=seatRay.intersectObject(sofaRoot,true);
  for(const hit of hits) {
    const p=sofaRoot.worldToLocal(hit.point.clone());
    const normal=hit.face?.normal.clone().transformDirection(hit.object.matrixWorld);
    if(p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ&&p.y>=r.minY&&p.y<=r.maxY&&normal?.y>.68) {
      anchor.y=p.y; break;
    }
  }
  seatWorld=sofaRoot.localToWorld(anchor);
  approachWorld=sofaRoot.localToWorld(new THREE.Vector3(...SOFA.approach)); approachWorld.y=.09;
}
const smooth=t=>t*t*(3-2*t);
function angleLerp(a,b,t) { return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t; }
class PetActor {
  constructor(character) {
    const model=character.model;this.character=character;
    this.root=new THREE.Group(); this.root.name='pet'; scene.add(this.root); furniture.set('pet',this.root);
    this.gait=new THREE.Group(); this.root.add(this.gait);
    const facing=new THREE.Group(); facing.scale.setScalar(ROOM.petHeight); this.gait.add(facing); facing.add(model);
    this.facing=facing; // 浇水鞠躬等姿态直接旋转朝向组
    this.pose=character.pose;
    this.ctrl=new MovementController({speed:1.15,acceleration:3.8,braking:6,turnRate:6.8,bounds});
    this.ctrl.x=.65; this.ctrl.z=2.83; this.ctrl.yaw=this.ctrl.renderYaw=.15;
    this.root.position.set(this.ctrl.x,.09,this.ctrl.z); this.root.rotation.y=.15;
    this.state='idle'; this.desiredSeated=false; this.path=[]; this.pendingPoint=null;
    this.seatId=null;this.pendingSeatId=null;this.seatWorld=new THREE.Vector3();this.approachWorld=new THREE.Vector3();this.seatYaw=0;
    this.waterTarget=null;this.pendingWater=false;this.waterT=0;this.waterDuration=1.7;
    this.elapsed=0; this.phase=0; this.gaitWeight=0; this.transition=null;
    // 接触阴影只跟宠物走，不会在动画中锁在原地。
    const texCanvas=doc.createElement('canvas');texCanvas.width=texCanvas.height=64;
    const ctx=texCanvas.getContext('2d'),g=ctx.createRadialGradient(32,32,1,32,32,32);
    g.addColorStop(0,'rgba(103,74,43,.24)');g.addColorStop(1,'rgba(103,74,43,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.25,1.03),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(texCanvas),transparent:true,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2; scene.add(this.shadow);
  }
  setState(state) { this.state=state;this.elapsed=0;notify('pet-state',{state}); }
  routeTo(point,state='walking') {
    const route=createPath({x:this.ctrl.x,z:this.ctrl.z},{x:point.x,z:point.z},{bounds,obstacles,cellSize:.18});
    if(!route) {notify('path-blocked');return false;}
    this.path=route; this.ctrl.stop(); this.setState(state); this.nextWaypoint(); return true;
  }
  nextWaypoint() {
    const p=this.path.shift(); if(p)this.ctrl.setTarget(p.x,p.z);
  }
  toggleSeat(seatId='sofa') {
    if(!SEATS[seatId])return;
    const already=this.seatId===seatId&&this.desiredSeated;
    this.pendingPoint=null;
    if(already) {
      this.desiredSeated=false;this.pendingSeatId=null;
      if(['seated','sitting-down'].includes(this.state))this.standUp();
      else if(this.state==='approaching'){this.ctrl.stop();this.path=[];this.seatId=null;this.setState('idle');}
      updateStatus();return;
    }
    this.desiredSeated=true;this.pendingSeatId=seatId;
    if(['idle','walking'].includes(this.state))this.goToSeat(seatId);
    else if(['seated','sitting-down'].includes(this.state))this.standUp();
    else if(this.state==='approaching'){this.ctrl.stop();this.path=[];this.goToSeat(seatId);}
    else if(this.state==='watering'){this.pendingWater=false;this.facing.rotation.x=0;this.root.position.y=.09;this.pose.setWatering?.(0);this.setState('idle');this.goToSeat(seatId);}
    updateStatus();
  }
  /** 点击花盆：无论坐在沙发还是软凳上都会先起立，走过去然后再弯腰浇水。 */
  requestWater(targetId='floor-pot') {
    const root=furniture.get(targetId);if(!root||!WATER_TARGETS[targetId])return false;
    const fitted=fitWater(root,targetId);if(!fitted)return false;
    const approach=resolveWaterApproach(root,targetId,{obstacles,bounds,from:{x:this.ctrl.x,z:this.ctrl.z},petRadius:PET_BODY_RADIUS});
    if(!approach){notify('water-blocked',{targetId});return false;}
    this.waterTarget={id:targetId,fitted:{approachWorld:approach,facingYaw:fitted.facingYaw}};
    this.pendingPoint=null;this.pendingSeatId=null;this.pendingWater=true;this.desiredSeated=false;
    let started=true;
    if(['idle','walking'].includes(this.state))started=this.goToWater();
    else if(['seated','sitting-down'].includes(this.state))this.standUp();
    else if(this.state==='approaching'){this.ctrl.stop();this.path=[];this.seatId=null;started=this.goToWater();}
    else if(this.state==='hopping-on'||this.state==='hopping-off'){/* 落地后由 hop 分支接管继续去浇水 */started=true;}
    else if(this.state==='watering')return false;
    else started=true;
    if(!started){this.pendingWater=false;this.waterTarget=null;}
    if(started)updateStatus();
    return started;
  }
  /** pendingWater 只在这里被消费：一路保留到到达浇水点，由 startWatering 清零。 */
  goToWater() {
    if(!this.waterTarget)return false;
    return this.routeTo(this.waterTarget.fitted.approachWorld);
  }
  startWatering() {
    this.pendingWater=false;
    const yaw=this.waterTarget?.fitted.facingYaw||this.ctrl.renderYaw;
    this.ctrl.yaw=this.ctrl.renderYaw=yaw;this.root.rotation.y=yaw;
    this.waterT=0;this.setState('watering');notify('water-start',{targetId:this.waterTarget?.id||null});
  }
  goToSeat(seatId) {
    this.pendingSeatId=null;
    if(!this.useSeat(seatId)){this.desiredSeated=false;this.seatId=null;return;}
    if(this.routeTo(this.approachWorld,'approaching'))return;
    this.desiredSeated=false;this.pendingSeatId=null;this.seatId=null;
  }
  useSeat(seatId) {
    const root=furniture.get(seatId);if(!root)return false;
    const fitted=fitSeat(root,seatId);if(!fitted)return false;
    if(seatId==='sofa'){resolveSeat();fitted.seatWorld=seatWorld;}
    if(!insidePetBounds(fitted.seatWorld,bounds)){notify('seat-blocked',{id:seatId,message:'这里太靠近房间边缘啦，先把座椅往屋里挪一点吧～'});return false;}
    const approach=resolveSeatApproach(root,seatId,{obstacles,bounds,from:{x:this.ctrl.x,z:this.ctrl.z},petRadius:PET_BODY_RADIUS});
    if(!approach){notify('seat-blocked',{id:seatId,message:'座椅边的通道太窄啦，先调整家具留出屋内通道吧～'});return false;}
    this.seatId=seatId;
    this.seatWorld.copy(fitted.seatWorld);this.approachWorld.copy(approach);this.seatYaw=fitted.seatYaw;
    return true;
  }
  walkTo(point) {
    if(!insidePetBounds(point,bounds)||insideObstacle(point.x,point.z))return false;
    this.desiredSeated=false;this.pendingSeatId=null;
    if(!['idle','walking','approaching'].includes(this.state)) {
      // 浇水时点地面：已经站直，直接中断浇水改走过去（不能只记 pendingPoint，idle 分支不会消费它）。
      if(this.state==='watering'){this.pendingWater=false;this.facing.rotation.x=0;this.root.position.y=.09;this.pose.setWatering?.(0);this.setState('idle');return this.routeTo(point);}
      this.pendingPoint={x:point.x,z:point.z}; if(['seated','sitting-down'].includes(this.state))this.standUp(); return true;
    }
    this.pendingPoint=null;this.seatId=null;return this.routeTo(point);
  }
  hop(on) {
    this.ctrl.stop(); this.path=[];
    const target=on?this.seatWorld.clone():this.approachWorld.clone();
    // 起跳/落座时有独立高度轨道，坐姿权重随后再压低臀部，始终接触坐垫。
    target.y=on?this.seatWorld.y+.008:.09;
    const seatYaw=this.seatYaw;
    this.transition={from:this.root.position.clone(),to:target,fromYaw:this.root.rotation.y,toYaw:seatYaw,duration:on?.82:.70,on};
    this.setState(on?'hopping-on':'hopping-off');
  }
  sitDown() { this.pose.sit();this.setState('sitting-down'); }
  standUp() { this.pose.stand();this.setState('standing-up'); }
  update(dt,axis) {
    this.elapsed+=dt; this.pose.update(dt);
    const mobile=['idle','walking','approaching'].includes(this.state);
    const keyboard=Math.hypot(axis.x,axis.z)>.01;
    if(mobile) {
      if(keyboard) {this.desiredSeated=false;this.seatId=null;this.pendingSeatId=null;this.path=[];if(this.state!=='walking')this.setState('walking');}
      const before={x:this.ctrl.x,z:this.ctrl.z}; this.ctrl.update(dt,axis);
      if(!clearSegment(before,{x:this.ctrl.x,z:this.ctrl.z})) {
        this.ctrl.x=before.x;this.ctrl.z=before.z;this.ctrl.stop();this.path=[];
        if(this.state==='approaching'){this.desiredSeated=false;this.seatId=null;}
        if(this.state!=='idle')this.setState('idle');
      }
      this.root.position.set(this.ctrl.x,.09,this.ctrl.z);this.root.rotation.y=this.ctrl.renderYaw;
      if(!keyboard&&!this.ctrl.target&&this.ctrl.currentSpeed===0) {
        if(this.path.length)this.nextWaypoint();
        else if(this.state==='approaching') {if(this.desiredSeated)this.hop(true);else this.setState('idle');}
        else if(this.state==='walking'){if(this.pendingWater)this.startWatering();else this.setState('idle');}
      }
    } else if(this.state==='hopping-on'||this.state==='hopping-off') {
      const tr=this.transition,t=Math.min(1,this.elapsed/tr.duration),s=smooth(t);
      this.root.position.lerpVectors(tr.from,tr.to,s);
      this.root.position.y+=Math.sin(Math.PI*t)*.43;
      this.root.rotation.y=angleLerp(tr.fromYaw,tr.toYaw,s);
      if(t===1) {
        if(tr.on) {if(this.desiredSeated)this.sitDown();else this.standUp();}
        else {
          this.ctrl.x=tr.to.x;this.ctrl.z=tr.to.z;this.ctrl.yaw=this.ctrl.renderYaw=tr.toYaw;
          this.seatId=null;this.setState('idle');
          if(this.pendingSeatId){const next=this.pendingSeatId;this.pendingSeatId=null;this.goToSeat(next);}
          else if(this.desiredSeated)this.goToSeat(this.seatId||'sofa');
          else if(this.pendingPoint){const p=this.pendingPoint;this.pendingPoint=null;this.walkTo(p);}
          else if(this.pendingWater)this.goToWater();
        }
      }
    } else if(this.state==='sitting-down'||this.state==='standing-up'||this.state==='seated') {
      // 无论坐在哪件家具上，一按移动键就自动起立；起立完成并落地后由 idle 分支接管行走。
      if(keyboard&&this.state!=='standing-up'){this.desiredSeated=false;this.pendingSeatId=null;this.pendingWater=false;this.standUp();}
      this.root.position.copy(this.seatWorld);
      this.root.position.y+=.008-this.pose.contactY*ROOM.petHeight*this.pose.amount;
      if(this.state==='sitting-down'&&this.elapsed>=(this.pose.duration?.sit||.70)+.05) {this.setState('seated');if(!this.desiredSeated)this.standUp();}
      else if(this.state==='standing-up'&&this.elapsed>=(this.pose.duration?.stand||.55)+.05)this.hop(false);
    } else if(this.state==='watering') {
      // 站在盆栽前弯腰两次（面向盆栽），模拟浇水；一按移动键立刻取消并恢复行走。
      if(keyboard){this.pendingWater=false;this.facing.rotation.x=0;this.root.position.y=.09;this.pose.setWatering?.(0);this.setState('idle');}
      else {
        this.waterT+=dt;
        const total=this.waterDuration,t=Math.min(1,this.waterT/total);
        this.facing.rotation.x=-Math.sin(Math.PI*Math.min(1,this.waterT/(total*.55)))*.16;
        // 手臂随浇水节奏抬起/收回（端着水壶前伸），与整体前倾叠加。
        this.pose.setWatering?.(Math.sin(Math.PI*Math.min(1,this.waterT/(total*.9))));
        this.root.position.y=.09-Math.abs(Math.sin(t*Math.PI*3))*.05;
        if(t>=1){this.facing.rotation.x=0;this.root.position.y=.09;this.pose.setWatering?.(0);this.setState('idle');notify('water-done',{targetId:this.waterTarget?.id||null});}
      }
    }
    // 按实际路程驱动起伏，停止时渐隐；脸的朝向始终来自实际位移方向。
    const weight=mobile?Math.min(1,this.ctrl.currentSpeed/this.ctrl.speed):0;
    this.gaitWeight=THREE.MathUtils.damp(this.gaitWeight,weight,12,dt);
    this.phase+=this.ctrl.stepDistance/.48*Math.PI*2;
    this.pose.setLocomotion?.({speed:mobile?this.ctrl.currentSpeed:0,phase:this.phase,weight:this.gaitWeight});
    this.shadow.position.set(this.root.position.x,(mobile||this.state==='watering')?.077:this.seatWorld.y+.012,this.root.position.z);
    this.shadow.visible=!['hopping-on','hopping-off'].includes(this.state);
    this.shadow.scale.setScalar(mobile?1:.85);
  }
}
function resize() {
  if(!renderer||disposed)return;
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);renderSurface.resize(w,h,Math.min(win.devicePixelRatio||1,quality.maxPixelRatio));
  // 对房间固定包围盒作投影适配，竖屏手机与桌面均不裁掉家具。
  const view=new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const projected=new THREE.Box3();
  const reference=ROOM_TIERS.at(-1);
  for(const x of [-reference.width/2-.3,reference.width/2+.3])for(const y of [-.4,5.40])for(const z of [-reference.depth/2-.15,reference.depth/2+.15])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(view));
  const center=projected.getCenter(new THREE.Vector3());
  const aspect=w/h;
  const dock=decoration?.active?uiRoot?.querySelector('[data-room-control="storage-strip"]'):null;
  const bottomInset=dock&&!dock.hidden?Math.min(h*.6,Math.max(0,canvas.getBoundingClientRect().bottom-dock.getBoundingClientRect().top+8)):0;
  // 竖屏优先保留主要家具，房间地板的两个外角可出画；避免手机里整间房缩成小图标。
  // 装修时展示完整房间，并给底部家具栏留出空间，避免前沿家具和伙伴被遮挡。
  const contentWidth=(projected.max.x-projected.min.x)*1.06;
  const halfY=Math.max((projected.max.y-projected.min.y)*.51/(1-bottomInset/h),contentWidth/2/aspect);
  const offsetY=halfY*bottomInset/h;
  camera.left=center.x-halfY*aspect;camera.right=center.x+halfY*aspect;
  camera.top=center.y+halfY-offsetY;camera.bottom=center.y-halfY-offsetY;camera.updateProjectionMatrix();
  if(presentationPaused)capturePoster();else renderScene();
}
function renderScene(){if(renderer&&!disposed){renderer.render(scene,camera);renderCount++;}}
function capturePoster(){
  return renderSurface?.capture()||false;
}
function setPresentationPaused(enabled){
  if(typeof enabled!=='boolean'||disposed||lifecycle!=='ready')return false;
  if(enabled===presentationPaused)return true;
  if(enabled){capturePoster();presentationPaused=true;releaseKeys();}
  else{presentationPaused=false;renderSurface?.resume();previous=0;lastRender=0;lastMetrics=win.performance.now();metricsFrames=0;schedule();}
  updateStatus();return true;
}
function setTheme(mode){
  if(disposed||!['light','eye-care','candy'].includes(mode))return false;
  themeMode=mode;setLightTargets();capturePosterIfPaused();
  return true;
}
// 计算当前主题/白天黑夜的目标光照并写入 themeTargets；首次调用直接应用（无渐变）。
function setLightTargets(){
  const calm=themeMode==='eye-care';
  const targets={background:new THREE.Color(nightActive?0x939bae:themeMode==='candy'?0xf8e5ed:calm?0xcbd4bf:0xf3eddd),exposure:nightActive?.65:calm?.83:1,
    sun:new THREE.Color(calm?0xffe7c0:0xffefd0),sunI:calm?1.12:1.3,sky:new THREE.Color(calm?0xf3e8cf:0xfff7df),skyI:calm?.92:1,
    lamp:lampOn?(nightActive?.7:3):0,glow:lampOn?.22:0};
  if(!themeTargets){
    themeTargets=targets;applyLightTargetsImmediate();
  } else themeTargets=targets;
}
function applyLightTargetsImmediate(){
  if(!themeTargets)return;
  scene.background.copy(themeTargets.background);sun.color.copy(themeTargets.sun);sun.intensity=themeTargets.sunI;
  skyLight.color.copy(themeTargets.sky);skyLight.intensity=themeTargets.skyI;
  if(renderer)renderer.toneMappingExposure=themeTargets.exposure;
  if(lampLight)lampLight.intensity=themeTargets.lamp;
  lampGlow.value=themeTargets.glow;
}
// 每帧向目标趋近（清单85 柔和过渡）；响应轻微，异常时不抛。
function applyLightingLerp(){
  if(!themeTargets)return;
  const k=.18;
  try{
    scene.background.lerp(themeTargets.background,k);sun.color.lerp(themeTargets.sun,k);sun.intensity+=(themeTargets.sunI-sun.intensity)*k;
    skyLight.color.lerp(themeTargets.sky,k);skyLight.intensity+=(themeTargets.skyI-skyLight.intensity)*k;
    if(renderer)renderer.toneMappingExposure+=(themeTargets.exposure-renderer.toneMappingExposure)*k;
    if(lampLight)lampLight.intensity+=(themeTargets.lamp-lampLight.intensity)*k;
    let glow=themeTargets.glow;
    if(Date.now()<glowPulseUntil){const left=glowPulseUntil-Date.now();glow=Math.min(1,glow+glowPulsePeak*(left/1200));}
    lampGlow.value+=(glow-lampGlow.value)*Math.min(1,k*1.4);
  }catch{/* 光照过渡失败不影响主流程 */}
}
function capturePosterIfPaused(){if(presentationPaused)capturePoster();}
function getCompanion(){
  const saved=companionStore.getState(),p=profile.getState(),account=economy.getState();
  const nightVisit=(saved.visitDates||[]).some(date=>{const h=date?new Date(date+'T00:00:00'):null;return h&&!Number.isNaN(h.getTime())&&(h.getHours()>=22||h.getHours()<6);});
  const statsForHiddenAchievements=()=>({streakDays:p.streakDays||0,nightVisit,nightSight:nightVisit,pets:account.pets.owned.length+new Set(account.owned).size});
  const preview=key=>new URL(`./assets/products/previews/${key}.png`,import.meta.url).href;
  const owned=new Set([...BUILTIN_STORAGE.map(item=>item.id),...account.owned]);
  const catalogue=[...new Map([...STORAGE_CATALOG,...SHOP_CATALOG].map(item=>[item.sku||item.id,item])).values()];
  const year=new Date().getFullYear(),giftEntries=[...new Map([{id:'secret-star',name:'星光口令摆件',kind:'star'},{id:`pumpkin-${year}`,name:'节日南瓜灯',kind:'pumpkin'},{id:`lantern-${year}`,name:'新年心愿灯笼',kind:'lantern'},...saved.rewards].map(item=>[item.id,item])).values()];
  const memories={...saved.memories},gifts=giftEntries.map(item=>{const sku=giftSku(item),reward=saved.rewards.find(reward=>reward.id===item.id);if(reward)memories[sku]=saved.memories[item.id]||{at:reward.at||null,by:'小主人',source:'gift'};return {sku,name:item.name,owned:!!reward,image:giftPreview(item.kind),expired:!!reward?.expiresAt&&Date.parse(reward.expiresAt)<=Date.now()};});
  const furnitureCatalog=[...STORAGE_CATALOG,...giftCatalog(saved.rewards)];
  const companionShape={...saved,rewards:saved.rewards.map(item=>({...item,sku:giftSku(item)})),memories,ownerName:p.name||'',garden:{flowers:Math.floor(saved.learningSeconds/600),stage:saved.learningSeconds>=7200?'开花啦':saved.learningSeconds>=1200?'长高啦':'小芽芽'},growth:growthFor(saved),skins:ACHIEVEMENT_SKINS.map(skin=>({...skin,unlocked:p.badges.includes(skin.id)})),collection:{pets:account.pets.catalog.map(item=>({...item,owned:account.pets.owned.includes(item.sku),image:new URL(`./assets/pets/previews/${item.sku}.png`,import.meta.url).href})),furniture:[...catalogue.map(item=>{const sku=item.sku||item.id;return {...item,sku,owned:owned.has(sku),image:preview(sku)};}),...gifts]},furniture:furnitureCatalog.filter(item=>owned.has(item.sku||item.id)&&!item.expired).map(item=>({id:item.sku?`shop-${item.sku}`:item.id,name:item.name}))};
  const collection=collectionProgress(account.pets.owned.length+owned.size,account.pets.catalog.length+catalogue.length);
  const holiday=nextHoliday();
  const feature=dailyFeature([...STORAGE_CATALOG,...SHOP_CATALOG].map(item=>({sku:item.sku||item.id,name:item.name,description:item.description})),localDate());
  const placedCount=[...furniture.values()].filter(root=>!root.userData.wallHanging).length;
  const mood=roomMood(placedCount,owned.size+account.pets.owned.length);
  companionShape.daily={holiday,feature,mood,collection:Object.assign(collection,{pets:collectionProgress(account.pets.owned.length,account.pets.catalog.length),furniture:collectionProgress(owned.size,catalogue.length)}),
    seasonal:seasonalWish(),weekly:weeklyChallenge(),
    hidden:hiddenAchievements(statsForHiddenAchievements()),
    preview:previewCalendar(7),fable:monthlyFable(),
    attachment:attachmentLevel(profile.getState().streakDays||0),
    seasonWindow:seasonWindow(),
    achievementStory:achievementStory((profile.getState().badges||[]).slice()),
    milestones:milestoneMoments(),
    growthPage:growthPage(new Set(profile.getState().visitDates||[]).size, saved.petName||'伙伴'),
    fadeOut:fadeOutNotes()};
  return {ok:saved.valid,companion:companionShape,message:saved.error||undefined};
}
function syncGiftInventory(){
  const rewards=companionStore.getState().rewards;let changed=false;
  for(const reward of rewards){const sku=giftSku(reward);if(!sku)continue;const account=economy.getState();
    if(!account.owned.includes(sku)){const result=economy.grantGift(sku,`gift:${reward.id}`);if(result.ok&&!result.unchanged)changed=true;else if(!result.ok)fx?.say('礼物记在手册里啦，仓库暂时没存好，稍后会再试一次～');}
    const root=furniture.get(`shop-${sku}`),expired=!!reward.expiresAt&&Date.parse(reward.expiresAt)<=Date.now();
    if(expired&&root&&!commerceBusy&&!decoration?.active&&!decoration?.pending)void storeFurniture(sku,`expire:${sku}`);
  }
  if(changed)decoration?.refresh();
}
function syncCompanion(){if(disposed)return;syncGiftInventory();const state=companionStore.getState();feel?.sync(getCompanion().companion,profile.getState());play?.sync(state);creative?.sync(state);if(namePlate)namePlate.textContent=`${state.roomName||'暖暖小屋'} · ${state.petName||'团团'}`;if(presentationPaused)capturePoster();}
function updateCompanion(patch){
  if(disposed||lifecycle!=='ready')return {ok:false,message:'伙伴还在整理房间，请稍等一下～'};
  const result=companionStore.update(patch);if(!result.ok)return result;
  if(patch.sound)sfx.configure?.(result.companion.sound);
  voice.configure({enabled:result.companion.voiceEnabled,muted:result.companion.sound.muted,volume:result.companion.sound.volume,language:result.companion.voiceLanguage,style:result.companion.voiceStyle});
  if(patch.theme){setTheme(result.companion.theme);uiRoot?.dispatchEvent(new win.CustomEvent('room-theme-request',{detail:{theme:result.companion.theme}}));}
  if('nightMode'in patch)updateNight(true);
  syncCompanion();notify('companion-change');scheduleAutoBackup();return {...result,companion:getCompanion().companion};
}
function saveCompanionResult(result){if(result.ok){syncCompanion();notify('companion-change');scheduleAutoBackup();schedule();}return result;}
function customizeFurniture(id,patch){
  if(disposed||lifecycle!=='ready')return {ok:false,message:'伙伴还没准备好哦'};
  if(!getCompanion().companion.furniture.some(item=>item.id===id))return {ok:false,message:'先把这件家具带回家，再给它打扮吧～'};
  if(patch?.achievementSkin&&!profile.getState().badges.length)return {ok:false,message:'点亮第一枚成就，就能解锁闪亮皮肤啦！'};
  if(patch?.skinId&&!profile.getState().badges.includes(patch.skinId))return {ok:false,message:'先点亮对应成就，再换上它的专属纹样吧～'};
  const result=companionStore.customize(id,patch);if(result.ok){syncCompanion();fx?.say('这是你设计的，我要好好收藏！');notify('companion-change');scheduleAutoBackup();}return result;
}
function redeemSecret(code){if(disposed||lifecycle!=='ready')return {ok:false,message:'伙伴还没准备好哦'};const result=companionStore.redeem(code);if(result.ok&&!result.unchanged){if(result.reward)companionStore.remember(result.reward.id,profile.getState().name||'小主人','secret');syncCompanion();feel?.react('cheer');fx?.say(result.message);notify('gift-unlocked',{reward:result.reward});scheduleAutoBackup();}return result;}
function updateNight(force=false){
  const now=new Date();if(!force&&Date.now()-nightChecked<60000)return;nightChecked=Date.now();
  const enabled=companionStore.getState().nightMode&&(now.getHours()>=22||now.getHours()<6);
  if(enabled===nightActive&&!force){syncCompanion();return;}nightActive=enabled;feel?.setNight(enabled);setTheme(themeMode);syncCompanion();
  if(enabled&&actor?.state==='idle'&&furniture.has('sofa')){actor.toggleSeat('sofa');fx?.say('星星亮了，伙伴要休息啦。你也早点睡哦～',5000);}
}
function touchCompanion(event){if(disposed||lifecycle!=='ready'||uiRoot&&!uiRoot.contains(event.target)||!uiRoot&&event.target!==canvas)return;touchActivity();ceremony?.cancel();if(event.target===canvas||event.type==='keydown'&&activeElementFor(canvas)===canvas)feel?.interrupt();ritualPoints=[];
// v2.23：回房间欢迎语不再朗读语音，欢迎文字在回房路径以小气泡显示，这里只清掉待播状态。
if(pendingVoiceGreeting)pendingVoiceGreeting=false;
if(Date.now()-lastTouched>15000){lastTouched=Date.now();companionStore.touch();}schedule();}
doc.addEventListener('pointerdown',touchCompanion,eventOptions);doc.addEventListener('keydown',touchCompanion,eventOptions);
function aim(event) {
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
}
function pickedFurniture() {
  const hit=raycaster.intersectObjects(interactive,true)[0];if(!hit)return null;
  let root=hit.object;while(root&&!root.userData.interaction)root=root.parent;return root;
}
let down=null;
function animalUnderPointer(){return play?.pickAnimal?.(raycaster)||(actor?.group&&raycaster.intersectObject(actor.group,true).length?'primary':null);}
function followDrag(){if(!down||!raycaster.ray.intersectPlane(plane,pointerTarget))return;const x=Math.max(bounds.minX,Math.min(bounds.maxX,pointerTarget.x)),z=Math.max(bounds.minZ,Math.min(bounds.maxZ,pointerTarget.z));if(down.animal==='buddy')play?.leadBuddy?.({x,z});else actor?.walkTo({x,z});schedule();}
canvas.addEventListener('pointerdown',e=>{if(e.button>0||commerceBusy||decoration?.active||decoration?.pending||down){return;}aim(e);down={x:e.clientX,y:e.clientY,id:e.pointerId,moved:0,animal:animalUnderPointer()};if(down.animal){e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}canvas.style.cursor='grabbing';}canvas.focus({preventScroll:true});},eventOptions);
canvas.addEventListener('pointerup',e=>{
  if(commerceBusy||decoration?.active||decoration?.pending||!actor||!down||e.pointerId!==down.id)return;
  const moved=Math.max(down.moved,Math.hypot(e.clientX-down.x,e.clientY-down.y));if(down.animal&&moved>8){aim(e);followDrag();}down=null;try{canvas.releasePointerCapture(e.pointerId);}catch{}canvas.style.cursor='default';if(moved>8)return;
  aim(e);triggerInteraction(pickedFurniture());
},eventOptions);
// 点击/键盘 Enter 共用的交互触发：灯、座位、花盆；都不是则当点击地面行走。
function triggerInteraction(picked){
  if(!actor)return;
  const playResult=play?.interact(raycaster);if(playResult?.handled){if(playResult.message)fx?.say(playResult.message);sfx.play('click');vibrate(12);schedule();return;}
  if(picked?.userData.interaction==='lamp')setLamp(!lampOn);
  else if(picked?.userData.interaction==='seat')actor.toggleSeat(picked.userData.seatId||'sofa');
  else if(picked?.userData.interaction==='water')actor.requestWater(picked.userData.waterTargetId||'floor-pot');
  else if(actor.group&&raycaster.intersectObject(actor.group,true)[0]){
    // 点中宠物：白天哼一小段歌 + 轻轻蹭一下（清单46）；夜里则讲晚安小故事（清单89）。
    if(nightActive){
      const lines=bedtimeStory((Date.now()&0xffff)>>>0);fx?.say(lines.join(' '),6400);vibrate(14);feel?.setNight?.(true);
    } else {
      const melody=humMelody((Date.now()&0xffff)>>>0);sfx.playMelody(melody.freqs,{wave:'triangle',gap:.10,dur:.18,noteGain:.09});vibrate(12);feel?.react('nuzzle');
    }
    if(raycaster.ray.intersectPlane(plane,pointerTarget))actor.walkTo(pointerTarget);
  }
  else {
    // 点中普通家具：木琴音高 + 家具说话（清单21/64），并仍可走过去。
    const hitFurniture=raycaster.intersectObjects([...furniture.values()],true)[0];
    if(hitFurniture){
      let root=hitFurniture.object;while(root&&!furniture.has(root.name))root=root.parent;
      const key=root?.name||'';
      const index=furniture.size?Math.abs((Date.now()>>>3)%furniture.size):0;
      sfx.play('click');sfx.playMelody([xylophoneNote(index)],{wave:'sine',gap:.08,dur:.14,noteGain:.08});vibrate(10);
      const named=[...SHOP_CATALOG,...STORAGE_CATALOG].find(item=>(item.sku&&key.startsWith(item.sku))||item.sku===key||item.id===key);
      if(named?.name)fx?.say(furnitureLine(named.name,index),3200);
      // 宠物镜像模仿（清单71）：你点了家具，伙伴也朝它瞧一瞧、轻轻扭一下，像在"学你"。
      try{if(hitFurniture.object&&actor.group){const t=new THREE.Vector3();hitFurniture.object.getWorldPosition(t);const face=Math.atan2(t.x-actor.ctrl.x,t.z-actor.ctrl.z);actor.group.rotation.y=face;feel?.react('nuzzle');vibrate(8);}}catch{/* 转向失败不影响交互 */}
    }
    if(raycaster.ray.intersectPlane(plane,pointerTarget))actor.walkTo(pointerTarget);
  }
}
canvas.addEventListener('pointercancel',e=>{if(down&&e.pointerId!==down.id)return;down=null;canvas.style.cursor='default';},eventOptions);
canvas.addEventListener('lostpointercapture',e=>{if(down&&e.pointerId!==down.id)return;down=null;canvas.style.cursor='default';},eventOptions);
function releaseKeys(){
  const wasKeyboard=keys.size>0;keys.clear();down=null;
  if(wasKeyboard&&actor&&actor.state==='walking'&&!actor.ctrl.target){actor.ctrl.stop();actor.path=[];actor.setState('idle');}
}
win.addEventListener('blur',releaseKeys,eventOptions);canvas.addEventListener('blur',releaseKeys,eventOptions);
canvas.addEventListener('pointermove',e=>{
  if(decoration?.active||decoration?.pending){hintTarget=null;renderHint();return;}
  if(down&&e.pointerId!==down.id)return;
  aim(e);const picked=pickedFurniture();
  if(down){down.moved=Math.max(down.moved||0,Math.hypot(e.clientX-down.x,e.clientY-down.y));if(down.animal&&down.moved>8){if(Date.now()-lastLeash>80){lastLeash=Date.now();followDrag();}canvas.style.cursor='grabbing';hintTarget=null;renderHint();return;}}
  // 遛宠物（清单99）：按住并在地面拖动时，伙伴跟着你的手指散步（有防误触阈值与节流）。
  if(down&&picked===null&&down.moved>10&&actor&&!commerceBusy&&Date.now()-lastLeash>260){lastLeash=Date.now();if(raycaster.ray.intersectPlane(plane,pointerTarget))actor.walkTo(pointerTarget);}
  down&&down.moved==null&&(down.moved=0);if(down&&down.moved<1e9)down.moved=Math.max(down.moved||0,Math.hypot(e.clientX-down.x,e.clientY-down.y));
  canvas.style.cursor=animalUnderPointer()?'grab':picked||play?.hasHit?.(raycaster)?'pointer':'default';
  hintTarget=picked;hintX=e.clientX;hintY=e.clientY;renderHint();
},eventOptions);
canvas.addEventListener('pointerleave',()=>{hintTarget=null;renderHint();},eventOptions);
const hint=doc.createElement('div');hint.className='pet-room-hint';hint.setAttribute('role','tooltip');
hint.style.cssText='position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:none;padding:7px 13px;border-radius:12px;background:rgba(47,38,26,.86);color:#fff8e8;font:600 13px/1 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);white-space:nowrap;';
(doc.body||doc.documentElement).appendChild(hint);
// 门口名牌（清单14）：在小屋门边显示昵称命名的"小屋名牌"，纯展示、不挡交互。
const namePlate=doc.createElement('div');namePlate.className='pet-room-nameplate';namePlate.setAttribute('role','note');
namePlate.style.cssText='position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:998;pointer-events:none;padding:6px 16px;border-radius:14px;background:rgba(255,250,240,.9);color:#5b4636;font:700 15px/1.1 system-ui,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.16);white-space:nowrap;';
(doc.body||doc.documentElement).appendChild(namePlate);
let hintTarget=null,hintX=0,hintY=0,lastWateredAt=0;
// 浇水水珠特效：挂到盆栽上方的小圆珠，浇水时循环落下；不参与碰撞与交互。
const waterFx=new THREE.Group();waterFx.name='water-fx';waterFx.visible=false;
const dropGeo=new THREE.SphereGeometry(.016,5,4),dropMat=new THREE.MeshBasicMaterial({color:0x9fd6f5,transparent:true,opacity:.85});
for(let i=0;i<10;i++){const drop=new THREE.Mesh(dropGeo,dropMat);drop.visible=false;waterFx.add(drop);}
// 浇水时盆栽口沿出现一圈“湿润泥土”深色盘，稍后随特效一起消失。
const wetDisc=new THREE.Mesh(new THREE.CircleGeometry(.30,18),new THREE.MeshBasicMaterial({color:0x6b4f35,transparent:true,opacity:.55,depthWrite:false}));
wetDisc.rotation.x=-Math.PI/2;wetDisc.visible=false;waterFx.add(wetDisc);
scene.add(waterFx);
// 悬停只提示、不执行；点击物体时才真正触发坐下/起立/开关灯/浇水。
function renderHint(){
  if(!hintTarget||commerceBusy||decoration?.active||decoration?.pending){hint.style.display='none';return;}
  let text='';
  if(hintTarget.userData.interaction==='lamp')text=lampOn?'关闭灯光':'打开灯光';
  else if(hintTarget.userData.interaction==='seat'){
    const id=hintTarget.userData.seatId||'sofa';
    text=(actor?.desiredSeated&&actor.seatId===id&&['seated','approaching','sitting-down'].includes(actor.state))?'起立':'坐下';
  }
  else if(hintTarget.userData.interaction==='water')text=(win.performance?.now?.()||Date.now())-lastWateredAt<6000?'刚刚浇过水':'给花浇水';
  if(!text){hint.style.display='none';return;}
  hint.textContent=text;hint.style.display='block';
  hint.style.left=Math.max(8,Math.min(hintX+16,win.innerWidth-hint.offsetWidth-8))+'px';hint.style.top=Math.max(8,Math.min(hintY+18,win.innerHeight-hint.offsetHeight-8))+'px';
}
const controlKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','Enter','NumpadEnter'];
win.addEventListener('keydown',e=>{
  if(activeElementFor(canvas)!==canvas||decoration?.active||decoration?.pending||e.target.matches?.('input,button,select,textarea'))return;
  if(controlKeys.includes(e.code)){
    e.preventDefault();keys.add(e.code);
    if(e.code==='Enter'||e.code==='NumpadEnter'){triggerInteraction(hintTarget);return;}
    if(e.code==='Space'&&actor&&['walking','approaching','watering'].includes(actor.state)){
      actor.desiredSeated=false;actor.ctrl.stop();actor.path=[];
      if(actor.state==='watering'){actor.pendingWater=false;actor.facing.rotation.x=0;actor.root.position.y=.09;actor.pose?.setWatering?.(0);}
      actor.setState('idle');
    }
  }
},eventOptions);
win.addEventListener('keyup',e=>keys.delete(e.code),eventOptions);win.addEventListener('blur',()=>keys.clear(),eventOptions);
function inputAxis() {
  if(activeElementFor(canvas)!==canvas)return {x:0,z:0};
  const x=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  const y=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
  // 按屏幕方向移动，而非直接映射世界XZ；斜等距相机下上下左右仍然直观。
  return {x:rightAxis.x*x+downAxis.x*y,z:rightAxis.z*x+downAxis.z*y};
}
function prepareDecoration() {
  if(presentationPaused)setPresentationPaused(false);schedule();
  resetSway();
  keys.clear();down=null;if(decorationReady){decorationReady(false);decorationReady=null;}if(!actor)return false;
  actor.desiredSeated=false;actor.pendingPoint=null;actor.pendingSeatId=null;actor.pendingWater=false;
  if(['walking','approaching','watering'].includes(actor.state)){actor.ctrl.stop();actor.path=[];actor.seatId=null;actor.facing.rotation.x=0;actor.pose?.setWatering?.(0);actor.setState('idle');}
  if(actor.state==='idle')return true;
  if(['seated','sitting-down'].includes(actor.state))actor.standUp();
  return new Promise(resolve=>{decorationReady=resolve;});
}

  function canEdit(){return !disposed&&lifecycle==='ready'&&actor?.state==='idle'&&!decoration?.dragging&&!commerceBusy;}
  const tradeFailure=(code,message)=>({ok:false,code,message});
  // 连续失败安抚（清单93）：交易连续失败几次后宠物温柔鼓励，成功一次即清零。
  // 使用内联文案避免给交易源码片段注入外部依赖；仅第 3 次起提示。
  let failStreak=0;
  const FAIL_COMFORT=['','','差一点点啦，别急，我们再试一次！','没关系，我们再试一次好不好？我陪你一起～','没关系，失败是星星在教我们怎么发光。先歇一会儿，我们再试一次！'];
  async function trade(operation,{allowDecoration=false}={}){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    if(commerceBusy||((decoration?.active||decoration?.pending)&&!allowDecoration))return tradeFailure('BUSY','请先完成或取消装修');
    if(allowDecoration&&decoration?.dragging)return tradeFailure('BUSY','请先松手再收回');
    commerceBusy=true;updateStatus();schedule();
    try {
      // v2.8.2 修复「买东西点击没反应」：等待伙伴站稳加了超时兜底，防止演员状态异常时
      // decorationReady 永不 resolve → commerceBusy 永久占用 → 之后所有商店按钮静默无反应。
      const prepared=await withTimeout(prepareDecoration(),8000);
      if(!prepared||disposed)return tradeFailure('ABORTED','伙伴暂时没有就位，请稍后再试');
      // 必须 await 异步操作，否则 rejection 逃出 catch、finally 会提前释放 commerceBusy，
      // 导致第二次操作并发/静默失败。
      const result=await operation();
      if(result?.ok){failStreak=0;layoutManager?.acceptNavigationState?.();}
      else if(result?.ok===false){
        failStreak=Math.min(failStreak+1,FAIL_COMFORT.length-1);
        const line=FAIL_COMFORT[failStreak];
        if(line&&!disposed&&lifecycle==='ready'){try{fx?.say(line,3800);}catch{/* 安抚提示失败不影响交易 */}}
      }
      return result;
    } catch(error){failStreak=Math.min(failStreak+1,FAIL_COMFORT.length-1);return tradeFailure('TRANSACTION_FAILED',String(error.message||'操作失败，请重试'));}
    finally {commerceBusy=false;if(!disposed)updateStatus();}
  }
  function withTimeout(promise,ms){return new Promise(resolve=>{let settled=false;const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>done(false),ms);Promise.resolve(promise).then(done,done);});}
  // 从可交互列表移除（回收/丢弃时）；恢复摆放时按品类重新加入。
  function removeInteractive(root){
    const index=interactive.indexOf(root);if(index!==-1)interactive.splice(index,1);
  }
  // 挂载台灯灯光/灯泡到台灯根上（initialize 与从仓库摆回共用）。
  function attachLamp(root){
    lampLight=new THREE.PointLight(0xffbd5d,3,4.5,2);lampLight.position.set(0,.59,0);lampLight.layers.set(1);root.add(lampLight);
    lampBulb=new THREE.Mesh(new THREE.SphereGeometry(.08,10,6),new THREE.MeshBasicMaterial({color:0xffdfa0}));lampBulb.position.set(0,.60,0);root.add(lampBulb);
  }
  // 从场景与布局中移除一件家具（商店/核心/固有通用），并清理沙发/台灯引用。
  // force=true 用于「摆回失败/落账失败」的清理：root 可能刚重建、未必已注册，必须无条件移除。
  // 返回 false = 「已注册但布局校验拒绝移除」——此时保持家具与注册表一致，绝不删除 Map 条目
  // （否则产生孤儿 id，后续 snapshot()/validate() 读 root.position 崩溃，
  // 表现为购买时报 "Cannot read properties of undefined (reading 'position')"）。
  // 未注册的 root（如重建后登记失败）仍会物理清理，不留幽灵网格。
  function removeRoomItem(id,root,{force=false,release=true}={}){
    const registered=Object.prototype.hasOwnProperty.call(layoutManager.definitions,id);
    if(registered&&!layoutManager.unregisterFurniture(id)){
      if(!force)throw new Error('家具移除被布局校验拒绝，已保持原位');
      return false;
    }
    removeInteractive(root);furniture.delete(id);root.removeFromParent();
    if(release)releaseRoomItem(root);
    if(id==='sofa'){sofaRoot=null;resolveSeat();}if(id==='lamp'){lampRoot=null;lampLight=null;lampBulb=null;}
    return true;
  }
  function releaseRoomItem(root){
    const shared=new Set(materialCache.values());
    root.traverse(object=>{
      if(object.isMesh)disposer.release(object.geometry);
      for(const material of (Array.isArray(object.material)?object.material:[object.material]))if(material&&!shared.has(material)){
        for(const value of Object.values(material))if(value?.isTexture&&value!==gradient)disposer.release(value);
        disposer.release(material);
      }
    });
  }
  // 丢弃一件刚摆放但未落账的商店家具（购买/取出失败回滚时调用）。
  // 返回 false = 已注册但布局校验拒绝移除，家具保持原位（罕见双失败路径，调用方提示并跳过 restore）。
  function discardShopItem(id,root){
    const registered=Object.prototype.hasOwnProperty.call(layoutManager.definitions,id);
    if(registered&&!layoutManager.unregisterFurniture(id))return false;
    removeInteractive(root);furniture.delete(id);root.removeFromParent();
    root.traverse(object=>{if(object.isMesh)disposer.release(object.geometry);});
    return true;
  }
  // 按目录重建一件家具并加入场景（商店→自动选位；核心→GLB；固有→程序化构件）。
  // 返回已 add 到 scene 的 root；商店件失败返回 null，核心/固有失败抛错。
  async function rebuildRoomItem(sku){
    if(SHOP_CATALOG.some(item=>item.sku===sku)||giftProduct(sku)){
      const placed=placeOwnedShopItem(sku,account=>({ok:true,state:account}));
      return placed.ok?placed.root:null;
    }
    if(['sofa','table','lamp'].includes(sku)){
      const root=await loadFurniture(sku,FURNITURE[sku]);
      if(sku==='sofa')sofaRoot=root;
      if(sku==='lamp')attachLamp(root);
      return root;
    }
    const root=buildDecorItem(sku,scene,solidMaterial);
    if(!root)return null;
    if(sku==='wall-pictures')root.position.z=(8.2-roomTier.depth)/2;
    if(WATER_TARGETS[sku]){root.userData.interaction='water';root.userData.waterTargetId=sku;interactive.push(root);}
    if(['ottoman-a','ottoman-b'].includes(sku)){root.userData.interaction='seat';root.userData.seatId=sku;interactive.push(root);}
    return root;
  }
  // 摆放一件已拥有的商店家具到合适空位（购买与从仓库取出共用）。
  // 返回 {ok,root,id,result}；root 已加入场景且已注册，失败时已完整回滚。
  // v2.8.2 购买修复：购买时尚未拥有（economy.purchase 在最后一步才登记 owned），
  // 传递 allowUnowned=true 跳过 owned 前置检查；仅仓库摆回等"确实已拥有"的路径保留校验。
  function gracefulDemoSpot(positions){
    // 错误示范（清单77）：从候选位中挑一个不挡伙伴、在边界内的，让宠物走过去示意"放这儿"。
    if(!actor)return;
    for(const [x,_y,z] of positions){if(Number.isFinite(x)&&Number.isFinite(z)&&insidePetBounds(x,z)){actor.walkTo({x,z});fx?.say('伙伴走给你看：这儿好像能放得下哦～',3600);return;}}
  }
  function placeOwnedShopItem(sku,applyLedger,requestId,{allowUnowned=false,placement=null}={}){
    const account=economy.getState(),product=SHOP_CATALOG.find(item=>item.sku===sku)||giftProduct(sku);
    if(!product)return {ok:false,result:tradeFailure('UNKNOWN_ITEM','这件家具暂未上架')};
    if(!allowUnowned&&!account.owned.includes(sku))return {ok:false,result:tradeFailure('NOT_OWNED','你还没有这件家具')};
    const id=`shop-${sku}`;
    if(furniture.has(id))return {ok:false,result:tradeFailure('ALREADY_PLACED','这件家具已经在房间里')};
    const before=layoutManager.snapshot(),{root,definition}=product.category==='wall'?createWallHanging(sku,solidMaterial):createShopFurniture(sku,solidMaterial);
    scene.add(root);furniture.set(id,root);root.traverse(object=>{if(object.isMesh)object.layers.enable(1);});
    if(WATER_TARGETS[id]){root.userData.interaction='water';root.userData.waterTargetId=id;interactive.push(root);}
    let registered=false;
    const positions=product.category==='wall'?wallPlacementOrder(root,placement):(placement?[[placement.x,0,placement.z,0]]:placementOrder(placementBounds,.65).map(([x,z])=>[x,0,z,0]));
    for(const [x,y,z,rotation] of positions){
      root.position.set(x,y,z);root.rotation.y=rotation;root.updateMatrixWorld(true);
      if(layoutManager.registerFurniture(id,root,definition)){registered=true;break;}
    }
    if(registered)furnitureDefinitions[id]=definition; // 供回滚/恢复时重新注册使用
    if(!registered){discardShopItem(id,root);layoutManager.restore(before);
      // 错误示范（清单77）：没地方放时，伙伴走过去站到其中一个候选位置，用行动教孩子"放这儿"。
      // 用 try/catch 包裹：示范是增强体验，失败不能影响 NO_SPACE 的原子返回。
      try{if(typeof gracefulDemoSpot==='function')gracefulDemoSpot(positions);}catch{/* 示范失败不影响错误返回 */}
      return {ok:false,result:tradeFailure('NO_SPACE',placement?'这里空间不足或挡住了伙伴，请换个位置；家具仍在仓库':'房间里没有合适的空位，请整理家具或先扩建')};}
    const result=applyLedger({layout:layoutManager.snapshot(),requestId});
    if(!result.ok){
      // v2.8.3 孤儿修复：discardShopItem 在「已注册但布局校验拒绝移除」时返回 false 并保持家具
      // 可见（罕见双失败路径）。此时不能 restore(before)——before 不含这件新家具，restore 会因
      // 未知家具抛错；保持原位并提示，用户整理布局或刷新页面即可恢复。
      if(discardShopItem(id,root))layoutManager.restore(before);
      else notify('layout-restore-warning',{kind:'discard-blocked',id});
    }
    else {decoration.refresh();notify('furniture-placed',{sku,id,balance:result.state.balance});if(!disposed)notify('layout-change',{placed:id});}
    return {ok:result.ok,root,id,result};
  }
  function purchaseFurniture(sku,requestId){return trade(()=>{
    const account=economy.getState(),product=SHOP_CATALOG.find(item=>item.sku===sku);
    if(!product)return tradeFailure('UNKNOWN_ITEM','这件家具暂未上架');
    if(product.category==='flooring'){
      const result=economy.purchase(sku,{layout:layoutManager.snapshot(),requestId});
      if(result.ok){
        // Only a newly accepted purchase records arrival. Applying an old floor
        // or replaying a receipt must never replace a missing historical time.
        if(result.code==='OK'&&!account.owned.includes(sku))companionStore.remember(sku,profile.getState().name||'小主人');
        if(typeof syncAppearance==='function')syncAppearance();celebrateNewBadges();notify('flooring-applied',{sku});
      }
      return result;
    }
    if(account.owned.includes(sku)){
      // 已拥有：若在仓库里则从仓库摆回，否则提示已在房间。
      if((account.stored||[]).includes(sku)){const placed=placeOwnedShopItem(sku,(ledger)=>economy.unstoreFurniture(sku,ledger),requestId);return placed.result;}
      return tradeFailure('ALREADY_OWNED','你已经拥有这件家具，去仓库把它摆回来吧');
    }
    if(account.balance<product.price)return tradeFailure('INSUFFICIENT_POINTS','学习积分不足，完成学习后再来看看');
    const placed=placeOwnedShopItem(sku,(ledger)=>economy.purchase(sku,ledger),requestId,{allowUnowned:true});
    if(placed.ok)celebrateNewBadges();
    return placed.result;
  },{allowDecoration:true});}
  function wallPlacementOrder(root,placement){
    if(placement)return [[placement.wallSide==='left'?-roomTier.width/2+.22:placement.x,Number.isFinite(placement.y)?placement.y:3.4,placement.wallSide==='left'?placement.z:-roomTier.depth/2+.22,placement.wallSide==='left'?Math.PI/2:0]];
    const results=[],width=root.userData.hangingWidth||1.2,height=root.userData.hangingHeight||1.3;
    for(const side of ['left','back'])for(const y of [3.9,2.1])for(let lateral=-((side==='left'?roomTier.depth:roomTier.width)/2)+1;lateral<(side==='left'?roomTier.depth:roomTier.width)/2-.7;lateral+=1.55){
      if(side==='back'&&lateral>-.5&&lateral<2.9)continue; // 给拱窗留出完整视野。
      const occupied=[...furniture.values()].some(item=>item!==root&&item.userData.wallHanging&&Math.abs(item.rotation.y-(side==='left'?Math.PI/2:0))<.1&&Math.abs(item.position.y-y)<((item.userData.hangingHeight||1.3)+height)/2+.14&&Math.abs((side==='left'?item.position.z:item.position.x)-lateral)<((item.userData.hangingWidth||1.2)+width)/2+.14);
      if(!occupied)results.push(side==='left'?[-roomTier.width/2+.22,y,lateral,Math.PI/2]:[lateral,y,-roomTier.depth/2+.22,0]);
    }
    return results;
  }
  function resizeRoom(tier){
    applyRoomTier({furniture,width:tier.width,depth:tier.depth,bounds,placementBounds});
    Object.assign(bounds,petNavigationBounds(tier.width,tier.depth));
    for(const root of furniture.values())if(root.userData.wallHanging){if(Math.abs(root.rotation.y-Math.PI/2)<.1)root.position.x=-tier.width/2+.22;else root.position.z=-tier.depth/2+.22;root.updateMatrixWorld(true);}
  }
  function setWallColor(color){return trade(()=>{const result=economy.setAppearance({wallColor:color});if(result.ok){syncAppearance();notify('wall-color-changed',{color});}return result;},{allowDecoration:true});}
  function applyFlooring(sku){return trade(()=>{const result=economy.setAppearance({flooring:sku});if(result.ok){syncAppearance();notify('flooring-applied',{sku});}return result;},{allowDecoration:true});}
  function changePet(sku,requestId,buy=false){return trade(()=>{
    const current=economy.getState().pets;
    if(!current.catalog.some(item=>item.sku===sku))return tradeFailure('UNKNOWN_ITEM','这位伙伴暂未上架');
    if(!buy&&!current.owned.includes(sku))return tradeFailure('NOT_OWNED','请先用积分兑换这位伙伴');
    const character=createPetCharacter(sku,options.characterOptions||{});
    let result;
    try{result=buy?economy.purchasePet(sku,requestId):economy.selectPet(sku);}catch(error){disposeCharacter(character);throw error;}
    if(!result.ok){disposeCharacter(character);return result;}
    // 幂等重放不得让旧请求覆盖用户后来选择的伙伴。
    if(result.state.pets.active!==sku){disposeCharacter(character);return result;}
    const previousCharacter=actor.character;
    actor.facing.add(character.model);actor.character=character;actor.pose=character.pose;
    disposeCharacter(previousCharacter);
    actor.pose.setLocomotion?.({speed:0,phase:0,weight:0});actor.pose.setCelebrate?.(1);
    if(buy)celebrateNewBadges();
    notify(buy?'pet-purchased':'pet-selected',{sku,balance:result.state.balance});
    return result;
  },{allowDecoration:true});}
  function purchasePet(sku,requestId){return changePet(sku,requestId,true);}
  function selectPet(sku){return changePet(sku);}
  // v2.8.2 仓库：把房间里的一件家具收回仓库。支持三类：商店家具(shop-<sku>)、
// 房间核心件(sofa/table/lamp, GLB)、房间固有装饰（decor 程序化）。
function storeFurniture(sku,requestId){return trade(async()=>{
    if(typeof sku!=='string'||!STORAGE_CATALOG.some(item=>(item.sku||item.id)===sku)&&!giftProduct(sku))return tradeFailure('UNKNOWN_ITEM','这件家具暂未上架');
    const isShop=SHOP_CATALOG.some(item=>item.sku===sku)||!!giftProduct(sku);
    const id=isShop?`shop-${sku}`:sku,root=furniture.get(id);
    if(!root)return tradeFailure('NOT_PLACED','这件家具不在房间里');
    const account=economy.getState();
    if((account.stored||[]).includes(sku))return tradeFailure('ALREADY_STORED','这件家具已经在仓库里');
    if(layoutManager.lampSupport===id)return tradeFailure('LAMP_ON_SUPPORT','请先把台灯收回仓库，再收回它下面的家具');
    const before=layoutManager.snapshot();
    removeRoomItem(id,root,{release:false});
    const result=economy.storeFurniture(sku,{layout:layoutManager.snapshot(),requestId});
    if(!result.ok){ // 保存失败时恢复同一对象，不重新下载模型或重复注册商店家具。
      furniture.set(id,root);scene.add(root);
      if(root.userData.interaction)interactive.push(root);
      if(id==='sofa')sofaRoot=root;
      if(id==='lamp'){lampRoot=root;lampLight=root.children.find(item=>item.isPointLight);lampBulb=root.children.find(item=>item.isMesh);}
      if(!layoutManager.registerFurniture(id,root,furnitureDefinitions[id]))throw new Error('家具恢复失败，请刷新房间');
      layoutManager.restore(before);
    } else {releaseRoomItem(root);decoration.refresh();notify('furniture-stored',{sku,id,balance:result.state.balance});if(!disposed)notify('layout-change',{stored:id});}
    return result;
  },{allowDecoration:true});}
// v2.8.2 仓库：从仓库取出一件家具摆回房间（不扣分）。商店件走自动选位，核心/固有件用默认坐标。
function unstoreFurniture(sku,requestId,placement=null){return trade(async()=>{
    if(typeof sku!=='string'||!STORAGE_CATALOG.some(item=>(item.sku||item.id)===sku)&&!giftProduct(sku))return tradeFailure('UNKNOWN_ITEM','这件家具暂未上架');
    if(placement&&(!Number.isFinite(placement.x)||!Number.isFinite(placement.z)||(placement.y!==undefined&&!Number.isFinite(placement.y))))return tradeFailure('INVALID_POSITION','请把家具拖到房间内');
    const account=economy.getState();
    if(giftProduct(sku)){const product=giftCatalog(companionStore.getState().rewards).find(item=>item.sku===sku);if(!product||product.expired)return tradeFailure('GIFT_EXPIRED','这份限时礼物已经休息啦，获得时间和收藏回忆会保留。');}
    if(!(account.stored||[]).includes(sku))return tradeFailure('NOT_STORED','这件家具不在仓库里');
    const isShop=SHOP_CATALOG.some(item=>item.sku===sku)||!!giftProduct(sku);
    const id=isShop?`shop-${sku}`:sku;
    if(furniture.has(id))return tradeFailure('ALREADY_PLACED','这件家具已经在房间里');
    if(isShop){ // 商店件走自动选位。
      const placed=placeOwnedShopItem(sku,(ledger)=>economy.unstoreFurniture(sku,ledger),requestId,{placement});
      return placed.result;
    }
    const before=layoutManager.snapshot();
    const root=await rebuildRoomItem(sku);
    if(!root){layoutManager.restore(before);return tradeFailure('UNKNOWN_ITEM','无法重建这件家具');}
    furniture.set(id,root);
    if(placement)root.position.set(placement.x,id==='lamp'?.04:root.position.y,placement.z);
    root.updateMatrixWorld(true);
    let registered=layoutManager.registerFurniture(id,root,furnitureDefinitions[id]);
    if(!registered&&!placement&&id!=='wall-pictures')for(const [x,z] of placementOrder(placementBounds,.5)){
      root.position.set(x,id==='lamp'?.04:root.position.y,z);root.updateMatrixWorld(true);
      if(layoutManager.registerFurniture(id,root,furnitureDefinitions[id])){registered=true;break;}
    }
    if(!registered){
      removeRoomItem(id,root,{force:true});layoutManager.restore(before);
      return tradeFailure('NO_SPACE',placement?'这里空间不足或挡住了伙伴，请换个位置；家具仍在仓库':'房间里没有合适的空位，请整理家具或先扩建');
    }
    const result=economy.unstoreFurniture(sku,{layout:layoutManager.snapshot(),requestId});
    if(!result.ok){removeRoomItem(id,root,{force:true});layoutManager.restore(before);return result;}
    decoration.refresh();notify('furniture-placed',{sku,id,balance:result.state.balance});if(!disposed)notify('layout-change',{placed:id});
    return result;
  },{allowDecoration:true});}
  // v2.17：每种房型独立保存布局。切换成功后把目标房型自己保存的布置恢复到场景，
  // 只恢复现已注册的家具（仓库里的残留 id 不会进入布局）；再落库一次，
  // 保证 layouts[当前房级] 与实际生效摆放一致，下次加载不会误判。
  function applyRoomLayout(level){
    if(disposed||!layoutManager)return false;
    const target=economy.getRoomLayout(level);
    const before=layoutManager.snapshot();
    if(target&&typeof layoutManager.restore==='function'){
      try{if(!layoutManager.restore(compatibleRoomLayout(target,before))){notify('layout-restore-warning',{level,reason:'目标布局未恢复，已保留原存档'});return false;}}
      catch{notify('layout-restore-warning',{level,reason:'目标布局未恢复，已保留原存档'});return false;}
    }
    resizeRoom(roomTier); // inherited snapshots must keep wall-mounted objects on the new walls
    layoutManager.refresh();
    layoutManager.resetNavigationBaseline?.();
    const persisted=economy.setLayout(layoutManager.snapshot());
    if(!persisted.ok)notify('layout-persist-failed',{level,message:persisted.message});
    feel?.transition(before);syncCompanion();return persisted.ok;
  }
  function expandRoom(requestId){return trade(()=>{
    const account=economy.getState(),next=account.nextTier;
    // 对重复 requestId 交给账本重放，不能再次应用下一档房屋。
    if(requestId&&account.claims.requests.some(item=>item.id===requestId))return economy.expand({requestId});
    if(!next)return tradeFailure('MAX_LEVEL','房屋已经扩建到最高级');
    if(account.balance<next.price)return tradeFailure('INSUFFICIENT_POINTS','学习积分不足，完成学习后再来扩建');
    const previousTier=roomTier,previousBounds={...bounds},previousPlacement={...placementBounds};
    // v2.17：先拍下“扩建前”的布置，扩建成功后按新房型自己的布局恢复摆放（第一次扩建沿用当前布置）。
    const savedSnapshot=layoutManager.snapshot();
    roomTier=next;resizeRoom(next);
    const result=economy.expand({layout:savedSnapshot,requestId});
    if(!result.ok){roomTier=previousTier;resizeRoom(roomTier);Object.assign(bounds,previousBounds);Object.assign(placementBounds,previousPlacement);}
    else {applyRoomLayout(next.level);celebrateNewBadges();if(typeof syncAchievementDisplays==='function')syncAchievementDisplays(true);notify('room-expanded',{level:roomTier.level,width:roomTier.width,depth:roomTier.depth,balance:result.state.balance,fromWidth:previousTier.width,fromDepth:previousTier.depth});if(!disposed)notify('layout-change',{roomLevel:roomTier.level});}
    if(result.ok&&typeof syncAppearance==='function')syncAppearance();resize();return result;
  });}
  // Keep resizing independent of where the pet happened to walk. Furniture
  // checks still report the actual item that needs to move into storage.
  function setRoomLevel(level,requestId){return trade(()=>{
    const account=economy.getState();
    if(!Number.isInteger(level)||level<0||!ROOM_TIERS[level])return tradeFailure('INVALID_ROOM_LEVEL','目标房屋档位不存在');
    // 对重复 requestId 交给账本重放，不能再次切换房间大小。
    if(requestId&&account.claims.requests.some(item=>item.id===requestId))return economy.setRoomLevel(level,{requestId});
    if(level>account.maxRoomLevel)return tradeFailure('LOCKED_ROOM_LEVEL','尚未解锁这一档房屋，请先扩建');
    if(level===account.roomLevel)return tradeFailure('SAME_ROOM_LEVEL','小屋已是这个大小');
    const next=ROOM_TIERS[level],previousTier=roomTier,previousBounds={...bounds},previousPlacement={...placementBounds};
    const previousPet={x:actor.ctrl.x,z:actor.ctrl.z},previousNavigation=layoutManager.getNavigationBaseline?.()||[];let relocated=false;
    const movePet=point=>{actor.ctrl.stop();actor.path=[];actor.ctrl.x=point.x;actor.ctrl.z=point.z;actor.root.position.set(point.x,.09,point.z);actor.root.updateMatrixWorld(true);};
    const rollback=()=>{roomTier=previousTier;resizeRoom(roomTier);Object.assign(bounds,previousBounds);Object.assign(placementBounds,previousPlacement);if(relocated)movePet(previousPet);layoutManager.restore(savedSnapshot);layoutManager.restoreNavigationBaseline?.(previousNavigation);layoutManager.refresh();};
    // v2.17：切换前先拍下当前房型的布置（用于保存到对应槽位），再 resize 到目标大小。
    const savedSnapshot=layoutManager.snapshot();
    roomTier=next;resizeRoom(next);
    const target=economy.getRoomLayout(level);
    if(target){try{if(!layoutManager.restore(compatibleRoomLayout(target,savedSnapshot))){rollback();return tradeFailure('LAYOUT_RESTORE_FAILED','这个房型的布置没读好，原来的布置已保留，请从家长设置检查备份');}}catch{rollback();return tradeFailure('LAYOUT_RESTORE_FAILED','这个房型的布置没读好，原来的布置已保留');}}
    resizeRoom(roomTier);
    if(level<account.roomLevel){
      const safePet=layoutManager.findSafePetPosition({checkSeats:false});
      if(safePet&&(safePet.x!==previousPet.x||safePet.z!==previousPet.z)){relocated=true;movePet(safePet);}
      layoutManager.resetNavigationBaseline?.(safePet||previousPet);
      const check=layoutManager.validate();
      if(!check.valid){
        rollback();
        return {...tradeFailure('NO_SPACE',`${check.reason}。请把这件家具移入小屋范围或收回仓库，再切换。`),furnitureId:check.id||check.ids?.[0]||null};
      }
    }
    const result=economy.setRoomLevel(level,{layout:savedSnapshot,requestId});
    if(!result.ok)rollback();
    else {const persisted=economy.setLayout(layoutManager.snapshot());if(!persisted.ok)notify('layout-persist-failed',{level,message:persisted.message});feel?.transition(savedSnapshot);celebrateNewBadges();if(typeof syncAchievementDisplays==='function')syncAchievementDisplays(true);notify('room-expanded',{level:roomTier.level,width:roomTier.width,depth:roomTier.depth,balance:result.state.balance,resized:true,fromWidth:previousTier.width,fromDepth:previousTier.depth});if(!disposed)notify('layout-change',{roomLevel:roomTier.level});}
    if(result.ok&&relocated)result.message+='，伙伴已回到安全位置';
    if(result.ok&&typeof syncAppearance==='function')syncAppearance();resize();return result;
  });}
  function collectAllFurniture(requestId){return trade(()=>{
    const account=economy.getState();
    if(requestId&&account.claims.requests.some(item=>item.id===requestId))return economy.storeAllFurniture({requestId});
    const before=layoutManager.snapshot(),roots=Object.keys(layoutManager.definitions).map(id=>({id,root:furniture.get(id),definition:layoutManager.definitions[id]}));
    const oldInteractive=interactive.slice(),oldLamp={root:lampRoot,light:lampLight,bulb:lampBulb},oldSofa=sofaRoot;
    const restore=()=>{
      for(const item of roots){furniture.set(item.id,item.root);scene.add(item.root);}
      sofaRoot=oldSofa;lampRoot=oldLamp.root;lampLight=oldLamp.light;lampBulb=oldLamp.bulb;
      for(const item of roots.slice().sort((a,b)=>Number(a.id==='lamp')-Number(b.id==='lamp')))if(!Object.hasOwn(layoutManager.definitions,item.id)&&!layoutManager.registerFurniture(item.id,item.root,item.definition))throw new Error('收纳回滚未能恢复家具，请保留存档并重新打开房间');
      interactive.splice(0,interactive.length,...oldInteractive);if(!layoutManager.restore(before))throw new Error('收纳回滚未能恢复原布局');
    };
    try{for(const item of roots.slice().sort((a,b)=>Number(b.id==='lamp')-Number(a.id==='lamp')))removeRoomItem(item.id,item.root,{release:false});}
    catch(error){restore();return tradeFailure('COLLECT_FAILED',error.message);}
    const result=economy.storeAllFurniture({layout:layoutManager.snapshot(),requestId});
    if(!result.ok){restore();return result;}
    syncCompanion();for(const item of roots)releaseRoomItem(item.root);decoration.refresh();
    notify('furniture-stored',{bulk:true,count:roots.length});notify('collect-all',{count:roots.length});notify('layout-change',{storedAll:true});
    fx?.say('收拾好啦！宝贝们在仓库排排坐，想用时再请它们出来～');return {...result,count:roots.length};
  });}
  // v2.23：恢复默认布置更健壮——挂件先按当前房级贴墙（扩建过面积后不再悬空），
  // 与默认位冲突的家具自动收进仓库（产权与积分保留），不再出现“恢复默认失败或家具丢失”。
  function snapDefaultsToCurrentWalls(layout){
    if(!layout?.furniture)return;
    for(const id of Object.keys(layout.furniture)){
      const root=furniture.get(id);if(!root?.userData?.wallHanging)continue;
      const left=Math.abs(root.rotation.y-Math.PI/2)<.1;
      if(left)layout.furniture[id].position[0]=-roomTier.width/2+.22;
      else layout.furniture[id].position[2]=-roomTier.depth/2+.22;
    }
  }
  function resetRoomLayout(){return trade(()=>{
    if(!defaultRoomLayout)return tradeFailure('NOT_READY','默认布置还没准备好哦');
    const before=layoutManager.snapshot(),base=compatibleRoomLayout(defaultRoomLayout,before);
    snapDefaultsToCurrentWalls(base);
    const buildTarget=()=>{const target=compatibleRoomLayout(defaultRoomLayout,layoutManager.snapshot());snapDefaultsToCurrentWalls(target);return target;};
    let target=base,result=layoutManager.importLayout(target,{persist:false}),stored=[];
    if(!result.ok){
      const movableIds=Object.keys(target.furniture).filter(id=>{const sku=id.startsWith('shop-')?id.slice(5):id;return STORAGE_CATALOG.some(item=>(item.sku||item.id)===sku);});
      for(const id of movableIds){
        if(result.ok)break;
        const root=furniture.get(id);if(!root||stored.includes(id))continue;
        const sku=id.startsWith('shop-')?id.slice(5):id;
        if(layoutManager.lampSupport===id)continue; // 台灯压在它上面时先跳过，避免误收
        const account=economy.getState();if((account.stored||[]).includes(sku))continue;
        const beforeStore=layoutManager.snapshot();
        removeRoomItem(id,root,{release:false});
        const saved=economy.storeFurniture(sku,{layout:layoutManager.snapshot(),requestId:`reset:${Date.now()}:${id}`});
        if(!saved.ok){ // 收仓失败时恢复同一对象，不重复下载模型。
          furniture.set(id,root);scene.add(root);
          if(root.userData.interaction)interactive.push(root);
          if(id==='sofa')sofaRoot=root;
          if(id==='lamp'){lampRoot=root;lampLight=root.children.find(item=>item.isPointLight);lampBulb=root.children.find(item=>item.isMesh);}
          if(!layoutManager.registerFurniture(id,root,furnitureDefinitions[id]))throw new Error('恢复默认时家具恢复失败，请刷新房间');
          layoutManager.restore(beforeStore);continue;
        }
        releaseRoomItem(root);stored.push(id);notify('furniture-stored',{sku,id,balance:saved.state?.balance});
        target=buildTarget();result=layoutManager.importLayout(target,{persist:false});
      }
    }
    if(!result.ok){
      // 可收纳件都已处理仍无法归位（如结构件冲突）：已收仓的家具保留，其余回到原样，不丢任何产权。
      layoutManager.restore(before);
      const persisted=economy.setLayout(layoutManager.snapshot());
      if(!persisted.ok)return tradeFailure('RESET_LAYOUT_FAILED',`暂时不能归位：${persisted.message}。可以先一键收纳，再从仓库摆回喜欢的家具。`);
      feel?.transition(before);decoration.refresh();notify('reset-layout');notify('layout-change',{reset:true});
      return {ok:true,message:stored.length?`默认布置已尽量恢复，${stored.length} 件挨得太近的家具先收进了仓库，随时可以摆回来～`:'默认布置已尽量恢复，积分和收藏都好好的～'};
    }
    resizeRoom(roomTier);
    const persisted=economy.setLayout(layoutManager.snapshot());
    if(!persisted.ok){layoutManager.restore(before);return tradeFailure('RESET_LAYOUT_FAILED',`暂时不能归位：${persisted.message}。可以先一键收纳，再从仓库摆回喜欢的家具。`);}
    feel?.transition(before);decoration.refresh();notify('reset-layout');notify('layout-change',{reset:true});
    fx?.say(stored.length?`家具回到最初的位置啦，${stored.length} 件和默认位置挨得太近的宝贝先收进了仓库，想摆随时请出来～`:'家具回到最初的位置啦，你的积分和收藏都好好的～');
    return {ok:true,message:stored.length?`已恢复默认布置；${stored.length} 件与默认位置冲突的家具已收进仓库，积分与收藏保留。`:'已恢复当前已摆放家具的默认位置，仓库、积分和收藏均保留'};
  });}
  function creditLearning(event){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    const result=economy.creditLearning(event);
    if(result.ok&&!result.unchanged&&result.code!=='ALREADY_CLAIMED'){
      // 学习成果顺带累计到个人主页时长（每个新词约 20 分钟、每次复习约 10 分钟）。
      const learned=Number.isFinite(event?.learned)?event.learned:0,reviewed=Number.isFinite(event?.reviewed)?event.reviewed:0;
      const seconds=learned*1200+reviewed*600;
      if(learned||reviewed){const study=profile.addStudyTime(seconds);if(!study.ok)notify('study-save-warning',{message:study.message});companionStore.learning(event.eventId,seconds);feel?.react('clap');fx?.say('{owner}，学会新本领啦！小花也长高了一点～');syncCompanion();
        // 学习光点（清单32）：台灯光晕短暂亮起又缓缓回落，像"学会啦"的一颗小星星。
        try{if(!lampOn)setLamp(true);glowPulseUntil=Date.now()+1200;glowPulsePeak=.9;vibrate([18,30,18]);sfx.play('click');}catch{/* 光点增强失败不影响学习奖励 */}
      }
      evaluateBadges();notify('learning-reward',{balance:result.state.balance,eventId:event.eventId});
    } else updateStatus();
    return result;
  }
  const LEVEL_NAMES=['小小学员','勤奋学员','小小学者','进阶学员','进阶学者','优秀学员','优秀学者','资深学员','资深学者','卓越学员','卓越学者','学者新星','学者之星','学院之星','小小讲师','青年讲师','资深讲师','学者导师','学院导师','荣誉导师'];
  // 本地“今天”可以指定 IANA 时区（如 'Asia/Shanghai' 或 'UTC'），缺省用设备本地时区。
  const localDate=()=>{
    const tz=options?.timeZone;
    if(typeof tz==='string'&&tz.trim()){
      try{
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const map={};for(const part of parts)map[part.type]=part.value;
        if(map.year&&map.month&&map.day)return `${map.year}-${map.month}-${map.day}`;
      }catch{/* 时区名无效时退回设备本地时区 */}
    }
    const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  };
  const levelName=level=>LEVEL_NAMES[Math.max(0,Math.min(LEVEL_NAMES.length-1,(level||1)-1))];
  // 补签额度按月结算：跨月后 getProfile 读到的仍是上月计数时归一化为当月 0 次，
  // 否则上月用满 3 次后补签按钮永不显示、额度永远无法重置。
  const monthKey=(makeups,today)=>{
    const current=today.slice(0,7);
    const state=makeups&&typeof makeups==='object'?makeups:{month:null,count:0};
    return state.month===current?state:{month:current,count:0};
  };
  function levelInfo(level,xp){
    const reached=level>=20,next=reached?level:level+1;
    const floor=xpForLevel(level),need=xpNeededBetween(level)||1,intoLevel=Math.max(0,xp-floor);
    return {current:level,next,reached,intoLevel,need:reached?0:need,progress:need?Math.min(1,intoLevel/need):1};
  }
  function settleProfilePending(){return profile.settlePending(input=>economy.reward(input));}
  function evaluateBadges(){const result=profile.evaluate(economy.getState(),localDate());if(result?.unlocked?.length){const skinMap={'first-purchase':economy.getState().owned.find(sku=>!FLOOR_CATALOG.some(f=>f.sku===sku)),'streak-3':'sofa','study-1h':'table'};for(const id of result.unlocked){const candidates=['sofa','table','lamp-cabinet','plant-shelf','rug','ottoman-a','floor-pot','front-fence'],key=skinMap[id]||candidates[BADGES.findIndex(badge=>badge.id===id)%candidates.length];if(key){const furnitureId=BUILTIN_STORAGE.some(item=>item.id===key)?key:`shop-${key}`,style=companionStore.getState().furnitureStyles[furnitureId]||{};companionStore.customize(furnitureId,{achievementSkin:true,skinId:id,...(!style.sticker||style.sticker==='none'?{sticker:'star'}:{})});}}syncAchievementDisplays();syncCompanion();feel?.react('cheer');const p=profile.getState(),badge=BADGES.find(item=>item.id===result.unlocked[0]);let image=null;try{if(badge)image=emblemDataUrl(doc,badge,p.gender);}catch{}fx?.celebrate({name:result.unlocked.length>1?`点亮 ${result.unlocked.length} 枚新成就！`:badge?.name||'新的成就',image});safeCall(options.onEvent,'badge-unlocked',{ids:result.unlocked});}return result;}
  // 勋章解锁时让角色庆祝一下（无新勋章则不动，保持原行为）。
  function celebrateNewBadges(){const ev=evaluateBadges();if(ev?.unlocked?.length){try{actor?.pose?.setCelebrate?.(1);}catch{/* 纯增强，失败不影响交易 */}}syncAchievementDisplays();}
  // v2.17/F5：成就墙 + 展示柜（未注册进布局，只读展示；解锁/性别/房型变化时重建）。
  let achievementDisplay=null,achievementSignature='',achievementTextureLoader=null;
  function syncAchievementDisplays(force=false){
    if(disposed||lifecycle!=='error'&&lifecycle!=='ready')return;
    let unlocked=[],gender='none',badgeUnlockedAt={};
    try{const p=profile.getState();unlocked=Array.isArray(p.badges)?p.badges.slice():[];gender=p.gender==='female'?'female':p.gender==='male'?'male':'none';badgeUnlockedAt=p.badgeUnlockedAt||{};}catch{return;}
    const signature=`${gender}:${unlocked.join(',')}`;
    if(!force&&signature===achievementSignature)return;
    achievementSignature=signature;
    if(achievementDisplay){const old=achievementDisplay;achievementDisplay=null;old.dispose();}
    if(!unlocked.length)return;
    try{
      if(!achievementTextureLoader)achievementTextureLoader=new THREE.TextureLoader();
      achievementDisplay=createAchievementDisplays({scene,THREE,doc,textureLoader:achievementTextureLoader,unlocked,gender,badgeUnlockedAt,roomSize:()=>({width:roomTier.width,depth:roomTier.depth})});
    }catch{achievementDisplay=null;}
  }
  function getProfile(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪或已释放');
    settleProfilePending();
    const awarded=evaluateBadges();
    const p=profile.getState(),today=localDate(),yesterday=previousDay(today);
    const todayChecked=p.lastCheckIn===today;
    // 「明天连续 N 天」= 明天（尚未签到今天时）再签会得到的连续天数。
    // 今天已签 → 明天续签 = streakDays+1；今天未签 → 明天才签时与昨天相隔两天，连签重置为 1。
    const tomorrowStreak=todayChecked?p.streakDays+1:1;
    // 下一枚可量化的未解锁勋章（用于「还差 X」提示），不可量化或已全解锁返回 null。
    let nextBadgeHint=null;
    for(const item of BADGES){if(p.badges.includes(item.id))continue;const hint=badgeHint(item,p,economy.getState());if(hint){nextBadgeHint={id:item.id,name:item.name,hint};break;}}
    return {ok:true,profile:{
      gender:p.gender,name:p.name,avatar:p.avatar,xp:p.xp,level:p.level,levelName:levelName(p.level),
      totalStudySeconds:p.totalStudySeconds,streakDays:p.streakDays,totalCheckIns:p.totalCheckIns,lastCheckIn:p.lastCheckIn,
      todayChecked,
      todayReward:todayChecked?null:checkInReward(p.lastCheckIn===yesterday?p.streakDays+1:1),
      tomorrowReward:checkInReward(tomorrowStreak),
      calendar:buildMonthCalendar(p.checkInDates,today),
      checkInDates:p.checkInDates,
      stats:buildStats(p.checkInDates,today),
      nextBadgeHint,
      levelInfo:levelInfo(p.level,p.xp),
      badges:BADGES.map(item=>({id:item.id,name:item.name,description:item.description,category:item.category,unlocked:p.badges.includes(item.id),unlockedAt:p.badgeUnlockedAt?.[item.id]||null,acquiredAt:p.badgeAcquiredAt?.[item.id]||null})),
      levelBadges:BADGE_TIERS.map(item=>({...item,unlocked:p.level>=item.minLevel,acquiredAt:p.levelBadgeAcquiredAt?.[item.id]||null})),
      balance:economy.getState().balance,valid:p.valid,error:p.error,unlocked:awarded.unlocked||[],
      makeups:monthKey(p.makeups,today),makeupCost:MAKEUP_COST,
    }};
  }
  function checkIn(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    const result=profile.checkIn(localDate());
    let pointsSettled=true;
    if(result.ok&&!result.unchanged){
      const gift=companionStore.checkin(result.streak||profile.getState().streakDays);for(const item of gift.gifts||[])companionStore.remember(item.id,profile.getState().name||'小主人','checkin');syncCompanion();feel?.react('cheer');fx?.celebrate({name:`连续第 ${result.streak||1} 天`,kind:'checkin'});if(gift.gifts?.length)fx?.say(`盖好章啦！${gift.gifts[0].name} 来陪你住七天～`);
      pointsSettled=settleProfilePending().ok; // 失败则积分挂待入账，下次 getProfile/checkIn 自动补
      // 签到成功小庆祝：露出可庆祝姿势的角色会点头摇尾（约 1 秒自动结束）。
      try{actor?.pose?.setCelebrate?.(1);}catch{/* 庆祝是纯增强，失败不影响签到结果 */}
      if(result.levelUps?.length)notify('level-up',{level:result.levelUps.at(-1),points:result.pendingPoints-result.points});
      notify('checkin-done',{streak:result.streak,exp:result.exp,points:result.points,balance:economy.getState().balance});
    }
    const evalResult=evaluateBadges();
    if(disposed)return result;
    if(result.ok)updateStatus();
    return {...result,pointsSettled,newBadges:evalResult?.unlocked?.length||0};
  }
  // 补签卡（v2.7/batch1）：花 100 积分补上“昨天”的签到缺口（不发经验/积分，每月限 3 次）。
  const MAKEUP_COST=100;
  function makeUpCheckIn(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    const today=localDate(),target=previousDay(today);
    if(!target)return {ok:false,code:'INVALID_DATE',message:'无法计算补签日期'};
    const before={profile:profile.getState(),economy:economy.getState()};
    const invalid=[before.profile,before.economy].find(state=>state.valid===false);
    if(invalid)return tradeFailure(invalid.error?.code||'INVALID_STATE',invalid.error?.message||'存档暂时无法读取，请先恢复存档');
    // Prepare both changes without touching the live stores or firing observers.
    // The archive writer compares the live versions and rolls both keys back if
    // either write fails; a rejected payment therefore cannot leave a free stamp.
    const snapshot=buildArchive(before),accountKey=storageKey+'-account-v1',profileKey=storageKey+'-profile-v1';
    const values=new Map([[profileKey,JSON.stringify(snapshot.profile)],[accountKey,JSON.stringify(snapshot.economy)]]);
    const staged={getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);},removeItem(key){values.delete(key);}};
    const nextProfile=createProfile({storageAdapter:staged,storageKey:profileKey}),nextEconomy=createEconomy({storageAdapter:staged,storageKey:accountKey});
    const result=nextProfile.makeUp(target,today);
    if(!result.ok)return result;
    if(result.unchanged)return {...result,state:before.profile,pointsApplied:true,cost:MAKEUP_COST,balance:before.economy.balance};
    const spent=nextEconomy.spend({eventId:`makeup:${target}`,points:MAKEUP_COST,reason:'profile'});
    if(!spent.ok)return {...spent,pointsApplied:false,cost:MAKEUP_COST,balance:before.economy.balance};
    if(roomStorage!==null){
      const saved=restoreArchive({json:buildArchive({profile:nextProfile.getState(),economy:nextEconomy.getState()}),storageAdapter:roomStorage,storageKey,expectedState:before});
      if(!saved.ok)return {...saved,pointsApplied:false,cost:MAKEUP_COST,balance:before.economy.balance};
    }
    // All room APIs read these bindings when invoked, including the layout and
    // profile callbacks. Reload only after the complete commit was accepted.
    economy=createEconomy({storageAdapter:roomStorage===null?staged:roomStorage,storageKey:accountKey});
    profile=createProfile({storageAdapter:roomStorage===null?staged:roomStorage,storageKey:profileKey,onEvent:(type,detail)=>notify(type,detail)});
    const payload={...result,state:profile.getState(),pointsApplied:true,cost:MAKEUP_COST,balance:economy.getState().balance};
    notify('profile-change',{operation:'make-up',state:payload.state});
    notify('makeup-done',{date:target,count:result.count,balance:payload.balance});
    return payload;
  }
  function exportArchive(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    // 只导出可持久化字段：getState() 携带 valid/writable/error/catalog/tiers/nextTier 等装饰键，
    // 若原样写回会被 parseAccount/parseProfile 的严格键白名单判为 INVALID_STATE，导入后存档永久锁死。
    const strip=(state,keys)=>{const out={...state};for(const key of keys)delete out[key];return JSON.parse(JSON.stringify(out));};
    return {ok:true,archive:buildArchive({profile:strip(profile.getState(),['valid','writable','error']),economy:strip(economy.getState(),['valid','writable','error','catalog','tiers','nextTier','pets']),meta:{companion:companionStore.getState()}})};
  }
  function importArchive(json){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    if(commerceBusy||decoration?.active||decoration?.pending)return tradeFailure('BUSY','请先完成当前交易或装修');
    let result;
    try{
      result=restoreArchive({json,storageAdapter:roomStorage,storageKey,expectedState:{profile:profile.getState(),economy:economy.getState(),companion:companionStore.getState()}});
    }catch{return tradeFailure('STORAGE_UNAVAILABLE','当前环境无法访问存储，请传入可用的 storageAdapter');}
    if(result.ok){lifecycle='reload-required';visibility();notify('archive-imported',{relaunchRequired:true});}
    return result;
  }
  // ---- v2.17/F6：存档备份 ----
  const backupsKey=storageKey+BACKUP_KEY_SUFFIX;
  const backupSnapshot=()=>{
    // 与 exportArchive 相同口径：剔除 getState() 携带的装饰键，避免导入后被严格键白名单拒绝。
    const strip=(state,keys)=>{const out={...state};for(const key of keys)delete out[key];return JSON.parse(JSON.stringify(out));};
    return buildArchive({profile:strip(profile.getState(),['valid','writable','error']),economy:strip(economy.getState(),['valid','writable','error','catalog','tiers','nextTier','pets']),meta:{companion:companionStore.getState()}});
  };
  let autoBackupTimer=0;
  function scheduleAutoBackup(){
    if(disposed||lifecycle!=='ready'||options.autoBackup===false)return;
    win.clearTimeout(autoBackupTimer);
    autoBackupTimer=win.setTimeout(()=>{if(!disposed&&lifecycle==='ready')takeBackup('自动备份');},2500);
  }
  function takeBackup(note=''){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    if(commerceBusy||decoration?.active||decoration?.pending)return tradeFailure('BUSY','请先完成当前操作');
    let archive;
    try{archive=backupSnapshot();}catch{return tradeFailure('ARCHIVE_FAILED','暂时无法生成存档快照');}
    const result=backupStorageApply(roomStorage,backupsKey,()=>addBackup({adapter:roomStorage,key:backupsKey,archive,note}));
    if(!result.ok)return result;
    const list=readBackups(roomStorage,backupsKey);
    return list.ok?{ok:true,message:note==='自动备份'?'已自动保存一份最近备份':'备份已保存',backups:list.backups}:list;
  }
  function listBackups(){
    if(disposed||lifecycle!=='ready')return {ok:false,backups:[]};
    const list=readBackups(roomStorage,backupsKey);
    return {ok:list.ok,backups:list.backups||[],message:list.message};
  }
  function removeBackupEntry(id){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    if(typeof id!=='string'||!id.trim())return tradeFailure('INVALID_BACKUP','备份编号无效');
    return backupStorageApply(roomStorage,backupsKey,()=>removeBackup(roomStorage,backupsKey,id));
  }
  function restoreBackup(id){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    if(commerceBusy||decoration?.active||decoration?.pending)return tradeFailure('BUSY','请先完成当前交易或装修');
    if(typeof id!=='string'||!id.trim())return tradeFailure('INVALID_BACKUP','备份编号无效');
    const entry=findBackup(roomStorage,backupsKey,id);
    if(!entry)return tradeFailure('NOT_FOUND','没有找到这份备份');
    return importArchive(JSON.stringify(entry.archive));
  }
  function exportSave(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    let archive;
    try{archive=backupSnapshot();}catch{return tradeFailure('ARCHIVE_FAILED','暂时无法生成存档快照');}
    return {ok:true,json:JSON.stringify(archive)};
  }
  function changeProfile(operation){return disposed||lifecycle!=='ready'?tradeFailure('NOT_READY','房间尚未就绪或已释放'):operation();}
  const api={
    saveWallDrawing:drawing=>changeProfile(()=>saveCompanionResult(companionStore.saveWallDrawing(drawing))),
    getPlayState:()=>play?.getState?.()||null,
    getState,getShop,getCompanion,updateCompanion,customizeFurniture,redeemSecret,speakPetGreeting:()=>{fx?.say('欢迎回家！我在小屋等你哦～',4200);return {ok:true,message:'欢迎语已变成文字小气泡啦，不再播放语音朗读'};},playMoveInCeremony(){if(disposed||lifecycle!=='ready')return false;const started=ceremony.start({fromWidth:roomTier.width,fromDepth:roomTier.depth,roomName:companionStore.getState().roomName});feel?.ritual();schedule();return started;},getLayout:()=>layoutManager?.snapshot()||null,purchaseFurniture,expandRoom,setRoomLevel,creditLearning,setPresentationPaused,setTheme,
    // 派对模式（清单97）：一键小热闹，纯增强不影响存档/经济。
    celebrateParty(){
      if(disposed||lifecycle!=='ready')return false;
      const melody=humMelody((Date.now()&0xffff)>>>0);
      fx?.celebrate({name:'今天也开开心心',kind:'party'});
      sfx.playMelody(melody.freqs,{wave:'triangle',gap:.08,dur:.16,noteGain:.10});sfx.play('cheer');
      vibrate([30,60,30,60,90]);feel?.react('cheer');feel?.ritual();schedule();return true;
    },
    storeFurniture,unstoreFurniture,collectAllFurniture,resetRoomLayout,purchasePet,selectPet,setWallColor,applyFlooring,
    getProfile,checkIn,makeUpCheckIn,exportArchive,importArchive,exportSave,importSave:importArchive,createBackup:takeBackup,listBackups,removeBackup:removeBackupEntry,restoreBackup,setProfileGender:gender=>changeProfile(()=>{const result=profile.setGender(gender);if(result.ok)syncAchievementDisplays();return result;}),
    setProfileName:name=>changeProfile(()=>{const result=profile.setName(name);if(result.ok){syncCompanion();fx?.say(`${name}，我记住你啦！`);notify('companion-change');}return result;}),setProfileAvatar:data=>changeProfile(()=>profile.setAvatar(data)),addStudyTime:seconds=>changeProfile(()=>{const result=profile.addStudyTime(seconds);if(result.ok){evaluateBadges();syncAchievementDisplays();feel?.react('clap');fx?.say('{owner}，你认真学习的样子真棒！');}return result;}),
    setLamp:on=>lifecycle==='ready'?setLamp(on):false,
    toggleSofa(){if(disposed||lifecycle!=='ready'||commerceBusy||decoration?.active||decoration?.pending)return false;actor.toggleSeat();return true;},
    walkTo(x,z){if(disposed||lifecycle!=='ready'||commerceBusy||decoration?.active||decoration?.pending||!Number.isFinite(x)||!Number.isFinite(z))return false;return actor.walkTo({x,z});},
    setDecorationMode:enabled=>typeof enabled==='boolean'&&!disposed&&!commerceBusy&&lifecycle==='ready'?(enabled?decoration.enter():decoration.exit(true)):false,
    getFurniture:id=>furniture.get(id), // 调试专用Object3D；传输层只公开getLayout纯数据。
    setFurnitureTransform(id,transform){
      if(!canEdit())return false;const before=layoutManager.snapshot();
      if(!layoutManager.previewTransform(id,transform))return false;
      const ok=layoutManager.commit(before);decoration.refresh();return ok;
    },
    setFurnitureCollider(id,patch,index=0){if(!canEdit())return false;const ok=layoutManager.updateCollider(id,patch,index);decoration.refresh();return ok;},
    importLayout(value,importOptions={}){if(!canEdit())return {ok:false,reason:'伙伴站稳后才能导入布局'};const result=layoutManager.importLayout(value,importOptions);decoration.refresh();return result;},
    dispose,
  };
  function disposeCharacter(character){
    if(!character?.model)return;
    const model=character.model;model.removeFromParent();
    try {if(typeof character.dispose==='function')character.dispose();else {character.pose?.dispose?.();disposer.tree(model);}}
    catch(error){disposer.tree(model);safeCall(options.onEvent,'cleanup-warning',{message:String(error.message)});}
  }
  function releaseCharacter(){
    if(actor)disposeCharacter(actor.character);
  }
  function dispose(preserveError=false){
    if(disposed)return;disposed=true;events.abort();loadAbort.abort();win.clearTimeout(initTimer);win.clearTimeout(autoBackupTimer);win.clearInterval(giftTimer);voice.dispose();win.cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();intersectionObserver?.disconnect();keys.clear();down=null;hint.remove();namePlate.remove();
    decoration?.dispose();if(decorationReady){decorationReady(false);decorationReady=null;}
    renderSurface?.dispose();renderSurface=null;presentationPaused=false;
    creative?.dispose();play?.dispose();ceremony?.dispose();feel?.dispose();fx?.dispose();releaseCharacter();if(achievementDisplay){achievementDisplay.dispose();achievementDisplay=null;}disposer.tree(scene);disposer.release(gradient);renderer?.dispose();
    furniture.clear();interactive.length=0;materialCache.clear();actor=null;layoutManager=null;sfx.dispose();
    if(originalTabIndex===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',originalTabIndex);
    canvas.style.touchAction=originalTouchAction;canvas.style.cursor='';
    if(mountedRooms.get(canvas)===controller)mountedRooms.delete(canvas);
    if(!preserveError)lifecycle='disposed';notify('disposed');
  }
  function shouldRender(){return !disposed&&lifecycle==='ready'&&!doc.hidden&&canvasVisible&&(!presentationPaused||commerceBusy||decorationReady||decoration?.active||decoration?.pending||!['idle','seated'].includes(actor?.state)||feel?.active||ceremony?.active||ritualPoints.length);}
  // 微风摇曳（清单83）：选中几件柔性装饰，在无操作时极低幅度左右摆动，纯视觉，不影响碰撞与导航。
  const swayable=['candy-tree','cloud-table','mushroom-stool','plant-shelf','floor-pot','moon-ornament'];
  const swayState=new Map(),swayPivots=new WeakMap();
  function resetSway(){for(const pivot of swayState.values())pivot.rotation.z=0;swayState.clear();}
  function swayDecor(now){
    if(commerceBusy||decoration?.active||decoration?.pending||!actor||actor.state!=='idle'){resetSway();return;}
    if(now-swayStamp<120)return;swayStamp=now;
    for(const id of swayable){
      const root=furniture.get(id);if(!root||root.userData.wallHanging)continue;
      let pivot=swayPivots.get(root);if(!pivot){pivot=new THREE.Group();pivot.name='ambient-sway';for(const child of [...root.children])pivot.add(child);root.add(pivot);swayPivots.set(root,pivot);}
      swayState.set(id,pivot);pivot.rotation.z=Math.sin(now/900+ (furnitureIndex(id)||0))*0.012;
    }
  }
  const furnitureIndex=id=>{let i=0;for(const key of furniture.keys()){if(key===id)return i;i++;}return 0;};
  let swayStamp=0;
  function schedule(){if(shouldRender()&&!frameId)frameId=win.requestAnimationFrame(frame);}
  function frame(now){
    frameId=0;if(!shouldRender())return;
    // 空闲省电（清单106）：连续无操作 60 秒后切到低帧率，触摸/键盘活动立即恢复。
    if(typeof touchActivity==='function'&&typeof idleFps==='boolean'&&typeof idleSince!=='undefined'){
      if(actor&&!feel?.active&&!ceremony?.active&&!decoration?.active&&actor.state==='idle'){
        if(!idleFps&&idleSince&&now-idleSince>60000){idleFps=true;}
      } else if(idleFps){idleFps=false;}
    }
    const effectiveFPS=(typeof idleFps==='boolean'&&idleFps)?18:quality.maxFPS;
    const minInterval=1000/effectiveFPS;
    if(lastRender&&now-lastRender<minInterval-.5){schedule();return;}
    const dt=Math.min(previous?(now-previous)/1000:0,.08);previous=now;lastRender=now;
    try {
      const wasAnimating=!!feel?.active||!!ceremony?.active;
      actor.update(dt,commerceBusy||decoration?.active||decoration?.pending?{x:0,z:0}:inputAxis());if(disposed)return;
      feel?.frame(dt);if(!decoration?.active&&!decoration?.pending)play?.update(dt);ceremony?.frame(dt);updateNight();
      if(typeof swayDecor==='function')swayDecor(now);
      if(typeof themeTargets!=='undefined'&&typeof applyLightingLerp==='function')applyLightingLerp();
      if(nightActive&&feel?.sleeping&&now-lastSnore>9000){lastSnore=now;sfx.play('snore');}
      if(ritualPoints.length&&actor.state==='idle'&&!commerceBusy&&!decoration?.active){const point=ritualPoints.shift();actor.walkTo(point);}
      if(Date.now()-lastIdleCheck>60000){lastIdleCheck=Date.now();const last=Date.parse(companionStore.getState().lastInteraction||companionStore.getState().lastVisit||'');if(Number.isFinite(last)&&Date.now()-last>4*3600000&&actor.state==='idle'&&!decoration?.active&&!commerceBusy){feel?.react('nuzzle');fx?.say('{owner}，我来蹭蹭你～休息一下也很好呀。');companionStore.touch();}}
      // 间歇强化（清单45）：每 3–6 分钟有较低概率轻轻鼓励一句，避免变成机械重复。
      if(typeof lastCheer!=='undefined'&&!nightActive&&actor.state==='idle'&&!commerceBusy&&!decoration?.active&&Date.now()-lastCheer>180000&&(Date.now()>>>8)%5===0){lastCheer=Date.now();fx?.say(cheerLine(Date.now()>>>9),3400);}
      if(decorationReady&&actor.state==='idle'){const resolve=decorationReady;decorationReady=null;resolve(true);}
      if(actor?.state==='watering'&&actor.waterTarget){
        const wroot=furniture.get(actor.waterTarget.id);
        if(wroot){waterFx.visible=true;waterFx.position.copy(wroot.position);waterFx.position.y+=.40;}
        const cycle=(now%900)/900;
        wetDisc.visible=true;wetDisc.scale.setScalar(1+Math.sin(now/160)*.04);wetDisc.rotation.z=now/900;
        waterFx.children.forEach((child,i)=>{
          if(child===wetDisc)return;
          const off=((i*113)%900)/900,t=(cycle+off)%1;child.visible=true;
          child.position.set(Math.sin(i*2.1)*.055,.40*(1-t)+.02,Math.cos(i*2.1)*.055*(1-t));
          child.scale.setScalar(.55+.45*(1-t));
        });
      } else if(waterFx.visible)waterFx.visible=false;
      if(!presentationPaused){renderScene();metricsFrames++;}
      else if(ceremony?.active||wasAnimating&&!feel?.active)capturePoster();
      if(now-lastMetrics>=500){
        if(!presentationPaused){fps=metricsFrames*1000/Math.max(1,now-lastMetrics);if(fps<45)lowFpsStreak+=1;else lowFpsStreak=0;if(quality.profile!=='low'&&lowFpsStreak>=4)applyAutoDowngrade();updateStatus();}
        metricsFrames=0;lastMetrics=now;
      }
      schedule();
    } catch(error){lastError={code:'RENDER_FAILED',message:String(error.message)};lifecycle='error';notify('error',lastError);dispose(true);}
  }
  function visibility(){
    releaseKeys();
    if(doc.hidden)lastHiddenAt=Date.now();
    else if(lastHiddenAt&&Date.now()-lastHiddenAt>30*60000&&lifecycle==='ready'){lastHiddenAt=0;pendingVoiceGreeting=true;returnVisit=companionStore.visit();if(returnVisit.gift)companionStore.remember(returnVisit.gift.id,profile.getState().name||'小主人','gift');syncCompanion();if(!nightActive){fx?.say(returnVisit.gift?'{owner}，回来啦！我找到一颗星星，送你的～':'{owner}，你回来啦！刚刚想起你呢～');if(returnVisit.gift)feel?.fetchGift(returnVisit.gift);else feel?.react('nuzzle');
        // 小客人留言（清单69）：非礼物归来时，约三分之一概率留一张温柔纸条，用于编故事。
        // v2.23：好友进入家限制——绒绒伙伴已占 1 位，加上今日进家留言不得超过“好友进家上限”。
        if(!returnVisit.gift){
          const state=companionStore.getState(),friendLimit=state.homeFriendLimit||2;
          const friendNames=Array.isArray(state.friendNames)?state.friendNames:[];
          // v2.24 · 好友白名单：来访者从名单里挑登记的好朋友；偶尔来位没登记的小朋友，证明"陌生人进不来"。
          const strangerPool=['阿乐','小满','琪琪','糖糖'];
          const stranger=friendNames.length&&((Date.now()>>>2)%5===0);
          const visitor=stranger?strangerPool[(Date.now()>>>3)%strangerPool.length]:friendNames[(Date.now()>>>5)%Math.max(1,friendNames.length)];
          const entrance=friendEntrance(friendLimit,{notesToday:readFriendsNotesToday(win.localStorage),visitor:visitor||'',friendNames});
          if(entrance.allowed&&!entrance.stranger&&(Date.now()>>>4)%3===0){markFriendNote(win.localStorage);setTimeout(()=>{if(!disposed)fx?.say(guestNote((Date.now()>>>3)%977,visitor),4200);},2600);}
          else if(!entrance.allowed)setTimeout(()=>{if(!disposed)fx?.say(entrance.message,3800);},2600);
        }
      }}
    if(!shouldRender()){win.cancelAnimationFrame(frameId);frameId=0;}
    else {previous=0;lastRender=0;lastMetrics=win.performance.now();metricsFrames=0;schedule();}
  }
  // 低端设备自动降级（v2.7/batch1）：连续 4 个 500ms 采样帧率 < 45 时降一档，
  // 关闭阴影并把像素比降到 1；只降一次，通过 metrics.autoDowngraded 与事件暴露。
  function applyAutoDowngrade(){
    if(quality.autoDowngraded||disposed)return;
    const previousQuality=quality.profile;
    Object.assign(quality,resolveQuality('low'),{maxPixelRatio:1,autoDowngraded:true});lowFpsStreak=0;
    try{
      renderer.shadowMap.enabled=false;
      sun.shadow.mapSize.set(256,256);
      resize();
    }catch{/* 降级是渐进增强，失败不回滚 */}
    notify('quality-downgrade',{from:previousQuality,to:'low',reason:'持续低帧率'});
  }
  async function initialize(){
    try {
      if(disposed)throw roomError('ABORTED','房间加载已取消');
      try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:quality.profile==='low'?'low-power':'default'});}
      catch(error){throw roomError('WEBGL_UNAVAILABLE','当前设备未能创建WebGL2场景',error);}
      renderSurface=createRendererSurface({canvas,renderer,render:renderScene});
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=themeMode==='eye-care'?.83:1;
      initTimer=win.setTimeout(()=>{loadTimedOut=true;loadAbort.abort();},options.loadTimeoutMs||30000);
      const results=await Promise.allSettled(Object.entries(FURNITURE).map(([id,c])=>loadFurniture(id,c)));
      const failed=results.find(result=>result.status==='rejected');if(failed)throw loadFailure||failed.reason;
      if(disposed)throw roomError('ABORTED','房间加载已取消');
      // 先按账户库存剔除场景家具，再建立布局注册表，避免旧布局补齐已收纳家具。
      for(const key of initialAccount.stored||[]){
        const id=SHOP_CATALOG.some(item=>item.sku===key)||giftProduct(key)?`shop-${key}`:key,root=furniture.get(id);
        if(root){removeInteractive(root);furniture.delete(id);root.removeFromParent();releaseRoomItem(root);}
      }
      sofaRoot=furniture.get('sofa');lampRoot=furniture.get('lamp');
      if(lampRoot)attachLamp(lampRoot);
      resolveSeat();
      const character=await waitForLoad(Promise.resolve().then(()=>characterFactory===createOriginalFox?createPetCharacter(initialAccount.pets.active,options.characterOptions||{}):characterFactory(options.characterOptions||{})),disposeCharacter);
      if(disposed){disposeCharacter(character);throw roomError('ABORTED','房间加载已取消');}
      if(!character?.model?.isObject3D||typeof character.pose?.update!=='function'||typeof character.pose?.sit!=='function'||typeof character.pose?.stand!=='function'||!Number.isFinite(character.pose.amount)||!Number.isFinite(character.pose.contactY)||character.pose.contactY<0||character.pose.contactY>1){
        disposeCharacter(character);throw roomError('INVALID_CHARACTER','角色工厂需提供model、动作函数及有效的amount/contactY');
      }
      actor=new PetActor(character);
      const accountStorage={
        getItem(key){const saved=economy.getLayout();if(saved)return JSON.stringify(saved);return roomStorage?.getItem(key)??null;},
        setItem(key,value){const result=economy.setLayout(JSON.parse(value));if(!result.ok)throw new Error(result.message);},
      };
      const activeDefinitions=Object.fromEntries(Object.entries(furnitureDefinitions).filter(([id])=>furniture.has(id)));
      layoutManager=createLayoutManager({furniture,definitions:activeDefinitions,roomBounds:placementBounds,navigationBounds:bounds,grandfatherUnreachableSeats:true,
        storageKey,storageAdapter:accountStorage,
        petRadius:PET_BODY_RADIUS,petHeight:ROOM.petHeight,getPet:()=>({x:actor.ctrl.x,z:actor.ctrl.z}),
        setPet:point=>{actor.ctrl.stop();actor.ctrl.x=point.x;actor.ctrl.z=point.z;actor.root.position.set(point.x,.09,point.z);},
        getApproach:()=>({x:approachWorld.x,z:approachWorld.z}),
        getSeatApproaches:(currentObstacles,currentBounds,from={x:actor.ctrl.x,z:actor.ctrl.z})=>Object.keys(SEATS).filter(id=>furniture.has(id)).map(id=>({id,point:resolveSeatApproach(furniture.get(id),id,{obstacles:currentObstacles,bounds:currentBounds,from,petRadius:PET_BODY_RADIUS})})),
        afterUpdate:resolveSeat,onEvent:(type,detail)=>{if(!commerceBusy)notify(type,detail);}});
      layoutManager.refresh();obstacles=layoutManager.obstacles;
      defaultRoomLayout=layoutManager.snapshot();
      const restored=options.restoreLayout!==false||initialAccount.owned.length?layoutManager.loadSaved():false;
      if(initialAccount.owned.length&&!restored){
        // 旧版/结构变更的布局存单无法原样恢复：loadSaved 失败分支已回退到默认布局
        // （含已购家具按默认位摆放）。此前这里硬抛 ACCOUNT_LAYOUT_INVALID 会导致
        // 持有旧档的用户永远进不去房间且无恢复入口。现改为不拒绝启动：
        // 积分与家具产权保持原样（本分支不写回存档），仅发出警告事件供宿主提示。
        notify('layout-restore-warning',{kind:'fallback',reason:'账户布局无法恢复，已按默认布局重建房间；积分与家具产权未受影响'});
      }
      if(disposed)throw roomError('ABORTED','房间加载已取消');
      const decorationOptions={canvas,scene,camera,furniture,manager:layoutManager,prepare:prepareDecoration,onEvent:notify,persistLayout,onCollectAll:()=>collectAllFurniture(),onResetLayout:()=>resetRoomLayout(),onStoreItem:id=>storeFurniture(id.startsWith('shop-')?id.slice(5):id),
        // 底部家具栏包含所有已拥有家具；房间内的卡片可直接选中，仓库卡片可点击或拖入。
        getStorage:()=>{const account=economy.getState(),owned=new Set([...BUILTIN_STORAGE.map(item=>item.id),...account.owned]);return [...STORAGE_CATALOG,...giftCatalog(companionStore.getState().rewards)].filter(item=>owned.has(item.sku||item.id)&&!item.expired).map(item=>({...item,furnitureId:item.sku?`shop-${item.sku}`:item.id,stored:account.stored.includes(item.sku||item.id)}));},
        onUnstoreItem:(sku,placement)=>unstoreFurniture(sku,undefined,placement),getRoomSize:()=>({width:roomTier.width,depth:roomTier.depth}),getAppearance:()=>economy.getState().appearance,onWallColor:setWallColor,onFlooring:applyFlooring};
      decoration=uiRoot?createDecoration({...decorationOptions,uiRoot}):createDecorationSession(decorationOptions);
      win.clearTimeout(initTimer);setLamp(true);if(disposed)throw roomError('ABORTED','房间加载已取消');resize();
      if(win.ResizeObserver){resizeObserver=new win.ResizeObserver(resize);resizeObserver.observe(canvas);}
      if(win.IntersectionObserver){intersectionObserver=new win.IntersectionObserver(entries=>{canvasVisible=entries[0]?.isIntersecting!==false;visibility();});intersectionObserver.observe(canvas);}
      lifecycle='ready';lastMetrics=win.performance.now();profile.ensureAcquisitionBaseline();returnVisit=companionStore.visit();if(returnVisit.gift)companionStore.remember(returnVisit.gift.id,profile.getState().name||'小主人','gift');companionStore.seedMemories([...BUILTIN_STORAGE.map(item=>({id:item.id,builtin:true})),...initialAccount.owned.filter(id=>!giftProduct(id)).map(id=>({id,builtin:false})),...initialAccount.pets.owned.map(id=>({id,builtin:false}))]);syncCompanion();sfx.configure?.(companionStore.getState().sound);setTheme(companionStore.getState().theme);updateNight(true);notify('ready',{character:character.metadata});syncAchievementDisplays();
      if(!nightActive){fx?.say(returnVisit.gift?'{owner}，你回来啦！这颗星星送给你～':'{owner}，你回来啦！今天也一起装满小小喜欢～',5000);if(returnVisit.gift)feel?.fetchGift(returnVisit.gift);else feel?.react('nuzzle');
        // 追加谢谢式小惊喜：生日纪念（清单63，按首次到来月日当天说生日快乐）、昨日缺勤温柔提醒（清单53）。
        try{const prefs=companionStore.getState(),now=new Date(),first=prefs.firstVisit?new Date(prefs.firstVisit):null;
          if(first&&first.getMonth()===now.getMonth()&&first.getDate()===now.getDate()){fx?.say('今天是咱们相遇的纪念日！生日快乐，小屋永远欢迎你～',5200);vibrate([40,60,40]);}
          else if(!returnVisit.gift&&prefs.visitDates&&!prefs.visitDates.includes(localDate())&&!prefs.visitDates.includes(previousDay(localDate()))){fx?.say(gentleMissedMessage().text,4200);}
        }catch{/* 增强提示失败不影响欢迎 */}
      }
      if(disposed)throw roomError('ABORTED','房间加载已取消');const preferences=companionStore.getState();voice.configure({enabled:preferences.voiceEnabled,...preferences.sound,language:preferences.voiceLanguage,style:preferences.voiceStyle});giftTimer=win.setInterval(()=>{if(!disposed&&lifecycle==='ready')syncCompanion();},30000);schedule();return api;
    } catch(error){
      if(disposed)throw roomError('ABORTED','房间加载已取消',error);
      lastError={code:error.code||'INITIALIZATION_FAILED',message:error.message};lifecycle='error';notify('error',lastError);dispose(true);throw error;
    }
  }
  win.addEventListener('resize',resize,eventOptions);
  doc.addEventListener('visibilitychange',visibility,eventOptions);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(disposed||lifecycle!=='ready')return;lifecycle='context-lost';visibility();notify('context-lost');},eventOptions);
  canvas.addEventListener('webglcontextrestored',()=>{if(disposed||!actor||lifecycle!=='context-lost')return;lifecycle='ready';resize();visibility();notify('context-restored');},eventOptions);
  const controller={api,ready:null,dispose:()=>dispose(),version:'2.28.1',protocolVersion:1};mountedRooms.set(canvas,controller);
  if(options.signal){if(options.signal.aborted)dispose();else options.signal.addEventListener('abort',()=>dispose(),eventOptions);}
  controller.ready=initialize();controller.ready.catch(()=>{});return controller;
}
