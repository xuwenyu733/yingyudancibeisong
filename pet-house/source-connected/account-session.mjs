/**
 * 本地账号与会话（纯逻辑，Node 可测）：
 * - 账号索引：在单一 `pet-room-accounts-v1` 键下维护已注册账号列表（id/昵称/创建时间），
 *   id 即各业务模块 storageKey 的前缀（如 `user-xxxx`），改 id 即隔离整个账号存档。
 * - 会话：当前登录态写入 `pet-room-session-v1`（账号 id 或 'guest' + 随机种子）。
 * - 访客：每次进入生成随机 key，天然不持久化 → 重新用访客登录即重置。
 *
 * 该模块只碰传入的 storageAdapter（默认 localStorage），不依赖 window/DOM，
 * 因此可在 Node 中用 memory() 适配器完整测试。
 */

const ACCOUNTS_KEY = 'pet-room-accounts-v1';
const SESSION_KEY = 'pet-room-session-v1';
const GUEST_PREFIX = 'pet-room-guest-';

/** 生成随机账号 id（base36 时间戳 + 随机串，保证唯一且无序）。 */
export function makeAccountId(now = Date.now(), random = Math.random) {
  return `user-${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

/** 生成一个随机访客 key（每次都不同 → 不留痕，重进即重置）。 */
export function makeGuestKey(now = Date.now(), random = Math.random) {
  return `${GUEST_PREFIX}${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

/** 读取账号索引（返回 { list: [{id,name,createdAt}] } 或空）。 */
export function readAccounts(storage) {
  if (!storage) return { list: [] };
  let raw = null;
  try { raw = storage.getItem(ACCOUNTS_KEY); } catch { return { list: [] }; }
  if (!raw) return { list: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.list)) return { list: parsed.list.filter(a => a && typeof a.id === 'string') };
    return { list: [] };
  } catch {
    return { list: [] };
  }
}

function writeAccounts(storage, list) {
  if (!storage) return;
  try { storage.setItem(ACCOUNTS_KEY, JSON.stringify({ list })); } catch { /* 配额或不可用：注册失败由调用方处理 */ }
}

/** 注册一个账号（仅昵称，可空）。返回 { id, name, createdAt } 并写入索引。 */
export function registerAccount(storage, name, now = Date.now(), random = Math.random) {
  const clean = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 20) : '小屋主人';
  const entry = { id: makeAccountId(now, random), name: clean, createdAt: new Date(now).toISOString() };
  const { list } = readAccounts(storage);
  list.push(entry);
  writeAccounts(storage, list);
  return entry;
}

/**
 * 按指定 id 注册账号（跨设备迁移恢复用）：
 * 若索引中已存在该 id（例如换到新设备后首次导入），则复用原条目、不改创建时间；
 * 否则新建。返回 { id, name, createdAt }。
 */
export function registerAccountWithId(storage, id, name, now = Date.now()) {
  if (typeof id !== 'string' || !/^user-[a-z0-9]+-[a-z0-9]+$/.test(id)) return null;
  const clean = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 20) : '小屋主人';
  const { list } = readAccounts(storage);
  const existing = list.find(a => a.id === id);
  if (existing) { existing.name = clean; writeAccounts(storage, list); return existing; }
  const entry = { id, name: clean, createdAt: new Date(now).toISOString() };
  list.push(entry);
  writeAccounts(storage, list);
  return entry;
}

/** 账号是否已在索引中。 */
export function hasAccount(storage, id) {
  return readAccounts(storage).list.some(a => a.id === id);
}

/** 删除账号（同时从索引移除；业务存档键由调用方用 listAccounts 后逐项清理）。 */
export function deleteAccount(storage, id) {
  const { list } = readAccounts(storage);
  const next = list.filter(a => a.id !== id);
  writeAccounts(storage, next);
  return list.length !== next.length;
}

/** 重命名账号（仅昵称）。 */
export function renameAccount(storage, id, name) {
  const { list } = readAccounts(storage);
  const target = list.find(a => a.id === id);
  if (!target) return false;
  target.name = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 20) : target.name;
  writeAccounts(storage, list);
  return true;
}

/** 读取当前会话：{ kind:'account'|'guest'|'none', id }。 */
export function readSession(storage) {
  if (!storage) return { kind: 'none', id: null };
  let raw = null;
  try { raw = storage.getItem(SESSION_KEY); } catch { return { kind: 'none', id: null }; }
  if (!raw) return { kind: 'none', id: null };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'account' && typeof parsed.id === 'string') return { kind: 'account', id: parsed.id };
    if (parsed?.kind === 'guest') return { kind: 'guest', id: makeGuestKey() }; // 访客不持久化，重进即新身份
    return { kind: 'none', id: null };
  } catch {
    return { kind: 'none', id: null };
  }
}

function writeSession(storage, session) {
  if (!storage) return;
  try { storage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* 忽略 */ }
}

/** 登录已有账号（写入会话）。 */
export function loginAccount(storage, id) {
  writeSession(storage, { kind: 'account', id });
  return { kind: 'account', id };
}

/** 进入访客（写入会话为 guest；实际 storageKey 在 resolveStorageKey 里随机）。 */
export function loginGuest(storage) {
  writeSession(storage, { kind: 'guest', id: null });
  return { kind: 'guest', id: null };
}

/** 退出登录（清会话）。 */
export function logout(storage) {
  if (!storage) return;
  try { storage.removeItem(SESSION_KEY); } catch { /* 忽略 */ }
}

/**
 * 把"会话"解析成最终传给 mountPetHouse 的 storageKey：
 * - 已登录账号 → 其 id（业务模块会派生 -account-v1 等键，整账号隔离）
 * - 访客 → 每调用一次都随机（不留痕，重进重置）
 * - 无会话 → 也当访客处理（随机 key），保证永远能进房
 */
export function resolveStorageKey(storage, now = Date.now(), random = Math.random) {
  const session = readSession(storage);
  if (session.kind === 'account' && session.id) return session.id;
  return makeGuestKey(now, random);
}
