import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createCompanionScene} from '../companion-scene.js';
import {createPetCharacter} from '../characters/pet-models.js';

const doc={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>({beginPath(){},roundRect(){},rect(){},fill(){},stroke(){},fillText(){}})};}};
function fixture(options={}){
  const scene=new THREE.Scene(),furniture=new Map(),root=new THREE.Group();root.position.set(2,.25,-1);root.rotation.y=.7;root.scale.set(1.7,1.4,1.2);
  const material=new THREE.MeshLambertMaterial({color:0x556677}),shared=new THREE.Mesh(new THREE.BoxGeometry(1,.5,1),material),other=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
  root.add(shared);scene.add(root,other);furniture.set('table',root);
  let celebrateCalls=0;const actor={root:new THREE.Group(),gait:new THREE.Group(),facing:new THREE.Group(),character:{model:new THREE.Group()},pose:{setCelebrate(){celebrateCalls++;}},state:'idle'};actor.root.add(actor.gait);actor.gait.add(actor.facing);actor.facing.add(actor.character.model);scene.add(actor.root);
  const fx=createCompanionScene({THREE,scene,doc,getActor:()=>actor,getFurniture:()=>furniture,getSize:()=>({width:8.8,depth:8.2}),...options});
  const state={petName:'团团',roomName:'糖果屋',outfit:{hat:'none',scarf:'none',backpack:'none'},garden:{flowers:0},growth:{days:1},rewards:[],furnitureStyles:{}};
  return {scene,furniture,root,shared,other,material,actor,fx,state,get celebrateCalls(){return celebrateCalls;}};
}
const transform=root=>({position:root.position.toArray(),rotation:root.rotation.toArray(),scale:root.scale.toArray()});

test('furniture landing changes only a visual child and returns to rest',()=>{
  const f=fixture(),before=transform(f.root);f.fx.land('table');f.fx.frame(.1);
  assert.deepEqual(transform(f.root),before);assert.ok(f.root.userData.feelPivot.position.y>0);
  f.fx.frame(.6);assert.deepEqual(transform(f.root),before);assert.deepEqual(f.root.userData.feelPivot.position.toArray(),[0,0,0]);assert.deepEqual(f.root.userData.feelPivot.scale.toArray(),[1,1,1]);assert.equal(f.fx.active,false);f.fx.dispose();
});

test('room restore interpolates the visual world position for exactly 300ms without moving saved roots',()=>{
  const f=fixture(),target=transform(f.root),old=[-2,.25,3];f.fx.transition({furniture:{table:{position:old,rotation:[0,-.2,0]}}});f.fx.frame(0);f.scene.updateMatrixWorld(true);
  assert.ok(f.root.userData.feelPivot.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...old))<1e-6);
  f.fx.frame(.15);assert.deepEqual(transform(f.root),target);assert.equal(f.fx.active,true);
  f.fx.frame(.15);assert.deepEqual(transform(f.root),target);assert.deepEqual(f.root.userData.feelPivot.position.toArray(),[0,0,0]);assert.equal(f.fx.active,false);f.fx.dispose();
});

test('furniture tint clones shared material and removing a style restores it',()=>{
  const f=fixture();f.fx.sync({...f.state,furnitureStyles:{table:{color:'#ff4488'}}});const tinted=f.shared.material;
  assert.notEqual(tinted,f.material);assert.equal(f.other.material,f.material);assert.equal(f.material.color.getHexString(),'556677');
  let released=0;tinted.addEventListener('dispose',()=>released++);f.fx.sync(f.state);assert.equal(f.shared.material,f.material);assert.equal(released,1);f.fx.dispose();
});

test('furniture rebuilt after storage gets its saved style even if preferences did not change',()=>{
  const f=fixture(),state={...f.state,furnitureStyles:{table:{color:'#ff4488'}}};f.fx.sync(state);
  const replacement=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),f.material);replacement.add(child);f.root.removeFromParent();f.scene.add(replacement);f.furniture.set('table',replacement);f.fx.sync(state);
  assert.notEqual(child.material,f.material,'重新取出的家具应重新应用已存颜色');assert.equal(child.material.color.getHexString(),'ff4488');f.fx.dispose();
});

