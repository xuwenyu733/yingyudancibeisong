/**
 * 购买家具的候选落点排序（纯逻辑，可在 Node 中测试）。
 * 原来的“从近到远、从左到右”贪心会把新家具摆到过道/视线中央；
 * 默认保留靠墙排序；accessible 模式优先尝试靠前、较易点选的位置。
 * 两种模式的候选集合相同，始终由 layoutManager 校验碰撞和导航。
 */
export function placementOrder(bounds, options = {}) {
  // 兼容两种调用：placementOrder(bounds, .65) 与 placementOrder(bounds, {step:.65, margin:0})
  const { step = .65, margin = 0, accessible = false } = Number.isFinite(options) ? { step: options } : options;
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
  if(accessible){
    const width=Math.max(step,bounds.maxX-bounds.minX),depth=Math.max(step,bounds.maxZ-bounds.minZ),x=(bounds.minX+bounds.maxX)/2,z=(bounds.minZ+bounds.maxZ)/2+depth*.18;
    const score=point=>((point[0]-x)/width)**2+((point[1]-z)/depth)**2;
    points.sort((a,b)=>score(a)-score(b));
  }else points.sort((a, b) => wallDistance(a) - wallDistance(b));
  return points;
}
