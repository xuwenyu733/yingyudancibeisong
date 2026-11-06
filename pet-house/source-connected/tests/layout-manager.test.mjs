import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { Scene, Group, Vector3 } from '../vendor/three/three.module.js';
import { FURNITURE, COLLIDERS, SOFA, ROOM, PLACEMENT_BOUNDS } from '../layout.js';
import { createLayoutManager, MAX_LAYOUT_JSON_BYTES } from '../layout-manager.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const copy=(value)=>JSON.parse(JSON.stringify(value));
const navigationBounds={minX:-3.80,maxX:3.27,minZ:-3.48,maxZ:3.55};
// These roots reproduce decor.js placement; no mesh-derived collision or WebGL.
const DECOR_POSITIONS={
  'lamp-cabinet':[-2.37,0,-2.45], 'plant-shelf':[-3.67,0,-2.54],
  'ottoman-a':[-3.10,0,2.53], 'ottoman-b':[-1.65,0,3],
  'front-fence':[3.76,0,1.35], rug:[.32,.047,-.03], 'floor-pot':[1.85,0,1.60],
  'wall-pictures':[0,0,0],
};
function fixture({relocatePet=false,storageAdapter,roomBounds=PLACEMENT_BOUNDS,navBounds=navigationBounds,getSeatApproaches,getApproach}={}) {
  const scene=new Scene(),furniture=new Map(),events=[],relocations=[];
  for(const id of Object.keys(COLLIDERS)) {
    const config=FURNITURE[id],root=new Group();root.name=id;
    root.position.fromArray(config?.position??DECOR_POSITIONS[id]);
    root.rotation.fromArray(config?.rotation??[0,0,0]);root.scale.setScalar(config?.scale??1);
    scene.add(root);furniture.set(id,root);
  }
  const pet={x:.65,z:2.83};
  const manager=createLayoutManager({furniture,definitions:COLLIDERS,roomBounds,navigationBounds:navBounds,petHeight:ROOM.petHeight,storageAdapter,
    getPet:()=>pet,getApproach:getApproach??(()=>furniture.get('sofa').localToWorld(new Vector3(...SOFA.approach))),
    getSeatApproaches:getSeatApproaches?(obstacles,bounds)=>getSeatApproaches(obstacles,bounds,furniture):undefined,
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

function memoryStorage() {
  const data=new Map();
  return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};
}

test('injected storage adapters isolate hosts and never access a blocked global storage getter',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('global storage must not be accessed');}});
  try {
    const adapter=memoryStorage(),otherAdapter=memoryStorage();
    const first=fixture({storageAdapter:adapter}),before=first.manager.snapshot();
    first.manager.previewTransform('table',{position:[-.4,0,.87]});
    assert.equal(first.manager.commit(before),true);
    assert.equal(first.manager.persist(),true);
    const sameHost=fixture({storageAdapter:adapter});
    assert.equal(sameHost.manager.loadSaved(),true);
    assert.deepEqual(sameHost.manager.snapshot(),first.manager.snapshot());
    assert.equal(fixture({storageAdapter:otherAdapter}).manager.loadSaved(),false);
    const disabled=fixture({storageAdapter:null});
    assert.equal(disabled.manager.persist(),false);
    assert.equal(disabled.manager.loadSaved(),false);
    const fallback=fixture();
    assert.equal(fallback.manager.persist(),false);
    assert.equal(fallback.manager.loadSaved(),false);
    assert.ok(fallback.events.some(event=>event.type==='layout-load-rejected'));
  } finally {
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;
  }
});

test('App imports accept object or JSON input and persist only when explicitly requested',()=>{
  const adapter=memoryStorage(),{manager}=fixture({storageAdapter:adapter});
  const imported=manager.snapshot();imported.furniture.table.position=[-.4,0,.87];
  assert.deepEqual(manager.importLayout(imported),{ok:true,reason:''});
  assert.deepEqual(manager.snapshot(),imported);
  assert.equal(adapter.data.size,0);
  imported.furniture.table.position=[-.45,0,.87];
  assert.deepEqual(manager.importLayout(JSON.stringify(imported),{persist:true}),{ok:true,reason:''});
  assert.deepEqual(JSON.parse(adapter.data.get(manager.storageKey)),copy(manager.snapshot()));
});

