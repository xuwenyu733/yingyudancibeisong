import * as THREE from './vendor/three/three.module.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { ROOM, FURNITURE, SOFA, PALETTE, COLLIDERS, PLACEMENT_BOUNDS } from './layout.js';
import { buildDecor } from './decor.js';
import { MovementController } from './movement.mjs';
import { createPath } from './navigation.mjs';
import { createOriginalFox } from './characters/original-fox.js';
import { createLayoutManager } from './layout-manager.js';
import { createDecoration } from './decoration.js';
import { createDecorationSession } from './decoration-session.mjs';
import { resolveQuality,resolveAssetURL,createDisposer,roomError } from './runtime.mjs';
import { SEATS, fitSeat, resolveSeatApproach } from './seats.mjs';
import { WATER_TARGETS, fitWater, resolveWaterApproach } from './seats.mjs';
import { placementOrder } from './placement.mjs';
import { createEconomy, SHOP_CATALOG, ROOM_TIERS } from './economy.mjs';
import { createShopFurniture, applyRoomTier } from './scene-economy.js';
import { createProfile, BADGES, checkInReward, previousDay, buildMonthCalendar, badgeHint, buildStats, xpForLevel, xpNeededBetween } from './profile.mjs';
import { exportArchive as buildArchive, importArchive as parseArchive } from './archive.mjs';

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
  const doc=canvas.ownerDocument,win=doc.defaultView;
  const quality=resolveQuality(options.quality||'auto',{coarsePointer:win.matchMedia?.('(pointer: coarse)').matches,deviceMemory:win.navigator.deviceMemory});
  const assetsBaseUrl=options.assetsBaseUrl||new URL('./assets/',import.meta.url).href;
  const events=new win.AbortController(),eventOptions={signal:events.signal},loadAbort=new win.AbortController();
  const disposer=createDisposer(),scene=new THREE.Scene();scene.background=new THREE.Color(PALETTE.background);
  let renderer=null,disposed=false,lifecycle='loading',lastError=null,loadTimedOut=false,loadFailure=null;
  let frameId=0,resizeObserver=null,intersectionObserver=null,canvasVisible=true;
  let initTimer=0,previous=0,lastRender=0,lastMetrics=0,metricsFrames=0,fps=0,lowFpsStreak=0;
  let lampOn=true,actor=null,lampRoot,sofaRoot,lampLight,lampBulb,seatWorld,approachWorld;
  let obstacles=[],layoutManager=null,decoration=null,decorationReady=null,commerceBusy=false;
  const storageKey=options.storageKey||'hamster-room-layout-v3';
  const economy=createEconomy({storageAdapter:options.storageAdapter,storageKey:storageKey+'-account-v1',initialBalance:options.initialPoints??0});
  const profile=createProfile({storageAdapter:options.storageAdapter,storageKey:storageKey+'-profile-v1',onEvent:(type,detail)=>notify(type,detail)});
  const initialAccount=economy.getState();
  let roomTier=ROOM_TIERS[initialAccount.roomLevel]||ROOM_TIERS[0];
  const bounds={...PLACEMENT_BOUNDS},placementBounds={...PLACEMENT_BOUNDS};
  const camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,80);
  camera.position.set(9,11.8,17);camera.lookAt(0,1.35,0);camera.updateMatrixWorld(true);camera.layers.enable(1);
  scene.add(new THREE.HemisphereLight(0xfff7df,0xe1b782,1.0));
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
  const furnitureDefinitions=JSON.parse(JSON.stringify(COLLIDERS));
  for(const sku of initialAccount.owned){
    const item=createShopFurniture(sku,solidMaterial);scene.add(item.root);furniture.set(item.root.name,item.root);furnitureDefinitions[item.root.name]=item.definition;
    if(WATER_TARGETS[item.root.name]){item.root.userData.interaction='water';item.root.userData.waterTargetId=item.root.name;interactive.push(item.root);}
  }
  applyRoomTier({furniture,width:roomTier.width,depth:roomTier.depth,bounds,placementBounds});
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
    return {protocolVersion:1,version:'2.8.0',lifecycle,ready:lifecycle==='ready',character:actor?.character.metadata||null,lampOn,shop:getShop(),
      petState:actor?.state||'loading',petPosition:actor?.root.position.toArray().map(rounded)||null,
      petYaw:actor?rounded(actor.root.rotation.y):0,desiredSeated:actor?.desiredSeated||false,
      seatId:actor?.seatId||null,sitting:actor?rounded(actor.pose.amount):0,poseStage:actor?.pose.stage||'',
      watering:actor?.state==='watering'||false,waterTarget:actor?.waterTarget?.id||null,
      decoration:decoration?.active||false,selected:decoration?.selected||null,error:lastError,
      metrics:{fps:Math.round(fps),triangles:renderer?.info.render.triangles||0,drawCalls:renderer?.info.render.calls||0,quality:quality.autoDowngraded?'low':quality.profile,maxPixelRatio:quality.autoDowngraded?1:quality.maxPixelRatio,autoDowngraded:quality.autoDowngraded||false}};
  }
  function getShop(){
    const account=economy.getState();
    return {balance:account.balance,owned:account.owned,roomLevel:account.roomLevel,roomName:roomTier.name,width:roomTier.width,depth:roomTier.depth,
      catalog:SHOP_CATALOG,tiers:ROOM_TIERS,nextTier:account.nextTier,busy:commerceBusy,valid:account.valid,error:account.error};
  }
  function updateStatus(){
    canvas.dataset.petState=actor?.state||lifecycle;canvas.dataset.lampOn=String(lampOn);canvas.dataset.lifecycle=lifecycle;
    renderHint?.();
    safeCall(options.onState,getState());
  }
  function notify(type,detail={}){if(type==='water-done')lastWateredAt=(win.performance?.now?.()||Date.now());safeCall(options.onEvent,type,detail);updateStatus();}
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
  const url=resolveAssetURL(config.asset||config.url.replace('./assets/',''),assetsBaseUrl);
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
  if(lampLight) lampLight.intensity=lampOn?3.0:0;
  if(lampBulb) lampBulb.visible=lampOn;
  lampGlow.value=lampOn?.22:0;
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
    const approach=resolveWaterApproach(root,targetId,{obstacles,bounds,from:{x:this.ctrl.x,z:this.ctrl.z},petRadius:.48});
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
    const approach=resolveSeatApproach(root,seatId,{obstacles,bounds,from:{x:this.ctrl.x,z:this.ctrl.z},petRadius:.48});
    if(!approach)return false;
    this.seatId=seatId;
    if(seatId==='sofa'){resolveSeat();fitted.seatWorld=seatWorld;}
    this.seatWorld.copy(fitted.seatWorld);this.approachWorld.copy(approach);this.seatYaw=fitted.seatYaw;
    return true;
  }
  walkTo(point) {
    if(insideObstacle(point.x,point.z))return false;
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
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,quality.maxPixelRatio));renderer.setSize(w,h,false);
  // 对房间固定包围盒作投影适配，竖屏手机与桌面均不裁掉家具。
  const view=new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const projected=new THREE.Box3();
  for(const x of [-roomTier.width/2-.3,roomTier.width/2+.3])for(const y of [-.4,5.40])for(const z of [-roomTier.depth/2-.15,roomTier.depth/2+.15])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(view));
  const center=projected.getCenter(new THREE.Vector3());
  const aspect=w/h;
  // 竖屏优先保留主要家具，房间地板的两个外角可出画；避免手机里整间房缩成小图标。
  const contentWidth=aspect<.75?roomTier.width+.7:(projected.max.x-projected.min.x)*1.06;
  const halfY=Math.max((projected.max.y-projected.min.y)*.50,contentWidth/2/aspect);
  camera.left=center.x-halfY*aspect;camera.right=center.x+halfY*aspect;
  camera.top=center.y+halfY;camera.bottom=center.y-halfY;camera.updateProjectionMatrix();
}
function aim(event) {
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
}
function pickedFurniture() {
  const hit=raycaster.intersectObjects(interactive,true)[0];if(!hit)return null;
  let root=hit.object;while(root&&!root.userData.interaction)root=root.parent;return root;
}
let down=null,clickTimer=0,lastClickAt=0,lastClickX=0,lastClickY=0;
const DBLCLICK_MS=320,DBLCLICK_PX=14;
function clearClickTimer(){if(clickTimer){win.clearTimeout(clickTimer);clickTimer=0;}}
function walkToPointer(event){
  if(!actor)return false;
  aim(event);
  if(!raycaster.ray.intersectPlane(plane,pointerTarget))return false;
  return actor.walkTo(pointerTarget);
}
canvas.addEventListener('pointerdown',e=>{if(commerceBusy||decoration?.active||decoration?.pending){down=null;return;}down={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.focus({preventScroll:true});},eventOptions);
canvas.addEventListener('pointerup',e=>{
  if(commerceBusy||decoration?.active||decoration?.pending||!actor||!down||e.pointerId!==down.id)return;
  const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>8)return;
  const now=win.performance?.now?.()||Date.now();
  const isDouble=now-lastClickAt<=DBLCLICK_MS&&Math.hypot(e.clientX-lastClickX,e.clientY-lastClickY)<=DBLCLICK_PX;
  lastClickAt=now;lastClickX=e.clientX;lastClickY=e.clientY;
  // 双击任意位置：走到地面落点；延迟单击，避免双击时先误触沙发/花盆。
  if(isDouble){clearClickTimer();walkToPointer(e);return;}
  aim(e);const picked=pickedFurniture();
  clearClickTimer();
  if(!picked)return;
  clickTimer=win.setTimeout(()=>{clickTimer=0;if(disposed||commerceBusy||decoration?.active||decoration?.pending)return;triggerInteraction(picked);},DBLCLICK_MS);
},eventOptions);
// 单击/键盘 Enter：灯、座位、花盆；双击地面行走。
function triggerInteraction(picked){
  if(!picked||!actor)return;
  if(picked.userData.interaction==='lamp')setLamp(!lampOn);
  else if(picked.userData.interaction==='seat')actor.toggleSeat(picked.userData.seatId||'sofa');
  else if(picked.userData.interaction==='water')actor.requestWater(picked.userData.waterTargetId||'floor-pot');
}
canvas.addEventListener('pointercancel',()=>{down=null;clearClickTimer();},eventOptions);
function releaseKeys(){
  const wasKeyboard=keys.size>0;keys.clear();down=null;
  if(wasKeyboard&&actor&&actor.state==='walking'&&!actor.ctrl.target){actor.ctrl.stop();actor.path=[];actor.setState('idle');}
}
win.addEventListener('blur',releaseKeys,eventOptions);canvas.addEventListener('blur',releaseKeys,eventOptions);
canvas.addEventListener('pointermove',e=>{
  if(decoration?.active||decoration?.pending){hintTarget=null;renderHint();return;}
  aim(e);const picked=pickedFurniture();
  canvas.style.cursor=picked?'pointer':'default';
  hintTarget=picked;hintX=e.clientX;hintY=e.clientY;renderHint();
},eventOptions);
canvas.addEventListener('pointerleave',()=>{hintTarget=null;renderHint();},eventOptions);
const hint=doc.createElement('div');hint.className='pet-room-hint';hint.setAttribute('role','tooltip');
hint.style.cssText='position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:none;padding:7px 13px;border-radius:12px;background:rgba(47,38,26,.86);color:#fff8e8;font:600 13px/1 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);white-space:nowrap;';
doc.body.appendChild(hint);
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
  if(doc.activeElement!==canvas||decoration?.active||decoration?.pending||e.target.matches?.('input,button,select,textarea'))return;
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
  if(doc.activeElement!==canvas)return {x:0,z:0};
  const x=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  const y=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
  // 按屏幕方向移动，而非直接映射世界XZ；斜等距相机下上下左右仍然直观。
  return {x:rightAxis.x*x+downAxis.x*y,z:rightAxis.z*x+downAxis.z*y};
}
function prepareDecoration() {
  keys.clear();down=null;clearClickTimer();if(decorationReady){decorationReady(false);decorationReady=null;}if(!actor)return false;
  actor.desiredSeated=false;actor.pendingPoint=null;actor.pendingSeatId=null;actor.pendingWater=false;
  if(['walking','approaching','watering'].includes(actor.state)){actor.ctrl.stop();actor.path=[];actor.seatId=null;actor.facing.rotation.x=0;actor.pose?.setWatering?.(0);actor.setState('idle');}
  if(actor.state==='idle')return true;
  if(['seated','sitting-down'].includes(actor.state))actor.standUp();
  return new Promise(resolve=>{decorationReady=resolve;});
}

  function canEdit(){return !disposed&&lifecycle==='ready'&&actor?.state==='idle'&&!decoration?.dragging&&!commerceBusy;}
  const tradeFailure=(code,message)=>({ok:false,code,message});
  async function trade(operation){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    if(commerceBusy||decoration?.active||decoration?.pending)return tradeFailure('BUSY','请先完成或取消装修');
    commerceBusy=true;updateStatus();
    try {
      if(!await prepareDecoration()||disposed)return tradeFailure('ABORTED','操作已取消');
      return operation();
    } catch(error){return tradeFailure('TRANSACTION_FAILED',String(error.message||'操作失败，请重试'));}
    finally {commerceBusy=false;if(!disposed)updateStatus();}
  }
  function discardShopItem(id,root){
    layoutManager.unregisterFurniture(id);furniture.delete(id);root.removeFromParent();
    root.traverse(object=>{if(object.isMesh)disposer.release(object.geometry);});
  }
  /** 账户布局失效时：已购商店家具重新找空位登记，并写回账户布局。 */
  function recoverOwnedLayout(){
    if(!layoutManager)return false;
    const shops=[];
    for(const id of [...furniture.keys()].filter(key=>key.startsWith('shop-'))){
      const root=furniture.get(id),definition=layoutManager.definitions[id];
      if(!root||!definition)return false;
      shops.push({id,root,definition:JSON.parse(JSON.stringify(definition))});
      if(!layoutManager.unregisterFurniture(id,{relax:true}))return false;
    }
    if(!layoutManager.rebaseDefaults())return false;
    for(const {id,root,definition} of shops){
      let registered=false;
      for(const [x,z] of placementOrder(bounds,.65)){
        root.position.set(x,0,z);root.updateMatrixWorld(true);
        if(layoutManager.registerFurniture(id,root,definition)){registered=true;break;}
      }
      if(!registered)return false;
    }
    const result=economy.setLayout(layoutManager.snapshot());
    obstacles=layoutManager.obstacles;
    return result.ok&&layoutManager.validate().valid;
  }
  function purchaseFurniture(sku,requestId){return trade(()=>{
    const account=economy.getState(),product=SHOP_CATALOG.find(item=>item.sku===sku);
    if(!product)return tradeFailure('UNKNOWN_ITEM','这件家具暂未上架');
    if(account.owned.includes(sku))return economy.purchase(sku,{requestId});
    if(account.balance<product.price)return tradeFailure('INSUFFICIENT_POINTS','学习积分不足，完成学习后再来看看');
    const before=layoutManager.snapshot(),{root,definition}=createShopFurniture(sku,solidMaterial),id=root.name;
    scene.add(root);furniture.set(id,root);root.traverse(object=>{if(object.isMesh)object.layers.enable(1);});
    if(WATER_TARGETS[id]){root.userData.interaction='water';root.userData.waterTargetId=id;interactive.push(root);}
    let registered=false;
    // 先找到安全位置，再原子扣积分并写入布局；没有空位或保存失败都不扣分。
    // 候选点按“靠近墙壁优先”排序（placement.mjs），避免新家具挡在过道/视线中央。
    for(const [x,z] of placementOrder(bounds,.65)){
      root.position.set(x,0,z);root.updateMatrixWorld(true);
      if(layoutManager.registerFurniture(id,root,definition)){registered=true;break;}
    }
    if(!registered){discardShopItem(id,root);layoutManager.restore(before);return tradeFailure('NO_SPACE','房间里没有合适的空位，请整理家具或先扩建');}
    const result=economy.purchase(sku,{layout:layoutManager.snapshot(),requestId});
    if(!result.ok){discardShopItem(id,root);layoutManager.restore(before);}
    else {decoration.refresh();celebrateNewBadges();notify('furniture-purchased',{sku,id,balance:result.state.balance});if(!disposed)notify('layout-change',{purchased:id});}
    return result;
  });}
  function expandRoom(requestId){return trade(()=>{
    const account=economy.getState(),next=account.nextTier;
    // 对重复 requestId 交给账本重放，不能再次应用下一档房屋。
    if(requestId&&account.claims.requests.some(item=>item.id===requestId))return economy.expand({requestId});
    if(!next)return tradeFailure('MAX_LEVEL','房屋已经扩建到最高级');
    if(account.balance<next.price)return tradeFailure('INSUFFICIENT_POINTS','学习积分不足，完成学习后再来扩建');
    const previousTier=roomTier,previousBounds={...bounds},previousPlacement={...placementBounds};
    roomTier=next;applyRoomTier({furniture,width:next.width,depth:next.depth,bounds,placementBounds});
    const result=economy.expand({layout:layoutManager.snapshot(),requestId});
    if(!result.ok){roomTier=previousTier;applyRoomTier({furniture,width:roomTier.width,depth:roomTier.depth,bounds,placementBounds});Object.assign(bounds,previousBounds);Object.assign(placementBounds,previousPlacement);}
    else {layoutManager.refresh();celebrateNewBadges();notify('room-expanded',{level:roomTier.level,width:roomTier.width,depth:roomTier.depth,balance:result.state.balance});if(!disposed)notify('layout-change',{roomLevel:roomTier.level});}
    resize();return result;
  });}
  function creditLearning(event){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    const result=economy.creditLearning(event);
    if(result.ok){
      // 学习成果顺带累计到个人主页时长（每个新词约 20 分钟、每次复习约 10 分钟）。
      const learned=Number.isFinite(event?.learned)?event.learned:0,reviewed=Number.isFinite(event?.reviewed)?event.reviewed:0;
      if(learned||reviewed)profile.addStudyTime(learned*1200+reviewed*600);
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
  function levelInfo(level,xp){
    const reached=level>=20,next=reached?level:level+1;
    const floor=xpForLevel(level),need=xpNeededBetween(level)||1,intoLevel=Math.max(0,xp-floor);
    return {current:level,next,reached,intoLevel,need:reached?0:need,progress:need?Math.min(1,intoLevel/need):1};
  }
  function settleProfilePending(){profile.settlePending(input=>economy.reward(input));}
  function evaluateBadges(){return profile.evaluate(economy.getState(),localDate());}
  // 勋章解锁时让角色庆祝一下（无新勋章则不动，保持原行为）。
  function celebrateNewBadges(){const ev=evaluateBadges();if(ev?.unlocked?.length){try{actor?.pose?.setCelebrate?.(1);}catch{/* 纯增强，失败不影响交易 */}}}
  function getProfile(){
    if(disposed||lifecycle!=='ready')return {ok:false,code:'NOT_READY',message:'房间尚未就绪'};
    settleProfilePending();
    const awarded=profile.evaluate(economy.getState(),localDate());
    const p=profile.getState(),today=localDate(),yesterday=previousDay(today);
    const todayChecked=p.lastCheckIn===today;
    const tomorrowStreak=todayChecked?p.streakDays+1:(p.lastCheckIn===yesterday?p.streakDays+1:1);
    // 下一枚可量化的未解锁勋章（用于「还差 X」提示），不可量化或已全解锁返回 null。
    let nextBadgeHint=null;
    for(const item of BADGES){if(p.badges.includes(item.id))continue;const hint=badgeHint(item,p,economy.getState());if(hint){nextBadgeHint={id:item.id,name:item.name,hint};break;}}
    return {ok:true,profile:{
      gender:p.gender,name:p.name,xp:p.xp,level:p.level,levelName:levelName(p.level),
      totalStudySeconds:p.totalStudySeconds,streakDays:p.streakDays,totalCheckIns:p.totalCheckIns,lastCheckIn:p.lastCheckIn,
      todayChecked,
      todayReward:todayChecked?null:checkInReward(p.lastCheckIn===yesterday?p.streakDays+1:1),
      tomorrowReward:checkInReward(tomorrowStreak),
      calendar:buildMonthCalendar(p.checkInDates,today),
      checkInDates:p.checkInDates,
      stats:buildStats(p.checkInDates,today),
      nextBadgeHint,
      levelInfo:levelInfo(p.level,p.xp),
      badges:BADGES.map(item=>({id:item.id,name:item.name,description:item.description,category:item.category,unlocked:p.badges.includes(item.id),unlockedAt:p.badgeUnlockedAt?.[item.id]||null})),
      balance:economy.getState().balance,valid:p.valid,error:p.error,unlocked:awarded.unlocked||[],
      makeups:p.makeups||{month:null,count:0},makeupCost:MAKEUP_COST,
    }};
  }
  function checkIn(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    const result=profile.checkIn(localDate());
    let pointsSettled=true;
    if(result.ok&&!result.unchanged){
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
    if(economy.getState().balance<MAKEUP_COST)return {ok:false,code:'INSUFFICIENT_POINTS',message:`补签需要 ${MAKEUP_COST} 积分，积分不足`};
    const result=profile.makeUp(target,today);
    if(!result.ok)return result;
    // 幂等扣减：若写失败本次不扣，重试时会按 eventId 补扣（不重复扣两次）。
    const spent=economy.spend({eventId:`makeup:${target}`,points:MAKEUP_COST,reason:'profile'});
    const payload={...result,pointsApplied:spent.ok,cost:MAKEUP_COST,balance:spent.ok?spent.state.balance:economy.getState().balance};
    if(!spent.ok)return {...payload,message:`${result.message}；积分暂未扣除（${spent.code}），稍后会自动补扣`};
    notify('makeup-done',{date:target,count:result.count,balance:payload.balance});
    return payload;
  }
  function exportArchive(){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    return {ok:true,archive:buildArchive({profile:profile.getState(),economy:economy.getState()})};
  }
  function importArchive(json){
    if(disposed||lifecycle!=='ready')return tradeFailure('NOT_READY','房间尚未就绪');
    const verdict=parseArchive(json);
    if(!verdict.ok)return verdict;
    const adapter=options.storageAdapter===undefined?win.localStorage:options.storageAdapter;
    if(typeof adapter?.setItem!=='function')return {ok:false,code:'STORAGE_UNAVAILABLE',message:'当前环境没有可写的存储，无法导入'};
    try{
      adapter.setItem(storageKey+'-profile-v1',JSON.stringify(verdict.profile));
      adapter.setItem(storageKey+'-account-v1',JSON.stringify(verdict.economy));
    }catch{return {ok:false,code:'STORAGE_WRITE_FAILED',message:'写入存储失败，导入未生效'};}
    return {ok:true,message:'存档已写入本地，重新挂载（刷新页面）后生效',relaunchRequired:true,meta:verdict.meta};
  }
  const api={
    getState,getShop,getLayout:()=>layoutManager?.snapshot()||null,purchaseFurniture,expandRoom,creditLearning,
    getProfile,checkIn,makeUpCheckIn,exportArchive,importArchive,setProfileGender:gender=>profile.setGender(gender),
    setProfileName:name=>profile.setName(name),addStudyTime:seconds=>profile.addStudyTime(seconds),
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
    if(disposed)return;disposed=true;events.abort();loadAbort.abort();win.clearTimeout(initTimer);win.cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();intersectionObserver?.disconnect();keys.clear();down=null;clearClickTimer();hint.remove();
    decoration?.dispose();if(decorationReady){decorationReady(false);decorationReady=null;}
    releaseCharacter();disposer.tree(scene);disposer.release(gradient);renderer?.dispose();
    furniture.clear();interactive.length=0;materialCache.clear();actor=null;layoutManager=null;
    if(originalTabIndex===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',originalTabIndex);
    canvas.style.touchAction=originalTouchAction;canvas.style.cursor='';
    if(mountedRooms.get(canvas)===controller)mountedRooms.delete(canvas);
    if(!preserveError)lifecycle='disposed';notify('disposed');
  }
  function shouldRender(){return !disposed&&lifecycle==='ready'&&!doc.hidden&&canvasVisible;}
  function schedule(){if(shouldRender()&&!frameId)frameId=win.requestAnimationFrame(frame);}
  function frame(now){
    frameId=0;if(!shouldRender())return;
    const minInterval=1000/quality.maxFPS;
    if(lastRender&&now-lastRender<minInterval-.5){schedule();return;}
    const dt=Math.min(previous?(now-previous)/1000:0,.08);previous=now;lastRender=now;
    try {
      actor.update(dt,commerceBusy||decoration?.active||decoration?.pending?{x:0,z:0}:inputAxis());if(disposed)return;
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
      renderer.render(scene,camera);metricsFrames++;
      if(now-lastMetrics>=500){
        fps=metricsFrames*1000/Math.max(1,now-lastMetrics);metricsFrames=0;lastMetrics=now;
        if(fps<45)lowFpsStreak+=1;else lowFpsStreak=0;
        if(quality.profile!=='low'&&lowFpsStreak>=4)applyAutoDowngrade();
        updateStatus();
      }
      schedule();
    } catch(error){lastError={code:'RENDER_FAILED',message:String(error.message)};lifecycle='error';notify('error',lastError);dispose(true);}
  }
  function visibility(){
    releaseKeys();
    if(!shouldRender()){win.cancelAnimationFrame(frameId);frameId=0;}
    else {previous=0;lastRender=0;lastMetrics=win.performance.now();metricsFrames=0;schedule();}
  }
  // 低端设备自动降级（v2.7/batch1）：连续 4 个 500ms 采样帧率 < 45 时降一档，
  // 关闭阴影并把像素比降到 1；只降一次，通过 metrics.autoDowngraded 与事件暴露。
  function applyAutoDowngrade(){
    if(quality.autoDowngraded||disposed)return;
    quality.autoDowngraded=true;lowFpsStreak=0;
    try{
      renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,1));
      renderer.shadowMap.enabled=false;
      sun.shadow.mapSize.set(256,256);
    }catch{/* 降级是渐进增强，失败不回滚 */}
    notify('quality-downgrade',{from:quality.profile,to:'low',reason:'持续低帧率'});
  }
  async function initialize(){
    try {
      if(disposed)throw roomError('ABORTED','房间加载已取消');
      try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:quality.profile==='low'?'low-power':'default'});}
      catch(error){throw roomError('WEBGL_UNAVAILABLE','当前设备未能创建WebGL2场景',error);}
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
      initTimer=win.setTimeout(()=>{loadTimedOut=true;loadAbort.abort();},options.loadTimeoutMs||30000);
      const results=await Promise.allSettled(Object.entries(FURNITURE).map(([id,c])=>loadFurniture(id,c)));
      const failed=results.find(result=>result.status==='rejected');if(failed)throw loadFailure||failed.reason;
      if(disposed)throw roomError('ABORTED','房间加载已取消');
      lampRoot=furniture.get('lamp');sofaRoot=furniture.get('sofa');
      lampLight=new THREE.PointLight(0xffbd5d,3,4.5,2);lampLight.position.set(0,.59,0);lampLight.layers.set(1);lampRoot.add(lampLight);
      lampBulb=new THREE.Mesh(new THREE.SphereGeometry(.08,10,6),new THREE.MeshBasicMaterial({color:0xffdfa0}));lampBulb.position.set(0,.60,0);lampRoot.add(lampBulb);
      resolveSeat();
      const character=await waitForLoad(Promise.resolve().then(()=>characterFactory(options.characterOptions||{})),disposeCharacter);
      if(disposed){disposeCharacter(character);throw roomError('ABORTED','房间加载已取消');}
      if(!character?.model?.isObject3D||typeof character.pose?.update!=='function'||typeof character.pose?.sit!=='function'||typeof character.pose?.stand!=='function'||!Number.isFinite(character.pose.amount)||!Number.isFinite(character.pose.contactY)||character.pose.contactY<0||character.pose.contactY>1){
        disposeCharacter(character);throw roomError('INVALID_CHARACTER','角色工厂需提供model、动作函数及有效的amount/contactY');
      }
      actor=new PetActor(character);
      const accountStorage={
        getItem(key){const saved=economy.getLayout();if(saved)return JSON.stringify(saved);const storage=options.storageAdapter===undefined?win.localStorage:options.storageAdapter;return storage?.getItem(key)??null;},
        setItem(key,value){const result=economy.setLayout(JSON.parse(value));if(!result.ok)throw new Error(result.message);},
      };
      layoutManager=createLayoutManager({furniture,definitions:furnitureDefinitions,roomBounds:placementBounds,navigationBounds:bounds,
        storageKey,storageAdapter:accountStorage,
        petRadius:.48,petHeight:ROOM.petHeight,getPet:()=>({x:actor.ctrl.x,z:actor.ctrl.z}),
        setPet:point=>{actor.ctrl.stop();actor.ctrl.x=point.x;actor.ctrl.z=point.z;actor.root.position.set(point.x,.09,point.z);},
        getApproach:()=>({x:approachWorld.x,z:approachWorld.z}),
        getSeatApproaches:(currentObstacles,currentBounds)=>Object.keys(SEATS).map(id=>({id,point:resolveSeatApproach(furniture.get(id),id,{obstacles:currentObstacles,bounds:currentBounds,from:{x:actor.ctrl.x,z:actor.ctrl.z},petRadius:.48})})),
        afterUpdate:resolveSeat,onEvent:(type,detail)=>{if(!commerceBusy)notify(type,detail);}});
      layoutManager.refresh();obstacles=layoutManager.obstacles;
      const restored=options.restoreLayout!==false||initialAccount.owned.length?layoutManager.loadSaved():false;
      // 旧档与新碰撞/家具集合冲突时软恢复：卸下已购件按空位重摆，保留积分与产权，不阻断进房。
      if(initialAccount.owned.length&&!restored){
        if(!recoverOwnedLayout())throw roomError('ACCOUNT_LAYOUT_INVALID','账户家具布局无法恢复，请检查存档；积分和产权数据未被覆盖');
        notify('layout-recovered',{reason:'account-layout-rebuilt'});
      }
      if(disposed)throw roomError('ABORTED','房间加载已取消');
      const decorationOptions={canvas,scene,camera,furniture,manager:layoutManager,prepare:prepareDecoration,onEvent:notify,persistLayout};
      decoration=uiRoot?createDecoration({...decorationOptions,uiRoot}):createDecorationSession(decorationOptions);
      win.clearTimeout(initTimer);setLamp(true);if(disposed)throw roomError('ABORTED','房间加载已取消');resize();
      if(win.ResizeObserver){resizeObserver=new win.ResizeObserver(resize);resizeObserver.observe(canvas);}
      if(win.IntersectionObserver){intersectionObserver=new win.IntersectionObserver(entries=>{canvasVisible=entries[0]?.isIntersecting!==false;visibility();});intersectionObserver.observe(canvas);}
      lifecycle='ready';lastMetrics=win.performance.now();notify('ready',{character:character.metadata});
      if(disposed)throw roomError('ABORTED','房间加载已取消');schedule();return api;
    } catch(error){
      if(disposed)throw roomError('ABORTED','房间加载已取消',error);
      lastError={code:error.code||'INITIALIZATION_FAILED',message:error.message};lifecycle='error';notify('error',lastError);dispose(true);throw error;
    }
  }
  win.addEventListener('resize',resize,eventOptions);
  doc.addEventListener('visibilitychange',visibility,eventOptions);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(disposed)return;lifecycle='context-lost';visibility();notify('context-lost');},eventOptions);
  canvas.addEventListener('webglcontextrestored',()=>{if(disposed||!actor)return;lifecycle='ready';resize();visibility();notify('context-restored');},eventOptions);
  const controller={api,ready:null,dispose:()=>dispose(),version:'2.8.0',protocolVersion:1};mountedRooms.set(canvas,controller);
  if(options.signal){if(options.signal.aborted)dispose();else options.signal.addEventListener('abort',()=>dispose(),eventOptions);}
  controller.ready=initialize();controller.ready.catch(()=>{});return controller;
}
