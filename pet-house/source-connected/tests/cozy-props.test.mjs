import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createStoryBook,createDish,createTeaSet} from '../cozy-props.mjs';
import {blueprintProgress} from '../blueprint-progress.mjs';
import {newLifeState,applyLifeAction} from '../life-engine.mjs';
import {LIFE_CATALOG as C} from '../life-catalog.mjs';
import {createCompanionScene} from '../companion-scene.js';
import {createPetCharacter} from '../characters/pet-models.js';

test('storybook turns a real page without changing its anchor or size; reduced motion holds still',()=>{
 const p=createStoryBook();p.root.position.set(1,2,3);p.root.scale.setScalar(.7);const page=p.root.getObjectByName('storybook-turning-page');p.animate(1);const a=page.rotation.z;p.animate(1.8);assert.notEqual(page.rotation.z,a);assert.deepEqual(p.root.position.toArray(),[1,2,3]);assert.deepEqual(p.root.scale.toArray(),[.7,.7,.7]);p.animate(1,true);const still=page.rotation.z;p.animate(4,true);assert.equal(page.rotation.z,still);p.dispose();
});
test('three dishes have distinct silhouettes and every owned resource is released exactly once',()=>{
 const fingerprints=[];for(const recipe of ['cookies','juice','tea']){const p=createDish(recipe),scene=new THREE.Scene();scene.add(p.root);const resources=new Set();p.root.traverse(n=>{if(n.geometry)resources.add(n.geometry);if(n.material)resources.add(n.material);});const released=new Map();for(const x of resources)x.addEventListener('dispose',()=>released.set(x,(released.get(x)||0)+1));p.animate(1);p.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(p.root);fingerprints.push(JSON.stringify([box.getSize(new THREE.Vector3()).toArray(),resources.size]));p.dispose();p.dispose();assert.equal(scene.children.length,0);for(const x of resources)assert.equal(released.get(x),1,recipe);}
 assert.equal(new Set(fingerprints).size,3);assert.throws(()=>createDish('unknown'));
});
test('tea set cleanup removes nested animated props and releases their resources',()=>{const set=createTeaSet(),scene=new THREE.Scene();scene.add(set.root);set.animate(1);let count=0,freed=0;set.root.traverse(n=>{if(n.geometry){count++;n.geometry.addEventListener('dispose',()=>freed++);}});set.dispose();assert.equal(scene.children.length,0);assert.equal(freed,count);});
test('short blueprint paths are checked by the engine and preserve original story unlocks',()=>{
 const ctx={now:1800000000000,owned:[]},star=C.blueprints.find(b=>b.id==='star-lamp'),candy=C.blueprints.find(b=>b.id==='candy-tree');let state=newLifeState();assert.equal(blueprintProgress(star,state).unlocked,false);assert.throws(()=>applyLifeAction(state,{type:'craft',id:star.id},ctx));state=applyLifeAction(state,{type:'craft',id:'clover-planter'},ctx).state;assert.equal(blueprintProgress(star,state).unlocked,true);assert.deepEqual(applyLifeAction(state,{type:'craft',id:star.id},ctx).grants,[star.id]);assert.equal(blueprintProgress(candy,state).unlocked,false);state.inventory.carrot=2;state=applyLifeAction(state,{type:'cook',id:'cookies'},ctx).state;assert.equal(blueprintProgress(candy,state).unlocked,true);assert.deepEqual(applyLifeAction(state,{type:'craft',id:candy.id},ctx).grants,[candy.id]);
 const legacy=newLifeState();legacy.story.completed=['new-neighbor','garden-tea'];assert.equal(blueprintProgress(star,legacy).unlocked,true);assert.equal(blueprintProgress(candy,legacy).unlocked,true);
});
test('all five species share the selected dish, cleanly interrupt, and keep a single unchanged character',()=>{
 for(const sku of ['apricot-fox','cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']){
  const scene=new THREE.Scene(),character=createPetCharacter(sku),actor={root:new THREE.Group(),gait:new THREE.Group(),facing:new THREE.Group(),character,pose:character.pose,state:'idle'};actor.root.add(actor.gait);actor.gait.add(actor.facing);actor.facing.add(character.model);scene.add(actor.root);const before={position:actor.root.position.toArray(),scale:character.model.scale.toArray()};const fx=createCompanionScene({THREE,scene,doc:{},getActor:()=>actor,getFurniture:()=>new Map(),getSize:()=>({width:8.8,depth:8.2})});
  for(const recipe of ['cookies','juice','tea']){assert(fx.shareMeal(recipe));fx.frame(.8);scene.updateMatrixWorld(true);const meal=scene.getObjectByName('pet-shared-meal');assert(meal);assert.equal(meal.userData.recipe,recipe);const pos=meal.getWorldPosition(new THREE.Vector3());assert(pos.toArray().every(Number.isFinite));assert(pos.y>0&&pos.y<3,`${sku} snack anchor ${pos.y}`);fx.frame(3.1);assert.equal(scene.getObjectByName('pet-shared-meal'),undefined);assert.deepEqual(actor.root.position.toArray(),before.position);assert.deepEqual(character.model.scale.toArray(),before.scale);}
  fx.shareMeal('tea');fx.interrupt();assert.equal(scene.getObjectByName('pet-shared-meal'),undefined);assert.equal(fx.active,false);fx.shareMeal('cookies');fx.dispose();assert.equal(scene.getObjectByName('pet-shared-meal'),undefined);character.dispose();
 }
});
test('reduced motion sharing keeps a static prop, has no pose celebration and expires cleanly',()=>{
 const scene=new THREE.Scene(),character=createPetCharacter('mint-cat'),actor={root:new THREE.Group(),gait:new THREE.Group(),facing:new THREE.Group(),character,pose:character.pose,state:'idle'};actor.root.add(actor.gait);actor.gait.add(actor.facing);actor.facing.add(character.model);scene.add(actor.root);
 const fx=createCompanionScene({THREE,scene,doc:{},getActor:()=>actor,getFurniture:()=>new Map(),getSize:()=>({width:8,depth:8}),reducedMotion:true});assert(fx.shareMeal('tea'));fx.frame(.1);scene.updateMatrixWorld(true);const prop=scene.getObjectByName('pet-shared-meal'),snapshot=root=>{const values=[];root.traverse(n=>values.push([...n.position.toArray(),...n.rotation.toArray(),...n.scale.toArray()]));return values;},before=snapshot(prop),pose=snapshot(character.model);fx.frame(1);assert.deepEqual(snapshot(prop),before);assert.deepEqual(snapshot(character.model),pose);assert.deepEqual(actor.gait.position.toArray(),[0,0,0]);fx.frame(2.8);assert.equal(scene.getObjectByName('pet-shared-meal'),undefined);assert.equal(fx.active,false);fx.dispose();character.dispose();
});

test('all five species hold an animated reading book or tea, then restore their exact pose on interruption',()=>{
 for(const sku of ['apricot-fox','cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']){
  const scene=new THREE.Scene(),character=createPetCharacter(sku),actor={root:new THREE.Group(),gait:new THREE.Group(),facing:new THREE.Group(),character,pose:character.pose,state:'idle'};actor.root.add(actor.gait);actor.gait.add(actor.facing);actor.facing.add(character.model);scene.add(actor.root);
  const fx=createCompanionScene({THREE,scene,doc:{},getActor:()=>actor,getFurniture:()=>new Map(),getSize:()=>({width:8,depth:8})}),rest=new Map();character.model.traverse(n=>rest.set(n,n.rotation.clone()));
  for(const kind of ['read','tea']){assert(fx.startFurniture(kind));fx.frame(1);const prop=scene.getObjectByName('pet-furniture-prop');assert(prop);assert(prop.position.toArray().every(Number.isFinite));fx.frame(2);assert(scene.getObjectByName('pet-furniture-prop'));fx.interrupt();assert.equal(scene.getObjectByName('pet-furniture-prop'),undefined);for(const [n,r]of rest)assert(n.rotation.equals(r),n.name);}
  fx.dispose();character.dispose();
 }
});
