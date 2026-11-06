import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {buildDecor} from '../decor.js';import {createDisposer} from '../runtime.mjs';
function setup(){const scene=new THREE.Scene(),materials=new Map();const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshToonMaterial({color}));return materials.get(color);};return {scene,...buildDecor(scene,material)};}
test('static batching preserves independently editable furniture while reducing decoration mesh calls',()=>{
  const {scene,items,floor}=setup();let meshes=0;
  scene.traverse(object=>{if(object.isMesh)meshes++;assert.ok(!object.isLine&&!object.isLineSegments);});
  assert.ok(meshes<75,`${meshes} decoration meshes`);assert.equal(floor.parent,items.get('room-shell'));
  for(const [id,root]of items){assert.equal(root.name,id);assert.equal(root.userData.furnitureId,id);assert.ok(root.children.length>0);}
  createDisposer().tree(scene);
});
test('merged cabinet geometry stays in local coordinates with original world dimensions',()=>{
  const {scene,items}=setup(),cabinet=items.get('lamp-cabinet'),box=new THREE.Box3().setFromObject(cabinet);
  assert.ok(Math.abs(box.min.x-(-2.37-.635))<1e-5);assert.ok(Math.abs(box.max.y-1.12)<1e-5);
  const width=box.max.x-box.min.x;cabinet.position.x+=1;cabinet.updateMatrixWorld(true);
  const moved=new THREE.Box3().setFromObject(cabinet);assert.ok(Math.abs(moved.min.x-box.min.x-1)<1e-5);assert.ok(Math.abs(moved.max.x-moved.min.x-width)<1e-5);
  createDisposer().tree(scene);
});
