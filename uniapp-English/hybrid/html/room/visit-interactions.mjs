import {createPath} from './navigation.mjs';
import {SEATS,WATER_TARGETS,fitSeat,fitWater,resolveSeatApproach,resolveWaterApproach} from './seats.mjs';
import {planFurnitureActivity,furnitureActivityKind} from './furniture-activity.mjs';

/** Connect server-approved visitor intentions to the room's transient actors. */
export function createVisitInteractions({mode,getActor,getFurniture,getNavigation,getSeatWorld,getBusy,getVisitors,runLocal,stopLocal,applyOwnerPet,say=()=>{},schedule=()=>{},greetOwner=()=>{},effect=()=>{}}){
 let role=mode?.role||'host',transport=null,disposed=false,busy=false,generation=0,requestSerial=0,cancelling=null,pendingCancel=null,snapshot=null,ownerAction=null,greeting=null;
 const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 const nav=()=>getNavigation(),route=(from,to)=>createPath(from,to,{...nav(),cellSize:.18});
 const ownerState=()=>{const a=getActor();return {position:{x:a?.root.position.x||0,z:a?.root.position.z||0},yaw:a?.root.rotation.y||0,busy:!!getBusy(),seatId:a?.desiredSeated?a.seatId:null};};
 function path(from,to,action){const navigation=nav(),center=action?.facing||snapshot?.owner?.position||getActor()?.root.position;return createPath(from,to,{...navigation,cellSize:.18,obstacles:[...navigation.obstacles||[],...(action?.kind==='greet'&&finite(center)?[{minX:center.x-.6,maxX:center.x+.6,minZ:center.z-.6,maxZ:center.z+.6}]:[])]});}
 function planAction(action,from){
  if(!action||!finite(from))return null;const a=getActor(),navigation=nav(),furniture=getFurniture();
  if(action.kind==='greet'){
   if(!a?.root.visible)return null;const center=action.facing||action.position||snapshot?.owner?.position||a.root.position;if(!finite(center))return null;
   if(finite(action.approach))return path(from,action.approach,action)?{kind:'greet',approach:action.approach,point:{...action.approach,y:.09},yaw:Math.atan2(center.x-action.approach.x,center.z-action.approach.z),targetId:'pet'}:null;
   const choices=Array.from({length:12},(_,i)=>{const angle=i*Math.PI/6;return {x:center.x+Math.sin(angle)*1.05,z:center.z+Math.cos(angle)*1.05};}).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z));
   for(const point of choices)if(path(from,point,{...action,facing:center}))return {kind:'greet',approach:point,point:{...point,y:.09},yaw:Math.atan2(center.x-point.x,center.z-point.z),targetId:'pet'};
   return null;
  }
  const target=furniture.get(action.targetId);if(!target?.parent)return null;
  if(['seat','sit'].includes(action.kind)&&SEATS[action.targetId]){const fit=fitSeat(target,action.targetId),approach=resolveSeatApproach(target,action.targetId,{...navigation,from});if(!fit||!approach)return null;const point=fit.seatWorld||getSeatWorld(action.targetId);return point?{kind:action.kind,approach,point:{x:point.x,y:point.y,z:point.z},yaw:fit.seatYaw,targetId:action.targetId}:null;}
  if(action.kind==='water'&&WATER_TARGETS[action.targetId]){const fit=fitWater(target,action.targetId),approach=resolveWaterApproach(target,action.targetId,{...navigation,from});return fit&&approach?{kind:'water',approach,point:{...approach,y:.09},yaw:fit.facingYaw,targetId:action.targetId}:null;}
  // Guest tea is a standing activity. It does not borrow an unreserved seat.
  const plan=planFurnitureActivity({target,from,...navigation,furniture,kind:'read'});if(!plan)return null;
  return {kind:action.kind,approach:plan.point,point:{...plan.point,y:.09},yaw:Math.atan2(plan.center.x-plan.point.x,plan.center.z-plan.point.z),targetId:action.targetId};
 }
 function resolveAction(action,from){
  const plan=planAction(action,from);if(!plan)return null;
  if(action.kind==='greet'){const owner=getActor(),position=action.facing||owner?.root.position,center={x:position.x,z:position.z};plan.isValid=()=>owner===getActor()&&!!owner?.root.visible&&Math.hypot(owner.root.position.x-center.x,owner.root.position.z-center.z)<.8;}
  else {const target=getFurniture().get(action.targetId);target.updateWorldMatrix(true,false);const matrix=target.matrixWorld.elements.slice();plan.isValid=()=>{if(getFurniture().get(action.targetId)!==target||!target.parent)return false;target.updateWorldMatrix(true,false);return matrix.every((n,i)=>Math.abs(n-target.matrixWorld.elements[i])<1e-7);};}
  return plan;
 }
 function apply(next){
  if(disposed||!next)return false;snapshot=next;
  getVisitors()?.set(Array.isArray(next.visitors)?next.visitors:[]);
  if(role==='host'){
   const action=next.owner?.action;
   if(!busy&&action&&action.kind!=='greet'&&action.id!==ownerAction){ownerAction=action.id;const a=getActor(),alreadySeated=['seat','sit'].includes(action.kind)&&a?.desiredSeated&&a.seatId===action.targetId;if(!alreadySeated&&!runLocal(action.targetId,{variant:action.variant,seatId:action.seatId}))cancel();}
   else if(!action&&ownerAction){ownerAction=null;stopLocal();}
  }
  if(role==='guest'&&!next.owner&&ownerAction){ownerAction=null;stopLocal();}
  if(role==='guest'&&next.owner){
   const a=getActor(),owner=next.owner;if(owner.pet)applyOwnerPet(owner.pet);
   if(a){a.root.visible=!owner.roomId||!mode?.roomId||owner.roomId===mode.roomId;a.shadow.visible=a.root.visible;
    const action=owner.action;if(action?.id!==ownerAction){const alreadySeated=['seat','sit'].includes(action?.kind)&&a.desiredSeated&&a.seatId===action.targetId;if(ownerAction&&!alreadySeated)stopLocal();ownerAction=action?.id||null;if(action&&action.kind!=='greet'&&!alreadySeated)runLocal(action.targetId,{variant:action.variant,seatId:action.seatId});}
    if(!owner.seatId&&!action&&a.desiredSeated){a.desiredSeated=false;a.pendingSeatId=null;a.standUp();}
    if(!owner.seatId&&!action&&finite(owner.position)&&Math.hypot(a.ctrl.x-owner.position.x,a.ctrl.z-owner.position.z)>.2)a.walkTo(owner.position);
    if(owner.seatId&&SEATS[owner.seatId]&&a.seatId!==owner.seatId)a.toggleSeat(owner.seatId,{guided:false});
   }
  }
  schedule();return true;
 }
 async function request(intent){
  if(cancelling)await cancelling;
  if(disposed||!transport||busy)return false;busy=true;const serial=generation,token=++requestSerial;
  try{
   const next=await transport(intent);if(disposed||serial!==generation)return false;if(next?.ok===false){say(next.message||'这次互动没有开始');return false;}
   apply(next);
   if(role==='host'&&intent.type==='furniture'){ownerAction=next?.owner?.action?.id||null;const started=runLocal(intent.targetId,{variant:next?.owner?.action?.variant||intent.variant,seatId:next?.owner?.action?.seatId});if(!started){const actionId=ownerAction;ownerAction=null;await transport({type:'cancel',...(actionId?{actionId}:{})});say('这里暂时走不到，给伙伴留一点通道再试吧');}return started;}
   return true;
  }catch(error){if(!disposed)say(error.message||'互动暂时未连接，请再试一次');return false;}
  finally{if(token===requestSerial){busy=false;if(pendingCancel){const actionId=pendingCancel;pendingCancel=null;void request({type:'cancel',actionId});}}}
 }
 function furniture(id,options={}){
  if(!transport)return null;const intent={type:'furniture',targetId:id,...options.variant?{variant:options.variant}:{}};
  const a=getActor();if(role==='host'&&furnitureActivityKind(id)==='tea'&&a){const plan=planFurnitureActivity({target:getFurniture().get(id),from:a.root.position,...nav(),furniture:getFurniture(),kind:'tea'});if(plan?.seatId)intent.seatId=plan.seatId;}
  return request(intent);
 }
 function cancel(){
  if(disposed)return;const needsCancel=busy||greeting||snapshot?.owner?.action;greeting=null;greetOwner(null);if(role==='guest'||!transport||!needsCancel)return;
  // Invalidating pending replies prevents a delayed reservation from stealing input.
  generation++;requestSerial++;busy=false;const actionId=snapshot?.owner?.action?.id;const task=Promise.resolve(transport({type:'cancel',...(actionId?{actionId}:{})})).catch(()=>{});cancelling=task;void task.finally(()=>{if(cancelling===task)cancelling=null;});
 }
 function actionEvent(phase,action,guest){
  if(disposed)return;
  effect(phase,action,guest);
  if(action?.kind==='greet'){
   if(phase==='playing'){greeting=action.id;greetOwner(guest);}
   else if(greeting===action.id&&['complete','cancelled','failed','ended','cancel'].includes(phase)){greeting=null;greetOwner(null);}
  }
  if(phase==='failed'&&role==='guest'&&guest?.publicId===mode?.selfPublicId){if(busy)pendingCancel=action?.id;else void request({type:'cancel',actionId:action?.id});}
 }
 return {apply,resolveAction,path,furniture,request,cancel,actionEvent,ownerState,get role(){return role;},get enabled(){return !!transport;},setTransport(fn,settings={}){if(disposed)return false;if(transport!==fn){generation++;transport=typeof fn==='function'?fn:null;}role=settings.role||mode?.role||'host';return true;},dispose(){disposed=true;generation++;transport=null;snapshot=null;greetOwner(null);}};
}
