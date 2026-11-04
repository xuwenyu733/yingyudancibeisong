import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGate,needsGate} from '../welcome-gate.js';
import {registerAccountWithId, readSession} from '../account-session.mjs';
import {createEstateStore} from '../estate-state.mjs';
import {exportAccountTransfer, parseTransfer} from '../account-migration.mjs';

// 极简 fake document（不依赖 jsdom），只实现 gate 用到的 DOM API。
function fakeDocument() {
  const listeners = new WeakMap();
  function makeNode(tag) {
    return {
      tagName: tag, children: [], style: {}, _text: null, _attrs: {}, value: '', placeholder: '', type: 'text', maxLength: 0,
      set textContent(v) { this._text = v; this.children = []; },
      get textContent() { return this._text; },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      remove() { this.removed = true; },
      setAttribute(k, v) { this._attrs[k] = v; },
      addEventListener(type, fn) { const set = listeners.get(this) || []; set.push(fn); listeners.set(this, set); },
      click() { (listeners.get(this) || []).forEach(fn => fn()); },
      focus() {},
    };
  }
  return { createElement: tag => makeNode(tag) };
}

function memory(){return {values:new Map(),getItem(k){return this.values.get(k)??null;},setItem(k,v){this.values.set(k,v);},removeItem(k){this.values.delete(k);}};}

test('buildGate 首页有注册与访客按钮，访客点击后 onEnter 拿到随机 key', () => {
  const doc = fakeDocument();
  const storage = memory();
  let entered = null;
  const gate = buildGate({ doc, storage, onEnter: (key, meta) => { entered = { key, meta }; } });
  // 首页应含「访客体验」按钮（最后一个按钮）
  const buttons = gate.root.children[0].children.filter(n => n.tagName === 'button');
  const guestBtn = buttons.find(b => b._text && b._text.includes('访客'));
  assert.ok(guestBtn, '首页含访客按钮');
  guestBtn.click();
  assert.ok(entered, '访客点击触发 onEnter');
  assert.ok(entered.key.startsWith('pet-room-guest-'), '访客拿到随机 key');
  assert.equal(entered.meta.kind, 'guest');
});

test('buildGate 注册后 onEnter 拿到账号 id（写入索引）', () => {
  const doc = fakeDocument();
  const storage = memory();
  let entered = null;
  const gate = buildGate({ doc, storage, onEnter: (key) => { entered = key; } });
  const buttons = gate.root.children[0].children.filter(n => n.tagName === 'button');
  const regBtn = buttons.find(b => b._text && b._text.includes('快速注册'));
  regBtn.click(); // 切到注册页
  const input = gate.root.children[0].children.find(n => n.tagName === 'input');
  input.value = '甜甜';
  const goBtn = gate.root.children[0].children.filter(n => n.tagName === 'button').find(b => b._text && b._text.includes('开始'));
  goBtn.click();
  assert.ok(entered.startsWith('user-'), '注册后拿到 user- 账号 id');
  // 索引已写入
  const list = JSON.parse(storage.getItem('pet-room-accounts-v1')).list;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, '甜甜');
});

test('needsGate 无会话返回 true，有账号或访客会话返回 false', () => {
  const storage = memory();
  assert.equal(needsGate(storage), true);
  storage.setItem('pet-room-session-v1', JSON.stringify({ kind: 'account', id: 'user-x' }));
  assert.equal(needsGate(storage), false);
  storage.setItem('pet-room-session-v1', JSON.stringify({ kind: 'guest' }));
  assert.equal(needsGate(storage), false);
  storage.setItem('pet-room-session-v1', '{oops');
  assert.equal(needsGate(storage), true);
});

test('欢迎页导出口令包含实际庄园全部楼层与余额',()=>{
  const storage=memory(),id='user-gate-123';registerAccountWithId(storage,id,'城堡');
  const estate=createEstateStore({storageAdapter:storage,storageKey:id,initialPoints:2300});
  estate.createRoom({name:'二楼',requestId:'gate-floor-2'});
  const gate=buildGate({doc:fakeDocument(),storage});gate.renderExport(id);
  const text=gate.root.children[0].children.find(node=>node.tagName==='textarea').value;
  const verdict=parseTransfer(text);
  assert.equal(verdict.ok,true);assert.equal(verdict.kind,'estate');
  assert.equal(verdict.archive.estate.rooms.length,2);assert.equal(verdict.archive.estate.bank.balance,1700);
});

test('欢迎页迁移保存失败时不留下新账号或登录态',()=>{
  const source=memory(),id='user-gate-123';
  createEstateStore({storageAdapter:source,storageKey:id,initialPoints:2300});
  const text=exportAccountTransfer({storageAdapter:source,id,name:'城堡'});
  const storage=memory(),write=storage.setItem.bind(storage);let failed=false;
  storage.setItem=(key,value)=>{if(key===id+'-profile-v1'&&!failed){failed=true;throw new Error('quota');}return write(key,value);};
  const gate=buildGate({doc:fakeDocument(),storage});gate.renderMigrate();
  const card=gate.root.children[0];card.children.find(node=>node.tagName==='textarea').value=text;
  card.children.find(node=>node.tagName==='button'&&node.textContent==='恢复进度').click();
  assert.equal(storage.getItem('pet-room-accounts-v1'),null);
  assert.equal(readSession(storage).kind,'none');assert.equal(storage.values.size,0);
  assert.ok(card.children.some(node=>String(node.textContent).includes('恢复写入失败')));
});
