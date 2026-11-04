/**
 * 购买家具的候选落点排序（纯逻辑，可在 Node 中测试）。
 * 原来的“从近到远、从左到右”贪心会把新家具摆到过道/视线中央；
 * 这里按“靠近墙壁优先”排序：候选点不变、可放置集合不变，只调整尝试顺序，
 * 让新家具更自然贴墙，同时仍然避开已有家具（由 layoutManager 校验）。
 */
export function placementOrder(bounds, options = {}) {
  // 兼容两种调用：placementOrder(bounds, .65) 与 placementOrder(bounds, {step:.65, margin:0})
  const { step = .65, margin = 0 } = Number.isFinite(options) ? { step: options } : options;
  const points = [];
  if (!bounds || !Number.isFinite(step) || step <= 0 || !Number.isFinite(margin) || margin < 0) return points;
  const keys = ['minX', 'maxX', 'minZ', 'maxZ'];
  if (!keys.every(key => Number.isFinite(bounds[key])) || bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) return points;
  for (let z = bounds.minZ + step; z <= bounds.maxZ - step + 1e-9; z += step) {
    for (let x = bounds.minX + step; x <= bounds.maxX - step + 1e-9; x += step) {
      points.push([x, z]);
    }
  }
  const wallDistance = ([x, z]) => Math.min(
    x - (bounds.minX + margin), (bounds.maxX - margin) - x,
    z - (bounds.minZ + margin), (bounds.maxZ - margin) - z,
  );
  points.sort((a, b) => wallDistance(a) - wallDistance(b));
  return points;
}
