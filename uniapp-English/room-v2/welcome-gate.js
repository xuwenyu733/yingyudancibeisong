/**
 * 欢迎页 / 账号门（浏览器侧 UI，纯 DOM 逻辑）：
 * - 首次进入或会话无效时，先展示全屏欢迎卡片：已有账号登录 / 快速注册 / 访客体验。
 * - 注册仅昵称；访客每次随机 key（不留痕）；登录后写会话，刷新自动续登。
 * 所有账号/会话的"数据决策"都委托给 account-session.mjs（Node 可测），本模块只负责渲染与交互。
 */

import {
  readAccounts, registerAccount,
  loginAccount, loginGuest, resolveStorageKey,
} from './account-session.mjs';
import { exportAccountTransfer, parseTransfer, describeTransfer, restoreTransfer } from './account-migration.mjs';

const FONT = 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';

function el(doc, tag, style, text) {
  const node = doc.createElement(tag);
  if (style) node.style.cssText = style;
  if (text != null) node.textContent = text;
  return node;
}

function button(doc, label, primary) {
  return el(doc, 'button', `display:block;width:100%;margin:10px 0;padding:13px 16px;border:0;border-radius:14px;font:600 16px/${FONT};cursor:pointer;${primary ? 'background:#7bb88a;color:#fff;' : 'background:#fff;color:#436753;border:1px solid #d9cdb0;'}`, label);
}

/**
 * 构建欢迎门。onEnter(storageKey, {kind}) 在用户选择后调用，由 bootstrap 接手挂载小屋。
 * 返回 { root, chooseAccount, startGuest, register, destroy } 以便测试/宿主控制。
 */
