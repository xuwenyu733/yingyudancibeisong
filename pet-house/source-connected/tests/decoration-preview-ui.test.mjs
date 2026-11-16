import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html,body,#app{width:100%;height:100%;margin:0}</style><div id="app"></div><script type="module">import {mountPetHouse} from '/pet-house.js';window.room=mountPetHouse({container:document.querySelector('#app'),storageAdapter:localStorage,storageKey:'preview-safety-browser',initialPoints:10000,quality:'balanced',styles:false,demo:true});window.HamsterRoom=room.api;room.ready.catch(e=>window.fixtureError=e.message);</script></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
test('unconfirmed furniture combinations are isolated from editing and commerce, with clean undo and reload',{skip:!playwright&&'Set PET_ROOM_PLAYWRIGHT_MODULE for browser checks'},async()=>{
 const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const file=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});let browser;
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await playwright.chromium.launch({headless:true,...process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{},args:['--use-angle=swiftshader','--enable-webgl']});const page=await browser.newPage({viewport:{width:1366,height:900},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function ready(){await page.waitForFunction(()=>window.HamsterRoom?.getState().ready||window.fixtureError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.fixtureError),undefined);await page.locator('#app [data-room-control="loading"]').waitFor({state:'hidden'});await page.locator('.companion-celebration').waitFor({state:'hidden',timeout:20000});}
 await page.goto('http://127.0.0.1:'+server.address().port);await ready();

 assert((await page.evaluate(()=>HamsterRoom.collectAllFurniture('audit-empty'))).ok);
 assert((await page.evaluate(()=>HamsterRoom.purchaseFurnitureCopy('mushroom-stool','audit-stool'))).ok);
 const state=()=>page.evaluate(()=>({layout:HamsterRoom.getLayout(),shop:HamsterRoom.getShop()}));
 const bought=await state(),key='shop-mushroom-stool';
 assert(await page.evaluate(()=>HamsterRoom.setDecorationMode(true)));
 assert(await page.evaluate(()=>HamsterRoom.selectDecorationFurniture('shop-mushroom-stool')));
 await page.locator('.studio-group-library summary').click();
 await page.getByLabel('家具组合名字',{exact:true}).fill('预览隔离检查');
 await page.getByRole('button',{name:'收藏选中家具',exact:true}).click();
 let moved=false;
 for(const action of [{dx:.8},{dx:-.8},{dz:.8},{dz:-.8}]){
  if((await page.evaluate(action=>HamsterRoom.transformFurnitureGroup(action),action)).ok){moved=true;break;}
 }
 assert(moved);const edited=await state();assert.notDeepEqual(edited.layout.furniture[key],bought.layout.furniture[key]);
 const preview=()=>page.getByRole('button',{name:'预览隔离检查 · 1件',exact:true}).click();
 await preview();assert.deepEqual((await state()).layout.furniture[key],bought.layout.furniture[key]);
 // Deliberate synthetic dispatch checks handlers as well as disabled button appearance.
 await page.getByRole('button',{name:'固定位置',exact:true}).dispatchEvent('click');
 assert.notEqual((await state()).layout.definitions[key].locked,true,'unconfirmed preview must not be committed through lock');
 assert(await page.getByRole('button',{name:'固定位置',exact:true}).isDisabled());
 await page.locator('[data-room-control="undo-decoration"]').dispatchEvent('click');
 assert(await page.getByRole('button',{name:'取消预览',exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>HamsterRoom.setFurnitureTransform('shop-mushroom-stool',{rotation:[0,1,0]})),false);
 assert.equal((await page.evaluate(()=>HamsterRoom.transformFurnitureGroup({dx:.2}))).ok,false);
 assert.equal((await page.evaluate(()=>HamsterRoom.storeFurniture('mushroom-stool','audit-preview-store'))).ok,false);
 const c=page.locator('[data-room-control="room"]');
 await c.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:450,clientY:350,button:0});
 await c.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:8,clientX:550,clientY:350,button:0});
 await c.dispatchEvent('pointerup',{pointerType:'touch',pointerId:7});await c.dispatchEvent('pointerup',{pointerType:'touch',pointerId:8});
 assert(await page.getByRole('button',{name:'取消预览',exact:true}).isVisible());
 await page.getByRole('button',{name:'取消预览',exact:true}).click();assert.deepEqual((await state()).layout,edited.layout);
 await page.locator('[data-room-control="undo-decoration"]').click();assert.deepEqual((await state()).layout.furniture[key],bought.layout.furniture[key]);
 await page.locator('[data-room-control="redo-decoration"]').click();assert.deepEqual((await state()).layout,edited.layout);
 await preview();await page.getByRole('button',{name:'确认摆成这样',exact:true}).click();assert.deepEqual((await state()).layout.furniture[key],bought.layout.furniture[key]);
 await page.locator('[data-room-control="undo-decoration"]').click();assert.deepEqual((await state()).layout,edited.layout);
 assert(await page.evaluate(()=>HamsterRoom.setDecorationMode(false)));
 assert.equal((await state()).shop.balance,bought.shop.balance);assert.equal((await state()).shop.pets.active,bought.shop.pets.active);
 await page.reload();await ready();assert.deepEqual((await state()).layout,edited.layout);
 assert.equal((await state()).shop.balance,bought.shop.balance);
 assert.deepEqual(errors,[]);
 console.log('PASS round 1: isolated browser storage, preview lock/undo/gesture/API/commerce blocked, cancel restores, confirm undo works, exact balance and layout survive reload.');

 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
