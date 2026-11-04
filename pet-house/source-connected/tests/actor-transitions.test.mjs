import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/three.module.js';
import {MovementController} from '../movement.mjs';
import {PET_BODY_RADIUS,petNavigationBounds,insidePetBounds} from '../pet-boundary.mjs';
import {createPath} from '../navigation.mjs';
import {SEATS,fitSeat,resolveSeatApproach,WATER_TARGETS,fitWater,resolveWaterApproach} from '../seats.mjs';
import {createFurnitureCollider,toPathObstacles} from '../colliders.mjs';
import {createOriginalFox} from '../characters/original-fox.js';

// 直接提取正在交付的内部 Actor 与连续碰撞函数，避免测试另写一份相似的状态机。
// 使用真实 movement/path/seat/角色动作；只替代 DOM 画布软影，不创建 WebGL。
const source=readFileSync(new URL('../room.js',import.meta.url),'utf8');
const actorStart=source.indexOf('class PetActor {'),actorEnd=source.indexOf('\nfunction resize()',actorStart);
const collisionStart=source.indexOf('function insideObstacle('),collisionEnd=source.indexOf('\nfunction resolveSeat()',collisionStart);
assert.ok(actorStart>=0&&actorEnd>actorStart&&collisionStart>=0&&collisionEnd>collisionStart,'room Actor source boundaries changed');
const actorSource=source.slice(actorStart,actorEnd),collisionSource=source.slice(collisionStart,collisionEnd);
const STEP=1/60,zeroAxis={x:0,z:0};
const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-5;

function fixture(t,{angle=0,scale=1}={}) {
  const scene=new THREE.Scene(),furniture=new Map(),history=[];
  function seat(id,position,rotation=0,size=1){const root=new THREE.Group();root.name=id;root.userData.furnitureId=id;root.position.fromArray(position);root.rotation.y=rotation;root.scale.setScalar(size);scene.add(root);furniture.set(id,root);return root;}
  seat('ottoman-a',[-1.6,0,.2],angle,scale);seat('ottoman-b',[1.6,0,.2]);seat('sofa',[0,0,-2.2],-Math.PI/2,1.5);
  seat('floor-pot',[1.85,0,1.60]);
  const colliders=[...furniture].filter(([id])=>id!=='floor-pot').map(([id,root])=>{
    root.updateMatrixWorld(true);return createFurnitureCollider({id,matrixWorld:root.matrixWorld,
      boxes:[id==='sofa'?{center:[0,.247,0],size:[.712,.494,1]}:{center:[0,.365,0],size:[1.24,.69,.99]}]});
  });
  const obstacles=toPathObstacles(colliders,{padding:.48}),bounds={minX:-5,maxX:5,minZ:-5,maxZ:5};
  let actor;
  const context={THREE,ROOM:{petHeight:1.22},scene,furniture,MovementController,createPath,SEATS,fitSeat,resolveSeatApproach,
    WATER_TARGETS,fitWater,resolveWaterApproach,PET_BODY_RADIUS,insidePetBounds,obstacles,bounds,
    notify:(type,detail={})=>history.push({type,...detail,seatId:actor?.seatId}),updateStatus(){},seatWorld:new THREE.Vector3(),
    resolveSeat(){context.seatWorld=furniture.get('sofa').localToWorld(new THREE.Vector3(.075,.242,0));},
    doc:{createElement(){return {getContext(){return {createRadialGradient(){return {addColorStop(){}};},fillRect(){}};}};}},
    smooth:x=>x*x*(3-2*x),angleLerp:(a,b,x)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*x,
  };
  const Actor=vm.runInNewContext(`${collisionSource}\n(${actorSource})`,context);
  const character=createOriginalFox();actor=new Actor(character);
  t.after(()=>{character.dispose();actor.shadow.geometry.dispose();actor.shadow.material.map.dispose();actor.shadow.material.dispose();scene.clear();});
  const tick=()=>{
    actor.update(STEP,zeroAxis);
    assert.ok(actor.root.position.toArray().every(Number.isFinite));assert.ok(Number.isFinite(actor.pose.amount));
  };
  const until=(predicate,maxSeconds=20)=>{
    for(let i=0;i<maxSeconds/STEP;i++){if(predicate())return;tick();}
    assert.fail(`Actor stalled: ${JSON.stringify({state:actor.state,seatId:actor.seatId,pendingSeatId:actor.pendingSeatId,pendingPoint:actor.pendingPoint,position:actor.root.position.toArray()})}`);
  };
  const advance=seconds=>{for(let i=0;i<seconds/STEP;i++)tick();};
  return {actor,history,until,advance,obstacles,furniture};
}

