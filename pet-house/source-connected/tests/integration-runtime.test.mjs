import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {resolveQuality,resolveRoomStorage} from '../runtime.mjs';
import {DEFAULT_ASSET_URLS} from '../assets.mjs';
import {createRendererSurface} from '../renderer-surface.mjs';

const source=readFileSync(new URL('../room.js',import.meta.url),'utf8');
test('low FPS fallback changes the live quality state without crashing the room',()=>{
  const body=source.slice(source.indexOf('  function applyAutoDowngrade(){'),source.indexOf('  async function initialize(){'));
  const events=[],buffers=[];
  const canvas={style:{visibility:''}},renderer={setDrawingBufferSize:(...size)=>buffers.push(size),shadowMap:{enabled:true}};
  const surface=createRendererSurface({canvas,renderer,render(){}});
  const context={quality:{...resolveQuality('balanced')},disposed:false,lowFpsStreak:4,
    renderer,sun:{shadow:{mapSize:{set(){}}}},
    win:{devicePixelRatio:2},resize(){surface.resize(800,600,Math.min(context.win.devicePixelRatio,context.quality.maxPixelRatio));},resolveQuality,notify:(type,detail)=>events.push({type,...detail})};
  context.resize();buffers.length=0;
  const run=vm.runInNewContext(`${body};applyAutoDowngrade`,context);run();run();
  assert.equal(context.quality.profile,'low');assert.equal(context.quality.maxFPS,30);
  assert.equal(context.quality.autoDowngraded,true);assert.equal(context.renderer.shadowMap.enabled,false);
  assert.deepEqual(buffers,[[800,600,1]]);assert.equal(events.length,1);assert.equal(events[0].from,'balanced');surface.dispose();
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
