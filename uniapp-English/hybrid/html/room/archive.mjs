/** 存档导出/导入（v2.7/batch1）：
 * 把个人主页 + 经济账本打包成一个可下载/可恢复的 JSON 快照。
 * 纯函数、Node 可测；恢复时由调用方用 createProfile/createEconomy 走常规校验入账。
 */
export const ARCHIVE_FORMAT = 1;
export const ARCHIVE_VERSION = '2.8.0';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function exportArchive({ profile, economy, meta = {} } = {}) {
  if (!plain(profile) || !plain(economy)) throw new TypeError('导出需要个人主页与经济账本数据对象');
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    meta: plain(meta) ? meta : {},
    profile: JSON.parse(JSON.stringify(profile)),
    economy: JSON.parse(JSON.stringify(economy)),
  };
}

/**
 * 校验并解包存档。返回 { ok:true, profile, economy, meta }，
 * 或 { ok:false, code, message }（不抛异常，便于 UI 展示）。
 */
export function importArchive(json) {
  let archive;
  try { archive = typeof json === 'string' ? JSON.parse(json) : json; } catch { return fail('ARCHIVE_BROKEN', '存档不是合法 JSON'); }
  if (!plain(archive)) return fail('ARCHIVE_BROKEN', '存档结构无效');
  if (archive.format !== ARCHIVE_FORMAT) return fail('ARCHIVE_VERSION', `存档格式不受支持（期望 format ${ARCHIVE_FORMAT}）`);
  if (!plain(archive.profile) || !plain(archive.economy)) return fail('ARCHIVE_BROKEN', '存档缺少个人主页或经济账本数据');
  const profileRaw = JSON.stringify(archive.profile), economyRaw = JSON.stringify(archive.economy);
  // 基本体积防线（具体字段校验交由 createProfile/createEconomy 的 parse 完成）。
  if (new TextEncoder().encode(profileRaw).byteLength > 262144) return fail('ARCHIVE_BIG', '个人主页数据超出 256KB 上限');
  if (new TextEncoder().encode(economyRaw).byteLength > 1048576) return fail('ARCHIVE_BIG', '经济账本数据超出 1MB 上限');
  return { ok: true, profile: JSON.parse(profileRaw), economy: JSON.parse(economyRaw), meta: plain(archive.meta) ? archive.meta : {} };
}

function fail(code, message) { return { ok: false, code, message }; }