test('after its first real sit, a ground request reaches the goal and clears seat/queue state',t=>{
  const {actor,until}=fixture(t);actor.toggleSeat('sofa');until(()=>actor.state==='seated');
  assert.equal(actor.seatId,'sofa');assert.equal(actor.pendingSeatId,null);
  const goal={x:3.6,z:2.6};assert.equal(actor.walkTo(goal),true);
  until(()=>actor.state==='idle'&&close(actor.root.position,goal));
  assert.equal(actor.seatId,null);assert.equal(actor.pendingSeatId,null);assert.equal(actor.pendingPoint,null);assert.equal(actor.desiredSeated,false);
});

test('a forbidden edge click cannot wake a seated pet or queue a later walk past the boundary',t=>{
  const {actor,until}=fixture(t);actor.toggleSeat('sofa');until(()=>actor.state==='seated');
  const before=actor.root.position.toArray();assert.equal(actor.walkTo({x:5.01,z:0}),false);assert.equal(actor.state,'seated');assert.equal(actor.pendingPoint,null);assert.deepEqual(actor.root.position.toArray(),before);
  assert.equal(actor.walkTo({x:0,z:-5.01}),false);assert.equal(actor.walkTo({x:NaN,z:0}),false);assert.equal(actor.state,'seated');
});

test('a chair at the forbidden perimeter cannot bypass the walking boundary through a hop',t=>{
  const {actor,furniture,history}=fixture(t),chair=furniture.get('ottoman-a');chair.position.x=5.01;chair.updateMatrixWorld(true);
  const before=actor.root.position.toArray();actor.toggleSeat('ottoman-a');assert.equal(actor.state,'idle');assert.equal(actor.desiredSeated,false);assert.equal(actor.seatId,null);assert.deepEqual(actor.root.position.toArray(),before);assert.ok(history.some(event=>event.type==='seat-blocked'));
});

test('canceling an approach immediately clears pending seat, target, and seatId',t=>{
  const {actor,advance}=fixture(t);const start=actor.root.position.clone();actor.toggleSeat('ottoman-a');
  assert.equal(actor.state,'approaching');actor.toggleSeat('ottoman-a');advance(1);
  assert.equal(actor.state,'idle');assert.equal(actor.seatId,null);assert.equal(actor.pendingSeatId,null);
  assert.equal(actor.ctrl.target,null);assert.equal(actor.desiredSeated,false);assert.ok(close(actor.root.position,start));
});

test('canceling during the hop lands and leaves without playing a complete sitting cycle',t=>{
  for(const request of ['ground','cancel']) {
    const {actor,history,until,advance}=fixture(t);actor.toggleSeat('ottoman-a');until(()=>actor.state==='hopping-on');advance(.2);
    const boundary=history.length,goal={x:3.6,z:2.6};
    if(request==='ground')actor.walkTo(goal);else actor.toggleSeat('ottoman-a');
    until(()=>actor.state==='idle'&&(request!=='ground'||close(actor.root.position,goal)));
    const states=history.slice(boundary).filter(event=>event.type==='pet-state').map(event=>event.state);
    assert.ok(!states.includes('sitting-down'));assert.ok(states.includes('standing-up'));assert.ok(states.includes('hopping-off'));
    assert.equal(actor.seatId,null);assert.equal(actor.pendingSeatId,null);assert.equal(actor.pendingPoint,null);
  }
});

test('a newer seat request replaces an older queued change while leaving the current seat',t=>{
  const {actor,history,until,advance}=fixture(t);actor.toggleSeat('ottoman-a');until(()=>actor.state==='seated');
  actor.toggleSeat('ottoman-b');assert.equal(actor.pendingSeatId,'ottoman-b');advance(.10);
  actor.toggleSeat('sofa');assert.equal(actor.pendingSeatId,'sofa');
  const boundary=history.length;until(()=>actor.state==='seated'&&actor.seatId==='sofa');
  assert.equal(actor.pendingSeatId,null);assert.equal(actor.desiredSeated,true);
  assert.ok(!history.slice(boundary).some(event=>event.type==='pet-state'&&event.state==='sitting-down'&&event.seatId==='ottoman-b'));
});

