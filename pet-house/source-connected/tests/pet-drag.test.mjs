import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Run the handlers shipped in room.js. Only DOM pointer delivery and the
// screen-to-ground ray are replaced; follow routing, ownership, capture and
// gesture thresholds all come from the delivered implementation.
const source=readFileSync(new URL('../room.js',import.meta.url),'utf8');
const start=source.indexOf('function animalUnderPointer()'),end=source.indexOf('// 点击/键盘 Enter',start);
const cancelStart=source.indexOf("canvas.addEventListener('pointercancel'",end),cancelEnd=source.indexOf('const hint=',cancelStart);
assert.ok(start>=0&&end>start&&cancelStart>end&&cancelEnd>cancelStart,'room pointer handler boundaries changed');

function fixture(animal='primary'){
  const handlers=new Map(),calls={primary:[],buddy:[],clicks:0,frames:0,capture:[],release:[]};
  const canvas={style:{},addEventListener(type,handler){handlers.set(type,handler);},focus(){},setPointerCapture(id){calls.capture.push(id);},releasePointerCapture(id){calls.release.push(id);}};
  let current=null,clock=1000;
  const actor={state:'idle',ctrl:{},walkTo:point=>calls.primary.push({...point})};
  const context={canvas,actor,play:{pickAnimal:()=>animal,leadBuddy:point=>calls.buddy.push({...point}),hasHit:()=>false},raycaster:{ray:{intersectPlane(_plane,target){if(current?.plane===false)return null;Object.assign(target,current?.ground||{x:0,z:0});return target;}},intersectObject:()=>[]},bounds:{minX:-3,maxX:3,minZ:-2,maxZ:2},pointerTarget:{x:0,z:0},plane:{},commerceBusy:false,decoration:{active:false,pending:false},aim:e=>{current=e;},pickedFurniture:()=>null,triggerInteraction(){calls.clicks++;},schedule(){calls.frames++;},eventOptions:{},win:{addEventListener(){}},keys:new Set(),lastLeash:0,Date:{now:()=>clock},hintTarget:null,hintX:0,hintY:0,renderHint(){}};
  const control=new Function('context',`with(context){let down=null;${source.slice(start,end)}\n${source.slice(cancelStart,cancelEnd)};return {get down(){return down;},releaseKeys};}`)(context);
  function fire(type,event={}){clock+=100;handlers.get(type)?.({button:0,pointerId:1,clientX:0,clientY:0,preventDefault(){},...event});}
  return {calls,context,canvas,control,fire};
}

test('dragging the primary pet routes a clamped ground destination and releases capture without firing a tap',()=>{
  const f=fixture();f.fire('pointerdown',{clientX:20,clientY:20});assert.deepEqual(f.calls.capture,[1]);assert.equal(f.canvas.style.cursor,'grabbing');
  f.fire('pointermove',{clientX:45,clientY:21,ground:{x:100,z:-100}});
  assert.deepEqual(f.calls.primary,[{x:3,z:-2}]);assert.deepEqual(f.calls.buddy,[]);assert.equal(f.calls.frames,1);
  f.fire('pointerup',{clientX:50,clientY:22,ground:{x:1.5,z:.7}});
  assert.deepEqual(f.calls.primary.at(-1),{x:1.5,z:.7});assert.deepEqual(f.calls.release,[1]);assert.equal(f.calls.clicks,0);assert.equal(f.control.down,null);assert.equal(f.canvas.style.cursor,'default');
});

test('dragging the second pet leads the buddy without moving the primary pet',()=>{
  const f=fixture('buddy');f.fire('pointerdown');f.fire('pointermove',{clientX:30,ground:{x:-50,z:80}});
  assert.deepEqual(f.calls.buddy,[{x:-3,z:2}]);assert.deepEqual(f.calls.primary,[]);
  f.fire('pointerup',{clientX:32,ground:{x:-1,z:1}});assert.deepEqual(f.calls.buddy.at(-1),{x:-1,z:1});assert.equal(f.calls.clicks,0);assert.equal(f.control.down,null);
});

test('an eight-pixel pet gesture remains a tap, while a large excursion cannot become a tap by returning to its start',()=>{
  const f=fixture();f.fire('pointerdown');f.fire('pointermove',{clientX:8});assert.equal(f.calls.primary.length,0);f.fire('pointerup',{clientX:8});assert.equal(f.calls.clicks,1);
  f.fire('pointerdown');f.fire('pointermove',{clientX:24,ground:{x:1,z:1}});f.fire('pointermove',{clientX:1,ground:{x:0,z:0}});f.fire('pointerup',{clientX:1,ground:{x:0,z:0}});
  assert.equal(f.calls.clicks,1);assert.ok(f.calls.primary.length>=1);assert.equal(f.control.down,null);
});

test('another pointer cannot move, release or cancel the active animal gesture',()=>{
  const f=fixture('buddy');f.fire('pointerdown',{pointerId:7});
  f.fire('pointermove',{pointerId:8,clientX:40,ground:{x:2,z:1}});assert.equal(f.calls.buddy.length,0);assert.equal(f.control.down.id,7);
  f.fire('pointerup',{pointerId:8,clientX:40});assert.equal(f.control.down.id,7);assert.equal(f.calls.release.length,0);
  f.fire('pointercancel',{pointerId:8});assert.equal(f.control.down.id,7);
  f.fire('lostpointercapture',{pointerId:8});assert.equal(f.control.down.id,7);
  f.fire('pointermove',{pointerId:7,clientX:30,ground:{x:2,z:1}});assert.deepEqual(f.calls.buddy,[{x:2,z:1}]);
  f.fire('pointerup',{pointerId:7,clientX:30});assert.deepEqual(f.calls.release,[7]);assert.equal(f.control.down,null);
});

test('cancelled pet gestures cannot send later destinations and missing ground hits do not move pets',()=>{
  for(const type of ['pointercancel','lostpointercapture']){
    const f=fixture();f.fire('pointerdown');f.fire('pointermove',{clientX:30,plane:false});assert.equal(f.calls.primary.length,0);
    f.fire(type);assert.equal(f.control.down,null);assert.equal(f.canvas.style.cursor,'default');
    f.fire('pointerup',{clientX:35,ground:{x:1,z:1}});assert.equal(f.calls.primary.length,0);assert.equal(f.calls.clicks,0);
  }
});

test('commerce and decoration block starting an animal drag',()=>{
  for(const mode of ['commerce','decoration','pending']){
    const f=fixture();if(mode==='commerce')f.context.commerceBusy=true;else f.context.decoration[mode==='pending'?'pending':'active']=true;
    f.fire('pointerdown');assert.equal(f.control.down,null);assert.deepEqual(f.calls.capture,[]);
  }
});
