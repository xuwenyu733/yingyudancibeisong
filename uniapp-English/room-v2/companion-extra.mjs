/** 儿童向补充功能：纯逻辑层，无 DOM / 无音频 / 无存储副作用，全部可单测。
 *  覆盖清单追加项：46 宠物哼歌、21 木琴音高、59 节日倒计时、58 每日一物、
 *  50 心情随房间、93 连续失败安抚、78 道歉文案、53 损失规避温柔提醒、57 收集度、39 新品角标。
 */
export const MELODY_SCALE = Object.freeze([523.25, 587.33, 659.25, 698.46, 783.99, 880.00]); // C5 五声音阶 C D E F G A
export const XYLOPHONE_SCALE = Object.freeze([659.25, 698.46, 783.99, 880.00, 987.77, 1046.50]); // 木琴 E F G A B C6

/** 46 · 宠物哼歌：按种子生成长度为 3–5 的随机旋律（返回曲调名）。 */
export function humMelody(seed = 1) {
  const note = Math.floor(Math.abs(seed * 7919)) % 7;
  const length = 3 + (Math.floor(Math.abs(seed * 131)) % 3); // 3..5
  const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77];
  const seq = [];
  let cursor = note;
  for (let i = 0; i < length; i++) {
    seq.push(scale[cursor % scale.length]);
    cursor += 1 + (Math.floor(Math.abs(seed * (i + 17))) % 2); // 上行级进 + 偶尔跳跃
  }
  return { name: ['咕噜咕噜', '哩哩哩', '哼哼歌', '云朵小调', '晒太阳之歌'][note % 5], freqs: seq };
}

/** 21 · 木琴音高：按点击序号返回阶梯音高（五声音阶，来回循环，负数也正确回绕）。 */
export function xylophoneNote(index = 0) {
  const n = XYLOPHONE_SCALE.length;
  return XYLOPHONE_SCALE[((Math.floor(index) % n) + n) % n];
}

/** 59 · 节日倒计时：返回下一个节日的 {name, leftDays}（本地时间，无网络）。 */
export function nextHoliday(now = new Date()) {
  const year = now.getFullYear();
  const candidates = [
    { name: '新年心愿', at: new Date(year, 0, 1) },
    { name: '儿童节', at: new Date(year, 5, 1) },
    { name: '南瓜派对', at: new Date(year, 9, 15) },
    { name: '星光跨年', at: new Date(year, 11, 31) },
  ];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const item of candidates) {
    const at = item.at.getTime() >= today.getTime() ? item.at : new Date(year + 1, item.at.getMonth(), item.at.getDate());
    const days = Math.round((at.getTime() - today.getTime()) / 86400000);
    if (!best || days < best.leftDays) best = { ...item, at: item.at.getTime() >= today.getTime() ? item.at : at, leftDays: days };
  }
  return best ? { name: best.name, leftDays: best.leftDays } : { name: '星光跨年', leftDays: 1 };
}