test('a ground request supersedes a queued seat switch and is not lost after hopping off',t=>{
  const {actor,until}=fixture(t);actor.toggleSeat('ottoman-a');until(()=>actor.state==='seated');
  actor.toggleSeat('ottoman-b');const goal={x:3.6,z:2.6};actor.walkTo(goal);
  assert.equal(actor.pendingSeatId,null);until(()=>actor.state==='idle'&&close(actor.root.position,goal));
  assert.equal(actor.seatId,null);assert.equal(actor.pendingPoint,null);assert.equal(actor.desiredSeated,false);
});

test('Actor reaches a rotated, small seat through the actual safe-approach resolver',t=>{
  const {actor,until,obstacles}=fixture(t,{angle:Math.PI/4,scale:.5});actor.toggleSeat('ottoman-a');
  assert.equal(actor.state,'approaching');
  assert.ok(!obstacles.some(box=>actor.approachWorld.x>=box.minX&&actor.approachWorld.x<=box.maxX&&actor.approachWorld.z>=box.minZ&&actor.approachWorld.z<=box.maxZ));
  until(()=>actor.state==='seated');assert.equal(actor.seatId,'ottoman-a');assert.equal(actor.pendingSeatId,null);
});

// ---------- 浇水（花盆交互） ----------
test('clicking the pot while idle walks over, waters and returns to idle',t=>{
  const {actor,until,history}=fixture(t);
  assert.equal(actor.requestWater('floor-pot'),true);assert.equal(actor.pendingWater,true);assert.equal(actor.desiredSeated,false);
  const boundary=history.length;
  until(()=>actor.state==='watering');
  assert.ok(close(actor.root.position,{x:1.85,z:2.10}),'pet must stand at the watering spot in front of the pot');
  until(()=>actor.state==='idle');
  assert.ok(history.slice(boundary).some(event=>event.type==='water-done'),'water-done must be emitted');
  assert.equal(actor.seatId,null);assert.equal(actor.pendingWater,false);
});

test('clicking the pot while seated stands up first, then walks over and waters',t=>{
  const {actor,until,history}=fixture(t);actor.toggleSeat('ottoman-a');until(()=>actor.state==='seated');
  const boundary=history.length;
  assert.equal(actor.requestWater('floor-pot'),true);assert.equal(actor.pendingSeatId,null);assert.equal(actor.pendingWater,true);
  until(()=>actor.state==='watering');
  assert.ok(history.slice(boundary).filter(event=>event.type==='pet-state').some(event=>event.state==='standing-up'),'must stand up before watering');
  until(()=>actor.state==='idle');
  assert.equal(actor.seatId,null);
});

test('a movement key cancels watering and starts walking',t=>{
  const {actor,until}=fixture(t);actor.requestWater('floor-pot');until(()=>actor.state==='watering');
  for(let i=0;i<40;i++)actor.update(STEP,{x:1,z:.2});
  assert.equal(actor.state,'walking');assert.equal(actor.pendingWater,false);
});

test('clicking a seat while watering switches to the seat',t=>{
  const {actor,until}=fixture(t);actor.requestWater('floor-pot');until(()=>actor.state==='watering');
  actor.toggleSeat('ottoman-a');until(()=>actor.state==='seated');
  assert.equal(actor.seatId,'ottoman-a');assert.equal(actor.pendingWater,false);
});

test('a water request supersedes a queued seat switch after hopping off',t=>{
  const {actor,until,history}=fixture(t);actor.toggleSeat('ottoman-a');until(()=>actor.state==='seated');
  actor.toggleSeat('ottoman-b');assert.equal(actor.pendingSeatId,'ottoman-b');
  actor.requestWater('floor-pot');assert.equal(actor.pendingSeatId,null);assert.equal(actor.pendingWater,true);assert.equal(actor.desiredSeated,false);
  const boundary=history.length;
  until(()=>actor.state==='watering');
  assert.ok(!history.slice(boundary).some(event=>event.type==='pet-state'&&event.state==='sitting-down'&&event.seatId==='ottoman-b'),'must not sit on ottoman-b');
  until(()=>actor.state==='idle');
});

test('clicking the floor while watering cancels watering and walks straight there',t=>{
  const {actor,until}=fixture(t);actor.requestWater('floor-pot');until(()=>actor.state==='watering');
  assert.equal(actor.walkTo({x:-2,z:3}),true);
  for(let i=0;i<300;i++)actor.update(STEP,{x:0,z:0});
  assert.equal(actor.state,'idle');assert.equal(actor.pendingWater,false);
  assert.ok(close(actor.root.position,{x:-2,z:3}),'must arrive at the clicked point, not linger at the pot');
});
