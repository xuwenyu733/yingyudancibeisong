import * as THREE from './vendor/three/three.module.js';
import {createVisitorAvatar,visitorPet} from './visitor-avatar.mjs';

const FLOOR=.09,SPEED=1.65,MAX_CATCHUP=1.5,STEP=.05;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const time=v=>typeof v==='number'?v:Date.parse(v);
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const KINDS=new Set(['seat','sit','water','read','tea','light','lamp','star-lamp','rocket','greet']);

/** Transient public visitors. No account, inventory or furniture objects are changed. */
export function createVisitorScene({scene,doc,getSize,canStand=()=>true,reducedMotion=false,getOwner=()=>null,planPath,resolveAction,clock=Date.now,onAction=()=>{}}){
 const group=new THREE.Group();group.name='room-live-visitors';scene.add(group);
 const people=new Map();let disposed=false;
 function notify(phase,item,action=item.action){if(action)onAction(phase,action,item.guest);}
 function label(guest,pet){
  const canvas=doc.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');
  if(ctx){ctx.fillStyle='#fff9ed';ctx.fillRect(0,0,512,96);ctx.fillStyle='#4d675d';ctx.font='600 26px sans-serif';ctx.textAlign='center';ctx.fillText(`${Array.from(String(guest.name||'朋友')).slice(0,10).join('')} · ${pet.petName}`,256,60);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(1.85,.35,1);sprite.position.y=pet.growthStage==='adult'?1.8:1.65;return sprite;
 }
 function cancel(item,status='cancelled',reason=null){
  if(reason)item.lastFailure=reason;
  item.lastFrameAt=clock();
  if(item.action)notify(status,item);item.action=null;item.route=[];item.avatar.clear();item.phase='idle';item.queued=null;
  if(item.root.position.y>FLOOR+.05&&item.plan?.approach){item.exit={from:item.root.position.clone(),to:{...item.plan.approach,y:FLOOR},elapsed:0};item.phase='leaving-seat';}
  item.plan=null;
 }
 function remove(item){cancel(item);item.avatar.dispose();item.label.material.map.dispose();item.label.material.dispose();item.root.removeFromParent();}
 function create(guest,pet){
  const root=new THREE.Group();root.name='visitor-'+guest.publicId;root.userData.visitorId=guest.publicId;group.add(root);
  const sprite=label(guest,pet);root.add(sprite);return {root,label:sprite,avatar:createVisitorAvatar({root,scene,doc,pet,reducedMotion}),pet,guest,visual:JSON.stringify([pet,guest.name]),phase:'idle',action:null,lastActionId:null,route:[],exit:null,plan:null,lastFrameAt:clock()};
 }
 function changeAppearance(item,guest,pet){
  // Keep the same spatial actor, including a safe descent from a seat. Changing
  // a hat/name/species must not replay the canonical action or move the visitor.
  cancel(item);item.avatar.dispose();item.label.material.map.dispose();item.label.material.dispose();item.label.removeFromParent();
  item.avatar=createVisitorAvatar({root:item.root,scene,doc,pet,reducedMotion});item.label=label(guest,pet);item.root.add(item.label);item.pet=pet;item.visual=JSON.stringify([pet,guest.name]);
 }
 function safe(p,size){return Math.abs(p.x)<=size.width/2-.25&&Math.abs(p.z)<=size.depth/2-.25&&canStand(p.x,p.z);}
 function route(from,to,action,guest){
  if(planPath){const result=planPath({x:from.x,z:from.z},{x:to.x,z:to.z},action,guest);return Array.isArray(result)&&result.every(point)?result.map(p=>({x:p.x,z:p.z})):null;}
  // The fallback is intentionally conservative: never cross a blocked segment.
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.12));for(let i=1;i<=steps;i++)if(!canStand(from.x+(to.x-from.x)*i/steps,from.z+(to.z-from.z)*i/steps))return null;return [{x:to.x,z:to.z}];
 }
 function resolve(action,item){
  const from=item.root.position;if(resolveAction)return resolveAction(action,{x:from.x,z:from.z},item.guest);
  if(action.kind!=='greet')return null;const owner=getOwner(),facing=action.facing||action.position||owner?.position;if(!point(facing))return null;
  const approach=point(action.approach)?action.approach:{x:facing.x,z:facing.z+1};return {approach,facing,yaw:Math.atan2(facing.x-approach.x,facing.z-approach.z)};
 }
 function start(item,action){
  const now=clock();if(!action||typeof action.id!=='string'||!KINDS.has(action.kind)||!Number.isFinite(time(action.expiresAt))||time(action.expiresAt)<=now){if(item.action)cancel(item,'ended');return;}
  if(item.action?.id===action.id){item.action={...action};return;}
  if(item.lastActionId===action.id)return;
  cancel(item);item.lastFailure=null;item.lastActionId=action.id;item.action={...action};
  if(item.exit){item.queued=action;return;}
  const plan=resolve(action,item),path=plan&&point(plan.approach)?route(item.root.position,plan.approach,action,item.guest):null;
  if(!plan||!path){item.lastFailure=!plan?'target-unavailable':'route-unavailable';notify('failed',item);item.action=null;return;}
  item.plan=plan;item.route=path;item.phase='walking';notify('walking',item);
 }
 function set(input){
  if(disposed)return;const guests=[...new Map((Array.isArray(input)?input:[]).filter(g=>/^PET-[A-F0-9]{10}$/.test(g?.publicId)).map(g=>[g.publicId,g])).values()].sort((a,b)=>a.publicId.localeCompare(b.publicId)).slice(0,12),size=getSize();
  for(const[id,item]of people)if(!guests.some(g=>g.publicId===id)){remove(item);people.delete(id);}
  const used=[];
  for(const[index,guest]of guests.entries()){
   const pet=visitorPet(guest.pet);let item=people.get(guest.publicId);
   if(item&&item.visual!==JSON.stringify([pet,guest.name]))changeAppearance(item,guest,pet);
   if(!item){item=create(guest,pet);people.set(guest.publicId,item);}
   item.guest=guest;
   // Seat positions correctly lie inside the reserved furniture collider.
   const retained=(item.action||item.exit||item.placed)&&((item.phase==='playing'||item.phase==='seating'||item.exit)||safe(item.root.position,size));
   if(!retained){
    if(item.action)cancel(item);let p;
    for(let row=0;row<9&&!p;row++)for(let col=0;col<9;col++){const candidate={x:(col-4)*Math.min(.7,(size.width-1)/9),z:size.depth/2-.7-row*.65};if(safe(candidate,size)&&used.every(o=>Math.hypot(candidate.x-o.x,candidate.z-o.z)>.6)){p=candidate;break;}}
    p||={x:Math.max(-size.width/2+.3,Math.min(size.width/2-.3,(index-(guests.length-1)/2)*.55)),z:size.depth/2-.3};item.root.position.set(p.x,FLOOR,p.z);item.root.rotation.y=.25;item.placed=true;
   }
   used.push(item.root.position);if(!guest.action){if(item.action)cancel(item);}else start(item,guest.action);
  }
 }
 function arrive(item){
  const plan=item.plan;if(!plan)return;item.route=[];
  if((item.action.kind==='seat'||item.action.kind==='sit')&&point(plan.point)){item.phase='seating';item.transition={from:item.root.position.clone(),elapsed:0};return;}
  play(item);
 }
 function play(item){item.phase='playing';if(Number.isFinite(item.plan?.yaw))item.root.rotation.y=item.plan.yaw;item.avatar.play(item.action.kind);notify('playing',item);}
 function interpolate(item,transition,to,dt){transition.elapsed+=dt;const t=Math.min(1,transition.elapsed/.7),s=t*t*(3-2*t);item.root.position.set(THREE.MathUtils.lerp(transition.from.x,to.x,s),THREE.MathUtils.lerp(transition.from.y,to.y??FLOOR,s),THREE.MathUtils.lerp(transition.from.z,to.z,s));return t===1;}
 function advance(item,dt){
   if(item.action&&item.plan?.isValid&&!item.plan.isValid())cancel(item,'failed','target-changed');
   if(item.exit){if(interpolate(item,item.exit,item.exit.to,dt)){item.exit=null;item.phase='idle';if(item.queued){const action=item.queued;item.queued=null;item.lastActionId=null;item.action=null;start(item,action);}}}
   else if(item.phase==='walking'){
    let remaining=SPEED*dt;while(item.route.length&&remaining>0){const next=item.route[0],dx=next.x-item.root.position.x,dz=next.z-item.root.position.z,distance=Math.hypot(dx,dz),step=Math.min(distance,remaining);
     if(distance>0){const x=item.root.position.x+dx/distance*step,z=item.root.position.z+dz/distance*step;if(!canStand(x,z)){cancel(item,'failed','path-obstructed');break;}item.root.position.set(x,FLOOR,z);item.root.rotation.y=angle(item.root.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*9));}
     remaining-=step;if(distance<=step+.00001)item.route.shift();else break;
    }if(item.action&&!item.route.length)arrive(item);
   }else if(item.phase==='seating'&&interpolate(item,item.transition,item.plan.point,dt)){play(item);}
   item.avatar.frame(dt,{walking:item.phase==='walking',speed:item.phase==='walking'?SPEED:0});
   if(item.phase==='playing'&&['seat','sit'].includes(item.action?.kind)&&item.plan?.point)item.root.position.y=(item.plan.point.y??FLOOR)+.008-item.avatar.contactOffset;
 }
 function frame(dt){
  if(disposed||!Number.isFinite(dt)||dt<0)return;const now=clock();
  for(const item of people.values()){
   // Renderers cap their dt after a slow frame. Visual travel must still use the
   // real elapsed time, as the canonical action expires on the server clock.
   // A newly received/cancelled action starts its own clock, so idle time cannot
   // be applied to a fresh walk. Constant-clock tests retain their supplied dt.
   const elapsed=Number.isFinite(now-item.lastFrameAt)&&now>item.lastFrameAt?(now-item.lastFrameAt)/1000:dt;
   item.lastFrameAt=now;
   if(item.action&&time(item.action.expiresAt)<=now)cancel(item,'ended');
   let remaining=Math.min(MAX_CATCHUP,elapsed);
   while(remaining>1e-9){const step=Math.min(STEP,remaining);advance(item,step);remaining-=step;}
  }
 }
 return {set,frame,get count(){return people.size;},get active(){return [...people.values()].some(i=>i.action||i.exit);},getState(){return [...people.values()].map(i=>({publicId:i.guest.publicId,pet:structuredClone(i.pet),position:{x:i.root.position.x,y:i.root.position.y,z:i.root.position.z},yaw:i.root.rotation.y,phase:i.phase,actionId:i.action?.id||null,kind:i.action?.kind||null,lastFailure:i.lastFailure||null}));},dispose(){if(disposed)return;disposed=true;for(const item of people.values())remove(item);people.clear();group.removeFromParent();}};
}
