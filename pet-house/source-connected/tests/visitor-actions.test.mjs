import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from '../vendor/three/three.module.js';
import {createVisitorScene} from '../visitor-scene.mjs';
import {visitorPet} from '../visitor-avatar.mjs';

const doc={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
const guest={publicId:'PET-AAAAAAAAAA',name:'小云',pet:{sku:'cloud-bunny',petName:'云云',growthStage:'adult',outfit:{hat:'chef',scarf:'rose',backpack:'school'}}};
function setup(extra={}){const scene=new Scene(),events=[];let now=1000;const visitors=createVisitorScene({scene,doc,getSize:()=>({width:8,depth:8}),clock:()=>now,onAction:(phase,action)=>events.push([phase,action.id]),resolveAction:()=>({approach:{x:0,z:2},point:{x:0,y:1,z:1.7},yaw:Math.PI}),planPath:(_from,to)=>[to],...extra});return {scene,events,visitors,step(n=100){for(let i=0;i<n;i++){now+=50;visitors.frame(.05);}},now:v=>now=v};}
const action=(id,kind='read',extra={})=>({id,kind,targetId:'sofa',slotId:'main',startedAt:1000,expiresAt:20000,...extra});

test('visitor uses the exact species, outfit and public growth without another room or pet',()=>{
 const x=setup();x.visitors.set([guest]);const actor=x.scene.getObjectByName('visitor-'+guest.publicId);assert(actor.getObjectByName('Pet_cloud_bunny'));assert(actor.getObjectByName('growth-stage-adult'));assert(actor.getObjectByName('companion-hat'));assert.equal(x.scene.children.length,1);assert.deepEqual(x.visitors.getState()[0].pet,guest.pet);x.visitors.dispose();assert.equal(x.scene.children.length,0);
 assert.equal(visitorPet({sku:'<script>',growthStage:'secret',outfit:{hat:'bad'}}).sku,'apricot-fox');
});
test('walking follows waypoints before playing and repeated heartbeats never restart the action',()=>{
 const paths=[];const x=setup({planPath:(from,to,a,g)=>{paths.push([a.id,g.publicId]);return [{x:from.x,z:2},to];}});x.visitors.set([guest]);const before=x.visitors.getState()[0].position;
 const g={...guest,action:action('read-1')};x.visitors.set([g]);assert.deepEqual(x.visitors.getState()[0].position,before);x.step(1);const first=x.visitors.getState()[0];assert.equal(first.phase,'walking');assert(Math.hypot(first.position.x-before.x,first.position.z-before.z)<.1);x.visitors.set([g]);x.step();assert.equal(x.visitors.getState()[0].phase,'playing');assert.deepEqual(paths,[['read-1',guest.publicId]]);assert.equal(x.events.filter(e=>e[0]==='playing').length,1);assert(x.scene.getObjectByName('visitor-activity-prop'));x.visitors.dispose();
});
test('seat climbs and cancellation descends continuously before starting another activity',()=>{
 const x=setup();x.visitors.set([{...guest,action:action('seat-1','seat')}]);x.step(100);assert.equal(x.visitors.getState()[0].phase,'playing');const seated=x.visitors.getState()[0].position;assert(seated.y>.3);
 x.visitors.set([{...guest,action:action('tea-2','tea')}]);assert.deepEqual(x.visitors.getState()[0].position,seated);x.step(1);assert(x.visitors.getState()[0].position.y<seated.y);assert(x.visitors.getState()[0].position.y>.09);x.step(100);assert.equal(x.visitors.getState()[0].kind,'tea');assert.equal(x.visitors.getState()[0].phase,'playing');assert.equal(x.visitors.getState()[0].position.y,.09);x.visitors.dispose();
});
test('cancel and expiry release props once and stale action IDs cannot restart',()=>{
 const x=setup();const g={...guest,action:action('read-1')};x.visitors.set([g]);x.step();const prop=x.scene.getObjectByName('visitor-activity-prop');let releases=0;prop.traverse(p=>p.geometry?.addEventListener('dispose',()=>releases++));x.visitors.set([guest]);assert.equal(x.scene.getObjectByName('visitor-activity-prop'),undefined);assert(releases>0);const after=releases;x.visitors.set([g]);assert.equal(x.visitors.getState()[0].phase,'idle');assert.equal(releases,after);
 x.visitors.set([{...guest,action:action('water-2','water')}]);x.step(1);x.now(30000);x.visitors.frame(.05);assert.equal(x.visitors.getState()[0].actionId,null);assert(x.events.some(([p,id])=>p==='ended'&&id==='water-2'));x.visitors.dispose();assert.equal(releases,after);
});
test('unreachable and newly obstructed paths fail without passing through furniture',()=>{
 const x=setup({planPath:()=>null});x.visitors.set([{...guest,action:action('blocked')}]);assert.deepEqual(x.events,[['failed','blocked']]);assert.equal(x.visitors.getState()[0].phase,'idle');x.visitors.dispose();
 let blocked=false;const y=setup({canStand:x=>!blocked||x< -2});y.visitors.set([{...guest,action:action('moving')}]);blocked=true;y.step();assert(y.events.some(([phase])=>phase==='failed'));assert(y.visitors.getState()[0].position.x< -2);y.visitors.dispose();
});
test('reduced motion still moves along paths and greets only after reaching the owner',()=>{
 const x=setup({reducedMotion:true,resolveAction:()=>({approach:{x:0,z:2},yaw:-Math.PI/2})});x.visitors.set([guest]);const start=x.visitors.getState()[0].position;x.visitors.set([{...guest,action:action('hello','greet')}]);assert.deepEqual(x.visitors.getState()[0].position,start);assert.equal(x.events.some(([p])=>p==='playing'),false);x.step();assert.equal(x.visitors.getState()[0].phase,'playing');assert.equal(x.visitors.getState()[0].yaw,-Math.PI/2);x.visitors.dispose();
});
test('model replacement and repeated disposal release all private visual resources',()=>{
 const x=setup();x.visitors.set([guest]);const old=x.scene.getObjectByName('visitor-'+guest.publicId),resources=new Set();old.traverse(n=>{if(n.geometry&&!n.isSprite)resources.add(n.geometry);for(const m of n.material?[].concat(n.material):[]){resources.add(m);if(m.map)resources.add(m.map);if(m.gradientMap)resources.add(m.gradientMap);}});const counts=new Map();for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)||0)+1));
 const position=x.visitors.getState()[0].position;x.visitors.set([{...guest,pet:{...guest.pet,sku:'mint-cat'}}]);assert.deepEqual(x.visitors.getState()[0].position,position);assert(x.scene.getObjectByName('Pet_mint_cat'));assert.equal(x.scene.getObjectByName('Pet_cloud_bunny'),undefined);assert.equal(x.scene.getObjectByName('visitor-'+guest.publicId),old);assert.equal(counts.size,resources.size);assert([...counts.values()].every(n=>n===1));x.visitors.dispose();x.visitors.dispose();assert.equal(x.scene.children.length,0);
});
test('changing a seated guest species preserves position and descends instead of floating or replaying',()=>{
 const x=setup(),a=action('same-seat','seat');x.visitors.set([{...guest,action:a}]);x.step();const before=x.visitors.getState()[0].position;x.visitors.set([{...guest,pet:{...guest.pet,sku:'mint-cat'},action:a}]);assert.deepEqual(x.visitors.getState()[0].position,before);x.step(30);assert.equal(x.visitors.getState()[0].position.y,.09);assert.equal(x.visitors.getState()[0].phase,'idle');assert.equal(x.events.filter(([p])=>p==='playing').length,1);x.visitors.dispose();
});
test('target validation cancels a moved or removed seat before another animation frame',()=>{
 let valid=true;const x=setup({resolveAction:()=>({approach:{x:0,z:2},point:{x:0,y:1,z:1.7},isValid:()=>valid})});const a=action('moved-seat','seat');x.visitors.set([{...guest,action:a}]);x.step();const before=x.visitors.getState()[0].position;valid=false;x.step(1);assert.equal(x.visitors.getState()[0].actionId,null);assert(x.events.some(([p,id])=>p==='failed'&&id===a.id));assert(x.visitors.getState()[0].position.y<before.y);x.step(30);assert.equal(x.visitors.getState()[0].position.y,.09);x.visitors.set([{...guest,action:a}]);assert.equal(x.visitors.getState()[0].phase,'idle');x.visitors.dispose();
});
test('low frame rates travel the same real-time distance despite the room renderer capped dt',()=>{
 function run(fps){let now=1000;const x=setup({clock:()=>now,resolveAction:()=>({approach:{x:3.5,z:3.3},yaw:0})});x.visitors.set([{...guest,action:action('slow-walk','read')}]);const start=x.visitors.getState()[0].position;for(let i=0;i<fps*3;i++){now=1000+(i+1)*1000/fps;x.visitors.frame(Math.min(1/fps,.08));}const end=x.visitors.getState()[0].position;x.visitors.dispose();return {start,end};}
 const fast=run(60),slow=run(2);assert(Math.abs(fast.end.x-slow.end.x)<1e-6);assert(Math.abs(fast.end.z-slow.end.z)<1e-6);assert(Math.abs(slow.end.x-slow.start.x-1.65*3)<1e-6);
});
test('slow frames substep collision checks and cannot skip a newly blocked path',()=>{
 let now=1000,blocked=false;const checked=[],x=setup({clock:()=>now,resolveAction:()=>({approach:{x:3.5,z:3.3}}),canStand:(px,pz)=>{if(blocked)checked.push(px);return !blocked||px< -2.25||px> -1.5;}});x.visitors.set([{...guest,action:action('blocked-slow')}]);blocked=true;now+=1000;x.visitors.frame(.08);const state=x.visitors.getState()[0];assert.equal(state.lastFailure,'path-obstructed');assert(state.position.x< -2.25);assert(checked.length>=6,'catch-up checked intermediate positions');assert(Math.max(...checked)< -2.15,'never jumped across the blocker');x.visitors.dispose();
});
test('catch-up is bounded and a fresh command never inherits time spent idle',()=>{
 let now=1000;const x=setup({clock:()=>now,resolveAction:()=>({approach:{x:3.5,z:3.3}})});x.visitors.set([guest]);const start=x.visitors.getState()[0].position;now+=10000;x.visitors.set([{...guest,action:action('new-after-idle','read',{expiresAt:100000})}]);x.visitors.frame(.08);assert(Math.abs(x.visitors.getState()[0].position.x-start.x-.08*1.65)<1e-6);const before=x.visitors.getState()[0].position.x;now+=20000;x.visitors.frame(.08);assert(Math.abs(x.visitors.getState()[0].position.x-before-1.5*1.65)<1e-6);x.visitors.dispose();
});
