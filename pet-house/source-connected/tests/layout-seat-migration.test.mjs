import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Scene} from '../vendor/three/three.module.js';
import {createLayoutManager} from '../layout-manager.js';

function fixture({grandfather=false,open=false,adapter}={}){
  const scene=new Scene(),furniture=new Map(),definitions={},pet={x:8,z:5};
  const room={minX:0,maxX:10,minZ:0,maxZ:10};
  for(const [id,x,z,wall]of [['wall',5,5,true],['legacy',2,5,false],['reachable',8,7,false]]){
    const root=new Group();root.position.set(x,0,z);scene.add(root);furniture.set(id,root);
    definitions[id]={label:id,draggable:true,blocksNavigation:wall,blocksPlacement:wall,boxes:[{center:[0,.5,0],size:wall?[.4,1,10]:[.4,1,.4]}]};
  }
  if(open)furniture.get('wall').scale.z=.4;
  const manager=createLayoutManager({furniture,definitions,roomBounds:room,navigationBounds:{...room},petRadius:.2,getPet:()=>pet,
    getSeatApproaches:()=>['legacy','reachable'].map(id=>({id,point:{x:furniture.get(id).position.x,z:furniture.get(id).position.z}})),
    afterUpdate:()=>scene.updateMatrixWorld(true),storageAdapter:adapter,storageKey:'layout',grandfatherUnreachableSeats:grandfather});
  return {manager,furniture,pet,scene};
}
function memory(raw=null){return {raw,writes:0,blocked:false,getItem(){return this.raw;},setItem(_key,value){if(this.blocked)throw new Error('quota');this.writes++;this.raw=value;}};}

test('strict default still rejects unreachable seats, while migration retains exact furniture without a write',()=>{
  const strict=fixture(),adapter=memory(),legacy=fixture({grandfather:true,adapter});
  assert.equal(strict.manager.validate().valid,false);assert.deepEqual(strict.manager.blockedSeats,[]);
  assert.deepEqual(legacy.manager.validate(),{valid:true,reason:''});assert.deepEqual(legacy.manager.blockedSeats,['legacy']);
  assert.deepEqual(legacy.manager.snapshot(),strict.manager.snapshot());assert.equal(adapter.writes,0);assert.equal(adapter.raw,null);
  const copy=legacy.manager.blockedSeats;copy.length=0;assert.deepEqual(legacy.manager.blockedSeats,['legacy'],'returned IDs cannot mutate the exception set');
  assert.deepEqual(legacy.manager.findSafePetPosition(),legacy.pet);
});

test('legacy exceptions do not permit blocking a previously reachable seat',()=>{
  const f=fixture({grandfather:true}),before=f.manager.snapshot();
  assert.equal(f.manager.previewTransform('reachable',{position:[2,0,7]}),true);
  assert.match(f.manager.validate().reason,/reachable/);assert.equal(f.manager.commit(before),false);
  assert.deepEqual(f.manager.snapshot(),before);assert.deepEqual(f.manager.blockedSeats,['legacy']);
});

test('preview and validation never retire exceptions; an accepted repair does, and reblocking is rejected',()=>{
  const f=fixture({grandfather:true}),before=f.manager.snapshot();
  assert.equal(f.manager.previewTransform('wall',{scale:[1,1,.4]}),true);f.manager.refresh();assert.equal(f.manager.validate().valid,true);
  assert.deepEqual(f.manager.blockedSeats,['legacy']);assert.equal(f.manager.restore(before),true);assert.equal(f.manager.validate().valid,true);
  assert.deepEqual(f.manager.blockedSeats,['legacy']);
  f.manager.previewTransform('wall',{scale:[1,1,.4]});assert.equal(f.manager.commit(before),true);assert.deepEqual(f.manager.blockedSeats,[]);
  const repaired=f.manager.snapshot();f.manager.previewTransform('wall',{scale:[1,1,1]});assert.equal(f.manager.commit(repaired),false);
  assert.deepEqual(f.manager.snapshot(),repaired);assert.deepEqual(f.manager.blockedSeats,[]);
});

test('failed persisted repair restores transforms and its prior exception baseline',()=>{
  const adapter=memory(),f=fixture({grandfather:true,adapter}),before=f.manager.snapshot();adapter.blocked=true;
  f.manager.previewTransform('wall',{scale:[1,1,.4]});assert.equal(f.manager.commit(before,{persist:true}),false);
  assert.deepEqual(f.manager.snapshot(),before);assert.deepEqual(f.manager.blockedSeats,['legacy']);assert.equal(adapter.writes,0);
  adapter.blocked=false;f.manager.previewTransform('wall',{scale:[1,1,.4]});assert.equal(f.manager.commit(before,{persist:true}),true);
  assert.deepEqual(f.manager.blockedSeats,[]);assert.equal(adapter.writes,1);
});

