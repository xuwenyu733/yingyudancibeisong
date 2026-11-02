import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROOM, FURNITURE, SOFA, PALETTE, COLLIDERS, PLACEMENT_BOUNDS } from './layout.js';
import { buildDecor } from './decor.js';
import { MovementController } from './movement.mjs';
import { createPath } from './navigation.mjs';
import { createPetPose } from './pet-pose.js';
import { createLayoutManager } from './layout-manager.js';
import { createDecoration } from './decoration.js';

const canvas=document.querySelector('#room');
const loading=document.querySelector('#loading');
const status=document.querySelector('#scene-status');
const events=new AbortController();const eventOptions={signal:events.signal};
const scene=new THREE.Scene(); scene.background=new THREE.Color(PALETTE.background);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
const camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,80);
camera.position.set(9,11.8,17); camera.lookAt(0,1.35,0);camera.updateMatrixWorld(true);
camera.layers.enable(1);
// 不挂OrbitControls：相机始终保持参考图的斜俯视角，触屏拖动也不会改变视角。
const hemi=new THREE.HemisphereLight(0xfff7df,0xe1b782,1.0); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffefd0,1.3); sun.position.set(-3,9,7); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-7; sun.shadow.camera.right=7;
sun.shadow.camera.top=7; sun.shadow.camera.bottom=-7; sun.shadow.normalBias=.035; sun.shadow.bias=-.00015;
sun.shadow.radius=4; scene.add(sun); sun.target.position.set(0,0,-1); scene.add(sun.target);

// 一维渐变带控制卡通明暗层级，仍保留GLB原有贴图；柔和光照保持原图的暖色。
const gradient=new THREE.DataTexture(new Uint8Array([132,180,217,255]),4,1,THREE.RedFormat);
gradient.minFilter=gradient.magFilter=THREE.NearestFilter; gradient.needsUpdate=true;
const materialCache=new Map();
function solidMaterial(color) {
  if(!materialCache.has(color)) materialCache.set(color,new THREE.MeshToonMaterial({color,gradientMap:gradient}));
  return materialCache.get(color);
}
const {floor,items:decor}=buildDecor(scene,solidMaterial);
scene.traverse(obj=>{if(obj.isMesh)obj.layers.enable(1);});
const furniture=new Map(decor); // 独立Object3D注册表，与uni-app侧家具ID对应。
const interactive=[];
const loader=new GLTFLoader();
let lampOn=true, actor=null, disposed=false;
let frameId=0;
let lampRoot, sofaRoot, lampLight, lampBulb, seatWorld, approachWorld;
const lampGlow={value:.22};
let obstacles=[];
let layoutManager=null,decoration=null,decorationReady=null;
const bounds={minX:-3.80,maxX:3.27,minZ:-3.48,maxZ:3.55};
const keys=new Set();
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.09);
const pointerTarget=new THREE.Vector3();

