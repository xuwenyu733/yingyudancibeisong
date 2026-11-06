/** 成就摆进房间（v2.17/F5）：已解锁成就自动出现在成就墙与展示柜里。
 * 纯函数部分（achievementPlan）Node 可测；DOM/THREE 部分只在浏览器运行。
 * 徽章纹理直接复用 achievement-art 的 SVG 徽章（rasterized 为 data URL 纹理），不伪造素材。
 */
import { BADGES } from './profile.mjs';
import { createAchievementEmblem, achievementTitle } from './achievement-art.mjs';

export const WALL_CAP = 6;   // 成就墙最多挂 6 枚（最新解锁优先）
export const CASE_CAP = 2;   // 展示柜承接墙上放不下的更早成就（最多 2 枚）

/** 把关卡/用色等外部状态剔除：返回 {unlocked:[{id,name,title,description,at}], ...} */
export function achievementPlan({ unlocked = [], badgeUnlockedAt = {}, gender = 'none' } = {}) {
  const ids = Array.isArray(unlocked) ? unlocked : [];
  const byId = new Map(BADGES.map(badge => [badge.id, badge]));
  const now = Date.now();
  const list = ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map((badge, index) => ({
      id: badge.id,
      name: badge.name,
      title: achievementTitle(badge, gender),
      description: badge.description,
      category: badge.category,
      at: badgeUnlockedAt && typeof badgeUnlockedAt[badge.id] === 'string' ? Date.parse(badgeUnlockedAt[badge.id]) : now + index, // 未知时间按目录顺序垫底
    }))
    .sort((a, b) => b.at - a.at); // 最新解锁在前
  const wall = list.slice(0, WALL_CAP);
  const rest = list.slice(WALL_CAP, WALL_CAP + CASE_CAP);
  return { wall, rest, total: list.length };
}

/** 把徽章 SVG 序列化成 data URL（同步生成 URL；纹理加载仍由 THREE 异步完成）。 */
export function emblemDataUrl(doc, badge, gender) {
  if (!doc?.createElement) return null;
  const holder = doc.createElement('span');
  holder.style.display = 'none';
  try { createAchievementEmblem(holder, badge, gender); } catch { return null; }
  const svg = holder.querySelector('svg');
  if (!svg) return null;
  const xml = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

/** 房间里的展示体：成就墙（背墙挂件） + 展示柜（地板展柜）。
 * 不在 layoutManager 注册，因此不可拖动、不参与布局存档；房间切换/解锁时会整体重建。
 */
export function createAchievementDisplays({ scene, THREE, doc, textureLoader, unlocked = [], badgeUnlockedAt = {}, gender = 'none', roomSize = () => ({ width: 8.8, depth: 8.2 }) }) {
  const group = new THREE.Group();
  group.name = 'achievement-displays';
  const textures = new Set();
  const materials = new Set();
  const disposables = [];
  let disposed = false;
  const record = object => {
    object.traverse(node => {
      if (node.geometry) disposables.push(node.geometry);
      if (node.material) {
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) { materials.add(material); if (material.map) textures.add(material.map); }
      }
    });
  };
  const plaque = (texture, { width = 0.52, height = 0.68 } = {}) => {
    const root = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.09, height + 0.09, 0.045), new THREE.MeshLambertMaterial({ color: 0x8a6d3f }));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    art.position.z = 0.035;
    root.add(frame); root.add(art);
    record(root);
    return root;
  };
  const plan = achievementPlan({ unlocked, badgeUnlockedAt, gender });
  const pending = [];
  // 成就墙：背墙两排，左右避开拱窗视野与默认挂画位。
  const slots = [];
  const { width } = roomSize();
  const right = []; for (let x = 3.15; x <= Math.min(width / 2 - 0.8, 5.2); x += 1.05) right.push(x);
  const left = []; for (let x = -Math.min(width / 2 - 0.8, 4.6); x <= -1.9; x += 1.05) left.push(x);
  for (const row of [3.95, 2.7]) {
    for (const x of left) slots.push([x, row]);
    for (const x of right) slots.push([x, row]);
  }
  if (plan.wall.length) {
    const { depth } = roomSize();
    plan.wall.forEach((item, index) => {
      const slot = slots[index] || slots[slots.length - 1] || [3.15, 2.7];
      const url = emblemDataUrl(doc, item, gender);
      if (!url) return;
      const frame = new THREE.Group();
      // 占位画框先立起来，纹理就绪后再贴画芯。
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.77, 0.05), new THREE.MeshLambertMaterial({ color: 0x8a6d3f }));
      box.userData.achievementId = item.id; record(box); frame.add(box);
      frame.position.set(slot[0], slot[1], -depth / 2 + 0.24);
      group.add(frame);
      const load = textureLoader.loadAsync(url).then(texture => {
        if (disposed) { texture.dispose(); return; }
        const art = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.68), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
        art.position.z = 0.035; art.userData.achievementId = item.id; record(art); frame.add(art);
      }).catch(() => { /* 徽章纹理渲染失败时保留空画框 */ });
      pending.push(load);
    });
  }
  // 展示柜：背墙右侧地板上的玻璃展柜，摆着墙上放不下的更早成就。
  if (plan.rest.length) {
    const { depth } = roomSize();
    const cabinet = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x9c7a4f });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 0.5), bodyMat);
    body.position.y = 0.525; record(body); cabinet.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.56), bodyMat);
    top.position.y = 1.1; record(top); cabinet.add(top);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshPhongMaterial({ color: 0xcfe3ea, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
    glass.position.set(0, 0.62, 0.27); record(glass); cabinet.add(glass);
    plan.rest.forEach((item, index) => {
      const url = emblemDataUrl(doc, item, gender);
      if (!url) return;
      const frame = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.64, 0.04), new THREE.MeshLambertMaterial({ color: 0x8a6d3f }));
      box.position.set(index === 0 ? -0.32 : 0.32, 0.62, 0.1); record(box); frame.add(box);
      cabinet.add(frame);
      const load = textureLoader.loadAsync(url).then(texture => {
        if (disposed) { texture.dispose(); return; }
        const art = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.54), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
        art.position.set(index === 0 ? -0.32 : 0.32, 0.62, 0.13); record(art); cabinet.add(art);
      }).catch(() => { /* 空画框 */ });
      pending.push(load);
    });
    cabinet.position.set(Math.min(3.0, width / 2 - 1.4), 0, -depth / 2 + 0.8);
    cabinet.rotation.y = 0;
    group.add(cabinet);
  }
  scene.add(group);
  return {
    group,
    ready: Promise.allSettled(pending).then(() => {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      for (const geometry of disposables) geometry.dispose();
      for (const material of materials) { material.dispose(); }
      for (const texture of textures) texture.dispose();
      materials.clear(); textures.clear(); disposables.length = 0;
    },
  };
}
