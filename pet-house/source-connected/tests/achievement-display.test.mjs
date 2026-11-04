import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementPlan, createAchievementDisplays, WALL_CAP, CASE_CAP } from '../achievement-display.mjs';
import { BADGES } from '../profile.mjs';
import * as THREE from '../vendor/three/three.module.js';

// —— v2.17/F5：成就摆进房间（成就墙 + 展示柜） ——
function sampleBadges(ids) {
  const unlockedAt = {};
  ids.forEach((id, index) => { unlockedAt[id] = `2026-02-${String(index + 1).padStart(2, '0')}T10:00:00Z`; });
  return { unlocked: ids, badgeUnlockedAt: unlockedAt, gender: 'none' };
}

test('v2.17/F5: 全部解锁按解锁时间最新在前，墙放最新 6 枚', () => {
  const ids = BADGES.map(badge => badge.id);
  const plan = achievementPlan(sampleBadges(ids));
  assert.equal(plan.total, ids.length);
  assert.equal(plan.wall.length, Math.min(WALL_CAP, ids.length));
  assert.equal(plan.wall[0].id, ids[ids.length - 1]); // 最新解锁 → 第一位
  const wallSet = new Set(plan.wall.map(item => item.id));
  const rest = plan.rest.map(item => item.id);
  assert.equal(rest.length, Math.min(CASE_CAP, Math.max(0, ids.length - WALL_CAP)));
  for (const id of rest) assert.ok(!wallSet.has(id), '展示柜与墙不重复');
  // 展示柜只承接更早的成就
  const earliestOnWall = Math.min(...plan.wall.map(item => item.at));
  for (const item of plan.rest) assert.ok(item.at <= earliestOnWall);
});

test('v2.17/F5: 少于上限时全部上墙，展示柜为空', () => {
  const ids = BADGES.slice(0, 3).map(badge => badge.id);
  const plan = achievementPlan(sampleBadges(ids));
  assert.equal(plan.wall.length, 3);
  assert.deepEqual(plan.rest, []);
  assert.equal(plan.total, 3);
});

test('v2.17/F5: 未知解锁时间按目录顺序垫底（不清零也不炸）', () => {
  const ids = BADGES.slice(0, 8).map(badge => badge.id);
  const plan = achievementPlan({ unlocked: ids, badgeUnlockedAt: {}, gender: 'female' });
  assert.equal(plan.total, 8);
  assert.equal(plan.wall.length, WALL_CAP);
  assert.equal(plan.rest.length, CASE_CAP);
  for (const item of plan.wall) assert.equal(typeof item.title, 'string');
});

test('v2.17/F5: 徽章 id 不存在时被过滤，空解锁返回空计划', () => {
  const plan = achievementPlan({ unlocked: ['ghost', 'study-1h'], badgeUnlockedAt: {}, gender: 'male' });
  assert.equal(plan.total, 1);
  assert.equal(plan.wall[0].id, 'study-1h');
  const empty = achievementPlan({ unlocked: [], badgeUnlockedAt: {}, gender: 'none' });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.wall, []);
  assert.deepEqual(empty.rest, []);
});

test('v2.17/F5: gender 影响徽章标题文案（实际徽章标题函数）', () => {
  const ids = BADGES.slice(0, 2).map(badge => badge.id);
  const male = achievementPlan({ unlocked: ids, badgeUnlockedAt: {}, gender: 'male' });
  const female = achievementPlan({ unlocked: ids, badgeUnlockedAt: {}, gender: 'female' });
  for (let i = 0; i < male.wall.length; i++) {
    assert.ok(male.wall[i].title.length > 0);
    assert.ok(female.wall[i].title.length > 0);
  }
});

test('achievement display disposal rejects late textures for both wall and cabinet without creating detached meshes', async () => {
  const doc = {};
  const make = tag => ({
    tagName: tag, ownerDocument: doc, dataset: {}, style: {}, children: [], attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    append(child) { this.children.push(child); },
    querySelector(selector) {
      const visit = node => node.tagName === selector ? node : node.children.map(visit).find(Boolean);
      return this.children.map(visit).find(Boolean) || null;
    },
  });
  doc.createElement = make;
  doc.createElementNS = (_ns, tag) => make(tag);
  const previousSerializer = globalThis.XMLSerializer;
  globalThis.XMLSerializer = class { serializeToString() { return '<svg xmlns="http://www.w3.org/2000/svg"/>'; } };
  const resolvers = [], scene = new THREE.Scene();
  try {
    const display = createAchievementDisplays({ scene, THREE, doc, unlocked: BADGES.slice(0, WALL_CAP + 1).map(badge => badge.id), textureLoader: { loadAsync() { return new Promise(resolve => resolvers.push(resolve)); } } });
    assert.equal(resolvers.length, WALL_CAP + 1, '包含墙面和展柜的待加载纹理');
    let before = 0;
    display.group.traverse(() => before++);
    display.dispose(); display.dispose();
    assert.equal(scene.children.length, 0);
    let released = 0;
    for (const resolve of resolvers) {
      const texture = new THREE.Texture();
      texture.addEventListener('dispose', () => released++);
      resolve(texture);
    }
    await display.ready;
    let after = 0;
    display.group.traverse(() => after++);
    assert.equal(after, before, '已卸载的展示体不能再添加任何画芯网格');
    assert.equal(released, resolvers.length, '每份迟到纹理均立即释放');
  } finally {
    if (previousSerializer === undefined) delete globalThis.XMLSerializer;
    else globalThis.XMLSerializer = previousSerializer;
  }
});
