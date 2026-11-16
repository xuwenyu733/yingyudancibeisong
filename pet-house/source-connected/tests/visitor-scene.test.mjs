import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from '../vendor/three/three.module.js';
import {createVisitorScene} from '../visitor-scene.mjs';
import {applySceneQuality} from '../adaptive-quality.mjs';
test('adaptive shadow switching invalidates compiled materials before rendering',()=>{
 let disposed=0,invalidated=0;const renderer={shadowMap:{enabled:true}},light={shadow:{map:{dispose(){disposed++;}},mapSize:{set(){}}}},material={set needsUpdate(v){if(v)invalidated++;}},scene={traverse(fn){fn({material:[material]});fn({});}};
 applySceneQuality({renderer,light,scene,next:{shadows:false,shadowSize:256}});assert.equal(invalidated,1);assert.equal(disposed,1);assert.equal(light.shadow.map,null);assert.equal(renderer.shadowMap.enabled,false);
 applySceneQuality({renderer,light,scene,next:{shadows:false,shadowSize:256}});assert.equal(invalidated,1);
 applySceneQuality({renderer,light,scene,next:{shadows:true,shadowSize:1024}});assert.equal(invalidated,2);
});
test('visitors have separate identities, reuse geometry and leave no scene objects after departure',()=>{
 const scene=new Scene(),doc={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})},visitors=createVisitorScene({scene,doc,getSize:()=>({width:8,depth:8}),canStand:(x,z)=>x>0});
 visitors.set([{publicId:'PET-AAAAAAAAAA',name:'客人甲'},{publicId:'PET-BBBBBBBBBB',name:'客人乙'}]);assert.equal(visitors.count,2);const group=scene.getObjectByName('room-live-visitors');assert.equal(group.children.length,2);assert(group.children.every(p=>p.position.x>0));assert.notEqual(group.children[0].position.x,group.children[1].position.x);
 const original=group.children[0];visitors.set([{publicId:'PET-AAAAAAAAAA',name:'客人甲'}]);assert.equal(visitors.count,1);assert.equal(group.children[0],original);let released=0;original.children.find(x=>x.isSprite).material.map.addEventListener('dispose',()=>released++);visitors.set([]);assert.equal(released,1);assert.equal(group.children.length,0);visitors.dispose();visitors.dispose();assert.equal(scene.children.length,0);
});
test('heartbeat ordering and another guest leaving do not move an existing visitor',()=>{
 const scene=new Scene(),doc={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})},visitors=createVisitorScene({scene,doc,getSize:()=>({width:8,depth:8})}),a={publicId:'PET-AAAAAAAAAA',name:'甲'},b={publicId:'PET-BBBBBBBBBB',name:'乙'};
 visitors.set([a,b]);const figure=scene.getObjectByName('visitor-'+b.publicId),position=figure.position.clone();visitors.set([b,a]);assert(figure.position.equals(position),'a newer heartbeat must not swap positions');visitors.set([b]);assert(figure.position.equals(position),'another guest leaving must not move this guest');visitors.dispose();
});
test('a furniture change relocates a blocked visitor even when the guest list is unchanged',()=>{
 let blocked=false;const scene=new Scene(),doc={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})},visitors=createVisitorScene({scene,doc,getSize:()=>({width:8,depth:8}),canStand:x=>!blocked||x>0}),guest={publicId:'PET-AAAAAAAAAA',name:'甲'};
 visitors.set([guest]);const figure=scene.getObjectByName('visitor-'+guest.publicId);assert(figure.position.x<0);blocked=true;visitors.set([guest]);assert(figure.position.x>0,'guest cannot remain inside newly placed furniture');assert.equal(visitors.count,1);visitors.dispose();
});
