import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createPetCharacter} from '../characters/pet-models.js';
import {createPlayScene} from '../play-scene.js';
import {advanceBall,petRegionFor,BALL_RADIUS} from '../play-physics.mjs';

const doc={createElement(){return {width:0,height:0,getContext(){return {clearRect(){},fillRect(){},fillText(){}};}};}};
function fixture(extra={}){
  const scene=new THREE.Scene(),character=createPetCharacter('apricot-fox'),root=new THREE.Group(),facing=new THREE.Group();root.position.set(0,.09,1.5);root.add(facing);facing.add(character.model);scene.add(root);
  const actor={root,facing,character,pose:character.pose,state:'idle',ctrl:{},walkTo(point){actor.destination=point;return true;}},furniture=new Map(),events=[];
  const play=createPlayScene({THREE,scene,doc,getActor:()=>actor,getSize:()=>({width:8.8,depth:8.2}),getFurniture:()=>furniture,onEvent:(type,detail)=>events.push({type,detail}),...extra});
  return {scene,actor,character,furniture,events,play,close(){play.dispose();character.dispose();}};
}
function rayAt(position,target){const ray=new THREE.Raycaster();ray.set(position,new THREE.Vector3().subVectors(target,position).normalize());return ray;}
test('ball bounces off bounds and furniture without tunnelling, then comes to rest',()=>{
  const ball={x:0,z:0,y:.31,vx:20,vz:0,vy:2},bounds={minX:-3,maxX:3,minZ:-3,maxZ:3};
  advanceBall(ball,.12,{bounds,blocked:(x,z)=>x>=.8&&x<=.9&&Math.abs(z)<1});assert.ok(ball.x<.8);assert.ok(ball.vx<0);
  for(let i=0;i<400;i++)advanceBall(ball,.04,{bounds});assert.ok(ball.x>=bounds.minX&&ball.x<=bounds.maxX);assert.equal(ball.y,BALL_RADIUS+.09);assert.equal(ball.vx,0);assert.equal(ball.vz,0);
});
test('books restore, spawn once per learning ID, cap visible slots, and own resources dispose once',()=>{
  const f=fixture();f.play.sync({learningEvents:['a','a','b']});assert.equal(f.play.getState().books,2);assert.equal(f.events.length,0);
  f.play.sync({learningEvents:['a','b','c']});assert.equal(f.play.getState().visibleBooks,3);assert.equal(f.events[0].type,'learning-book-spawned');assert.equal(f.play.active,true);
  f.play.sync({learningEvents:['a','b','c']});assert.equal(f.events.length,1);for(let i=0;i<20;i++)f.play.update(.08);
  const ids=Array.from({length:45},(_,i)=>`lesson-${i}`);f.play.sync({learningEvents:ids});assert.equal(f.play.getState().books,45);assert.equal(f.play.getState().visibleBooks,32);
  const shelf=f.scene.getObjectByName('play-bookshelf'),ownedMaterial=shelf.children.find(node=>node.isMesh).material;let disposals=0;ownedMaterial.addEventListener('dispose',()=>disposals++);f.play.dispose();f.play.dispose();assert.equal(disposals,1);assert.equal(f.scene.getObjectByName('play-world'),undefined);f.character.dispose();
});
test('clicking ball walks to reachable kicking distance instead of teleporting the animal',()=>{
  const f=fixture();f.play.sync({learningEvents:[]});f.play.update(0);const before=f.actor.root.position.clone(),ball=f.play.getState().ball;
  f.actor.root.position.set(-3,.09,3);const ray=rayAt(new THREE.Vector3(ball.x,ball.y+3,ball.z),new THREE.Vector3(ball.x,ball.y,ball.z)),result=f.play.interact(ray);
  assert.equal(result.kind,'ball');assert.equal(result.handled,true);assert.ok(f.actor.destination);assert.equal(f.actor.root.position.x,-3);assert.equal(f.play.getState().pendingKick,true);
  f.actor.root.position.set(f.actor.destination.x,.09,f.actor.destination.z);f.play.update(.08);assert.equal(f.play.getState().pendingKick,false);assert.ok(Math.hypot(f.play.getState().ball.vx,f.play.getState().ball.vz)>1);assert.ok(f.events.some(event=>event.type==='ball-kicked'));assert.notDeepEqual(f.actor.root.position,before);f.close();
});
test('pet hit regions resolve named mesh ancestry and animated wrappers unwrap cleanly',()=>{
  const f=fixture();f.play.sync({learningEvents:[]});f.play.update(0);let head;f.character.model.traverse(node=>{if(node.name==='Fox_HeadShell')head=node;});assert.equal(petRegionFor(head,f.character.model),'head');
  f.scene.updateMatrixWorld(true);const target=head.getWorldPosition(new THREE.Vector3()),ray=rayAt(target.clone().add(new THREE.Vector3(0,0,3)),target),result=f.play.interact(ray);
  assert.equal(result.kind,'primary');assert.equal(result.region,'head');const headJoint=f.character.model.getObjectByName('Fox_Head'),children=headJoint.children.filter(child=>child.name!=='play-reaction-pivot');assert.equal(children.length,0);
  f.actor.pose.update(.1);f.play.update(.1);assert.ok(headJoint.children[0].rotation.x<0);f.play.dispose();assert.ok(headJoint.children.some(node=>node===head));assert.ok(!f.character.model.getObjectByName('play-reaction-pivot'));f.character.dispose();
});
test('occluding furniture wins and animal dragging rejects blocked destinations',()=>{
  const f=fixture({canVisit:point=>point.x<1});f.play.sync({learningEvents:[]});f.play.update(0);const state=f.play.getState(),ball=state.ball;
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(1,.3,1),new THREE.MeshBasicMaterial());blocker.position.set(ball.x,ball.y+1,ball.z);f.scene.add(blocker);f.furniture.set('blocker',blocker);
  const ray=rayAt(new THREE.Vector3(ball.x,ball.y+3,ball.z),new THREE.Vector3(ball.x,ball.y,ball.z));assert.equal(f.play.interact(ray).handled,false);assert.equal(f.play.leadBuddy({x:2,z:1}),false);assert.equal(f.play.leadBuddy({x:-2,z:-2}),true);
  for(let i=0;i<50;i++)f.play.update(.08);assert.ok(f.play.getState().buddy.x<1);assert.ok(f.play.getState().buddy.z<state.buddy.z);f.close();blocker.geometry.dispose();blocker.material.dispose();
});
