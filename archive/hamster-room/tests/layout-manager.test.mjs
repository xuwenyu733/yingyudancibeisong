import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Vector3 } from '../vendor/three/three.module.js';
import { FURNITURE, COLLIDERS, SOFA, ROOM, PLACEMENT_BOUNDS } from '../layout.js';
import { createLayoutManager } from '../layout-manager.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const copy=(value)=>JSON.parse(JSON.stringify(value));
const navigationBounds={minX:-3.80,maxX:3.27,minZ:-3.48,maxZ:3.55};
// These roots reproduce decor.js placement; no mesh-derived collision or WebGL.
const DECOR_POSITIONS={
  'lamp-cabinet':[-2.37,0,-2.45], 'plant-shelf':[-3.67,0,-2.54],
  'ottoman-a':[-3.10,0,2.53], 'ottoman-b':[-1.65,0,3],
  'front-fence':[3.76,0,1.35], rug:[.32,.047,-.03],
};
function fixture({relocatePet=false}={}) {
  const scene=new Scene(),furniture=new Map(),events=[],relocations=[];
  for(const id of Object.keys(COLLIDERS)) {
    const config=FURNITURE[id],root=new Group();root.name=id;
    root.position.fromArray(config?.position??DECOR_POSITIONS[id]);
    root.rotation.fromArray(config?.rotation??[0,0,0]);root.scale.setScalar(config?.scale??1);
    scene.add(root);furniture.set(id,root);
  }
  const pet={x:.65,z:2.83};
  const manager=createLayoutManager({furniture,definitions:COLLIDERS,roomBounds:PLACEMENT_BOUNDS,navigationBounds,petHeight:ROOM.petHeight,
    getPet:()=>pet,getApproach:()=>furniture.get('sofa').localToWorld(new Vector3(...SOFA.approach)),
    setPet:relocatePet?point=>{relocations.push({...point});pet.x=point.x;pet.z=point.z;}:undefined,
    afterUpdate:()=>scene.updateMatrixWorld(true),onEvent:(type,detail)=>events.push({type,...detail})});
  return {manager,furniture,scene,pet,events,relocations};
}
function withStorage(action) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))}});
  try {action(data);} finally {if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
}

test('actual default furniture, decor transforms and independent boxes form a valid layout',()=>{
  const {manager}=fixture();
  assert.deepEqual(manager.validate(),{valid:true,reason:''});
  assert.equal(manager.lampSupport,'lamp-cabinet');
  assert.equal(manager.snapshot().version,3);
  assert.ok(manager.colliders.has('rug'));
  assert.ok(!manager.obstacles.some(box=>box.id==='rug'));
  const obstacles=manager.obstacles,colliders=manager.colliders;
  manager.refresh();assert.equal(manager.obstacles,obstacles);assert.equal(manager.colliders,colliders);
});

test('position-only bridge patches accept undefined optional fields and cabinet carries its lamp through translation and yaw',()=>{
  const {manager,furniture,scene}=fixture(),before=manager.snapshot();
  assert.equal(manager.previewTransform('lamp-cabinet',{position:[-2.20,0,-2.45],rotation:undefined,scale:undefined}),true);
  near(furniture.get('lamp').position.x,-2.20);near(furniture.get('lamp').position.y,1.12);
  assert.equal(manager.previewTransform('lamp-cabinet',{rotation:[0,Math.PI/2,0]}),true);
  near(furniture.get('lamp').rotation.y,Math.PI/2);near(furniture.get('lamp').scale.x,.83);
  assert.equal(furniture.get('lamp').parent,scene);
  assert.equal(manager.commit(before),true);
});

test('lamp snaps onto table and follows table translation and rotation as a scene-root sibling',()=>{
  const {manager,furniture,scene}=fixture();let before=manager.snapshot();
  assert.equal(manager.previewTransform('lamp',{position:[-.55,999,.87]}),true);
  assert.equal(manager.lampSupport,'table');near(furniture.get('lamp').position.y,.40*1.9);
  assert.equal(manager.commit(before),true);
  before=manager.snapshot();
  assert.equal(manager.previewTransform('table',{position:[-.40,0,.87],rotation:[0,Math.PI/2,0]}),true);
  near(furniture.get('lamp').position.x,-.40);near(furniture.get('lamp').position.z,.87);
  near(furniture.get('lamp').rotation.y,Math.PI/2);assert.equal(furniture.get('lamp').parent,scene);
  assert.equal(manager.commit(before),true);
});

test('a standalone lamp falls to floor height when not over a support',()=>{
  const {manager,furniture}=fixture(),before=manager.snapshot();
  assert.equal(manager.previewTransform('lamp',{position:[2.4,5,2.7]}),true);
  assert.equal(manager.lampSupport,null);near(furniture.get('lamp').position.y,.04);
  assert.equal(manager.commit(before),true);
});

test('overlap and pet-trapping transactions restore all furniture and support metadata',()=>{
  for(const position of [[-2.37,0,-2.45],[.65,0,2.83]]) {
    const {manager}=fixture(),before=manager.snapshot();
    assert.equal(manager.previewTransform('table',{position}),true);
    assert.equal(manager.validate().valid,false);
    assert.equal(manager.commit(before),false);
    assert.deepEqual(manager.snapshot(),before);
  }
});

test('malformed transforms and snapshots cannot partially corrupt scene roots or collision definitions',()=>{
  const {manager}=fixture(),before=manager.snapshot();
  for(const patch of [{position:[0,NaN,0]},{position:[0,0]},{rotation:[.1,0,0]},{scale:[1,0,1]}]) {
    assert.equal(manager.previewTransform('table',patch),false);assert.deepEqual(manager.snapshot(),before);
  }
  const malformed=copy(before);malformed.furniture.table.position=[0,Infinity,0];
  assert.equal(manager.restore(malformed),false);assert.deepEqual(manager.snapshot(),before);
  const noBoxes=copy(before);noBoxes.definitions.table.boxes=[];
  assert.equal(manager.restore(noBoxes),false);assert.deepEqual(manager.snapshot(),before);
});

