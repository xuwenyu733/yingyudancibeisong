import {itemBaseSku} from './inventory-key.mjs';
import {activityChoice} from './activity-content.mjs';
import {Box3,Vector3} from './vendor/three/three.module.js';
import {createPath} from './navigation.mjs';
import {SEATS,resolveSeatApproach} from './seats.mjs';

export const furnitureActivityKind=value=>{const id=itemBaseSku(value);return id==='shop-reading-shelf'?'read':['table','shop-cloud-table'].includes(id)?'tea':id==='shop-star-lamp'?'light':id==='shop-rocket-toy'?'rocket':null;};
const labels={read:'翻开一本小故事',tea:'坐坐，喝杯茶',light:'看看小星灯',rocket:'启动小火箭'};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Pick a reachable position outside the target's actual, transformed footprint. */
export function planFurnitureActivity({target,from,bounds,obstacles=[],furniture=new Map(),kind,seatId}){
 if(!target?.isObject3D||!from||!bounds)return null;
 target.updateWorldMatrix(true,true);const box=new Box3().setFromObject(target);if(box.isEmpty())return null;const center=box.getCenter(new Vector3());
 const pathTo=p=>createPath(from,p,{bounds,obstacles,cellSize:.18});
 if(kind==='tea'){
  const seats=[...furniture].filter(([id,root])=>SEATS[id]&&root.parent&&(!seatId||id===seatId)).map(([id,root])=>({id,root,point:root.getWorldPosition(new Vector3())})).filter(x=>distance(x.point,center)<3.2).sort((a,b)=>distance(a.point,center)-distance(b.point,center));
  for(const seat of seats){const approach=resolveSeatApproach(seat.root,seat.id,{from,bounds,obstacles});if(approach)return {point:approach,center,seatId:seat.id,seat:seat.root};}
  if(seatId)return null;
 }
 const own=obstacles.filter(x=>x.id===target.name||typeof target.userData.furnitureId==='string'&&x.id===target.userData.furnitureId);
 const minX=own.length?Math.min(...own.map(x=>x.minX)):box.min.x-.48,maxX=own.length?Math.max(...own.map(x=>x.maxX)):box.max.x+.48,minZ=own.length?Math.min(...own.map(x=>x.minZ)):box.min.z-.48,maxZ=own.length?Math.max(...own.map(x=>x.maxZ)):box.max.z+.48;
 // A shelf beside another piece may need a little more standing room; expand the search without crossing furniture.
 for(const gap of [.08,.32,.65,1]){
  const candidates=[[(minX+maxX)/2,maxZ+gap],[(minX+maxX)/2,minZ-gap],[maxX+gap,(minZ+maxZ)/2],[minX-gap,(minZ+maxZ)/2]];
  for(const x of [minX-gap,maxX+gap])for(const z of [minZ-gap,maxZ+gap])candidates.push([x,z]);
  const choices=candidates.map(([x,z])=>({x,z})).filter(p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ&&!obstacles.some(o=>p.x>=o.minX&&p.x<=o.maxX&&p.z>=o.minZ&&p.z<=o.maxZ));choices.sort((a,b)=>distance(a,from)-distance(b,from));
  for(const point of choices)if(pathTo(point)!==null)return {point,center,seatId:null,seat:null};
 }
 return null;
}

/** One cancellable activity for the existing actor. Never moves furniture or changes inventory. */
export function createFurnitureActivities({getActor,getFurniture,getNavigation,isBlocked=()=>false,onStart=()=>{},onEnd=()=>{},onChange=()=>{},say=()=>{}}){
 let current=null,disposed=false;
 const snapshot=()=>current?{id:current.id,kind:current.kind,phase:current.phase,label:labels[current.kind],variant:current.choice?.id||null,elapsed:current.elapsed,seatId:current.plan.seatId}:null;
 const emit=()=>onChange(snapshot());
 const matrix=root=>{root.updateWorldMatrix(true,false);return root.matrixWorld.elements.slice();};
 const unchanged=(root,values)=>root?.parent&&matrix(root).every((x,i)=>Math.abs(x-values[i])<1e-7);
 function cancel(reason='cancelled'){
  const old=current;if(!old)return false;current=null;
  if(getActor()===old.actor){const a=old.actor;if(old.phase==='approach'){
    a.pendingPoint=null;a.pendingSeatId=null;a.pendingWater=false;a.desiredSeated=false;
    if(['walking','approaching'].includes(a.state)){a.ctrl.stop();a.path=[];a.seatId=null;a.setState('idle');}
    else if(['seated','sitting-down'].includes(a.state))a.standUp();
   }
  }
  onEnd(old,reason);emit();return true;
 }
 function start(id,options={}){
  if(disposed||isBlocked())return false;const kind=furnitureActivityKind(id),actor=getActor(),target=getFurniture().get(id);if(!kind||!actor||!target)return false;
  cancel('replaced');const from=['idle','walking','approaching','watering'].includes(actor.state)?{x:actor.ctrl.x,z:actor.ctrl.z}:actor.approachWorld;
  const plan=planFurnitureActivity({target,from,...getNavigation(),furniture:getFurniture(),kind,seatId:options.seatId});
  if(!plan){say('这里的通道有点挤，给伙伴留一点走路的位置吧。');return false;}
  const next={id,kind,choice:activityChoice(kind,options.variant),actor,target,plan,transform:matrix(target),seatTransform:plan.seat?matrix(plan.seat):null,phase:'approach',elapsed:0};
  if(plan.seatId){if(!(actor.state==='seated'&&actor.seatId===plan.seatId))actor.toggleSeat(plan.seatId);}
  else if(actor.walkTo(plan.point)===false){say('伙伴暂时走不到那里，调整一下家具再试吧。');return false;}
  current=next;say('伙伴正在走过去，准备'+labels[kind]+'。');emit();return true;
 }
 function frame(dt){
  if(disposed||!current||!Number.isFinite(dt)||dt<0)return;const c=current,a=getActor();
  if(isBlocked()||a!==c.actor||getFurniture().get(c.id)!==c.target||!unchanged(c.target,c.transform)||c.plan.seat&&(!unchanged(c.plan.seat,c.seatTransform)||getFurniture().get(c.plan.seatId)!==c.plan.seat)){cancel('changed');return;}
  c.elapsed+=dt;
  if(c.phase==='approach'){
   const arrived=c.plan.seatId?a.state==='seated'&&a.seatId===c.plan.seatId:a.state==='idle'&&distance(a.root.position,c.plan.point)<.18;
   if(arrived){c.phase='playing';c.elapsed=0;const yaw=Math.atan2(c.plan.center.x-a.root.position.x,c.plan.center.z-a.root.position.z);a.root.rotation.y=yaw;a.ctrl.yaw=a.ctrl.renderYaw=yaw;onStart(c);emit();}
   else if(c.elapsed>30||c.elapsed>.25&&a.state==='idle'){say('这次没走到合适的位置，可以再选一次。');cancel('unreachable');}
  }else if(!['idle','seated'].includes(a.state))cancel('interrupted');
  else if(c.elapsed>=6.5)cancel('complete');
 }
 return {start,cancel,frame,getState:snapshot,get active(){return !!current;},dispose(){cancel('disposed');disposed=true;}};
}