test('failed App imports retain the current user layout instead of resetting defaults',()=>{
  const {manager}=fixture({storageAdapter:null}),before=manager.snapshot();
  manager.previewTransform('table',{position:[-.4,0,.87]});assert.equal(manager.commit(before),true);
  const current=manager.snapshot();
  const overlapping=copy(current);overlapping.furniture.table.position=[-2.37,0,-2.45];
  const result=manager.importLayout(overlapping);
  assert.equal(result.ok,false);assert.ok(result.reason.length>0);
  assert.deepEqual(manager.snapshot(),current);
  const corrupt=copy(current);corrupt.furniture.table.position=[0,null,0];
  assert.equal(manager.importLayout(corrupt).ok,false);
  assert.deepEqual(manager.snapshot(),current);
  assert.equal(manager.validate().valid,true);
});

test('requested persistence failure rolls an otherwise valid import back atomically',()=>{
  const adapter=memoryStorage(),{manager}=fixture({storageAdapter:adapter});
  const before=manager.snapshot();manager.previewTransform('table',{position:[-.4,0,.87]});assert.equal(manager.commit(before),true);
  const current=manager.snapshot(),candidate=copy(current);candidate.furniture.table.position=[-.45,0,.87];
  adapter.setItem=()=>{throw new Error('quota exceeded');};
  const result=manager.importLayout(candidate,{persist:true});
  assert.equal(result.ok,false);assert.match(result.reason,/quota exceeded/);
  assert.deepEqual(manager.snapshot(),current);
  assert.equal(manager.validate().valid,true);
  assert.equal(manager.importLayout(candidate).ok,true,'host-managed imports do not require localStorage');
});

test('untrusted imports reject excessive bytes, nesting, cycles, sparse arrays and accessors before mutation',()=>{
  const {manager}=fixture(),before=manager.snapshot(),box=manager.colliders.get('table');
  const large={...copy(before),extra:'你'.repeat(100_000)};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).length>MAX_LAYOUT_JSON_BYTES);
  const cyclic=copy(before);cyclic.extra=cyclic;
  const deep=copy(before);let cursor=deep;
  for(let i=0;i<15;i++){cursor.extra={};cursor=cursor.extra;}
  const sparse=copy(before);sparse.furniture.table.position=Array(3);
  const hugeSparse=copy(before);hugeSparse.extra=Array(100_000);
  let accessorReads=0;const accessor=copy(before);
  Object.defineProperty(accessor,'extra',{enumerable:true,get(){accessorReads++;return 'unsafe';}});
  for(const input of [JSON.stringify(large),large,cyclic,deep,sparse,hugeSparse,accessor,'{"version":1e400}']) {
    const result=manager.importLayout(input);
    assert.equal(result.ok,false);
    assert.deepEqual(manager.snapshot(),before);
    assert.equal(manager.colliders.get('table'),box);
  }
  assert.equal(accessorReads,0,'import must not execute a supplied getter');
});

test('finite but enormous transforms and world boxes cannot enter the scene',()=>{
  const {manager}=fixture(),before=manager.snapshot();
  for(const mutate of [
    value=>{value.furniture.table.position=[0,100_000,0];},
    value=>{value.definitions.table.boxes[0].center=[100_000,.2,0];},
    value=>{value.furniture.table.scale=[.01,100,.01];value.definitions.table.boxes[0].size=[.99,100,1];},
    value=>{value.furniture.table.rotation=[0,1e100,0];},
  ]) {
    const candidate=copy(before);mutate(candidate);
    assert.equal(manager.importLayout(candidate).ok,false);
    assert.deepEqual(manager.snapshot(),before);
  }
  assert.equal(manager.validate().valid,true);
});

