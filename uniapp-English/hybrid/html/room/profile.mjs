/**
 * 个人主页账本（纯逻辑，可在 Node 中测试）：头像、昵称、等级、经验、累计学习时长、
 * 连续签到天数、勋章墙，以及「签到/升级给积分」的待入账补偿（pending）。
 * 积分本身统一由 economy.reward() 幂等入账（eventId 去重）；本模块只负责经验与成就判定。
 * 这是客户端原型账本；正式版应由宿主服务端校验签到与学习事件。
 */

export const MAX_LEVEL = 20;
export const LEVEL_REWARDS = Object.freeze(
  Array.from({ length: MAX_LEVEL - 1 }, (_, i) => 50 + 25 * i), // 升到 level=i+2 时奖励：50,75,100…
);

// 从 level 升到 level+1 所需的经验：1→100，2→160，3→220（线性递增）。
export function xpNeededBetween(level) {
  if (!Number.isInteger(level) || level < 1 || level >= MAX_LEVEL) return null;
  return 100 + 60 * (level - 1);
}
export function xpForLevel(level) { // 到达该等级需要的累计经验（level 1 为 0）
  if (!Number.isInteger(level) || level < 1) return 0;
  if (level > MAX_LEVEL) return Infinity;
  let total = 0;
  for (let l = 1; l < level; l++) total += xpNeededBetween(l);
  return total;
}
export function levelFromXp(xp) {
  if (!Number.isInteger(xp) || xp < 0) return 1;
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}
export function levelUpRewardPoints(toLevel) {
  if (!Number.isInteger(toLevel) || toLevel < 2 || toLevel > MAX_LEVEL) return 0;
  return LEVEL_REWARDS[toLevel - 2];
}

// 签到奖励随连续天数递增：第 1 天 经验5/积分3，之后每天 +2 经验/+1 积分；每满 7 天加一次周期奖励。
export function checkInReward(streak) {
  const day = Number.isInteger(streak) && streak >= 1 ? streak : 1;
  const baseExp = 5 + 2 * Math.min(day - 1, 29);
  const basePoints = 3 + Math.min(day - 1, 29);
  const cycle = day % 7 === 0 ? { exp: 20, points: 10 } : { exp: 0, points: 0 };
  return { day, exp: baseExp + cycle.exp, points: basePoints + cycle.points };
}

export const BADGES = Object.freeze([
  Object.freeze({ id: 'first-checkin', name: '初次签到', description: '完成第一次签到', category: 'checkin' }),
  Object.freeze({ id: 'streak-3', name: '连续 3 天', description: '连续签到 3 天', category: 'checkin' }),
  Object.freeze({ id: 'streak-7', name: '坚持一周', description: '连续签到 7 天', category: 'checkin' }),
  Object.freeze({ id: 'streak-14', name: '坚持两周', description: '连续签到 14 天', category: 'checkin' }),
  Object.freeze({ id: 'streak-30', name: '坚持一月', description: '连续签到 30 天', category: 'checkin' }),
  Object.freeze({ id: 'checkin-7', name: '签到 7 次', description: '累计签到 7 天', category: 'checkin' }),
  Object.freeze({ id: 'checkin-30', name: '签到 30 次', description: '累计签到 30 天', category: 'checkin' }),
  Object.freeze({ id: 'checkin-100', name: '签到 100 次', description: '累计签到 100 天', category: 'checkin' }),
  Object.freeze({ id: 'study-1h', name: '学习 1 小时', description: '累计学习满 1 小时', category: 'study' }),
  Object.freeze({ id: 'study-10h', name: '学习 10 小时', description: '累计学习满 10 小时', category: 'study' }),
  Object.freeze({ id: 'study-50h', name: '学习 50 小时', description: '累计学习满 50 小时', category: 'study' }),
  Object.freeze({ id: 'level-3', name: '小小学者', description: '达到 3 级', category: 'level' }),
  Object.freeze({ id: 'level-5', name: '进阶学者', description: '达到 5 级', category: 'level' }),
  Object.freeze({ id: 'level-10', name: '资深学者', description: '达到 10 级', category: 'level' }),
  Object.freeze({ id: 'first-purchase', name: '第一件家具', description: '从商店买下第一件家具', category: 'growth' }),
  Object.freeze({ id: 'expand-1', name: '第一次扩建', description: '把房间扩建到下一档', category: 'growth' }),
  Object.freeze({ id: 'collector', name: '收藏家', description: '集齐商店全部家具', category: 'growth' }),
  Object.freeze({ id: 'spend-500', name: '购物达人', description: '累计消费满 500 积分', category: 'growth' }),
  Object.freeze({ id: 'expand-2', name: '改造大师', description: '累计扩建 2 次房间', category: 'growth' }),
]);