export function buildGate({ doc, storage, onEnter }) {
  const root = el(doc, 'div');
  root.style.cssText = `position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#fdf6e3,#f0e6cf);font:14px/${FONT};color:#43523f;`;
  const card = el(doc, 'div');
  card.style.cssText = `width:min(92vw,380px);max-height:88vh;overflow:auto;background:#fffdf6;border-radius:22px;padding:26px 22px;box-shadow:0 18px 50px rgba(90,70,30,.18);`;
  root.append(card);

  function heading(text) { card.append(el(doc, 'h1', `margin:0 0 4px;font:700 22px/${FONT};color:#3c4a37;`, text)); }
  function sub(text) { card.append(el(doc, 'p', `margin:0 0 18px;color:#8a8268;font:14px/${FONT};`, text)); }

  function renderHome() {
    card.replaceChildren();
    heading('欢迎来到萌宠小屋 🏠');
    sub('选一个方式进来吧～');
    const accounts = readAccounts(storage).list;
    if (accounts.length) {
      const label = el(doc, 'p', `margin:0 0 6px;font:600 14px/${FONT};color:#6b6450;`, '已有账号');
      card.append(label);
      for (const acc of accounts.slice(-6).reverse()) {
        const b = button(doc, `🔑 ${acc.name}`, false);
        b.addEventListener('click', () => chooseAccount(acc.id));
        card.append(b);
      }
      // 导出哪个账号，由用户先登录目标账号再导出最直观；这里提供「全部账号导出」选择页。
      const out = button(doc, '⬇️ 导出进度口令', false);
      out.addEventListener('click', renderExportPicker);
      card.append(out);
    }
    const reg = button(doc, '✨ 快速注册（只要昵称）', true);
    reg.addEventListener('click', renderRegister);
    card.append(reg);
    const guest = button(doc, '👀 访客体验（随时重置）', false);
    guest.addEventListener('click', startGuest);
    card.append(guest);
    // 迁移进度（跨设备一致）：导入某台设备导出的口令 → 恢复成同一账号
    const migrate = button(doc, '🔁 迁移进度：用口令换设备接着玩', false);
    migrate.addEventListener('click', renderMigrate);
    card.append(migrate);
  }

  function renderExportPicker() {
    const accounts = readAccounts(storage).list;
    card.replaceChildren();
    heading('导出进度口令');
    sub('选一个账号，复制它的迁移口令。');
    for (const acc of accounts.slice(-8).reverse()) {
      const b = button(doc, `⬇️ ${acc.name}`, false);
      b.addEventListener('click', () => renderExport(acc.id));
      card.append(b);
    }
    const back = button(doc, '返回', false);
    back.addEventListener('click', renderHome);
    card.append(back);
  }

  function renderRegister() {
    card.replaceChildren();
    heading('快速注册');
    sub('填个昵称就好，3 秒进小屋～');
    const input = el(doc, 'input');
    input.type = 'text';
    input.maxLength = 20;
    input.placeholder = '给小屋起个名字（可留空）';
    input.style.cssText = `width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #d9cdb0;border-radius:12px;font:15px/${FONT};margin-bottom:14px;`;
    card.append(input);
    const go = button(doc, '开始 🐾', true);
    go.addEventListener('click', () => register(input.value));
    card.append(go);
    const back = button(doc, '返回', false);
    back.addEventListener('click', renderHome);
    card.append(back);
    try { input.focus(); } catch {}
  }

  function chooseAccount(id) {
    loginAccount(storage, id);
    enter();
  }
  function register(name) {
    const entry = registerAccount(storage, name);
    loginAccount(storage, entry.id);
    enter();
  }
  function startGuest() {
    loginGuest(storage);
    enter();
  }
  function enter() {
    const kind = readAccounts(storage).list.some(a => a.id === resolveStorageKey(storage)) ? 'account' : 'guest';
    const key = resolveStorageKey(storage);
    onEnter?.(key, { kind });
    destroy();
  }
  function destroy() { root.remove(); }

  // —— 迁移进度 ——
  function renderExport(id) {
    const acc = readAccounts(storage).list.find(a => a.id === id);
    if (!acc) { renderHome(); return; }
    card.replaceChildren();
    heading('导出进度口令');
    sub(`这是「${acc.name}」的迁移口令，复制后到另一台设备粘贴即可继续玩。`);
    const text = el(doc, 'textarea');
    text.readOnly = true; text.rows = 6;
    text.style.cssText = `width:100%;box-sizing:border-box;padding:10px;border:1px solid #d9cdb0;border-radius:12px;font:12px/${FONT};resize:vertical;`;
    let transfer = null;
    try { transfer = exportAccountTransfer({ storageAdapter: storage, storageKey: id, id, name: acc.name }); } catch {}
    text.value = transfer || '当前账号还没有可导出的进度';
    card.append(text);
    const copy = button(doc, '复制口令', true);
    copy.addEventListener('click', () => { try { navigator.clipboard?.writeText(text.value); } catch {} });
    card.append(copy);
    const back = button(doc, '返回', false);
    back.addEventListener('click', renderHome);
    card.append(back);
  }
  function renderMigrate() {
    card.replaceChildren();
    heading('迁移进度');
    sub('把另一台设备导出的口令粘贴进来，会恢复成同一个账号继续玩。');
    const input = el(doc, 'textarea');
    input.rows = 6; input.placeholder = '粘贴迁移口令…';
    input.style.cssText = `width:100%;box-sizing:border-box;padding:10px;border:1px solid #d9cdb0;border-radius:12px;font:12px/${FONT};resize:vertical;`;
    card.append(input);
    const hint = el(doc, 'p', `margin:8px 0 0;color:#8a8268;font:12px/${FONT};min-height:1.4em;`, '');
    card.append(hint);
    const go = button(doc, '恢复进度', true);
    go.addEventListener('click', () => {
      const verdict = parseTransfer(input.value);
      if (!verdict.ok) { hint.textContent = `⚠️ ${verdict.message}`; return; }
      const info = describeTransfer(input.value);
      hint.textContent = `将恢复：${verdict.name} · ${info.roomCount} 层小屋 · 等级 ${info.level ?? '?'} · ${info.balance} 积分`;
      const restored = restoreTransfer(input.value, storage, verdict.id, { registerAccount: true, login: true });
      if (!restored.ok) { hint.textContent = `⚠️ ${restored.message}`; return; }
      hint.textContent = '✅ 已恢复，正在进入小屋…';
      setTimeout(() => { try { enter(); } catch {} }, 350);
    });
    card.append(go);
    const back = button(doc, '返回', false);
    back.addEventListener('click', renderHome);
    card.append(back);
  }

  renderHome();

  return { root, chooseAccount, register, startGuest, renderExport, renderMigrate, destroy };
}

/** 判断是否需要展示欢迎门：已有有效账号/访客会话则跳过。 */
export function needsGate(storage) {
  try {
    const raw = storage.getItem('pet-room-session-v1');
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    return !(parsed && (parsed.kind === 'account' || parsed.kind === 'guest'));
  } catch {
    return true;
  }
}