test('repeated validation reuses world geometry but sees external transforms, definitions and live pet state',()=>{
  const {manager,furniture,pet}=fixture();
  const original=manager.colliders.get('table'),obstacle=manager.obstacles.find(box=>box.id==='table');
  assert.equal(manager.validate().valid,true);assert.equal(manager.validate({checkPath:false}).valid,true);
  assert.equal(manager.colliders.get('table'),original);
  assert.equal(manager.obstacles.find(box=>box.id==='table'),obstacle);
  furniture.get('table').position.x+=.03;
  assert.equal(manager.validate().valid,true);
  const moved=manager.colliders.get('table');assert.notEqual(moved,original);
  manager.definitions.table.boxes[0].size[0]-=.01;
  assert.equal(manager.validate().valid,true);
  assert.notEqual(manager.colliders.get('table'),moved);
  manager.definitions.table.blocksNavigation=false;
  assert.equal(manager.validate().valid,true);assert.ok(!manager.obstacles.some(box=>box.id==='table'));
  manager.definitions.table.blocksNavigation=true;
  assert.equal(manager.validate().valid,true);
  const unchanged=manager.colliders.get('table');
  pet.x=furniture.get('table').position.x;pet.z=furniture.get('table').position.z;
  assert.equal(manager.validate().valid,false,'pet checks must not be cached with furniture geometry');
  assert.equal(manager.colliders.get('table'),unchanged);
});

test('oversized or deep saved JSON is rejected without changing the default layout',()=>withStorage(data=>{
  const {manager}=fixture(),defaults=manager.snapshot();
  const tooLarge=JSON.stringify({...defaults,extra:'x'.repeat(MAX_LAYOUT_JSON_BYTES)});
  const deep=copy(defaults);let cursor=deep;for(let i=0;i<15;i++){cursor.extra={};cursor=cursor.extra;}
  for(const value of [tooLarge,JSON.stringify(deep)]) {
    data.set(manager.storageKey,value);
    assert.equal(manager.loadSaved(),false);assert.deepEqual(manager.snapshot(),defaults);
  }
}));

test('invalid import options and non-Error adapter exceptions remain contained',()=>{
  const {manager}=fixture({storageAdapter:{getItem(){throw null;},setItem(){throw 'storage unavailable';}}});
  const before=manager.snapshot();
  assert.equal(manager.importLayout(before,null).ok,false);
  assert.equal(manager.importLayout(before,{persist:'yes'}).ok,false);
  assert.equal(manager.persist(),false);
  assert.equal(manager.loadSaved(),false);
  assert.deepEqual(manager.snapshot(),before);
});

const SHOP_BOX={label:'商店小柜',boxes:[{center:[0,.5,0],size:[.5,1,.5]}],blocksNavigation:true,blocksPlacement:true};
function addShopRoot(context,id='shop-cabinet-1',position=[2.5,0,2.5]) {
  const root=new Group();root.name=id;root.position.fromArray(position);
  context.scene.add(root);context.furniture.set(id,root);return root;
}

test('dynamic furniture registration, collision refresh and explicit rollback preserve host roots',()=>{
  const context=fixture(),{manager,furniture,scene}=context,before=manager.snapshot();
  const obstacles=manager.obstacles,colliders=manager.colliders,root=addShopRoot(context);
  assert.equal(manager.registerFurniture('shop-cabinet-1',root,SHOP_BOX),true);
  assert.ok(manager.snapshot().furniture['shop-cabinet-1']);
  assert.ok(manager.definitions['shop-cabinet-1']);assert.ok(manager.colliders.has('shop-cabinet-1'));
  assert.ok(manager.obstacles.some(box=>box.id==='shop-cabinet-1'));
  assert.equal(manager.validate().valid,true);
  assert.equal(manager.restore(before),false,'old snapshots require the added ID to be unregistered first');
  assert.equal(manager.unregisterFurniture('shop-cabinet-1'),true);
  assert.equal(furniture.get('shop-cabinet-1'),root);assert.equal(root.parent,scene);
  assert.ok(!manager.colliders.has('shop-cabinet-1'));assert.ok(!manager.obstacles.some(box=>box.id==='shop-cabinet-1'));
  assert.equal(manager.obstacles,obstacles);assert.equal(manager.colliders,colliders);
  assert.equal(manager.restore(before),true);assert.deepEqual(manager.snapshot(),before);
});

