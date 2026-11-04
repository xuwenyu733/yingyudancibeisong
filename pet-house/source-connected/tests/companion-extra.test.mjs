import test from 'node:test';
import assert from 'node:assert/strict';
import {
  humMelody, xylophoneNote, nextHoliday, dailyFeature, roomMood,
  comfortAfterFails, petApology, gentleMissedMessage, collectionProgress, isFreshThisWeek, furnitureLine,
  bedtimeStory, guestNote, moodDiary, seasonalWish, weeklyChallenge, hiddenAchievements,
  previewCalendar, monthlyFable, spinWheelResult, feedMood, cheerLine,
  fadeOutNotes, attachmentLevel, potGrowth, seasonWindow, achievementStory, hiddenCritter, milestoneMoments, growthPage,
  normalizeFriendNames, isKnownFriend, addFriend, removeFriend, friendEntrance, FRIEND_LIST_MAX, DEFAULT_FRIEND_NAMES,
} from '../companion-extra.mjs';

test('humMelody 返回长度 3–5 的频率序列与曲调名', () => {
  for (const seed of [1, 7, 42, 1234, -9]) {
    const m = humMelody(seed);
    assert.ok(Array.isArray(m.freqs));
    assert.ok(m.freqs.length >= 3 && m.freqs.length <= 5);
    assert.ok(typeof m.name === 'string' && m.name.length > 0);
    for (const f of m.freqs) assert.ok(Number.isFinite(f) && f > 0);
  }
});

test('xylophoneNote 在音阶内循环', () => {
  assert.equal(xylophoneNote(0), 659.25);
  assert.equal(xylophoneNote(5), 1046.50);
  assert.equal(xylophoneNote(6), 659.25);
  assert.equal(xylophoneNote(-1), 1046.50);
});

test('nextHoliday 返回剩余天数≥0的节日', () => {
  const r = nextHoliday(new Date(2026, 11, 25));
  assert.ok(r.leftDays >= 0);
  assert.ok(typeof r.name === 'string');
  // 12/25 之后下一个是 12/31 星光跨年(剩余 6 天)，再下一个才是新年
  assert.equal(r.name, '星光跨年');
  assert.equal(r.leftDays, 6);
});

test('dailyFeature 按种子稳定选品', () => {
  const catalog = [{ sku: 'a', name: '沙发' }, { sku: 'b', name: '云朵小桌' }, { sku: 'c', name: '阅读书架' }];
  const r1 = dailyFeature(catalog, '2026-10-29');
  const r2 = dailyFeature(catalog, '2026-10-29');
  assert.deepEqual(r1, r2);
  assert.ok(r1.name && r1.hint);
  assert.equal(dailyFeature([], 'x'), null);
});

test('roomMood 随数量映射状态', () => {
  assert.equal(roomMood(0).kind, 'alone');
  assert.equal(roomMood(2).kind, 'cozy');
  assert.equal(roomMood(6).kind, 'happy');
  assert.equal(roomMood(10, 10).kind, 'proud');
});

test('comfortAfterFails 仅第2次起有文案', () => {
  assert.equal(comfortAfterFails(1).level, 0);
  assert.equal(comfortAfterFails(2).level, 1);
  assert.equal(comfortAfterFails(3).level, 2);
  assert.equal(comfortAfterFails(7).level, 3);
});

test('petApology 按原因返回文案', () => {
  assert.ok(petApology('cancel').includes('没关系'));
  assert.ok(petApology('buy').includes('买错'));
  assert.ok(petApology('place').includes('放不下'));
});

test('gentleMissedMessage 返回温柔文案', () => {
  const m = gentleMissedMessage(0);
  assert.ok(m.text.includes('小花'));
  assert.equal(m.missedDays, 1);
});

test('collectionProgress 百分比正确且夹紧', () => {
  assert.deepEqual(collectionProgress(3, 10), { owned: 3, total: 10, percent: 30 });
  assert.deepEqual(collectionProgress(12, 10), { owned: 10, total: 10, percent: 100 });
  assert.deepEqual(collectionProgress(0, 0), { owned: 0, total: 0, percent: 0 });
});

test('isFreshThisWeek 按周序号', () => {
  const now = new Date(2026, 9, 29);
  assert.equal(isFreshThisWeek({ week: Math.floor(now.getTime() / (7 * 86400000)) }, now), true);
  assert.equal(isFreshThisWeek({ week: 999999 }, now), false);
  assert.equal(isFreshThisWeek({}, now), false);
});

test('furnitureLine 命中已知家具/否则通用', () => {
  assert.ok(furnitureLine('云朵小桌').includes('功课'));
  assert.ok(furnitureLine('未知物品', 0).length > 0);
});

test('bedtimeStory 返回三段温馨晚安短句', () => {
  for (const seed of [1, 2, 99, 2026]) {
    const lines = bedtimeStory(seed);
    assert.equal(lines.length, 3);
    for (const line of lines) assert.ok(typeof line === 'string' && line.length > 4);
  }
});

