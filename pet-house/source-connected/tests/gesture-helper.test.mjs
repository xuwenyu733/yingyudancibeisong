import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import {createTransformGesture,gestureTransform} from '../gesture-helper.mjs';
import {FURNITURE} from '../layout.js';
const touch=(pointerId,x,y)=>({pointerId,pointerType:'touch',clientX:x,clientY:y});

test('two touch points rotate continuously across the angle wrap and finish exactly once',()=>{
  const updates=[];let starts=0,ends=0,cancels=0;
  const g=createTransformGesture({onStart(){starts++;},onUpdate:v=>updates.push(v),onEnd(){ends++;},onCancel(){cancels++;}});
  assert.equal(g.down(touch(1,0,0)),false);assert.equal(g.down(touch(2,-100,1)),true);
  g.move(touch(2,-100,-1));assert.ok(updates[0].rotation>0&&updates[0].rotation<.03,'angle wrap must not spin almost 360 degrees');
  g.move(touch(2,0,-200));assert.ok(Math.abs(updates.at(-1).ratio-2)<.001);
  assert.equal(g.up(touch(1,0,0)),true);g.move(touch(2,100,0));g.up(touch(2,100,0));
  assert.equal(starts,1);assert.equal(ends,1);assert.equal(cancels,0);assert.equal(g.blocked,false);
});

test('a third pointer or pointer cancellation rolls back once and suppresses leftover touches',()=>{
  let starts=0,ends=0,cancels=0;const g=createTransformGesture({onStart(){starts++;},onEnd(){ends++;},onCancel(){cancels++;}});
  g.down(touch(1,0,0));g.down(touch(2,100,0));g.down(touch(3,30,30));assert.equal(cancels,1);assert.equal(g.active,false);
  g.move(touch(2,0,100));g.up(touch(1,0,0));g.up(touch(2,0,100));assert.equal(g.blocked,true);g.up(touch(3,30,30));assert.equal(g.blocked,false);
  g.down(touch(4,0,0));g.down(touch(5,100,0));g.up(touch(4,0,0),true);g.cancel();assert.equal(starts,2);assert.equal(ends,0);assert.equal(cancels,2);
});

test('single finger, mouse, collapsed distance and invalid coordinates cannot start an accidental gesture',()=>{
  let starts=0,cancels=0;const g=createTransformGesture({onStart(){starts++;},onCancel(){cancels++;}});
  assert.equal(g.down({...touch(1,0,0),pointerType:'mouse'}),false);
  g.down(touch(1,0,0));assert.equal(g.move(touch(1,30,40)),false);assert.equal(g.up(touch(1,30,40)),false);
  g.down(touch(2,0,0));g.down(touch(3,1,0));assert.equal(starts,0);g.cancel();
  g.down(touch(4,0,0));g.down(touch(5,100,0));g.move(touch(5,NaN,0));assert.equal(cancels,1);g.cancel();
});

test('gesture transforms preserve proportions, clamp to layout scale bounds and keep wall yaw fixed',()=>{
  const initial={rotation:[0,.3,0],scale:[2,3,4]};
  assert.deepEqual(gestureTransform(initial,{rotation:1,ratio:2}),{rotation:[0,1.3,0],scale:[4,6,8]});
  assert.deepEqual(gestureTransform(initial,{rotation:1,ratio:2},{rotate:false}).rotation,[0,.3,0]);
  assert.equal(Math.max(...gestureTransform(initial,{rotation:0,ratio:1e8}).scale),8);
  assert.equal(Math.min(...gestureTransform(initial,{rotation:0,ratio:1e-8}).scale),1);
  assert.equal(gestureTransform(initial,{rotation:0,ratio:NaN}),null);assert.equal(gestureTransform(initial,{rotation:0,ratio:-1}),null);
});