test('invalid or overlapping shop registration is rejected without changing registered state',()=>{
  const context=fixture(),{manager}=context,before=manager.snapshot();
  const bad=addShopRoot(context,'shop-bad',[-.55,0,.87]);
  assert.equal(manager.registerFurniture('shop-bad',bad,SHOP_BOX),false);
  assert.deepEqual(manager.snapshot(),before);assert.ok(!manager.colliders.has('shop-bad'));
  assert.equal(context.furniture.get('shop-bad'),bad,'host retains ownership even after rejection');
  const good=addShopRoot(context,'shop-good');
  assert.equal(manager.registerFurniture('shop-good',new Group(),SHOP_BOX),false);
  assert.equal(manager.registerFurniture('shop-good',good,{...SHOP_BOX,boxes:[]}),false);
  assert.equal(manager.registerFurniture('pet',good,SHOP_BOX),false);
  assert.equal(manager.registerFurniture('shop-good',good,SHOP_BOX),true);
  const registered=manager.snapshot();assert.equal(manager.registerFurniture('shop-good',good,SHOP_BOX),false);
  assert.deepEqual(manager.snapshot(),registered);
});

test('failed purchase persistence can unregister the new ID and restore its exact pre-purchase layout',()=>{
  const adapter=memoryStorage(),context=fixture({storageAdapter:adapter}),before=context.manager.snapshot();
  const root=addShopRoot(context);assert.equal(context.manager.registerFurniture('shop-cabinet-1',root,SHOP_BOX),true);
  adapter.setItem=()=>{throw new Error('account persistence failed');};
  assert.equal(context.manager.importLayout(context.manager.snapshot(),{persist:true}).ok,false);
  assert.equal(context.manager.unregisterFurniture('shop-cabinet-1'),true);
  context.furniture.delete('shop-cabinet-1');root.removeFromParent();
  assert.equal(context.manager.restore(before),true);
  assert.deepEqual(context.manager.snapshot(),before);assert.equal(context.manager.validate().valid,true);
});

test('dynamic registered collection has a compatible fallback when a saved layout is corrupt',()=>{
  const adapter=memoryStorage(),context=fixture({storageAdapter:adapter}),root=addShopRoot(context);
  assert.equal(context.manager.registerFurniture('shop-cabinet-1',root,SHOP_BOX),true);
  const registered=context.manager.snapshot();adapter.data.set(context.manager.storageKey,'{broken');
  assert.equal(context.manager.loadSaved(),false);assert.deepEqual(context.manager.snapshot(),registered);
  assert.equal(context.manager.unregisterFurniture('shop-cabinet-1'),true);
  const removed=context.manager.snapshot();assert.equal(context.manager.loadSaved(),false);
  assert.deepEqual(context.manager.snapshot(),removed);assert.equal(context.manager.validate().valid,true);
});

test('room expansion updates shared bounds and failed shrinking restores both rectangles',()=>{
  const roomBounds={...PLACEMENT_BOUNDS},navBounds={...navigationBounds};
  const context=fixture({roomBounds,navBounds}),root=addShopRoot(context,'shop-extension',[4.8,0,1]);
  assert.equal(context.manager.registerFurniture('shop-extension',root,SHOP_BOX),false);
  const expanded={minX:-6,maxX:6,minZ:-5,maxZ:5};
  assert.equal(context.manager.setBounds(expanded,expanded),true);
  assert.deepEqual(roomBounds,expanded);assert.deepEqual(navBounds,expanded);
  assert.equal(context.manager.registerFurniture('shop-extension',root,SHOP_BOX),true);
  assert.equal(context.manager.setBounds({...PLACEMENT_BOUNDS},{...navigationBounds}),false);
  assert.deepEqual(roomBounds,expanded);assert.deepEqual(navBounds,expanded);
  assert.equal(context.manager.validate().valid,true);
});

