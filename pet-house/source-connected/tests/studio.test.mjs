import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {groupTransforms,STUDIO_STEPS} from '../studio-art.mjs';
import {defaultCompanion,validateCompanion,createCompanionStore,COMPANION_SUFFIX} from '../companion-state.mjs';
import {createEstateStore} from '../estate-state.mjs';
import {snapshotRoom,validateRoomSnapshot} from '../room-world.mjs';
import {createStudioScene} from '../studio-scene.js';
import {SHOP_CATALOG} from '../economy.mjs';

test('old saves receive optional studio defaults; invalid themes and unbounded guide records are rejected',()=>{
 const old=defaultCompanion();delete old.roomArt;delete old.studioSteps;const fresh=validateCompanion(old);assert.equal(fresh.roomArt,'original');assert.deepEqual(fresh.studioSteps,[]);
 assert.throws(()=>validateCompanion({...old,roomArt:'unknown'}));assert.throws(()=>validateCompanion({...old,studioSteps:['purchase-credit']}));assert.throws(()=>validateCompanion({...old,studioSteps:Array(100).fill('theme')}));
 assert.deepEqual(validateCompanion({...old,studioSteps:['theme','trial','theme']}).studioSteps,['theme','trial']);
});
test('themes persist independently per floor; onboarding is shared and public snapshots keep the theme only',()=>{
 const values=new Map(),adapter={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},key='studio-test';
 const estate=createEstateStore({storageAdapter:adapter,storageKey:key,initialPoints:1000});assert(estate.createRoom().ok);
 const first=createCompanionStore({adapter:estate.storageForRoom('room-1'),key:key+COMPANION_SUFFIX}),second=createCompanionStore({adapter:estate.storageForRoom('room-2'),key:key+COMPANION_SUFFIX});
 assert(first.update({roomArt:'forest',studioSteps:['theme','trial']}).ok);assert.equal(second.getState().roomArt,'original');assert.deepEqual(second.getState().studioSteps,['theme','trial']);assert(second.update({roomArt:'space'}).ok);
 const reloaded=createEstateStore({storageAdapter:adapter,storageKey:key});assert.equal(createCompanionStore({adapter:reloaded.storageForRoom('room-1'),key:key+COMPANION_SUFFIX}).getState().roomArt,'forest');assert.equal(createCompanionStore({adapter:reloaded.storageForRoom('room-2'),key:key+COMPANION_SUFFIX}).getState().roomArt,'space');
 const raw=JSON.parse(values.get(key+'-estate-v1')),snapshot=snapshotRoom(raw.rooms[0],{storageKey:key});assert.equal(validateRoomSnapshot(snapshot).companion.roomArt,'forest');assert.equal(Object.hasOwn(snapshot.companion,'studioSteps'),false);
});
test('group rotations retain pairwise distance, vertical positions and individual size without mutating the original',()=>{
 const layout={furniture:{a:{position:[-2,.5,1],rotation:[0,.3,0],scale:[2,2,2]},b:{position:[2,1.5,-1],rotation:[0,.8,0],scale:[.8,.8,.8]}}},before=structuredClone(layout),patch=groupTransforms(layout,['a','b'],{angle:Math.PI/2});
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);assert(Math.abs(distance(patch.a.position,patch.b.position)-distance(layout.furniture.a.position,layout.furniture.b.position))<1e-10);assert.equal(patch.a.position[1],.5);assert.equal(patch.b.position[1],1.5);assert(!Object.hasOwn(patch.a,'scale'));assert.deepEqual(layout,before);assert.throws(()=>groupTransforms(layout,['a'],{dx:Infinity}));assert.throws(()=>groupTransforms(layout,['missing']));
});
function preview(purchase=async()=>({ok:true}),prepare=async()=>true){
 const scene=new THREE.Scene(),manager={refresh(){},definitions:{},colliders:new Map()},furniture=new Map(),events=[];
 const canvas={ownerDocument:{defaultView:{AbortController,crypto:globalThis.crypto}},addEventListener(){}};
 const studio=createStudioScene({THREE,scene,camera:new THREE.Camera(),canvas,uiRoot:{setAttribute(){},removeAttribute(){}},furniture,getManager:()=>manager,getSize:()=>({width:8.8,depth:8.2}),getCatalog:()=>SHOP_CATALOG,getState:()=>({roomArt:'original'}),getShop:()=>({owned:[]}),prepare,purchase,notify:(type,detail)=>events.push({type,detail}),say(){},schedule(){}});
 return {studio,scene,events,manager,furniture};
}
test('trial creates only a disposable preview; cancel never purchases or alters the layout registry',async()=>{
 let purchases=0;const f=preview(async()=>{purchases++;return {ok:true};});assert((await f.studio.begin('cloud-table')).ok);assert.equal(f.scene.children.length,1);assert.equal(f.manager.colliders.size,0);assert.equal(f.furniture.size,0);assert.equal(purchases,0);assert.equal(f.studio.move({x:NaN}),false);f.studio.cancel();assert.equal(f.scene.children.length,0);assert.equal(f.studio.getTrial(),null);assert.equal(purchases,0);f.studio.dispose();
});
test('out-of-room preview cannot reach purchasing; a failed purchase keeps the exact preview for correction',async()=>{
 let purchases=0;const f=preview(async()=>{purchases++;return {ok:false,message:'积分不足'};});await f.studio.begin('cloud-table');f.studio.move({x:100});assert.equal((await f.studio.confirm()).ok,false);assert.equal(purchases,0);f.studio.move({x:0});assert.equal((await f.studio.confirm()).ok,false);assert.equal(purchases,1);assert.match(f.studio.getTrial().message,/积分不足/);assert.equal(f.scene.children.length,1);f.studio.dispose();assert.equal(f.scene.children.length,0);
});
test('double confirmation cannot issue two purchases, and cancellation cannot tear down an in-flight transaction',async()=>{
 let resolve,purchases=0;const f=preview(async()=>{purchases++;return await new Promise(r=>resolve=r);});await f.studio.begin('cloud-table');const pending=f.studio.confirm();assert.equal(f.studio.cancel(),false);assert.equal((await f.studio.confirm()).ok,false);assert.equal(purchases,1);resolve({ok:true});assert((await pending).ok);assert.equal(f.studio.getTrial(),null);assert.equal(f.scene.children.length,0);f.studio.dispose();
});
test('every catalog furniture, wall hanging and floor can be previewed and disposed without acquiring ownership',async()=>{
 let purchases=0;const f=preview(async()=>{purchases++;return {ok:true};});for(const item of SHOP_CATALOG){assert((await f.studio.begin(item.sku)).ok,item.sku);assert.equal(f.studio.getTrial().sku,item.sku);assert.equal(f.scene.children.length,1);f.studio.cancel();assert.equal(f.scene.children.length,0);}assert.equal(purchases,0);f.studio.dispose();
});

