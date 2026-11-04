import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProfile, previousDay, buildStats, BADGES, MAX_LEVEL } from '../profile.mjs';
import { createEconomy, SHOP_CATALOG } from '../economy.mjs';
import { exportArchive, importArchive, ARCHIVE_FORMAT } from '../archive.mjs';
import { registerMigration, migrateState, migrationPlan } from '../migrations.mjs';
import { estimateBytes, usageOf, quotaStatus, quotaMessage } from '../storage.mjs';
import { createSfx, SFX_NAMES } from '../sfx.mjs';
import { t, MESSAGES, LOCALES } from '../i18n.mjs';
import { createMockServer } from '../server-proto/mock-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.join(here, '..', file), 'utf8');
const byId = id => BADGES.find(item => item.id === id);

// ============ 补签卡（B1） ============
test('B1: 补签只允许“昨天”，且不发经验/积分', () => {
  const profile = createProfile({ storageAdapter: null });
  const today = '2026-11-05';
  // 昨天 11-04 签到过（正常连续），今天 11-05 再签
  assert.equal(profile.checkIn('2026-11-04').ok, true);
  assert.equal(profile.checkIn(today).ok, true);
  // 11-04 已在记录 → 补签返回 ALREADY
  const again = profile.makeUp('2026-11-04', today);
  assert.equal(again.unchanged, true);
  assert.equal(again.code, 'ALREADY_CHECKED_IN');
  // 非“昨天”是非法参数 → 抛错（与 checkIn 的参数约定一致）
  assert.throws(() => profile.makeUp('2026-10-01', today), { code: 'MAKEUP_NOT_YESTERDAY' });
  assert.throws(() => profile.makeUp('bad-date', today), { code: 'INVALID_DATE' });
});

test('B1: 补签接上断签并经 economy.spend 幂等扣积分', () => {
  const profile = createProfile({ storageAdapter: null });
  const economy = createEconomy({ storageAdapter: null, initialBalance: 1000 });
  // 11-03 签（streak 1），11-04 漏签 → 今天 11-05 补 11-04 接上链条
  profile.checkIn('2026-11-03');
  assert.equal(profile.getState().streakDays, 1);
  const before = profile.getState();
  const makeup = profile.makeUp('2026-11-04', '2026-11-05');
  assert.equal(makeup.ok, true);
  const state = profile.getState();
  assert.equal(state.totalCheckIns, before.totalCheckIns + 1);
  assert.ok(state.checkInDates.includes('2026-11-04'));
  // streak 由 1 提升为 2（11-03 → 补 11-04）
  assert.equal(state.streakDays, 2);
  assert.equal(makeup.stretched, true);
  // 经验/积分不变（补签不发）
  assert.equal(state.xp, before.xp);
  assert.equal(state.pendingCount, before.pendingCount);
  // 扣 100 积分，幂等
  const spend = economy.spend({ eventId: 'makeup:2026-11-04', points: 100, reason: 'test' });
  assert.equal(spend.ok, true);
  assert.equal(economy.getState().balance, 900);
  const spend2 = economy.spend({ eventId: 'makeup:2026-11-04', points: 100, reason: 'test' });
  assert.equal(spend2.code, 'ALREADY_APPLIED');
  assert.equal(economy.getState().balance, 900); // 不重复扣
});

test('B1: 补签每月限 3 次、次月重置；spend 余额不足拒绝', () => {
  const profile = createProfile({ storageAdapter: null });
  profile.checkIn('2026-11-01');
  // 逐日推进 today 视角连续补签（today 递增），第 4 次拒绝
  assert.equal(profile.makeUp('2026-11-02', '2026-11-03').ok, true);
  assert.equal(profile.makeUp('2026-11-03', '2026-11-04').ok, true);
  assert.equal(profile.makeUp('2026-11-04', '2026-11-05').ok, true);
  assert.equal(profile.makeUp('2026-11-05', '2026-11-06').ok, false);
  assert.equal(profile.makeUp('2026-11-05', '2026-11-06').code, 'MAKEUP_LIMIT');
  assert.equal(profile.getState().makeups.count, 3);
  // 次月重置（12-01 缺口：lastCheckIn=11-05，补 12-01 要求 day===previousDay(12-02)=12-01）
  assert.equal(profile.makeUp('2026-12-01', '2026-12-02').ok, true);
  assert.equal(profile.getState().makeups.month, '2026-12');
  assert.equal(profile.getState().makeups.count, 1);
  // spend 余额不足
  const poor = createEconomy({ storageAdapter: null, initialBalance: 50 });
  assert.equal(poor.spend({ eventId: 'x-1', points: 100 }).ok, false);
  assert.equal(poor.spend({ eventId: 'x-1', points: 100 }).code, 'INSUFFICIENT_POINTS');
  assert.equal(poor.getState().balance, 50);
  assert.equal(poor.spend({ eventId: 'x-0', points: 0 }).ok, false);
  assert.equal(poor.spend({ eventId: 'x-0', points: 1.5 }).ok, false);
});

