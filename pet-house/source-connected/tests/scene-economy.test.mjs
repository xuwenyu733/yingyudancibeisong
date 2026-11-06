import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Group,MeshToonMaterial,Vector3} from '../vendor/three/three.module.js';
import {createFurnitureCollider} from '../colliders.mjs';
import {applyRoomTier,createShopFurniture} from '../scene-economy.js';

const SKUS=['clover-planter','reading-shelf','cloud-table','moon-ornament'];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function materialCache(t){const cache=new Map();t.after(()=>cache.forEach(m=>m.dispose()));return color=>{if(!cache.has(color))cache.set(color,new MeshToonMaterial({color}));return cache.get(color);};}
function releaseRoot(root){root.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});}

test('each shop SKU creates an independent original floor item with merged material batches',t=>{
  const materials=materialCache(t);
  for(const sku of SKUS) {
    const {root,definition}=createShopFurniture(sku,materials);t.after(()=>releaseRoot(root));
    assert.equal(root.userData.furnitureId,`shop-${sku}`);assert.equal(root.userData.shopSku,sku);
    assert.equal(root.userData.interaction,undefined);assert.ok(definition.draggable&&definition.blocksNavigation&&definition.blocksPlacement);
    assert.ok(root.children.length>=3&&root.children.length<=8,'material batching keeps draw calls bounded');
    let triangles=0;
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;assert.ok(mesh.layers.isEnabled(1));assert.equal(mesh.material.map,null);
      triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
      for(const value of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(value));
    });
    assert.ok(triangles>100&&triangles<12000,`${sku}: ${triangles} triangles`);
    const bounds=new Box3().setFromObject(root),box=definition.boxes[0];
    for(const [axis,index]of [['x',0],['y',1],['z',2]]) {
      assert.ok(bounds.min[axis]>=box.center[index]-box.size[index]/2-1e-5,`${sku} min ${axis}`);
      assert.ok(bounds.max[axis]<=box.center[index]+box.size[index]/2+1e-5,`${sku} max ${axis}`);
    }
    assert.ok(bounds.min.y>=-1e-5);assert.ok(bounds.min.y<.04);
    root.rotation.y=Math.PI/4;root.scale.setScalar(.7);root.position.set(1,0,-1);root.updateMatrixWorld(true);
    const collider=createFurnitureCollider({id:root.name,boxes:definition.boxes,matrixWorld:root.matrixWorld});
    assert.ok(collider.aabb.minX<collider.aabb.maxX);assert.ok(collider.maxY>collider.minY);
  }
});

test('factories share host materials but never mutable geometry or collision definitions',t=>{
  const materials=materialCache(t),a=createShopFurniture('cloud-table',materials),b=createShopFurniture('cloud-table',materials);
  t.after(()=>releaseRoot(a.root));t.after(()=>releaseRoot(b.root));
  assert.equal(a.root.children[0].material,b.root.children[0].material);
  assert.notEqual(a.root.children[0].geometry,b.root.children[0].geometry);
  a.definition.boxes[0].size[0]=99;assert.ok(b.definition.boxes[0].size[0]<2);
  let releases=0;a.root.children[0].material.addEventListener('dispose',()=>releases++);
  createShopFurniture('moon-ornament',materials).root.traverse(node=>{if(node.isMesh)node.geometry.dispose();});assert.equal(releases,0);
  assert.throws(()=>createShopFurniture('missing',materials),RangeError);assert.throws(()=>createShopFurniture('cloud-table'),TypeError);
});

test('room expansion adjusts only shell XZ and wall attachments, preserves heights and does not compound',()=>{
  const furniture=new Map();for(const id of ['room-shell','arched-window','wall-pictures','pet','sofa','shop-cloud-table'])furniture.set(id,new Group());
  const shell=furniture.get('room-shell'),window=furniture.get('arched-window'),pictures=furniture.get('wall-pictures');
  shell.scale.y=1.2;window.position.set(1.2,2.18,-4);pictures.position.set(0,0,0);
  furniture.get('pet').position.set(1,.09,2);furniture.get('sofa').scale.setScalar(3.7);
  const pet=furniture.get('pet').position.clone(),sofaScale=furniture.get('sofa').scale.clone();
  const bounds={},placementBounds={};const first=applyRoomTier({furniture,width:11,depth:10,bounds,placementBounds});
  near(shell.scale.x,11/8.8);near(shell.scale.z,10/8.2);near(shell.scale.y,1.2);
  near(window.position.z,-4.9);near(window.position.x,1.2);near(window.position.y,2.18);near(pictures.position.z,-.9);
  assert.deepEqual(bounds,first.bounds);assert.deepEqual(placementBounds,first.placementBounds);near(bounds.maxX,5.46);near(bounds.maxZ,4.96);
  applyRoomTier({furniture,width:11,depth:10});near(shell.scale.x,11/8.8);near(shell.scale.z,10/8.2);
  assert.ok(furniture.get('pet').position.equals(pet));assert.ok(furniture.get('sofa').scale.equals(sofaScale));
  assert.ok(furniture.get('shop-cloud-table').scale.equals(new Vector3(1,1,1)));
  applyRoomTier({furniture,width:8.8,depth:8.2});near(shell.scale.x,1);near(shell.scale.z,1);near(window.position.z,-4);near(pictures.position.z,0);
  assert.throws(()=>applyRoomTier({furniture,width:Infinity,depth:10}),TypeError);assert.throws(()=>applyRoomTier({furniture,width:10,depth:0}),TypeError);
});