function notify(type,detail={}) {
  canvas.dispatchEvent(new CustomEvent('room-event',{bubbles:true,detail:{type,...detail}}));
  console.info(`[room] ${type}`,JSON.stringify(detail));
  if(window.uni?.postMessage) window.uni.postMessage({data:{type,...detail}});
  updateStatus();
}
function updateStatus() {
  if(!actor) return;
  status.textContent=JSON.stringify({ready:true,lampOn,petState:actor.state,desiredSeated:actor.desiredSeated,
    petPosition:actor.root.position.toArray().map(v=>+v.toFixed(3)),petYaw:+actor.root.rotation.y.toFixed(3),
    sitting:+actor.pose.amount.toFixed(3),poseStage:actor.pose.stage||'',seat:seatWorld?.toArray().map(v=>+v.toFixed(3)),
    decoration:decoration?.active||false,selected:decoration?.selected||null,
    furniture:layoutManager?layoutManager.snapshot().furniture:null,
    triangles:renderer.info.render.triangles});
  canvas.dataset.petState=actor.state; canvas.dataset.lampOn=String(lampOn);
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
  const gltf=await loader.loadAsync(config.url); const model=gltf.scene;
  toonModel(model,id==='lamp');
  const root=new THREE.Group(); root.name=id; root.userData.furnitureId=id;
  root.add(model); root.position.fromArray(config.position); root.rotation.fromArray(config.rotation);
  root.scale.setScalar(config.scale); scene.add(root); root.updateMatrixWorld(true);
  furniture.set(id,root);
  if(id==='sofa'||id==='lamp') { root.userData.interaction=id; interactive.push(root); }
  return root;
}
function setLamp(on) {
  lampOn=Boolean(on);
  if(lampLight) lampLight.intensity=lampOn?3.0:0;
  if(lampBulb) lampBulb.visible=lampOn;
  lampGlow.value=lampOn?.22:0;
  notify('lamp-change',{on:lampOn});
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
  constructor(model) {
    this.root=new THREE.Group(); this.root.name='pet'; scene.add(this.root); furniture.set('pet',this.root);
    this.gait=new THREE.Group(); this.root.add(this.gait);
    const facing=new THREE.Group(); facing.rotation.y=-Math.PI/2; facing.scale.setScalar(ROOM.petHeight); this.gait.add(facing); facing.add(model);
    this.pose=createPetPose(model);
    this.ctrl=new MovementController({speed:1.85,acceleration:5.2,braking:7.8,turnRate:6.8,bounds});
    this.ctrl.x=.65; this.ctrl.z=2.83; this.ctrl.yaw=this.ctrl.renderYaw=.15;
    this.root.position.set(this.ctrl.x,.09,this.ctrl.z); this.root.rotation.y=.15;
    this.state='idle'; this.desiredSeated=false; this.path=[]; this.pendingPoint=null;
    this.elapsed=0; this.phase=0; this.gaitWeight=0; this.transition=null;
    // 接触阴影只跟宠物走，不会在动画中锁在原地。
    const texCanvas=document.createElement('canvas');texCanvas.width=texCanvas.height=64;
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
  toggleSeat() {
    this.desiredSeated=!this.desiredSeated;
    this.pendingPoint=null;
    if(this.desiredSeated&&['idle','walking'].includes(this.state)) this.goToSofa();
    else if(!this.desiredSeated&&this.state==='approaching') {this.ctrl.stop();this.path=[];this.setState('idle');}
    else if(!this.desiredSeated&&this.state==='seated') this.standUp();
    updateStatus();
  }
  goToSofa() { if(!this.routeTo(approachWorld,'approaching'))this.desiredSeated=false; }
  walkTo(point) {
    if(insideObstacle(point.x,point.z))return;
    this.desiredSeated=false;
    if(!['idle','walking','approaching'].includes(this.state)) {
      this.pendingPoint={x:point.x,z:point.z}; if(this.state==='seated')this.standUp(); return;
    }
    this.pendingPoint=null; this.routeTo(point);
  }
  hop(on) {
    this.ctrl.stop(); this.path=[];
    const target=on?seatWorld.clone():approachWorld.clone();
    // 起跳/落座时有独立高度轨道，坐姿权重随后再压低臀部，始终接触坐垫。
    target.y=on?seatWorld.y+.008:.09;
    const front=new THREE.Vector3(1,0,0).transformDirection(sofaRoot.matrixWorld);
    const seatYaw=Math.atan2(front.x,front.z);
    this.transition={from:this.root.position.clone(),to:target,fromYaw:this.root.rotation.y,toYaw:on?seatYaw:seatYaw,duration:on?.82:.70,on};
    this.setState(on?'hopping-on':'hopping-off');
  }
  sitDown() { this.pose.sit();this.setState('sitting-down'); }
  standUp() { this.pose.stand();this.setState('standing-up'); }
  update(dt,axis) {
    this.elapsed+=dt; this.pose.update(dt);
    const mobile=['idle','walking','approaching'].includes(this.state);
    const keyboard=Math.hypot(axis.x,axis.z)>.01;
    if(mobile) {
      if(keyboard) {this.desiredSeated=false;this.path=[];if(this.state!=='walking')this.setState('walking');}
      const before={x:this.ctrl.x,z:this.ctrl.z}; this.ctrl.update(dt,axis);
      if(!clearSegment(before,{x:this.ctrl.x,z:this.ctrl.z})) {
        this.ctrl.x=before.x;this.ctrl.z=before.z;this.ctrl.stop();this.path=[];
        if(this.state==='approaching')this.desiredSeated=false;
        if(this.state!=='idle')this.setState('idle');
      }
      this.root.position.set(this.ctrl.x,.09,this.ctrl.z);this.root.rotation.y=this.ctrl.renderYaw;
      if(!keyboard&&!this.ctrl.target&&this.ctrl.currentSpeed===0) {
        if(this.path.length)this.nextWaypoint();
        else if(this.state==='approaching') {if(this.desiredSeated)this.hop(true);else this.setState('idle');}
        else if(this.state==='walking')this.setState('idle');
      }
    } else if(this.state==='hopping-on'||this.state==='hopping-off') {
      const tr=this.transition,t=Math.min(1,this.elapsed/tr.duration),s=smooth(t);
      this.root.position.lerpVectors(tr.from,tr.to,s);
      this.root.position.y+=Math.sin(Math.PI*t)*.43;
      this.root.rotation.y=angleLerp(tr.fromYaw,tr.toYaw,s);
      if(t===1) {
        if(tr.on) this.sitDown();
        else {
          this.ctrl.x=tr.to.x;this.ctrl.z=tr.to.z;this.ctrl.yaw=this.ctrl.renderYaw=tr.toYaw;
          this.setState('idle');
          if(this.desiredSeated)this.goToSofa();
          else if(this.pendingPoint){const p=this.pendingPoint;this.pendingPoint=null;this.walkTo(p);}
        }
      }
    } else if(this.state==='sitting-down'||this.state==='standing-up'||this.state==='seated') {
      this.root.position.copy(seatWorld);
      this.root.position.y+=.008-this.pose.contactY*ROOM.petHeight*this.pose.amount;
      if(this.state==='sitting-down'&&this.elapsed>=(this.pose.duration?.sit||.70)+.05) {this.setState('seated');if(!this.desiredSeated)this.standUp();}
      else if(this.state==='standing-up'&&this.elapsed>=(this.pose.duration?.stand||.55)+.05)this.hop(false);
    }
    // 按实际路程驱动起伏，停止时渐隐；脸的朝向始终来自实际位移方向。
    const weight=mobile?Math.min(1,this.ctrl.currentSpeed/this.ctrl.speed):0;
    this.gaitWeight=THREE.MathUtils.damp(this.gaitWeight,weight,12,dt);
    this.phase+=this.ctrl.stepDistance/1.10*Math.PI*2;
    this.gait.position.y=(.012+.009*(1-Math.cos(2*this.phase)))*this.gaitWeight;
    this.gait.rotation.z=Math.sin(this.phase)*.022*this.gaitWeight;
    this.gait.rotation.x=.016*this.gaitWeight;
    this.shadow.position.set(this.root.position.x,mobile?.077:seatWorld.y+.012,this.root.position.z);
    this.shadow.visible=!['hopping-on','hopping-off'].includes(this.state);
    this.shadow.scale.setScalar(mobile?1:.85);
  }
}

function resize() {
  const w=canvas.clientWidth,h=canvas.clientHeight; renderer.setSize(w,h,false);
  // 对房间固定包围盒作投影适配，竖屏手机与桌面均不裁掉家具。
  const view=new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const projected=new THREE.Box3();
  for(const x of [-4.7,4.7])for(const y of [-.4,5.40])for(const z of [-4.25,4.25])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(view));
  const center=projected.getCenter(new THREE.Vector3());
  const aspect=w/h;
  // 竖屏优先保留主要家具，房间地板的两个外角可出画；避免手机里整间房缩成小图标。
  const contentWidth=aspect<.75?9.5:(projected.max.x-projected.min.x)*1.06;
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
let down=null;
canvas.addEventListener('pointerdown',e=>{if(decoration?.active||decoration?.pending){down=null;return;}down={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.focus();},eventOptions);
canvas.addEventListener('pointerup',e=>{
  if(decoration?.active||decoration?.pending||!actor||!down||e.pointerId!==down.id)return;
  const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>8)return;
  aim(e);const picked=pickedFurniture();
  if(picked?.userData.interaction==='lamp')setLamp(!lampOn);
  else if(picked?.userData.interaction==='sofa')actor.toggleSeat();
  else if(raycaster.ray.intersectPlane(plane,pointerTarget))actor.walkTo(pointerTarget);
},eventOptions);
canvas.addEventListener('pointercancel',()=>{down=null;},eventOptions);
canvas.addEventListener('pointermove',e=>{if(decoration?.active||decoration?.pending)return;aim(e);canvas.style.cursor=pickedFurniture()?'pointer':'default';},eventOptions);
const controlKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'];
window.addEventListener('keydown',e=>{if(decoration?.active||decoration?.pending||e.target.matches?.('input,button,select,textarea'))return;if(controlKeys.includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&actor&&['walking','approaching'].includes(actor.state)){actor.desiredSeated=false;actor.ctrl.stop();actor.path=[];actor.setState('idle');}}},eventOptions);
window.addEventListener('keyup',e=>keys.delete(e.code),eventOptions);window.addEventListener('blur',()=>keys.clear(),eventOptions);
function inputAxis() {
  const x=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  const y=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
  // 按屏幕方向移动，而非直接映射世界XZ；斜等距相机下上下左右仍然直观。
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
  const down=new THREE.Vector3(-right.z,0,right.x);
  return {x:right.x*x+down.x*y,z:right.z*x+down.z*y};
}
function prepareDecoration() {
  keys.clear();down=null;if(!actor)return false;
  actor.desiredSeated=false;actor.pendingPoint=null;
  if(['walking','approaching'].includes(actor.state)){actor.ctrl.stop();actor.path=[];actor.setState('idle');}
  if(actor.state==='idle')return true;
  if(actor.state==='seated')actor.standUp();
  return new Promise(resolve=>{decorationReady=resolve;});
}

