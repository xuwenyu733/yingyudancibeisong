import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
test('mobile feedback: native rotation fallback, accessible newly placed item and responsive garden',{skip:!playwright&&'Set PET_ROOM_PLAYWRIGHT_MODULE'},async()=>{
 const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
 const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;width:100%;height:100%}#shop{position:absolute;inset:0}</style><div id="shop" class="pet-room-view"></div><script type="module">
 import {createRoomLandscape} from '/room-landscape.mjs';import {createShopPanel} from '/shop-panel.js';import {createLifePanel} from '/life-ui.js';import {newLifeState} from '/life-engine.mjs';
 window.startOrientation=mode=>{window.land?.dispose();window.enters=window.exits=0;let full=null;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>full});document.documentElement.requestFullscreen=async()=>{enters++;if(mode==='denied')throw new DOMException('Denied','NotAllowedError');full=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));};document.exitFullscreen=async()=>{exits++;full=null;document.dispatchEvent(new Event('fullscreenchange'));};Object.defineProperty(screen.orientation,'lock',{configurable:true,value:mode==='missing'?undefined:async()=>{throw new DOMException('Unavailable','NotSupportedError');}});screen.orientation.unlock=()=>{};window.land=createRoomLandscape({allowPortrait:true});};
 window.layout={furniture:{}};window.selected=null;const s={ready:true,lifecycle:'ready',shop:{valid:true,balance:1000,catalog:[{sku:'mushroom-stool',name:'蘑菇凳',price:100,category:'furniture'}],owned:[],stored:[],storageCatalog:[],tiers:[]}};
 window.shopPanel=createShopPanel({root:document.querySelector('#shop'),api:{getState:()=>s,getLayout:()=>layout,setDecorationMode:async()=>true,selectDecorationFurniture:id=>(selected=id,true),purchaseFurniture:async()=>{layout.furniture['shop-mushroom-stool']={position:[0,0,1]};s.shop.owned.push('mushroom-stool');s.shop.balance-=100;return {ok:true};}}});
 window.openGarden=async()=>{window.life?.dispose();const state=newLifeState(),now=Date.now();state.plots[0]={crop:'carrot',plantedAt:now-900000,readyAt:now-1000,watered:true};state.plots[1]={crop:'berry',plantedAt:now-30000,readyAt:now+60000,watered:false};const data={state,serverNow:now,activeRoomId:'room-1',ownedFurniture:[],placedFurniture:[]};window.actions=[];window.life=createLifePanel({client:{refresh:async()=>data,act:async a=>{actions.push(a);return data;}},getApi:()=>({setPresentationPaused(){}})});await life.open('garden');};window.fixtureReady=true;
 </script>`;
 const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const file=resolve(root,'.'+new URL(req.url,'http://test').pathname);if(!file.startsWith(root+sep))throw Error();const body=await readFile(file);res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(body);}catch{res.writeHead(404).end();}});let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await playwright.chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader','--enable-webgl']});
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.fixtureReady,null,{timeout:5000});
  for(const mode of ['missing','reject','denied']){
   await page.evaluate(async mode=>{startOrientation(mode);await land.enter();},mode);
   assert.equal(await page.evaluate(()=>enters),1,'fullscreen attempted even without orientation API');
   assert.equal(await page.evaluate(()=>!!document.fullscreenElement),mode!=='denied');assert.equal(await page.evaluate(()=>exits),0,'failed rotation must not exit successful fullscreen');
   assert(await page.locator('.room-landscape-help').isVisible());assert.match(await page.locator('.room-landscape-help').innerText(),/自动旋转/);
   await page.setViewportSize({width:844,height:390});await page.locator('.room-landscape-help').waitFor({state:'hidden'});
   await page.setViewportSize({width:390,height:844});if(mode!=='denied')assert(await page.evaluate(()=>!!document.fullscreenElement),'resize must preserve fullscreen');
   await page.evaluate(()=>land.dispose());assert.equal(await page.locator('.room-landscape-help').count(),0);assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
  }
  await page.evaluate(async()=>{startOrientation('reject');await land.enter();});assert(await page.locator('.room-landscape-help').isVisible());await page.evaluate(()=>document.exitFullscreen());assert(await page.locator('.room-landscape-help').isHidden(),'exiting fullscreen must also remove its obsolete rotation prompt');await page.evaluate(()=>land.dispose());
  await page.evaluate(()=>shopPanel.open('furniture'));await page.locator('[data-shop-action=purchase][data-sku=mushroom-stool]').click();await page.getByRole('button',{name:'调整刚摆好的家具',exact:true}).click();assert.equal(await page.evaluate(()=>selected),'shop-mushroom-stool');assert(await page.locator('.room-shop__sheet').isHidden());
  await page.evaluate(()=>openGarden());
  for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1366,height:768}]){
   await page.setViewportSize(size);await page.waitForFunction(()=>{const c=document.querySelector('.life-stage canvas'),r=c?.getBoundingClientRect();return r?.width>100&&r.height>100&&c.width>100;});
   assert(await page.locator('.life-body').evaluate(n=>n.scrollWidth<=n.clientWidth+2),'garden must not overflow horizontally');
   await page.getByRole('button',{name:'种植格 3',exact:true}).tap();await page.locator('.garden-seed-grid').scrollIntoViewIfNeeded();
   for(const b of await page.locator('.garden-seed-card').all())assert((await b.boundingBox()).width>=60);
   await page.getByRole('button',{name:/胡萝卜 · 种子/}).tap();assert.equal(await page.evaluate(()=>actions.at(-1).slot),2);
   if(process.env.PET_ROOM_QA_SHOTS){await mkdir(process.env.PET_ROOM_QA_SHOTS,{recursive:true});await page.locator('.life-body').evaluate(n=>n.scrollTop=0);await page.waitForTimeout(200);await page.screenshot({path:resolve(process.env.PET_ROOM_QA_SHOTS,'花园完整面板-'+size.width+'.png')});}
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
