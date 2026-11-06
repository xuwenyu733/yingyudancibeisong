/**
 * 可坐家具配置与座面换算（纯逻辑，可在 Node 中测试）。
 * 所有数值都在家具“自身局部坐标”中定义：位置/旋转/缩放由 root.matrixWorld 统一换算。
 * sofa 的座面是曲面，由 room.js 的射线标定（resolveSeat），这里只提供寻路落点与朝向；
 * 软凳是平面顶面，直接用 cushionLocal 取顶面中心。
 */
import { Box3,Vector3 } from './vendor/three/three.module.js';
import {createPath} from './navigation.mjs';

export const SEATS = Object.freeze({
  sofa: Object.freeze({
    approach: [.58, 0, 0],       // 沙发前方安全落点（模型空间）
    facing: [1, 0, 0],          // 坐姿朝向量（局部）
  }),
  'ottoman-a': Object.freeze({
    cushionLocal: [0, .73, 0],  // 座垫顶面（局部）
    approach: [0, 0, 1.02],     // 落点须越过“碰撞盒半深 + 宠物半径”的膨胀边界
    facing: [0, 0, -1],         // 面朝房间前方
  }),
  'ottoman-b': Object.freeze({
    cushionLocal: [0, .73, 0],
    approach: [0, 0, 1.02],
    facing: [0, 0, -1],
  }),
});

export function fitSeat(root, id) {
  if (!root?.isObject3D || !SEATS[id]) return null;
  root.updateMatrixWorld(true);
  const def = SEATS[id];
  const result = {};
  if (def.cushionLocal) result.seatWorld = root.localToWorld(new Vector3(...def.cushionLocal));
  result.approachWorld = root.localToWorld(new Vector3(...def.approach));
  result.approachWorld.y = .09;
  const facing = new Vector3(...def.facing).transformDirection(root.matrixWorld);
  result.seatYaw = Math.atan2(facing.x, facing.z);
  return result;
}

/**
 * 可浇水目标（花盆）。floor-pot 是房间自带的盆栽；shop-clover-planter 是商店购买后可摆放的四叶草盆栽。
 * 与座位一样用“局部 approach/facing”：落点与朝向随家具矩阵自动换算，商店盆栽被拖动/旋转后依然正确。
 */
export const WATER_TARGETS = Object.freeze({
  'floor-pot': Object.freeze({ approach: [0, 0, .50], facing: [0, 0, -1] }),
  'shop-clover-planter': Object.freeze({ approach: [0, 0, .62], facing: [0, 0, -1] }),
});

/** 浇水面朝盆栽的站立点与朝向（世界坐标）。 */
export function fitWater(root, id) {
  if (!root?.isObject3D || !WATER_TARGETS[id]) return null;
  root.updateMatrixWorld(true);
  const approachWorld = root.localToWorld(new Vector3(...WATER_TARGETS[id].approach));
  approachWorld.y = .09;
  const facing = new Vector3(...WATER_TARGETS[id].facing).transformDirection(root.matrixWorld);
  return { approachWorld, facingYaw: Math.atan2(facing.x, facing.z) };
}

/**
 * 返回世界空间可达的安全落点。obstacles 必须是已经膨胀过角色半径的导航 AABB，
 * 不会再次膨胀；因此旋转、小比例家具和靠墙布局都遵循实际寻路边界。
 * 有 from 时验证完整路径；省略 from 时仅筛选可用落点，供布局检查先获取候选。
 * 座位与浇水目标共用这套候选逻辑（fitted 由 fitSeat/fitWater 提供）。
 */
function resolveApproach(root, id, fitted, {obstacles=[],bounds,from,petRadius=.48}={}) {
  if(!root?.isObject3D||!fitted||!Array.isArray(obstacles)||!Number.isFinite(petRadius)||petRadius<0)return null;
  const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
  const rectValid=r=>r&&['minX','maxX','minZ','maxZ'].every(key=>Number.isFinite(r[key]))&&r.minX<=r.maxX&&r.minZ<=r.maxZ;
  if(!rectValid(bounds)||!obstacles.every(rectValid)||(from!==undefined&&!finitePoint(from)))return null;
  root.updateWorldMatrix(true,false);
  const preferred=fitted.approachWorld;
  const inside=(p,rect)=>p.x>=rect.minX-1e-9&&p.x<=rect.maxX+1e-9&&p.z>=rect.minZ-1e-9&&p.z<=rect.maxZ+1e-9;
  const candidates=[],seen=new Set();
  function add(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))return;const key=`${x.toFixed(6)}:${z.toFixed(6)}`;if(!seen.has(key)){seen.add(key);candidates.push(new Vector3(x,.09,z));}}
  const reachable=p=>inside(p,bounds)&&!obstacles.some(rect=>inside(p,rect))&&createPath(from??p,p,{bounds,obstacles,cellSize:.18})!==null;
  // 保留原方向及现有默认布置行为；只在它不安全/不可达时改选入口。
  if(reachable(preferred))return preferred;
  const own=obstacles.filter(rect=>rect.id===id||(typeof root.userData.furnitureId==='string'&&rect.id===root.userData.furnitureId));
  let footprint;
  if(own.length)footprint={minX:Math.min(...own.map(r=>r.minX)),maxX:Math.max(...own.map(r=>r.maxX)),minZ:Math.min(...own.map(r=>r.minZ)),maxZ:Math.max(...own.map(r=>r.maxZ))};
  else {
    const box=new Box3().setFromObject(root);
    if(box.isEmpty())return null;
    footprint={minX:box.min.x-petRadius,maxX:box.max.x+petRadius,minZ:box.min.z-petRadius,maxZ:box.max.z+petRadius};
  }
  const cx=(footprint.minX+footprint.maxX)/2,cz=(footprint.minZ+footprint.maxZ)/2;
  const margin=.06;
  add(cx,footprint.maxZ+margin);add(cx,footprint.minZ-margin);
  add(footprint.maxX+margin,cz);add(footprint.minX-margin,cz);
  for(const x of [footprint.minX-margin,footprint.maxX+margin])for(const z of [footprint.minZ-margin,footprint.maxZ+margin])add(x,z);
  // 旋转45°等情形优先保留原家具前侧，从该方向沿世界AABB射线延长到盒外。
  const dx=preferred.x-cx,dz=preferred.z-cz,length=Math.hypot(dx,dz);
  if(length>1e-8) {
    const ux=dx/length,uz=dz/length;
    const tx=Math.abs(ux)>1e-9?(ux>0?footprint.maxX-cx:footprint.minX-cx)/ux:Infinity;
    const tz=Math.abs(uz)>1e-9?(uz>0?footprint.maxZ-cz:footprint.minZ-cz)/uz:Infinity;
    const distance=Math.min(tx,tz)+margin;add(cx+ux*distance,cz+uz*distance);
  }
  const score=p=>(from?Math.hypot(p.x-from.x,p.z-from.z):0)+.15*Math.hypot(p.x-preferred.x,p.z-preferred.z);
  candidates.sort((a,b)=>score(a)-score(b));
  return candidates.find(reachable)??null;
}
export function resolveSeatApproach(root,id,options={}) {
  const fitted=fitSeat(root,id);if(!fitted)return null;
  return resolveApproach(root,id,fitted,options);
}
export function resolveWaterApproach(root,id,options={}) {
  const fitted=fitWater(root,id);if(!fitted)return null;
  return resolveApproach(root,id,fitted,options);
}