try {
  const loaded=await Promise.all(Object.entries(FURNITURE).map(async([id,c])=>[id,await loadFurniture(id,c)]));
  const map=new Map(loaded);lampRoot=map.get('lamp');sofaRoot=map.get('sofa');
  lampLight=new THREE.PointLight(0xffbd5d,3.0,4.5,2);lampLight.position.set(0,.59,0);lampRoot.add(lampLight);
  // 暖光只照房间的layer1；灯本体留在layer0，避免距离过近导致灯罩过曝。
  lampLight.layers.set(1);
  lampLight.castShadow=false; // GLB灯罩不透明；不让它挡住自己的暖光。
  lampBulb=new THREE.Mesh(new THREE.SphereGeometry(.08,12,8),new THREE.MeshBasicMaterial({color:0xffdfa0}));
  lampBulb.position.set(0,.60,0);lampRoot.add(lampBulb);
  resolveSeat();
  const petGLTF=await loader.loadAsync('./assets/pet.glb');toonModel(petGLTF.scene);actor=new PetActor(petGLTF.scene);
  layoutManager=createLayoutManager({furniture,definitions:COLLIDERS,roomBounds:PLACEMENT_BOUNDS,navigationBounds:bounds,
    // 独立调试存档，避免测试拖放影响用户正在布置的房间。
    storageKey:new URLSearchParams(location.search).get('preview')==='qa'?'hamster-room-layout-qa-v3':'hamster-room-layout-v3',
    petRadius:.48,petHeight:ROOM.petHeight,getPet:()=>({x:actor.ctrl.x,z:actor.ctrl.z}),
    setPet:point=>{actor.ctrl.stop();actor.ctrl.x=point.x;actor.ctrl.z=point.z;actor.root.position.set(point.x,.09,point.z);},
    getApproach:()=>({x:approachWorld.x,z:approachWorld.z}),afterUpdate:resolveSeat,onEvent:notify});
  layoutManager.refresh();obstacles=layoutManager.obstacles;layoutManager.loadSaved();
  decoration=createDecoration({canvas,scene,camera,furniture,manager:layoutManager,prepare:prepareDecoration,onEvent:notify});
  setLamp(true);resize();
  loading.style.opacity='0';setTimeout(()=>loading.remove(),450);
  // 模块尾部的桥接对象建立后再通知宿主，ready回调可立即调用接口。
  queueMicrotask(()=>{if(!disposed)notify('ready');});
} catch(error) {
  console.error(error);loading.classList.add('error');loading.textContent='房间加载失败。请通过 StartPreview.cmd 启动本地预览，勿直接双击HTML。详情见浏览器控制台。';
}
window.addEventListener('resize',resize,eventOptions);resize();
let previous=performance.now(),statusElapsed=0;
function frame(now) {
  if(disposed)return;
  const dt=Math.min((now-previous)/1000,.08);previous=now;
  if(actor&&!decoration?.active)actor.update(dt,decoration?.pending?{x:0,z:0}:inputAxis());
  if(decorationReady&&actor?.state==='idle'){const resolve=decorationReady;decorationReady=null;resolve(true);}
  renderer.render(scene,camera);statusElapsed+=dt;
  if(statusElapsed>.2){updateStatus();statusElapsed=0;}
  frameId=requestAnimationFrame(frame);
}
frameId=requestAnimationFrame(frame);

