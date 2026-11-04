import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFurnitureCollider,
  multiplyMatrices,
  collidersOverlap,
  isColliderWithinBounds,
  toPathObstacles,
} from '../colliders.mjs';

function matrix({ position = [0, 0, 0], yaw = 0, scale = [1, 1, 1] } = {}) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const [sx, sy, sz] = scale;
  return [c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, ...position, 1];
}

function collider(id, { center = [0, 0, 0], size = [2, 2, 2], ...transform } = {}) {
  return createFurnitureCollider({ id, boxes: [{ center, size }], matrixWorld: matrix(transform) });
}

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should equal ${expected}`);
}

test('explicit local boxes expose complete world geometry without inspecting a mesh', () => {
  const result = createFurnitureCollider({
    id: 'table', boxes: [{ center: [1, 2, 3], size: [2, 4, 6] }],
    mesh: { boundingBox: 'intentionally unused' },
  });
  const box = result.boxes[0];
  assert.equal(result.id, 'table');
  assert.deepEqual(box.center, { x: 1, y: 2, z: 3 });
  assert.equal(box.corners.length, 8);
  assert.equal(box.footprint.length, 4);
  assert.deepEqual(box.aabb, { minX: 0, maxX: 2, minZ: 0, maxZ: 6 });
  assert.equal(box.minY, 0);
  assert.equal(box.maxY, 4);
});

test('a 90-degree Y rotation exchanges footprint dimensions', () => {
  const result = collider('sofa', { size: [4, 2, 2], position: [3, 5, 7], yaw: Math.PI / 2 });
  close(result.aabb.minX, 2);
  close(result.aabb.maxX, 4);
  close(result.aabb.minZ, 5);
  close(result.aabb.maxZ, 9);
  close(result.minY, 4);
  close(result.maxY, 6);
});

test('nonuniform scaling is applied in local axes before rotation', () => {
  const result = collider('scaled', { size: [2, 2, 4], yaw: Math.PI / 4, scale: [2, 3, 0.5] });
  const extent = 3 / Math.sqrt(2);
  close(result.aabb.minX, -extent);
  close(result.aabb.maxX, extent);
  close(result.aabb.minZ, -extent);
  close(result.aabb.maxZ, extent);
  close(result.minY, -3);
  close(result.maxY, 3);
});

test('parent and local matrices compose in the same order as a scene hierarchy', () => {
  const parentMatrix = matrix({ position: [10, 0, 0], yaw: Math.PI / 2 });
  const localMatrix = matrix({ position: [2, 3, 0], scale: [1, 2, 1] });
  const localBoxes = [{ center: [0, 0, 0], size: [2, 2, 2] }];
  const combined = createFurnitureCollider({ id: 'lamp', boxes: localBoxes, parentMatrix, localMatrix });
  const direct = createFurnitureCollider({
    id: 'lamp', boxes: localBoxes, matrixWorld: { elements: multiplyMatrices(parentMatrix, localMatrix) },
  });
  close(combined.boxes[0].center.x, 10);
  close(combined.boxes[0].center.y, 3);
  close(combined.boxes[0].center.z, -2);
  assert.deepEqual(combined.boxes, direct.boxes);
});

test('SAT rejects overlapping AABBs when rotated furniture footprints are separate', () => {
  const a = collider('a', { size: [4, 1, 0.3], yaw: Math.PI / 4 });
  const b = collider('b', { size: [4, 1, 0.3], position: [0.5, 0, 0.5], yaw: Math.PI / 4 });
  assert.ok(a.aabb.minX < b.aabb.maxX && b.aabb.minX < a.aabb.maxX);
  assert.ok(a.aabb.minZ < b.aabb.maxZ && b.aabb.minZ < a.aabb.maxZ);
  assert.equal(collidersOverlap(a, b), false);
  assert.equal(collidersOverlap(b, a), false);
  const penetrating = collider('c', { size: [4, 1, 0.3], position: [0.1, 0, 0.1], yaw: Math.PI / 4 });
  assert.equal(collidersOverlap(a, penetrating), true);
});

test('SAT accepts parent-scale XZ shear without reducing it to a rotated AABB', () => {
  const options = {
    boxes: [{ center: [0, 0, 0], size: [2, 1, 0.2] }],
    parentMatrix: matrix({ scale: [2, 1, 1] }),
    localMatrix: matrix({ yaw: Math.PI / 4 }),
  };
  const a = createFurnitureCollider({ id: 'a', ...options });
  const b = createFurnitureCollider({ id: 'b', ...options,
    parentMatrix: matrix({ position: [0.7, 0, 0.7], scale: [2, 1, 1] }) });
  assert.equal(collidersOverlap(a, b), false);
  assert.equal(collidersOverlap(a, a), true);
});

test('a lamp can rest on a cabinet but cannot penetrate its top', () => {
  const cabinet = collider('cabinet', { center: [0, 0.5, 0], size: [2, 1, 2] });
  const lamp = collider('lamp', { center: [0, 1.5, 0], size: [0.5, 1, 0.5] });
  const sunkLamp = collider('lamp', { center: [0, 1.45, 0], size: [0.5, 1, 0.5] });
  assert.equal(collidersOverlap(cabinet, lamp), false);
  assert.equal(collidersOverlap(cabinet, sunkLamp), true);
});

test('face contact and epsilon-scale penetration are allowed; real overlap is rejected', () => {
  const a = collider('a');
  assert.equal(collidersOverlap(a, collider('touching', { position: [2, 0, 0] })), false);
  assert.equal(collidersOverlap(a, collider('within-epsilon', { position: [1.999999, 0, 0] })), false);
  assert.equal(collidersOverlap(a, collider('overlap', { position: [1.98, 0, 0] })), true);
  assert.equal(collidersOverlap(a, collider('within-epsilon', { position: [1.999999, 0, 0] }), { epsilon: 0 }), true);
});

test('compound furniture checks separate boxes, leaving intentional gaps usable', () => {
  const frame = createFurnitureCollider({ id: 'frame', boxes: [
    { center: [-2, 0, 0], size: [1, 2, 1] },
    { center: [2, 0, 0], size: [1, 2, 1] },
  ] });
  assert.equal(collidersOverlap(frame, collider('middle', { size: [1, 1, 1] })), false);
  assert.equal(collidersOverlap(frame, collider('leg', { size: [1, 1, 1], position: [2, 0, 0] })), true);
});

test('room bounds allow contact and inspect actual rotated corners', () => {
  const bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  assert.equal(isColliderWithinBounds(collider('exact'), bounds), true);
  assert.equal(isColliderWithinBounds(collider('epsilon', { position: [0.000001, 0, 0] }), bounds), true);
  assert.equal(isColliderWithinBounds(collider('outside', { position: [0.01, 0, 0] }), bounds), false);
  assert.equal(isColliderWithinBounds(collider('rotated', { yaw: Math.PI / 4 }), bounds), false);
});

test('navigation obstacles are conservative AABBs expanded by pet clearance', () => {
  const sofa = collider('sofa', { size: [4, 2, 2], position: [3, 1, 7], yaw: Math.PI / 2 });
  const [obstacle] = toPathObstacles([sofa], { padding: 0.4, minY: 0, maxY: 1.22 });
  assert.equal(obstacle.id, 'sofa');
  assert.equal(obstacle.boxIndex, 0);
  close(obstacle.minX, 1.6);
  close(obstacle.maxX, 4.4);
  close(obstacle.minZ, 4.6);
  close(obstacle.maxZ, 9.4);
  for (const corner of sofa.boxes[0].footprint) {
    assert.ok(corner.x > obstacle.minX && corner.x < obstacle.maxX);
    assert.ok(corner.z > obstacle.minZ && corner.z < obstacle.maxZ);
  }
});

test('navigation height bands exclude elevated lamps and include closed-band contact', () => {
  const cabinet = collider('cabinet', { center: [0, 0.5, 0], size: [2, 1, 2] });
  const lamp = collider('lamp', { center: [0, 2, 0], size: [0.5, 1, 0.5] });
  const band = toPathObstacles([cabinet, lamp], { minY: 0, maxY: 1.22 });
  assert.deepEqual(band.map((box) => box.id), ['cabinet']);
  assert.equal(toPathObstacles([lamp], { minY: 0, maxY: 1.5 }).length, 1);
  assert.equal(toPathObstacles([cabinet, lamp]).length, 2);
});

test('empty explicit collider sets have no collision or navigation footprint', () => {
  const empty = createFurnitureCollider({ id: 'decoration', boxes: [] });
  assert.equal(empty.aabb, null);
  assert.equal(collidersOverlap(empty, collider('solid')), false);
  assert.deepEqual(toPathObstacles([empty]), []);
});

test('invalid boxes, matrices and options fail explicitly', () => {
  assert.throws(() => createFurnitureCollider({ id: 'missing' }), TypeError);
  assert.throws(() => collider('flat', { size: [1, 0, 1] }), TypeError);
  assert.throws(() => collider('zero-scale', { scale: [0, 1, 1] }), RangeError);
  const tilted = matrix();
  tilted[1] = 0.2;
  assert.throws(() => createFurnitureCollider({ boxes: [], matrixWorld: tilted }), RangeError);
  assert.throws(() => createFurnitureCollider({ boxes: [], matrixWorld: matrix(), parentMatrix: matrix() }), TypeError);
  assert.throws(() => toPathObstacles([], { padding: -1 }), RangeError);
  assert.throws(() => toPathObstacles([], { minY: 2, maxY: 1 }), RangeError);
  assert.throws(() => collidersOverlap(collider('a'), collider('b'), { epsilon: -1 }), RangeError);
});