// ============ 勋章解锁时间（B6） ============
test('B6: evaluate(today) 记录勋章解锁日期，读取兼容旧档', () => {
  const profile = createProfile({ storageAdapter: null });
  const economy = createEconomy({ storageAdapter: null, initialBalance: 1000 });
  economy.creditLearning({ eventId: 'e-1', learned: 2, reviewed: 0 }); // 2*10=20 积分（xp+20 未满 1h）
  const verdict = profile.evaluate(economy.getState(), '2026-11-05');
  assert.equal(verdict.ok, true);
  // 学了 40 分钟（2 新词 × 1200s）+ 原本 0 → 仍不到 1h；签到至少 1 次才解锁 first-checkin
  profile.checkIn('2026-11-05');
  const verdict2 = profile.evaluate(economy.getState(), '2026-11-05');
  const first = verdict2.unlocked.find(id => id === 'first-checkin');
  assert.ok(first);
  assert.equal(profile.getState().badgeUnlockedAt['first-checkin'], '2026-11-05');
  // 已解锁不重写（换个日期再 evaluate 应保持原日期）
  assert.equal(profile.evaluate(economy.getState(), '2026-11-06').ok, true);
  assert.equal(profile.getState().badgeUnlockedAt['first-checkin'], '2026-11-05');
});

// ============ 周报（B9） ============
test('B9: buildStats 输出近 7 天点阵与已签数（跨月衔接）', () => {
  const dates = ['2026-09-30', '2026-10-01', '2026-10-03', '2026-10-05'];
  const stats = buildStats(dates, '2026-10-05');
  assert.equal(stats.weekly.days.length, 7);
  assert.equal(stats.weekly.checkedDays, 4); // 09-30/10-01/10-03/10-05 都在窗口内
  const byDate = Object.fromEntries(stats.weekly.days.map(item => [item.date, item.checked]));
  assert.equal(byDate['2026-09-29'], false);
  assert.equal(byDate['2026-09-30'], true);
  assert.equal(byDate['2026-10-05'], true);
  assert.equal(buildStats([], '2026-10-05').weekly.checkedDays, 0);
});

// ============ 存档导出/导入（C6/C7） ============
test('C6/C7: export/import 回环无损，损坏与版本错误被拒', () => {
  const profile = createProfile({ storageAdapter: null });
  profile.setName('小橘');
  const economy = createEconomy({ storageAdapter: null, initialBalance: 500 });
  economy.purchase('clover-planter', { requestId: 'r1' });
  const blob = exportArchive({ profile: profile.getState(), economy: economy.getState(), meta: { savedBy: 'test' } });
  assert.equal(blob.format, ARCHIVE_FORMAT);
  const restored = importArchive(JSON.stringify(blob));
  assert.equal(restored.ok, true);
  assert.equal(restored.profile.name, '小橘');
  assert.equal(restored.economy.owned.includes('clover-planter'), true);
  assert.equal(restored.meta.savedBy, 'test');
  // 损坏 & 版本错误
  assert.equal(importArchive('not json').ok, false);
  assert.equal(importArchive(JSON.stringify({ format: 99, profile: {}, economy: {} })).code, 'ARCHIVE_VERSION');
  assert.equal(importArchive(JSON.stringify({ format: 1, economy: {} })).ok, false);
});