export function badgeTest(badge, profile, economy) {
  const streak = profile.streakDays, total = profile.totalCheckIns, xp = profile.xp, level = profile.level;
  const hours = profile.totalStudySeconds / 3600;
  const owned = Array.isArray(economy?.owned) ? economy.owned : [];
  const totalSpent = Number.isSafeInteger(economy?.totalSpent) ? economy.totalSpent : 0;
  const expandCount = Array.isArray(economy?.claims?.requests)
    ? economy.claims.requests.filter(request => request.operation === 'expand').length : 0;
  switch (badge.id) {
    case 'first-checkin': return total >= 1;
    case 'streak-3': return streak >= 3;
    case 'streak-7': return streak >= 7;
    case 'streak-14': return streak >= 14;
    case 'streak-30': return streak >= 30;
    case 'checkin-7': return total >= 7;
    case 'checkin-30': return total >= 30;
    case 'checkin-100': return total >= 100;
    case 'study-1h': return hours >= 1;
    case 'study-10h': return hours >= 10;
    case 'study-50h': return hours >= 50;
    case 'level-3': return level >= 3;
    case 'level-5': return level >= 5;
    case 'level-10': return level >= 10;
    case 'first-purchase': return owned.length >= 1;
    case 'expand-1': return (economy?.roomLevel || 0) >= 1;
    case 'collector': return owned.length >= 4;
    case 'spend-500': return totalSpent >= 500;
    case 'expand-2': return expandCount >= 2;
    default: return false;
  }
}
// 未解锁徽章的「还差多少」提示；不可量化的（初次签到/首购/收藏家）返回 null。
export function badgeHint(badge, profile, economy) {
  const streak = profile.streakDays, total = profile.totalCheckIns, level = profile.level;
  const hours = profile.totalStudySeconds / 3600;
  const totalSpent = Number.isSafeInteger(economy?.totalSpent) ? economy.totalSpent : 0;
  const expandCount = Array.isArray(economy?.claims?.requests)
    ? economy.claims.requests.filter(request => request.operation === 'expand').length : 0;
  switch (badge.id) {
    case 'streak-3': case 'streak-7': case 'streak-14': case 'streak-30': {
      const need = Number(badge.id.slice(7));
      return streak >= need ? null : `再连续签到 ${need - streak} 天`;
    }
    case 'checkin-7': case 'checkin-30': case 'checkin-100': {
      const need = Number(badge.id.slice(8));
      return total >= need ? null : `再签到 ${need - total} 次`;
    }
    case 'study-1h': case 'study-10h': case 'study-50h': {
      const need = Number(badge.id.slice(6, -1));
      const left = need - hours;
      if (left <= 0) return null;
      return left < 1 ? `再学 ${Math.ceil(left * 60)} 分钟` : `再学 ${Math.ceil(left)} 小时`;
    }
    case 'level-3': case 'level-5': case 'level-10': {
      const need = Number(badge.id.slice(6));
      return level >= need ? null : `再升 ${need - level} 级`;
    }
    case 'spend-500': {
      const need = 500;
      return totalSpent >= need ? null : `再消费 ${need - totalSpent} 积分`;
    }
    case 'expand-2': {
      const need = 2;
      return expandCount >= need ? null : `再扩建 ${need - expandCount} 次`;
    }
    default: return null;
  }
}
// 签到统计：本月已签天数 + 近 30 天（含今天）签到次数 + 近 7 天逐日（周报）。
export function buildStats(checkInDates, anchorDate) {
  if (!isDate(anchorDate)) return null;
  const anchor = Date.parse(`${anchorDate}T00:00:00Z`);
  const month = anchorDate.slice(0, 7);
  let monthDays = 0, last30Days = 0;
  const days = Array.isArray(checkInDates) ? checkInDates.filter(isDate) : [];
  const checkedSet = new Set(days);
  for (const day of days) {
    if (day.slice(0, 7) === month) monthDays += 1;
    if (Date.parse(`${day}T00:00:00Z`) >= anchor - 29 * 86400000) last30Days += 1;
  }
  // 近 7 天（含今天）逐日标记，供面板画周报条；跨月自动衔接。
  const weekly = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(anchor - offset * 86400000).toISOString().slice(0, 10);
    weekly.push({ date, checked: checkedSet.has(date) });
  }
  return { monthDays, last30Days, weekly: { days: weekly, checkedDays: weekly.filter(item => item.checked).length } };
}

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const natural = value => Number.isSafeInteger(value) && value >= 0;
const validId = value => typeof value === 'string' && value.length <= 160 && value.trim().length > 0;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isDate = value => typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value));
const MAX_PROFILE_BYTES = 262144;
const MAX_CHECKIN_HISTORY = 480; // 签到日期历史上限（约 16 个月），超出丢弃最旧的
const MAX_PENDING = 31;          // 待入账积分条数上限（约一个月），防止经济账本长期写失败时无限膨胀
const bytes = value => new TextEncoder().encode(value).byteLength;
const copyJSON = input => JSON.parse(JSON.stringify(input));
class ProfileError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new ProfileError(code, message); };
const errorInfo = error => ({ code: error instanceof ProfileError ? error.code : 'INVALID_ARGUMENT', message: error instanceof ProfileError ? error.message : '个人主页数据无效' });

