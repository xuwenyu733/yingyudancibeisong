import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {resolveQuality,resolveRoomStorage} from '../runtime.mjs';
import {DEFAULT_ASSET_URLS} from '../assets.mjs';
import {createRendererSurface} from '../renderer-surface.mjs';
import {createAdaptiveQuality,applySceneQuality} from '../adaptive-quality.mjs';

const source=readFileSync(new URL('../room.js',import.meta.url),'utf8');
test('adaptive quality resizes the actual renderer callback and recovers without changing geometry',()=>{
  const begin=source.indexOf('  const adaptive=createAdaptiveQuality('),body=source.slice(begin,source.indexOf('\n',begin));
  const events=[],buffers=[];
  const canvas={style:{visibility:''}},renderer={setDrawingBufferSize:(...size)=>buffers.push(size),shadowMap:{enabled:true}};
  const surface=createRendererSurface({canvas,renderer,render(){}});
  const context={options:{quality:'auto'},createAdaptiveQuality,applySceneQuality,scene:{traverse(){}},quality:{...resolveQuality('balanced')},disposed:false,
    renderer,sun:{shadow:{mapSize:{set(){}},map:null}},
    win:{devicePixelRatio:2},resize(){surface.resize(800,600,Math.min(context.win.devicePixelRatio,context.quality.maxPixelRatio));},resolveQuality,notify:(type,detail)=>events.push({type,...detail})};
  context.resize();buffers.length=0;
  const run=vm.runInNewContext(`${body};adaptive`,context);
  for(let now=0;now<20000;now+=50)run.sample({now,interval:50,cost:20});
  assert.equal(context.quality.profile,'balanced');assert.equal(context.quality.maxFPS,60);
  assert.equal(context.quality.autoDowngraded,true);assert.equal(context.renderer.shadowMap.enabled,false);
  assert.equal(buffers.length,2);assert.equal(events.length,2);assert.equal(events[1].level,2);
  for(let now=20000;now<55000;now+=16.667)run.sample({now,interval:16.667,cost:3});
  assert.equal(context.quality.maxPixelRatio,1.5);assert.equal(context.quality.autoDowngraded,false);assert.equal(renderer.shadowMap.enabled,true);surface.dispose();
});
test('complete package entry can be imported by SSR without reading document or window',()=>{
  const url=new URL('../pet-house.js',import.meta.url).href;
  const script=`globalThis.document=new Proxy({}, {get(){throw Error('SSR DOM access')}});const m=await import(${JSON.stringify(url)});if(typeof m.mountPetHouse!=='function')throw Error('missing entry');process.stdout.write('ok');`;
  assert.equal(execFileSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8'}),'ok');
});
test('default model assets are static file references that bundlers can emit',()=>{
  for(const [id,url] of Object.entries(DEFAULT_ASSET_URLS)){
    assert.ok(['sofa','table','lamp'].includes(id));assert.ok(statSync(new URL(url)).size>1000);
  }
});
test('default storage follows the canvas iframe window, explicit adapters never read global storage',()=>{
  const ownerStorage={getItem:()=>null,setItem(){}};
  assert.equal(resolveRoomStorage(undefined,{localStorage:ownerStorage}),ownerStorage);
  const blocked=new Proxy({}, {get(){throw Error('storage denied');}});
  assert.equal(resolveRoomStorage(null,blocked),null);
  const explicit={getItem:()=>null,setItem(){}};assert.equal(resolveRoomStorage(explicit,blocked),explicit);
  const denied=resolveRoomStorage(undefined,blocked);assert.throws(()=>denied.getItem('key'),/storageAdapter/);
});
test('WebGL restore cannot unfreeze an imported archive or revive a disposed room',()=>{
  const handlers={},events=[];
  const begin=source.indexOf("  canvas.addEventListener('webglcontextlost'");
  const body=source.slice(begin,source.indexOf('  const controller=',begin));
  const context={canvas:{addEventListener:(type,handler)=>{handlers[type]=handler;}},eventOptions:{},disposed:false,actor:{},lifecycle:'reload-required',
    resize(){},visibility(){},notify:type=>events.push(type)};
  vm.runInNewContext(body,context);
  handlers.webglcontextlost({preventDefault(){}});handlers.webglcontextrestored();assert.equal(context.lifecycle,'reload-required');
  context.lifecycle='ready';handlers.webglcontextlost({preventDefault(){}});assert.equal(context.lifecycle,'context-lost');handlers.webglcontextrestored();assert.equal(context.lifecycle,'ready');
  context.disposed=true;context.lifecycle='disposed';handlers.webglcontextrestored();assert.equal(context.lifecycle,'disposed');assert.deepEqual(events,['context-lost','context-restored']);
});
