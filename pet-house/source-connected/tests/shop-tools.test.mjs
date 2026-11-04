import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy, SHOP_CATALOG } from '../economy.mjs';
import { categoryOf, applyCatalogView, wishTargetOf, normalizeWishTargets, readWishTargets, writeWishTargets, WISH_KEY_SUFFIX } from '../shop-tools.mjs';

// —— v2.17/F4：商城自选心愿目标 + 搜索/价格排序/未拥有筛选 ——
function phones() {
  return [
    { sku: 'phone-a', name: '薄荷手机', price: 120, description: '淡淡薄荷绿', finish: '哑光' },
    { sku: 'phone-b', name: '星空手机', price: 80, description: '星光点点', finish: '亮面' },
    { sku: 'phone-c', name: '奶茶手机', price: 160, description: '奶油奶茶色', finish: '哑光' },
    { sku: 'phone-d', name: '薄荷耳机', price: 60, description: '薄荷绿的耳机', finish: '磨砂' },
  ];
}
const owned = sku => sku === 'phone-b';

test('v2.17/F4: categoryOf 归类（flooring/wall/其余为家具）', () => {
  assert.equal(categoryOf({ category: 'flooring' }), 'flooring');
  assert.equal(categoryOf({ category: 'wall' }), 'wall');
  assert.equal(categoryOf({ category: 'furniture' }), 'furniture');
  assert.equal(categoryOf({}), 'furniture');
  assert.equal(categoryOf(null), 'furniture');
});

test('v2.17/F4: 默认排序保持目录顺序，且未拥有筛选剔除已拥有', () => {
  const list = applyCatalogView(phones(), { owned });
  assert.deepEqual(list.map(p => p.sku), ['phone-a', 'phone-b', 'phone-c', 'phone-d']);
  const unowned = applyCatalogView(phones(), { owned, unownedOnly: true });
  assert.deepEqual(unowned.map(p => p.sku), ['phone-a', 'phone-c', 'phone-d']);
});

test('v2.17/F4: 价格升序/降序排序', () => {
  const asc = applyCatalogView(phones(), { owned, sort: 'price-asc' });
  assert.deepEqual(asc.map(p => p.sku), ['phone-d', 'phone-b', 'phone-a', 'phone-c']);
  const desc = applyCatalogView(phones(), { owned, sort: 'price-desc' });
  assert.deepEqual(desc.map(p => p.sku), ['phone-c', 'phone-a', 'phone-b', 'phone-d']);
});

test('v2.17/F4: 搜索匹配名称/描述/颜色，不区分大小写', () => {
  const hit = applyCatalogView(phones(), { owned, search: '薄荷' });
  assert.deepEqual(hit.map(p => p.sku), ['phone-a', 'phone-d']);
  const miss = applyCatalogView(phones(), { owned, search: '不存在的词' });
  assert.deepEqual(miss, []);
  const caseHit = applyCatalogView([{ sku: 'k', name: 'Star Box' }], { search: 'star' });
  assert.equal(caseHit.length, 1);
});

test('v2.17/F4: 心愿目标优先，失效时回退到最便宜的未拥有物品', () => {
  const list = phones();
  const ownedSet = new Set(['phone-b']);
  assert.equal(wishTargetOf(list, sku => ownedSet.has(sku), 'phone-c').sku, 'phone-c');
  // 心愿目标已拥有 → 回退最便宜未拥有（phone-d 60 < phone-a/phone-c）
  assert.equal(wishTargetOf(list, sku => ownedSet.has(sku), 'phone-b').sku, 'phone-d');
  // 心愿目标已下线 → 回退
  assert.equal(wishTargetOf(list, sku => ownedSet.has(sku), 'ghost').sku, 'phone-d');
  // 全部拥有 → null
  assert.equal(wishTargetOf(list, () => true, 'phone-a'), null);
  assert.equal(wishTargetOf([], () => false, ''), null);
});

test('v2.17/F4: 心愿目标读写持久化，坏数据自动归一化', () => {
  const store = new Map();
  const adapter = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const key = 'demo-account' + WISH_KEY_SUFFIX;
  writeWishTargets(key, { furniture: 'phone-c', wall: '', pets: 'cat', bogus: 'x' }, adapter);
  const read = readWishTargets(key, adapter);
  assert.deepEqual(read, { pets: 'cat', furniture: 'phone-c', flooring: '', wall: '' });
  const blocked = readWishTargets(key, { getItem: () => '{broken' });
  assert.deepEqual(blocked, { pets: '', furniture: '', flooring: '', wall: '' });
  assert.deepEqual(readWishTargets(key, null), normalizeWishTargets(null));
  // 无适配器时静默不写
  assert.equal(writeWishTargets(key, { pets: 'cat' }, null), false);
});

test('v2.17/F4: 心愿目标与商品目录联动——真实商品 sku 都可通过愿望定位', () => {
  const products = SHOP_CATALOG.filter(product => typeof product.sku === 'string');
  const ownedSet = new Set();
  const target = wishTargetOf(products, sku => ownedSet.has(sku), products[0].sku);
  assert.equal(target.sku, products[0].sku);
  const fallback = wishTargetOf(products, sku => ownedSet.has(sku), '');
  assert.equal(fallback.sku, [...products].sort((a, b) => a.price - b.price)[0].sku);
});

// economy 层提供 storageKey 供心愿持久化键使用
test('v2.17/F4: economy.getState 不含 storageKey（由房间 getShop 注入），无损读账本', () => {
  const economy = createEconomy({ storageAdapter: null, initialBalance: 1000 });
  const state = economy.getState();
  assert.equal(state.balance, 1000);
  assert.equal('storageKey' in state, false);
});