test('guestNote 返回一条温柔纸条', () => {
  const note = guestNote(5);
  assert.ok(typeof note === 'string' && note.length > 4);
  // 取模周期为 4：seed 5 与 seed 1 同一条，但集合里存在不同条目
  const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => guestNote(seed)));
  assert.ok(seen.size > 1);
});

test('moodDiary 表情映射分数与标签', () => {
  assert.deepEqual(moodDiary('happy'), { face: 'happy', score: 5, label: '很开心' });
  assert.deepEqual(moodDiary('cry'), { face: 'cry', score: 1, label: '想抱抱' });
  assert.equal(moodDiary('unknown').score, 3);
});

test('seasonalWish 按季节返回轮换心愿', () => {
  const spring = seasonalWish(new Date(2026, 3, 10)); // 4月=spring
  assert.equal(spring.season, 'spring');assert.ok(spring.wish.length > 0);
  const winter = seasonalWish(new Date(2026, 0, 10));
  assert.equal(winter.season, 'winter');assert.ok(winter.wish.length > 0);
});

test('weeklyChallenge 每周有主题目标文本', () => {
  assert.ok(weeklyChallenge(new Date(2026, 3, 10)).challenge.length > 0);
});

test('hiddenAchievements 依据条件解锁隐藏徽章', () => {
  const r = hiddenAchievements({ streakDays: 8, nightVisit: true, pets: 3 });
  assert.equal(r.find(x => x.id === 'steady-7').unlocked, true);
  assert.equal(r.find(x => x.id === 'night-owl').unlocked, true);
  assert.equal(r.find(x => x.id === 'kind-10').unlocked, false);
  const none = hiddenAchievements({});
  assert.ok(none.every(x => !x.unlocked));
});

test('previewCalendar 返回未来若干天的小惊喜预告', () => {
  const cal = previewCalendar(14, new Date(2026, 11, 25));
  assert.ok(Array.isArray(cal));
  assert.ok(cal.length >= 1 && cal.length <= 14);
  for (const item of cal) { assert.ok(item.date && item.hint.length > 0); }
});

test('monthlyFable 每月有童话主题', () => {
  assert.ok(monthlyFable(new Date(2026, 0, 1)).includes('一月'));
  assert.ok(monthlyFable(new Date(2026, 6, 1)).includes('七月'));
});

test('spinWheelResult 同日稳定、跨日不同且落在合法格子', () => {
  const today = new Date(2026, 11, 25);
  const a = spinWheelResult(today), b = spinWheelResult(today);
  assert.deepEqual(a, b, '同一天结果稳定');
  assert.ok(a.index >= 0 && a.index < 6);
  assert.ok(typeof a.text === 'string' && a.text.length > 0);
});

test('feedMood 返回不同食物的心情加成', () => {
  assert.equal(feedMood('fish').emoji, '🐟');
  assert.equal(feedMood('carrot').name, '萝卜');
  assert.ok(feedMood('unknown').mood.length > 0, '未知食物回退到默认值');
});

test('cheerLine 间歇鼓励话术稳定选取', () => {
  const a = cheerLine(1), b = cheerLine(1);
  assert.equal(a, b);
  assert.ok(a.length > 0);
  assert.ok(new Set([1, 2, 3, 4].map(s => cheerLine(s))).size > 1, '不同种子给出不同鼓励');
});

test('fadeOutNotes 返回渐弱尾拍序列', () => {
  const notes = fadeOutNotes(440, 3, 0.16);
  assert.equal(notes.length, 3);
  assert.ok(notes[0].gain > notes[1].gain && notes[1].gain > notes[2].gain, '音量递减');
  assert.ok(notes.every(n => n.freq > 0 && n.gain > 0));
});

test('attachmentLevel 按活跃天数升级热情', () => {
  assert.equal(attachmentLevel(0).level, 0);
  assert.equal(attachmentLevel(3).level, 1);
  assert.equal(attachmentLevel(30).level, 4);
  assert.ok(attachmentLevel(14).welcome.length > 0);
});

test('potGrowth 按时间戳返回生长阶段与浇水耷拉', () => {
  const now = Date.now();
  assert.equal(potGrowth(now - 73*3600000, now - 1000000, now).stage, '开花');
  assert.equal(potGrowth(now, now, now).stage, '小种子');
  const wilted = potGrowth(now - 80*3600000, now - 40*3600000, now);
  assert.equal(wilted.wilted, true, '忘浇超过30小时耷拉');
});

test('seasonWindow 按月份返回季节窗景', () => {
  assert.equal(seasonWindow(new Date(2026, 0, 1)).name, '冬日');
  assert.equal(seasonWindow(new Date(2026, 6, 1)).name, '夏天');
  assert.ok(seasonWindow(new Date(2026, 3, 1)).emoji.length > 0);
});