/** 58 · 每日一物：按日期种子选一件家具/宠物，返回 {name, hint}。 */
export function dailyFeature(catalog = [], seedValue = '') {
  const items = Array.isArray(catalog) ? catalog.filter(item => item && item.name) : [];
  if (!items.length) return null;
  const index = Math.abs([...String(seedValue)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % items.length;
  const item = items[index];
  return { name: item.name, hint: item.description || `今天来看看「${item.name}」吧～`, sku: item.sku || '' };
}

/** 50 · 宠物心情随房间：屋内已摆家具/宠物数量映射到状态。 */
export function roomMood(placedCount = 0, ownedCount = 0) {
  const place = Math.max(0, placedCount), owned = Math.max(0, ownedCount);
  if (place === 0) return { kind: 'alone', text: '这里空空的，我陪你一起把它装点起来吧～' };
  if (place <= 3) return { kind: 'cozy', text: '小屋渐渐有了家的味道，我们慢慢布置～' };
  if (place <= 8) return { kind: 'happy', text: '哇，越来越漂亮啦！我好喜欢这里！' };
  const ratio = owned > 0 ? place / owned : 1;
  return ratio >= 0.9 ? { kind: 'proud', text: '把喜欢都摆进了家，这是你和我一起建的小天地！' } : { kind: 'happy', text: '房间里摆满了喜欢的东西，每次回来都开心！' };
}

/** 93 · 连续失败安抚：连续失败 N 次后返回安抚文案（仅第 3 次起）。 */
export function comfortAfterFails(failCount = 0) {
  const count = Math.max(0, Math.floor(failCount));
  if (count >= 5) return { text: '没关系，失败是星星在教我们怎么发光。先歇一会儿，我们再试一次！', level: 3 };
  if (count >= 3) return { text: '没关系，我们再试一次好不好？我陪你一起～', level: 2 };
  if (count === 2) return { text: '差一点点啦，别急，我们再试一次！', level: 1 };
  return { text: '', level: 0 };
}

/** 78 · 宠物道歉（误操作/取消时温柔收场）。 */
export function petApology(reason = 'cancel') {
  return {
    cancel: '没关系呀，我们改天再试也一样～',
    buy: '呀，买错了也没关系，先看清再选一次就好～',
    place: '这里先放不下，我们换个位置试试，不怪你哦～',
  }[reason] || '没关系呀，我们慢慢来～';
}

/** 53 · 损失规避温柔提醒：昨天没来时的文案。 */
export function gentleMissedMessage(streak = 0, vacation = '昨天没来小屋，小花少开了一朵。今天回来，它可高兴了！') {
  return { text: vacation, missedDays: Math.max(0, 1 - streak) };
}

/** 57 · 收集度：返回已点亮/总数与百分比（0-100）。 */
export function collectionProgress(owned = 0, total = 0) {
  const safeTotal = Math.max(0, total), safeOwned = Math.min(Math.max(0, owned), safeTotal);
  return { owned: safeOwned, total: safeTotal, percent: safeTotal ? Math.round((safeOwned / safeTotal) * 100) : 0 };
}

/** 39 · 本周新品角标：按日期算"本周上新周序号"，商品带 week 且等于本周序号时标 NEW。 */
export function isFreshThisWeek(item = {}, now = new Date()) {
  if (!item || !Number.isFinite(item.week)) return false;
  const ts = now.getTime();
  const weekNumber = Math.floor(ts / (7 * 86400000));
  return item.week === weekNumber;
}

/** 64 · 家具会说话：按家具名返回一句俏皮台词（无则返回通用）。 */
export function furnitureLine(name = '', index = 0) {
  const lines = {
    '沙发': '坐上来歇一歇，今天的努力我都知道哦。',
    '云朵小桌': '在我身上做功课，字都变得更乖啦。',
    '阅读书架': '每一本新书，都是通往远方的梯子。',
    '糖果小树': '努力一次，就多一颗亮晶晶的糖。',
    '彩虹小拱门': '走过彩虹门下，今天也要开开心心。',
    '星星夜灯': '夜里我会亮着，守护你的小梦。',
  };
  const exact = Object.entries(lines).find(([key]) => String(name).includes(key));
  if (exact) return exact[1];
  const generic = ['乖乖待在这里陪着你～', '被你喜欢，我好开心呀。', '今天也一起加油吧！'];
  return generic[Math.abs(Math.floor(index)) % generic.length];
}

/** 89 · 睡前晚安故事：按日期种子返回一段温馨短句（无需音频/外部资源，纯文本朗读）。 */
const BEDTIME_LINES = [
  '夜风轻轻吹，星星一颗一颗亮起来。',
  '小屋的灯暖暖的，伙伴把被子揉成了云朵。',
  '今天你很努力，明天也要轻轻对自己好。',
  '窗外的月亮眯着眼，陪你慢慢闭上眼睛。',
  '小花在梦里长高一点点，你也一样。',
  '不用担心明天，今晚先做个软软的梦。',
];
export function bedtimeStory(seed = 1) {
  let s = Math.floor(Math.abs(seed)) || 1;
  const pick = n => BEDTIME_LINES[(Math.floor(Math.abs(s * (n + 3))) % BEDTIME_LINES.length)];
  return [pick(1), pick(7), pick(13)];
}

/** 69 · 小客人留言：偶发虚拟小朋友来访，留下一张温柔纸条（纯文本，社交想象）。
 * v2.24 · 留言按来访好友名字生成（%s 占位），中性表述不预设性别。 */
const GUEST_NOTES = [
  '%s来过啦！说你的小屋好暖，下次要一起来喝茶～',
  '%s来敲过门，偷偷在你桌上放了颗糖。',
  '%s来串门，想和你一起看晚上的星星。',
  '%s来过，说你的伙伴最会讲故事啦。',
];
export function guestNote(seed = 1, name = '小桃子') {
  const i = Math.floor(Math.abs(seed)) % GUEST_NOTES.length;
  return GUEST_NOTES[i].replace('%s', String(name || '小桃子').trim());
}

/** v2.24 · 好友名单（白名单）：只有登记的好朋友能进小屋玩，陌生人会被拦在门口。
 * 名单为空表示"暂不接待客人"——之后不会再有小客人来串门。 */
export const FRIEND_LIST_MAX = 8;
export const DEFAULT_FRIEND_NAMES = Object.freeze(['小桃子', '小石头', '小月亮', '豆豆']);
export function normalizeFriendNames(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(), out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim().replace(/[\u0000-\u001f<>]/g, '');
    if (!name || [...name].length > 8 || seen.has(name)) continue;
    seen.add(name); out.push(name);
    if (out.length >= FRIEND_LIST_MAX) break;
  }
  return out;
}
export function isKnownFriend(name = '', friendNames = []) {
  const target = String(name || '').trim().toLowerCase();
  return target ? normalizeFriendNames(friendNames).some(friend => friend.toLowerCase() === target) : false;
}
export function addFriend(friendNames = [], name = '') {
  const next = normalizeFriendNames(friendNames), candidate = String(name || '').trim().replace(/[\u0000-\u001f<>]/g, '');
  if (!candidate || [...candidate].length > 8) return { ok: false, message: '朋友名字要用 1–8 个字的文字填写哦', friendNames: next };
  if (isKnownFriend(candidate, next)) return { ok: false, unchanged: true, message: '这位好朋友已经在名单里啦', friendNames: next };
  if (next.length >= FRIEND_LIST_MAX) return { ok: false, message: '好朋友名单满啦（最多 8 位），先移除一位再添加吧', friendNames: next };
  next.push(candidate); return { ok: true, friendNames: next, message: `好呀，${candidate} 成为小屋的常客啦～` };
}
export function removeFriend(friendNames = [], name = '') {
  const next = normalizeFriendNames(friendNames).filter(friend => friend.toLowerCase() !== String(name || '').trim().toLowerCase());
  return { ok: true, friendNames: next, message: next.length ? '朋友名单更新好啦～' : '名单空啦，之后不会再有客人来串门哦' };
}

/** v2.23 · 好友进入家上限：家里最多同时进来几位好朋友（绒绒伙伴占 1 位，小客人留言占 1 位）。
 * v2.24 · 升级为白名单门禁：传入 visitor + friendNames 时，未登记的人一律拦在门口。 */
export const FRIEND_LIMIT_OPTIONS = [1, 2, 3];
const FRIEND_NOTES_KEY = 'pet-room-friends-notes-today';
export function readFriendsNotesToday(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(FRIEND_NOTES_KEY);
    const value = raw ? JSON.parse(raw) : {};
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return value && value.date === day ? (Number(value.count) || 0) : 0;
  } catch { return 0; }
}
export function markFriendNote(storage = globalThis.localStorage) {
  try {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    storage?.setItem?.(FRIEND_NOTES_KEY, JSON.stringify({ date: day, count: readFriendsNotesToday(storage) + 1 }));
  } catch { /* 访客计数是社交点缀，失败不影响进屋 */ }
}
export function friendEntrance(limit, { notesToday = 0, buddyInside = true, visitor = '', friendNames = null } = {}) {
  const cap = Number.isInteger(limit) && FRIEND_LIMIT_OPTIONS.includes(limit) ? limit : 2;
  const inside = (buddyInside ? 1 : 0) + Math.max(0, Number(notesToday) || 0);
  const whitelist = Array.isArray(friendNames); // 显式传名单 = 启用白名单门禁
  const friends = normalizeFriendNames(friendNames || []);
  // 白名单：未登记的人一律拦在门口；名单为空 = 暂不接待客人（谁也不放进来）。
  if (whitelist && friends.length === 0) {
    return { allowed: false, noFriends: true, inside, cap, message: '还没有登记好朋友，先请家长在设置里把想邀请的小朋友加进名单吧～' };
  }
  if (whitelist && visitor && !isKnownFriend(visitor, friends)) {
    return { allowed: false, stranger: true, inside, cap, message: '门口来了位不认识的小朋友，只有登记的好朋友才能进小屋玩哦～' };
  }
  return inside >= cap
    ? { allowed: false, inside, cap, message: `家里已经有 ${inside} 位好朋友啦，新的小伙伴先在门口等一等，明天再来玩吧～` }
    : { allowed: true, inside, cap };
}

