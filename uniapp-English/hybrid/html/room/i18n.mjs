/** 轻量 i18n（v2.7/batch1）：
 * 文案抽离 + 简中/英文语言包的结构已就位；`t(key, lang)` 取不到文案时
 * 回退英文包 → key 本身，保证接入方缺翻译也不白屏。
 * 纯函数、Node 可测。逐步把面板文案迁到 MESSAGES 即可增量完成全量国际化的「结构」。
 */
export const LOCALES = Object.freeze(['zh-CN', 'en']);

export const MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'hud.wallet': '体验积分',
    'hud.shop': '商店',
    'hud.profile': '我的主页',
    'profile.title': '我的主页',
    'profile.close': '关闭',
    'checkin.button': '签到',
    'checkin.done': '今日已签到',
    'badge.title': '勋章墙',
    'badge.unlocked': '已解锁',
    'badge.locked': '未解锁',
    'shop.title': '商店',
    'shop.balance': '体验积分',
    'shop.owned': '已拥有',
    'level.label': '等级',
    'points.label': '积分',
    'makeup.title': '补签',
    'makeup.price': '补签昨天需 100 积分',
    'makeup.limit': '本月还可补签 {n} 次',
    'storage.warn': '存档占用已接近上限，请导出备份',
    'theme.night': '夜间模式',
    'theme.day': '日间模式',
    'confirm.cancel': '取消',
    'confirm.ok': '确定',
  }),
  en: Object.freeze({
    'hud.wallet': 'Points',
    'hud.shop': 'Shop',
    'hud.profile': 'Profile',
    'profile.title': 'My Profile',
    'profile.close': 'Close',
    'checkin.button': 'Check in',
    'checkin.done': 'Checked in today',
    'badge.title': 'Badges',
    'badge.unlocked': 'Unlocked',
    'badge.locked': 'Locked',
    'shop.title': 'Shop',
    'shop.balance': 'Points',
    'shop.owned': 'Owned',
    'level.label': 'Level',
    'points.label': 'Points',
    'makeup.title': 'Make up',
    'makeup.price': 'Make up yesterday for 100 points',
    'makeup.limit': '{n} makeups left this month',
    'storage.warn': 'Storage near full, please export a backup',
    'theme.night': 'Night mode',
    'theme.day': 'Day mode',
    'confirm.cancel': 'Cancel',
    'confirm.ok': 'OK',
  }),
});

/** 取文案。lang 缺省 zh-CN；支持 {n} 占位符替换。 */
export function t(key, lang = 'zh-CN', vars = null) {
  const locale = LOCALES.includes(lang) ? lang : 'zh-CN';
  let text = MESSAGES[locale]?.[key];
  if (text === undefined) text = MESSAGES.en?.[key];
  if (text === undefined) return key;
  if (vars && typeof vars === 'object') {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function supported(lang) { return LOCALES.includes(lang); }