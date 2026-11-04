import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, levelFromXp, xpForLevel, xpNeededBetween, checkInReward, previousDay, daysBetween, buildMonthCalendar, badgeHint, buildStats, BADGES, MAX_LEVEL } from '../profile.mjs';

const memory = initial => {
  const storage = { ...(initial || {}) };
  return {
    storage,
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
  };
};
const rewardRecorder = (calls = []) => input => { calls.push(input); return { ok: true, message: '入账' }; };

test('level formulas are monotonic and round-trip with levelFromXp', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpNeededBetween(1), 100);
  assert.equal(xpNeededBetween(2), 160);
  assert.equal(xpForLevel(3), 260);
  assert.ok(xpForLevel(MAX_LEVEL) > 0 && Number.isFinite(xpForLevel(MAX_LEVEL)));
  assert.equal(xpForLevel(MAX_LEVEL + 1), Infinity);
  for (let level = 1; level <= MAX_LEVEL; level++) {
    assert.equal(levelFromXp(xpForLevel(level)), level);
    if (level > 1) assert.equal(levelFromXp(xpForLevel(level) - 1), level - 1);
  }
  assert.equal(levelFromXp(-5), 1);
  assert.equal(levelFromXp(1e9), MAX_LEVEL);
});

test('check-in rewards grow with the streak and peak each 7-day cycle', () => {
  assert.deepEqual(checkInReward(1), { day: 1, exp: 5, points: 3 });
  assert.deepEqual(checkInReward(2), { day: 2, exp: 7, points: 4 });
  assert.deepEqual(checkInReward(6), { day: 6, exp: 15, points: 8 });
  assert.deepEqual(checkInReward(7), { day: 7, exp: 37, points: 19 });
  assert.equal(checkInReward(8).exp, 19);
  assert.equal(checkInReward(30).exp, 63);
  assert.equal(checkInReward(0).day, 1);
});

test('date helpers are UTC-safe and accept real calendar dates', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-02'), 1);
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0);
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(daysBetween('not-a-date', '2026-01-01'), NaN);
});

test('check-in records streak, accumulates pending points and is idempotent per day', () => {
  const profile = createProfile({ storageAdapter: memory(), storageKey: 'p1' });
  const first = profile.checkIn('2026-01-01');
  assert.equal(first.ok, true);
  assert.deepEqual(first.state.streakDays, 1);
  assert.equal(first.streak, 1);
  assert.equal(first.exp, 5);
  assert.equal(first.points, 3);
  assert.deepEqual(profile.getState().pending, [{ key: 'checkin:2026-01-01', points: 3 }]);

  const same = profile.checkIn('2026-01-01');
  assert.equal(same.unchanged, true);
  assert.equal(same.code, 'ALREADY_CHECKED_IN');
  assert.deepEqual(profile.getState().pending, [{ key: 'checkin:2026-01-01', points: 3 }]);

  const second = profile.checkIn('2026-01-02');
  assert.equal(second.streak, 2);
  assert.equal(second.exp, 7);
  assert.deepEqual(profile.getState().pending, [
    { key: 'checkin:2026-01-01', points: 3 },
    { key: 'checkin:2026-01-02', points: 4 },
  ]);

  // 断签重置
  const gap = profile.checkIn('2026-01-05');
  assert.equal(gap.streak, 1);
  assert.equal(profile.getState().streakDays, 1);
});

test('settlePending credits economy rewards and clears only when all succeed', () => {
  const calls = [], profile = createProfile({ storageAdapter: memory(), storageKey: 'p2' });
  profile.checkIn('2026-01-01');
  const settled = profile.settlePending(rewardRecorder(calls));
  assert.equal(settled.ok, true);
  assert.deepEqual(calls.map(c => c.eventId), ['checkin:2026-01-01']);
  assert.deepEqual(profile.getState().pending, []);

  // 入账失败时 pending 保留，重试可补齐
  const profile2 = createProfile({ storageAdapter: memory(), storageKey: 'p3' });
  profile2.checkIn('2026-02-01');
  const failed = profile2.settlePending(() => ({ ok: false, code: 'BUSY' }));
  assert.equal(failed.ok, false);
  assert.equal(profile2.pendingCount, 1);
  const retry = profile2.settlePending(rewardRecorder(calls));
  assert.equal(retry.ok, true);
  assert.equal(profile2.pendingCount, 0);
});

