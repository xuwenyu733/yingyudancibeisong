/** 个人主页视图；只使用传入的 room API（getProfile/checkIn/setProfileGender/setProfileName），不访问存储。另行引入 shop.css。 */
import { buildMonthCalendar, previousDay, badgeTierForLevel, BADGE_TIERS, MAX_AVATAR_BYTES, validAvatar, xpForLevel } from './profile.mjs';
import {createBadgeEmblem,badgeProgressionTitle} from './badge-art.mjs';
import {createAchievementEmblem,achievementTitle} from './achievement-art.mjs';
import {activeElementFor} from './dom.mjs';
import {bindRoomThemeButton} from './theme.mjs';
import {acquisitionCaption} from './acquisition-time.mjs';
let profileSequence=0;
const SVG = 'http://www.w3.org/2000/svg';
const number = value => Number.isFinite(value) ? value : 0;
const format = value => number(value).toLocaleString('zh-CN');
const hoursText = seconds => {
  const s = number(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
};

/** Local file only: validate its bytes, decode, center-crop and reduce before persistence. */
export async function prepareAvatar(file, win = globalThis, { signal } = {}) {
  const checkCanceled = () => { if (signal?.aborted) throw new Error('头像上传已取消'); };
  checkCanceled();
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('图片需小于 10MB');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  checkCanceled();
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(file.type === 'image/jpeg' && jpeg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) throw new Error('图片内容与格式不符，请重新选择');
  const url = win.URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const image = new win.Image();
      let timer;
      const cleanup = () => { image.onload = image.onerror = null; signal?.removeEventListener('abort', cancel); if (timer !== undefined) win.clearTimeout?.(timer); };
      const cancel = () => { cleanup(); reject(new Error('头像上传已取消')); };
      image.onload = () => { cleanup(); resolve(image); };
      image.onerror = () => { cleanup(); reject(new Error('图片无法读取，请换一张图片')); };
      signal?.addEventListener('abort', cancel, { once: true });
      timer = win.setTimeout?.(() => { cleanup(); reject(new Error('图片读取超时，请重新选择')); }, 15000);
      image.src = url;
    });
    checkCanceled();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，请选择 4000 万像素以内的图片');
    const canvas = win.document.createElement('canvas');
    canvas.width = canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器暂时无法处理图片');
    context.fillStyle = '#fff6e2'; context.fillRect(0, 0, 192, 192);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
    for (const quality of [.88, .75, .6, .4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_AVATAR_BYTES && validAvatar(data)) return data;
    }
    throw new Error('图片压缩失败，请换一张图片');
  } finally { win.URL.revokeObjectURL(url); }
}

