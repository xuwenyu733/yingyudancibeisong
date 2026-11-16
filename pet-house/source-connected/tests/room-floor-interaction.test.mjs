import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {furnitureActivityKind} from '../furniture-activity.mjs';
const source=readFileSync(new URL('../room.js',import.meta.url),'utf8'),studioSource=readFileSync(new URL('../studio-scene.js',import.meta.url),'utf8');
const trigger=source.slice(source.indexOf('function triggerInteraction(picked)'),source.indexOf("canvas.addEventListener('pointercancel'"));
const furnitureHandler=source.slice(source.indexOf('function canInteractWithFurniture('),source.indexOf('function runFurnitureInteraction('));
const pick=studioSource.slice(studioSource.indexOf(' function pick(cast)'),studioSource.indexOf(' function frame(dt)'));
function fixture(id='rug'){
 const calls={requests:[],walk:[],cancel:0},item={name:id,getWorldPosition:v=>Object.assign(v,{x:1,z:1})},furniture=new Map([[id,item]]),raycaster={intersectObjects:()=>[{object:item}],intersectObject:()=>[],ray:{intersectPlane:(_plane,p)=>Object.assign(p,{x:1,z:2})}},actor={root:{visible:true,rotation:{}},ctrl:{x:0,z:0},walkTo:p=>calls.walk.push({...p})};
 const context={actor,options:{},raycaster,furniture,furnitureActivityKind,SEATS:{sofa:{}},WATER_TARGETS:{'floor-pot':{}},visitInteractions:{enabled:true,role:'host',cancel:()=>calls.cancel++,furniture:id=>{calls.requests.push(id);return Promise.resolve(true);},request:action=>{calls.requests.push(action);return Promise.resolve(true);}},play:{interact:()=>null},sfx:{play(){},playMelody(){}},fx:{say(){}},vibrate(){},schedule(){},nightActive:false,plane:{},pointerTarget:{},THREE:{Vector3:class{}},feel:{react(){}},SHOP_CATALOG:[],STORAGE_CATALOG:[],xylophoneNote:()=>440,runFurnitureInteraction:()=>{throw Error('Unexpected local interaction');}};
 Object.assign(context,new Function('context',`with(context){${furnitureHandler};return {interactFurniture,canInteractWithFurniture};}`)(context));
 context.studio={pick:new Function('context',`with(context){const onInteract=interactFurniture;${pick};return pick;}`)(context)};
 const interact=new Function('context',`with(context){${trigger};return triggerInteraction;}`)(context);return {calls,context,interact};
}
test('a rug tap in an online room remains a ground walk instead of an invalid furniture request',()=>{const f=fixture();f.interact(null);assert.deepEqual(f.calls.requests,[]);assert.deepEqual(f.calls.walk,[{x:1,z:2}]);});
test('noninteractive furniture is rejected before any network action even through the public API',()=>{for(const id of ['rug','wall-art','room-shell']){const f=fixture(id);assert.equal(f.context.interactFurniture(id),false);assert.deepEqual(f.calls.requests,[]);}});
test('a table tap still uses the online activity transport once',()=>{const f=fixture('table');f.interact(null);assert.deepEqual(f.calls.requests,['table']);assert.deepEqual(f.calls.walk,[]);});
test('a guest taps the owner pet directly to greet; floor decorations never send furniture errors',()=>{const f=fixture();f.context.options.visitMode={role:'guest'};f.context.visitInteractions.role='guest';f.interact(null);assert.deepEqual(f.calls.requests,[]);f.context.raycaster.intersectObject=()=>[{}];f.interact(null);assert.deepEqual(f.calls.requests,[{type:'greet'}]);});