test('level-ups accumulate into pending points with their rewards', () => {
  const profile = createProfile({ storageAdapter: memory(), storageKey: 'p4' });
  let date = '2026-03-01';
  for (let day = 1; day <= 20; day++) {
    const result = profile.checkIn(date);
    assert.equal(result.ok, true, `day ${day} check-in`);
    date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  }
  const state = profile.getState();
  assert.ok(state.xp >= xpForLevel(2), '20 天签到应至少升到 2 级');
  assert.equal(state.level, levelFromXp(state.xp));
  const pendingTotal = state.pending.reduce((sum, item) => sum + item.points, 0);
  // 前 20 天基础积分 3..8 累加（第7/14天含周期奖励），并包含升级奖励
  assert.ok(pendingTotal > 120, `待入账积分应包含升级奖励，实际 ${pendingTotal}`);
});

test('badges unlock from profile and economy context, and persist', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'p5' });
  const state = () => profile.getState();
  // 学习时长勋章
  profile.addStudyTime(3600);
  assert.equal(profile.evaluate({}).unlocked.includes('study-1h'), true);
  // 购买与扩建勋章
  assert.equal(profile.evaluate({ owned: ['cloud-table'] }).unlocked.includes('first-purchase'), true);
  assert.equal(profile.evaluate({ owned: ['cloud-table'], roomLevel: 1 }).unlocked.includes('expand-1'), true);
  assert.equal(profile.evaluate({ owned: ['clover-planter', 'reading-shelf', 'cloud-table', 'moon-ornament'] }).unlocked.includes('collector'), true);
  // 勋章持久化且不重复解锁
  assert.ok(state().badges.includes('study-1h'));
  assert.equal(profile.evaluate({}).unlocked.includes('study-1h'), false);
  // 连续签到勋章
  const p6 = createProfile({ storageAdapter: memory(), storageKey: 'p6' });
  let date = '2026-04-01';
  for (let day = 1; day <= 3; day++) { p6.checkIn(date); date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10); }
  const unlocked = p6.evaluate({}).unlocked;
  assert.equal(unlocked.includes('streak-3'), true);
  assert.equal(unlocked.includes('first-checkin'), true);
});

test('collection requirement matches its four-item award and keeps earned badges after storage or shrink', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'collection-rules' });
  const collector = BADGES.find(badge => badge.id === 'collector');
  assert.equal(collector.description, '收藏 4 件不同的商店物品');
  const firstThree = ['clover-planter', 'reading-shelf', 'cloud-table'];
  assert.equal(profile.evaluate({ owned: firstThree }).unlocked.includes('collector'), false);
  assert.equal(badgeHint(collector, profile.getState(), { owned: firstThree }), '再收藏 1 件商店物品');
  const owned = [...firstThree, 'moon-ornament'];
  assert.equal(profile.evaluate({ owned }).unlocked.includes('collector'), true);
  assert.equal(badgeHint(collector, profile.getState(), { owned }), null);
  assert.ok(profile.getState().badges.includes('collector'));
  // Already purchased and now viewing the small room: ownership still earns the expansion badge.
  assert.equal(profile.evaluate({ owned, stored: owned, roomLevel: 0, maxRoomLevel: 2 }).unlocked.includes('expand-1'), true);
  const restored = createProfile({ storageAdapter: adapter, storageKey: 'collection-rules' });
  assert.ok(restored.getState().badges.includes('collector'));
  assert.ok(restored.getState().badges.includes('expand-1'));
  assert.equal(restored.evaluate({ owned, roomLevel: 0, maxRoomLevel: 2 }).unlocked.length, 0);
  const legacy = createProfile({ storageAdapter: memory(), storageKey: 'legacy-expansion' });
  assert.equal(legacy.evaluate({ roomLevel: 1 }).unlocked.includes('expand-1'), true, 'legacy account without max tier remains supported');
});

