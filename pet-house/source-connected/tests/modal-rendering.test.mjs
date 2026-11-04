import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

let playwright;
try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/room.css"><link rel="stylesheet" href="/shop.css"><link rel="stylesheet" href="/profile-upgrade.css"><style>html,body,#app{width:100%;height:100%;margin:0}</style></head><body><div id="app"></div><script type="module">
import {mountPetHouse} from '/pet-house.js';
window.room=mountPetHouse({container:document.querySelector('#app'),storageAdapter:null,initialPoints:5000,quality:'balanced',styles:false,demo:true});
window.fixtureReady=false;room.ready.then(()=>window.fixtureReady=true).catch(error=>window.fixtureError=error.message);
</script></body></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary'};

test('shop uses a static room presentation instead of continuously compositing WebGL', {skip:!playwright&&'Set PET_ROOM_PLAYWRIGHT_MODULE or install Playwright for browser assertions'}, async t=>{
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=resolve(root,`.${pathname}`);
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await playwright.chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader','--enable-webgl']});
  const url=`http://127.0.0.1:${server.address().port}/`;
  async function pageFor(run,viewport={width:1280,height:900}){
   const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{await page.goto(url);await page.waitForFunction(()=>window.fixtureReady||window.fixtureError,null,{timeout:30000});assert.equal(await page.evaluate(()=>window.fixtureError),undefined);await run(page);assert.deepEqual(errors,[],'no unhandled errors in the live WebGL app');}
   finally{await page.close();}
  }
  const shopTrigger='.room-shop__trigger:not(.room-shop__storage-trigger)';
  const state=page=>page.evaluate(()=>{
   const live=document.querySelector('canvas:not([data-room-control="room-poster"])'),poster=document.querySelector('[data-room-control="room-poster"]'),current=room.api.getState();
   return {paused:current.metrics.presentationPaused,count:current.metrics.renderCount,ready:current.ready,visibility:getComputedStyle(live).visibility,poster:!!poster&&!poster.hidden,posterTag:poster?.tagName,posterWidth:poster?.width,posterHeight:poster?.height,liveWidth:live.width,liveHeight:live.height,posterPixels:poster?.toDataURL('image/png')};
  });
  async function settlePresentation(page){
   await page.evaluate(()=>window.posterQuiet={count:-1,since:performance.now()});
   // A purchase can finish before the pet's cheer or moving-house reaction does.
   // Observe a full quiet interval after the final snapshot, with WebGL hidden throughout.
   await page.waitForFunction(()=>{
    const current=room.api.getState(),live=document.querySelector('canvas:not([data-room-control="room-poster"])'),now=performance.now();
    if(!current.metrics.presentationPaused)return false;
    if(getComputedStyle(live).visibility!=='hidden')throw new Error('live WebGL must remain hidden while the static poster is shown');
    const sample=window.posterQuiet;
    if(current.shop.busy||!['idle','seated'].includes(current.petState)||sample.count!==current.metrics.renderCount){sample.count=current.metrics.renderCount;sample.since=now;return false;}
    return now-sample.since>=2000;
   },null,{timeout:20000,polling:100});
   return state(page);
  }
  async function openShop(page){
   await page.locator(shopTrigger).click();await page.waitForFunction(()=>{
    const poster=document.querySelector('[data-room-control="room-poster"]');
    return room.api.getState().metrics.presentationPaused&&poster instanceof HTMLCanvasElement&&!poster.hidden&&poster.width>0&&poster.height>0;
   });await settlePresentation(page);
  }

  await t.test('opening the desktop shop hides the live canvas and presents one stable bitmap',()=>pageFor(async page=>{
   await openShop(page);const before=await state(page);assert.equal(before.paused,true);assert.equal(before.visibility,'hidden');assert.equal(before.poster,true);assert.equal(before.posterTag,'CANVAS');assert.match(before.posterPixels,/^data:image\/png;base64,/);
   assert.ok(before.posterWidth>0&&before.posterHeight>0);assert.equal(before.posterWidth,before.liveWidth);assert.equal(before.posterHeight,before.liveHeight);
   await page.waitForTimeout(1200);const after=await state(page);assert.equal(after.count,before.count,'idle modal must not submit additional WebGL frames');assert.equal(after.posterPixels,before.posterPixels);assert.equal(after.ready,true);
   const effects=await page.evaluate(()=>({filter:getComputedStyle(document.querySelector('.room-shop__shade')).backdropFilter,animation:getComputedStyle(document.querySelector('.room-shop__sheet')).animationName,active:document.querySelector('.room-shop__sheet').getAnimations().filter(a=>a.playState==='running').length}));
   assert.deepEqual(effects,{filter:'none',animation:'none',active:0});
   await page.locator('.room-shop__close').click();await page.waitForFunction(count=>!room.api.getState().metrics.presentationPaused&&room.api.getState().metrics.renderCount>count,before.count);const closed=await state(page);assert.equal(closed.visibility,'visible');assert.equal(closed.poster,false);
  }));

  await t.test('mobile shop, category changes and warehouse keep the same frozen presentation',()=>pageFor(async page=>{
   await openShop(page);const before=await state(page);
   for(const tab of ['furniture','flooring','wall','expansion','storage'])await page.locator(`[data-shop-tab="${tab}"]`).click();
   await page.waitForTimeout(1050);assert.equal((await state(page)).count,before.count);assert.equal((await state(page)).visibility,'hidden');
   await page.locator('.room-shop__close').click();await page.waitForFunction(()=>!room.api.getState().metrics.presentationPaused);
   await page.locator('.room-shop__storage-trigger').click();await page.waitForFunction(()=>room.api.getState().metrics.presentationPaused);const warehouse=await settlePresentation(page);await page.waitForTimeout(1050);assert.equal((await state(page)).count,warehouse.count);
   assert.equal(await page.locator('[data-shop-tab="storage"]').getAttribute('aria-selected'),'true');
  },{width:390,height:844}));

  await t.test('pet cards load one actual-model preview for each species instead of a shared illustration',()=>pageFor(async page=>{
   await openShop(page);await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.room-shop__pet-card .room-shop__pet-model-preview')];return images.length===5&&images.every(img=>img.complete&&img.naturalWidth===512&&img.naturalHeight===512);});
   const cards=await page.locator('.room-shop__pet-card').evaluateAll(nodes=>nodes.map(node=>({sku:node.dataset.petSku,source:node.querySelector('img').src,alt:node.querySelector('img').alt,templates:node.querySelectorAll('.room-shop__product-art>svg').length})));
   assert.equal(new Set(cards.map(card=>card.source)).size,5);for(const card of cards){assert.ok(new URL(card.source).pathname.endsWith(`/assets/pets/previews/${card.sku}.png`));assert.match(card.alt,/实际模型/);assert.equal(card.templates,0);}
  }));

  await t.test('purchases and room resizing refresh the poster finitely without resuming the render loop',()=>pageFor(async page=>{
   await openShop(page);const before=await state(page);await page.locator('[data-shop-tab="furniture"]').click();
   await page.locator('[data-shop-action="purchase"][data-sku="clover-planter"]').click();
   await page.waitForFunction(()=>room.api.getState().shop.owned.includes('clover-planter')&&!room.api.getState().shop.busy);
   const bought=await settlePresentation(page);assert.equal(bought.paused,true);assert.equal(bought.visibility,'hidden');assert.ok(bought.count>before.count);assert.notEqual(bought.posterPixels,before.posterPixels);
   await page.waitForTimeout(1050);assert.equal((await state(page)).count,bought.count);
   await page.locator('[data-shop-tab="expansion"]').click();await page.locator('[data-shop-action="expand"]').click();await page.waitForFunction(()=>room.api.getState().shop.roomLevel===1&&!room.api.getState().shop.busy);
   const expanded=await settlePresentation(page);assert.equal(expanded.paused,true);assert.equal(expanded.visibility,'hidden');assert.ok(expanded.count>bought.count);assert.notEqual(expanded.posterPixels,bought.posterPixels);
   await page.waitForTimeout(1050);assert.equal((await state(page)).count,expanded.count);
   await page.locator('[data-switch-level="0"]').click();await page.waitForFunction(()=>room.api.getState().shop.roomLevel===0&&!room.api.getState().shop.busy);await page.locator('[data-switch-level="1"]').click();await page.waitForFunction(()=>room.api.getState().shop.roomLevel===1&&!room.api.getState().shop.busy);
   assert.equal((await settlePresentation(page)).paused,true);assert.equal(await page.evaluate(()=>room.api.getState().shop.balance),4280);
  }));

  await t.test('a seated pet can stand for a purchase while the canvas stays hidden',()=>pageFor(async page=>{
   await page.evaluate(()=>room.api.toggleSofa());await page.waitForFunction(()=>room.api.getState().petState==='seated',null,{timeout:20000});
   await openShop(page);await page.locator('[data-shop-tab="furniture"]').click();await page.locator('[data-shop-action="purchase"][data-sku="cloud-table"]').click();
   await page.waitForFunction(()=>room.api.getState().shop.owned.includes('cloud-table')&&!room.api.getState().shop.busy,null,{timeout:12000});
   const bought=await settlePresentation(page);assert.equal(bought.paused,true);assert.equal(bought.visibility,'hidden');assert.equal(await page.evaluate(()=>room.api.getState().petState),'idle');await page.waitForTimeout(650);assert.equal((await state(page)).count,bought.count);
  }));

  await t.test('disposing an open shop removes the poster and restores the canvas visibility',()=>pageFor(async page=>{
   await openShop(page);
   const result=await page.evaluate(()=>{const canvas=document.querySelector('canvas');room.dispose();return {visibility:canvas.style.visibility,posters:document.querySelectorAll('[data-room-control="room-poster"]').length,paused:room.api.getState().metrics.presentationPaused,lifecycle:room.api.getState().lifecycle};});
   assert.deepEqual(result,{visibility:'',posters:0,paused:false,lifecycle:'disposed'});
  }));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
