import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from '../vendor/three/three.module.js';
import {SEATS,fitSeat,resolveSeatApproach,WATER_TARGETS,fitWater,resolveWaterApproach} from '../seats.mjs';
import {createFurnitureCollider,toPathObstacles} from '../colliders.mjs';
import {createPath} from '../navigation.mjs';
import {FLOOR_POT} from '../decor.js';

const near=(actual,expected,message='')=>assert.ok(Math.abs(actual-expected)<1e-6,message||`${actual} != ${expected}`);

function seatedGroup(id,position=[0,0,0],rotationY=0){
  const root=new Group();root.name=id;root.position.fromArray(position);root.rotation.y=rotationY;return root;
}

test('every seat id has a definition with an approach point and a facing vector',()=>{
  for(const id of ['sofa','ottoman-a','ottoman-b']) {
    const def=SEATS[id];
    assert.ok(def,'missing seat definition for '+id);
    assert.equal(def.approach.length,3,'approach must be a local [x,y,z] point');
    assert.equal(def.facing.length,3,'facing must be a local vector');
  }
});

test('ottoman fitSeat places the seat top on the cushion and the approach outside the inflated collider',()=>{
  // 装饰里软凳碰撞盒尺寸 [1.24,.69,.99]，中心 y=.365；膨胀量=宠物半径 .48。
  const root=seatedGroup('ottoman-a',[-3.10,0,2.53]);
  const fitted=fitSeat(root,'ottoman-a');
  assert.ok(fitted);
  near(fitted.seatWorld.x,-3.10);
  near(fitted.seatWorld.y,.73,'seat top must match cushion top');
  near(fitted.seatWorld.z,2.53);
  // 落点须在“碰撞盒半深 + 宠物半径”之外，否则寻路会判定为阻塞。
  const obstacle=toPathObstacles([{id:'ottoman-a',boxes:[{boxIndex:0,minY:.02,maxY:.71,aabb:{minX:-3.72,maxX:-2.48,minZ:2.035,maxZ:3.025}}]}],{padding:.48})[0];
  const p=fitted.approachWorld;
  assert.ok(p.z>obstacle.maxZ,`approach z ${p.z} must clear inflated maxZ ${obstacle.maxZ}`);
  near(p.y,.09,'approach rests on the floor');
  near(fitted.seatYaw,Math.PI,'facing -Z from an unrotated ottoman');
});

test('rotated ottoman keeps its cushion height and rotates the facing with the furniture',()=>{
  const root=seatedGroup('ottoman-b',[-1.65,0,3.00],Math.PI/2);
  const fitted=fitSeat(root,'ottoman-b');
  assert.ok(fitted);
  near(fitted.seatWorld.y,.73);
  // 局部 +Z 落点在旋转 90° 后落到局部 +X：世界 x 增加、z 不变。
  near(fitted.approachWorld.x,-1.65+1.02);
  near(fitted.approachWorld.z,3.00);
  near(fitted.seatYaw,-Math.PI/2,'facing (0,0,-1) rotated 90° points -X');
});

test('sofa fitSeat derives the approach and facing from the sofa matrix like the room does',()=>{
  const root=seatedGroup('sofa',[1.12,0,-2.28],-Math.PI/2);
  root.scale.setScalar(3.7); // 真实沙发缩放，localToWorld 会带上缩放
  const fitted=fitSeat(root,'sofa');
  assert.ok(fitted);
  // sofa 旋转 -90°：局部 +X 落点 × 缩放 3.7 映射到世界 +Z。
  near(fitted.approachWorld.x,1.12);
  near(fitted.approachWorld.z,-2.28+.58*3.7);
  near(fitted.seatYaw,0,'facing +X rotated -90° points +Z');
});

const navigationBounds={minX:-4,maxX:4,minZ:-4,maxZ:4};
function seatObstacles(root,id='ottoman-a') {
  root.updateMatrixWorld(true);
  return toPathObstacles([createFurnitureCollider({id,boxes:[{center:[0,.365,0],size:[1.24,.69,.99]}],matrixWorld:root.matrixWorld})],{padding:.48});
}
function blocked(point,obstacles){return obstacles.some(box=>point.x>=box.minX&&point.x<=box.maxX&&point.z>=box.minZ&&point.z<=box.maxZ);}