// uni-app WebView / renderjs可调用的薄桥接层。数据存储、积分、装修库存由APP负责。
// 不在前端认定积分交易成功；APP后端校验后再调用setFurnitureTransform展示结果。
const petTintBackup=new Map();
function setOutfitTint(tint) {
  if(!actor?.mesh&&!actor?.root)return false;
  const target=actor.gait||actor.root;
  let applied=false;
  target.traverse(obj=>{
    if(!obj.isMesh||!obj.material)return;
    for(const mat of Array.isArray(obj.material)?obj.material:[obj.material]){
      if(!mat?.color)continue;
      if(!petTintBackup.has(mat.uuid))petTintBackup.set(mat.uuid,{mat,color:mat.color.clone(),map:mat.map||null});
      if(!tint||tint==='default'){
        const backup=petTintBackup.get(mat.uuid);
        if(backup){mat.color.copy(backup.color);if('map' in mat)mat.map=backup.map;mat.needsUpdate=true;}
      }else{
        mat.color.set(tint);
        if(mat.map){mat.map=null;}
        mat.needsUpdate=true;
      }
      applied=true;
    }
  });
  notify('outfit-change',{tint:tint||'default'});
  return applied;
}

function applyHostAction(action) {
  if(!action||typeof action!=='object')return false;
  if(action.type==='furniture-transform'){
    return window.HamsterRoom.setFurnitureTransform(action.furnitureId,{
      position:action.position,rotation:action.rotation,scale:action.scale,
    });
  }
  if(action.type==='outfit'){
    if(!action.tint||action.outfitId==='default')return setOutfitTint('default');
    return setOutfitTint(action.tint);
  }
  if(action.type==='decor-flag'&&action.flag==='lampOn'){
    setLamp(Boolean(action.enabled));
    return true;
  }
  if(action.type==='set-lamp'){setLamp(Boolean(action.on));return true;}
  if(action.type==='ping'){notify('pong');return true;}
  return false;
}

