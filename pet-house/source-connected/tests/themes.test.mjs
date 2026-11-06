import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ROOM_THEME_STORAGE_KEY} from '../theme.mjs';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const project=fileURLToPath(new URL('../',import.meta.url));
const html=`<!doctype html><meta charset="utf-8"><style>body{background:rgb(20,30,40);margin:0}.host{width:480px;height:500px;display:inline-block}</style><script type="module">
import {createRoomTheme,bindRoomThemeButton} from '/theme.mjs';window.instances=[];
window.makeTheme=async({shadow=false}={})=>{const host=document.createElement('div');host.className='host';document.body.append(host);const scope=shadow?host.attachShadow({mode:'closed'}):host;const link=document.createElement('link');link.rel='stylesheet';link.href='/styles.css';const loaded=new Promise(r=>link.onload=r);scope.append(link);const root=document.createElement('div');root.className='pet-room-view';root.innerHTML='<section class="room-shop"><div class="room-shop__sheet"><article class="room-shop__card"><h2 class="room-shop__product-name">商品</h2></article></div></section><button class="room-profile-theme" type="button">护眼</button><section data-room-control="decoration-panel"><input type="number"></section>';scope.append(root);let calls=[];const theme=createRoomTheme({root,api:{setTheme:value=>calls.push(value)}});const binding=bindRoomThemeButton({root,button:root.querySelector('.room-profile-theme')});const item={root,theme,binding,calls,host};instances.push(item);await loaded;return instances.length-1;};window.fixtureReady=true;
</script>`;

test('UI themes are isolated, persistent and shared across room surfaces',{skip:!playwright&&'Install Playwright or set PET_ROOM_PLAYWRIGHT_MODULE'},async t=>{
 const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const path=resolve(project,`.${new URL(req.url,'http://localhost').pathname}`);if(!path.startsWith(resolve(project)+sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',extname(path)==='.css'?'text/css':'text/javascript');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await playwright.chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{})});const url=`http://127.0.0.1:${server.address().port}`;
  async function pageFor(run){const page=await browser.newPage();try{await page.goto(url);await page.waitForFunction(()=>window.fixtureReady);await run(page);}finally{await page.close();}}
  await t.test('the toggle updates every surface and the 3D callback without changing host appearance',()=>pageFor(async page=>{
   await page.evaluate(()=>makeTheme());
   const result=await page.evaluate(()=>{const {root,theme,calls}=instances[0],light=getComputedStyle(root.querySelector('.room-shop__sheet')).backgroundColor;root.querySelector('[data-ui-theme="eye-care"]').click();return {mode:root.dataset.uiTheme,pressed:root.querySelector('[data-ui-theme="eye-care"]').getAttribute('aria-pressed'),light,eye:getComputedStyle(root.querySelector('.room-shop__sheet')).backgroundColor,card:getComputedStyle(root.querySelector('.room-shop__card')).backgroundColor,host:getComputedStyle(document.body).backgroundColor,button:root.querySelector('.room-profile-theme').getAttribute('aria-label'),calls};});
   assert.equal(result.mode,'eye-care');assert.equal(result.pressed,'true');assert.notEqual(result.light,result.eye);assert.notEqual(result.eye,result.card);assert.equal(result.host,'rgb(20, 30, 40)');assert.equal(result.button,'切换为亮色配色');assert.deepEqual(result.calls,['light','eye-care']);
   await page.reload();await page.waitForFunction(()=>window.fixtureReady);await page.evaluate(()=>makeTheme());assert.equal(await page.evaluate(()=>instances[0].root.dataset.uiTheme),'eye-care');
  }));
  await t.test('closed-shadow widgets and the profile shortcut use the same preference with cleanup',()=>pageFor(async page=>{
   await page.evaluate(()=>makeTheme({shadow:true}));
   assert.deepEqual(await page.evaluate(()=>{const {root,theme,binding}=instances[0];root.querySelector('.room-profile-theme').click();const current={mode:root.dataset.uiTheme,text:root.querySelector('.room-profile-theme').textContent,color:getComputedStyle(root.querySelector('.room-shop__sheet')).backgroundColor};binding.dispose();theme.dispose();return {current,toggles:root.querySelectorAll('.room-theme-controls').length,after:root.getAttribute('data-ui-theme')};}),{current:{mode:'eye-care',text:'亮色',color:'rgb(220, 226, 209)'},toggles:0,after:null});
  }));
  await t.test('legacy dark preference migrates to the muted eye-care palette',()=>pageFor(async page=>{
   await page.evaluate(()=>localStorage.setItem('original-pet-room-theme','dark'));await page.evaluate(()=>makeTheme());assert.equal(await page.evaluate(()=>instances[0].theme.value),'eye-care');
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),ROOM_THEME_STORAGE_KEY),null,'reading a legacy preference does not modify room/account data');
  }));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