/** 73 · 心情日记：把表情选择转成一条可累积的心情记录点（1–5 分）。 */
export function moodDiary(face = 'ok') {
  const map = { 'happy': 5, 'smile': 4, 'ok': 3, 'sad': 2, 'cry': 1 };
  const score = Object.prototype.hasOwnProperty.call(map, face) ? map[face] : 3;
  const label = { 5: '很开心', 4: '开心', 3: '还好', 2: '有点低落', 1: '想抱抱' }[score];
  return { face, score, label };
}

/** 100 · 季节限定愿望：按本地周序号挑选本周的季节限定心愿（轮换，不固定商城自选）。 */
const SEASON_WISH = {
  spring: ['找一朵会发芽的小花', '收集三片新绿的叶子', '和伙伴在门口种一棵小树'],
  summer: ['接住一只飞过的萤火虫', '在池塘边数三颗星星', '给伙伴扇一阵凉凉的风'],
  autumn: ['捡一片金黄的落叶收藏', '把第一颗果实放进小篮', '和伙伴踩一场沙沙的落叶雨'],
  winter: ['堆一个迷你小雪人', '接住第一片雪花', '给伙伴围上暖暖的围巾'],
};
export function seasonalWish(now = new Date()) {
  const m = now.getMonth();
  const season = m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  const week = Math.floor((now.getTime() - Date.UTC(now.getFullYear(), 0, 1)) / (7 * 86400000));
  const list = SEASON_WISH[season];
  return { season, week, wish: list[((week % list.length) + list.length) % list.length] };
}

