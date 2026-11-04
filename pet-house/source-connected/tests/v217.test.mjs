import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEconomy } from '../economy.mjs';
import { readBackups, addBackup, removeBackup, MAX_BACKUPS } from '../backup.mjs';
import { applyCatalogView, wishTargetOf } from '../shop-tools.mjs';
import { achievementPlan } from '../achievement-display.mjs';
import { stripFilterMatch } from '../strip-thumb.mjs';
import { createEditHistory } from '../edit-history.mjs';
import { BADGES } from '../profile.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.join(here, '..', file), 'utf8');

// —— v2.17 六项更新（F1–F6）发布标记 ——
test('v2.17/F1: 家具栏真实缩略图 + 筛选（view/decoration/room.css）', () => {
  const view = read('view.js'), decor = read('decoration.js'), css = read('room.css');
  assert.ok(view.includes('storage-strip__filters') && view.includes('storage-strip__filter'), 'view.js 应包含筛选按钮组');
  assert.ok(view.includes('storage-strip__row'), 'view.js 应渲染家具卡片行');
  assert.ok(decor.includes("stripPreviewSource"), 'decoration.js 应使用真实缩略图');
  assert.ok(decor.includes("stripFilterMatch"), 'decoration.js 应使用筛选分类');
  assert.ok(decor.includes('data-room-control="strip-filter"'), 'decoration.js 应监听筛选按钮');
  assert.ok(css.includes('.storage-strip__thumb'), 'room.css 应有缩略图样式');
  assert.ok(css.includes('.storage-strip__filter'), 'room.css 应有筛选样式');
  const bundled = read('styles.css');
  assert.ok(bundled.includes('.storage-strip__thumb'), 'styles.css 应已合并缩略图样式');
});

test('v2.17/F2: 装修撤销/重做（view/decoration 标记 + 栈逻辑）', () => {
  const view = read('view.js'), decor = read('decoration.js');
  for (const marker of ['undo-decoration', 'redo-decoration']) assert.ok(view.includes(marker), `view.js 应有 ${marker}`);
  assert.ok(decor.includes('createEditHistory'), 'decoration.js 应使用历史栈');
  assert.ok(decor.includes('undoStep') && decor.includes('redoStep'), 'decoration.js 应有撤销/重做步骤');
  assert.ok(decor.includes("ctrlKey") && decor.includes("'z'") || decor.includes('"z"'), 'decoration.js 应支持 Ctrl/⌘+Z');
  const history = createEditHistory({ cap: 2 });
  history.push('a'); history.push('b'); history.push('c');
  assert.equal(history.undo('now'), 'c');      // 回到第 3 步前
  assert.equal(history.redo('restored'), 'now'); // 重做回“第 3 步之后”的状态
});

test('v2.17/F3: 每种房型独立保存布局（economy/room 标记 + 存取语义）', () => {
  const economy = read('economy.mjs'), room = read('room.js');
  assert.ok(economy.includes("'layouts'") || economy.includes('"layouts"'), 'economy 应持久化 layouts');
  assert.ok(economy.includes('getRoomLayout'), 'economy 应提供按房级读取');
  assert.ok(room.includes('applyRoomLayout'), 'room.js 应支持按房级恢复');
  assert.ok(room.includes("economy.setLayout"), 'room.js 恢复后应回写对应槽位');
  const e = createEconomy({ storageAdapter: null, initialBalance: 2000 });
  e.expand({ requestId: 'x1' });
  e.setLayout({ version: 3, furniture: { a: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1], colliders: [] } } });
  assert.equal(e.getRoomLayout(0) === null, true, '小屋槽位保持未布置');
  assert.notEqual(e.getRoomLayout(1), null, '大屋槽位已保存');
});

test('v2.17/F4: 商城自选心愿 + 搜索/排序/未拥有（shop-panel/shop-tools/shop.css）', () => {
  const panel = read('shop-panel.js'), css = read('shop.css');
  assert.ok(panel.includes("shop-tools"), 'shop-panel 应使用 shop-tools');
  assert.ok(panel.includes('room-shop__view-bar'), 'shop-panel 应创建筛选工具条');
  assert.ok(panel.includes('room-shop__wish'), 'shop-panel 应有心愿星标');
  assert.ok(panel.includes('wishTargetOf'), 'shop-panel 应优先自选心愿');
  assert.ok(css.includes('.room-shop__view-bar'), 'shop.css 应有工具条样式');
  assert.ok(css.includes('.room-shop__wish'), 'shop.css 应有心愿按钮样式');
  const catalog = [
    { sku: 'a', price: 10 }, { sku: 'b', price: 5 }, { sku: 'c', price: 8 },
  ];
  const sorted = applyCatalogView(catalog, { sort: 'price-asc', owned: () => false });
  assert.deepEqual(sorted.map(p => p.sku), ['b', 'c', 'a']);
  assert.equal(wishTargetOf(catalog, sku => sku === 'b', 'c').sku, 'c');
});

test('v2.17/F5: 成就摆进房间（room.js 集成 + 展示计划）', () => {
  const room = read('room.js');
  assert.ok(room.includes('createAchievementDisplays'), 'room.js 应引入成就展示模块');
  assert.ok(room.includes('syncAchievementDisplays'), 'room.js 应有成就同步函数');
  assert.ok(room.includes('syncAchievementDisplays()),') || room.includes('syncAchievementDisplays();'), '解锁后应刷新成就墙');
  const ids = BADGES.slice(0, 2).map(badge => badge.id);
  const plan = achievementPlan({ unlocked: ids, badgeUnlockedAt: {}, gender: 'none' });
  assert.equal(plan.wall.length, 2);
});

test('v2.17/F6: 存档备份入口（backup 模块 + 房间 API + 个人主页 UI + CSS）', () => {
  const room = read('room.js'), profile = read('scene-profile.js'), css = read('profile-upgrade.css');
  assert.ok(room.includes('createBackup') && room.includes('listBackups') && room.includes('restoreBackup'), '房间 API 应提供备份能力');
  assert.ok(room.includes('exportSave'), '房间 API 应提供导出');
  assert.ok(profile.includes('room-profile-archive'), '个人主页应有存档管理区块');
  assert.ok(profile.includes('立即备份') && profile.includes('从文件恢复'), '个人主页应有备份/恢复入口');
  assert.ok(css.includes('.room-profile-archive'), 'profile-upgrade.css 应有存档样式');
  const storage = new Map();
  const adapter = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const key = 'demo' + '-backups-v1';
  for (let i = 0; i < MAX_BACKUPS + 2; i++) addBackup({ adapter, key, archive: { points: 100 + i }, note: `第${i}份`, now: new Date(2026, 1, i + 1) });
  const list = readBackups(adapter, key).backups;
  assert.equal(list.length, MAX_BACKUPS, '备份数量封顶');
  removeBackup(adapter, key, list[0].id);
  assert.equal(readBackups(adapter, key).backups.length, MAX_BACKUPS - 1);
});

test('v2.17: 版本与打包目标', () => {
  const room = read('room.js'), archive = read('archive.mjs');
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const declarations = [...room.matchAll(/version:'(\d+\.\d+\.\d+)'/g)].map(match => match[1]);
  assert.ok(declarations.length >= 2, 'room.js 应声明控制器与状态版本');
  assert.ok(declarations.every(version => version === pkg.version), 'room.js 和 package.json 版本应一致');
  assert.equal(archive.match(/ARCHIVE_VERSION = '(\d+\.\d+\.\d+)'/)?.[1], pkg.version, 'archive.mjs 和 package.json 版本应一致');
});
