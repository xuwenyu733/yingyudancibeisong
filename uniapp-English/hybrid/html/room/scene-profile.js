/** 个人主页视图；只使用传入的 room API（getProfile/checkIn/setProfileGender/setProfileName），不访问存储。另行引入 shop.css。 */
import { buildMonthCalendar } from './profile.mjs';
const SVG = 'http://www.w3.org/2000/svg';
const number = value => Number.isFinite(value) ? value : 0;
const format = value => number(value).toLocaleString('zh-CN');
const hoursText = seconds => {
  const s = number(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
};

function foxAvatar(parent, gender) {
  const art = parent.ownerDocument.createElementNS(SVG, 'svg');
  art.setAttribute('viewBox', '0 0 96 96');
  art.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => { const node = parent.ownerDocument.createElementNS(SVG, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); art.append(node); return node; };
  add('ellipse', { cx: 48, cy: 88, rx: 26, ry: 5, fill: '#735b3d', opacity: .10 });
  add('path', { d: 'M18 30 6 6l22 12c-6 4-10 9-10 12Zm60 0L90 6 68 18c6 4 10 9 10 12Z', fill: '#e08b3c' });
  add('ellipse', { cx: 48, cy: 54, rx: 30, ry: 27, fill: '#f2a25c' });
  add('ellipse', { cx: 48, cy: 60, rx: 20, ry: 16, fill: '#fff2d9' });
  add('path', { d: 'M20 34c-1-10 7-16 14-14', stroke: '#fff2d9', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' });
  if (gender === 'female') {
    add('path', { d: 'M48 24c-8 0-12 6-12 12h24c0-6-4-12-12-12Z', fill: '#e98ba7' });
    add('circle', { cx: 48, cy: 20, r: 5, fill: '#e98ba7' });
    add('path', { d: 'M34 52q4-6 10 0M50 52q4-6 10 0', stroke: '#3d2b1e', 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none' });
    add('circle', { cx: 37, cy: 62, r: 3, fill: '#f78fb3', opacity: .8 });
    add('circle', { cx: 59, cy: 62, r: 3, fill: '#f78fb3', opacity: .8 });
  } else {
    add('path', { d: 'M22 46c3-8 10-11 15-9 1 0-3 7-15 9Z', fill: '#d97f33' });
    add('path', { d: 'M74 46c-3-8-10-11-15-9-1 0 3 7 15 9Z', fill: '#d97f33' });
    add('circle', { cx: 36, cy: 52, r: 4.4, fill: '#2e241b' });
    add('circle', { cx: 60, cy: 52, r: 4.4, fill: '#2e241b' });
    add('circle', { cx: 37.4, cy: 50.6, r: 1.5, fill: '#fff' });
    add('circle', { cx: 61.4, cy: 50.6, r: 1.5, fill: '#fff' });
  }
  add('ellipse', { cx: 32, cy: 67, rx: 7, ry: 5, fill: '#fff2d9' });
  add('ellipse', { cx: 64, cy: 67, rx: 7, ry: 5, fill: '#fff2d9' });
  add('ellipse', { cx: 48, cy: 66, rx: 4, ry: 2.6, fill: '#3d2b1e' });
  add('path', { d: 'M42 70c2 2 10 2 12 0', stroke: '#3d2b1e', 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none' });
  return art;
}

export function createProfilePanel({ root, api, pointsLabel = '积分' } = {}) {
  if (!root?.ownerDocument || !api || typeof api.getProfile !== 'function') throw new TypeError('个人主页需要房间根节点与 getProfile API');
  const doc = root.ownerDocument, win = doc.defaultView, events = new win.AbortController(), listen = { signal: events.signal };
  const label = typeof pointsLabel === 'string' && pointsLabel.trim() ? pointsLabel : '积分';
  let disposed = false, opened = false, profile = null, pending = false, returnFocus = null, hudReady = false;

  function el(tag, className, text, parent) { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; parent?.append(node); return node; }

    // HUD：等级徽章 + 入口按钮
  const hud = el('div', 'room-hud room-hud-right', null, root);
  // 快捷签到（v2.7/batch1）：今天未签时 HUD 上直接签到，不用开面板。
  const hudQuick = el('button', 'room-profile-hud-quick', '签到', hud);
  hudQuick.hidden = true;
  hudQuick.setAttribute('aria-label', '快捷签到');
  const levelBadge = el('button', 'room-profile-level', null, hud);
  levelBadge.setAttribute('aria-label', '个人主页');
  el('span', 'room-profile-level-num', 'Lv.1', levelBadge);
  const hudLevel = el('span', 'room-profile-level-name', '小小学员', levelBadge);
  const hudStreak = el('span', 'room-profile-hud-streak', '', levelBadge);
  hudStreak.hidden = true;

  // 面板
  const panel = el('section', 'room-profile', null, root);
  panel.hidden = true;
  panel.setAttribute('aria-label', '个人主页');
  const header = el('header', 'room-profile-header', null, panel);
  const title = el('h2', null, '我的主页', header);
  el('span', 'room-profile-sub', null, title).textContent = '坚持学习，小屋和勋章都会记得。';
  // 日间/夜间主题切换（v2.7/batch1）：面板配色走 CSS 变量，记忆到 localStorage。
  const themeButton = el('button', 'room-profile-theme', '🌙', header);
  themeButton.setAttribute('aria-label', '切换日间/夜间模式');
  let darkTheme = false;
  try { darkTheme = win.localStorage?.getItem('original-pet-room-theme') === 'dark'; } catch { /* 无存储则默认日间 */ }
  function applyTheme() {
    panel.classList.toggle('room-profile-dark', darkTheme);
    themeButton.textContent = darkTheme ? '☀️' : '🌙';
    try { win.localStorage.setItem('original-pet-room-theme', darkTheme ? 'dark' : 'light'); } catch { /* 忽略 */ }
  }
  applyTheme();
  themeButton.addEventListener('click', () => { darkTheme = !darkTheme; applyTheme(); }, listen);
  el('button', 'room-profile-close', '×', header).addEventListener('click', () => close(false), listen);

  const body = el('div', 'room-profile-body', null, panel);

  // 头像 + 昵称
  const identity = el('section', 'room-profile-card', null, body);
  const avatarRow = el('div', 'room-profile-avatar-row', null, identity);
  const avatarBox = el('div', 'room-profile-avatar', null, avatarRow);
  const genderButtons = el('div', 'room-profile-genders', null, identity);
  for (const [gender, text] of [['male', '男孩'], ['female', '女孩']]) {
    const button = el('button', 'room-profile-gender', null, genderButtons);
    button.dataset.gender = gender;
    foxAvatar(button, gender);
    el('span', null, text, button);
    button.addEventListener('click', () => pickGender(gender), listen);
  }
  const nameRow = el('div', 'room-profile-name-row', null, identity);
  const nameInput = el('input', 'room-profile-name', null, nameRow);
  nameInput.maxLength = 40;
  nameInput.placeholder = '给自己起个昵称';
  const saveName = el('button', 'edit-button', '保存', nameRow);
  saveName.addEventListener('click', () => setName(), listen);

  // 等级 + 经验
  const level = el('section', 'room-profile-card', null, body);
  const levelTitle = el('div', 'room-profile-level-title', null, level);
  el('span', 'room-profile-level-big', 'Lv.1', levelTitle);
  const levelName = el('span', 'room-profile-level-desc', null, levelTitle);
  const bar = el('div', 'room-profile-bar', null, level);
  const barFill = el('div', 'room-profile-bar-fill', null, bar);
  const barText = el('div', 'room-profile-bar-text', null, level);

  // 学习数据
  const stats = el('section', 'room-profile-stats', null, body);
  for (const key of ['study', 'streak', 'total', 'month', 'recent']) {
    const cell = el('div', 'room-profile-stat', null, stats);
    el('div', 'room-profile-stat-value', '–', cell).dataset.value = key;
    el('div', 'room-profile-stat-name', { study: '学习时长', streak: '连续坚持', total: '累计签到', month: '本月签到', recent: '近 30 天' }[key], cell);
  }
  // 近 7 天签到点阵（周报，v2.7/batch1）
  const weekly = el('div', 'room-profile-weekly', null, body);
  weekly.hidden = true;

  // 签到
  const checkin = el('section', 'room-profile-card', null, body);
  el('h3', null, '每日签到', checkin);
  const checkinPreview = el('p', 'room-profile-checkin-preview', '今天还没有签到。', checkin);
  const nextBadgeLine = el('p', 'room-profile-next-badge', '', checkin);
  const checkinButton = el('button', 'edit-button edit-primary', '签到', checkin);
  const checkinResult = el('p', 'room-profile-checkin-result', '', checkin);
  // 补签卡（v2.7/batch1）：花积分补上昨天的缺口，每月限 3 次。
  const makeupRow = el('div', 'room-profile-makeup', null, checkin);
  const makeupButton = el('button', 'edit-button', '', makeupRow);
  makeupButton.hidden = true;
  makeupButton.addEventListener('click', () => doMakeUp(), listen);
  const calHead = el('div', 'room-profile-calendar-head-row', null, checkin);
  const calPrev = el('button', 'room-profile-calendar-nav', '‹', calHead);
  const calTitle = el('span', 'room-profile-calendar-title', '', calHead);
  const calNext = el('button', 'room-profile-calendar-nav', '›', calHead);
  calPrev.setAttribute('aria-label', '上一个月'); calNext.setAttribute('aria-label', '下一个月');
  // v2.7：点击标题直接回到当前月份（翻页后快速回位）。
  calTitle.setAttribute('role', 'button');
  calTitle.tabIndex = 0;
  calTitle.setAttribute('aria-label', '回到当前月份');
  const backToThisMonth = () => {
    const current = anchorToday().slice(0, 7);
    if (viewMonth !== current) { viewMonth = current; renderCalendar(buildMonthCalendar(signedDates, anchorToday(), viewMonth)); }
  };
  calTitle.addEventListener('click', backToThisMonth, listen);
  calTitle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); backToThisMonth(); } }, listen);
  const calendar = el('div', 'room-profile-calendar', null, checkin);
  checkinButton.addEventListener('click', () => doCheckIn(), listen);
  calPrev.addEventListener('click', () => shiftMonth(-1), listen);
  calNext.addEventListener('click', () => shiftMonth(1), listen);
  let viewMonth = null, signedDates = [], thisToday = null;
  function todayLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function anchorToday() { return thisToday || todayLocal(); }
  // 本地翻月：用 checkInDates 重新算目标月，不用再打接口。
  function shiftMonth(delta) {
    if (!viewMonth) return;
    const year = Number(viewMonth.slice(0, 4)), month = Number(viewMonth.slice(5, 7));
    const base = month + delta, nextYear = year + Math.floor((base - 1) / 12), nextMonth = ((base - 1 + 12) % 12) + 1;
    viewMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    renderCalendar(buildMonthCalendar(signedDates, anchorToday(), viewMonth));
  }

  // 勋章墙
  const badges = el('section', 'room-profile-card', null, body);
  el('h3', null, '勋章墙', badges);
  // 搜索过滤（v2.7/batch1）
  const badgeSearch = el('input', 'room-profile-badge-search', null, badges);
  badgeSearch.type = 'search';
  badgeSearch.placeholder = '搜索勋章…';
  badgeSearch.setAttribute('aria-label', '搜索勋章');
  // 勋章详情条（点击勋章展开描述与解锁日期，v2.7/batch1）
  const badgeDetail = el('div', 'room-profile-badge-detail', '', badges);
  badgeDetail.hidden = true;
  badgeDetail.addEventListener('click', () => { badgeDetail.hidden = true; }, listen);
  badgeSearch.addEventListener('input', () => renderBadges(profile?.badges || []), listen);
  const badgeGrid = el('div', 'room-profile-badges', null, badges);

  // 勋章解锁弹层（面板内底部浮层，自动消失）
  const toast = el('div', 'room-profile-toast', null, panel);
  toast.addEventListener('click', () => { clearTimeout(badgeToastTimer); toast.classList.remove('show'); }, listen);
  let badgeToastTimer = 0;
  function showBadgeToast(fresh) {
    toast.textContent = '';
    for (const badge of fresh) {
      const line = el('div', 'room-profile-toast-line', null, toast);
      el('span', 'room-profile-toast-mark', '🏅', line).setAttribute('aria-hidden', 'true');
      el('span', null, `${badge.name} · ${badge.description}`, line);
    }
    toast.classList.add('show');
    clearTimeout(badgeToastTimer);
    badgeToastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function applyProfile(next) {
    // 记录上次已解锁，用于“本次新增解锁”的弹层（任何触发路径都能捕捉，含打开面板时补弹）。
    const prevUnlocked = new Set((profile?.badges || []).filter(badge => badge.unlocked).map(badge => badge.id));
    profile = next;
    body.classList.remove('room-profile-loading'); // 数据到位，撤下骨架屏
    const gender = next.gender === 'female' ? 'female' : 'male';
    for (const button of genderButtons.querySelectorAll('.room-profile-gender')) {
      const active = button.dataset.gender === gender;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (next.name) nameInput.value = next.name;
    levelBadge.querySelector('.room-profile-level-num').textContent = `Lv.${next.level || 1}`;
    hudLevel.textContent = next.levelName || '';
    // HUD 角标：已签显示连签天数；今天未签且有连续天数时提醒「今日未签」。
    const streakDays = number(next.streakDays);
    const remind = !next.todayChecked && streakDays > 0;
    hudStreak.textContent = next.todayChecked ? `连签${streakDays}天` : (remind ? '今日未签' : '');
    hudStreak.classList.toggle('warn', remind);
    hudStreak.hidden = streakDays === 0 && !remind;
    hudQuick.hidden = next.todayChecked;
    hudQuick.disabled = pending;
    hudQuick.textContent = next.todayChecked ? '已签到' : '签到';
    level.querySelector('.room-profile-level-big').textContent = `Lv.${next.level || 1}`;
    levelName.textContent = next.levelName || '';
    const info = next.levelInfo || {};
    const pct = Math.max(0, Math.min(1, number(info.progress)));
    barFill.style.width = `${(pct * 100).toFixed(1)}%`;
    barText.textContent = info.reached ? '已满级，签到只发积分' : `${format(info.intoLevel ?? 0)} / ${format(info.need ?? 1)} 经验`;
    body.querySelector('[data-value="study"]').textContent = hoursText(next.totalStudySeconds);
    body.querySelector('[data-value="streak"]').textContent = `${number(next.streakDays)} 天`;
    body.querySelector('[data-value="total"]').textContent = `${number(next.totalCheckIns)} 次`;
    const statsData = next.stats || {};
    body.querySelector('[data-value="month"]').textContent = `${number(statsData.monthDays)} 天`;
    body.querySelector('[data-value="recent"]').textContent = `${number(statsData.last30Days)} 次`;
    // 近 7 天签到点阵（周报）
    const weekDays = statsData.weekly?.days || [];
    weekly.textContent = '';
    weekly.hidden = !weekDays.length;
    if (weekDays.length) {
      el('span', 'room-profile-weekly-label', `近 7 天签到 ${number(statsData.weekly?.checkedDays)} / 7`, weekly);
      const row = el('div', 'room-profile-weekly-days', null, weekly);
      for (const item of weekDays) {
        const dot = el('span', `room-profile-weekly-day${item.checked ? ' checked' : ''}`, String(item.date).slice(8), row);
        dot.title = `${item.date}${item.checked ? ' · 已签到' : ' · 未签到'}`;
        dot.setAttribute('aria-label', dot.title);
      }
    }
    const hint = next.nextBadgeHint;
    nextBadgeLine.textContent = hint ? `下一枚:「${hint.name}」· ${hint.hint}` : '';
    nextBadgeLine.hidden = !hint;
    renderCheckin();
    const cal = next.calendar || {};
    if (cal.year && cal.month) {
      const thisMonth = `${cal.year}-${String(cal.month).padStart(2, '0')}`;
      if (viewMonth === null) viewMonth = thisMonth;
    }
    const todayCell = (cal.days || []).find(day => day.isToday);
    if (todayCell?.date) thisToday = todayCell.date;
    signedDates = Array.isArray(next.checkInDates) ? next.checkInDates.slice() : [];
    renderCalendar(buildMonthCalendar(signedDates, anchorToday(), viewMonth));
    renderBadges(next.badges || []);
    const fresh = (next.badges || []).filter(badge => badge.unlocked && !prevUnlocked.has(badge.id));
    if (fresh.length) showBadgeToast(fresh);
    updateHudState();
  }
  function renderCheckin() {
    const today = profile?.todayReward, tomorrow = profile?.tomorrowReward;
    checkinButton.disabled = Boolean(profile?.todayChecked) || pending;
    if (profile?.todayChecked) {
      checkinPreview.textContent = '今天已经签到啦，明天继续～';
      checkinButton.textContent = '今日已签到';
      checkinResult.textContent = '';
    } else {
      checkinPreview.textContent = today ? `签到可得 经验 +${today.exp} · ${label} +${today.points}` : '今天还没有签到。';
      checkinButton.textContent = '签到';
      checkinResult.textContent = tomorrow ? `明天连续 ${tomorrow.day} 天：经验 +${tomorrow.exp} · ${label} +${tomorrow.points}` : '';
    }
    // 补签卡：额度未满且余额足够才显示；按钮文案带剩余次数。
    const makeup = profile?.makeups || { count: 0 };
    const canMakeup = makeup.count < 3 && number(profile?.balance) >= number(profile?.makeupCost || 100);
    makeupButton.hidden = !canMakeup;
    makeupButton.disabled = pending;
    makeupButton.textContent = `补签昨天（${number(profile?.makeupCost || 100)} ${label}，本月 ${3 - number(makeup.count)} 次）`;
  }
  function renderCalendar(next) {
    calendar.textContent = '';
    if (!next) return;
    calTitle.textContent = `${next.year} 年 ${next.month} 月`;
    const showing = `${next.year}-${String(next.month).padStart(2, '0')}`;
    calNext.disabled = showing >= (viewMonth ? viewMonth.slice(0, 7) : anchorToday().slice(0, 7));
    for (const weekday of ['日', '一', '二', '三', '四', '五', '六']) {
      const head = el('span', 'room-profile-calendar-head', weekday, calendar);
      head.setAttribute('aria-hidden', 'true');
    }
    for (const day of next.days) {
      const cell = el('span',
        `room-profile-calendar-day${day.checked ? ' checked' : ''}${day.isToday ? ' today' : ''}`,
        String(day.day), calendar);
      cell.title = day.checked ? `${day.date} · 已签到` : day.date;
      cell.setAttribute('aria-label', `${day.date}${day.checked ? '，已签到' : ''}${day.isToday ? '，今天' : ''}`);
    }
  }
  function renderBadges(list) {
    badgeGrid.textContent = '';
    badgeDetail.hidden = true;
    const all = Array.isArray(list) ? list : [];
    // 进度总览：已解锁 N / M + 进度条（基于全量，不随搜索变化）
    const unlockedCount = all.filter(badge => badge.unlocked).length;
    if (all.length) {
      const progressWrap = el('div', 'room-profile-badge-progress', null, badgeGrid);
      el('span', 'room-profile-badge-progress-label', `已解锁 ${unlockedCount} / ${all.length}`, progressWrap);
      const track = el('div', 'room-profile-badge-progress-track', null, progressWrap);
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(all.length));
      track.setAttribute('aria-valuenow', String(unlockedCount));
      track.setAttribute('aria-label', `勋章进度 ${unlockedCount}/${all.length}`);
      const fill = el('span', 'room-profile-badge-progress-fill', null, track);
      const pct = all.length ? Math.max(0, Math.min(1, unlockedCount / all.length)) : 0;
      fill.style.width = `${(pct * 100).toFixed(1)}%`;
    }
    // 搜索过滤
    const query = String(badgeSearch.value || '').trim().toLowerCase();
    const filtered = query
      ? all.filter(badge => badge.name.toLowerCase().includes(query) || badge.description.toLowerCase().includes(query))
      : all;
    if (query && !filtered.length) el('div', 'room-profile-badge-empty', '没有匹配的勋章', badgeGrid);
    const groups = [['checkin', '签到成就'], ['study', '学习成就'], ['level', '等级成就'], ['growth', '成长成就']];
    for (const [category, title] of groups) {
      const items = (filtered.filter(badge => badge.category === category) || [])
        .sort((a, b) => Number(Boolean(b.unlocked)) - Number(Boolean(a.unlocked)));
      if (!items.length) continue;
      el('div', 'room-profile-badge-group-title', title, badgeGrid);
      for (const badge of items) {
        const cell = el('div', `room-profile-badge${badge.unlocked ? '' : ' locked'}`, null, badgeGrid);
        cell.setAttribute('role', 'button');
        cell.tabIndex = 0;
        const mark = el('span', 'room-profile-badge-mark', badge.unlocked ? '🏅' : '🔒', cell);
        mark.setAttribute('aria-hidden', 'true');
        el('div', 'room-profile-badge-name', badge.name, cell);
        cell.title = `${badge.description}${badge.unlocked ? '' : '（未解锁）'}`;
        el('div', 'room-profile-badge-desc', badge.unlocked ? badge.description : '尚未解锁', cell);
        // 点击/回车展开详情条
        const showDetail = () => {
          badgeDetail.hidden = false;
          const when = badge.unlocked && badge.unlockedAt ? ` · 解锁于 ${badge.unlockedAt}` : '';
          badgeDetail.textContent = `${badge.name}（${badge.unlocked ? '已解锁' : '未解锁'}）· ${badge.description}${when}`;
          badgeDetail.scrollIntoView({ block: 'nearest' });
        };
        cell.addEventListener('click', showDetail, listen);
        cell.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDetail(); } }, listen);
      }
    }
  }
  function updateHudState() {
    levelBadge.classList.toggle('room-profile-level-new', Boolean(profile?.unlocked?.length));
  }
  let lastRefresh = 0;
  function refresh() {
    if (pending) return;
    const now = Date.now();
    if (opened && now - lastRefresh < 500) return; // onState 每帧回调时节流，避免频繁拉取/结算
    lastRefresh = now;
    pending = true;
    const resolve = result => { pending = false; if (!disposed && result?.ok !== false) applyProfile(result.profile || result); };
    const reject = () => { pending = false; if (!disposed) checkinResult.textContent = '主页暂时打不开，请稍后重试。'; };
    try { Promise.resolve(api.getProfile()).then(resolve, reject); } catch { reject(); }
  }
  function open() {
    if (disposed || opened) return;
    opened = true; returnFocus = doc.activeElement;
    body.classList.add('room-profile-loading'); // 骨架屏：数据就位后 applyProfile 撤下
    refresh();
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    try { panel.focus({ preventScroll: true }); } catch { /* 面板可聚焦即可，失败不阻断 */ }
  }
  function close(returnTo) {
    if (disposed || !opened) return;
    opened = false;
    panel.classList.remove('open');
    panel.hidden = true;
    if (returnTo && returnFocus?.focus) { try { returnFocus.focus(); } catch { /* 元素可能已销毁 */ } }
  }
  function pickGender(gender) {
    if (pending || !profile || profile.gender === gender) return;
    pending = true;
    Promise.resolve(api.setProfileGender(gender)).then(() => { pending = false; refresh(); }, () => { pending = false; });
  }
  function setName() {
    if (pending) return;
    const value = nameInput.value.trim();
    pending = true;
    Promise.resolve(api.setProfileName(value)).then(() => { pending = false; refresh(); }, () => { pending = false; });
  }
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); setName(); } }, listen);
  let celebrateTimer = 0;
  function celebrate() {
    checkin.classList.remove('celebrate');
    void checkin.offsetWidth; // 重启动画
    checkin.classList.add('celebrate');
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => checkin.classList.remove('celebrate'), 380);
  }
  function doCheckIn(silent) {
    if (pending || profile?.todayChecked) return;
    pending = true;
    if (!silent) checkinResult.textContent = '签到中…';
    Promise.resolve(api.checkIn()).then(result => {
      pending = false;
      if (result?.ok && !result.unchanged) {
        const points = result.pointsSettled === false ? '，积分稍后自动到账' : '';
        const badges = result.newBadges ? `，解锁 ${result.newBadges} 枚勋章！` : '';
        const levelUp = result.levelUps?.length ? `，升级到 Lv.${result.levelUps.at(-1)}！` : '';
        const capped = result.capped ? '（已满级，积分照发）' : '';
        if (!silent) checkinResult.textContent = `签到成功：经验 +${result.exp} · ${label} +${result.points}${points}${levelUp}${badges}${capped}`;
        celebrate();
        refresh();
      } else if (result?.unchanged) {
        if (!silent) checkinResult.textContent = '今天已经签到过了';
        refresh();
      } else {
        if (!silent) checkinResult.textContent = result?.message || '签到失败，请稍后再试';
      }
    }, () => { pending = false; if (!silent) checkinResult.textContent = '签到失败，请稍后再试'; });
  }
  // 补签昨天（v2.7/batch1）：走 api.makeUpCheckIn，出错/成功都回显在签到结果行。
  function doMakeUp() {
    if (pending) return;
    pending = true;
    checkinResult.textContent = '补签中…';
    Promise.resolve(api.makeUpCheckIn()).then(result => {
      pending = false;
      if (result?.ok && !result.unchanged) {
        const cost = result.pointsApplied === false ? '，积分稍后自动补扣' : `，已扣 ${result.cost} ${label}`;
        checkinResult.textContent = `${result.message}${cost}${result.stretched ? '，连续天数接上了！' : ''}`;
        celebrate();
        refresh();
      } else if (result?.unchanged) {
        checkinResult.textContent = result?.message || '昨天已经在签到记录里了';
        refresh();
      } else {
        checkinResult.textContent = result?.message || '补签失败，请稍后再试';
      }
    }, () => { pending = false; checkinResult.textContent = '补签失败，请稍后再试'; });
  }
  hudQuick.addEventListener('click', () => doCheckIn(true), listen);
  levelBadge.addEventListener('click', () => (opened ? close(true) : open()), listen);
  panel.addEventListener('click', event => { if (event.target === panel) close(false); }, listen);
  doc.addEventListener('keydown', event => { if (opened && event.key === 'Escape') close(false); }, listen);

  return {
    open, close,
    update(roomState) { // bootstrap 的 onState 调用
      const state = roomState && typeof roomState === 'object' ? roomState : {};
      if (state.petState === 'ready') levelBadge.disabled = false;
      // 房间就绪后拉一次主页数据，让 HUD 快捷签到立即可用（面板未开也能判断今日是否已签）。
      if (state.petState === 'ready' && !hudReady && !disposed) {
        hudReady = true;
        Promise.resolve(api.getProfile()).then(result => {
          if (!disposed && result?.ok !== false) applyProfile(result.profile || result);
        }, () => { hudReady = false; });
      }
      if (opened) refresh();
    },
    dispose() {
      if (disposed) return; disposed = true; events.abort();
      clearTimeout(celebrateTimer); clearTimeout(badgeToastTimer);
      panel.remove(); hud.remove();
    },
  };
}
