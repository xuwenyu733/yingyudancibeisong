import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGES, badgeTest, badgeHint, createProfile } from '../profile.mjs';
import { createEconomy, SHOP_CATALOG, ROOM_TIERS } from '../economy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.join(here, '..', file), 'utf8');

// —— v2.7 勋章：购物达人 / 改造大师 ——
test('v2.7: BADGES 新增购物达人(spend-500)与改造大师(expand-2)', () => {
  const ids = BADGES.map(item => item.id);
  assert.ok(ids.includes('spend-500'));
  assert.ok(ids.includes('expand-2'));
  assert.equal(BADGES.find(item => item.id === 'spend-500').category, 'growth');
});

test('v2.7: spend-500 按累计消费判定，economy.totalSpent 累计购买与扩建', () => {
  const economy = createEconomy({ storageAdapter: null, initialBalance: 3000 });
  const profile = createProfile('2026-01-01');
  const base = { ...profile.getState(), totalStudySeconds: 0 };
  const judge = (totalSpent, claims) => badgeTest(BADGES.find(item => item.id === 'spend-500'), base, { totalSpent, claims });
  assert.equal(judge(0, { requests: [] }), false);
  assert.equal(judge(499, { requests: [] }), false);
  assert.equal(judge(500, { requests: [] }), true);
  // 购买一件 120 + 扩建一档 600 = 720
  assert.equal(economy.purchase('clover-planter', { requestId: 'r1' }).ok, true);
  assert.equal(economy.expand({ requestId: 'r2' }).ok, true);
  const state = economy.getState();
  assert.equal(state.totalSpent, 120 + 600);
  assert.equal(state.balance, 3000 - 720);
  // 与真实账本联动判定
  assert.equal(badgeTest(BADGES.find(item => item.id === 'spend-500'), base, state), true);
});

test('v2.7: expand-2 按扩建交易次数判定，含旧档无 totalSpent 兼容', () => {
  // 旧档（无 totalSpent 键）读取后自动补 0
  const legacy = JSON.stringify({ version: 1, balance: 100, roomLevel: 0, owned: [], layout: null, claims: { learning: [], requests: [], rewards: [] } });
  const adapter = { getItem: () => legacy, setItem: () => {} };
  const economy = createEconomy({ storageAdapter: adapter });
  assert.equal(economy.getState().totalSpent, 0);
  // 扩建两次后解锁
  const profile = createProfile('2026-01-01');
  const base = { ...profile.getState(), totalStudySeconds: 0 };
  const badge = BADGES.find(item => item.id === 'expand-2');
  const requests = []; // 手动构造两次 expand 记录
  requests.push({ id: 'a', operation: 'expand', level: 1 }, { id: 'b', operation: 'expand', level: 2 });
  assert.equal(badgeTest(badge, base, { totalSpent: 0, claims: { requests } }), true);
  // 真实账本：roomLevel 到 2 需两次扩建，expandCount=2
  const rich = createEconomy({ storageAdapter: null, initialBalance: 3000 });
  rich.expand({ requestId: 'e1' });
  rich.expand({ requestId: 'e2' });
  assert.equal(badgeTest(badge, base, rich.getState()), true);
});

test('v2.7: 购物达人/改造大师的「还差多少」提示', () => {
  const profile = createProfile('2026-01-01');
  const base = { ...profile.getState(), totalStudySeconds: 0 };
  const spend = BADGES.find(item => item.id === 'spend-500');
  const expand = BADGES.find(item => item.id === 'expand-2');
  assert.equal(badgeHint(spend, base, { totalSpent: 300, claims: { requests: [] } }), '再消费 200 积分');
  assert.equal(badgeHint(spend, base, { totalSpent: 500, claims: { requests: [] } }), null); // 已达成
  assert.equal(badgeHint(expand, base, { totalSpent: 0, claims: { requests: [{ id: 'a', operation: 'expand', level: 1 }] } }), '再扩建 1 次');
  assert.equal(badgeHint(expand, base, { totalSpent: 0, claims: { requests: [{ id: 'a', operation: 'expand', level: 1 }, { id: 'b', operation: 'purchase', sku: 'x' }] } }), '再扩建 1 次'); // 购买不算
  // 学习徽章旧签名仍可用（economy 缺省）
  const study = BADGES.find(item => item.id === 'study-10h');
  assert.ok(badgeHint(study, { ...base, totalStudySeconds: 3600 * 8 }) !== null);
});

// —— v2.7 布局回归：商店按钮与个人主页徽章不得再重叠 ——
test('v2.7 布局回归: 商店按钮移入左上 topbar，右上角让位给等级徽章', () => {
  const css = read('shop.css');
  const panel = read('shop-panel.js');
  // 1) 钱包与商店按钮不再独立绝对定位（不再有 top/left/right 各自定位）
  assert.match(css, /room-shop__topbar\{\s*position:\s*absolute;/);
  // 2) 商店 trigger 不得再有 right 定位（曾导致与右上徽章重叠）
  assert.doesNotMatch(css, /room-shop__trigger[^{]*\{\s*[^}]*right:\s*\d/);
  // 3) 窄屏 media 里也不得复活 right:90
  assert.doesNotMatch(css, /room-shop__trigger[^}]*right:\s*90px/);
  // 4) 面板脚本：wallet 与 trigger 都挂在 topbar 下（不再直接挂 hud 绝对定位）
  const walletIntoTopbar = panel.match(/room-shop__wallet[^;]*topbar\);/);
  const triggerIntoTopbar = panel.match(/room-shop__trigger[^;]*topbar\);/);
  assert.ok(walletIntoTopbar, '钱包按钮应挂到 topbar');
  assert.ok(triggerIntoTopbar, '商店按钮应挂到 topbar');
  assert.ok(panel.includes('room-shop__topbar'), '应创建 topbar 容器');
  // 5) 右上角徽章定位保留（供个人主页入口）
  assert.match(css, /room-hud-right\{[^}]*right:\s*16px/);
});

// —— v2.7 服务端原型与本地账本消费规则一致（商品目录同步） ——
test('v2.7: 本地 SHOP_CATALOG 价格与服务端 proto 目录一致', () => {
  const server = read('server-proto/mock-server.mjs');
  for (const item of SHOP_CATALOG) {
    assert.match(server, new RegExp(`['"]${item.sku}['"]:\\s*\\{[^}]*price:\\s*${item.price}`), `${item.sku} 价格 ${item.price} 应同步`);
  }
  for (const tier of ROOM_TIERS.slice(1)) {
    assert.match(server, new RegExp(`${tier.price}`), `扩建价格 ${tier.price} 应同步`);
  }
});