test('dispose restores material and unfinished animation before releasing owned resources',()=>{
  const f=fixture();f.fx.sync({...f.state,furnitureStyles:{table:{color:'#ff4488'}}});let originalDisposed=0;f.material.addEventListener('dispose',()=>originalDisposed++);
  f.fx.land('table');f.fx.frame(.1);f.fx.dispose();assert.equal(f.shared.material,f.material,'不能把已dispose的副本留在家具上');assert.equal(originalDisposed,0,'不能释放宿主共有原材质');
  const pivot=f.root.userData.feelPivot;if(pivot){assert.deepEqual(pivot.position.toArray(),[0,0,0]);assert.deepEqual(pivot.scale.toArray(),[1,1,1]);}
});

test('textures released during resync are not retained and disposed again at final teardown',()=>{
  const f=fixture();f.fx.sync(f.state);const texture=f.scene.children.flatMap(root=>{const maps=[];root.traverse(n=>{if(n.material?.map)maps.push(n.material.map);});return maps;})[0];assert.ok(texture);
  let releases=0;texture.addEventListener('dispose',()=>releases++);f.fx.sync({...f.state,roomName:'新名字'});assert.equal(releases,1);f.fx.dispose();assert.equal(releases,1,'已释放名牌纹理不应留在资源集合中');
});

test('reduced motion avoids both visual and skeletal celebration animation',()=>{
  const f=fixture({reducedMotion:true}),before=transform(f.root);f.fx.land('table');f.fx.transition({furniture:{table:{position:[1,0,0],rotation:[0,0,0]}}});f.fx.react('cheer');f.fx.frame(.1);
  assert.deepEqual(transform(f.root),before);assert.equal(f.root.userData.feelPivot,undefined);assert.equal(f.celebrateCalls,0,'减少动态效果应同时关闭骨骼欢呼');f.fx.dispose();
});

test('growth multiplies a custom character scale once and restores the factory scale on teardown',()=>{
  const f=fixture(),model=f.actor.character.model;model.scale.set(.8,.9,1.1);f.fx.sync(f.state);assert.deepEqual(model.scale.toArray(),[.8,.9,1.1]);
  const grown={...f.state,growth:{days:8}};f.fx.sync(grown);const expected=[.8*1.07,.9*1.07,1.1*1.07];assert.deepEqual(model.scale.toArray(),expected);f.fx.sync({...grown,roomName:'另一间屋子'});assert.deepEqual(model.scale.toArray(),expected);
  f.fx.dispose();assert.deepEqual(model.scale.toArray(),[.8,.9,1.1]);
});

test('sticker and doodle are independently visible and cleaned when their style is removed',()=>{
  const f=fixture();f.fx.sync({...f.state,furnitureStyles:{table:{sticker:'heart',doodle:'rainbow'}}});const marks=[];f.root.traverse(n=>{if(n.userData.companionMark)marks.push(n.userData.companionMark);});assert.deepEqual(marks,['sticker','doodle']);
  const before=transform(f.root);f.fx.land('table');f.fx.frame(.1);f.fx.sync({...f.state,furnitureStyles:{table:{sticker:'star',doodle:'smile'}}});assert.deepEqual(transform(f.root),before);
  f.fx.sync(f.state);let left=0;f.root.traverse(n=>{if(n.userData.companionMark)left++;});assert.equal(left,0);f.fx.dispose();
});

test('all five pet hats sit at the actual head shell rather than at fixed ear-tip height',()=>{
  for(const sku of ['apricot-fox','cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']){
    const f=fixture(),character=createPetCharacter(sku);f.actor.character.model.removeFromParent();f.actor.character=character;f.actor.pose=character.pose;f.actor.facing.add(character.model);
    const before=transform(character.model);f.fx.sync({...f.state,outfit:{hat:'star',scarf:'mint',backpack:'school'}});f.fx.frame(0);f.scene.updateMatrixWorld(true);
    const hat=f.actor.facing.getObjectByName('companion-hat');assert.ok(hat,sku);let head;character.model.traverse(n=>{if(n.isMesh&&/HeadShell$/.test(n.name))head=n;});assert.ok(head);
    const anchor=head.localToWorld(new THREE.Vector3(0,head.geometry.boundingBox.max.y,0)),hatPoint=hat.getWorldPosition(new THREE.Vector3());assert.ok(anchor.distanceTo(hatPoint)<1e-5,`${sku}帽子锚定头部表面`);assert.deepEqual(transform(character.model),before);
    f.fx.dispose();character.dispose();
  }
});

