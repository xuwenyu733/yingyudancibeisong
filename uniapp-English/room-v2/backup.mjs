/** 存档备份（v2.17/F6）：自动保留最近几次完整存档，支持一键导出/恢复。
 * 纯函数、Node 可测；adapter 至少要有 getItem/setItem/removeItem（与 economy 相同的同步适配器约束）。
 */
import { acquireStorageLock } from './storage.mjs';

export const BACKUP_KEY_SUFFIX = '-backups-v1';
export const MAX_BACKUPS = 3;            // 最多保留最近 3 份
export const MAX_BACKUP_BYTES = 1536 * 1024; // 备份列表总上限 1.5MB，超出丢最旧

const encoder = new TextEncoder();
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const bytes = value => encoder.encode(value).byteLength;

function jsonCopy(input, { maxDepth = 20, maxNodes = 200000 } = {}) {
  const ancestors = new Set(); let nodes = 0;
  function copy(value, depth) {
    if (++nodes > maxNodes || depth > maxDepth) throw new TypeError('备份内容过大或嵌套过深');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!Array.isArray(value) && !plain(value)) throw new TypeError('备份只接受普通 JSON 数据');
    if (ancestors.has(value)) throw new TypeError('备份不能循环引用');
    ancestors.add(value);
    const result = Array.isArray(value) ? [] : {};
    const keys = Array.isArray(value) ? Array.from({ length: value.length }, (_, index) => String(index)) : Object.keys(value);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value')) throw new TypeError('备份不能包含访问器或数组空槽');
      Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value); return result;
  }
  return copy(input, 0);
}

function validEntry(entry) {
  return plain(entry) && typeof entry.id === 'string' && entry.id.length <= 64 &&
    typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at)) &&
    typeof entry.note === 'string' && entry.note.length <= 120 && plain(entry.archive);
}

export function parseBackups(value) {
  if (value === null || value === undefined) return { ok: true, backups: [] };
  let raw;
  try { raw = jsonCopy(typeof value === 'string' ? JSON.parse(value) : value); } catch { return { ok: false, message: '备份列表损坏，已忽略' }; }
  if (!Array.isArray(raw) || raw.length > MAX_BACKUPS + 8) return { ok: false, message: '备份列表损坏，已忽略' };
  const backups = raw.filter(validEntry);
  backups.sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : 0));
  return { ok: true, backups };
}

export function readBackups(adapter, key) {
  if (!adapter || typeof adapter.getItem !== 'function') return { ok: false, backups: [], message: '当前环境无法访问存储' };
  let value = null;
  try { value = adapter.getItem(key); } catch { return { ok: false, backups: [], message: '无法读取备份列表' }; }
  const parsed = parseBackups(value);
  return parsed.ok ? { ok: true, backups: parsed.backups } : { ok: true, backups: [], message: parsed.message };
}

const encodeBackups = backups => JSON.stringify(backups.map(entry => ({ id: entry.id, at: entry.at, note: entry.note, archive: entry.archive })));

export function writeBackups(adapter, key, backups) {
  if (!adapter || typeof adapter.setItem !== 'function') return { ok: false, message: '当前环境无法访问存储' };
  const encoded = encodeBackups(backups);
  if (bytes(encoded) > MAX_BACKUP_BYTES) return { ok: false, message: `备份过大（超过 ${(MAX_BACKUP_BYTES / 1024 / 1024).toFixed(1)}MB），请先导出到本地` };
  try { adapter.setItem(key, encoded); } catch { return { ok: false, message: '备份写入失败' }; }
  return { ok: true, backups: backups.map(entry => ({ id: entry.id, at: entry.at, note: entry.note, archive: entry.archive })) };
}

/** 追加一份备份：新备份放最前，超出 MAX_BACKUPS 时丢弃最旧，总量超限时也丢最旧。 */
export function addBackup({ adapter, key, archive, note = '', now = new Date() }) {
  const current = readBackups(adapter, key);
  if (!current.ok) return current;
  if (!plain(archive)) return { ok: false, message: '备份内容无效' };
  let backups = current.backups;
  const entry = {
    id: `bk-${(now.getTime()).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: now.toISOString(),
    note: String(note).slice(0, 120),
    archive: jsonCopy(archive),
  };
  backups = [entry, ...backups.filter(item => item.id !== entry.id)].slice(0, MAX_BACKUPS);
  while (backups.length > 1 && bytes(encodeBackups(backups)) > MAX_BACKUP_BYTES) backups.pop();
  return writeBackups(adapter, key, backups);
}

export function removeBackup(adapter, key, id) {
  const current = readBackups(adapter, key);
  if (!current.ok) return current;
  const backups = current.backups.filter(entry => entry.id !== id);
  if (backups.length === current.backups.length) return { ok: false, backups: current.backups, message: '没有找到这份备份' };
  return writeBackups(adapter, key, backups);
}

export function findBackup(adapter, key, id) {
  const current = readBackups(adapter, key);
  if (!current.ok) return null;
  return current.backups.find(entry => entry.id === id) || null;
}

/** 备份列表的读取/写入统一走该键；带锁避免多实例并发写同一键。 */
export function backupStorageApply(adapter, key, mutate) {
  const releaseLock = acquireStorageLock(adapter, [key]);
  if (!releaseLock) return { ok: false, message: '另一个实例正在操作备份，请稍后重试' };
  try { return mutate(); } finally { releaseLock(); }
}