test('gender, name and study time are validated and persisted', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'p7' });
  // v2.10：新建主页默认「未选择」性别（none），用于提示选择后观看专属勋章外观
  assert.equal(profile.getState().gender, 'none');
  assert.equal(profile.setGender('male').ok, true);
  assert.equal(profile.setGender('x').ok, false);
  assert.equal(profile.setGender('male').unchanged, true);
  assert.equal(profile.setName(' 小狐狸 ').ok, true);
  assert.equal(profile.getState().name, '小狐狸');
  assert.equal(profile.setName('a'.repeat(41)).ok, false);
  assert.equal(profile.addStudyTime(7200).ok, true);
  assert.equal(profile.addStudyTime(-1).ok, false);
  assert.equal(profile.addStudyTime(0).unchanged, true);
  assert.equal(profile.getState().totalStudySeconds, 7200);
  // 学习联动单次上限放宽到 90 天（learned=100+reviewed=100 一次上报 180000 秒也合法）
  assert.equal(profile.addStudyTime(180000).ok, true);
  assert.equal(profile.addStudyTime(86400 * 90).ok, true);
  assert.equal(profile.addStudyTime(86400 * 90 + 1).ok, false);
  assert.equal(profile.getState().totalStudySeconds, 7200 + 180000 + 86400 * 90);
  // 重新加载后数据仍在
  const reloaded = createProfile({ storageAdapter: adapter, storageKey: 'p7' });
  assert.equal(reloaded.getState().gender, 'male');
  assert.equal(reloaded.getState().name, '小狐狸');
  assert.equal(reloaded.getState().totalStudySeconds, 7200 + 180000 + 86400 * 90);
});

test('corrupt archive reports invalid state and refuses mutations', () => {
  const profile = createProfile({ storageAdapter: memory({ 'broken-profile': 'not json{' }), storageKey: 'broken-profile' });
  assert.equal(profile.getState().valid, false);
  assert.equal(profile.checkIn('2026-01-01').ok, false);
  assert.equal(profile.setGender('male').ok, false);
});

test('v2.10 saved profiles with gender none stay none until the user picks a gender', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'p13' });
  assert.equal(profile.getState().gender, 'none'); // 默认未选择
  profile.setName('小狐狸'); // 不选性别也能用主页其他功能
  profile.checkIn('2026-08-01');
  const reloaded = createProfile({ storageAdapter: adapter, storageKey: 'p13' });
  assert.equal(reloaded.getState().gender, 'none');
  assert.equal(reloaded.setGender('female').ok, true);
  assert.equal(reloaded.getState().gender, 'female');
  // 不能通过 setGender 回到未选择状态
  assert.equal(reloaded.setGender('none').ok, false);
  // 非法性别存档仍被拒绝
  const storage = { values: new Map([['bad-g', JSON.stringify({ version: 1, gender: 'x', name: '', totalStudySeconds: 0, xp: 0, level: 1, lastCheckIn: null, streakDays: 0, totalCheckIns: 0, badges: [], pending: [] })]]) };
  const bad = createProfile({ storageAdapter: { getItem: key => storage.values.get(key) ?? null, setItem: (key, value) => storage.values.set(key, value) }, storageKey: 'bad-g' });
  assert.equal(bad.getState().valid, false);
});

test('badge catalog is stable and each badge has a matching condition', () => {
  const ids = new Set(BADGES.map(badge => badge.id));
  assert.equal(ids.size, BADGES.length);
  assert.ok(BADGES.every(badge => badge.name && badge.description && ['checkin', 'study', 'level', 'growth'].includes(badge.category)));
  assert.equal(BADGES.filter(badge => badge.id.startsWith('checkin-')).length, 3);
  assert.equal(BADGES.filter(badge => badge.id.startsWith('study-')).length, 3);
  assert.equal(BADGES.filter(badge => badge.id.startsWith('level-')).length, 3);
  assert.equal(BADGES.filter(badge => badge.id.startsWith('streak-')).length, 4);
});

test('badgeHint reports the remaining progress for quantifiable badges only', () => {
  const fresh = { streakDays: 0, totalCheckIns: 0, totalStudySeconds: 0, level: 1 };
  const byId = Object.fromEntries(BADGES.map(badge => [badge.id, badge]));
  assert.equal(badgeHint(byId['streak-3'], fresh), '再连续签到 3 天');
  assert.equal(badgeHint(byId['streak-7'], fresh), '再连续签到 7 天');
  assert.equal(badgeHint(byId['checkin-100'], fresh), '再签到 100 次');
  assert.equal(badgeHint(byId['study-1h'], fresh), '再学 1 小时');
  assert.equal(badgeHint(byId['study-1h'], { ...fresh, totalStudySeconds: 1800 }), '再学 30 分钟');
  assert.equal(badgeHint(byId['study-50h'], fresh), '再学 50 小时');
  assert.equal(badgeHint(byId['level-3'], fresh), '再升 2 级');
  // 已达成返回 null
  assert.equal(badgeHint(byId['streak-3'], { ...fresh, streakDays: 3 }), null);
  // 不可量化徽章返回 null
  assert.equal(badgeHint(byId['first-purchase'], fresh), null);
  assert.equal(badgeHint(byId['first-checkin'], fresh), null);
});