test('approach resolver preserves the old safe default and stays outside rotated or scaled navigation boxes',()=>{
  for(const [angle,scale]of [[0,1],[Math.PI/4,1],[0,.5],[Math.PI*.23,.4]]) {
    const root=seatedGroup('ottoman-a');root.scale.setScalar(scale);root.rotation.y=angle;
    const obstacles=seatObstacles(root),from={x:3,z:3};
    const resolved=resolveSeatApproach(root,'ottoman-a',{obstacles,bounds:navigationBounds,from});
    assert.ok(resolved,`angle ${angle}, scale ${scale}`);assert.equal(resolved.y,.09);assert.ok(!blocked(resolved,obstacles));
    assert.notEqual(createPath(from,resolved,{bounds:navigationBounds,obstacles}),null);
    if(angle===0&&scale===1)near(resolved.z,1.02);
  }
});

test('a wall blocking the preferred entrance selects a reachable different face',()=>{
  const root=seatedGroup('ottoman-a',[0,0,3.2]),obstacles=seatObstacles(root),from={x:3,z:0};
  assert.ok(fitSeat(root,'ottoman-a').approachWorld.z>navigationBounds.maxZ);
  const point=resolveSeatApproach(root,'ottoman-a',{obstacles,bounds:navigationBounds,from});
  assert.ok(point);assert.ok(point.z<=navigationBounds.maxZ);assert.ok(!blocked(point,obstacles));
  assert.notEqual(createPath(from,point,{bounds:navigationBounds,obstacles}),null);
});

test('other furniture and a disconnected navigation region cannot produce an unsafe seat entrance',()=>{
  const root=seatedGroup('ottoman-a',[0,0,-2]),obstacles=seatObstacles(root);
  obstacles.push({id:'wall',minX:-4,maxX:4,minZ:-.3,maxZ:.3});
  assert.equal(resolveSeatApproach(root,'ottoman-a',{obstacles,bounds:navigationBounds,from:{x:0,z:2}}),null);
  assert.equal(resolveSeatApproach(root,'not-a-seat',{obstacles,bounds:navigationBounds,from:{x:0,z:2}}),null);
  assert.equal(resolveSeatApproach(root,'ottoman-a',{obstacles,bounds:navigationBounds,from:{x:NaN,z:2}}),null);
});

test('resolver returns world coordinates after a parent transform without changing furniture transforms',()=>{
  const parent=seatedGroup('parent',[1,0,-1],Math.PI/5),root=seatedGroup('ottoman-a');parent.add(root);root.scale.setScalar(.5);
  parent.updateMatrixWorld(true);const before=root.matrix.clone(),obstacles=seatObstacles(root);
  const point=resolveSeatApproach(root,'ottoman-a',{obstacles,bounds:navigationBounds,from:{x:3,z:3}});
  assert.ok(point);assert.ok(!blocked(point,obstacles));assert.ok(root.matrix.equals(before));
});