/** 101 · 周挑战：按本地周序号给出本周主题目标（旧内容焕新）。 */
const WEEK_CHALLENGES = [
  '本周收集 3 件绿色系家具',
  '本周和伙伴拍手 5 次',
  '本周完成 2 次学习小任务',
  '本周点亮 1 枚新成就',
  '本周带伙伴散步到每个角落',
  '本周读一篇睡前小故事',
];
export function weeklyChallenge(now = new Date()) {
  const week = Math.floor((now.getTime() - Date.UTC(now.getFullYear(), 0, 1)) / (7 * 86400000));
  const list = WEEK_CHALLENGES;
  return { week, challenge: list[((week % list.length) + list.length) % list.length] };
}

/** 104 · 隐藏行为成就：依据行为计数判定是否解锁隐藏徽章（不靠口令，靠坚持）。 */
export function hiddenAchievements(stats = {}) {
  const checks = [
    { id: 'steady-7', name: '小小的坚持', condition: (stats.streakDays || 0) >= 7, hint: '连续 7 天来小屋看看' },
    { id: 'night-owl', name: '夜里的回访', condition: !!stats.nightVisit, hint: '在星星亮起时回过小屋' },
    { id: 'kind-10', name: '温柔的小伙伴', condition: (stats.pets||0) >= 10, hint: '轻轻拍拍伙伴 10 次' },
  ];
  return checks.map(c => ({ ...c, unlocked: !!c.condition }));
}

/** 102 · 内容预告日历：返回未来 N 天里每天的小惊喜预告（吊胃口式内容运营）。 */
export function previewCalendar(days = 7, now = new Date()) {
  const items = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const h = nextHoliday(d);
    const s = seasonalWish(d);
    let hint = '';
    if (h.leftDays === 0) hint = `🎉 就是今天：${h.name}！`;
    else if (h.leftDays <= days && h.leftDays >= 1 && i === h.leftDays) hint = `${h.leftDays} 天后：${h.name}，小屋会有小惊喜。`;
    if (!hint && i % 3 === 0) hint = `${s.season==='spring'?'春':s.season==='summer'?'夏':s.season==='autumn'?'秋':'冬'}季愿望：${s.wish}`;
    if (hint) items.push({ date, hint });
  }
  return items;
}