test('fixed design bounds survive repeated pinches and reopen rather than allowing exponential size drift',()=>{
  const baseScale=[1.9,1.9,1.9];let initial={rotation:[0,0,0],scale:baseScale.slice()};
  for(let i=0;i<12;i++)initial=gestureTransform(initial,{rotation:0,ratio:99},{baseScale});
  assert.deepEqual(initial.scale,[3.8,3.8,3.8]);
  for(let i=0;i<12;i++)initial=gestureTransform(initial,{rotation:0,ratio:.001},{baseScale});
  assert.deepEqual(initial.scale,[.95,.95,.95]);
  const legacy={rotation:[0,0,0],scale:[.1,.1,.1]};
  assert.deepEqual(gestureTransform(legacy,{rotation:0,ratio:.5},{baseScale:[1,1,1]}).scale,[.1,.1,.1],'an already tiny legacy item cannot get tinier');
  assert.deepEqual(gestureTransform(legacy,{rotation:0,ratio:2},{baseScale:[1,1,1]}).scale,[.2,.2,.2],'legacy items return gradually without a sudden reset');
  const wide={rotation:[0,0,0],scale:[1,1.5,2]},result=gestureTransform(wide,{rotation:0,ratio:.5},{baseScale:[1,1,1]});
  assert.deepEqual(result.scale,[.5,.75,1]);assert.equal(result.scale[1]/result.scale[0],1.5);
});

function actualDecorationGesture(){
  const source=readFileSync(new URL('../decoration.js',import.meta.url),'utf8'),start=source.indexOf('  const gestures=createTransformGesture('),end=source.indexOf('  const finite3=',start);
  assert.ok(start>=0&&end>start);const root=new THREE.Group();root.rotation.y=.2;root.scale.set(1,1,1);root.position.set(1,0,1);
  let commits=0,restores=0,allow=true;const events=[],history=[];
  const snapshot=()=>({rotation:root.rotation.toArray().slice(0,3),scale:root.scale.toArray(),position:root.position.toArray()});
  const manager={definitions:{table:{draggable:true}},snapshot,restore(s){restores++;root.rotation.set(...s.rotation);root.scale.fromArray(s.scale);root.position.fromArray(s.position);return true;},previewTransform(id,p){assert.equal(id,'table');root.rotation.set(...p.rotation);root.scale.fromArray(p.scale);return true;},validate:()=>({valid:allow}),commit(before){commits++;if(!allow)manager.restore(before);return allow;}};
  const context={createTransformGesture,gestureTransform,FURNITURE,disposed:false,trading:false,active:true,dockDrag:null,selected:'table',drag:null,manager,furniture:new Map([['table',root]]),gestureSession:null,touchHold:{cancel(){}},fillInspector(){},canvas:{style:{}},say(){},history:{push:s=>history.push(s)},cloneForHistory:structuredClone,onEvent:(type,detail)=>events.push({type,...detail}),invalid:false,updatePlacementState(){}};
  const gestures=new Function('context',`with(context){${source.slice(start,end)}return gestures;}`)(context);
  return {root,context,gestures,history,events,set allow(value){allow=value;},get commits(){return commits;},get restores(){return restores;}};
}

test('actual decoration gesture hands off an uncommitted drag, commits once and emits successful rotation only',()=>{
  const f=actualDecorationGesture(),before=f.context.manager.snapshot();f.gestures.down(touch(1,0,0));f.context.drag={before};f.root.position.x=9;
  f.gestures.down(touch(2,100,0));assert.equal(f.root.position.x,1);assert.equal(f.context.drag,null);
  f.gestures.move(touch(2,0,150));assert.ok(f.root.rotation.y>1.7);assert.deepEqual(f.root.scale.toArray(),[1.5,1.5,1.5]);
  f.gestures.up(touch(2,0,150));f.gestures.up(touch(1,0,0));assert.equal(f.commits,1);assert.equal(f.history.length,1);
  assert.deepEqual(f.events.map(e=>e.type),['furniture-transformed','furniture-rotated']);
});

test('actual decoration rejects occupied transforms and rolls back on cancel without adding history',()=>{
  const f=actualDecorationGesture(),before=f.context.manager.snapshot();
  f.gestures.down(touch(1,0,0));f.gestures.down(touch(2,100,0));f.gestures.move(touch(2,0,150));f.allow=false;
  f.gestures.up(touch(2,0,150));f.gestures.up(touch(1,0,0));assert.deepEqual(f.context.manager.snapshot(),before);assert.equal(f.events.length,0);assert.equal(f.history.length,0);
  f.allow=true;f.gestures.down(touch(3,0,0));f.gestures.down(touch(4,100,0));f.gestures.move(touch(4,0,150));f.gestures.cancel();
  assert.deepEqual(f.context.manager.snapshot(),before);assert.equal(f.commits,1);assert.equal(f.context.gestureSession,null);
});
