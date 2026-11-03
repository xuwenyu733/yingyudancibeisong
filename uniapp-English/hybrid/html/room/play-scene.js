import {createPetCharacter} from './characters/pet-models.js';
import {createPath} from './navigation.mjs';
import {petNavigationBounds} from './pet-boundary.mjs';
import {BALL_RADIUS,advanceBall,petRegionFor} from './play-physics.mjs';

/** Scene-only play props. Persisted learning IDs remain the source of truth for books. */
export function createPlayScene({THREE,scene,doc,getActor,getSize,getObstacles=()=>[],getFurniture=()=>new Map(),canVisit=()=>true,reducedMotion=false,onEvent=()=>{}}){
  const world=new THREE.Group();world.name='play-world';scene.add(world);
  const resources=new Set(),books=new Map(),pivots=new Map();
  const buddy=createPetCharacter('cloud-bunny'),buddyRoot=new THREE.Group(),buddyFacing=new THREE.Group();
  buddyRoot.name='play-buddy';buddyRoot.userData.playKind='buddy';buddyRoot.add(buddyFacing);buddyFacing.add(buddy.model);world.add(buddyRoot);
  const shelf=new THREE.Group(),bookRoot=new THREE.Group(),ballRoot=new THREE.Group();shelf.name='play-bookshelf';shelf.userData.playKind='bookshelf';shelf.add(bookRoot);world.add(shelf);
  ballRoot.name='play-ball';ballRoot.userData.playKind='ball';world.add(ballRoot);
  const ball={x:0,y:BALL_RADIUS+.09,z:0,vx:0,vy:0,vz:0};
  let disposed=false,initialized=false,knownEvents=null,sizeKey='',elapsed=0,buddyRoute=[],routeTimer=0,buddyMode='follow',playUntil=0,lastBuddyKick=-9,pendingKick=null,kick=null,touch=null,primaryModel=null,buddyCelebration=0;
  function emit(type,detail){try{onEvent(type,detail);}catch{/* A host observer cannot undo the animation. */}}
  function material(color,extra={}){const mat=new THREE.MeshLambertMaterial({color,...extra});resources.add(mat);return mat;}
  function mesh(geometry,color,x=0,y=0,z=0,parent=world){resources.add(geometry);const node=new THREE.Mesh(geometry,material(color));node.position.set(x,y,z);node.castShadow=true;node.receiveShadow=true;node.layers.enable(1);parent.add(node);return node;}
  function label(value,width=2.05,height=.28){
    const canvas=doc?.createElement('canvas'),ctx=canvas?.getContext('2d');if(!ctx)return null;
    canvas.width=768;canvas.height=128;ctx.clearRect?.(0,0,768,128);ctx.fillStyle='#fff7e1';ctx.fillRect?.(0,0,768,128);ctx.fillStyle='#635542';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 46px system-ui,sans-serif';ctx.fillText(value,384,66,745);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;resources.add(tex);const geo=new THREE.PlaneGeometry(width,height),mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide});resources.add(geo);resources.add(mat);const node=new THREE.Mesh(geo,mat);node.layers.enable(1);return node;
  }
  // A genuine wooden wall shelf, above the walking clearance so it never blocks pets.
  mesh(new THREE.BoxGeometry(2.25,1.53,.10),0xe8d6b6,0,.765,-.12,shelf);
  for(const x of [-1.15,1.15])mesh(new THREE.BoxGeometry(.12,1.65,.46),0xb88e64,x,.79,.02,shelf);
  for(const y of [0,.76,1.56])mesh(new THREE.BoxGeometry(2.42,.10,.48),0xc6a174,0,y,.04,shelf);
  const shelfSign=label('学习书架 · 每次新学习长出一本书');if(shelfSign){shelfSign.position.set(0,1.78,.03);shelf.add(shelfSign);}
  const ballMesh=mesh(new THREE.SphereGeometry(BALL_RADIUS,24,16),0xfff8e7,0,0,0,ballRoot);
  for(let i=0;i<3;i++){
    const stripe=mesh(new THREE.TorusGeometry(BALL_RADIUS*.99,.027,6,40),[0x8ec8bb,0xf1b58a,0xb9a2d9][i],0,0,0,ballRoot);stripe.rotation.set(i===1?Math.PI/2:0,i===2?Math.PI/2:0,0);
  }
  const shadowGeometry=new THREE.CircleGeometry(.30,24);resources.add(shadowGeometry);const shadowMaterial=new THREE.MeshBasicMaterial({color:0x826f55,opacity:.13,transparent:true,depthWrite:false});resources.add(shadowMaterial);
  const ballShadow=new THREE.Mesh(shadowGeometry,shadowMaterial);ballShadow.rotation.x=-Math.PI/2;ballShadow.position.y=.095;world.add(ballShadow);
  const buddyShadow=new THREE.Mesh(shadowGeometry,shadowMaterial);buddyShadow.rotation.x=-Math.PI/2;buddyShadow.position.y=.095;buddyShadow.scale.setScalar(1.4);world.add(buddyShadow);
  const buddyLabel=label('绒绒 · 点我一起踢球',1.55,.22);if(buddyLabel){buddyLabel.position.y=1.2;buddyRoot.add(buddyLabel);}
  function navBounds(){const size=getSize();return petNavigationBounds(size.width,size.depth);}
  function valid(point){const bounds=navBounds();return point.x>=bounds.minX&&point.x<=bounds.maxX&&point.z>=bounds.minZ&&point.z<=bounds.maxZ&&canVisit(point);}
  function nearestFree(origin,spacing=.65){
    if(valid(origin))return {...origin};
    const bounds=navBounds();for(let ring=1;ring<12;ring++)for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:Math.max(bounds.minX,Math.min(bounds.maxX,origin.x+Math.sin(a)*ring*spacing)),z:Math.max(bounds.minZ,Math.min(bounds.maxZ,origin.z+Math.cos(a)*ring*spacing))};if(valid(p))return p;}
    return null;
  }
  function updateSize(){
    const size=getSize(),key=[size.width,size.depth].join(':');if(key===sizeKey&&initialized)return;sizeKey=key;
    shelf.position.set(size.width/2-1.65,1.58,-size.depth/2+.34);
    const scale=getActor()?.facing?.scale?.x||1;buddyFacing.scale.setScalar(scale*.9);
    if(!initialized){const actor=getActor(),base=actor?.root?.position||{x:0,z:1};const p=nearestFree({x:base.x-1.35,z:base.z-.4}),b=nearestFree({x:base.x+.9,z:base.z-.5});if(p)buddyRoot.position.set(p.x,.09,p.z);if(b){ball.x=b.x;ball.z=b.z;}initialized=!!actor;}
    else{for(const target of [buddyRoot.position,ball])if(!valid(target)){const next=nearestFree(target);if(next){target.x=next.x;target.z=next.z;}}buddyRoute=[];}
  }
  function releaseTree(root){root.traverse(node=>{for(const resource of [node.geometry,...(Array.isArray(node.material)?node.material:[node.material])])if(resource&&resources.delete(resource))resource.dispose();});root.removeFromParent();}
  function book(eventId,index,animate){
    const group=new THREE.Group();group.name=`learning-book-${index}`;group.userData.learningEvent=eventId;
    const color=[0x96c8b5,0xeab4aa,0xc5b0d7,0xeacb83,0x93b8d6][index%5],w=.105+(index%3)*.012,h=.39+(index%4)*.04;
    mesh(new THREE.BoxGeometry(w,h,.25),color,0,h/2,0,group);mesh(new THREE.BoxGeometry(w*.64,h*.84,.255),0xfff1dc,.002,h/2,.006,group);
    mesh(new THREE.BoxGeometry(w+.014,h+.025,.025),color,0,h/2,.143,group);mesh(new THREE.BoxGeometry(w*.72,.022,.015),0xffedb5,0,h*.67,.161,group);
    const slot=index%32,row=Math.floor(slot/16),x=-1.03+(slot%16)*.133,y=.06+row*.76;group.position.set(x,y,.06);bookRoot.add(group);books.set(eventId,{group,index,x,y,t:animate?0:1});
  }
  function sync(companion={}){
    if(disposed)return;updateSize();ballRoot.position.set(ball.x,ball.y,ball.z);ballShadow.position.set(ball.x,.095,ball.z);buddyShadow.position.set(buddyRoot.position.x,.095,buddyRoot.position.z);
    const events=[...new Set(companion.learningEvents||[])].filter(id=>typeof id==='string'),visible=events.slice(-32),fresh=knownEvents!==null;
    for(const [id,value]of books)if(!visible.includes(id)){releaseTree(value.group);books.delete(id);}
    visible.forEach((id,index)=>{if(!books.has(id))book(id,index,fresh&&!knownEvents.has(id));else{const value=books.get(id);value.index=index;value.x=-1.03+(index%16)*.133;value.y=.06+Math.floor(index/16)*.76;}});
    if(fresh&&events.some(id=>!knownEvents.has(id)))emit('learning-book-spawned',{count:events.length});knownEvents=new Set(events);
  }
  function findHit(raycaster){
    scene.updateMatrixWorld(true);const actor=getActor(),obscurers=[...getFurniture().values()].filter(root=>root!==actor?.root),targets=[world,actor?.root,...obscurers].filter(Boolean);
    const hit=raycaster.intersectObjects(targets,true).find(item=>{let node=item.object;while(node){if(node.visible===false)return false;node=node.parent;}return true;});if(!hit)return null;
    for(let node=hit.object;node;node=node.parent){if(node===actor?.root)return {kind:'primary',...hit};if(node.userData.playKind)return {kind:node.userData.playKind,...hit};}
    return null;
  }
  function pivotFor(joint){
    if(!joint)return null;if(pivots.has(joint))return pivots.get(joint);const pivot=new THREE.Group();pivot.name='play-reaction-pivot';for(const child of [...joint.children])pivot.add(child);joint.add(pivot);pivots.set(joint,pivot);return pivot;
  }
  function resetPivots(){for(const pivot of pivots.values()){pivot.rotation.set(0,0,0);pivot.position.set(0,0,0);}}
  function unwrapPrimary(){for(const [joint,pivot]of pivots){if(buddy.model.getObjectById(joint.id))continue;for(const child of [...pivot.children])joint.add(child);pivot.removeFromParent();pivots.delete(joint);}}
  function partJoint(model,region){const regex={head:/(?:^|_)Head$/,tail:/Tail(?:_Base)?$/,paws:/Shoulder_R$/,kick:/(?:Hip|FootJoint|Foot)_R$/,body:/(?:Spine|Torso)$/}[region];let found=null;model?.traverse(node=>{if(!found&&node.isGroup&&regex.test(node.name))found=node;});if(found&&!found.children.length&&region==='head')return partJoint(model,'body');return found||model;}
  function react(model,region){if(reducedMotion)return;touch={model,region,t:0,pivot:pivotFor(partJoint(model,region))};}
  function kickBall(from,isBuddy=false){
    const dx=ball.x-from.x,dz=ball.z-from.z,len=Math.hypot(dx,dz)||1;ball.vx=dx/len*3.3;ball.vz=dz/len*3.3;ball.vy=reducedMotion?0:1.8;
    const actor=getActor(),model=isBuddy?buddy.model:actor?.character?.model;
    if(!reducedMotion&&model)kick={t:0,pivot:pivotFor(partJoint(model,'kick'))};
    if(!isBuddy&&actor){const yaw=Math.atan2(dx,dz);actor.root.rotation.y=yaw;if(actor.ctrl){actor.ctrl.yaw=yaw;actor.ctrl.renderYaw=yaw;}}
    buddyMode='play';if(!isBuddy)playUntil=elapsed+12;emit('ball-kicked',{by:isBuddy?'buddy':'primary'});
  }
  function requestKick(){
    const actor=getActor();if(!actor?.root)return {handled:true,kind:'ball',message:'伙伴还在准备小脚丫～'};
    const p=actor.root.position,dx=p.x-ball.x,dz=p.z-ball.z,len=Math.hypot(dx,dz);
    if(len<=1.05&&['idle','walking'].includes(actor.state)){kickBall(p);pendingKick=null;return {handled:true,kind:'ball',message:'嘿！把球传给绒绒，一起来玩～'};}
    const target=nearestFree({x:ball.x+(len?dx/len:0)*.72,z:ball.z+(len?dz/len:1)*.72},.28);
    if(target&&actor.walkTo?.(target)!==false){pendingKick={until:elapsed+9};return {handled:true,kind:'ball',message:'等我走到球旁边，再抬脚踢出去～'};}
    return {handled:true,kind:'ball',message:'球旁边有点挤，先给伙伴留一条通道吧～'};
  }
  function leadBuddy(point){
    if(disposed||!Number.isFinite(point?.x)||!Number.isFinite(point?.z)||!valid(point))return false;
    const actor=getActor();if(actor?.root&&Math.hypot(point.x-actor.root.position.x,point.z-actor.root.position.z)<.75)return false;
    const route=createPath(buddyRoot.position,point,{bounds:navBounds(),obstacles:getObstacles(),cellSize:.22});if(!route)return false;
    buddyRoute=route;buddyMode='lead';playUntil=elapsed+12;return true;
  }
  function interact(raycaster){
    if(disposed)return {handled:false};const hit=findHit(raycaster);if(!hit)return {handled:false};
    if(hit.kind==='ball')return requestKick();
    if(hit.kind==='bookshelf')return {handled:true,kind:'bookshelf',message:`书架已经有 ${knownEvents?.size||0} 本学习纪念书啦！每完成一次新的学习，就会长出一本新书。`};
    const isBuddy=hit.kind==='buddy',model=isBuddy?buddy.model:getActor()?.character?.model,region=petRegionFor(hit.object,model);react(model,region);
    if(isBuddy){buddyMode='play';playUntil=elapsed+12;routeTimer=0;buddyCelebration=1;if(!reducedMotion){buddy.pose.setCelebrate?.(1);getActor()?.pose?.setCelebrate?.(1);}emit('pets-interacted',{kind:'greeting'});}
    emit('pet-region-touched',{pet:isBuddy?'buddy':'primary',region});
    const lines={head:'摸摸小脑袋，耳朵开心地晃了晃～',body:'肚皮软绵绵的，给你一个暖暖的抱抱！',paws:'小爪子和你击掌啦！',tail:'尾巴轻轻摇一摇，喜欢你温柔地摸摸～'};
    return {handled:true,kind:hit.kind,region,message:isBuddy?'绒绒来啦！我会跟着伙伴散步，也会把球踢回来～':lines[region]};
  }
  function updateBuddy(dt){
    const actor=getActor(),p=buddyRoot.position;let moved=0;routeTimer-=dt;
    if(buddyMode==='lead'&&elapsed>playUntil){buddyMode='follow';buddyRoute=[];}
    if(buddyMode==='play'&&elapsed>playUntil)buddyMode='follow';
    if(routeTimer<=0&&buddyMode!=='lead'){
      routeTimer=.7;let target=null;
      if(buddyMode==='play'&&Math.hypot(ball.vx,ball.vz)<1.1&&elapsed-lastBuddyKick>2){const dx=p.x-ball.x,dz=p.z-ball.z,len=Math.hypot(dx,dz)||1;target=nearestFree({x:ball.x+dx/len*.68,z:ball.z+dz/len*.68},.3);}
      else if(actor?.root&&Math.hypot(p.x-actor.root.position.x,p.z-actor.root.position.z)>1.8){const a=actor.root.rotation.y;target=nearestFree({x:actor.root.position.x-Math.sin(a)*1.3-Math.cos(a)*.5,z:actor.root.position.z-Math.cos(a)*1.3+Math.sin(a)*.5},.35);}
      if(target)buddyRoute=createPath(p,target,{bounds:navBounds(),obstacles:getObstacles(),cellSize:.24})||[];
    }
    const point=buddyRoute[0];if(point){const dx=point.x-p.x,dz=point.z-p.z,len=Math.hypot(dx,dz),step=Math.min(len,dt*.95),candidate={x:p.x+(len?dx/len:0)*step,z:p.z+(len?dz/len:0)*step};
      const primaryClear=!actor?.root||Math.hypot(candidate.x-actor.root.position.x,candidate.z-actor.root.position.z)>.76;
      if(valid(candidate)&&primaryClear){p.x=candidate.x;p.z=candidate.z;buddyRoot.rotation.y=Math.atan2(dx,dz);moved=step;if(len<.08)buddyRoute.shift();}else buddyRoute=[];
    }
    if(buddyMode==='play'&&Math.hypot(p.x-ball.x,p.z-ball.z)<.95&&Math.hypot(ball.vx,ball.vz)<1.2&&elapsed-lastBuddyKick>2){lastBuddyKick=elapsed;kickBall(p,true);buddyRoute=[];}
    buddy.pose.setLocomotion({speed:dt?moved/dt:0,weight:moved>.001?1:0,phase:elapsed*9});buddy.pose.update(dt);
    buddyCelebration=Math.max(0,buddyCelebration-dt*1.6);if(!reducedMotion)buddyFacing.position.y=Math.sin(buddyCelebration*Math.PI)*.11;
    buddyShadow.position.x=p.x;buddyShadow.position.z=p.z;
  }
  function update(dt,{paused=false}={}){
    if(disposed||!Number.isFinite(dt)||dt<0)return;dt=Math.min(dt,.12);updateSize();const model=getActor()?.character?.model;
    if(model!==primaryModel){unwrapPrimary();primaryModel=model;touch=null;kick=null;pendingKick=null;}resetPivots();if(paused)return;
    // A furniture edit can cover an idle ball or guest. Re-home only to free cells;
    // normal movement and kicks always use collision-tested trajectories.
    for(const target of [ball,buddyRoot.position])if(!valid(target)){const point=nearestFree(target,.3);if(point){target.x=point.x;target.z=point.z;buddyRoute=[];}}
    elapsed+=dt;updateBuddy(dt);
    if(pendingKick){const actor=getActor(),p=actor?.root?.position;if(!p||elapsed>pendingKick.until)pendingKick=null;else if(Math.hypot(p.x-ball.x,p.z-ball.z)<1.08&&['idle','walking'].includes(actor.state)){kickBall(p);pendingKick=null;}}
    const oldX=ball.x,oldZ=ball.z;advanceBall(ball,dt,{bounds:navBounds(),blocked:(x,z)=>!canVisit({x,z})});ballRoot.position.set(ball.x,ball.y,ball.z);ballRoot.rotation.x+=(ball.z-oldZ)/BALL_RADIUS;ballRoot.rotation.z-=(ball.x-oldX)/BALL_RADIUS;
    ballShadow.position.x=ball.x;ballShadow.position.z=ball.z;ballShadow.scale.setScalar(1/(1+Math.max(0,ball.y-.31)));
    if(kick){kick.t+=dt;const t=Math.min(1,kick.t/.48),wave=Math.sin(t*Math.PI);kick.pivot.rotation.x=-wave*.8;kick.pivot.position.z=wave*.12;if(t>=1)kick=null;}
    if(touch){touch.t+=dt;const t=Math.min(1,touch.t/.9),wave=Math.sin(t*Math.PI),pivot=touch.pivot;if(pivot){if(touch.region==='head')pivot.rotation.x=-wave*.16;else if(touch.region==='tail')pivot.rotation.y=Math.sin(t*18)*wave*.32;else if(touch.region==='paws')pivot.rotation.z=-wave*.28;else pivot.rotation.z=Math.sin(t*12)*wave*.055;}if(t>=1)touch=null;}
    for(const value of books.values()){value.t=Math.min(1,value.t+dt/1.05);const t=reducedMotion?1:value.t,ease=1-(1-t)**3;value.group.position.set(value.x,value.y+(1-ease)*.85,.06+Math.sin(t*Math.PI)*.22);value.group.rotation.z=(1-ease)*.28;value.group.scale.setScalar(reducedMotion?1:Math.max(.02,ease));}
  }
  function getState(){return {books:knownEvents?.size||0,visibleBooks:books.size,ball:{...ball},buddy:{x:buddyRoot.position.x,z:buddyRoot.position.z,mode:buddyMode,waypoints:buddyRoute.length},pendingKick:!!pendingKick};}
  function dispose(){if(disposed)return;disposed=true;for(const [joint,pivot]of pivots){for(const child of [...pivot.children])joint.add(child);pivot.removeFromParent();}pivots.clear();buddy.dispose();world.removeFromParent();for(const resource of resources)resource.dispose();resources.clear();books.clear();}
  return {sync,update,interact,hasHit:raycaster=>!!findHit(raycaster),pickAnimal(raycaster){const kind=findHit(raycaster)?.kind;return kind==='primary'||kind==='buddy'?kind:null;},leadBuddy,getState,dispose,get active(){return !!pendingKick||!!kick||!!touch||buddyRoute.length>0||Math.hypot(ball.vx,ball.vz)>0||[...books.values()].some(book=>book.t<1);}};
}