export function daysBetween(a, b) { // YYYY-MM-DD 差值（UTC 安全）
  if (!isDate(a) || !isDate(b)) return NaN;
  const diff = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  if (!Number.isFinite(diff)) return NaN;
  return Math.round(diff / 86400000);
}
export function previousDay(date) {
  if (!isDate(date)) return null;
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
// 签到日历（租户视图）：checkInDates 为升序日期串，anchorDate 为“今天”，viewMonth 指定要显示哪个月
// （'YYYY-MM'，缺省为 anchorDate 所在月），支持跨月翻页。isToday 只有当月视图才有意义。
export function buildMonthCalendar(checkInDates, anchorDate, viewMonth) {
  if (!isDate(anchorDate)) return null;
  const target = typeof viewMonth === 'string' && /^\d{4}-\d{2}$/.test(viewMonth) ? viewMonth : anchorDate.slice(0, 7);
  const year = Number(target.slice(0, 4)), month = Number(target.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const checked = new Set(Array.isArray(checkInDates) ? checkInDates.filter(isDate) : []);
  const prefix = `${target}-`;
  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${prefix}${String(day).padStart(2, '0')}`;
    days.push({ date, day, checked: checked.has(date), isToday: date === anchorDate });
  }
  return { year, month, days };
}

function parseProfile(raw) {
  if (typeof raw !== 'string' || bytes(raw) > MAX_PROFILE_BYTES) fail('INVALID_STATE', '个人主页存档过大或不是 JSON 文本');
  let profile; try { profile = copyJSON(JSON.parse(raw)); } catch { fail('INVALID_STATE', '个人主页存档损坏'); }
  const keys = ['version', 'gender', 'name', 'totalStudySeconds', 'xp', 'level', 'lastCheckIn', 'streakDays', 'totalCheckIns', 'badges', 'pending', 'checkInDates', 'badgeUnlockedAt', 'makeups'];
  parseProfile: if (!plain(profile) || Object.keys(profile).some(key => !keys.includes(key))) fail('INVALID_STATE', '个人主页存档字段无效');
  if (profile.version !== 1) fail('INVALID_STATE', '个人主页版本无效');
  if (!['male', 'female'].includes(profile.gender)) fail('INVALID_STATE', '头像性别无效');
  if (typeof profile.name !== 'string' || profile.name.length > 40) fail('INVALID_STATE', '昵称无效');
  for (const key of ['totalStudySeconds', 'xp', 'level', 'streakDays', 'totalCheckIns']) {
    if (!natural(profile[key])) fail('INVALID_STATE', `${key} 无效`);
  }
  if (profile.level < 1 || profile.level > MAX_LEVEL) fail('INVALID_STATE', '等级无效');
  if (profile.lastCheckIn !== null && !isDate(profile.lastCheckIn)) fail('INVALID_STATE', '签到日期无效');
  const badgeIds = new Set(BADGES.map(item => item.id));
  if (!Array.isArray(profile.badges) || profile.badges.some(id => typeof id !== 'string' || !badgeIds.has(id)) || new Set(profile.badges).size !== profile.badges.length) fail('INVALID_STATE', '勋章记录无效');
  // 勋章解锁时间（v2.7/batch1）：旧档缺失补空对象，不视为损坏。
  if (profile.badgeUnlockedAt === undefined) profile.badgeUnlockedAt = {};
  if (!plain(profile.badgeUnlockedAt) || Object.values(profile.badgeUnlockedAt).some(value => value !== null && !isDate(value))) fail('INVALID_STATE', '勋章解锁时间无效');
  // 补签记录（v2.7/batch1）：{month, count} 每月限额；旧档缺失补默认。
  if (profile.makeups === undefined) profile.makeups = { month: null, count: 0 };
  if (!plain(profile.makeups) || !natural(profile.makeups.count) || profile.makeups.count > 999 ||
    (profile.makeups.month !== null && !/^\d{4}-\d{2}$/.test(profile.makeups.month))) fail('INVALID_STATE', '补签记录无效');
  // 签到日期历史：升序去重的日期串；旧存档缺失时补空数组（不视为损坏）。
  if (profile.checkInDates === undefined) profile.checkInDates = [];
  if (!Array.isArray(profile.checkInDates) || profile.checkInDates.length > MAX_CHECKIN_HISTORY || profile.checkInDates.some(day => !isDate(day))) fail('INVALID_STATE', '签到记录无效');
  if (new Set(profile.checkInDates).size !== profile.checkInDates.length) fail('INVALID_STATE', '签到记录重复');
  for (let index = 1; index < profile.checkInDates.length; index++) {
    if (String(profile.checkInDates[index - 1]) >= String(profile.checkInDates[index])) fail('INVALID_STATE', '签到记录未按日期升序');
  }
  if (!Array.isArray(profile.pending) || profile.pending.length > MAX_PENDING || profile.pending.some(item => !plain(item) || !validId(item.key) || !natural(item.points) || item.points <= 0)) fail('INVALID_STATE', '待入账积分记录无效');
  return profile;
}

export function createProfile({ storageAdapter, storageKey = 'original-pet-room-profile-v1', onEvent } = {}) {
  let profile = { version: 1, gender: 'male', name: '', totalStudySeconds: 0, xp: 0, level: 1, lastCheckIn: null, streakDays: 0, totalCheckIns: 0, badges: [], pending: [], checkInDates: [], badgeUnlockedAt: {}, makeups: { month: null, count: 0 } };
  let adapter = null, loadError = null, writeError = null, busy = false, lastPersisted = null;
  try {
    if (typeof storageKey !== 'string' || !storageKey.trim()) fail('INVALID_STORAGE_KEY', '个人主页存储键无效');
    if (storageAdapter === undefined) {
      try { adapter = globalThis.localStorage; } catch { fail('STORAGE_UNAVAILABLE', '当前环境无法访问个人主页存储'); }
      if (!adapter) fail('STORAGE_UNAVAILABLE', '当前环境没有个人主页存储，请显式传入存储适配器');
    } else adapter = storageAdapter;
    if (adapter !== null && (typeof adapter?.getItem !== 'function' || typeof adapter?.setItem !== 'function')) fail('STORAGE_UNAVAILABLE', '个人主页存储适配器无效');
    if (adapter) {
      let raw; try { raw = adapter.getItem(storageKey); } catch { fail('STORAGE_READ_FAILED', '无法读取个人主页存档'); }
      if (raw !== null) { profile = parseProfile(raw); lastPersisted = raw; }
    }
  } catch (error) { loadError = error instanceof ProfileError ? { code: error.code, message: error.message } : { code: 'STORAGE_READ_FAILED', message: '无法读取个人主页存档' }; }

  function getState() {
    return copyJSON({ ...profile, valid: !loadError && !writeError, writable: !loadError && !writeError, error: loadError || writeError });
  }
  const reply = (ok, code, message) => ({ ok, code, message, state: getState() });
  function transaction(mutate, operation) {
    if (loadError) return reply(false, loadError.code, loadError.message);
    if (busy) return reply(false, 'BUSY', '个人主页正在保存，请稍后重试');
    busy = true; let changed = false, result;
    try {
      const candidate = copyJSON(profile), verdict = mutate(candidate);
      if (verdict?.unchanged) result = { ...reply(true, verdict.code || 'ALREADY_APPLIED', verdict.message || '此操作已处理'), ...verdict };
      else {
        if (!natural(candidate.xp) || !natural(candidate.totalStudySeconds)) fail('PROFILE_OVERFLOW', '个人主页数值超出范围');
        const encoded = JSON.stringify(candidate);
        if (bytes(encoded) > MAX_PROFILE_BYTES) fail('ACCOUNT_FULL', '个人主页存档超过 256KB 上限');
        if (adapter) {
          try {
            // 多标签页并发写保护：落盘前重读一次，若外部已改过（版本号不同）则拒绝本次写入，
            // 避免后写的标签页用旧快照覆盖新数据（本版不自动合并，安全优先）。
            if (lastPersisted !== null) {
              let current; try { current = adapter.getItem(storageKey); } catch { current = undefined; }
              if (current !== lastPersisted) { writeError = { code: 'ARCHIVE_CONFLICT', message: '个人主页存档已被其他页面修改，本次未保存' }; fail('ARCHIVE_CONFLICT', writeError.message); }
            }
            const saved = adapter.setItem(storageKey, encoded);
            if (saved && typeof saved.then === 'function') { Promise.resolve(saved).catch(() => { }); throw new Error('需要同步存储适配器'); }
            lastPersisted = encoded;
          } catch { if (!writeError) writeError = { code: 'STORAGE_WRITE_FAILED', message: '个人主页保存失败，本次未变更' }; fail(writeError.code, writeError.message); }
        }
        profile = candidate; writeError = null; changed = true; result = { ...reply(true, 'OK', verdict?.message || '已保存'), ...(verdict || {}) };
      }
    } catch (error) { const detail = errorInfo(error); result = reply(false, detail.code, detail.message); }
    finally { busy = false; }
    if (changed) try { onEvent?.('profile-change', { operation, state: getState() }); } catch { /* 宿主回调异常不能推翻已保存的数据。 */ }
    return result;
  }

  function setGender(gender) {
    return transaction(candidate => {
      if (gender !== 'male' && gender !== 'female') fail('INVALID_GENDER', '头像性别只能为 male 或 female');
      if (candidate.gender === gender) return { unchanged: true };
      candidate.gender = gender; return { message: '头像已更新' };
    }, 'set-gender');
  }
  function setName(name) {
    return transaction(candidate => {
      const value = typeof name === 'string' ? name.trim() : '';
      if (value.length > 40) fail('INVALID_NAME', '昵称最多 40 个字符');
      if (candidate.name === value) return { unchanged: true };
      candidate.name = value; return { message: '昵称已更新' };
    }, 'set-name');
  }
  function addStudyTime(seconds) {
    return transaction(candidate => {
      if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86400 * 90) fail('INVALID_STUDY_TIME', '学习时长需为 0–90 天内的整数秒');
      if (!seconds) return { unchanged: true };
      candidate.totalStudySeconds += seconds; return { message: '学习时长已累计' };
    }, 'add-study-time');
  }
  // 签到：连续天数递增，经验/积分随天数增长；返回待入账积分（含升级奖励），调用方负责 economy.reward 幂等入账。
  function checkIn(date) {
    const day = isDate(date) ? date : null;
    if (!day) fail('INVALID_DATE', '签到日期格式应为 YYYY-MM-DD');
    return transaction(candidate => {
      if (candidate.lastCheckIn === day) return { unchanged: true, code: 'ALREADY_CHECKED_IN', message: '今天已经签到过了' };
      if (candidate.pending.length >= MAX_PENDING) fail('REWARD_QUEUE_FULL', '待入账积分过多，请稍后重试补账后再签到');
      const streak = daysBetween(candidate.lastCheckIn, day) === 1 ? candidate.streakDays + 1 : 1;
      const reward = checkInReward(streak);
      const capped = candidate.level >= MAX_LEVEL;
      const expGained = capped ? 0 : reward.exp; // 满级停发经验，签到积分照发
      candidate.xp += expGained; candidate.lastCheckIn = day; candidate.streakDays = streak; candidate.totalCheckIns += 1;
      candidate.checkInDates.push(day);
      if (candidate.checkInDates.length > MAX_CHECKIN_HISTORY) candidate.checkInDates.splice(0, candidate.checkInDates.length - MAX_CHECKIN_HISTORY);
      const levelUps = [];
      while (candidate.level < MAX_LEVEL && candidate.xp >= xpForLevel(candidate.level + 1)) {
        candidate.level += 1; levelUps.push(candidate.level);
      }
      const pendingPoints = reward.points + levelUps.reduce((sum, level) => sum + levelUpRewardPoints(level), 0);
      if (pendingPoints > 0) candidate.pending.push({ key: `checkin:${day}`, points: pendingPoints });
      return { streak, exp: expGained, points: reward.points, levelUps, pendingPoints, capped, message: capped ? '已满级，签到积分照常发放' : `签到成功，连续第 ${streak} 天` };
    }, 'check-in');
  }
  // 补签卡（v2.7/batch1）：允许把“昨天”（今天的前一天，断签缺口）补进签到历史。
  // 不发经验/积分（防刷）；只让连续天数与签到总数衔接；每月限 3 次；调用方负责扣积分（economy.spend 幂等）。
  function makeUp(date, today) {
    const day = isDate(date) ? date : null;
    if (!day) fail('INVALID_DATE', '补签日期格式应为 YYYY-MM-DD');
    const anchor = isDate(today) ? today : null;
    if (!anchor) fail('INVALID_DATE', '应提供今天的日期');
    if (day !== previousDay(anchor)) fail('MAKEUP_NOT_YESTERDAY', '只能补签昨天');
    return transaction(candidate => {
      if (candidate.checkInDates.includes(day)) return { unchanged: true, code: 'ALREADY_CHECKED_IN', message: '这一天已经在签到记录里' };
      if (candidate.lastCheckIn === day) return { unchanged: true, code: 'ALREADY_CHECKED_IN', message: '这一天已签到' };
      const month = anchor.slice(0, 7);
      if (candidate.makeups.month !== month) { candidate.makeups = { month, count: 0 }; }
      if (candidate.makeups.count >= 3) fail('MAKEUP_LIMIT', '本月补签次数已用完');
      // 补签后：签到总数 +1，日期按序插入；连续天数按“补签日紧接上次签到”计算。
      candidate.checkInDates.push(day);
      candidate.checkInDates.sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
      if (candidate.checkInDates.length > MAX_CHECKIN_HISTORY) candidate.checkInDates.splice(0, candidate.checkInDates.length - MAX_CHECKIN_HISTORY);
      candidate.makeups.count += 1;
      const streak = previousDay(day) === candidate.lastCheckIn ? candidate.streakDays + 1 : 1;
      const previously = candidate.streakDays;
      candidate.streakDays = Math.max(candidate.streakDays, streak);
      candidate.totalCheckIns += 1;
      return { makeup: day, streak, totalCheckIns: candidate.totalCheckIns, month, count: candidate.makeups.count, stretched: candidate.streakDays > previously, message: `已补签 ${day}` };
    }, 'make-up');
  }
  function settlePending(economyReward) { // 把未入账积分补到 economy；全部成功才清空。
    if (typeof economyReward !== 'function') return reply(false, 'INVALID_REWARD', '缺少积分入账函数');
    return transaction(candidate => {
      if (!candidate.pending.length) return { unchanged: true };
      for (const item of candidate.pending) {
        const result = economyReward({ eventId: item.key, points: item.points, reason: 'profile' });
        if (!result?.ok) fail('REWARD_FAILED', '积分入账失败，稍后会自动重试');
      }
      candidate.pending = []; return { message: '积分已入账' };
    }, 'settle-pending');
  }
  function evaluate(economyState, today) {
    const unlocked = [], economy = economyState && typeof economyState === 'object' ? economyState : {};
    const unlockDate = isDate(today) ? today : null;
    for (const badge of BADGES) {
      if (profile.badges.includes(badge.id) || !badgeTest(badge, profile, economy)) continue;
      unlocked.push(badge.id);
    }
    if (!unlocked.length) return { ok: true, unlocked: [], state: getState() };
    const result = transaction(candidate => {
      candidate.badges = [...candidate.badges, ...unlocked];
      if (unlockDate) for (const id of unlocked) candidate.badgeUnlockedAt[id] = unlockDate;
      return { message: `解锁 ${unlocked.length} 枚勋章` };
    }, 'badges');
    for (const id of unlocked) { try { onEvent?.('badge-unlocked', { id }); } catch { /* 回调异常不推翻结果 */ } }
    return { ...result, unlocked };
  }
  return {
    getState, setGender, setName, addStudyTime, checkIn, makeUp, settlePending, evaluate,
    get pendingCount() { return profile.pending.length; },
    get makeUpCount() { return profile.makeups.count; },
  };
}