function applyHostActions(actions=[]) {
  const results=[];
  for(const action of actions)results.push({action,ok:applyHostAction(action)});
  notify('host-actions-applied',{count:results.length,results});
  return results;
}

function readBootstrapActions() {
  try{
    const params=new URLSearchParams(location.search);
    const raw=params.get('bootstrap');
    if(!raw)return [];
    const data=JSON.parse(decodeURIComponent(raw));
    return Array.isArray(data?.actions)?data.actions:[];
  }catch{return [];}
}

function onHostMessage(event) {
  const data=event?.data;
  const payload=data?.data||data;
  if(!payload||typeof payload!=='object')return;
  if(payload.type==='apply-actions')applyHostActions(payload.actions||[]);
  else if(payload.type==='set-lamp')setLamp(Boolean(payload.on));
  else if(payload.type==='set-decoration-mode')window.HamsterRoom.setDecorationMode(Boolean(payload.enabled));
  else if(payload.actions)applyHostActions(payload.actions);
}

window.addEventListener('message',onHostMessage,eventOptions);
document.addEventListener('UniAppJSBridgeReady',()=>{
  try{window.uni?.getEnv?.(()=>{});}catch{/* ignore */}
},eventOptions);

window.HamsterRoom={
  setLamp,
  setOutfitTint,
  applyHostActions,
  toggleSofa:()=>{if(!decoration?.active&&!decoration?.pending)actor?.toggleSeat();},
  walkTo:(x,z)=>{if(!decoration?.active&&!decoration?.pending&&Number.isFinite(x)&&Number.isFinite(z))actor?.walkTo({x,z});},
  getFurniture:id=>furniture.get(id),
  setDecorationMode:enabled=>enabled?decoration?.enter():decoration?.exit(true),
  getLayout:()=>layoutManager?.snapshot(),
  setFurnitureCollider:(id,patch,index=0)=>{if(actor?.state!=='idle'||decoration?.dragging)return false;const result=layoutManager?.updateCollider(id,patch,index)||false;decoration?.refresh();return result;},
  setFurnitureTransform(id,{position,rotation,scale}={}) {
    if(!layoutManager||actor?.state!=='idle'||decoration?.dragging||disposed)return false;
    const before=layoutManager.snapshot();
    if(!layoutManager.previewTransform(id,{position,rotation,scale}))return false;
    const result=layoutManager.commit(before);decoration?.refresh();return result;
  },
  dispose() {
    if(disposed)return;disposed=true;events.abort();cancelAnimationFrame(frameId);keys.clear();
    decoration?.dispose();if(decorationReady)decorationReady(false);
    actor?.pose.dispose?.();
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);if(obj.material)for(const m of Array.isArray(obj.material)?obj.material:[obj.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());gradient.dispose();renderer.dispose();
    furniture.clear();interactive.length=0;actor=null;delete window.HamsterRoom;
  },
};

// 宿主通过 URL ?bootstrap= 注入已兑换装扮；房间 ready 后再应用，避免家具未加载。
queueMicrotask(()=>{
  const actions=readBootstrapActions();
  if(!actions.length)return;
  const tryApply=()=>{
    if(disposed)return;
    if(!layoutManager||!actor){setTimeout(tryApply,80);return;}
    applyHostActions(actions);
  };
  tryApply();
});