test('unchanged reward data is removed from the scene when its real expiry boundary passes',()=>{
  const originalNow=Date.now;let now=Date.parse('2026-10-28T10:00:00Z');Date.now=()=>now;const f=fixture();
  try{
    const state={...f.state,rewards:[{id:'limited-flower',kind:'flower',expiresAt:'2026-10-28T10:01:00Z'},{id:'forever-star',kind:'star',expiresAt:null}]};
    f.fx.sync(state);const flower=f.scene.getObjectByName('companion-reward-limited-flower');assert.ok(flower);assert.ok(f.scene.getObjectByName('companion-reward-forever-star'));
    let geometryReleases=0;flower.traverse(node=>node.geometry?.addEventListener('dispose',()=>geometryReleases++));
    now+=60000;f.fx.sync(state);assert.equal(f.scene.getObjectByName('companion-reward-limited-flower'),undefined);assert.ok(geometryReleases>0);assert.ok(f.scene.getObjectByName('companion-reward-forever-star'));
  }finally{f.fx.dispose();Date.now=originalNow;}
});

test('night breathing and reactions are safe while the actor is absent',()=>{
  const f=fixture({getActor:()=>null});assert.doesNotThrow(()=>{f.fx.setNight(true);f.fx.sync(f.state);f.fx.react('nuzzle');f.fx.ritual();f.fx.frame(.2);});assert.equal(f.fx.active,false);f.fx.dispose();
});

const artDoc={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>new Proxy({}, {set(target,key,value){target[key]=value;return true;},get(target,key){return target[key]??(()=>{});}})};}};
function usePet(f,sku){const character=createPetCharacter(sku);f.actor.character.model.removeFromParent();f.actor.character=character;f.actor.pose=character.pose;f.actor.facing.add(character.model);return character;}

test('all five pets have separate baby, young and adult art and restore original proportions on teardown',()=>{
  for(const sku of ['apricot-fox','cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']){
    const f=fixture(),character=usePet(f,sku),original=new Map();character.model.traverse(node=>original.set(node,node.scale.toArray()));
    f.fx.sync(f.state);assert.ok(f.actor.facing.getObjectByName('growth-baby-bib'));
    f.fx.sync({...f.state,growth:{days:7}});assert.ok(f.actor.facing.getObjectByName('growth-young-cape'));assert.ok(f.actor.facing.getObjectByName('growth-young-satchel'));assert.equal(f.actor.facing.getObjectByName('growth-baby-bib'),undefined);
    f.fx.sync({...f.state,growth:{days:30},learningSeconds:7200});assert.ok(f.actor.facing.getObjectByName('growth-adult-cape'));assert.ok(f.actor.facing.getObjectByName('growth-adult-crest'));assert.equal(f.actor.facing.getObjectByName('growth-young-satchel'),undefined);
    f.fx.dispose();for(const[node,scale]of original)assert.deepEqual(node.scale.toArray(),scale,sku);character.dispose();
  }
});

test('all five pets curl and close both eyes at night, wake on movement, and preserve saved roots',()=>{
  for(const sku of ['apricot-fox','cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']){
    const f=fixture(),character=usePet(f,sku),rootBefore=transform(f.actor.root);f.fx.sync(f.state);
    const eyes=[];character.model.traverse(node=>{if(/EyeBlink_[LR]$/.test(node.name))eyes.push({node,scale:node.scale.clone()});});assert.equal(eyes.length,2);
    f.fx.setNight(true);f.fx.frame(.1);assert.equal(f.fx.sleeping,true);assert.ok(f.actor.gait.rotation.z>.9);for(const {node,scale}of eyes)assert.ok(node.scale.y<scale.y*.1);
    assert.deepEqual(transform(f.actor.root),rootBefore);f.actor.state='walking';f.fx.frame(.1);assert.equal(f.fx.sleeping,false);for(const {node,scale}of eyes)assert.deepEqual(node.scale.toArray(),scale.toArray());assert.equal(f.actor.gait.rotation.z,0);
    f.fx.dispose();character.dispose();
  }
});

test('treasure uses navigable waypoints, carries a temporary mouth prop and cleans it on interruption',()=>{
  const visited=[],f=fixture({canVisit:point=>point.x<=0});const character=usePet(f,'apricot-fox');f.fx.sync(f.state);
  f.actor.walkTo=point=>{visited.push(point);f.actor.state='walking';return true;};const rootBefore=transform(f.actor.root);
  assert.equal(f.fx.fetchGift({id:'found',kind:'star'}),true);assert.equal(visited.length,1);assert.ok(visited[0].x<=0);assert.deepEqual(transform(f.actor.root),rootBefore);
  f.actor.state='idle';f.fx.frame(.1);const prop=f.actor.facing.getObjectByName('pet-treasure-in-mouth');assert.ok(prop);assert.equal(visited.length,2);assert.deepEqual(visited[1],{x:0,z:0});assert.ok(prop.position.y>0);
  let releases=0;prop.traverse(node=>node.geometry?.addEventListener('dispose',()=>releases++));f.fx.interrupt();assert.equal(f.scene.getObjectByName('pet-treasure-in-mouth'),undefined);assert.ok(releases>0);assert.equal(f.fx.active,false);f.fx.dispose();character.dispose();
});

