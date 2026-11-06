import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Vector3 } from '../vendor/three/three.module.js';
import { FURNITURE, COLLIDERS, SOFA, ROOM, PLACEMENT_BOUNDS } from '../layout.js';
import { createLayoutManager } from '../layout-manager.js';
import { FLOOR_POT } from '../decor.js';

const copy = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const navigationBounds = { minX: -3.80, maxX: 3.27, minZ: -3.48, maxZ: 3.55 };
const DECOR_POSITIONS = {
  'lamp-cabinet':[-2.37,0,-2.45], 'plant-shelf':[-3.67,0,-2.54],
  'ottoman-a':[-3.10,0,2.53], 'ottoman-b':[-1.65,0,3],
  'front-fence':[3.76,0,1.35], rug:[.32,.047,-.03], 'floor-pot':[1.85,0,1.60],
  'wall-pictures':[0,0,0],
};
function fixture({ storageAdapter } = {}) {
  const scene = new Scene(), furniture = new Map();
  for (const id of Object.keys(COLLIDERS)) {
    const config = FURNITURE[id], root = new Group(); root.name = id;
    root.position.fromArray(config?.position ?? DECOR_POSITIONS[id]);
    root.rotation.fromArray(config?.rotation ?? [0, 0, 0]); root.scale.setScalar(config?.scale ?? 1);
    scene.add(root); furniture.set(id, root);
  }
  const pet = { x: .65, z: 2.83 };
  const manager = createLayoutManager({
    furniture, definitions: COLLIDERS, roomBounds: PLACEMENT_BOUNDS, navigationBounds: navBounds,
    petHeight: ROOM.petHeight, storageAdapter,
    getPet: () => pet, getApproach: () => furniture.get('sofa').localToWorld(new Vector3(...SOFA.approach)),
    afterUpdate: () => scene.updateMatrixWorld(true),
  });
  return { manager, furniture, scene, pet };
}
const navBounds = navigationBounds;
function withStorage(action) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) } });
  try { action(data); } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
}

test('v2.8: floor-pot 已登记为可编辑家具（draggable，不挡导航）', () => {
  const d = COLLIDERS['floor-pot'];
  assert.ok(d, 'COLLIDERS 应包含 floor-pot');
  assert.equal(d.draggable, true);
  assert.equal(d.blocksNavigation, false, '花盆是低矮摆设，不应挡宠物行走');
  const { manager } = fixture();
  assert.equal(manager.validate().valid, true); // 加入碰撞后默认布局仍有效
  assert.ok(manager.definitions['floor-pot']);
  assert.ok(!manager.obstacles.some(box => box.id === 'floor-pot'), '花盆不进导航障碍');
});

test('v2.8: floor-pot 可移动并可绕 Y 轴旋转，提交后快照保留变换', () => {
  const { manager } = fixture();
  const before = manager.snapshot();
  assert.equal(manager.previewTransform('floor-pot', { position: [2.40, 0, 0.90] }), true);
  near(manager.snapshot().furniture['floor-pot'].position[0], 2.40);
  assert.equal(manager.previewTransform('floor-pot', { rotation: [0, Math.PI / 2, 0] }), true);
  near(manager.snapshot().furniture['floor-pot'].rotation[1], Math.PI / 2);
  assert.equal(manager.commit(before), true); // 移动+旋转后的布局可落库
  assert.equal(manager.validate().valid, true);
});

test('v2.8: 花盆归位后恢复默认位置且布局有效（可拖回原处）', () => {
  const { manager } = fixture();
  const before = manager.snapshot();
  assert.equal(manager.previewTransform('floor-pot', { position: FLOOR_POT.position, rotation: [0, 0, 0] }), true);
  near(manager.snapshot().furniture['floor-pot'].position[0], FLOOR_POT.position[0]);
  assert.equal(manager.commit(before), true);
});

test('v2.8: 旧版存档缺 floor-pot 时用默认补齐，保留其余家具布局', () => withStorage(data => {
  const first = fixture();
  // 移动一下沙发并保存（模拟用户已有旧布局）
  const before = first.manager.snapshot();
  assert.equal(first.manager.previewTransform('sofa', { position: [1.30, 0, -2.28] }), true);
  assert.equal(first.manager.commit(before), true);
  assert.equal(first.manager.persist(), true);
  const saved = first.manager.snapshot();
  assert.ok(Object.hasOwn(saved.furniture, 'floor-pot'));
  // 造一个“旧版存档”：删掉 floor-pot（升级前保存的布局）
  const legacy = copy(saved);
  delete legacy.furniture['floor-pot'];
  delete legacy.definitions['floor-pot'];
  assert.equal(Object.keys(legacy.furniture).length + 1, Object.keys(COLLIDERS).length);
  data.set(first.manager.storageKey, JSON.stringify(legacy));
  const loaded = fixture();
  assert.equal(loaded.manager.loadSaved(), true); // 兼容：不被整体拒绝
  const next = loaded.manager.snapshot();
  // 沙发位置保留，floor-pot 用默认补齐
  near(next.furniture.sofa.position[0], 1.30);
  assert.deepEqual(next.furniture['floor-pot'].position, FLOOR_POT.position);
  assert.ok(next.definitions['floor-pot']);
}));

test('v2.8: 动态注册的家具缺失仍严格拒绝（购买回滚语义不受放宽影响）', () => {
  const { manager, furniture, scene } = fixture();
  const before = manager.snapshot();
  const root = new Group(); root.name = 'shop-clover-planter'; root.position.set(2.4, 0, 2.6);
  scene.add(root); furniture.set(root.name, root);
  assert.equal(manager.registerFurniture('shop-clover-planter', root, { label: '测试盆栽', boxes: [{ center: [0, .4, 0], size: [.5, .8, .5] }] }), true);
  // 注册前的旧快照缺新家具 → 仍拒绝（而非用默认悄悄补齐）
  assert.equal(manager.restore(before), false);
  manager.unregisterFurniture('shop-clover-planter');
  assert.equal(manager.restore(before), true);
});

test('v2.8: floor-pot 浇水目标不受移动/旋转影响（fitWater 动态）', async () => {
  const { fitWater, resolveWaterApproach } = await import('../seats.mjs');
  const root = new Group(); root.name = 'floor-pot';
  root.position.fromArray([2.40, 0, 0.90]); root.rotation.y = Math.PI / 2;
  const fitted = fitWater(root, 'floor-pot');
  assert.ok(fitted, '移动+旋转后的花盆仍可浇水');
});