test('startup restore captures saved legacy barriers without rewriting and malformed restore keeps the baseline',()=>{
  const saved=fixture().manager.snapshot(),adapter=memory(JSON.stringify(saved)),f=fixture({grandfather:true,open:true,adapter});
  assert.deepEqual(f.manager.blockedSeats,[]);assert.equal(f.manager.loadSaved(),true);assert.deepEqual(f.manager.snapshot(),saved);
  assert.deepEqual(f.manager.blockedSeats,['legacy']);assert.equal(adapter.raw,JSON.stringify(saved));assert.equal(adapter.writes,0);
  const malformed=structuredClone(saved);malformed.furniture.wall.position=[20,0,5];adapter.raw=JSON.stringify(malformed);
  assert.equal(f.manager.loadSaved(),false);assert.deepEqual(f.manager.blockedSeats,['legacy']);assert.equal(adapter.raw,JSON.stringify(malformed));assert.equal(adapter.writes,0);
});

test('canceling an edit restores its original legacy baseline even after a successful preview commit repaired it',()=>{
  const f=fixture({grandfather:true}),before=f.manager.snapshot();assert.equal(f.manager.beginEdit(),true);
  f.manager.previewTransform('wall',{scale:[1,1,.4]});assert.equal(f.manager.commit(before),true);assert.deepEqual(f.manager.blockedSeats,[]);
  assert.equal(f.manager.finishEdit({save:false,persist:false}),true);assert.deepEqual(f.manager.snapshot(),before);
  assert.deepEqual(f.manager.blockedSeats,['legacy']);assert.equal(f.manager.validate().valid,true);
});

test('accepted external transactions may retire a repaired legacy seat without granting new exceptions',()=>{
  const f=fixture({grandfather:true});f.manager.previewTransform('wall',{scale:[1,1,.4]});assert.deepEqual(f.manager.acceptNavigationState(),[]);
  f.manager.previewTransform('wall',{scale:[1,1,1]});assert.equal(f.manager.validate().valid,false);assert.deepEqual(f.manager.acceptNavigationState(),[]);
});

test('navigation baseline copies can be restored exactly, and invalid source points or IDs do not replace it',()=>{
  const f=fixture({grandfather:true}),original=f.manager.getNavigationBaseline();original.length=0;
  assert.deepEqual(f.manager.getNavigationBaseline(),['legacy']);
  for(const from of [{x:NaN,z:5},{x:11,z:5},{x:5,z:5}]){
    assert.equal(f.manager.resetNavigationBaseline(from),null);assert.deepEqual(f.manager.blockedSeats,['legacy']);
  }
  assert.equal(f.manager.restoreNavigationBaseline(['missing']),false);assert.equal(f.manager.restoreNavigationBaseline(['legacy','legacy']),false);
  assert.deepEqual(f.manager.blockedSeats,['legacy']);
  f.manager.previewTransform('wall',{scale:[1,1,.4]});f.manager.acceptNavigationState();assert.deepEqual(f.manager.getNavigationBaseline(),[]);
  f.manager.previewTransform('wall',{scale:[1,1,1]});assert.equal(f.manager.validate().valid,false);
  assert.deepEqual(f.manager.resetNavigationBaseline({x:8,z:5}),['legacy'],'a trusted room-slot transition can preserve that slot\'s existing inaccessible seat');
  assert.equal(f.manager.restoreNavigationBaseline([]),true);assert.equal(f.manager.validate().valid,false,'precise rollback restores the strict original baseline');
});

test('a shrinking room can choose an internal unblocked spawn before capturing its seat baseline',()=>{
  const f=fixture({grandfather:true});f.pet.x=12;
  assert.equal(f.manager.resetNavigationBaseline(),null);assert.deepEqual(f.manager.blockedSeats,['legacy']);
  const point=f.manager.findSafePetPosition({checkSeats:false});assert.ok(point);assert.ok(point.x>=0&&point.x<=10&&point.z>=0&&point.z<=10);
  assert.deepEqual(f.manager.resetNavigationBaseline(point),['legacy']);
  Object.assign(f.pet,point);assert.equal(f.manager.validate().valid,true);
});