test('multi-seat callback replaces legacy fixed approach and rejects unavailable additional seats',()=>{
  let extra={x:2.5,z:2.5};
  const context=fixture({getApproach:()=>({x:999,z:999}),getSeatApproaches:(obstacles,bounds)=>{
    assert.ok(Array.isArray(obstacles));assert.equal(bounds,navigationBounds);
    return [{id:'sofa',point:{x:.65,z:2.83}},{id:'ottoman-a',point:extra}];
  }});
  assert.equal(context.manager.validate().valid,true,'invalid legacy point must not override the new seat resolver');
  extra=null;assert.equal(context.manager.validate().valid,false);
  extra={x:999,z:999};assert.equal(context.manager.validate().valid,false);
  extra={x:-.55,z:.87};assert.equal(context.manager.validate().valid,false,'points inside furniture remain invalid');
});

test('each seat needs a reachable path and checkPath false only skips connectivity',()=>{
  const scene=new Scene(),furniture=new Map();
  for(const id of ['seat-left','seat-right','wall']){const root=new Group();scene.add(root);furniture.set(id,root);}
  const harmless={boxes:[{center:[0,.01,0],size:[.1,.02,.1]}],blocksNavigation:false,blocksPlacement:false};
  const manager=createLayoutManager({furniture,definitions:{'seat-left':harmless,'seat-right':harmless,
    wall:{boxes:[{center:[0,.5,0],size:[.1,1,10]}],blocksPlacement:false,blocksNavigation:true}},
    roomBounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},navigationBounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},
    getPet:()=>({x:-2,z:0}),getSeatApproaches:()=>[{id:'seat-left',point:{x:-2,z:0}},{id:'seat-right',point:{x:2,z:0}}]});
  assert.equal(manager.validate({checkPath:false}).valid,true);
  assert.equal(manager.validate().valid,false);
  manager.definitions.wall.blocksNavigation=false;assert.equal(manager.validate().valid,true);
});

test('edit imports defer persistence and cancel restores both the visible layout and the prior stored layout',()=>{
  const adapter=memoryStorage(),{manager,events}=fixture({storageAdapter:adapter});
  assert.equal(manager.persist(),true);const before=manager.snapshot(),stored=adapter.data.get(manager.storageKey);
  assert.equal(manager.beginEdit(),true);assert.equal(manager.editing,true);
  const next=copy(before);next.furniture.table.position=[-.4,0,.87];
  assert.deepEqual(manager.importLayout(next,{persist:true}),{ok:true,reason:''});
  assert.equal(adapter.data.get(manager.storageKey),stored);
  assert.equal(events.findLast(event=>event.type==='layout-imported').persisted,false);
  assert.equal(manager.finishEdit({save:false}),true);assert.equal(manager.editing,false);
  assert.deepEqual(manager.snapshot(),before);assert.equal(adapter.data.get(manager.storageKey),stored);
});

test('edit completion persists exactly once and a failed write keeps the session cancelable',()=>{
  const adapter=memoryStorage(),{manager}=fixture({storageAdapter:adapter});let writes=0;
  const write=adapter.setItem;adapter.setItem=(...args)=>{writes++;return write(...args);};
  const before=manager.snapshot(),next=copy(before);next.furniture.table.position=[-.4,0,.87];
  assert.equal(manager.beginEdit(),true);assert.equal(manager.importLayout(next,{persist:true}).ok,true);
  assert.equal(writes,0);assert.equal(manager.finishEdit({save:true,persist:true}),true);assert.equal(writes,1);
  assert.equal(manager.finishEdit({save:true,persist:true}),false);assert.equal(writes,1);
  assert.deepEqual(JSON.parse(adapter.data.get(manager.storageKey)),copy(next));
  assert.equal(manager.beginEdit(),true);const edited=copy(next);edited.furniture.table.position=[-.45,0,.87];
  assert.equal(manager.importLayout(edited).ok,true);
  adapter.setItem=()=>{throw new Error('quota exceeded');};
  assert.equal(manager.finishEdit({save:true,persist:true}),false);assert.equal(manager.editing,true);
  assert.deepEqual(copy(manager.snapshot()),edited);
  assert.equal(manager.finishEdit({save:false}),true);assert.deepEqual(copy(manager.snapshot()),next);
});

