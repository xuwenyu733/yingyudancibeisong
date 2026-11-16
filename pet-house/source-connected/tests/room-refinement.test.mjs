import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveQuality} from '../adaptive-quality.mjs';
import {findPlacementSuggestion,createPlacementMarkers} from '../placement-assist.mjs';
import {ACTIVITY_CHOICES,activityChoice} from '../activity-content.mjs';
import {createCompanionStore,validateCompanion,defaultCompanion} from '../companion-state.mjs';
import {Scene,Mesh,BoxGeometry,MeshBasicMaterial} from '../vendor/three/three.module.js';

function sample(q,{from=0,to=20000,interval=50,cost=25,active=true}={}){for(let now=from;now<to;now+=interval)q.sample({now,interval,cost,active});}
test('quality waits for sustained load, steps down with cooldown, then restores its original cap',()=>{
 const changes=[],q=createAdaptiveQuality({onChange:s=>changes.push(s)});
 sample(q,{to:4000});assert.equal(q.getState().level,0);
 sample(q,{from:4000,to:7000});assert.equal(q.getState().level,1);
 sample(q,{from:7000,to:12000});assert.equal(q.getState().level,1);
 sample(q,{from:12000});assert.equal(q.getState().level,2);assert.equal(q.getState().shadows,false);
 sample(q,{from:20000,to:55000,interval:16.667,cost:3});assert.equal(q.getState().level,0);assert.equal(q.getState().maxPixelRatio,1.5);assert.equal(changes.length,4);
});
test('background, idle saving and long pause never lower display quality',()=>{
 for(const args of [{active:false},{interval:1000}]){const q=createAdaptiveQuality();sample(q,{...args,to:90000});assert.equal(q.getState().level,0);}
});
test('manual quality remains fixed and mobile 30 FPS is not mistaken for poor performance',()=>{
 const fixed=createAdaptiveQuality({enabled:false});sample(fixed);assert.equal(fixed.getState().level,0);
 const mobile=createAdaptiveQuality({maxFPS:30,pixelRatio:1.25});sample(mobile,{interval:33.334,cost:4,to:60000});assert.equal(mobile.getState().level,0);
});
function placement({validAt=3,throwAt=0}={}){
 const before={furniture:{chair:{position:[0,0,0]}}};let current=structuredClone(before),checks=0;
 const manager={snapshot:()=>structuredClone(current),previewTransform(id,patch){current.furniture[id]=structuredClone(patch);return true;},validate(){checks++;if(checks===throwAt)throw Error('validation failed');return {valid:checks>=validAt};},restore(value){current=structuredClone(value);return true;}};
 return {manager,before,get checks(){return checks;}};
}
test('space suggestion leaves layout unchanged until explicitly committed',async()=>{
 const f=placement();const patch=await findPlacementSuggestion({...f,id:'chair',width:8,depth:8});assert(patch);assert.notDeepEqual(patch.position,[0,0,0]);assert.deepEqual(f.manager.snapshot(),f.before);
});
test('cancelled search restores original before yielding to user interaction',async()=>{
 const f=placement({validAt:999});let cancelled=false,yields=0;
 const patch=await findPlacementSuggestion({...f,id:'chair',width:8,depth:8,cancelled:()=>cancelled,yieldTask:async()=>{yields++;assert.deepEqual(f.manager.snapshot(),f.before);cancelled=true;}});
 assert.equal(patch,null);assert.equal(yields,1);assert.equal(f.checks,8);assert.deepEqual(f.manager.snapshot(),f.before);
});
test('failed candidate validation still rolls back',async()=>{
 const f=placement({throwAt:2});await assert.rejects(findPlacementSuggestion({...f,id:'chair',width:8,depth:8}),/validation failed/);assert.deepEqual(f.manager.snapshot(),f.before);
});
test('unavailable candidate reports no result without moving furniture',async()=>{
 const f=placement({validAt:999});assert.equal(await findPlacementSuggestion({...f,id:'chair',width:8,depth:8,yieldTask:async()=>{}}),null);assert.deepEqual(f.manager.snapshot(),f.before);assert(f.checks<=180);
});
test('temporary placement markers preserve all furniture transforms and release GPU resources',()=>{
 const scene=new Scene(),chair=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());chair.position.set(1,0,1);scene.add(chair);const before=chair.matrix.clone(),markers=createPlacementMarkers(scene,new Map([['chair',chair]]));
 markers.suggest('chair',{position:[2,0,3]});assert.equal(scene.children.length,2);assert.deepEqual(chair.position.toArray(),[1,0,1]);const mark=scene.children[1];let freed=0;mark.geometry.addEventListener('dispose',()=>freed++);mark.material.addEventListener('dispose',()=>freed++);markers.clear();assert.equal(freed,2);assert.equal(scene.children.length,1);markers.dispose();chair.geometry.dispose();chair.material.dispose();
});
test('story and tea choices have distinct content and invalid IDs fall back safely',()=>{
 assert.equal(ACTIVITY_CHOICES.read.length,3);assert.equal(ACTIVITY_CHOICES.tea.length,3);assert.equal(new Set(ACTIVITY_CHOICES.tea.map(x=>x.recipe)).size,3);
 for(const c of ACTIVITY_CHOICES.read)assert.equal(c.pages.length,3);assert.equal(activityChoice('read','invalid').id,'forest');assert.equal(activityChoice('water','x'),null);
});
test('junior style persists through reload and rejects invalid values without changing saves',()=>{
 const data=new Map(),adapter={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},key='style-companion';const store=createCompanionStore({adapter,key});assert(store.update({ageMode:'junior'}).ok);assert.equal(createCompanionStore({adapter,key}).getState().ageMode,'junior');const before=data.get(key);assert.equal(store.update({ageMode:'unknown'}).ok,false);assert.equal(data.get(key),before);assert.equal(validateCompanion(defaultCompanion()).ageMode,'kindergarten');
});