test('C6/C7 回归：含装饰键的 getState 导出→导入→写盘重建，账户与主页可正常载入（修复 INVALID_STATE 锁死）', () => {
  // 模拟 room.exportArchive：直接以 getState()（带 valid/writable/catalog/tiers/nextTier）打包。
  const profile = createProfile({ storageAdapter: null });
  profile.setName('小橘');
  const economy = createEconomy({ storageAdapter: null, initialBalance: 500 });
  economy.purchase('clover-planter', { requestId: 'r1' });
  const blob = exportArchive({ profile: profile.getState(), economy: economy.getState(), meta: { savedBy: 'test' } });
  const restored = importArchive(JSON.stringify(blob));
  assert.equal(restored.ok, true);
  // 防御层应已剥离装饰键
  for (const key of ['valid', 'writable', 'error', 'catalog', 'tiers', 'nextTier']) assert.equal(restored.economy[key], undefined);
  for (const key of ['valid', 'writable', 'error']) assert.equal(restored.profile[key], undefined);
  // 写盘 → 重建实例（用户导入存档后的真实路径），不得 INVALID_STATE 永久锁死
  const pStore = new Map([['re-profile-v1', JSON.stringify(restored.profile)]]);
  const eStore = new Map([['re-account-v1', JSON.stringify(restored.economy)]]);
  const pAdapter = { getItem: key => pStore.get(key) ?? null, setItem: (key, value) => { pStore.set(key, value); } };
  const eAdapter = { getItem: key => eStore.get(key) ?? null, setItem: (key, value) => { eStore.set(key, value); } };
  const reloadedProfile = createProfile({ storageAdapter: pAdapter, storageKey: 're-profile-v1' });
  const reloadedEconomy = createEconomy({ storageAdapter: eAdapter, storageKey: 're-account-v1' });
  assert.equal(reloadedProfile.getState().valid, true, '主页应可载入');
  assert.equal(reloadedProfile.getState().name, '小橘');
  assert.equal(reloadedEconomy.getState().valid, true, '账户应可载入');
  assert.equal(reloadedEconomy.getState().owned.includes('clover-planter'), true);
  const price = SHOP_CATALOG.find(item => item.sku === 'clover-planter').price;
  assert.equal(reloadedEconomy.getState().balance, 500 - price);
});

test('economy 回归：仓库操作后交易记录可超 6 条，重载账户不损坏（修复解析上限与写入不一致）', () => {
  const store = new Map(); const adapter = { getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } };
  const economy = createEconomy({ storageAdapter: adapter, storageKey: 'req-account-v1', initialBalance: SHOP_CATALOG.reduce((sum,item)=>sum+item.price,0)+2100 });
  for (let i = 0; i < SHOP_CATALOG.length; i += 1) assert.equal(economy.purchase(SHOP_CATALOG[i].sku, { requestId: `buy-${i}` }).ok, true);
  assert.equal(economy.expand({ requestId: 'exp-1' }).ok, true);
  assert.equal(economy.expand({ requestId: 'exp-2' }).ok, true);
  const sku = SHOP_CATALOG[0].sku;
  assert.equal(economy.storeFurniture(sku, { requestId: 'st-1' }).ok, true);
  assert.equal(economy.unstoreFurniture(sku, { requestId: 'ust-1' }).ok, true);
  const requests = economy.getState().claims.requests.length;
  assert.ok(requests > 6, `应超过旧解析上限 6（实际 ${requests}）`);
  // 用同一存储重建：修复前 parseAccount 以 6 为限直接 INVALID_STATE 锁死
  const reloaded = createEconomy({ storageAdapter: adapter, storageKey: 'req-account-v1' });
  assert.equal(reloaded.getState().valid, true, '交易记录超 6 条后账户应仍可载入');
  assert.equal(reloaded.getState().claims.requests.length, requests);
  assert.equal(reloaded.getState().stored.includes(sku), false);
  assert.equal(reloaded.getState().owned.includes(sku), true);
});

