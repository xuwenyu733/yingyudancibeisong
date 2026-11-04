import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Optional native browser suite. CI may provide Playwright normally, or set its module path.
let playwright;
try { playwright = await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href : 'playwright'); } catch {}
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/room.css"><link rel="stylesheet" href="/shop.css"><link rel="stylesheet" href="/profile-upgrade.css"><style>
body{margin:23px;background:rgb(20,30,40)} form{font-size:47px} .host{width:480px;height:440px;display:inline-block;vertical-align:top;margin:5px}
button{width:100%;font-size:32px;text-transform:uppercase} canvas{width:50px;height:50px} h2{margin:100px}
</style></head><body class="host-body"><form id="host-form"><div id="rooms"></div></form><script type="module">
const [view,shop,profile,decoration,THREE]=await Promise.all([import('/view.js'),import('/shop-panel.js'),import('/scene-profile.js'),import('/decoration.js'),import('/vendor/three/three.module.js')]);
window.modules={...view,...shop,...profile,...decoration,THREE};window.rooms=[];window.submits=0;
document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.submits++});
window.makeRoom=({withShop=true,withProfile=true,width=480,height=440}={})=>{
 const host=document.createElement('div');host.className='host';host.style.width=width+'px';host.style.height=height+'px';document.querySelector('#rooms').append(host);
 const v=view.createRoomView(host),calls={getProfile:0,name:0,avatar:0,checkin:0,purchase:0};
 const p={name:'原昵称',gender:'male',avatar:null,level:1,levelName:'小小学员',levelInfo:{progress:0,need:100,intoLevel:0},badges:[{id:'first-checkin',name:'第一次签到',description:'签到一次',category:'checkin',unlocked:false}],checkInDates:[],calendar:{year:2026,month:10,days:[{date:'2026-10-27',day:27,isToday:true}]},todayChecked:false,todayReward:{exp:5,points:3},tomorrowReward:{day:1,exp:5,points:3},makeups:{count:0},balance:1000};
 const state={ready:true,lifecycle:'ready',shop:{valid:true,balance:1000,owned:[],stored:[],roomLevel:0,width:8.8,depth:8.2,catalog:[{sku:'clover-planter',name:'四叶草盆栽',price:100}],storageCatalog:[],tiers:[],pets:{catalog:[{sku:'cloud-bunny',name:'云朵兔',price:300}],owned:['apricot-fox'],active:'apricot-fox'}}};
 const api={getState:()=>state,getProfile:()=>{calls.getProfile++;return {ok:true,profile:structuredClone(p)}},setProfileName:name=>{calls.name++;p.name=name;return {ok:true,message:'昵称已保存'}},setProfileAvatar:avatar=>{calls.avatar++;p.avatar=avatar;return {ok:true}},setProfileGender:gender=>{p.gender=gender;return {ok:true}},checkIn:()=>{calls.checkin++;p.todayChecked=true;return {ok:true,exp:5,points:3}},makeUpCheckIn:()=>({ok:true,cost:100,message:'已补签'}),purchaseFurniture:()=>{calls.purchase++;return {ok:true}},purchasePet:()=>({ok:true}),selectPet:()=>({ok:true}),unstoreFurniture:()=>({ok:true}),storeFurniture:()=>({ok:true}),expandRoom:()=>({ok:true})};
 const s=withShop?shop.createShopPanel({root:v.root,api}):null,pr=withProfile?profile.createProfilePanel({root:v.root,api}):null;
 pr?.update(state);const result={host,view:v,shop:s,profile:pr,api,p,state,calls};window.rooms.push(result);return window.rooms.length-1;
};window.fixtureReady=true;
</script></body></html>`;

test('embedded UI lifecycle and container behavior in Chromium', { skip: !playwright && 'Set PET_ROOM_PLAYWRIGHT_MODULE or install Playwright to run browser assertions' }, async t => {
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html;charset=utf-8'); response.end(html); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const file = resolve(project, `.${pathname}`);
      if (!file.startsWith(project + sep)) { response.writeHead(403); response.end(); return; }
      const body = await readFile(file); response.setHeader('Content-Type', extname(file) === '.css' ? 'text/css' : 'text/javascript'); response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true, ...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PET_ROOM_CHROMIUM_EXECUTABLE } : {}) });
    const url = `http://127.0.0.1:${server.address().port}/`;
    async function pageFor(run) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try { await page.goto(url); await page.waitForFunction(() => window.fixtureReady); await run(page); assert.deepEqual(errors, [], 'no unhandled browser errors'); }
      finally { await page.close(); }
    }

    await t.test('all UI buttons avoid submitting a host form; host page appearance is untouched', () => pageFor(async page => {
      const result = await page.evaluate(async () => {
        makeRoom(); await new Promise(resolve => setTimeout(resolve, 0));
        const room = rooms[0]; room.profile.open(); await new Promise(resolve => setTimeout(resolve, 0));
        room.view.root.querySelector('.room-profile-theme').click();
        return { submits, types: [...room.view.root.querySelectorAll('button')].every(button => button.type === 'button'), bodyClass: document.body.className, bodyMargin: getComputedStyle(document.body).margin, canvasWidth: room.view.canvas.getBoundingClientRect().width };
      });
      assert.equal(result.submits, 0); assert.equal(result.types, true); assert.equal(result.bodyClass, 'host-body'); assert.equal(result.bodyMargin, '23px'); assert.equal(result.canvasWidth, 480);
    }));

    await t.test('shop disposal restores the borrowed decoration button for a later mount', () => pageFor(async page => {
      assert.deepEqual(await page.evaluate(() => {
        makeRoom({ withProfile: false }); const room = rooms[0], root = room.view.root;
        room.shop.dispose(); room.shop.dispose();
        const restored = root.querySelector('[data-room-control="decorate"]');
        const before = restored?.parentNode === root && !restored.classList.contains('room-shop__decorate');
        room.shop = modules.createShopPanel({ root, api: room.api });
        const remounted = !!root.querySelector('.room-shop__topbar [data-room-control="decorate"]');
        room.shop.dispose(); return [before, remounted, !!root.querySelector('[data-room-control="decorate"]')];
      }), [true, true, true]);
    }));

    await t.test('room animation ticks leave an open shop unchanged while business updates remain live', () => pageFor(async page => {
      const result = await page.evaluate(async () => {
        makeRoom({ withProfile: false }); const room=rooms[0],root=room.view.root;
        room.state.shop.catalog=Array.from({length:18},(_,index)=>({sku:`fixture-${index}`,name:`家具 ${index}`,description:'用来检查滚动位置和焦点是否稳定的商品。',price:100+index,kind:'furniture'}));
        room.shop.update(room.state);room.shop.open('furniture');
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const body=root.querySelector('.room-shop__body'),cards=[...root.querySelectorAll('[data-shop-sku]')],focused=cards[4].querySelector('button'),firstButton=cards[0].querySelector('button'),art=cards[4].querySelector('svg');
        focused.focus({preventScroll:true});body.scrollTop=110;const scrollBefore=body.scrollTop;
        const mutations=[],observer=new MutationObserver(records=>mutations.push(...records));observer.observe(root.querySelector('.room-shop'),{subtree:true,attributes:true,childList:true,characterData:true});
        for(let index=0;index<20;index++)room.shop.update({...structuredClone(room.state),petPosition:[index*.1,.09,2],petYaw:index,metrics:{fps:30+index,triangles:1000+index,drawCalls:30,quality:'balanced'}});
        await new Promise(resolve=>setTimeout(resolve,0));mutations.push(...observer.takeRecords());observer.disconnect();
        const unchanged={mutations:mutations.length,focus:document.activeElement===focused,scroll:body.scrollTop===scrollBefore,art:art.isConnected&&cards[4].querySelector('svg')===art};
        room.state.shop.balance=1250;room.state.shop.owned=['fixture-0'];room.shop.update(structuredClone(room.state));
        return {unchanged,scrollBefore,scrollAfter:body.scrollTop,focusAfter:document.activeElement===focused,artAfter:art.isConnected&&cards[4].querySelector('svg')===art,balance:root.querySelector('.room-shop__balance').textContent,ownedDisabled:firstButton.disabled,ownedLabel:firstButton.textContent,active:root.querySelector('[data-shop-tab="furniture"]').getAttribute('aria-selected')};
      });
      assert.ok(result.scrollBefore>0,'fixture must exercise a scrolled shop');
      assert.deepEqual(result.unchanged,{mutations:0,focus:true,scroll:true,art:true},'animation-only state updates must not repaint the shop DOM');
      assert.equal(result.balance,'1,250');assert.equal(result.ownedDisabled,true);assert.equal(result.ownedLabel,'已拥有');assert.equal(result.active,'true');
      assert.equal(result.scrollAfter,result.scrollBefore);assert.equal(result.focusAfter,true);assert.equal(result.artAfter,true);
    }));

    await t.test('collection goals show honest category progress and preview without purchasing', () => pageFor(async page => {
      await page.evaluate(() => {
        makeRoom({withProfile:false});const room=rooms[0];
        Object.assign(room.state.shop,{balance:25,owned:['fixture-f1','fixture-floor0'],catalog:[
          {sku:'fixture-f0',name:'新盆栽',price:75},{sku:'fixture-f1',name:'小桌子',price:20},
          {sku:'fixture-floor0',name:'浅色砖',price:100,category:'flooring'},{sku:'fixture-floor1',name:'拼花砖',price:250,category:'flooring'},
          {sku:'fixture-wall0',name:'星星挂件',price:150,category:'wall'},
        ]});room.shop.update(room.state);room.shop.open('furniture');
      });
      const first=await page.evaluate(()=>Object.fromEntries([...rooms[0].view.root.querySelectorAll('[data-collection-goal]')].map(goal=>[goal.dataset.collectionGoal,{count:goal.querySelector('.room-shop__goal-count').textContent,title:goal.querySelector('.room-shop__goal-title').textContent,hint:goal.querySelector('.room-shop__goal-hint').textContent,progress:goal.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')}])));
      assert.equal(first.furniture.count,'已收藏 1 / 2');assert.match(first.furniture.title,/新盆栽/);assert.match(first.furniture.hint,/还差 50 学习积分/);
      assert.equal(first.flooring.count,'已收藏 1 / 2');assert.match(first.flooring.title,/拼花砖/);assert.match(first.flooring.hint,/还差 225 学习积分/);
      assert.equal(first.wall.count,'已收藏 0 / 1');assert.match(first.wall.hint,/还差 125 学习积分/);
      // v2.24 · 单宠制：伙伴页不再显示"已收藏 0/1"收集进度，改为当前伙伴/暂无伙伴的单宠状态。
      assert.equal(first.pets.count,'每人同时只养一只');assert.equal(first.pets.title,'还没有自己的伙伴');assert.match(first.pets.hint,/选一位喜欢的伙伴/);
      await page.evaluate(()=>{const room=rooms[0];room.state.shop.pets.owned.push('cloud-bunny');room.shop.update(room.state);});
      assert.equal(await page.locator('[data-collection-goal="pets"] .room-shop__goal-title').textContent(),'当前伙伴 · 云朵兔');
      await page.locator('[data-collection-goal="furniture"] .room-shop__goal-action').click();
      assert.deepEqual(await page.evaluate(()=>[document.activeElement.dataset.shopSku,rooms[0].calls.purchase,submits]),['fixture-f0',0,0],'preview focuses the real product card without spending or submitting a host form');
      const update=await page.evaluate(()=>{const room=rooms[0],goal=room.view.root.querySelector('[data-collection-goal="furniture"]'),art=goal.querySelector('.room-shop__goal-art').firstElementChild;room.state.shop.balance=500;room.shop.update(room.state);return {sameArt:art===goal.querySelector('.room-shop__goal-art').firstElementChild,hint:goal.querySelector('.room-shop__goal-hint').textContent};});
      assert.equal(update.sameArt,true,'balance updates retain the preview node');assert.match(update.hint,/积分已足够/);
      await page.evaluate(()=>{const room=rooms[0];room.state.shop.owned.push('fixture-f0');room.shop.update(room.state);});
      assert.equal(await page.locator('[data-collection-goal="furniture"] .room-shop__goal-title').textContent(),'本类收藏已集齐');
      assert.equal(await page.locator('[data-collection-goal="furniture"] .room-shop__goal-action').isVisible(),false);
    }));

    await t.test('wall hangings are managed in the wall category without repeating in indoor furniture', () => pageFor(async page => {
      await page.evaluate(()=>{
        makeRoom({withProfile:false});const room=rooms[0];
        const wall={sku:'fixture-wall',name:'晨光挂画',price:80,category:'wall'},floor={sku:'fixture-floor',name:'小书架',price:100},tile={sku:'fixture-tile',name:'奶油砖',price:90,category:'flooring'},builtin={id:'wall-pictures',name:'装饰画'},sofa={id:'sofa',name:'大沙发'};
        Object.assign(room.state.shop,{owned:[wall.sku,floor.sku,tile.sku],stored:[],catalog:[wall,floor,tile],storageCatalog:[wall,floor,tile,builtin,sofa]});
        room.calls.warehouse=[];
        room.api.storeFurniture=async key=>{room.calls.warehouse.push(['store',key]);room.state.shop.stored.push(key);return {ok:true,message:'已收回仓库'};};
        room.api.unstoreFurniture=async key=>{room.calls.warehouse.push(['unstore',key]);room.state.shop.stored=room.state.shop.stored.filter(value=>value!==key);return {ok:true,message:'已摆回墙上'};};
        room.shop.update(room.state);room.shop.open('wall');window.originalWallCard=room.view.root.querySelector('[data-shop-sku="fixture-wall"]');
      });
      const wallPanel=page.locator('[id$="-panel-wall"]'),roomPanel=page.locator('[id$="-panel-room"]');
      assert.equal(await wallPanel.locator('[data-shop-sku="fixture-wall"]').count(),1);
      assert.equal(await wallPanel.locator('[data-shop-sku="wall-pictures"]').count(),1);
      assert.deepEqual(await roomPanel.locator('[data-shop-sku]').evaluateAll(nodes=>nodes.map(node=>node.dataset.shopSku).sort()),['fixture-floor','sofa']);
      const purchased=wallPanel.locator('[data-shop-sku="fixture-wall"] .room-shop__buy');
      assert.equal(await purchased.textContent(),'收回仓库');assert.equal(await purchased.isEnabled(),true);await purchased.click();
      await page.waitForFunction(()=>rooms[0].state.shop.stored.includes('fixture-wall')&&document.querySelector('[id$="-panel-wall"] [data-shop-sku="fixture-wall"] button').textContent==='摆回墙上');
      assert.equal(await page.locator('[id$="-panel-storage"] [data-shop-sku="fixture-wall"]').count(),1,'warehouse still exposes stored inventory');
      await purchased.click();await page.waitForFunction(()=>!rooms[0].state.shop.stored.includes('fixture-wall'));
      const builtin=wallPanel.locator('[data-shop-sku="wall-pictures"] .room-shop__buy');
      await builtin.click();await page.waitForFunction(()=>rooms[0].state.shop.stored.includes('wall-pictures'));
      await builtin.click();await page.waitForFunction(()=>!rooms[0].state.shop.stored.includes('wall-pictures'));
      const result=await page.evaluate(()=>({calls:rooms[0].calls.warehouse,purchases:rooms[0].calls.purchase,sameCard:originalWallCard===rooms[0].view.root.querySelector('[id$="-panel-wall"] [data-shop-sku="fixture-wall"]'),roomIds:[...rooms[0].view.root.querySelectorAll('[id$="-panel-room"] [data-shop-sku]')].map(node=>node.dataset.shopSku).sort(),submits}));
      assert.deepEqual(result,{calls:[['store','fixture-wall'],['unstore','fixture-wall'],['store','wall-pictures'],['unstore','wall-pictures']],purchases:0,sameCard:true,roomIds:['fixture-floor','sofa'],submits:0});
    }));

    await t.test('an expanded account can switch unlocked room sizes and reopen shop and storage', () => pageFor(async page => {
      await page.evaluate(() => {
        makeRoom({ withProfile: false });const room=rooms[0];
        const tiers=[{level:0,name:'初始小屋',width:8.8,depth:8.2,price:0},{level:1,name:'温馨大屋',width:10.8,depth:10.2,price:600},{level:2,name:'宽敞大屋',width:12.8,depth:12.2,price:1500}];
        Object.assign(room.state.shop,{tiers,maxRoomLevel:1,roomLevel:1,width:10.8,depth:10.2,roomName:'温馨大屋',nextTier:tiers[2]});
        room.calls.setRoom=[];room.api.setRoomLevel=(level,requestId)=>{room.calls.setRoom.push({level,requestId});Object.assign(room.state.shop,{roomLevel:level,width:tiers[level].width,depth:tiers[level].depth,roomName:tiers[level].name});return {ok:true,message:'已切换小屋大小'};};
        room.shop.update(room.state);room.shop.open('expansion');
      });
      const switchButton=page.locator('[data-switch-level="0"]');
      assert.equal(await switchButton.isEnabled(),true);await switchButton.click();
      await page.waitForFunction(()=>rooms[0].calls.setRoom.length===1&&rooms[0].state.shop.roomLevel===0);
      const switched=await page.evaluate(()=>rooms[0].calls.setRoom[0]);assert.equal(switched.level,0);assert.ok(switched.requestId);
      assert.equal(await switchButton.isDisabled(),true);
      assert.equal(await page.locator('[data-switch-level="1"]').isEnabled(),true);
      await page.locator('[data-switch-level="1"]').click();
      await page.waitForFunction(()=>rooms[0].calls.setRoom.length===2&&rooms[0].state.shop.roomLevel===1);
      assert.deepEqual(await page.evaluate(()=>rooms[0].calls.setRoom.map(call=>call.level)),[0,1],'dataset values must convert to the requested numeric room size');
      assert.equal(await page.locator('[data-switch-level="1"]').isDisabled(),true);
      await page.locator('.room-shop__close').click();await page.locator('.room-shop__trigger:not(.room-shop__storage-trigger)').click();
      assert.equal(await page.locator('.room-shop__sheet').isVisible(),true);
      await page.locator('.room-shop__close').click();await page.locator('.room-shop__storage-trigger').click();
      assert.equal(await page.locator('[data-shop-tab="storage"]').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('.room-shop__sheet').isVisible(),true);
    }));

    await t.test('decoration exposes a reachable size switch and saves before resizing', () => pageFor(async page => {
      await page.evaluate(()=>{
        makeRoom({withProfile:false});const room=rooms[0],root=room.view.root;
        const tiers=[{level:0,name:'初始小屋',width:8.8,depth:8.2},{level:1,name:'温馨大屋',width:10.8,depth:10.2}];
        Object.assign(room.state.shop,{tiers,maxRoomLevel:1,roomLevel:1,width:10.8,depth:10.2});room.state.decoration=true;
        root.dataset.roomDecorating='true';root.querySelector('[data-room-control="decoration-panel"]').hidden=false;
        room.saveAllowed=false;room.calls.order=[];
        room.api.setDecorationMode=async enabled=>{room.calls.order.push('save');if(!room.saveAllowed)return false;room.state.decoration=false;root.dataset.roomDecorating='false';return true;};
        room.api.setRoomLevel=async level=>{room.calls.order.push(`size:${level}`);room.state.shop.roomLevel=level;return {ok:true,message:'切换成功'};};room.shop.update(room.state);
      });
      const entry=page.locator('[data-room-control="decoration-shop"]');
      assert.equal(await entry.isVisible(),true);await entry.click();
      assert.equal(await page.locator('[data-shop-tab="expansion"]').getAttribute('aria-selected'),'true');
      assert.equal(await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.room-shop')).zIndex)>Number(getComputedStyle(document.querySelector('[data-room-control="decoration-panel"]')).zIndex)),true);
      await page.locator('[data-switch-level="0"]').click();
      await page.waitForFunction(()=>document.querySelector('.room-shop__status').textContent.includes('尚未保存'));
      assert.deepEqual(await page.evaluate(()=>rooms[0].calls.order),['save']);
      await page.evaluate(()=>{rooms[0].saveAllowed=true;});await page.locator('[data-switch-level="0"]').click();
      await page.waitForFunction(()=>rooms[0].state.shop.roomLevel===0);
      assert.deepEqual(await page.evaluate(()=>rooms[0].calls.order),['save','save','size:0']);
    }));

    await t.test('Escape closes only the focused room profile; unchanging badge refresh keeps keyboard focus', () => pageFor(async page => {
      await page.evaluate(async () => { makeRoom(); makeRoom(); await new Promise(resolve => setTimeout(resolve, 0)); rooms[0].profile.open(); rooms[1].profile.open(); await new Promise(resolve => setTimeout(resolve, 0)); });
      assert.deepEqual(await page.evaluate(() => {
        rooms[0].view.root.querySelector('.room-profile-name').focus();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return rooms.map(room => room.view.root.querySelector('.room-profile').hidden);
      }), [true, false]);
      const kept = await page.evaluate(async () => {
        const root = rooms[1].view.root, badge = root.querySelector('[data-profile-badge]'); badge.focus();
        await new Promise(resolve => setTimeout(resolve, 510)); rooms[1].profile.update(rooms[1].state); await new Promise(resolve => setTimeout(resolve, 0));
        return document.activeElement === badge && badge.isConnected;
      }); assert.equal(kept, true);
    }));

    await t.test('synchronous API errors unlock buttons and produce feedback', () => pageFor(async page => {
      const result = await page.evaluate(async () => {
        makeRoom(); await new Promise(resolve => setTimeout(resolve, 0)); const room = rooms[0]; room.profile.open(); await new Promise(resolve => setTimeout(resolve, 0));
        room.api.checkIn = () => { throw new Error('host failed'); };
        room.view.root.querySelector('.room-profile-checkin-preview').parentNode.querySelector('button').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        return { text: room.view.root.querySelector('.room-profile-checkin-result').textContent, disabled: room.view.root.querySelector('.room-profile-upload').disabled };
      }); assert.match(result.text, /签到失败/); assert.equal(result.disabled, false);
    }));

    await t.test('pending check-in rejects duplicate clicks and late resolution cannot mutate disposed UI', () => pageFor(async page => {
      assert.deepEqual(await page.evaluate(async () => {
        makeRoom(); await new Promise(resolve => setTimeout(resolve, 0)); const room = rooms[0]; room.profile.open(); await new Promise(resolve => setTimeout(resolve, 0));
        let resolveCheckIn, calls = 0; room.api.checkIn = () => { calls++; return new Promise(resolve => { resolveCheckIn = resolve; }); };
        const panel = room.view.root.querySelector('.room-profile'), button = panel.querySelector('.room-profile-checkin-preview').parentNode.querySelector('button');
        button.dispatchEvent(new MouseEvent('click', { bubbles: true })); button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const disabled = button.disabled, reads = room.calls.getProfile; room.profile.dispose();
        let changes = 0; const observer = new MutationObserver(records => { changes += records.length; }); observer.observe(panel, { subtree: true, attributes: true, childList: true, characterData: true });
        resolveCheckIn({ ok: true, exp: 5, points: 3 }); await new Promise(resolve => setTimeout(resolve, 20)); observer.disconnect();
        return [calls, disabled, changes, room.calls.getProfile === reads];
      }), [1, true, 0, true]);
    }));

    await t.test('disposing during avatar file read prevents the avatar API call', () => pageFor(async page => {
      assert.deepEqual(await page.evaluate(async () => {
        makeRoom(); await new Promise(resolve => setTimeout(resolve, 0)); const room = rooms[0];
        let finishRead; const file = { type: 'image/png', size: 12, slice: () => ({ arrayBuffer: () => new Promise(resolve => { finishRead = resolve; }) }) };
        const input = room.view.root.querySelector('.room-profile-file'); Object.defineProperty(input, 'files', { value: [file] }); input.dispatchEvent(new Event('change'));
        room.profile.dispose(); finishRead(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]).buffer);
        await new Promise(resolve => setTimeout(resolve, 10)); return [room.calls.avatar, room.view.root.querySelector('.room-profile') === null];
      }), [0, true]);
    }));

    await t.test('image decoding cancellation revokes object URLs and removes decode callbacks', () => pageFor(async page => {
      const result = await page.evaluate(async () => {
        const abort = new AbortController(), revoked = []; let image;
        const win = { URL: { createObjectURL: () => 'blob:pending', revokeObjectURL: value => revoked.push(value) }, Image: class { constructor() { image = this; } set src(value) { this.source = value; } }, setTimeout: (...args) => window.setTimeout(...args), clearTimeout: (...args) => window.clearTimeout(...args) };
        const file = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' });
        const prepared = modules.prepareAvatar(file, win, { signal: abort.signal }); while (!image) await new Promise(resolve => setTimeout(resolve, 0));
        abort.abort(); let message; try { await prepared; } catch (error) { message = error.message; }
        return { revoked, message, handlersCleared: image.onload === null && image.onerror === null };
      }); assert.deepEqual(result.revoked, ['blob:pending']); assert.match(result.message, /取消/); assert.equal(result.handlersCleared, true);
    }));

    await t.test('a late loading fade cannot hide a newer error', () => pageFor(async page => {
      assert.deepEqual(await page.evaluate(async () => {
        makeRoom({ withShop: false, withProfile: false }); const v = rooms[0].view; v.ready(); v.error(new Error('new error'));
        await new Promise(resolve => setTimeout(resolve, 330)); const loading = v.root.querySelector('[data-room-control="loading"]');
        v.dispose(); v.ready(); v.error(new Error('ignored')); return [loading.hidden, loading.textContent.includes('new error'), v.root.isConnected];
      }), [false, true, false]);
    }));

    await t.test('280px desktop container keeps toolbars and panels inside its own bounds', () => pageFor(async page => {
      const result = await page.evaluate(async () => {
        makeRoom({ width: 280, height: 320 }); await new Promise(resolve => setTimeout(resolve, 0)); const room = rooms[0]; room.profile.open(); await new Promise(resolve => setTimeout(resolve, 0)); room.shop.open('pets');
        const rect = room.view.root.getBoundingClientRect(), inside = node => { const r = node.getBoundingClientRect(); return r.left >= rect.left - 1 && r.right <= rect.right + 1 && r.top >= rect.top - 1 && r.bottom <= rect.bottom + 1; };
        const hud = room.view.root.querySelector('.room-hud-right').getBoundingClientRect(), buttons = [...room.view.root.querySelectorAll('.room-shop__topbar > button')];
        const overlap = buttons.some(node => { const b = node.getBoundingClientRect(); return b.left < hud.right && b.right > hud.left && b.top < hud.bottom && b.bottom > hud.top; });
        return { shop: inside(room.view.root.querySelector('.room-shop__sheet')), profile: inside(room.view.root.querySelector('.room-profile')), controls: buttons.every(inside), overlap, bodyHeight: room.view.root.querySelector('.room-shop__body').getBoundingClientRect().height };
      }); assert.equal(result.shop, true, JSON.stringify(result)); assert.equal(result.profile, true, JSON.stringify(result)); assert.equal(result.controls, true, JSON.stringify(result)); assert.equal(result.overlap, false, JSON.stringify(result)); assert.ok(result.bodyHeight > 100, JSON.stringify(result));
    }));

    await t.test('decoration can retry failed entry; warehouse requests serialize and ignore late callbacks after dispose', () => pageFor(async page => {
      assert.deepEqual(await page.evaluate(async () => {
        makeRoom({ withShop: false, withProfile: false }); const room = rooms[0], { THREE } = modules;
        let allow = false, calls = 0, resolvePlace;
        const manager = { definitions: {}, snapshot: () => ({}), beginEdit: () => allow, finishEdit: () => true };
        const decoration = modules.createDecoration({ canvas: room.view.canvas, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), furniture: new Map(), manager, prepare: () => Promise.resolve(true), uiRoot: room.view.root, getStorage: () => [{ id: 'sofa', name: '沙发' }], onUnstoreItem: () => { calls++; return new Promise(resolve => { resolvePlace = resolve; }); } });
        const failed = await decoration.enter(), enabled = !room.view.root.querySelector('[data-room-control="decorate"]').disabled;
        allow = true; const entered = await decoration.enter(); const card = room.view.root.querySelector('[data-strip-sku]');
        card.dispatchEvent(new MouseEvent('click')); card.dispatchEvent(new MouseEvent('click')); const disabled = card.disabled;
        decoration.dispose(); let changes = 0; const observer = new MutationObserver(records => { changes += records.length; }); observer.observe(room.view.root, { subtree: true, attributes: true, childList: true, characterData: true });
        resolvePlace({ ok: true }); await new Promise(resolve => setTimeout(resolve, 10)); observer.disconnect();
        return [failed, enabled, entered, calls, disabled, changes, decoration.active, decoration.pending, decoration.busy];
      }), [false, true, true, 1, true, 0, false, false, false]);
    }));
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
});
