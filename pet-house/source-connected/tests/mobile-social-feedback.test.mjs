import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const root=fileURLToPath(new URL('../',import.meta.url));

test('mobile friend scrolling, invitation haptics and unobtrusive visiting controls',{skip:!playwright&&'Requires Playwright',timeout:60000},async t=>{
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/social.css"><body><div class="pet-room-nameplate">自己的小屋名牌</div></body>');return;}
 if(path==='/pet-house.js'){res.setHeader('Content-Type','text/javascript');res.end(`export function mountPetHouse(options){window.mountOptions=options;const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';options.container.append(canvas);window.mounted=(window.mounted||0)+1;return {ready:Promise.resolve(),api:{applyRoomVisitState(){},setVisitInteractionTransport(fn){window.visitTransport=fn;}},dispose(){canvas.remove();}};}`);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)&&!file.startsWith(root))throw Error('path');res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await playwright.chromium.launch({headless:true,...process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}});const url='http://127.0.0.1:'+server.address().port;
 async function fixture(run,viewport={width:844,height:390}){const context=await browser.newContext({viewport,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(4000);try{await page.goto(url);await page.evaluate(async()=>{
  window.polls=0;window.haptics=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>{haptics.push(pattern);return true;}});window.ticks=new Map();let serial=0;window.setInterval=fn=>{ticks.set(++serial,fn);return serial;};window.clearInterval=id=>ticks.delete(id);window.tick=()=>{for(const fn of ticks.values())fn();};
  window.invitations=[];window.friends=Array.from({length:12},(_,i)=>({publicId:'PET-'+String(i).padStart(10,'0'),name:'伙伴'+(i+1),unread:0}));window.client={identity:{publicId:'PET-AAAAAAAAAA'},overview:async()=>{polls++;return {friends,incoming:[],outgoing:[],invitations,blocks:[]};},messages:async()=>({messages:Array.from({length:30},(_,i)=>({id:String(i+1),text:'消息'+i,mine:false,sentAt:new Date().toISOString()}))}),post:async()=>({ok:true})};const {createFriendsPanel}=await import('/social-ui.js');window.panel=createFriendsPanel({client});panel.open();
 });await page.getByLabel('我的好友列表').getByText('伙伴12',{exact:true}).waitFor({state:'attached'});await run(page);assert.deepEqual(errors,[]);}finally{await context.close();}}
 for(const viewport of [{width:360,height:800},{width:844,height:390},{width:667,height:320},{width:1024,height:768},{width:1440,height:900}])await t.test('all friends and chat controls remain reachable at '+viewport.width+'×'+viewport.height,()=>fixture(async page=>{
  const bounds=await page.locator('.social-panel').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
  assert.equal(await page.locator('.pet-room-nameplate').evaluate(n=>getComputedStyle(n).visibility),'hidden');
  const scroll=page.locator('.social-scroll:visible'),metrics=await scroll.evaluate(n=>({height:n.clientHeight,total:n.scrollHeight}));assert(metrics.height>=90,'landscape must retain usable content height');assert(metrics.total>metrics.height);
  const box=await scroll.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,10000);await page.waitForFunction(()=>document.querySelector('.social-scroll:not([hidden])').scrollTop>100);
  const last=page.getByLabel('我的好友列表').locator('.social-person').last();await last.getByRole('button',{name:'聊天',exact:true}).click();await page.getByRole('log').getByText('消息29',{exact:true}).waitFor();await page.getByLabel('聊天消息').fill('横屏也能聊天');assert(await page.getByRole('button',{name:'发送',exact:true}).isVisible());
  await page.getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await page.locator('.pet-room-nameplate').evaluate(n=>getComputedStyle(n).visibility),'visible');
 },viewport));
 await t.test('touch swipes scroll the landscape list',()=>fixture(async page=>{
  const area=await page.locator('.social-scroll:visible').boundingBox(),cdp=await page.context().newCDPSession(page),x=area.x+area.width*.6,start=area.y+area.height-15;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start-i*(area.height-40)/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>document.querySelector('.social-scroll:not([hidden])').scrollTop>20);
 }));
 await t.test('new received invitations vibrate once and still show text if vibration is blocked',()=>fixture(async page=>{
  await page.evaluate(()=>{invitations=[{id:'first',name:'小米',direction:'received',state:'pending',expiresAt:new Date(Date.now()+60000).toISOString()}];tick();});await page.locator('.social-status').filter({hasText:'小米邀请你'}).waitFor();assert.deepEqual(await page.evaluate(()=>haptics),[[60,40,60]]);
  await page.evaluate(()=>tick());await page.waitForFunction(()=>polls>=3);assert.equal(await page.evaluate(()=>haptics.length),1);
  await page.evaluate(()=>{navigator.vibrate=()=>{throw Error('unsupported');};invitations.push({id:'second',name:'小云',direction:'received',state:'pending',expiresAt:new Date(Date.now()+60000).toISOString()});tick();});await page.locator('.social-status').filter({hasText:'小云邀请你'}).waitFor();assert.equal(await page.locator('.social-visit').count(),0,'notifications cannot auto-enter a friend home');
 }));
 await t.test('visiting fills the canvas and keeps only compact reachable icon controls',()=>fixture(async page=>{
  await page.evaluate(async()=>{panel.dispose();const {openFriendVisit}=await import('/social-visit.js');window.visit=await openFriendVisit({id:'invite',client:{identity:{publicId:'PET-GUESTAAAAA'},visit:async()=>({host:{name:'朋友'},activePet:'apricot-fox',floors:[0,1].map(n=>({id:'room-'+(n+1),floor:n,name:(n+1)+'楼',scene:{roomLevel:0,layout:null,stored:[],appearance:{wallColor:'cream',flooring:null}},decoration:{}}))}),post:async()=>({ok:true}),request:async()=>({ok:true,generation:1,revision:++polls,serverNow:Date.now(),visitors:[],owner:null})}});});
  for(const viewport of [{width:360,height:800},{width:844,height:390},{width:1440,height:900}]){await page.setViewportSize(viewport);const stage=await page.locator('.social-visit-stage').boundingBox();assert.deepEqual(stage,{x:0,y:0,...viewport});assert.equal(await page.locator('.social-visit header').count(),0);assert.equal(await page.getByRole('button',{name:'和主人打招呼'}).count(),0);assert.equal(await page.locator('.social-visit-controls').innerText(),'');const back=await page.getByRole('button',{name:'返回我的小屋'}).boundingBox();assert(back.width>=44&&back.height>=44&&back.y+back.height<=viewport.height);}
  await page.getByRole('button',{name:'切换参观楼层'}).click();await page.getByRole('button',{name:'2 楼 · 2楼'}).click();await page.waitForFunction(()=>mountOptions.visitMode.roomId==='room-2');assert(await page.locator('.social-visit-floors').isHidden());await page.getByRole('button',{name:'返回我的小屋'}).click();assert.equal(await page.locator('.social-visit').count(),0);assert.equal(await page.evaluate(()=>ticks.size),0);
 }));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
