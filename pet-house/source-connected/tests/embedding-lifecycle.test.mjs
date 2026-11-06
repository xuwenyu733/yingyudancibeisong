import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const project=fileURLToPath(new URL('../',import.meta.url));
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:15px;background:#253344} .host{width:480px;height:520px;display:inline-block;vertical-align:top}</style></head><body><script type="module">
import {mountPetHouse} from '/pet-house.js';import {activeElementFor,elementAtPointFor} from '/dom.mjs';
window.mountPetHouse=mountPetHouse;window.domHelpers={activeElementFor,elementAtPointFor};window.instances=[];
window.makeRoom=async ({shadow=false,mode='open',timeout=30000}={})=>{
 const outer=document.createElement('section');outer.className='host';document.body.append(outer);
 const tree=shadow?outer.attachShadow({mode}):outer,container=document.createElement('div');container.style.cssText='width:100%;height:100%';tree.append(container);
 const room=mountPetHouse({container,storageAdapter:null,initialPoints:1000,quality:'low',loadTimeoutMs:timeout});
 const record={outer,tree,container,room};instances.push(record);await room.ready;return instances.length-1;
};window.fixtureReady=true;</script></body></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json'};
test('embedded room style roots, focus and failed resource lifecycle',{skip:!playwright&&'Install Playwright or set PET_ROOM_PLAYWRIGHT_MODULE'},async t=>{
 const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(project,`.${pathname}`);if(!file.startsWith(resolve(project)+sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await playwright.chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader']});const url=`http://127.0.0.1:${server.address().port}`;
  async function pageFor(run){const page=await browser.newPage({viewport:{width:1300,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));try{await page.goto(url);await page.waitForFunction(()=>window.fixtureReady);await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}}
  await t.test('document and shadow trees receive separate shared style resources',()=>pageFor(async page=>{
   const result=await page.evaluate(async()=>{
    await makeRoom();await makeRoom({shadow:true});const a=instances[0],b=instances[1];
    const extra=document.createElement('div');extra.style.cssText='width:280px;height:320px';b.tree.append(extra);const third=mountPetHouse({container:extra,storageAdapter:null,quality:'low'});await third.ready;
    const before={doc:document.head.querySelectorAll('[data-pet-house-style]').length,shadow:b.tree.querySelectorAll('[data-pet-house-style]').length,position:getComputedStyle(b.container.querySelector('.pet-room-view')).position};
    b.room.dispose();const retained=b.tree.querySelectorAll('[data-pet-house-style]').length;third.dispose();a.room.dispose();return {before,retained,docAfter:document.head.querySelectorAll('[data-pet-house-style]').length,shadowAfter:b.tree.querySelectorAll('[data-pet-house-style]').length};
   });assert.deepEqual(result,{before:{doc:1,shadow:1,position:'relative'},retained:1,docAfter:0,shadowAfter:0});
  }));
  for(const mode of ['open','closed'])await t.test(`${mode} shadow root keeps shop Escape, decoration shortcuts and canvas hit-testing usable`,()=>pageFor(async page=>{
   await page.evaluate(mode=>makeRoom({shadow:true,mode}),mode);
   // ready resolves before the loading overlay's exit transition completes.
   // Wait for the interactive view; the fading overlay correctly wins hit tests.
   await page.waitForFunction(()=>instances[0].container.querySelector('[data-room-control="loading"]').hidden);
   await page.evaluate(()=>{const r=instances[0];r.container.querySelector('.room-shop__trigger').click();});
   await page.waitForFunction(()=>instances[0].room.api.getState().metrics.presentationPaused);await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>instances[0].container.querySelector('.room-shop__sheet').hidden),true);
   await page.evaluate(async()=>{const r=instances[0];await r.room.api.setDecorationMode(true);const card=r.container.querySelector('[data-strip-sku="floor-pot"]');card.click();card.focus();});
   const before=await page.evaluate(()=>instances[0].room.api.getLayout().furniture['floor-pot'].rotation[1]);await page.keyboard.press('r');
   const result=await page.evaluate(()=>{const r=instances[0],canvas=r.container.querySelector('canvas'),box=canvas.getBoundingClientRect();return {rotation:r.room.api.getLayout().furniture['floor-pot'].rotation[1],focus:domHelpers.activeElementFor(r.container)?.dataset.stripSku,hit:domHelpers.elementAtPointFor(canvas,box.left+box.width*.95,box.top+box.height*.5)===canvas};});
   assert.ok(Math.abs(result.rotation-before-Math.PI/2)<1e-6);assert.equal(result.hit,true);assert.equal(result.focus,'floor-pot');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>instances[0].room.api.getState().decoration),false);
  }));
  await t.test('a failed style load releases its resource and a subsequent mount can retry',()=>pageFor(async page=>{
   await page.route('**/styles.css',route=>route.abort());
   assert.equal(await page.evaluate(()=>makeRoom().then(()=>null,e=>e.code)),'STYLE_LOAD_FAILED');
   assert.equal(await page.locator('link[data-pet-house-style]').count(),0);
   await page.evaluate(()=>instances[0].room.dispose());await page.unroute('**/styles.css');await page.evaluate(()=>makeRoom());
   assert.equal(await page.evaluate(()=>instances[1].room.api.getState().ready),true);
  }));
  await t.test('a stalled style request times out and disposes the core instead of leaving ready pending',()=>pageFor(async page=>{
   let blocked;await page.route('**/styles.css',route=>{blocked=route;});
   const result=await page.evaluate(()=>makeRoom({timeout:3000}).then(()=>null,e=>({code:e.code,lifecycle:instances[0].room.api.getState().lifecycle,links:document.head.querySelectorAll('[data-pet-house-style]').length})));
   assert.deepEqual(result,{code:'STYLE_LOAD_TIMEOUT',lifecycle:'disposed',links:0});await blocked?.abort().catch(()=>{});
  }));
  await t.test('unmounting while styles are pending settles ready and removes every shared resource',()=>pageFor(async page=>{
   let blocked;await page.route('**/styles.css',route=>{blocked=route;});
   const result=await page.evaluate(async()=>{const pending=makeRoom();const r=instances[0];r.room.dispose();return {code:await pending.then(()=>null,e=>e.code),children:r.container.childElementCount,links:document.head.querySelectorAll('[data-pet-house-style]').length,hints:document.querySelectorAll('.pet-room-hint').length};});
   assert.deepEqual(result,{code:'ABORTED',children:0,links:0,hints:0});await blocked?.abort().catch(()=>{});
  }));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