// Level crests are shared by the HUD and progression only. Achievements have
// their own ID-specific collectible artwork and never inherit the current tier.
const badgeEmblem=createBadgeEmblem;

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
  } else if (gender === 'none') {
    // 未选择性别：中性小狐 + 问号（v2.10）
    add('path', { d: 'M31 40q2-10 10-10 9 0 9 11 0 8-7 12-5 4-3 11h6.6', stroke: '#6b757f', 'stroke-width': 3.4, 'stroke-linecap': 'round', fill: 'none' });
    add('circle', { cx: 48, cy: 70, r: 3, fill: '#6b757f' });
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
  let disposed = false, opened = false, profile = null, pending = false, returnFocus = null, hudReady = false, nameDirty = false, openFrame = 0, displayedAvatar = null, badgeSignature = '',selectedLevelTier=null;
  let profileSignature = '', refreshing = false, refreshSerial = 0, weeklySignature = '', calendarSignature = '', archiveSignature = '';

  function el(tag, className, text, parent) { const node = doc.createElement(tag); if (tag === 'button') node.type = 'button'; if (className) node.className = className; if (text !== undefined) node.textContent = text; parent?.append(node); return node; }

    // HUD：等级徽章 + 入口按钮
  const hud = el('div', 'room-hud room-hud-right', null, root);
  // 快捷签到（v2.7/batch1）：今天未签时 HUD 上直接签到，不用开面板。
  const hudQuick = el('button', 'room-profile-hud-quick', '签到', hud);
  hudQuick.hidden = true;
  hudQuick.setAttribute('aria-label', '快捷签到');
  const levelBadge = el('button', 'room-profile-level', null, hud);
  levelBadge.setAttribute('aria-label', '个人主页');
  const hudEmblem = el('span', 'room-profile-hud-emblem', null, levelBadge);
  el('span', 'room-profile-level-num', 'Lv.1', levelBadge);
  const hudLevel = el('span', 'room-profile-level-name', '小小学员', levelBadge);
  const hudStreak = el('span', 'room-profile-hud-streak', '', levelBadge);
  hudStreak.hidden = true;

  // 面板
  const panel = el('section', 'room-profile', null, root);
  panel.hidden = true;
  panel.setAttribute('aria-label', '个人主页');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.tabIndex = -1;
  const header = el('header', 'room-profile-header', null, panel);
  const title = el('h2', null, '我的主页', header);
  el('span', 'room-profile-sub', null, title).textContent = '坚持学习，小屋和勋章都会记得。';
  const themeButton = el('button', 'room-profile-theme', '护眼', header);
  const themeBinding=bindRoomThemeButton({root,button:themeButton,api});
  const closeButton = el('button', 'room-profile-close', '×', header);
  closeButton.setAttribute('aria-label', '关闭个人主页');
  closeButton.addEventListener('click', () => close(true), listen);

  const body = el('div', 'room-profile-body', null, panel);

  // 头像 + 昵称
  const identity = el('section', 'room-profile-card', null, body);
  const avatarRow = el('div', 'room-profile-avatar-row', null, identity);
  const avatarBox = el('div', 'room-profile-avatar', null, avatarRow);
  const avatarActions = el('div', 'room-profile-avatar-actions', null, avatarRow);
  const uploadAvatar = el('button', 'edit-button room-profile-upload', '从相册上传头像', avatarActions);
  uploadAvatar.type = 'button';
  const clearAvatar = el('button', 'edit-button room-profile-reset-avatar', '恢复默认头像', avatarActions);
  clearAvatar.type = 'button'; clearAvatar.hidden = true;
  const avatarInput = el('input', 'room-profile-file', undefined, avatarActions);
  avatarInput.type = 'file'; avatarInput.accept = 'image/jpeg,image/png,image/webp'; avatarInput.hidden = true;
  avatarInput.setAttribute('aria-label', '选择头像图片');
  el('small', 'room-profile-avatar-help', 'JPG / PNG / WebP · 最大 10MB，自动裁成方形', avatarActions);
  const identityStatus = el('p', 'room-profile-identity-status', '', identity);
  identityStatus.setAttribute('role', 'status'); identityStatus.setAttribute('aria-live', 'polite');
  const onlineIdentity=api.getSocialIdentity?.(),accountId=onlineIdentity?.publicId||api.getAccountId?.();
  if(accountId){const card=el('div','room-profile-account-id',null,identity);el('strong','',onlineIdentity?'我的小屋ID · 可分享给朋友':'本机小屋ID',card);el('code','',accountId,card);const copyId=el('button','', '复制小屋ID',card);copyId.addEventListener('click',async()=>{try{if(!win.navigator?.clipboard?.writeText)throw new Error();await win.navigator.clipboard.writeText(accountId);identityStatus.textContent='小屋ID已复制';}catch{identityStatus.textContent='请选中上方ID后复制';}},listen);if(onlineIdentity){const friends=el('button','','打开朋友',card);friends.addEventListener('click',()=>{close(true);api.openFriends?.();},listen);}}
  uploadAvatar.addEventListener('click', () => { if (!pending) avatarInput.click(); }, listen);
  avatarInput.addEventListener('change', () => { const file = avatarInput.files?.[0]; avatarInput.value = ''; if (file) void uploadPhoto(file); }, listen);
  clearAvatar.addEventListener('click', () => saveIdentity(() => api.setProfileAvatar(null)), listen);
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
  nameInput.setAttribute('aria-label', '昵称');
  nameInput.placeholder = '给自己起个昵称';
  nameInput.addEventListener('input', () => { nameDirty = true; }, listen);
  const saveName = el('button', 'edit-button', '保存', nameRow);
  saveName.addEventListener('click', () => setName(), listen);

  // 等级 + 经验
  const level = el('section', 'room-profile-card room-profile-level-card', null, body);
  const levelTitle = el('button', 'room-profile-level-title room-profile-current-badge', null, level);
  levelTitle.setAttribute('aria-label','查看当前等级勋章获得时间');levelTitle.setAttribute('aria-expanded','false');
  const levelEmblem = el('span', 'room-profile-main-emblem', null, levelTitle);
  el('span', 'room-profile-level-big', 'Lv.1', levelTitle);
  const levelName = el('span', 'room-profile-level-desc', null, levelTitle);
  const bar = el('div', 'room-profile-bar', null, level);
  const barFill = el('div', 'room-profile-bar-fill', null, bar);
  const barText = el('div', 'room-profile-bar-text', null, level);
  const tierName = el('p', 'room-profile-tier-name', '', level);
  const genderHint = el('p', 'room-profile-gender-hint', '', level);
  const tierPreview = el('div', 'room-profile-tier-preview', null, level);
  tierPreview.setAttribute('aria-label', '等级勋章进阶');
  for (const tier of BADGE_TIERS) {
    const cell = el('button', 'room-profile-tier-step', null, tierPreview); cell.dataset.tier = tier.id;
    cell.setAttribute('aria-expanded','false');cell.addEventListener('click',()=>showLevelBadgeDetail(tier.id),listen);
    badgeEmblem(cell, tier); el('span', '', `${tier.minLevel} 级`, cell); cell.title = `${badgeProgressionTitle('none',tier.rank)} · ${tier.name}`;
    el('small', 'room-profile-tier-state', '', cell);
  }
  const levelDetail=el('section','room-profile-tier-detail',null,level);levelDetail.id=`room-profile-tier-detail-${++profileSequence}`;levelDetail.hidden=true;levelDetail.setAttribute('role','status');levelDetail.setAttribute('aria-label','等级勋章获得记录');
  const levelDetailArt=el('span','room-profile-tier-detail-art',null,levelDetail),levelDetailCopy=el('div','room-profile-tier-detail-copy',null,levelDetail);
  const levelDetailTitle=el('strong','',null,levelDetailCopy),levelDetailThreshold=el('p','',null,levelDetailCopy),levelDetailTime=el('p','room-acquired-time',null,levelDetailCopy);
  const levelDetailClose=el('button','room-profile-tier-detail-close','收起详情',levelDetailCopy);levelDetailClose.setAttribute('aria-label','收起等级勋章详情');levelDetailClose.addEventListener('click',hideLevelBadgeDetail,listen);
  levelTitle.setAttribute('aria-controls',levelDetail.id);for(const step of tierPreview.children)step.setAttribute('aria-controls',levelDetail.id);
  function hideLevelBadgeDetail(){selectedLevelTier=null;levelDetail.hidden=true;levelTitle.setAttribute('aria-expanded','false');for(const step of tierPreview.children)step.setAttribute('aria-expanded','false');}
  function showLevelBadgeDetail(id,{scroll=true}={}){
    if(disposed||!profile)return;const tier=BADGE_TIERS.find(item=>item.id===id);if(!tier)return;
    const saved=profile.levelBadges?.find(item=>item.id===id),unlocked=saved?!!saved.unlocked:number(profile.level)>=tier.minLevel;
    selectedLevelTier=id;levelDetail.hidden=false;
    const gender=profile.gender==='male'?'male':profile.gender==='female'?'female':'none',artKey=`${gender}:${id}`;
    if(levelDetailArt.dataset.key!==artKey){levelDetailArt.replaceChildren();badgeEmblem(levelDetailArt,tier,'level',gender);levelDetailArt.dataset.key=artKey;}
    for(const[node,text]of [[levelDetailTitle,`${badgeProgressionTitle(gender,tier.rank)} · ${saved?.name||tier.name}`],[levelDetailThreshold,`等级门槛：${saved?.minLevel||tier.minLevel} 级`],[levelDetailTime,acquisitionCaption({acquiredAt:saved?.acquiredAt,unlocked})]])if(node.textContent!==text)node.textContent=text;
    levelTitle.setAttribute('aria-expanded',String(id===badgeTierForLevel(profile.level).id));for(const step of tierPreview.children)step.setAttribute('aria-expanded',String(step.dataset.tier===id));
    if(scroll)levelDetail.scrollIntoView?.({block:'nearest'});
  }
  levelTitle.addEventListener('click',()=>{if(profile)showLevelBadgeDetail(badgeTierForLevel(profile.level).id);},listen);
  level.addEventListener('click',event=>{if(!event.target.closest?.('button')&&profile)showLevelBadgeDetail(badgeTierForLevel(profile.level).id);},listen);
  const unlockGoal = el('section', 'room-profile-unlock-goal', null, level);
  unlockGoal.setAttribute('aria-label', '下一枚等级徽章');
  const unlockArt = el('span', 'room-profile-unlock-art', '', unlockGoal);
  const unlockCopy = el('div', 'room-profile-unlock-copy', null, unlockGoal);
  el('span', 'room-profile-unlock-eyebrow', '下一枚，等你点亮', unlockCopy);
  const unlockTitle = el('strong', 'room-profile-unlock-title', '', unlockCopy);
  const unlockText = el('p', 'room-profile-unlock-text', '', unlockCopy);
  const unlockTrack = el('div', 'room-profile-unlock-track', null, unlockCopy);
  unlockTrack.setAttribute('role', 'progressbar'); unlockTrack.setAttribute('aria-valuemin', '0'); unlockTrack.setAttribute('aria-valuemax', '100');
  const unlockFill = el('span', '', null, unlockTrack);
  const unlockAction = el('button', 'edit-button room-profile-unlock-action', '查看签到奖励', unlockCopy);
  unlockAction.addEventListener('click', () => { checkin.scrollIntoView({ block: 'nearest', behavior: 'auto' }); (checkinButton.disabled ? checkin : checkinButton).focus({ preventScroll: true }); }, listen);

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
  checkin.tabIndex = -1;
  el('h3', null, '每日签到', checkin);
  const checkinPreview = el('p', 'room-profile-checkin-preview', '今天还没有签到。', checkin);
  const nextBadgeLine = el('p', 'room-profile-next-badge', '', checkin);
  const checkinButton = el('button', 'edit-button edit-primary', '签到', checkin);
  const checkinTomorrow = el('p', 'room-profile-checkin-tomorrow', '', checkin);
  const checkinResult = el('p', 'room-profile-checkin-result', '', checkin);
  checkinResult.setAttribute('role', 'status'); checkinResult.setAttribute('aria-live', 'polite');
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
  let viewMonth = null, signedDates = [], thisToday = null, calendarStampsReady = false, lastStampedDates = new Set();
  // 今日格就是盖章入口；事件只绑定在稳定日历容器，刷新格子时不累积监听器。
  const stampToday = event => {
    const cell = event.target.closest?.('[data-checkin-today="true"]');
    if (!cell || !calendar.contains(cell)) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); void doCheckIn(false);
  };
  calendar.addEventListener('click', stampToday, listen);
  calendar.addEventListener('keydown', stampToday, listen);
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

  // 成就藏品：每个里程碑有自己的造型，独立于等级勋章。
  const badges = el('section', 'room-profile-card', null, body);
  el('h3', null, '成就收藏', badges);
  const achievementStyle = el('p', 'room-profile-achievement-style', '', badges);
  // v2.10：未选择性别时提示先选择，才能观看男孩/女孩专属勋章外观
  const genderWallHint = el('p', 'room-profile-gender-hint room-profile-gender-hint--wall', '', badges);
  // 搜索过滤（v2.7/batch1）
  const badgeSearch = el('input', 'room-profile-badge-search', null, badges);
  badgeSearch.type = 'search';
  badgeSearch.placeholder = '搜索成就或解锁条件…';
  badgeSearch.setAttribute('aria-label', '搜索成就');
  // 勋章详情条（点击勋章展开描述与解锁日期，v2.7/batch1）
  const badgeDetail = el('div', 'room-profile-badge-detail', '', badges);
  badgeDetail.hidden = true;
  badgeDetail.addEventListener('click', () => { badgeDetail.hidden = true; }, listen);
  badgeSearch.addEventListener('input', () => renderBadges(profile?.badges || []), listen);
  const badgeGrid = el('div', 'room-profile-badges', null, badges);
  const badgeDetails = new Map();
  function showBadgeDetail(cell) {
    const detail = badgeDetails.get(cell?.dataset.profileBadge);
    if (!detail || disposed) return;
    badgeDetail.hidden = false; badgeDetail.replaceChildren();
    const artwork=el('span','room-profile-achievement-detail-art',null,badgeDetail);
    createAchievementEmblem(artwork,detail.badge,detail.gender);
    const copy=el('div','room-profile-achievement-detail-copy',null,badgeDetail);
    el('strong','',achievementTitle(detail.badge,detail.gender),copy);
    el('p','',detail.text,copy);el('p','room-acquired-time',detail.when,copy);el('small','','点击此处收起',copy);
    badgeDetail.scrollIntoView({ block: 'nearest' });
  }
  // 卡片会随数据刷新替换；只在稳定容器绑定一次，避免 AbortSignal 留住旧卡片。
  badgeGrid.addEventListener('click', event => showBadgeDetail(event.target.closest('[data-profile-badge]')), listen);
  badgeGrid.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const cell = event.target.closest('[data-profile-badge]'); if (cell) { event.preventDefault(); showBadgeDetail(cell); } } }, listen);

  // 存档管理（v2.17/F6）：一键备份、导出下载、从文件恢复、最近几次备份就地恢复/删除。
  const parentSettings = el('details', 'room-profile-parent-settings', null, body);
  el('summary', null, '家长设置 / 高级', parentSettings);
  el('p', 'room-profile-parent-hint', '给家长的小抽屉：帮孩子保管小屋回忆。备份与恢复功能都在这里。', parentSettings);
  const archiveUi = el('section', 'room-profile-card room-profile-archive', null, parentSettings);
  el('h3', null, '存档管理', archiveUi);
  el('p', 'room-profile-archive-hint', '会自动保留最近几次完整存档。换浏览器或误操作后，可从这里导出、恢复。', archiveUi);
  const archiveActions = el('div', 'room-profile-archive-actions', null, archiveUi);
  const backupNow = el('button', 'edit-button', '立即备份', archiveActions);
  const exportSave = el('button', 'edit-button', '导出存档（下载 JSON）', archiveActions);
  const importFile = el('input', 'room-profile-file', undefined, archiveActions);
  importFile.type = 'file'; importFile.accept = 'application/json,.json'; importFile.hidden = true;
  importFile.setAttribute('aria-label', '选择存档 JSON 文件');
  const importSaveButton = el('button', 'edit-button', '从文件恢复', archiveActions);
  const archiveStatus = el('p', 'room-profile-archive-status', '', archiveUi);
  archiveStatus.setAttribute('role', 'status'); archiveStatus.setAttribute('aria-live', 'polite');
  const archiveList = el('ul', 'room-profile-archive-list', null, archiveUi);
  archiveList.hidden = true;
  el('span', 'room-profile-archive-list-label', '最近备份', archiveList);
  const hasBackupApi = () => typeof api?.listBackups === 'function' && typeof api?.createBackup === 'function';
  const setArchiveBusy = busy => { if (!hasBackupApi()) return; backupNow.disabled = exportSave.disabled = importSaveButton.disabled = busy; for (const item of archiveList.querySelectorAll('button')) item.disabled = busy; };
  function renderArchiveList(backups) {
    if (disposed || !hasBackupApi()) return;
    const list = Array.isArray(backups) ? backups : [];
    const signature = JSON.stringify(list);
    if (signature === archiveSignature) return;
    archiveSignature = signature;
    archiveList.replaceChildren();
    el('span', 'room-profile-archive-list-label', '最近备份', archiveList);
    archiveList.hidden = list.length === 0;
    if (!list.length) return;
    for (const entry of list) {
      const item = el('li', 'room-profile-archive-item', null, archiveList);
      const copy = el('span', 'room-profile-archive-item-copy', null, item);
      const when = new Date(entry.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      el('strong', null, entry.note || '备份', copy);
      el('small', null, when, copy);
      const restore = el('button', 'edit-button', '恢复', item);
      restore.addEventListener('click', () => void restoreFromBackup(entry), listen);
      const remove = el('button', 'edit-button room-profile-archive-remove', '删除', item);
      remove.setAttribute('aria-label', `删除 ${entry.note || '备份'}`);
      remove.addEventListener('click', () => void removeOneBackup(entry), listen);
    }
  }
  function refreshArchives(silent) {
    if (disposed || !hasBackupApi()) return;
    if (!silent) archiveStatus.textContent = '';
    try {
      const result = api.listBackups();
      if (disposed) return;
      if (result?.ok) renderArchiveList(result.backups);
      else if (!silent) archiveStatus.textContent = result?.message || '暂时无法读取备份列表';
    } catch { if (!disposed && !silent) archiveStatus.textContent = '暂时无法读取备份列表'; }
  }
  async function doBackupNow() {
    if (disposed || !hasBackupApi() || pending) return;
    pending = true; setArchiveBusy(true); archiveStatus.textContent = '正在生成完整存档…';
    try {
      const result = await api.createBackup('手动备份');
      if (disposed) return;
      if (result?.ok) { archiveStatus.textContent = result.message || '备份已保存'; renderArchiveList(result.backups); }
      else archiveStatus.textContent = result?.message || '备份失败，请重试';
    } catch { if (!disposed) archiveStatus.textContent = '备份失败，请重试'; }
    finally { pending = false; if (!disposed) { setArchiveBusy(false); lastRefresh = 0; refresh(); } }
  }
  async function doExportSave() {
    if (disposed || pending || typeof api?.exportSave !== 'function') return;
    pending = true; setArchiveBusy(true); archiveStatus.textContent = '正在生成存档文件…';
    try {
      const result = await api.exportSave();
      if (disposed) return;
      if (result?.ok && typeof result.json === 'string') {
        const blob = new win.Blob([result.json], { type: 'application/json' });
        const url = win.URL.createObjectURL(blob);
        const link = doc.createElement('a');
        link.href = url; link.download = `pet-room-save-${new Date().toISOString().slice(0, 10)}.json`;
        doc.body.append(link); link.click(); link.remove();
        win.URL.revokeObjectURL(url);
        archiveStatus.textContent = '存档已导出为 JSON 文件';
      } else archiveStatus.textContent = result?.message || '导出失败，请重试';
    } catch { if (!disposed) archiveStatus.textContent = '导出失败，请重试'; }
    finally { pending = false; if (!disposed) setArchiveBusy(false); }
  }
  async function restoreFromBackup(entry) {
    if (disposed || pending || typeof api?.restoreBackup !== 'function') return;
    pending = true; setArchiveBusy(true); archiveStatus.textContent = '正在恢复备份…';
    try {
      const result = await api.restoreBackup(entry.id);
      if (disposed) return;
      archiveStatus.textContent = result?.ok === true ? (result.message || '备份已恢复，重新挂载房间后生效') : (result?.message || '恢复失败，请重试');
      if (result?.ok === true) renderArchiveList(api.listBackups()?.backups || []);
    } catch { if (!disposed) archiveStatus.textContent = '恢复失败，请重试'; }
    finally { pending = false; if (!disposed) setArchiveBusy(false); }
  }
  async function removeOneBackup(entry) {
    if (disposed || pending || typeof api?.removeBackup !== 'function') return;
    pending = true; setArchiveBusy(true);
    try {
      const result = await api.removeBackup(entry.id);
      if (disposed) return;
      if (result?.ok) { archiveStatus.textContent = '已删除这份备份'; renderArchiveList(result.backups); }
      else archiveStatus.textContent = result?.message || '删除失败，请重试';
    } catch { if (!disposed) archiveStatus.textContent = '删除失败，请重试'; }
    finally { pending = false; if (!disposed) setArchiveBusy(false); }
  }
  async function importFromFile(file) {
    if (disposed || pending || typeof api?.importSave !== 'function') return;
    if (!file) return;
    pending = true; setArchiveBusy(true); archiveStatus.textContent = '正在读取存档文件…';
    try {
      const json = await file.text();
      if (disposed) return;
      const result = await api.importSave(json);
      if (disposed) return;
      archiveStatus.textContent = result?.ok === true ? (result.message || '存档已写入，重新挂载房间后生效') : (result?.message || '存档文件无效，请确认是导出的 JSON');
    } catch { if (!disposed) archiveStatus.textContent = '存档文件读取失败'; }
    finally { pending = false; if (!disposed) setArchiveBusy(false); }
  }
  backupNow.addEventListener('click', () => void doBackupNow(), listen);
  exportSave.addEventListener('click', () => void doExportSave(), listen);
  importSaveButton.addEventListener('click', () => { if (!pending) importFile.click(); }, listen);
  importFile.addEventListener('change', () => { const file = importFile.files?.[0]; importFile.value = ''; if (file) void importFromFile(file); }, listen);
  archiveUi.hidden = !hasBackupApi();
  parentSettings.hidden = !hasBackupApi();

  function applyProfile(next) {
    // 解锁庆祝由 room 的全场撒花统一触发，主页只同步收藏状态。
    profile = next;
    body.classList.remove('room-profile-loading'); // 数据到位，撤下骨架屏
    const gender = next.gender === 'female' ? 'female' : next.gender === 'male' ? 'male' : 'none';
    for (const button of genderButtons.querySelectorAll('.room-profile-gender')) {
      const active = button.dataset.gender === gender;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (typeof genderHint === 'object' && genderHint) {
      genderHint.hidden = gender !== 'none';
      genderHint.textContent = gender === 'none' ? '选择性别后即可观看勋章外观（男孩·越升越帅 / 女孩·越升越美）' : '';
    }
    if (typeof genderWallHint === 'object' && genderWallHint) {
      genderWallHint.hidden = gender !== 'none';
      genderWallHint.textContent = gender === 'none' ? '选择男孩或女孩，可查看两套独立成就造型。解锁条件和收藏记录保持一致。' : '';
    }
    achievementStyle.textContent=gender==='male'?'星际探险系列 · 每一个成就，都是一件独立藏品':gender==='female'?'晶彩花园系列 · 每一个成就，都有专属造型':'每个里程碑都有独立藏品，与等级勋章分别展示。';
    if (!nameDirty && activeElementFor(root) !== nameInput) nameInput.value = next.name || '';
    const avatarKey = `${gender}:${next.avatar || ''}`;
    if (displayedAvatar !== avatarKey) {
      displayedAvatar = avatarKey; avatarBox.replaceChildren();
      if (next.avatar && validAvatar(next.avatar)) {
        const image = el('img', 'room-profile-avatar-photo', undefined, avatarBox);
        image.alt = '我的头像'; image.src = next.avatar;
        image.addEventListener('error', () => { if (!disposed && displayedAvatar === avatarKey) avatarBox.replaceChildren(foxAvatar(avatarBox, gender)); }, { once: true });
      } else avatarBox.append(foxAvatar(avatarBox, gender));
    }
    clearAvatar.hidden = !next.avatar;
    const tier = badgeTierForLevel(next.level);
    if (levelBadge.dataset.tier !== tier.id || levelBadge.dataset.gender !== gender) {
      hudEmblem.replaceChildren(); badgeEmblem(hudEmblem, tier, 'level', gender);
      levelEmblem.replaceChildren(); badgeEmblem(levelEmblem, tier, 'level', gender);
      levelBadge.dataset.tier = tier.id; levelBadge.dataset.gender = gender;
    }
    const designTitle=badgeProgressionTitle(gender,tier.rank);
    levelBadge.setAttribute('aria-label', `个人主页，${next.name || '我的小屋'}，${next.level || 1} 级，${tier.name}，${designTitle}`);
    levelBadge.title=`${designTitle} · ${tier.name}`;
    tierName.textContent = gender === 'none'
      ? '选择性别后即可观看专属勋章外观（男孩·越帅 / 女孩·越美）'
      : `${designTitle} · ${tier.name} · ${gender === 'female' ? '越升级，越精致漂亮' : '越升级，越帅气酷炫'}`;
    // 性别切换时同步重绘「进阶预览」里每个徽章的专属造型
    const previewGender = tierPreview.dataset.gender;
    if (previewGender !== gender) {
      tierPreview.dataset.gender = gender;
      for (const step of tierPreview.children) {
        const stepTier = BADGE_TIERS.find(item => item.id === step.dataset.tier);
        const span = step.querySelector('span');
        const old = step.querySelector('svg'); if (old) old.remove();
        const art = badgeEmblem(step, stepTier, 'level', gender);
        step.title=`${badgeProgressionTitle(gender,stepTier.rank)} · ${stepTier.minLevel}级起`;
        if (span && art) step.insertBefore(art, span);
      }
    }
    for (const step of tierPreview.children) {
      const stepTier = BADGE_TIERS.find(item => item.id === step.dataset.tier);
      const reached = stepTier.rank <= tier.rank;
      step.classList.toggle('reached', reached); step.classList.toggle('current', step.dataset.tier === tier.id);
      step.querySelector('.room-profile-tier-state').textContent = reached ? '已点亮' : '未解锁';
      step.setAttribute('aria-label', `${badgeProgressionTitle(gender,stepTier.rank)}，${stepTier.minLevel}级解锁，${reached ? '已点亮，查看获得时间' : '未解锁预览'}`);
    }
    if(selectedLevelTier)showLevelBadgeDetail(selectedLevelTier,{scroll:false});
    const nextTier = BADGE_TIERS.find(item => item.rank > tier.rank);
    unlockGoal.hidden = !nextTier;
    if (nextTier) {
      const artKey = `${gender}:${nextTier.id}`;
      if (unlockArt.dataset.key !== artKey) { unlockArt.replaceChildren(); badgeEmblem(unlockArt, nextTier, 'level', gender); unlockArt.dataset.key = artKey; }
      const targetXp = xpForLevel(nextTier.minLevel), startXp = xpForLevel(tier.minLevel);
      const currentXp = Math.max(startXp, Number.isFinite(next.xp) ? next.xp : xpForLevel(next.level) + number(next.levelInfo?.intoLevel));
      const progress = Math.max(0, Math.min(1, (currentXp - startXp) / Math.max(1, targetXp - startXp)));
      unlockTitle.textContent = `${badgeProgressionTitle(gender,nextTier.rank)} · ${nextTier.minLevel}级解锁`;
      unlockText.textContent = `还差 ${format(Math.max(0, targetXp - currentXp))} 经验。学习与签到积累经验，达标后自动点亮。`;
      unlockFill.style.width = `${Math.round(progress * 100)}%`;
      unlockTrack.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      unlockTrack.setAttribute('aria-label', `距离${nextTier.name}，已完成${Math.round(progress * 100)}%`);
    }
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
    const weekSignature = JSON.stringify(statsData.weekly || null);
    if (weeklySignature !== weekSignature) {
      weeklySignature = weekSignature; weekly.textContent = ''; weekly.hidden = !weekDays.length;
      if (weekDays.length) {
        el('span', 'room-profile-weekly-label', `近 7 天签到 ${number(statsData.weekly?.checkedDays)} / 7`, weekly);
        const row = el('div', 'room-profile-weekly-days', null, weekly);
        for (const item of weekDays) {
          const dot = el('span', `room-profile-weekly-day${item.checked ? ' checked' : ''}`, String(item.date).slice(8), row);
          dot.title = `${item.date}${item.checked ? ' · 已签到' : ' · 未签到'}`;
          dot.setAttribute('aria-label', dot.title);
        }
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
    updateHudState();
    updateIdentityButtons();
  }
  function renderCheckin() {
    const today = profile?.todayReward, tomorrow = profile?.tomorrowReward;
    checkinButton.disabled = Boolean(profile?.todayChecked) || pending;
    if (profile?.todayChecked) {
      checkinPreview.textContent = '今天已经签到啦，明天继续～';
      checkinButton.textContent = '今日已签到';
      checkinTomorrow.textContent = '';
    } else {
      checkinPreview.textContent = today ? `签到可得 经验 +${today.exp} · ${label} +${today.points}` : '今天还没有签到。';
      checkinButton.textContent = '签到';
      checkinTomorrow.textContent = tomorrow ? `明天连续 ${tomorrow.day} 天：经验 +${tomorrow.exp} · ${label} +${tomorrow.points}` : '';
    }
    // 补签卡：额度未满、余额足够、且“昨天”确实存在断签缺口时才显示；
    // 昨天已在签到记录里（正常连签）时不显示，避免点了才发现没缺口（后端也已加 unchanged 守卫不扣费）。
    const makeup = profile?.makeups || { count: 0 };
    const yesterday = previousDay(anchorToday());
    const yesterdaySigned = (profile?.checkInDates || []).includes(yesterday);
    const canMakeup = !yesterdaySigned && makeup.count < 3 && number(profile?.balance) >= number(profile?.makeupCost || 100);
    makeupButton.hidden = !canMakeup;
    makeupButton.disabled = pending;
    makeupButton.textContent = `补签昨天（${number(profile?.makeupCost || 100)} ${label}，本月 ${3 - number(makeup.count)} 次）`;
  }
  function renderCalendar(next) {
    const signature = JSON.stringify([next, anchorToday()]);
    if (signature === calendarSignature) return;
    calendarSignature = signature;
    calendar.textContent = '';
    if (!next) return;
    calTitle.textContent = `${next.year} 年 ${next.month} 月`;
    const showing = `${next.year}-${String(next.month).padStart(2, '0')}`;
    // 「下月」只能翻到当月为止：与当前月（anchorToday）比较，而不是与 viewMonth 自身比较
    // （后者恒成立，导致翻到上月后「下月」按钮永远禁用、回不到当月）。
    calNext.disabled = showing >= anchorToday().slice(0, 7);
    for (const weekday of ['日', '一', '二', '三', '四', '五', '六']) {
      const head = el('span', 'room-profile-calendar-head', weekday, calendar);
      head.setAttribute('aria-hidden', 'true');
    }
    const firstWeekday = new Date(Date.UTC(next.year, next.month - 1, 1)).getUTCDay();
    for (let index = 0; index < firstWeekday; index++) el('span', 'room-profile-calendar-spacer', '', calendar).setAttribute('aria-hidden', 'true');
    for (const day of next.days) {
      const cell = el('span',
        `room-profile-calendar-day${day.checked ? ' checked' : ''}${day.isToday ? ' today' : ''}`,
        null, calendar);
      el('span', 'room-profile-calendar-number', String(day.day), cell);
      if (day.checked) {
        const stamp = el('span', 'room-profile-calendar-stamp', '✓ 已盖章', cell);stamp.setAttribute('aria-hidden', 'true');
        if (calendarStampsReady && !lastStampedDates.has(day.date)) cell.classList.add('just-stamped');
      } else if (day.isToday) {
        cell.dataset.checkinToday = 'true'; cell.setAttribute('role', 'button'); cell.tabIndex = 0;
      }
      cell.title = day.checked ? `${day.date} · 伙伴盖过章啦` : day.isToday ? '点一下，给今天盖个章～' : day.date;
      cell.setAttribute('aria-label', `${day.date}${day.checked ? '，已盖章签到' : ''}${day.isToday ? '，今天' : ''}${day.isToday && !day.checked ? '，点击盖章签到' : ''}`);
    }
    lastStampedDates = new Set(signedDates); calendarStampsReady = true;
  }
  function renderBadges(list) {
    const signature = JSON.stringify([list, profile?.gender, profile?.nextBadgeHint, badgeSearch.value]);
    if (signature === badgeSignature) return;
    const focusedBadge=activeElementFor(root)?.closest?.('[data-profile-badge]');
    const focusedId=focusedBadge&&badgeGrid.contains(focusedBadge)?focusedBadge.dataset.profileBadge:null;
    badgeSignature = signature; badgeDetails.clear();
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
      track.setAttribute('aria-label', `成就进度 ${unlockedCount}/${all.length}`);
      const fill = el('span', 'room-profile-badge-progress-fill', null, track);
      const pct = all.length ? Math.max(0, Math.min(1, unlockedCount / all.length)) : 0;
      fill.style.width = `${(pct * 100).toFixed(1)}%`;
      const nextGoal = profile?.nextBadgeHint;
      const locked = all.find(badge => !badge.unlocked && badge.id === nextGoal?.id) || all.find(badge => !badge.unlocked);
      if (locked) {
        const goal = el('div', 'room-profile-collection-goal', null, progressWrap);
        el('strong', '', `下一件成就 · ${achievementTitle(locked,profile?.gender)} · ${locked.name}`, goal);
        el('span', '', nextGoal?.id === locked.id ? nextGoal.hint : locked.description, goal);
      }
    }
    // 搜索过滤
    const query = String(badgeSearch.value || '').trim().toLowerCase();
    const filtered = query
      ? all.filter(badge => `${badge.name} ${achievementTitle(badge,profile?.gender)} ${badge.description}`.toLowerCase().includes(query))
      : all;
    if (query && !filtered.length) el('div', 'room-profile-badge-empty', '没有匹配的成就', badgeGrid);
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
        cell.dataset.profileBadge = badge.id;
        const mark = el('span', 'room-profile-badge-mark', '', cell);
        const badgeGender = profile?.gender === 'female' ? 'female' : profile?.gender === 'male' ? 'male' : 'none';
        createAchievementEmblem(mark,badge,badgeGender);
        cell.dataset.artKind='achievement';
        mark.setAttribute('aria-hidden', 'true');
        const designTitle=achievementTitle(badge,badgeGender);
        el('div', 'room-profile-badge-name', designTitle, cell);
        el('div', 'room-profile-badge-milestone', badge.name, cell);
        cell.title = `${designTitle} · ${badge.description}${badge.unlocked ? '' : '（未解锁）'}`;
        cell.setAttribute('aria-label',`${designTitle}，${badge.name}，${badge.description}，${badge.unlocked?'已收藏':'未解锁预览'}`);
        el('span', 'room-profile-badge-state', badge.unlocked ? '已收藏' : '未解锁 · 预览', cell);
        el('div', 'room-profile-badge-desc', badge.description, cell);
        const goalHint = !badge.unlocked && profile?.nextBadgeHint?.id === badge.id ? profile.nextBadgeHint.hint : null;
        if (goalHint) el('span', 'room-profile-badge-goal-hint', goalHint, cell);
        const when=acquisitionCaption({acquiredAt:badge.acquiredAt,unlockedAt:badge.unlockedAt,unlocked:badge.unlocked});
        badgeDetails.set(badge.id,{badge,gender:badgeGender,when,text:`${badge.name}（${badge.unlocked ? '已解锁' : '未解锁'}）· ${badge.description}`});
      }
    }
    if(focusedId){const replacement=[...badgeGrid.querySelectorAll('[data-profile-badge]')].find(cell=>cell.dataset.profileBadge===focusedId);(replacement||badgeSearch).focus({preventScroll:true});}
  }
  function updateHudState() {
    levelBadge.classList.toggle('room-profile-level-new', Boolean(profile?.unlocked?.length));
  }
  let lastRefresh = 0;
  function refresh(force = false) {
    if (disposed || pending) return false;
    const now = Date.now();
    if (!force && (refreshing || now - lastRefresh < 500)) return false;
    lastRefresh = now;
    // Polling must not pulse every button's disabled style or replace unchanged
    // calendar nodes. Only actual user operations own the pending state.
    refreshing = true;
    const serial = ++refreshSerial;
    const resolve = result => {
      if (disposed || serial !== refreshSerial) return;
      refreshing = false;
      if (pending) return;
      if (!result || result.ok === false) {
        hudReady = false; const text = result?.message || '主页暂时打不开，请稍后重试。';
        if (checkinResult.textContent !== text) checkinResult.textContent = text;
        body.classList.remove('room-profile-loading');
      } else {
        hudReady = true;
        const next = result.profile || result, signature = JSON.stringify(next);
        if (profileSignature !== signature) { applyProfile(next); profileSignature = signature; }
        // Backups may change independently of profile data; their renderer also
        // keeps unchanged rows intact so focus and scroll position stay put.
        if (opened && !archiveUi.hidden) refreshArchives(true);
      }
    };
    const reject = () => { if (disposed || serial !== refreshSerial) return; refreshing = false; if (!pending) { hudReady = false; const text = '主页暂时打不开，请稍后重试。'; if (checkinResult.textContent !== text) checkinResult.textContent = text; body.classList.remove('room-profile-loading'); } };
    Promise.resolve().then(() => disposed ? null : api.getProfile()).then(resolve).catch(reject);
    return true;
  }
  function open() {
    if (disposed || opened) return;
    opened = true; returnFocus = activeElementFor(root);
    if (!profile) body.classList.add('room-profile-loading');
    refresh(true);
    panel.hidden = false;
    openFrame = win.requestAnimationFrame(() => { openFrame = 0; if (!disposed && opened) panel.classList.add('open'); });
    try { panel.focus({ preventScroll: true }); } catch { /* 面板可聚焦即可，失败不阻断 */ }
  }
  function close(returnTo) {
    if (disposed || !opened) return;
    opened = false;
    win.cancelAnimationFrame(openFrame); openFrame = 0;
    panel.classList.remove('open');
    panel.hidden = true;
    if (returnTo && returnFocus?.focus) { try { returnFocus.focus(); } catch { /* 元素可能已销毁 */ } }
  }
  function pickGender(gender) {
    if (pending || !profile || (profile.gender === gender && !profile.avatar)) return;
    saveIdentity(() => api.setProfileGender(gender));
  }
  function setName() {
    if (pending) return;
    const value = nameInput.value.trim();
    saveIdentity(() => api.setProfileName(value), () => { nameDirty = false; nameInput.value = value; });
  }
  function updateIdentityButtons() {
    saveName.disabled = uploadAvatar.disabled = clearAvatar.disabled = pending;
    for (const button of genderButtons.querySelectorAll('button')) button.disabled = pending;
    hudQuick.disabled = pending; checkinButton.disabled = pending || Boolean(profile?.todayChecked); makeupButton.disabled = pending;
  }
  async function saveIdentity(operation, success) {
    if (pending || disposed) return;
    pending = true; updateIdentityButtons(); identityStatus.textContent = '保存中…';
    try {
      const result = await operation();
      if (disposed) return;
      if (!result || result.ok !== true) identityStatus.textContent = result?.message || '保存失败，请重试';
      else { success?.(); identityStatus.textContent = result?.message || '已保存'; }
    } catch { if (!disposed) identityStatus.textContent = '保存失败，请重试'; }
    finally { pending = false; if (!disposed) { updateIdentityButtons(); lastRefresh = 0; refresh(); } }
  }
  async function uploadPhoto(file) {
    if (pending || disposed) return;
    if (typeof api.setProfileAvatar !== 'function') { identityStatus.textContent = '当前房间尚未接入头像保存'; return; }
    pending = true; updateIdentityButtons(); identityStatus.textContent = '正在裁剪并压缩图片…';
    try {
      const avatar = await prepareAvatar(file, win, { signal: events.signal });
      if (disposed) return;
      const result = await api.setProfileAvatar(avatar);
      if (!disposed) identityStatus.textContent = result?.ok === false ? result.message || '头像保存失败，请重试' : '头像已保存，刷新后也会保留';
    } catch (error) { if (!disposed) identityStatus.textContent = error?.message || '图片处理失败，请换一张图片'; }
    finally { pending = false; if (!disposed) { updateIdentityButtons(); lastRefresh = 0; refresh(); } }
  }
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); setName(); } }, listen);
  let celebrateTimer = 0;
  function celebrate() {
    if (disposed) return;
    checkin.classList.remove('celebrate');
    void checkin.offsetWidth; // 重启动画
    checkin.classList.add('celebrate');
    win.clearTimeout(celebrateTimer);
    celebrateTimer = win.setTimeout(() => { if (!disposed) checkin.classList.remove('celebrate'); }, 380);
  }
  async function doCheckIn(silent) {
    if (disposed || pending || profile?.todayChecked) return;
    pending = true; updateIdentityButtons();
    if (!silent) checkinResult.textContent = '签到中…';
    try {
      const result = await api.checkIn();
      if (disposed) return;
      if (result?.ok && !result.unchanged) {
        const points = result.pointsSettled === false ? '，积分稍后自动到账' : '';
        const badges = result.newBadges ? `，解锁 ${result.newBadges} 枚勋章！` : '';
        const levelUp = result.levelUps?.length ? `，升级到 Lv.${result.levelUps.at(-1)}！` : '';
        const capped = result.capped ? '（已满级，积分照发）' : '';
        if (!silent) checkinResult.textContent = `签到成功：经验 +${result.exp} · ${label} +${result.points}${points}${levelUp}${badges}${capped}`;
        celebrate();
      } else if (result?.unchanged) {
        if (!silent) checkinResult.textContent = '今天已经签到过了';
      } else {
        if (!silent) checkinResult.textContent = result?.message || '签到失败，请稍后再试';
      }
    } catch { if (!disposed && !silent) checkinResult.textContent = '签到失败，请稍后再试'; }
    finally { pending = false; if (!disposed) { updateIdentityButtons(); refresh(true); } }
  }
  // 补签昨天（v2.7/batch1）：走 api.makeUpCheckIn，出错/成功都回显在签到结果行。
  async function doMakeUp() {
    if (disposed || pending) return;
    pending = true; updateIdentityButtons();
    checkinResult.textContent = '补签中…';
    try {
      const result = await api.makeUpCheckIn();
      if (disposed) return;
      if (result?.ok && !result.unchanged) {
        // 扣费失败时后端消息已含「积分暂未扣除（code）」说明，前端不再拼接误导性的“自动补扣”。
        const cost = result.pointsApplied === false ? '' : `，已扣 ${result.cost} ${label}`;
        checkinResult.textContent = `${result.message}${cost}${result.stretched ? '，连续天数接上了！' : ''}`;
        celebrate();
      } else if (result?.unchanged) {
        checkinResult.textContent = result?.message || '昨天已经在签到记录里了';
      } else {
        checkinResult.textContent = result?.message || '补签失败，请稍后再试';
      }
    } catch { if (!disposed) checkinResult.textContent = '补签失败，请稍后再试'; }
    finally { pending = false; if (!disposed) { updateIdentityButtons(); refresh(true); } }
  }
  hudQuick.addEventListener('click', () => doCheckIn(true), listen);
  levelBadge.addEventListener('click', () => (opened ? close(true) : open()), listen);
  panel.addEventListener('click', event => { if (event.target === panel) close(false); }, listen);
  doc.addEventListener('keydown', event => {
    if (!opened || disposed || !(panel.contains(activeElementFor(root)) || hud.contains(activeElementFor(root)))) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
  }, listen);

  return {
    open, close,
    update(roomState) { // bootstrap 的 onState 调用
      const state = roomState && typeof roomState === 'object' ? roomState : {};
      const ready = state.ready === true || state.lifecycle === 'ready' || state.petState === 'ready';
      if (ready) levelBadge.disabled = false;
      // 房间就绪后拉一次主页数据，让 HUD 快捷签到立即可用（面板未开也能判断今日是否已签）。
      if (ready && !hudReady && !disposed) hudReady = refresh() || hudReady;
      if (opened) refresh();
    },
    dispose() {
      if (disposed) return; disposed = true; events.abort();themeBinding.dispose();
      win.cancelAnimationFrame(openFrame); openFrame = 0;
      win.clearTimeout(celebrateTimer); badgeDetails.clear();
      panel.remove(); hud.remove();
    },
  };
}