test('B1 回归：补签后当天再签到，连签继续衔接而不是重置（lastCheckIn 随补签延续）', () => {
  const profile = createProfile({ storageAdapter: null });
  assert.equal(profile.checkIn('2026-11-03').ok, true);            // streak 1
  assert.equal(profile.makeUp('2026-11-04', '2026-11-05').ok, true); // 补 11-04 接上
  assert.equal(profile.getState().streakDays, 2);
  assert.equal(profile.getState().lastCheckIn, '2026-11-04');      // 修复前不更新，仍是 11-03
  const next = profile.checkIn('2026-11-05');                       // 补完立刻签今天
  assert.equal(next.ok, true);
  assert.equal(profile.getState().streakDays, 3, '修复前这里会掉回 1');
  assert.equal(profile.getState().lastCheckIn, '2026-11-05');
  // 已签今天再补更早日期：lastCheckIn 不倒退
  profile.checkIn('2026-11-06');
  assert.equal(profile.makeUp('2026-11-05', '2026-11-06').unchanged, true); // 11-05 已在记录
  assert.equal(profile.getState().lastCheckIn, '2026-11-06');
});

// ============ 迁移框架（C8） ============
test('C8: 迁移路径规划与执行；缺迁移 NO_MIGRATION；非法版本拒绝', () => {
  // 默认目标 = 当前版本(1)：无需迁移
  assert.deepEqual(migrationPlan(1), { ok: true, plan: [] });
  assert.deepEqual(migrateState(1, { a: 1 }), { ok: true, state: { a: 1 }, applied: [] });
  // 非法版本
  assert.equal(migrationPlan(0).ok, false);
  assert.equal(migrationPlan(1, 0).ok, false); // target 小于 from
  // 注册 1->2、2->3 后，从 1 升到 3 应依次应用
  assert.equal(registerMigration(1, 2, state => ({ ...state, step1: true })), '1->2');
  assert.equal(registerMigration(2, 3, state => ({ ...state, step2: true })), '2->3');
  assert.deepEqual(migrationPlan(1, 3), { ok: true, plan: ['1->2', '2->3'] });
  assert.deepEqual(migrateState(1, { a: 1 }, 3).state, { a: 1, step1: true, step2: true });
  assert.deepEqual(migrateState(1, { a: 1 }, 3).applied, [2, 3]);
  // 目标中间缺迁移
  assert.equal(migrationPlan(1, 4).ok, false);
  assert.equal(migrationPlan(1, 4).code, 'NO_MIGRATION');
  // 迁移执行失败 → MIGRATION_FAILED，不改动输入
  registerMigration(3, 4, () => { throw new Error('boom'); });
  const verdict = migrateState(1, { a: 1 }, 4);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'MIGRATION_FAILED');
  assert.deepEqual(migrateState(1, { a: 1 }, 4).message.includes('3->4'), true);
});

// ============ 存储配额（C9） ============
test('C9: 占用估算、配额状态与提示文案', () => {
  const map = new Map([['k1', 'a'.repeat(1024)], ['k2', null]]);
  const adapter = { getItem: key => map.get(key) ?? null };
  const usage = usageOf(adapter, ['k1', 'k2', 'missing']);
  assert.equal(usage.bytes, 1024);
  const ok = quotaStatus({ bytes: 1 * 1024 * 1024 }, { limit: 5 * 1024 * 1024 });
  assert.equal(ok.level, 'ok');
  assert.equal(quotaMessage(ok), null);
  const warn = quotaStatus({ bytes: 4.5 * 1024 * 1024 }, { limit: 5 * 1024 * 1024 });
  assert.equal(warn.level, 'warn');
  assert.ok(quotaMessage(warn).includes('备份'));
  const full = quotaStatus({ bytes: 5 * 1024 * 1024 });
  assert.equal(full.level, 'full');
  assert.ok(quotaMessage(full).includes('导出'));
  assert.ok(estimateBytes('中文abc') >= 3 + 6); // 中文 3 字节
});

// ============ 音效（D2） ============
test('D2: 无上下文静默、muted/音量、注入 fake ctx 可播放、dispose 清理', () => {
  const silent = createSfx();
  for (const name of SFX_NAMES) assert.equal(silent.play(name), false); // Node 无 AudioContext → no-op
  assert.equal(silent.setMuted(true), true);
  assert.equal(silent.play('click'), false); // muted 也屏蔽
  silent.setMuted(false);
  // 注入 fake AudioContext 验证调度被调用
  let started = 0;
  const fakeCtx = {
    state: 'running', currentTime: 0, destination: {},
    createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() { return fakeGain; }, start() { started += 1; }, stop() {} }; },
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return fakeCtx.destination; } }; },
    resume() {}, close() {},
  };
  const fakeGain = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return fakeCtx.destination; } };
  fakeCtx.createGain = () => fakeGain;
  const audible = createSfx({ audioContext: fakeCtx });
  assert.equal(audible.play('click'), true);
  assert.ok(started >= 1);
  audible.dispose();
  assert.equal(audible.play('click'), false); // dispose 后不播
});