test('achievementStory 把徽章连成叙事线', () => {
  assert.ok(achievementStory([]).includes('空着'));
  const s = achievementStory(['a','b'], { a: '第一枚', b: '坚持一周' });
  assert.ok(s.includes('第一枚') && s.includes('坚持一周'));
});

test('hiddenCritter 返回角落小生物与悄悄话', () => {
  const c = hiddenCritter(0);
  assert.ok(c.id && c.emoji && c.line.length > 0);
  assert.ok(new Set([0,1,2,3].map(s => hiddenCritter(s).id)).size > 1);
});

test('milestoneMoments 按里程碑事件生成相册', () => {
  const m = milestoneMoments(['first-furniture','wish-done','unknown']);
  assert.equal(m.total, 2);
  assert.ok(m.moments[0].emoji.length > 0);
});

test('growthPage 按天数生成绘本页文字', () => {
  const p = growthPage(0, '团团');
  assert.ok(p.includes('第 1 页'));
  assert.ok(p.length > 5);
});

test('v2.24: 好友名单规范化——去空格、去重、限长、清空控制字符', () => {
  assert.deepEqual(normalizeFriendNames([' 小桃子 ','小石头','小桃子','','小\u0007桃子','小月亮','豆豆','x'.repeat(9),'a','b','c','d','e','f','g','h','i']),
    ['小桃子','小石头','小月亮','豆豆','a','b','c','d']);
  assert.deepEqual(normalizeFriendNames('not-an-array'),[]);
  assert.deepEqual(normalizeFriendNames(undefined),[]);
  assert.equal(FRIEND_LIST_MAX,8);
  assert.deepEqual([...DEFAULT_FRIEND_NAMES],['小桃子','小石头','小月亮','豆豆']);
});

test('v2.24: isKnownFriend 忽略大小写与首尾空格', () => {
  const list=['小桃子','小石头','小月亮','豆豆'];
  assert.equal(isKnownFriend('小桃子',list),true);
  assert.equal(isKnownFriend(' 小石头 ',list),true);
  assert.equal(isKnownFriend('xiaoshi',list),false);
  assert.equal(isKnownFriend('小桃子',['XiaoTaoZi']),false);
  assert.equal(isKnownFriend('',list),false);
  assert.equal(isKnownFriend('小桃子',[]),false);
});

test('v2.24: addFriend/removeFriend 维护 8 位上限与去重', () => {
  const full=['a','b','c','d','e','f','g','h'];
  const overflow=addFriend(full,'i');
  assert.equal(overflow.ok,false);assert.match(overflow.message,/满/);
  assert.equal(addFriend(['小桃子'],'小桃子').ok,false);
  const added=addFriend(['小桃子'],'小桃');
  assert.equal(added.ok,true);assert.deepEqual(added.friendNames,['小桃子','小桃']);
  assert.equal(addFriend(['小桃子'],'  ').ok,false);
  const removed=removeFriend(['小桃子','小石头'],'小桃子');
  assert.deepEqual(removed.friendNames,['小石头']);
  assert.deepEqual(removeFriend(['小桃子'],'小桃子').friendNames,[]);
});

test('v2.24: 好友白名单——只有登记的好朋友能进，陌生人被拦在门口', () => {
  const friends=['小桃子','小石头'];
  const stranger=friendEntrance(2,{notesToday:0,visitor:'阿乐',friendNames:friends});
  assert.equal(stranger.allowed,false);assert.equal(stranger.stranger,true);assert.match(stranger.message,/只有登记的好朋友/);
  const friend=friendEntrance(2,{notesToday:0,visitor:'小桃子',friendNames:friends});
  assert.equal(friend.allowed,true);assert.equal(friend.stranger,undefined);
  // 好友照常受上限约束：家里已有 2 位（伙伴1+今日留言1）时，第三位好友在门口等一等。
  const full=friendEntrance(2,{notesToday:1,visitor:'小石头',friendNames:friends});
  assert.equal(full.allowed,false);assert.equal(full.stranger,undefined);assert.match(full.message,/等一等/);
  // 名单为空（白名单开启）：暂不接待任何客人。
  const none=friendEntrance(2,{notesToday:0,visitor:'小桃子',friendNames:[]});
  assert.equal(none.allowed,false);assert.equal(none.noFriends,true);
  // 未启用白名单（不传 friendNames）：保持 v2.23 的数量上限行为。
  const legacy=friendEntrance(2,{notesToday:0});
  assert.equal(legacy.allowed,true);
  const legacyFull=friendEntrance(1,{notesToday:1});
  assert.equal(legacyFull.allowed,false);
});

test('v2.24: 小客人留言按来访好友名字生成', () => {
  assert.ok(guestNote(1,'小明').includes('小明'));
  assert.ok(guestNote(5).length > 4);
});
