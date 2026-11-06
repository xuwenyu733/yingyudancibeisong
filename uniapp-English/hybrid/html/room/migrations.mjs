/** 存档版本迁移框架（v2.7/batch1）：
 * 未来 profile/economy 结构变化时，注册 from→to 迁移函数，
 * parse 阶段读取旧档会先跑迁移再进常规校验，保证升级安全。
 * 纯函数、Node 可测；当前版本 1 暂无历史迁移（框架先就位）。
 */
export const CURRENT_VERSION = 1;

const migrations = new Map(); // key: `${from}->${to}`，value: (state) => newState

/** 注册迁移：从 from 版本迁移一档。fn 返回迁移后的状态（建议返回新对象）。 */
export function registerMigration(from, to, fn) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to !== from + 1) {
    throw new TypeError('迁移只能相邻档位 (to === from + 1)');
  }
  if (typeof fn !== 'function') throw new TypeError('迁移函数必须是函数');
  const key = `${from}->${to}`;
  if (migrations.has(key)) throw new Error(`迁移 ${key} 已注册`);
  migrations.set(key, fn);
  return key;
}

/** 计算从 version 升到 target（缺省当前版本）需要的迁移路径。 */
export function migrationPlan(version, target = CURRENT_VERSION) {
  if (!Number.isInteger(version) || version < 1) return { ok: false, code: 'INVALID_VERSION', message: `不支持的存档版本 ${version}` };
  if (!Number.isInteger(target) || target < version) return { ok: false, code: 'INVALID_VERSION', message: `迁移目标 ${target} 无效` };
  const plan = [];
  for (let from = version; from < target; from += 1) {
    const key = `${from}->${from + 1}`;
    if (!migrations.has(key)) return { ok: false, code: 'NO_MIGRATION', message: `缺少迁移 ${key}，无法升级` };
    plan.push(key);
  }
  return { ok: true, plan };
}

/** 依次执行迁移到 target；任一失败返回 { ok:false }，不修改原对象。 */
export function migrateState(version, state, target = CURRENT_VERSION) {
  const verdict = migrationPlan(version, target);
  if (!verdict.ok) return { ok: false, code: verdict.code, message: verdict.message };
  let current = JSON.parse(JSON.stringify(state));
  const applied = [];
  for (const key of verdict.plan) {
    const [from, to] = key.split('->').map(Number);
    try {
      current = migrations.get(key)(current);
    } catch (error) {
      return { ok: false, code: 'MIGRATION_FAILED', message: `迁移 ${key} 失败：${error instanceof Error ? error.message : String(error)}` };
    }
    applied.push(to);
  }
  return { ok: true, state: current, applied };
}