test('buildStats counts this-month check-ins and the trailing 30-day window', () => {
  const dates = ['2026-10-01', '2026-10-05', '2026-09-30'];
  const stats = buildStats(dates, '2026-10-15');
  assert.equal(stats.monthDays, 2); // 10-01/10-05
  assert.equal(stats.last30Days, 3); // 09-30 在 09-16 之后
  assert.equal(buildStats([], '2026-10-15').monthDays, 0);
  assert.equal(buildStats(dates, 'nope'), null);
});

test('buildMonthCalendar can render a past month for cross-month paging', () => {
  const dates = ['2026-02-27', '2026-03-02', '2026-03-31', '2026-10-05'];
  // 缺省当月（2026-03）
  const current = buildMonthCalendar(dates, '2026-03-15');
  assert.equal(current.year, 2026); assert.equal(current.month, 3); assert.equal(current.days.length, 31);
  assert.equal(current.days.find(day => day.date === '2026-03-15').isToday, true);
  // 指定 2026-02（平年 28 天），验证能渲染非当月
  const feb = buildMonthCalendar(dates, '2026-03-15', '2026-02');
  assert.equal(feb.days.length, 28);
  assert.equal(feb.days.find(day => day.date === '2026-02-27').checked, true);
  assert.equal(feb.days.some(day => day.isToday), false); // 跨月视图没有“今天”标记
  // 指定 2026-10
  const oct = buildMonthCalendar(dates, '2026-03-15', '2026-10');
  assert.equal(oct.days.find(day => day.date === '2026-10-05').checked, true);
  // 非法月份参数回退当月
  const fallback = buildMonthCalendar(dates, '2026-03-15', 'not-a-month');
  assert.equal(fallback.month, 3);
});

test('check-in at max level stops granting xp but still grants points', () => {
  const full = JSON.stringify({ version: 1, gender: 'male', name: '', totalStudySeconds: 0, xp: xpForLevel(MAX_LEVEL), level: MAX_LEVEL, lastCheckIn: '2026-11-01', streakDays: 1, totalCheckIns: 1, badges: [], pending: [], checkInDates: ['2026-11-01'] });
  const storage = { values: new Map([['maxed', full]]), getItem: key => storage.values.get(key) ?? null, setItem: (key, value) => storage.values.set(key, String(value)) };
  const profile = createProfile({ storageAdapter: storage, storageKey: 'maxed' });
  const result = profile.checkIn('2026-11-02');
  assert.equal(result.ok, true);
  assert.equal(result.capped, true);
  assert.equal(result.exp, 0);
  assert.ok(result.points > 0);
  assert.equal(profile.getState().xp, xpForLevel(MAX_LEVEL)); // 经验不再增长
  assert.equal(profile.getState().level, MAX_LEVEL);
  assert.equal(profile.getState().streakDays, 2);
});

test('storage conflict from another tab is rejected instead of overwriting', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'p10' });
  assert.equal(profile.setName('第一版').ok, true);
  // 模拟另一个标签页/窗口改写了存档
  const external = JSON.parse(adapter.getItem('p10'));
  external.name = '外部新版';
  adapter.setItem('p10', JSON.stringify(external));
  const conflict = profile.setName('我的覆盖');
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'ARCHIVE_CONFLICT');
  assert.equal(profile.getState().name, '第一版'); // 内存未被污染
  // 重新加载后以存储为准（外部数据胜出）
  const reloaded = createProfile({ storageAdapter: adapter, storageKey: 'p10' });
  assert.equal(reloaded.getState().name, '外部新版');
});

test('check-in history records each signed day ascending, deduplicated and trims the oldest beyond cap', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'p8' });
  profile.checkIn('2026-05-01'); profile.checkIn('2026-05-02');
  assert.deepEqual(profile.getState().checkInDates, ['2026-05-01', '2026-05-02']);
  profile.checkIn('2026-05-02'); // 同日不重复
  assert.deepEqual(profile.getState().checkInDates, ['2026-05-01', '2026-05-02']);
  // 断签后新的一天照常追加（升序仍成立）
  profile.checkIn('2026-05-10');
  assert.deepEqual(profile.getState().checkInDates, ['2026-05-01', '2026-05-02', '2026-05-10']);
  // 重新加载后历史仍在
  const reloaded = createProfile({ storageAdapter: adapter, storageKey: 'p8' });
  assert.deepEqual(reloaded.getState().checkInDates, ['2026-05-01', '2026-05-02', '2026-05-10']);
});

