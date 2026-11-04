import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionStore, validateCompanion, defaultCompanion, COMPANION_SUFFIX, localDay } from '../companion-state.mjs';

function memory() {
  return { values: new Map(), writes: 0, getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { this.writes++; this.values.set(key, value); }, removeItem(key) { this.values.delete(key); } };
}
const key = `child-a${COMPANION_SUFFIX}`;

test('pet and room names, outfits, sound and furniture design survive remount without losing memories', () => {
  const adapter = memory(), at = new Date(2026, 9, 28, 12), store = createCompanionStore({ adapter, key, now: () => at });
  assert.equal(store.update({ petName: ' 糖糖💖 ', roomName: '我的彩虹城堡', sound: { muted: true, volume: 'quiet' }, outfit: { hat: 'unicorn', scarf: 'mint', backpack: 'school' }, theme: 'candy' }).ok, true);
  assert.equal(store.customize('cloud-table', { color: '#aBcDeF', sticker: 'heart', doodle: 'rainbow', achievementSkin: true }).ok, true);
  assert.equal(store.remember('cloud-table', '甜甜', '生日那天一起带回家').ok, true);
  const loaded = createCompanionStore({ adapter, key }).getState();
  assert.equal(loaded.valid, true);
  assert.equal(loaded.petName, '糖糖💖');
  assert.equal(loaded.roomName, '我的彩虹城堡');
  assert.deepEqual(loaded.sound, { muted: true, volume: 'quiet' });
  assert.deepEqual(loaded.outfit, { hat: 'unicorn', scarf: 'mint', backpack: 'school' });
  assert.equal(loaded.theme, 'candy');
  assert.deepEqual(loaded.furnitureStyles['cloud-table'], { color: '#aBcDeF', sticker: 'heart', doodle: 'rainbow', achievementSkin: true });
  assert.deepEqual(loaded.memories['cloud-table'], { at: at.toISOString(), by: '甜甜', source: '生日那天一起带回家' });
  store.remember('cloud-table', '另一个人', '后来');
  assert.equal(store.getState().memories['cloud-table'].by, '甜甜', '第一次带回家的来历不能被后续摆放覆盖');
});

test('v2.24: 好友名单默认四位、可增删、非法名单被拒绝', () => {
  const adapter = memory(), store = createCompanionStore({ adapter, key });
  assert.deepEqual(store.getState().friendNames, ['小桃子', '小石头', '小月亮', '豆豆']);
  assert.equal(store.update({ friendNames: ['小桃子', '小桃子', ' 新朋友 ', '新朋友'] }).ok, true);
  assert.deepEqual(store.getState().friendNames, ['小桃子', '新朋友'], '重复与空格被归一化');
  assert.throws(() => validateCompanion({ ...defaultCompanion(), friendNames: '不是数组' }), /名单/);
  assert.throws(() => validateCompanion({ ...defaultCompanion(), friendNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }), /8 位以内/);
  assert.equal(store.update({ friendNames: ['只留一位'] }).ok, true);
  const reloaded = createCompanionStore({ adapter, key }).getState();
  assert.deepEqual(reloaded.friendNames, ['只留一位'], '名单随存档持久化');
  assert.equal(store.update({ friendNames: [] }).ok, true, '允许清空名单=暂不接待客人');
  assert.deepEqual(store.getState().friendNames, []);
});

test('invalid archives are left untouched, and failed or unretained writes keep the previous saved design', () => {
  const adapter = memory();
  adapter.values.set(key, '{broken');
  const invalid = createCompanionStore({ adapter, key });
  assert.equal(invalid.getState().valid, false);
  assert.equal(invalid.update({ petName: '覆盖' }).ok, false);
  assert.equal(adapter.getItem(key), '{broken');
  assert.equal(adapter.writes, 0);
  adapter.values.delete(key);
  const store = createCompanionStore({ adapter, key });
  assert.equal(store.update({ petName: '保留' }).ok, true);
  const before = adapter.getItem(key);
  adapter.setItem = () => { throw new Error('quota'); };
  assert.equal(store.update({ petName: '丢失' }).ok, false);
  assert.equal(adapter.getItem(key), before);
  assert.equal(store.getState().petName, '保留');
  adapter.setItem = () => {};
  assert.equal(store.customize('sofa', { sticker: 'star' }).ok, false);
  assert.equal(adapter.getItem(key), before);
  assert.equal(store.getState().furnitureStyles.sofa, undefined);
});

test('each learning event grows the garden exactly once, including retries after remount', () => {
  const adapter = memory(), store = createCompanionStore({ adapter, key });
  assert.equal(store.learning('lesson-1', 1200).ok, true);
  assert.equal(store.learning('lesson-1', 1200).unchanged, true);
  const loaded = createCompanionStore({ adapter, key });
  assert.equal(loaded.learning('lesson-1', 1200).unchanged, true);
  assert.equal(loaded.learning('lesson-2', 600).ok, true);
  assert.equal(loaded.getState().learningSeconds, 1800);
  assert.deepEqual(loaded.getState().learningEvents, ['lesson-1', 'lesson-2']);
  assert.equal(loaded.learning('bad', -1).ok, false);
  assert.equal(loaded.getState().learningSeconds, 1800);
});

