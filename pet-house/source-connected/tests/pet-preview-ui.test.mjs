import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.pet-live-preview canvas{width:301px;height:201px;display:block}#mount{height:2600px}button{min-height:44px}</style><div id="mount"></div><script type="module">import {createPetPreview} from '/pet-preview.js';window.preview=createPetPreview(document.querySelector('#mount'));preview.show('cloud-bunny');</script>`;
test('pet preview stops work offscreen, avoids fractional-DPR reallocations and recovers GPU context', {skip:!playwright&&'Set PET_ROOM_PLAYWRIGHT_MODULE for browser checks'},async()=>{
 const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}const file=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+sep))throw Error('path');let body=await readFile(file);if(file.endsWith(sep+'pet-preview.js'))body=Buffer.from(body.toString().replaceAll('renderer.setSize(w,h,false)','(window.previewResizes=(window.previewResizes||0)+1,renderer.setSize(w,h,false))').replaceAll('renderer.render(scene,camera)','(window.previewFrames=(window.previewFrames||0)+1,renderer.render(scene,camera))'));res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(body);}catch{res.writeHead(404).end();}});
 let browser;try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await playwright.chromium.launch({headless:true,...process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{},args:['--use-angle=swiftshader','--enable-webgl']});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.previewFrames>4);
 const count=()=>page.evaluate(()=>({frames:window.previewFrames||0,resizes:window.previewResizes||0}));
 const before=await count();await page.waitForFunction(n=>previewFrames>n+4,before.frames);assert.equal((await count()).resizes,before.resizes,'301 CSS pixels at DPR 1.5 must not resize the GPU canvas every frame');
 await page.evaluate(()=>scrollTo(0,1500));await page.waitForTimeout(350);const offscreen=await count();await page.waitForTimeout(300);assert.equal((await count()).frames,offscreen.frames,'offscreen preview must stop drawing');
 await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(n=>previewFrames>n,offscreen.frames);
 // Use the real WEBGL_lose_context extension, then restore the same renderer.
 assert(await page.evaluate(()=>{window.loss=document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');loss?.loseContext();return !!loss;}));
 await page.waitForFunction(()=>document.querySelector('.pet-live-preview p').textContent.includes('恢复'));
 const lost=await count();await page.waitForTimeout(250);assert.equal((await count()).frames,lost.frames);
 await page.evaluate(()=>loss.restoreContext());await page.waitForFunction(n=>previewFrames>n,lost.frames);await page.getByRole('button',{name:'坐下来',exact:true}).click();
 await page.evaluate(()=>preview.hide());const hidden=await count();await page.waitForTimeout(150);assert.deepEqual(await count(),hidden);assert(await page.locator('.pet-live-preview').isHidden());
 await page.evaluate(()=>preview.show('mint-cat'));await page.waitForFunction(n=>previewFrames>n,hidden.frames);
 await page.evaluate(()=>preview.dispose());const disposed=await count();await page.waitForTimeout(150);assert.deepEqual(await count(),disposed);assert.equal(await page.locator('.pet-live-preview').count(),0);
 // Older WebViews without observers still support showing, resizing and cleanup.
 await page.evaluate(async()=>{window.IntersectionObserver=undefined;window.ResizeObserver=undefined;const {createPetPreview}=await import('/pet-preview.js');window.preview=createPetPreview(document.querySelector('#mount'));preview.show('cloud-bunny');});await page.waitForFunction(n=>previewFrames>n,disposed.frames);await page.evaluate(()=>preview.dispose());assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
