import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRendererSurface} from '../renderer-surface.mjs';

function fixture(){
  const history=[],children=[];let blocked=false;
  const canvas={width:800,height:600,style:{visibility:''},insertAdjacentElement(_where,node){children.push(node);history.push('insert');}};
  canvas.ownerDocument={createElement(tag){assert.equal(tag,'canvas');return {dataset:{},width:300,height:150,hidden:false,setAttribute(){},getContext(){return {drawImage(source){assert.equal(source,canvas);history.push('copy');if(blocked)throw new Error('copy failed');}};},remove(){children.splice(children.indexOf(this),1);}};}};
  const renderer={setDrawingBufferSize(w,h,p){history.push(['buffer',w,h,p]);canvas.width=Math.floor(w*p);canvas.height=Math.floor(h*p);}};
  const surface=createRendererSurface({canvas,renderer,render(){history.push('render');}});
  return {canvas,history,children,surface,set blocked(value){blocked=value;}};
}

test('unchanged resize notifications never clear the drawing buffer, and a real change resizes once',()=>{
  const f=fixture();assert.equal(f.surface.resize(800,600,1.5),true);
  for(let i=0;i<20;i++)assert.equal(f.surface.resize(800,600,1.5),false);
  assert.deepEqual(f.history,[['buffer',800,600,1.5]]);
  assert.equal(f.surface.resize(800,600,1),true);assert.equal(f.surface.resize(600,800,1),true);
  assert.deepEqual(f.history.slice(1),[['buffer',800,600,1],['buffer',600,800,1]]);f.surface.dispose();
});

test('a static poster is copied synchronously before WebGL is hidden, and reused without image decoding',()=>{
  const f=fixture();assert.equal(f.surface.capture(),true);
  assert.deepEqual(f.history,['render','copy','insert']);const poster=f.children[0];
  assert.equal(poster.dataset.roomControl,'room-poster');assert.equal(poster.width,800);assert.equal(poster.height,600);
  assert.equal(poster.hidden,false);assert.equal(f.canvas.style.visibility,'hidden');
  f.surface.capture();assert.equal(f.children.length,1);assert.equal(f.children[0],poster);
  f.surface.resume();assert.equal(f.history.at(-1),'render');assert.equal(f.canvas.style.visibility,'');assert.equal(poster.hidden,true);
  f.surface.dispose();assert.equal(f.children.length,0);assert.equal(f.surface.capture(),false);
});

test('failed poster copying leaves the freshly rendered live canvas visible instead of a blank surface',()=>{
  const f=fixture();f.blocked=true;assert.equal(f.surface.capture(),false);assert.equal(f.canvas.style.visibility,'');assert.equal(f.children.length,0);
  f.blocked=false;f.surface.capture();f.blocked=true;assert.equal(f.surface.capture(),false);assert.equal(f.children[0].hidden,true);assert.equal(f.canvas.style.visibility,'');f.surface.dispose();
});

test('a paused shop never alternates live and static layers while companion reactions finish',()=>{
  const source=readFileSync(new URL('../room.js',import.meta.url),'utf8'),start=source.indexOf('  function frame(now){'),end=source.indexOf('  function visibility()',start);
  assert.ok(start>=0&&end>start);let liveFrames=0,posters=0;
  const feel={active:true,frame(){}};
  const context={frameId:0,shouldRender:()=>true,quality:{maxFPS:60},lastRender:0,previous:0,actor:{state:'idle',update(){}},commerceBusy:false,decoration:null,inputAxis:()=>({x:0,z:0}),disposed:false,feel,play:null,ceremony:null,nightActive:false,updateNight(){},ritualPoints:[],lastIdleCheck:Number.MAX_SAFE_INTEGER,decorationReady:null,waterFx:{visible:false},presentationPaused:true,renderScene(){liveFrames++;},capturePoster(){posters++;},metricsFrames:0,lastMetrics:Number.MAX_SAFE_INTEGER,schedule(){},lastError:null,lifecycle:'ready',notify(){},dispose(){}};
  const frame=new Function('context',`with(context){${source.slice(start,end)};return frame;}`)(context);
  frame(100);frame(120);assert.equal(liveFrames,0);assert.equal(posters,0);
  feel.frame=()=>{feel.active=false;};frame(140);frame(160);assert.equal(liveFrames,0);assert.equal(posters,1);
});
