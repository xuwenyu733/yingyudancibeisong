import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
let playwright;try{playwright=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');}catch{}
const project=fileURLToPath(new URL('../',import.meta.url));
const html=`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/room.css"><link rel="stylesheet" href="/estate-ui.css"><style>body{margin:12px}.host{width:480px;height:720px}</style></head><body><div class="host"><div class="pet-room-view" id="room"></div></div><script type="module">
import {createEstatePanel} from '/estate-ui.js';
const state={activeRoomId:'a',balance:1234,rooms:[{id:'a',name:'花园之家',template:'cream',floor:0,world:{revision:7,updatedAt:'2026-10-30T05:30:00Z',checkpointCount:1}},{id:'b',name:'薄荷书房',template:'mint',floor:1,world:{revision:2,updatedAt:'2026-10-30T04:00:00Z',checkpointCount:1}}]};
const saves={a:[{id:'one',roomId:'a',name:'花园午后',createdAt:'2026-10-30T03:00:00Z'}],b:[{id:'two',roomId:'b',name:'安静的书房',createdAt:'2026-10-30T04:00:00Z'}]};window.calls=[];
const api={getEstate:()=>({ok:true,estate:structuredClone(state)}),listRoomWorldSaves:id=>({ok:true,saves:structuredClone(saves[id])}),
 async saveRoomWorld(id,input){calls.push(['save',id,input]);saves[id].unshift({id:'new',roomId:id,name:input.name||'新存档',createdAt:'2026-10-30T06:00:00Z'});state.rooms.find(r=>r.id===id).world.checkpointCount=saves[id].length;return{ok:true};},
 async restoreRoomWorld(id,saveId){calls.push(['restore',id,saveId]);return{ok:true};},
 async removeRoomWorldSave(id,saveId){calls.push(['remove',id,saveId]);saves[id]=saves[id].filter(s=>s.id!==saveId);state.rooms.find(r=>r.id===id).world.checkpointCount=saves[id].length;return{ok:true};},
 async exportRoomWorld(id){calls.push(['export',id]);return{ok:true,archive:{format:'pet-room-world',version:1,roomId:id,snapshot:{name:'花园'}}};},
 async importRoomWorld(id,json){calls.push(['import',id,JSON.parse(json).roomId]);return{ok:true};},
 async selectEstateRoom(id){calls.push(['select',id]);state.activeRoomId=id;return{ok:true};}};
window.panel=createEstatePanel({root:document.querySelector('#room'),api});panel.update({ready:true});panel.open();window.fixtureReady=true;
</script></body></html>`;

test('floor world save controls work in desktop and narrow embedded rooms',{skip:!playwright&&'Install Playwright or set PET_ROOM_PLAYWRIGHT_MODULE'},async t=>{
  const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const file=resolve(project,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(resolve(project)+sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await playwright.chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{})});
    async function pageFor(run){const page=await browser.newPage({viewport:{width:900,height:850}}),errors=[];page.on('pageerror',error=>errors.push(error.message));try{await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.fixtureReady);await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}}
    await t.test('named save and restoration use inline confirmation for the selected floor',()=>pageFor(async page=>{
      await page.getByLabel('这一层的存档点名字').fill('冬日花园');await page.getByRole('button',{name:'保存此层',exact:true}).click();
      await page.getByLabel('读取存档点 冬日花园').waitFor();assert.deepEqual(await page.evaluate(()=>calls),[['save','a',{name:'冬日花园'}]]);
      await page.getByLabel('读取存档点 冬日花园').click();await page.locator('.estate-world-confirm').waitFor({state:'visible'});
      assert.match(await page.locator('.estate-world-confirm').textContent(),/1 楼「花园之家」.*共享积分、收藏与其他楼层保留/s);
      assert.equal(await page.evaluate(()=>calls.length),1);await page.getByRole('button',{name:'先不读取',exact:true}).click();assert.equal(await page.locator('.estate-world-confirm').isHidden(),true);
      await page.getByLabel('读取存档点 冬日花园').click();await page.getByRole('button',{name:'确认读取这一层',exact:true}).click();
      await page.waitForFunction(()=>calls.some(call=>call[0]==='restore'));assert.deepEqual(await page.evaluate(()=>calls[1]),['restore','a','new']);
    }));
    await t.test('narrow room has no horizontal overflow and confirmation buttons remain reachable',()=>pageFor(async page=>{
      await page.locator('.host').evaluate(node=>{node.style.width='280px';node.style.height='540px';});
      await page.getByLabel('读取存档点 花园午后').click();await page.getByRole('button',{name:'确认读取这一层',exact:true}).scrollIntoViewIfNeeded();
      const bounds=await page.evaluate(()=>{const p=document.querySelector('.estate-panel'),c=document.querySelector('.estate-world'),button=document.querySelector('.estate-confirm-yes');return{width:p.clientWidth,scroll:p.scrollWidth,card:c.getBoundingClientRect().toJSON(),panel:p.getBoundingClientRect().toJSON(),button:button.getBoundingClientRect().toJSON()};});
      assert(bounds.scroll<=bounds.width+1);assert(bounds.card.left>=bounds.panel.left);assert(bounds.card.right<=bounds.panel.right+1);assert(bounds.button.left>=bounds.panel.left);assert(bounds.button.right<=bounds.panel.right+1);
      await page.getByRole('button',{name:'确认读取这一层',exact:true}).click();await page.waitForFunction(()=>calls.some(call=>call[0]==='restore'));
    }));
    await t.test('download is one-floor JSON and a selected import file awaits confirmation',()=>pageFor(async page=>{
      const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出这一层',exact:true}).click();const download=await downloading;
      assert.match(download.suggestedFilename(),/1楼-花园之家-小世界\.json$/);await download.cancel();
      await page.getByLabel('导入这一层的存档文件').setInputFiles({name:'花园.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'pet-room-world',version:1,roomId:'a',snapshot:{name:'花园'}}))});
      await page.locator('.estate-world-confirm').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='import').length),0);
      await page.getByRole('button',{name:'确认读取这一层',exact:true}).click();await page.waitForFunction(()=>calls.some(c=>c[0]==='import'));assert.deepEqual(await page.evaluate(()=>calls.find(c=>c[0]==='import')),['import','a','a']);
    }));
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