test('collision-box edits commit valid local changes and roll invalid dimensions back',()=>{
  const {manager}=fixture();
  assert.equal(manager.updateCollider('table',{size:[.98,.411,.99]}),true);
  const valid=manager.snapshot();
  assert.deepEqual(manager.definitions.table.boxes[0].size,[.98,.411,.99]);
  assert.equal(manager.updateCollider('table',{size:[0,.411,1]}),false);
  assert.deepEqual(manager.snapshot(),valid);
  assert.equal(manager.updateCollider('table',{center:[100,.2055,0]}),false);
  assert.deepEqual(manager.snapshot(),valid);
});

test('version-three persistence round-trips transforms, collider edits and lamp support',()=>withStorage(()=>{
  const first=fixture();let before=first.manager.snapshot();
  first.manager.previewTransform('lamp',{position:[-.55,0,.87]});assert.equal(first.manager.commit(before),true);
  assert.equal(first.manager.updateCollider('table',{size:[.98,.411,.99]}),true);
  assert.equal(first.manager.persist(),true);
  const second=fixture();assert.equal(second.manager.loadSaved(),true);
  assert.deepEqual(second.manager.snapshot(),first.manager.snapshot());assert.equal(second.manager.lampSupport,'table');
}));

function saveLayoutOccupyingStartupSpawn() {
  const first=fixture();
  const safe=first.furniture.get('sofa').localToWorld(new Vector3(...SOFA.approach));
  first.pet.x=safe.x;first.pet.z=safe.z;
  const before=first.manager.snapshot();
  assert.equal(first.manager.previewTransform('table',{position:[.65,0,2.83]}),true);
  assert.equal(first.manager.commit(before),true);
  assert.equal(first.manager.persist(),true);
  return first.manager.snapshot();
}

test('loading a valid saved layout occupying startup spawn relocates the pet to a safe sofa approach',()=>withStorage(()=>{
  const saved=saveLayoutOccupyingStartupSpawn();
  const loaded=fixture({relocatePet:true});
  assert.equal(loaded.manager.loadSaved(),true);
  assert.deepEqual(loaded.manager.snapshot(),saved);
  const approach=loaded.furniture.get('sofa').localToWorld(new Vector3(...SOFA.approach));
  near(loaded.pet.x,approach.x);near(loaded.pet.z,approach.z);
  assert.equal(loaded.relocations.length,1);
  assert.equal(loaded.manager.validate().valid,true);
  // Without an opted-in relocation callback, retain the original behavior.
  const withoutCallback=fixture(),defaults=withoutCallback.manager.snapshot();
  assert.equal(withoutCallback.manager.loadSaved(),false);
  assert.deepEqual(withoutCallback.manager.snapshot(),defaults);
  assert.deepEqual(withoutCallback.pet,{x:.65,z:2.83});
}));

test('a later saved-layout validation failure restores both default furniture and the original pet position',()=>withStorage(data=>{
  const saved=saveLayoutOccupyingStartupSpawn();
  saved.furniture['lamp-cabinet'].position=[100,0,-2.45];
  const loaded=fixture({relocatePet:true}),defaults=loaded.manager.snapshot(),spawn={...loaded.pet};
  data.set(loaded.manager.storageKey,JSON.stringify(saved));
  assert.equal(loaded.manager.loadSaved(),false);
  assert.deepEqual(loaded.manager.snapshot(),defaults);
  assert.deepEqual(loaded.pet,spawn);
  assert.equal(loaded.relocations.length,2);
  assert.deepEqual(loaded.relocations.at(-1),spawn);
}));

test('corrupt JSON and non-finite persisted coordinates restore defaults without throwing',()=>withStorage(data=>{
  const {manager}=fixture(),defaults=manager.snapshot();
  for(const badValue of ['{broken',JSON.stringify({...defaults,furniture:{...defaults.furniture,table:{...defaults.furniture.table,position:[0,null,0]}}})]) {
    manager.previewTransform('table',{position:[-.4,0,.87]});
    data.set(manager.storageKey,badValue);assert.equal(manager.loadSaved(),false);assert.deepEqual(manager.snapshot(),defaults);
  }
}));

test('path-blocking saved layouts are rejected and reverted even when boxes do not overlap endpoints',()=>withStorage(data=>{
  const root=new Group(),furniture=new Map([['wall',root]]);
  const manager=createLayoutManager({furniture,definitions:{wall:{label:'测试屏障',boxes:[{center:[0,.5,0],size:[.1,1,10]}],blocksNavigation:false,blocksPlacement:false}},
    roomBounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},navigationBounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},
    getPet:()=>({x:-2,z:0}),getApproach:()=>({x:2,z:0})});
  const defaults=manager.snapshot(),blocked=copy(defaults);blocked.definitions.wall.blocksNavigation=true;
  assert.equal(manager.restore(blocked),true);assert.equal(manager.validate({checkPath:false}).valid,true);
  assert.equal(manager.validate().valid,false);
  data.set(manager.storageKey,JSON.stringify(blocked));assert.equal(manager.loadSaved(),false);assert.deepEqual(manager.snapshot(),defaults);
}));

test('storage write errors are contained and leave the valid current scene unchanged',()=>withStorage(()=>{
  const {manager}=fixture(),before=manager.snapshot();
  globalThis.localStorage.setItem=()=>{throw new Error('quota exceeded');};
  assert.equal(manager.persist(),false);assert.deepEqual(manager.snapshot(),before);
}));