/** 75 · 月童话：每月一个小童话主题，纯文本低风险。 */
const MONTH_FABLES = [
  '一月·雪芽的梦', '二月·灯笼邮差', '三月·风信子来信', '四月·云朵旅行家', '五月·花环小使者', '六月·彩虹桥派对',
  '七月·萤火虫合唱团', '八月·西瓜船远航', '九月·月亮邮票', '十月·枫叶藏宝图', '十一月·小暖炉音乐会', '十二月·星光礼物屋',
];
export function monthlyFable(now = new Date()) {
  return MONTH_FABLES[now.getMonth()] || '一月·雪芽的梦';
}

/** 103 · 每日免费转盘（纯逻辑）：按日期种子返回今天的转盘结果（无随机副作用、可复现）。 */
export function spinWheelResult(now = new Date(), seedSalt = 0) {
  const seed = Math.floor(now.getTime() / 86400000) + (seedSalt || 0);
  const slots = [
    { kind: 'points', text: '+15 学习积分', value: 15 },
    { kind: 'decoration', text: '一颗装饰小星星', value: 0 },
    { kind: 'surprise', text: '一句伙伴的悄悄话', value: 0 },
    { kind: 'points', text: '+5 学习积分', value: 5 },
    { kind: 'decoration', text: '一朵会发光的小花', value: 0 },
    { kind: 'kindness', text: '给伙伴一个抱抱', value: 0 },
  ];
  const index = ((seed % slots.length) + slots.length) % slots.length;
  return { ...slots[index], index };
}

/** 86 · 宠物喂养 buff：不同食物给伙伴不同心情（吃什么长什么样），纯文本加成描述。 */
const FEED_FOODS = {
  'bread': { name: '面包', mood: '暖呼呼的，肚子圆圆的', emoji: '🍞' },
  'fish': { name: '小鱼', mood: '精神满满，尾巴都要摇起来', emoji: '🐟' },
  'carrot': { name: '萝卜', mood: '清爽又开心，蹦蹦跳跳', emoji: '🥕' },
};
export function feedMood(food = 'bread') {
  const item = FEED_FOODS[food] || FEED_FOODS.bread;
  return { food, name: item.name, emoji: item.emoji, mood: item.mood };
}

/** 45 · 间歇强化：不定时鼓励话术（纯文本，按种子稳定选取，避免机械重复）。 */
const CHEER_LINES = ['今天也在悄悄变厉害呢', '努力的小脚印，我都记在心里', '歇口气，抱抱也要充电呀', '你认真起来，小屋都亮亮的'];
export function cheerLine(seed = 0) {
  const i = Math.abs(Math.floor(seed)) % CHEER_LINES.length;
  return CHEER_LINES[i];
}

/** 38 · 完成/庆祝音渐弱：返回"多留一拍 + 渐弱"的尾拍序列（纯数据，供 sfx 渲染成渐弱音）。 */
export function fadeOutNotes(base = 440, tails = 3, gap = 0.16) {
  const notes = [];
  let freq = base;
  for (let i = 0; i < tails; i++) {
    notes.push({ freq, gap, gain: Math.max(0.05, 0.5 * Math.pow(0.62, i)) });
    freq = base * (1 + (i + 1) * 0.06);
  }
  return notes;
}

/** 47 · 依恋值/熟悉度：按活跃天数返回热情等级与一句专属欢迎（"它越来越喜欢你"）。 */
export function attachmentLevel(activeDays = 0) {
  const days = Math.max(0, Math.floor(activeDays));
  const level = days >= 30 ? 4 : days >= 14 ? 3 : days >= 7 ? 2 : days >= 3 ? 1 : 0;
  const names = ['新朋友', '熟悉的好朋友', '形影不离的伙伴', '最信赖的搭档', '家人一样的存在'];
  const welcomes = [
    '你来了！我们慢慢认识吧～',
    '今天也来啦，越来越喜欢你！',
    '看到你就想蹭蹭，你是我最好的朋友！',
    '你一进门我就知道，今天也要一起玩！',
    '我们会一直一直在一起，对不对？',
  ];
  return { days, level, name: names[level], welcome: welcomes[level] };
}