test('v2.8.2 warehouse registry changes work inside an edit session and survive cancel',()=>{
  // 收回/摆回家具必须在装修会话内可用（仓库按钮位于装修面板）。
  // 变更同步进编辑入口快照，取消装修（finishEdit save:false）不会把它们回滚。
  const context=fixture(),root=addShopRoot(context);
  assert.equal(context.manager.beginEdit(),true);
  assert.equal(context.manager.registerFurniture('shop-cabinet-1',root,SHOP_BOX),true);
  assert.equal(context.manager.unregisterFurniture('table'),true);
  assert.equal(context.manager.setBounds({...PLACEMENT_BOUNDS},{...navigationBounds}),false);
  assert.equal(context.manager.finishEdit({save:false}),true);
  // 取消装修后：新注册的商店柜仍在、被注销的 table 不会复活。
  assert.equal(context.manager.snapshot().furniture['shop-cabinet-1']!==undefined,true);
  assert.equal(context.manager.snapshot().furniture.table===undefined,true);
  assert.equal(context.manager.registerFurniture('shop-cabinet-1',root,SHOP_BOX),false);
});

test('v2.8.3: unregister 被布局校验拒绝时家具保留注册，调用方不删 Map 则无孤儿、snapshot 正常',()=>{
  // 构造「校验恒失败」的座位提供者（软凳接近点非法）→ unregister 必被拒绝。
  const context=fixture({getSeatApproaches:()=>['ottoman-a','ottoman-b'].map(id=>({id,point:{x:99,z:99}}))});
  const removed=context.manager.unregisterFurniture('sofa');
  assert.equal(removed,false,'应返回 false 表示校验拒绝');
  // 修复后的调用方契约：拒绝时不删 Map 条目 → ids 与 Map 一致，snapshot 不崩。
  assert.equal(context.manager.definitions['sofa']!==undefined,true);
  assert.equal(context.furniture.has('sofa'),true);
  assert.ok(context.manager.snapshot().furniture['sofa']);
  // 旧的错误调用方（无视返回值强删 Map）→ 护栏给出可读错误而非 "reading 'position'"。
  context.furniture.delete('sofa');
  assert.throws(()=>context.manager.snapshot(),/布局内部状态不一致/);
});

test('v2.8.3: 孤儿 id（已删 Map 条目）被 snapshot/refresh 以可读错误拦截',()=>{
  const {manager,furniture}=fixture();
  furniture.delete('lamp-cabinet');
  assert.throws(()=>manager.snapshot(),/布局内部状态不一致/);
  assert.throws(()=>manager.refresh(),/布局内部状态不一致/);
});


test('idle room breeze keeps the real layout editable and snapshots valid after repeated frames',()=>{
  const {manager,furniture}=fixture(),before=manager.snapshot();
  const room=readFileSync(new URL('../room.js',import.meta.url),'utf8');
  const start=room.indexOf("  const swayable="),end=room.indexOf('  function schedule()',start);
  assert.ok(start>=0&&end>start);
  const context={THREE,furniture,commerceBusy:false,decoration:{active:false,pending:false},actor:{state:'idle'}};
  const ambient=new Function('context',`with(context){${room.slice(start,end)};return {swayDecor,resetSway};}`)(context);
  for(const now of [120,440,880,1300,2600])ambient.swayDecor(now);
  assert.deepEqual(manager.snapshot(),before,'ambient motion must never mutate account transforms');
  assert.equal(manager.validate().valid,true);
  assert.equal(manager.beginEdit(),true,'idle visual motion must not block entering decoration');
  context.decoration.active=true;ambient.swayDecor(2900);
  assert.equal(manager.finishEdit({save:true,persist:false}),true);
  assert.deepEqual(manager.snapshot(),before);
});