// ---------- 浇水目标（花盆） ----------
const navigationBoundsWater={minX:-4.36,maxX:4.36,minZ:-4.06,maxZ:4.06};
function roomObstacles() {
  // 与房间一致的默认家具：位置/旋转/缩放来自 layout.js FURNITURE 与 decor.js 摆放；软凳与栅栏为无旋转缩放。
  const specs=[
    ['sofa',[1.12,0,-2.28],-Math.PI/2,3.7,[.712,.494,1],[0,.247,0]],
    ['table',[-.55,0,.87],0,1.9,[.990,.411,1],[0,.2055,0]],
    ['lamp',[-2.37,1.12,-2.45],0,.83,[.871,1,.870],[0,.5,0]],
    ['lamp-cabinet',[-2.37,0,-2.45],0,1,[1.27,1.05,1.14],[0,.595,0]],
    ['plant-shelf',[-3.67,0,-2.54],0,1,[.94,2.20,.75],[0,1.355,0]],
    ['ottoman-a',[-3.10,0,2.53],0,1,[1.24,.69,.99],[0,.365,0]],
    ['ottoman-b',[-1.65,0,3.00],0,1,[1.24,.69,.99],[0,.365,0]],
    ['front-fence',[3.76,0,1.35],0,1,[.095,.89,3.69],[0,.49,.60]],
  ];
  return toPathObstacles(specs.map(([id,position,rotY,scale,size,center])=>{
    const root=new Group();root.position.fromArray(position);root.rotation.y=rotY;root.scale.setScalar(scale);root.updateMatrixWorld(true);
    return createFurnitureCollider({id,matrixWorld:root.matrixWorld,boxes:[{center,size}]});
  }),{padding:.48});
}

test('every water target has a definition with an approach point and a facing vector',()=>{
  for(const id of ['floor-pot','shop-clover-planter']) {
    const def=WATER_TARGETS[id];
    assert.ok(def,'missing water definition for '+id);
    assert.equal(def.approach.length,3,'approach must be a local [x,y,z] point');
    assert.equal(def.facing.length,3,'facing must be a local vector');
  }
});

test('floor-pot fitWater places the watering spot in front of the pot',()=>{
  const root=new Group();root.name='floor-pot';root.position.fromArray(FLOOR_POT.position);
  const fitted=fitWater(root,'floor-pot');
  assert.ok(fitted);
  near(fitted.approachWorld.x,FLOOR_POT.position[0]);
  near(fitted.approachWorld.y,.09,'watering spot rests on the floor');
  near(fitted.approachWorld.z,FLOOR_POT.position[2]+.50,'approach is 0.5m in front (+Z) of the pot');
  near(fitted.facingYaw,Math.PI,'facing -Z from an unrotated pot');
});

test('floor-pot stays reachable with the default room layout',()=>{
  // 回归：花盆与浇水落点都不能落在任何家具的“碰撞盒+宠物半径”膨胀区内，否则角色永远走不到。
  const root=new Group();root.name='floor-pot';root.position.fromArray(FLOOR_POT.position);
  const obstacles=roomObstacles();
  const point=new Vector3(FLOOR_POT.position[0],0,FLOOR_POT.position[2]);
  assert.ok(!blocked(point,obstacles),`pot itself ${point.x},${point.z} must be outside inflated colliders`);
  const resolved=resolveWaterApproach(root,'floor-pot',{obstacles,bounds:navigationBoundsWater,from:{x:.65,z:2.83}});
  assert.ok(resolved,'watering spot must be resolvable from the pet spawn');
  assert.ok(!blocked(resolved,obstacles),`resolved approach ${resolved.x},${resolved.z} must clear inflated colliders`);
  assert.notEqual(createPath({x:.65,z:2.83},resolved,{bounds:navigationBoundsWater,obstacles,cellSize:.18}),null);
});

test('rotated shop planter keeps a reachable watering spot beside it',()=>{
  const root=new Group();root.name='shop-clover-planter';root.position.set(1,0,1);root.rotation.y=Math.PI/2;root.updateMatrixWorld(true);
  const fitted=fitWater(root,'shop-clover-planter');
  assert.ok(fitted);
  near(fitted.approachWorld.x,1+.62,'local +Z approach rotated 90° lands on world +X');
  near(fitted.approachWorld.z,1);
  near(fitted.facingYaw,-Math.PI/2);
  const obstacles=toPathObstacles([createFurnitureCollider({id:'shop-clover-planter',matrixWorld:root.matrixWorld,
    boxes:[{center:[0,.485,0],size:[.82,.97,.82]}]})],{padding:.48});
  const resolved=resolveWaterApproach(root,'shop-clover-planter',{obstacles,bounds:navigationBoundsWater,from:{x:0,z:2}});
  assert.ok(resolved);assert.ok(!blocked(resolved,obstacles));
});