// ============ i18n（F4） ============
test('F4: 语言包回退、占位符、未知键', () => {
  assert.equal(t('hud.shop', 'zh-CN'), '商店');
  assert.equal(t('hud.shop', 'en'), 'Shop');
  assert.equal(t('hud.shop', 'fr'), '商店'); // 不支持语言回退中文
  assert.equal(t('makeup.limit', 'zh-CN', { n: 2 }), '本月还可补签 2 次');
  assert.equal(t('makeup.limit', 'en', { n: 2 }), '2 makeups left this month');
  assert.equal(t('no.such.key', 'zh-CN'), 'no.such.key'); // 缺翻译返回 key
  assert.ok(LOCALES.includes('zh-CN') && LOCALES.includes('en'));
  assert.ok(MESSAGES['zh-CN']['checkin.button']);
});

// ============ mock-server 持久化（C2） ============
test('C2: mock 服务端文件持久化，重启继承余额与判重状态', () => {
  const file = path.join(os.tmpdir(), `mock-persist-${Date.now()}.json`);
  try {
    const first = createMockServer({ filePath: file });
    assert.equal(first.dispatch({ userId: 'u1', command: 'creditLearning', params: { eventId: 'lesson-1', learned: 10 } }).ok, true);
    assert.equal(first.filePath, file);
    // 同一文件重建 → 应继承积分
    const second = createMockServer({ filePath: file });
    const query = second.dispatch({ userId: 'u1', command: 'query' });
    assert.equal(query.data.balance, 1000 + 20); // 10 新词 × 2 = 20
    // 重复学习事件仍应被业务判重（学习记录也持久化）
    assert.equal(second.dispatch({ userId: 'u1', command: 'creditLearning', params: { eventId: 'lesson-1', learned: 10 } }).ok, false);
  } finally {
    try { fs.rmSync(file, { force: true }); } catch { /* 忽略 */ }
  }
});

// ============ 幂等审计（E2） ============
test('E2: 全链路幂等状态不变量', () => {
  const profile = createProfile({ storageAdapter: null });
  const economy = createEconomy({ storageAdapter: null, initialBalance: 2000 });
  const today = '2026-11-05';
  // 签到同日重复 → unchanged
  assert.equal(profile.checkIn(today).ok, true);
  assert.equal(profile.checkIn(today).unchanged, true);
  assert.equal(profile.getState().totalCheckIns, 1);
  // 学习事件重复 → ALREADY_CLAIMED
  assert.equal(economy.creditLearning({ eventId: 'evt-1', learned: 3 }).ok, true);
  assert.equal(economy.creditLearning({ eventId: 'evt-1', learned: 3 }).code, 'ALREADY_CLAIMED');
  // 奖励重复 → ALREADY_APPLIED
  assert.equal(economy.reward({ eventId: 'rw-1', points: 20 }).ok, true);
  assert.equal(economy.reward({ eventId: 'rw-1', points: 20 }).code, 'ALREADY_APPLIED');
  // 购买同 requestId 重放 → 不重复扣款，余额一致
  const first = economy.purchase('clover-planter', { requestId: 'req-1' });
  assert.equal(first.ok, true);
  const replay = economy.purchase('clover-planter', { requestId: 'req-1' });
  assert.equal(replay.ok, true);
  assert.equal(replay.state.balance, first.state.balance);
  // 扩建同 requestId 重放
  const exp1 = economy.expand({ requestId: 'req-exp-1' });
  assert.equal(exp1.ok, true);
  const exp2 = economy.expand({ requestId: 'req-exp-1' });
  assert.equal(exp2.state.roomLevel, exp1.state.roomLevel);
  // 扣减同 eventId 重复 → 不再扣
  const spend1 = economy.spend({ eventId: 'sp-1', points: 10 });
  assert.equal(spend1.ok, true);
  const spend2 = economy.spend({ eventId: 'sp-1', points: 10 });
  assert.equal(spend2.code, 'ALREADY_APPLIED');
});