test('no treasure route crosses a wall or a rejected obstacle, and the full return animation releases the prop',()=>{
  const blocked=fixture({canVisit:()=>false});blocked.fx.sync(blocked.state);blocked.actor.walkTo=()=>{throw Error('blocked route must not start');};assert.equal(blocked.fx.fetchGift({kind:'star'}),false);blocked.fx.dispose();
  const f=fixture(),character=usePet(f,'mint-cat');f.fx.sync(f.state);f.actor.walkTo=()=>{f.actor.state='walking';return true;};assert.equal(f.fx.fetchGift({kind:'flower'}),true);
  f.actor.state='idle';f.fx.frame(.1);f.actor.state='idle';f.fx.frame(.2);for(let i=0;i<20;i++)f.fx.frame(.1);assert.equal(f.scene.getObjectByName('pet-treasure-in-mouth'),undefined);f.fx.dispose();character.dispose();
});

test('achievement maps and independent freehand decals are cleaned once without disposing original texture',()=>{
  const f=fixture({doc:artDoc}),originalMap=new THREE.Texture();f.material.map=originalMap;let originalReleases=0;originalMap.addEventListener('dispose',()=>originalReleases++);
  const drawing={version:1,strokes:[{tool:'brush',color:'#336699',size:.02,points:[[.2,.3],[.8,.7]]}]};
  f.fx.sync({...f.state,furnitureStyles:{table:{skinId:'study-1h',drawing}}},{badges:['study-1h']});assert.notEqual(f.shared.material.map,originalMap);const texture=f.shared.material.map;let skinReleases=0,drawingReleases=0;texture.addEventListener('dispose',()=>skinReleases++);
  let decal;f.root.traverse(node=>{if(node.userData.companionMark==='freehand')decal=node;});assert.ok(decal);decal.material.map.addEventListener('dispose',()=>drawingReleases++);
  f.fx.sync(f.state,{badges:['study-1h']});assert.equal(f.shared.material,f.material);assert.equal(skinReleases,1);assert.equal(drawingReleases,1);assert.equal(originalReleases,0);f.fx.dispose();assert.equal(skinReleases,1);assert.equal(originalReleases,0);
});

test('unearned achievement skin is not applied and SKU rewards are not duplicated as fixed garden props',()=>{
  const f=fixture({doc:artDoc});f.fx.sync({...f.state,furnitureStyles:{table:{skinId:'study-50h'}},rewards:[{id:'secret-star',kind:'star',sku:'gift-star-secret-star'}]},{badges:[]});assert.equal(f.shared.material,f.material);assert.equal(f.scene.getObjectByName('companion-reward-secret-star'),undefined);f.fx.dispose();
});

test('freehand texture and fitted plane preserve the 512 by 320 editor aspect under furniture scaling',()=>{
  const f=fixture({doc:artDoc}),drawing={version:1,strokes:[{tool:'brush',color:'#336699',size:.02,points:[[.2,.3],[.8,.7]]}]};
  f.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(f.root),extent=bounds.getSize(new THREE.Vector3());
  f.fx.sync({...f.state,furnitureStyles:{table:{drawing}}});f.scene.updateMatrixWorld(true);let decal;f.root.traverse(node=>{if(node.userData.companionMark==='freehand')decal=node;});assert.ok(decal);
  assert.equal(decal.material.map.image.width,512);assert.equal(decal.material.map.image.height,320);assert.equal(decal.geometry.parameters.width/decal.geometry.parameters.height,512/320);
  const p=decal.geometry.getAttribute('position'),corners=Array.from({length:4},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(decal.matrixWorld));
  const width=corners[0].distanceTo(corners[1]),height=corners[0].distanceTo(corners[2]);assert.ok(Math.abs(width/height-512/320)<1e-6);
  assert.ok(width<=extent.x*.8+1e-6);assert.ok(height<=extent.z*.8+1e-6);f.fx.dispose();
});
