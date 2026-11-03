/** 存储配额监控（v2.7/batch1）：
 * 估算已用字节数，判断是否接近 localStorage 配额上限并给出预警。
 * 纯函数、Node 可测；默认按浏览器 localStorage 常见 5MB 配额、80% 预警线。
 */
export const DEFAULT_QUOTA = 5 * 1024 * 1024; // 5MB
export const DEFAULT_WARN_RATIO = 0.8;

// 同一 JS 宿主内，不同实例共享适配器时也必须串行写同一键。
// 防止宿主 setItem/订阅回调同步重入另一实例，绕过各实例自己的 busy 检查。
const storageLocks = new WeakMap();
export function acquireStorageLock(adapter, keys) {
  if (adapter === null) return () => {};
  let held = storageLocks.get(adapter);
  if (!held) { held = new Set(); storageLocks.set(adapter, held); }
  const requested = [...new Set(keys)];
  if (requested.some(key => held.has(key))) return null;
  requested.forEach(key => held.add(key));
  let released = false;
  return () => { if (released) return; released = true; requested.forEach(key => held.delete(key)); };
}

const encoder = new TextEncoder();
/** 字符串的 UTF-8 字节数（与 localStorage 存储口径一致的近似值）。 */
export function estimateBytes(value) {
  return typeof value === 'string' ? encoder.encode(value).byteLength : 0;
}

/** 统计多个存储键的占用。adapter 至少要有 getItem。 */
export function usageOf(adapter, keys) {
  const items = [];
  let bytes = 0;
  for (const key of keys) {
    let raw = null;
    try { raw = adapter?.getItem ? adapter.getItem(key) : null; } catch { raw = null; }
    const size = typeof raw === 'string' ? estimateBytes(raw) : 0;
    items.push({ key, bytes: size });
    bytes += size;
  }
  return { bytes, items };
}

/** 生成配额状态：{ used, limit, ratio, warn, level: 'ok'|'warn'|'full' } */
export function quotaStatus(usage, { limit = DEFAULT_QUOTA, warnRatio = DEFAULT_WARN_RATIO } = {}) {
  const used = Number.isFinite(usage?.bytes) ? usage.bytes : 0;
  const cap = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_QUOTA;
  const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
  const level = ratio >= 1 ? 'full' : ratio >= warnRatio ? 'warn' : 'ok';
  return { used, limit: cap, ratio, warn: level !== 'ok', level };
}

/** 按配额占用率给出用户可读提示（中文）。 */
export function quotaMessage(status, { keyLabel = '存档' } = {}) {
  const mb = value => `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (status.level === 'full') return `${keyLabel}已接近上限（${mb(status.used)} / ${mb(status.limit)}），请立即导出备份`;
  if (status.level === 'warn') return `${keyLabel}已用 ${mb(status.used)} / ${mb(status.limit)}（${Math.round(status.ratio * 100)}%），建议导出备份`;
  return null;
}