test('animated reading props never mutate furniture and release when editing or storing the target',()=>{
 const f=preview(),table=new THREE.Group(),plant=new THREE.Group();table.name='table';table.position.set(.4,0,.6);const material=new THREE.MeshLambertMaterial({color:'#cab38d'});table.add(new THREE.Mesh(new THREE.BoxGeometry(1,.5,1),material));f.scene.add(table,plant);f.furniture.set('table',table);f.furniture.set('plant-shelf',plant);table.updateMatrix();const before=table.matrix.clone();let originalReleased=0;material.addEventListener('dispose',()=>originalReleased++);
 assert.equal(f.studio.interact('plant-shelf'),false,'plant shelf interaction must reach the existing watering control');assert(f.studio.interact('table'));assert.equal(f.scene.children.filter(n=>n.userData.studioInteraction).length,1);f.studio.frame(1);assert(table.matrix.equals(before));f.manager.editing=true;f.studio.frame(.01);assert.equal(f.scene.children.filter(n=>n.userData.studioInteraction).length,0);f.manager.editing=false;f.studio.interact('table');f.furniture.delete('table');f.studio.frame(.01);assert.equal(f.scene.children.filter(n=>n.userData.studioInteraction).length,0);assert.equal(originalReleased,0);f.studio.dispose();table.children[0].geometry.dispose();material.dispose();
});

test('craft preview returns to crafting even from a blocked placement and cannot call purchasing',async()=>{
 let purchases=0;const f=preview(async()=>{purchases++;return {ok:true};});assert((await f.studio.begin('star-lamp',{mode:'craft'})).ok);assert.equal(f.studio.getTrial().mode,'craft');f.studio.move({x:100});assert.equal(f.studio.getTrial().valid,false);assert((await f.studio.confirm()).ok);assert.equal(purchases,0);assert.equal(f.studio.getTrial(),null);assert.equal(f.scene.children.length,0);assert.deepEqual(f.events.find(x=>x.type==='furniture-trial-end').detail,{mode:'craft',sku:'star-lamp',reason:'return'});f.studio.dispose();
});
test('cancelling or disposing during asynchronous preparation never creates an orphan preview',async()=>{
 for(const cancel of ['cancel','dispose']){let resume;const f=preview(undefined,()=>new Promise(r=>resume=r));const waiting=f.studio.begin('cloud-table');f.studio[cancel]();resume(true);assert.equal((await waiting).ok,false);assert.equal(f.scene.children.length,0);assert.equal(f.studio.getTrial(),null);f.studio.dispose();}
 const gates=[],f=preview(undefined,()=>new Promise(r=>gates.push(r)));const older=f.studio.begin('star-lamp'),newer=f.studio.begin('cloud-table');gates[1](true);assert((await newer).ok);gates[0](true);assert.equal((await older).ok,false);assert.equal(f.studio.getTrial().sku,'cloud-table');assert.equal(f.scene.children.length,1);f.studio.dispose();
});
