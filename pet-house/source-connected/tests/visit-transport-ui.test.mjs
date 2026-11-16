import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const root=fileURLToPath(new URL('../',import.meta.url));

test('canonical guest and owner transport lifecycle',{skip:!playwright&&'Requires Playwright',timeout:45000},async t=>{
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><body></body>');return;}
 if(path==='/pet-house.js'){res.setHeader('Content-Type','text/javascript');res.end(`export function mountPetHouse(options){window.mountOptions=options;window.mountCount=(window.mountCount||0)+1;window.applied=[];const api={applyRoomVisitState(value){applied.push(value);},setVisitInteractionTransport(callback,options){window.transport=callback;window.transportOptions=options;}};return {api,ready:Promise.resolve(),dispose(){window.mountDisposed=true;}};}`);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)&&!file.startsWith(root))throw Error('path');res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await playwright.chromium.launch({headless:true,...process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}});const url='http://127.0.0.1:'+server.address().port;
 async function fixture(run){const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(3000);try{await page.goto(url);await page.evaluate(()=>{window.now=100000;Date.now=()=>now;window.timers=new Map();let serial=0;window.setInterval=fn=>{timers.set(++serial,fn);return serial;};window.clearInterval=id=>timers.delete(id);window.tick=()=>{now+=3000;for(const fn of timers.values())fn();};window.hidden=false;Object.defineProperty(document,'hidden',{get:()=>hidden});window.hide=()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));};window.owner={publicId:'PET-OWNERAAAAA',name:'主人',roomId:'room-1',busy:false,pet:{sku:'apricot-fox',petName:'团团',outfit:'default',growthStage:1}};window.self={id:'invite',publicId:'PET-GUESTAAAAA',name:'客人',roomId:'room-1',floor:0,pet:{sku:'cloud-cat',petName:'云朵',outfit:'default',growthStage:2}};window.snap=(revision=1)=>({ok:true,generation:7,revision,homeRevision:window.homeRevision||1,serverNow:100000+revision,owner,visitors:[self]});window.calls=[];});await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}}
 async function guest(page){await page.evaluate(async()=>{const {openFriendVisit}=await import('/social-visit.js');window.client={identity:{publicId:self.publicId,name:self.name},visit:async()=>({homeRevision:window.homeRevision||1,host:owner,activePet:owner.pet.sku,floors:[{id:'room-1',floor:0,name:'一楼',scene:{roomLevel:0,layout:null,stored:[],appearance:{wallColor:'cream',flooring:null}},decoration:{}}]}),request:async(path,options)=>{calls.push({path,...options});if(path==='visit-presence'&&options.data.active&&window.deferBeat)return new Promise(resolve=>window.finishBeat=resolve);return snap(path==='visit-action'?3:1);},post:async()=>({ok:true})};window.visit=await openFriendVisit({client,id:'invite'});});}
 await t.test('a guest keeps one canonical pet and submits only server-recognized intent',()=>fixture(async page=>{
  await guest(page);assert.deepEqual(await page.evaluate(()=>mountOptions.visitMode),{role:'guest',roomId:'room-1',selfPublicId:'PET-GUESTAAAAA',ownerPublicId:'PET-OWNERAAAAA'});
  assert.equal(await page.evaluate(()=>applied.at(-1).visitors[0].pet.petName),'云朵');
  await page.evaluate(()=>transport({type:'furniture',targetId:'sofa',position:{x:99,z:99},pet:{sku:'forged'}}));
  const sent=await page.evaluate(()=>calls.find(x=>x.path==='visit-action').data);assert.equal(sent.generation,7);assert.equal(sent.roomId,'room-1');assert.match(sent.requestId,/^[a-zA-Z0-9_-]+$/);assert.deepEqual(sent.action,{type:'furniture',targetId:'sofa'});
  assert.equal(await page.evaluate(()=>calls.filter(x=>x.path==='visit-presence'&&x.data.active)[0].data.join),true);
  await page.evaluate(()=>visit.close());assert.equal(await page.evaluate(()=>timers.size),0);
 }));
 await t.test('an older heartbeat cannot undo an accepted furniture action',()=>fixture(async page=>{
  await guest(page);await page.evaluate(()=>{window.deferBeat=true;tick();});await page.waitForFunction(()=>typeof finishBeat==='function');await page.evaluate(()=>transport({type:'furniture',targetId:'sofa'}));await page.evaluate(()=>finishBeat(snap(2)));assert.equal(await page.evaluate(()=>applied.at(-1).revision),3);
  assert.equal(await page.evaluate(()=>calls.filter(x=>x.path==='visit-presence'&&x.data.active).at(-1).data.join),undefined);await page.evaluate(()=>visit.close());
 }));
 await t.test('hiding a guest removes actors, aborts polling and sends an inactive beacon',()=>fixture(async page=>{
  await guest(page);await page.evaluate(()=>{window.deferBeat=true;tick();});await page.waitForFunction(()=>typeof finishBeat==='function');await page.evaluate(()=>hide());assert.equal(await page.evaluate(()=>transport),null);assert.equal(await page.evaluate(()=>timers.size),0);assert.equal(await page.evaluate(()=>applied.at(-1).visitors.length),0);assert.equal(await page.evaluate(()=>calls.at(-1).data.active),false);assert.equal(await page.evaluate(()=>calls.at(-1).keepalive),true);await page.evaluate(()=>finishBeat(snap(9)));assert.equal(await page.evaluate(()=>applied.at(-1).visitors.length),0);await page.evaluate(()=>visit.close());
 }));
 await t.test('the guest can end a seat or switch furniture without waiting for lease expiry',()=>fixture(async page=>{
  await guest(page);await page.evaluate(()=>{window.actionRevision=10;client.request=async(path,options)=>{calls.push({path,...options});if(path==='visit-action'){const action=options.data.action;self.action=action.type==='cancel'?null:{id:'action-'+(++actionRevision),kind:'seat',targetId:action.targetId};}return snap(++actionRevision);};});
  await page.evaluate(()=>transport({type:'furniture',targetId:'sofa'}));assert.equal(await page.getByRole('button',{name:'结束互动',exact:true}).isEnabled(),true);
  await page.evaluate(()=>transport({type:'furniture',targetId:'sofa'}));assert.deepEqual(await page.evaluate(()=>calls.filter(x=>x.path==='visit-action').map(x=>x.data.action.type)),['furniture','cancel']);
  await page.evaluate(()=>transport({type:'furniture',targetId:'sofa'}));await page.evaluate(()=>transport({type:'furniture',targetId:'table'}));
  const last=await page.evaluate(()=>calls.filter(x=>x.path==='visit-action').slice(-2).map(x=>x.data.action));assert.equal(last[0].type,'cancel');assert.match(last[0].actionId,/^action-/);assert.deepEqual(last[1],{type:'furniture',targetId:'table'});
  await page.getByRole('button',{name:'结束互动',exact:true}).click();assert.equal(await page.getByRole('button',{name:'结束互动',exact:true,includeHidden:true}).isDisabled(),true);await page.evaluate(()=>visit.close());
 }));
 await t.test('a changed public floor refreshes once while unchanged snapshots keep the renderer',()=>fixture(async page=>{
  await guest(page);assert.equal(await page.evaluate(()=>mountCount),1);
  await page.evaluate(()=>{const previous=client.visit;client.visit=async(...args)=>{const value=await previous(...args);value.floors[0].name='新的布置';return value;};window.homeRevision=2;client.request=async(path,options)=>{calls.push({path,...options});return snap(2);};tick();});
  await page.waitForFunction(()=>mountCount===2);await page.locator('.social-visit-status').filter({hasText:'新的布置'}).waitFor();await page.evaluate(()=>tick());assert.equal(await page.evaluate(()=>mountCount),2);await page.evaluate(()=>visit.close());
 }));
 await t.test('host seat preflight publishes the current actor without accepting guest coordinates',()=>fixture(async page=>{
  await page.evaluate(async()=>{const {createVisitorPanel}=await import('/visitor-ui.js');window.ownerApplied=[];window.ownerApi={getState:()=>({ready:true}),getEstate:()=>({estate:{activeRoomId:'room-1'}}),getVisitActorState:()=>({position:{x:1,z:2},busy:false,seatId:null}),applyRoomVisitState:value=>ownerApplied.push(value),setRoomVisitors(){},setVisitInteractionTransport:callback=>window.hostTransport=callback};window.panel=createVisitorPanel({client:{identity:{publicId:owner.publicId},request:async(path,options)=>{calls.push({path,...options});return snap(options.data?.action?2:1);}},getApi:()=>ownerApi});});await page.waitForFunction(()=>typeof hostTransport==='function');
  await page.evaluate(()=>hostTransport({type:'furniture',targetId:'sofa',seatId:'sofa',position:{x:99,z:99}}));
  const call=await page.evaluate(()=>calls.at(-1));assert.equal(call.path,'host-presence');assert.deepEqual(call.data.position,{x:1,z:2});assert.equal(call.data.seatId,null);assert.deepEqual(call.data.action,{type:'furniture',targetId:'sofa',seatId:'sofa'});
  await page.evaluate(()=>panel.setAway(true));assert.equal(await page.evaluate(()=>hostTransport),null);assert.equal(await page.evaluate(()=>calls.at(-1).data.active),false);await page.evaluate(()=>panel.dispose());assert.equal(await page.evaluate(()=>timers.size),0);
 }));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