test('three and seven day stamp gifts are limited to one grant per milestone and expire after seven days', () => {
  const adapter = memory(); let clock = new Date(2026, 9, 28, 12);
  const store = createCompanionStore({ adapter, key, now: () => clock });
  assert.deepEqual(store.checkin(2).gifts, []);
  assert.equal(store.checkin(3).gifts.length, 1);
  assert.deepEqual(store.checkin(3).gifts, []);
  assert.equal(store.checkin(7).gifts.length, 1);
  clock = new Date(2026, 9, 29, 12);
  assert.deepEqual(store.checkin(7).gifts, []);
  const rewards = store.getState().rewards;
  assert.equal(rewards.length, 2);
  assert.equal(new Set(rewards.map(item => item.id)).size, 2);
  for (const reward of rewards) {
    assert.equal(reward.kind, 'pumpkin');
    assert.equal(Date.parse(reward.expiresAt) - Date.parse(reward.at), 7 * 86400000);
  }
  const remounted = createCompanionStore({ adapter, key, now: () => clock });
  assert.deepEqual(remounted.checkin(7).gifts, []);
});

test('seasonal secret codes respect their date window, expire, and cannot renew an already collected gift', () => {
  let clock = new Date(2026, 9, 14, 12);
  const store = createCompanionStore({ now: () => clock });
  assert.equal(store.redeem('南瓜派对').ok, false);
  clock = new Date(2026, 9, 15, 12);
  assert.equal(store.redeem('南瓜派对').ok, true);
  const gift = store.getState().rewards.find(reward => reward.id === 'pumpkin-2026');
  assert.equal(Date.parse(gift.expiresAt) - Date.parse(gift.at), 7 * 86400000);
  clock = new Date(2026, 9, 24, 12);
  assert.ok(Date.parse(gift.expiresAt) < clock.getTime());
  assert.equal(store.redeem('南瓜派对').unchanged, true);
  assert.equal(store.getState().rewards.find(reward => reward.id === gift.id).expiresAt, gift.expiresAt);
  clock = new Date(2026, 10, 4, 12);
  assert.equal(store.redeem('南瓜派对').ok, false);
  assert.equal(store.redeem('新年快乐').ok, false);
  assert.equal(store.redeem('星光回家').ok, true);
  assert.equal(store.redeem('星光回家').unchanged, true);
});

test('return gifts use the probability threshold and only one attempt per local day', () => {
  let clock = new Date(2026, 9, 28, 8), rolls = 0;
  const store = createCompanionStore({ now: () => clock, random: () => { rolls++; return .2; } });
  assert.equal(store.visit().returning, false);
  clock = new Date(2026, 9, 28, 13);
  assert.ok(store.visit().gift);
  clock = new Date(2026, 9, 28, 18);
  assert.equal(store.visit().gift, null);
  assert.equal(rolls, 1);
  clock = new Date(2026, 9, 29, 12);
  assert.ok(store.visit().gift);
  assert.equal(rolls, 2);
  assert.equal(store.getState().lastGiftDay, localDay(clock));
  assert.equal(store.getState().rewards.length, 2);
  let misses = 0, later = new Date(2026, 9, 28, 8);
  const noGift = createCompanionStore({ now: () => later, random: () => { misses++; return .25; } });
  noGift.visit(); later = new Date(2026, 9, 28, 13);
  assert.equal(noGift.visit().gift, null, '概率边界 .25 不赠送');
  later = new Date(2026, 9, 28, 18);
  assert.equal(noGift.visit().gift, null);
  assert.equal(misses, 1, '同一天失败后也不反复抽奖');
});

test('turning surprises off prevents return gift rolls', () => {
  let clock = new Date(2026, 9, 28, 8), rolls = 0;
  const store = createCompanionStore({ now: () => clock, random: () => { rolls++; return 0; } });
  store.update({ surprises: false }); store.visit(); clock = new Date(2026, 9, 28, 15);
  assert.equal(store.visit().gift, null);
  assert.equal(rolls, 0);
});

test('companion schema rejects dangerous keys, accessors, excessive nesting and non-record settings', () => {
  const polluted = JSON.parse('{"version":1,"__proto__":{"polluted":true}}');
  assert.throws(() => validateCompanion(polluted));
  assert.throws(() => validateCompanion(JSON.parse('{"version":1,"furnitureStyles":{"__proto__":{"color":"#ffffff"}}}')));
  let nested = {}; for (let depth = 0; depth < 30; depth++) nested = { next: nested };
  assert.throws(() => validateCompanion({ ...defaultCompanion(), extra: nested }));
  let reads = 0;
  const accessor = { version: 1 };
  Object.defineProperty(accessor, 'petName', { enumerable: true, get() { reads++; return '未授权读取'; } });
  assert.throws(() => validateCompanion(accessor));
  assert.equal(reads, 0);
  assert.throws(() => validateCompanion({ ...defaultCompanion(), sound: [] }));
  assert.throws(() => validateCompanion({ ...defaultCompanion(), outfit: [] }));
  assert.equal({}.polluted, undefined);
});