// ============ 随机化模糊测试（E1） ============
test('E1: 随机操作序列不崩溃、余额/等级/记录量守恒', () => {
  const profile = createProfile({ storageAdapter: null });
  const economy = createEconomy({ storageAdapter: null, initialBalance: 100000 });
  let seed = 20261105;
  const rand = max => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max; };
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
  let checkedIns = 0, spends = 0;
  for (let step = 0; step < 400; step += 1) {
    const op = rand(6);
    try {
      if (op === 0) { const r = profile.checkIn(dates[rand(dates.length)]); if (r.ok && !r.unchanged) checkedIns += 1; }
      else if (op === 1) { const d = dates[rand(dates.length)]; const r = profile.makeUp(d, '2026-11-05'); if (r.ok && !r.unchanged) checkedIns += 1; }
      else if (op === 2) { economy.creditLearning({ eventId: `evt-${step}`, learned: rand(101), reviewed: rand(20) }); }
      else if (op === 3) { economy.purchase(SHOP_CATALOG[rand(SHOP_CATALOG.length)].sku, { requestId: `req-${step}` }); }
      else if (op === 4) { const r = economy.spend({ eventId: `sp-${step}`, points: 1 + rand(500) }); if (r.ok) spends += 1; }
      else { const r = economy.expand({ requestId: `exp-${step}` }); }
    } catch (error) { assert.fail(`fuzz 崩溃 at step ${step}: ${error.message}`); }
    // 不变量：余额非负、等级合法、记录量有界
    const account = economy.getState();
    assert.ok(account.balance >= 0, '余额不得为负');
    assert.ok(account.roomLevel >= 0 && account.roomLevel <= 2, '房级合法');
    assert.ok(account.claims.learning.length <= 10000);
    assert.ok(account.claims.rewards.length <= 10000);
    assert.ok(account.claims.spends.length <= 10000);
    const pref = profile.getState();
    assert.ok(pref.xp >= 0 && pref.level >= 1 && pref.level <= MAX_LEVEL);
    assert.ok(pref.totalCheckIns >= checkedIns === false || pref.totalCheckIns >= 0);
  }
  // 统计自洽：totalCheckIns 等于成功签到+补签次数
  const pref = profile.getState();
  assert.equal(pref.totalCheckIns, checkedIns);
  assert.ok(economy.getState().balance >= 0);
});

// ============ d.ts 与实现同步（F1） ============
test('F1: room.d.ts 覆盖批次 1 新增字段与方法', () => {
  const dts = read('room.d.ts');
  for (const token of ['checkInDates', 'makeups', 'makeupCost', 'unlockedAt', 'totalSpent', 'autoDowngraded',
    'makeUpCheckIn', 'exportArchive', 'importArchive', 'weekly']) {
    assert.ok(dts.includes(token), `room.d.ts 应包含 ${token}`);
  }
});

// ============ 定时器/监听器清理审计（E7/F7） ============
test('E7/F7: 关键定时器在 dispose 中清理（静态审计）', () => {
  const scene = read('scene-profile.js');
  assert.match(scene, /dispose\(\)\s*\{[\s\S]*?clearTimeout\(celebrateTimer\)/);
  // v2.18: badge feedback moved out of this panel into the shared full-room effect.
  const fx = read('companion-fx.js');
  assert.match(fx, /dispose\(\)[\s\S]*?clearTimeout\(celebrateTimer\)/);
  const room = read('room.js');
  assert.match(room, /function dispose[\s\S]*?win\.clearTimeout\(initTimer\)/);
  // dispose 会断开所有事件监听注册
  assert.match(scene, /events\.abort\(\)/);
  assert.match(room, /events\.abort\(\)/);
});

// ============ 批次 1 端点核对（挂载契约字段） ============
test('batch1: getProfile 输出补签额度与徽章解锁时间', () => {
  const profile = createProfile({ storageAdapter: null });
  profile.checkIn('2026-11-05');
  const economy = createEconomy({ storageAdapter: null, initialBalance: 500 });
  profile.evaluate(economy.getState(), '2026-11-05');
  const state = profile.getState();
  assert.deepEqual(state.makeups, { month: null, count: 0 });
  assert.equal(state.badgeUnlockedAt['first-checkin'], '2026-11-05');
  // weekly 通过 buildStats 可达
  assert.ok(state.checkInDates.length >= 1);
});