/** 82 · 花盆真实生长：按种植时间戳（毫秒）返回生长阶段与浇水是否耷拉（与积分无关）。 */
export function potGrowth(plantedAt = Date.now(), lastWateredAt = 0, now = Date.now()) {
  const hours = Math.max(0, (now - plantedAt) / 3600000);
  const sinceWater = Math.max(0, (now - lastWateredAt) / 3600000);
  const stage = hours >= 72 ? '开花' : hours >= 48 ? '长高' : hours >= 24 ? '发芽' : '小种子';
  const wilted = lastWateredAt > 0 && sinceWater > 30; // 忘浇超过 30 小时会耷拉
  const emoji = wilted ? '🥀' : stage === '开花' ? '🌸' : stage === '长高' ? '🌿' : stage === '发芽' ? '🌱' : '🫘';
  return { hours: Math.round(hours), stage, wilted, emoji };
}

/** 40 · 季节窗景：按本地月份返回窗外景色与一句氛围文案（纯文本，无需贴图）。 */
export function seasonWindow(now = new Date()) {
  const m = now.getMonth();
  const view = m === 11 || m <= 1 ? { name: '冬日', scene: '窗外飘着雪，暖暖的灯光映在雪地上', emoji: '❄️' }
    : m >= 2 && m <= 4 ? { name: '春天', scene: '窗外花开，一片粉色的云轻轻飘过', emoji: '🌸' }
    : m >= 5 && m <= 7 ? { name: '夏天', scene: '窗外绿荫浓密，蝉声和蝴蝶一起做客', emoji: '🌳' }
    : { name: '秋天', scene: '窗外金黄落叶旋转落下，像在跳舞', emoji: '🍂' };
  return view;
}

/** 74 · 成就成长故事串联：把已解锁徽章连成一句"陪你走过的路"叙事线。 */
export function achievementStory(ids = [], names = {}) {
  if (!ids.length) return '故事的封面还空着，等你点亮第一枚徽章。';
  const parts = ids.slice(0, 5).map(id => names[id] || id);
  if (ids.length > 5) return parts.join(' → ') + ` → 还有 ${ids.length - 5} 个小小的里程碑`;
  return parts.join(' → ');
}

/** 79 · 隐藏彩蛋生物：角落随机出现的小生物（萤火虫/小蜗牛/流浪猫），点一下有悄悄话。 */
const CRITTERS = [
  { id: 'firefly', name: '萤火虫', emoji: '✨', line: '我是夜里的小灯笼，专程来看你一眼。' },
  { id: 'snail', name: '小蜗牛', emoji: '🐌', line: '我走得很慢，但一直都在。' },
  { id: 'cat', name: '流浪猫', emoji: '🐱', line: '喵～你的小屋好暖，我偷偷来蹭了蹭。' },
];
export function hiddenCritter(seed = 0) {
  return CRITTERS[Math.abs(Math.floor(seed)) % CRITTERS.length];
}

/** 96 · 重要瞬间相册墙：按里程碑事件生成"关键瞬间"条目（第一件家具/第一次扩建/心愿达成）。 */
export function milestoneMoments(events = []) {
  const map = {
    'first-furniture': { title: '第一件家具', emoji: '🛋️', text: '把它带回家的那天，小屋有了第一个家的样子。' },
    'first-expand': { title: '第一次扩建', emoji: '🏠', text: '小屋变大那天，你兴奋地转了好几圈。' },
    'wish-done': { title: '心愿达成', emoji: '🎉', text: '攒了好久的心愿终于实现，那是笑得最开心的一天。' },
  };
  const known = [];
  for (const ev of events) if (map[ev]) known.push(map[ev]);
  return { total: known.length, moments: known };
}

/** 65 · 我的成长绘本：按活跃天数生成今天这一页的绘本文字（自传式依恋）。 */
export function growthPage(day = 0, name = '伙伴') {
  const pages = [
    '今天，小屋的大门第一次为我打开。',
    '我和%s一起，认识了屋里的每一件家具。',
    '今天学了一点新东西，小屋悄悄亮了一亮。',
    '我们在窗边晒了会儿太阳，说了好多话。',
    '今天心情有点多云，但玩了一会儿就好了。',
    '小屋又多了一样小装饰，是我们一起挑的。',
    '今天的开心，我画在这一页。',
  ];
  const text = pages[Math.max(0, day) % pages.length].replace('%s', name);
  return `第 ${Math.max(1, day + 1)} 页 · ${text}`;
}