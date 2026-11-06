import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let playwright;
try { playwright = await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href : 'playwright'); } catch {}
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/room.css"><style>
body{margin:24px} #host{width:900px;height:640px}
</style></head><body><div id="host"></div><script type="module">
import {createRoomView} from '/view.js';
import {createDecoration} from '/decoration.js';
import * as THREE from '/vendor/three/three.module.js';
window.makeFixture=async ({width=900,height=640,count=18,pending=false}={})=>{
 const host=document.querySelector('#host');host.style.width=width+'px';host.style.height=height+'px';
 const view=createRoomView(host);view.root.querySelector('[data-room-control="loading"]').hidden=true;
 const furniture=new Map(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,50);
 camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const entries=Array.from({length:count},(_,i)=>({sku:i?'item-'+i:'sofa',name:i?'家具 '+i:'沙发',stored:!!i}));
 const calls={place:[],store:[],commit:0,finish:[]},definitions={};let allow=true,resolvePlace;
 function add(key,point){const root=new THREE.Group();root.userData.furnitureId=key;root.position.set(point?.x||0,0,point?.z||0);root.add(new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshBasicMaterial()));scene.add(root);furniture.set(key,root);definitions[key]={label:entries.find(e=>e.sku===key)?.name||key,draggable:true,boxes:[{size:[.6,.6,.6],center:[0,.3,0]}],blocksNavigation:true,blocksPlacement:true};return root;}
 add('sofa');
 const manager={definitions,snapshot:()=>Object.fromEntries([...furniture].map(([key,root])=>[key,{position:root.position.toArray(),rotation:root.rotation.toArray().slice(0,3)}])),restore(value){for(const [key,item]of Object.entries(value)){const root=furniture.get(key);if(root){root.position.fromArray(item.position);root.rotation.set(...item.rotation);}}return true;},beginEdit:()=>true,finishEdit(options){calls.finish.push(options);return true;},validate:()=>({valid:allow,reason:'位置被占用'}),previewTransform(key,patch){const root=furniture.get(key);if(patch.position)root.position.fromArray(patch.position);if(patch.rotation)root.rotation.set(...patch.rotation);return true;},commit(before){calls.commit++;if(!allow)this.restore(before);return allow;},updateCollider:()=>true};
 const decoration=createDecoration({canvas:view.canvas,scene,camera,furniture,manager,prepare:async()=>true,uiRoot:view.root,persistLayout:false,getStorage:()=>entries,onUnstoreItem:async(key,point)=>{calls.place.push({key,point});if(pending)await new Promise(resolve=>{resolvePlace=resolve;});add(key,point);entries.find(e=>e.sku===key).stored=false;return {ok:true};},onStoreItem:async key=>{calls.store.push(key);furniture.get(key)?.removeFromParent();furniture.delete(key);delete definitions[key];entries.find(e=>e.sku===key).stored=true;return {ok:true};}});
 window.fixture={view,decoration,furniture,manager,calls,entries,setValid:value=>{allow=value;},resolvePlace:()=>resolvePlace?.()};
 await decoration.enter();return true;
};window.fixtureReady=true;
</script></body></html>`;

test('decoration bottom dock and collapse interactions in Chromium', { skip: !playwright && 'Set PET_ROOM_PLAYWRIGHT_MODULE or install Playwright to run browser assertions' }, async t => {
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html;charset=utf-8'); response.end(html); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname), file = resolve(project, `.${pathname}`);
      if (!file.startsWith(project + sep)) { response.writeHead(403); response.end(); return; }
      response.setHeader('Content-Type', extname(file) === '.css' ? 'text/css' : 'text/javascript'); response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true, ...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PET_ROOM_CHROMIUM_EXECUTABLE } : {}) });
    const url = `http://127.0.0.1:${server.address().port}/`;
    async function pageFor(run, options) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try { await page.goto(url); await page.waitForFunction(() => window.fixtureReady); await page.evaluate(options => makeFixture(options), options || {}); await run(page); assert.deepEqual(errors, [], 'no unhandled browser errors'); }
      finally { await page.close(); }
    }
    const control = name => `[data-room-control="${name}"]`;
    const card = key => `[data-strip-sku="${key}"]`;
    async function dragTo(page, key, destination, release = true) {
      const source = await page.locator(card(key)).boundingBox(); assert.ok(source, 'furniture card is visible');
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
      await page.mouse.move(destination.x, destination.y, { steps: 12 });
      if (release) await page.mouse.up();
    }

    await t.test('collapsing keeps the bottom dock and save action accessible', () => pageFor(async page => {
      assert.equal(await page.locator(control('decoration-panel')).locator(control('storage-strip')).count(), 0, 'dock is independent of panel');
      await page.locator(control('toggle-decoration-panel')).click();
      assert.equal(await page.locator(control('toggle-decoration-panel')).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator(control('decoration-panel')).getAttribute('data-collapsed'), 'true');
      assert.equal(await page.locator(control('decoration-panel-body')).isVisible(), false);
      assert.equal(await page.locator(control('storage-strip')).isVisible(), true);
      assert.equal(await page.locator(control('finish-decoration')).isVisible(), true);
      await page.locator(control('finish-decoration')).click();
      assert.deepEqual(await page.evaluate(() => [fixture.decoration.active, fixture.calls.finish.at(-1).save, fixture.view.root.querySelector('[data-room-control="storage-strip"]').hidden]), [false, true, true]);
    }));

    await t.test('cards select placed furniture and place stored furniture once without disappearing', () => pageFor(async page => {
      await page.locator(card('sofa')).click();
      assert.deepEqual(await page.evaluate(() => [fixture.decoration.selected, fixture.calls.place.length]), ['sofa', 0]);
      assert.equal(await page.locator(card('sofa')).isEnabled(), true);
      await page.locator(card('item-1')).click();
      await page.waitForFunction(() => fixture.decoration.selected === 'item-1');
      assert.deepEqual(await page.evaluate(() => [fixture.calls.place.length, fixture.calls.place[0].key, fixture.furniture.has('item-1'), fixture.view.root.querySelectorAll('[data-strip-sku]').length]), [1, 'item-1', true, 18]);
      await page.locator(card('item-1')).click();
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 1, 'clicking newly placed card must not duplicate the item');
      assert.equal(await page.locator(control('selected-name')).textContent(), '家具 1');
    }));

    await t.test('overflow arrows reveal later furniture and return to the start', () => pageFor(async page => {
      assert.equal(await page.locator(control('storage-prev')).isDisabled(), true);
      assert.equal(await page.locator(control('storage-next')).isEnabled(), true);
      await page.locator(control('storage-next')).click();
      await page.waitForFunction(() => document.querySelector('[data-room-control="storage-strip-row"]').scrollLeft > 20);
      assert.equal(await page.locator(control('storage-prev')).isEnabled(), true);
      await page.locator(control('storage-prev')).click();
      await page.waitForFunction(() => document.querySelector('[data-room-control="storage-strip-row"]').scrollLeft < 2);
      assert.equal(await page.locator(control('storage-prev')).isDisabled(), true);
    }));

    await t.test('instant arrow navigation updates both boundary controls in the same interaction', () => pageFor(async page => {
      // A reduced-motion instant scroll changes scrollLeft before the browser
      // delivers its scroll event. Read in this same task to cover that gap.
      const result=await page.evaluate(()=>{
        const row=document.querySelector('[data-room-control="storage-strip-row"]'),previous=document.querySelector('[data-room-control="storage-prev"]'),next=document.querySelector('[data-room-control="storage-next"]');
        next.click();const forward={left:row.scrollLeft,previousDisabled:previous.disabled};previous.click();return {forward,backward:{left:row.scrollLeft,previousDisabled:previous.disabled,nextDisabled:next.disabled}};
      });
      assert.ok(result.forward.left>20);assert.equal(result.forward.previousDisabled,false);
      assert.ok(result.backward.left<2);assert.equal(result.backward.previousDisabled,true);assert.equal(result.backward.nextDisabled,false);
    }));

    await t.test('dragging from a stored card commits only on canvas release with a finite ground position', () => pageFor(async page => {
      const box = await page.locator(control('room')).boundingBox(), target = { x: box.x + box.width * .78, y: box.y + box.height * .45 };
      await dragTo(page, 'item-1', target, false);
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 0, 'pointer movement must not take furniture out of storage');
      await page.mouse.up();
      await page.waitForFunction(() => fixture.calls.place.length === 1 && !fixture.decoration.busy);
      const result = await page.evaluate(() => ({ calls: fixture.calls.place, selected: fixture.decoration.selected, position: fixture.furniture.get('item-1').position.toArray() }));
      assert.equal(result.calls.length, 1); assert.equal(result.selected, 'item-1');
      const point = result.calls[0].point; assert.equal(Number.isFinite(point.x) && Number.isFinite(point.z), true);
      assert.ok(Math.abs(result.position[0] - point.x) < 1e-6); assert.ok(Math.abs(result.position[2] - point.z) < 1e-6);
    }));

    await t.test('outside release and Escape cancel the card gesture without taking inventory', () => pageFor(async page => {
      await dragTo(page, 'item-1', { x: 1100, y: 750 });
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 0);
      const box = await page.locator(control('room')).boundingBox();
      await dragTo(page, 'item-1', { x: box.x + box.width * .8, y: box.y + box.height * .45 }, false);
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => [fixture.calls.place.length, fixture.decoration.active]), [0, true]);
    }));

    await t.test('a delayed release after Escape cannot turn a canceled drag into a click, and the next deliberate click works', () => pageFor(async page => {
      const source = await page.locator(card('item-1')).boundingBox(), start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x, start.y - 45, { steps: 5 });
      await page.mouse.move(start.x, start.y, { steps: 5 });
      // Both delays exceed the old 600ms click-suppression window. A canceled
      // gesture must remain canceled for as long as the pointer is held down.
      await page.waitForTimeout(800); await page.keyboard.press('Escape');
      await page.waitForTimeout(800); await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => [fixture.calls.place.length, fixture.decoration.active, fixture.decoration.dragging]), [0, true, false]);
      await page.locator(card('item-1')).click();
      await page.waitForFunction(() => fixture.decoration.selected === 'item-1');
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 1, 'a fresh pointerdown starts a new intentional click');
    }));

    await t.test('canceling a card drag still permits keyboard activation of that card', () => pageFor(async page => {
      const source = await page.locator(card('item-1')).boundingBox(), start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x, start.y - 45, { steps: 5 });
      await page.mouse.move(start.x, start.y, { steps: 5 });
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 0);
      await page.locator(card('item-1')).focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => fixture.decoration.selected === 'item-1');
      assert.equal(await page.evaluate(() => fixture.calls.place.length), 1, 'keyboard clicks do not belong to the canceled pointer gesture');
    }));

    await t.test('an invalid move of an existing card restores its position without inventory calls', () => pageFor(async page => {
      const before = await page.evaluate(() => fixture.furniture.get('sofa').position.toArray());
      await page.evaluate(() => fixture.setValid(false));
      const box = await page.locator(control('room')).boundingBox();
      await dragTo(page, 'sofa', { x: box.x + box.width * .8, y: box.y + box.height * .45 });
      assert.deepEqual(await page.evaluate(() => [fixture.furniture.get('sofa').position.toArray(), fixture.calls.place.length, fixture.calls.commit]), [before, 0, 1]);
    }));

    await t.test('a horizontal touch swipe browses the dock without placing furniture', () => pageFor(async page => {
      const source = await page.locator(card('item-2')).boundingBox(), client = await page.context().newCDPSession(page);
      const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let step = 1; step <= 8; step++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x - step * 16, y: start.y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.querySelector('[data-room-control="storage-strip-row"]').scrollLeft > 25);
      assert.deepEqual(await page.evaluate(() => [fixture.calls.place.length, fixture.decoration.dragging, fixture.decoration.active]), [0, false, true]);
      await client.detach();
    }));

    await t.test('a disposed controller ignores a later pointer release', () => pageFor(async page => {
      const box = await page.locator(control('room')).boundingBox();
      await dragTo(page, 'item-1', { x: box.x + box.width * .8, y: box.y + box.height * .45 }, false);
      await page.evaluate(() => fixture.decoration.dispose()); await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => [fixture.calls.place.length, fixture.decoration.active, fixture.decoration.dragging]), [0, false, false]);
    }));

    await t.test('280px embedded room keeps the single-row dock and collapsed actions within its bounds', () => pageFor(async page => {
      await page.locator(control('toggle-decoration-panel')).click();
      const result = await page.evaluate(() => {
        const root = fixture.view.root, bounds = root.getBoundingClientRect(), dock = root.querySelector('[data-room-control="storage-strip"]'), panel = root.querySelector('[data-room-control="decoration-panel"]');
        const inside = node => { const r = node.getBoundingClientRect(); return r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1; };
        const tops = [...dock.querySelectorAll('[data-strip-sku]')].map(node => Math.round(node.getBoundingClientRect().top));
        return { dock: inside(dock), panel: inside(panel), save: inside(root.querySelector('[data-room-control="finish-decoration"]')), oneRow: new Set(tops).size === 1, noOverlap: panel.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top + 1 };
      });
      assert.deepEqual(result, { dock: true, panel: true, save: true, oneRow: true, noOverlap: true });
    }, { width: 280, height: 320 }));

    await t.test('an empty inventory retains the dock with an understandable empty state', () => pageFor(async page => {
      assert.equal(await page.locator(control('storage-strip')).isVisible(), true);
      assert.equal(await page.locator(control('storage-empty')).isVisible(), true);
      assert.equal(await page.locator(card('sofa')).count(), 0);
    }, { count: 0 }));

    await t.test('leaving decoration clears undo history so a later session cannot replay it', () => pageFor(async page => {
      // 选中沙发并旋转一次，写入撤销栈
      await page.locator(card('sofa')).click();
      await page.locator(control('rotate-furniture')).click();
      await page.waitForFunction(() => !document.querySelector('[data-room-control="undo-decoration"]').disabled);
      assert.equal(await page.locator(control('undo-decoration')).isDisabled(), false, '旋转后应可撤销');
      // 完成装修（保存）退出
      await page.locator(control('finish-decoration')).click();
      await page.waitForFunction(() => fixture.decoration.active === false);
      // 再次进入装修：上一会话的历史必须已清空
      await page.evaluate(() => fixture.decoration.enter());
      await page.waitForFunction(() => fixture.decoration.active === true);
      assert.equal(await page.locator(control('undo-decoration')).isDisabled(), true, '新会话不得撤销上一会话的改动');
      assert.equal(await page.locator(control('redo-decoration')).isDisabled(), true, '重做栈同样应清空');
    }));

    await t.test('a failing history restore reports the failure and clears the stack', () => pageFor(async page => {
      await page.locator(card('sofa')).click();
      await page.locator(control('rotate-furniture')).click();
      await page.waitForFunction(() => !document.querySelector('[data-room-control="undo-decoration"]').disabled);
      // 让恢复总是失败（快照解析或应用异常，restore 返回 false）
      await page.evaluate(() => { window.__restoreFail = true; });
      await page.evaluate(() => { const original = fixture.manager.restore; fixture.manager.restore = function (value) { if (window.__restoreFail) return false; return original.call(this, value); }; });
      await page.locator(control('undo-decoration')).click();
      await page.waitForFunction(() => document.querySelector('[data-room-control="edit-feedback"]').hidden === false);
      const feedback = await page.locator(control('edit-feedback')).textContent();
      assert.match(feedback, /无法恢复/, '恢复失败必须明确提示用户');
      assert.equal(await page.locator(control('undo-decoration')).isDisabled(), true, '失败后历史应清空');
      assert.equal(await page.evaluate(() => fixture.decoration.active), true, '失败不应退出装修');
    }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