test('legacy profiles without checkInDates load with an empty history', () => {
  const legacy = JSON.stringify({ version: 1, gender: 'male', name: '', totalStudySeconds: 0, xp: 0, level: 1, lastCheckIn: null, streakDays: 0, totalCheckIns: 0, badges: [], pending: [] });
  const storage = { values: new Map([['legacy-p', legacy]]), getItem: key => storage.values.get(key) ?? null, setItem: (key, value) => storage.values.set(key, String(value)) };
  const profile = createProfile({ storageAdapter: storage, storageKey: 'legacy-p' });
  assert.equal(profile.getState().valid, true);
  assert.deepEqual(profile.getState().checkInDates, []);
  assert.equal(profile.checkIn('2026-06-01').ok, true);
  assert.deepEqual(profile.getState().checkInDates, ['2026-06-01']);
  // 写回的存档已含新字段
  assert.ok(storage.values.get('legacy-p').includes('checkInDates'));
});

test('pending queue is capped so a broken economy ledger cannot balloon the profile', () => {
  const profile = createProfile({ storageAdapter: memory(), storageKey: 'p9' });
  let date = '2026-07-01';
  // 31 条待入账后拒绝新签到（模拟 economy 长期写失败）
  for (let day = 1; day <= 31; day++) {
    const result = profile.checkIn(date);
    assert.equal(result.ok, true, `day ${day}`);
    date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  const full = profile.checkIn(date);
  assert.equal(full.ok, false);
  assert.equal(full.code, 'REWARD_QUEUE_FULL');
  assert.equal(profile.getState().pending.length, 31);
  // 补账成功后恢复签到
  assert.equal(profile.settlePending(() => ({ ok: true })).ok, true);
  assert.equal(profile.checkIn(date).ok, true);
});

test('buildMonthCalendar marks checked, today and builds every day of the month', () => {
  const calendar = buildMonthCalendar(['2026-08-03', '2026-08-15', '2026-08-31'], '2026-08-15');
  assert.equal(calendar.year, 2026);
  assert.equal(calendar.month, 8);
  assert.equal(calendar.days.length, 31);
  const byDate = Object.fromEntries(calendar.days.map(day => [day.date, day]));
  assert.equal(byDate['2026-08-03'].checked, true);
  assert.equal(byDate['2026-08-15'].checked, true);
  assert.equal(byDate['2026-08-15'].isToday, true);
  assert.equal(byDate['2026-08-16'].checked, false);
  assert.equal(byDate['2026-08-01'].isToday, false);
  // 闰年二月
  const leap = buildMonthCalendar([], '2028-02-10');
  assert.equal(leap.days.length, 29);
  // 非法锚点返回 null
  assert.equal(buildMonthCalendar([], 'nope'), null);
});

test('making up yesterday after signing today reconnects the whole streak and future rewards', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'makeup-after-today' });
  profile.checkIn('2026-10-26');
  profile.checkIn('2026-10-28');
  const before = profile.getState();
  assert.equal(before.streakDays, 1);
  const result = profile.makeUp('2026-10-27', '2026-10-28');
  assert.equal(result.ok, true);
  assert.equal(result.streak, 3);
  const state = profile.getState();
  assert.equal(state.streakDays, 3);
  assert.equal(state.lastCheckIn, '2026-10-28');
  assert.equal(state.xp, before.xp, '补签不补发经验');
  assert.deepEqual(state.pending, before.pending, '补签不补发积分');
  assert.deepEqual(state.checkInDates, ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.equal(profile.checkIn('2026-10-29').streak, 4);
  assert.equal(createProfile({ storageAdapter: adapter, storageKey: 'makeup-after-today' }).getState().streakDays, 4);
});

test('makeup reconnects dates over year boundary in either order', () => {
  for (const todayFirst of [false, true]) {
    const profile = createProfile({ storageAdapter: memory(), storageKey: 'year-boundary' });
    profile.checkIn('2026-12-30');
    if (todayFirst) profile.checkIn('2027-01-01');
    assert.equal(profile.makeUp('2026-12-31', '2027-01-01').ok, true);
    if (!todayFirst) profile.checkIn('2027-01-01');
    assert.equal(profile.getState().streakDays, 3);
    assert.equal(profile.getState().lastCheckIn, '2027-01-01');
  }
});
