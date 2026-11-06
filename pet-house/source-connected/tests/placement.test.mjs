import test from 'node:test';
import assert from 'node:assert/strict';
import { placementOrder } from '../placement.mjs';

const bounds = { minX: -4.36, maxX: 4.36, minZ: -4.06, maxZ: 4.06 };
const wallDistance = ([x, z]) => Math.min(
  x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z,
);

test('near-wall candidates rank first, center candidates rank last', () => {
  const order = placementOrder(bounds, .65);
  assert.ok(order.length > 50, 'a 8.8x8.2 room at 0.65 step yields a full grid');
  const first = order[0], last = order[order.length - 1];
  assert.ok(wallDistance(first) < wallDistance(last), 'first candidate hugs a wall more than the last');
  const corner = order.findIndex(([x, z]) => Math.abs(x) > 3.4 && Math.abs(z) > 3.4);
  const center = order.findIndex(([x, z]) => Math.abs(x) < .4 && Math.abs(z) < .4);
  assert.ok(corner >= 0 && center >= 0 && corner < center, 'corners are tried before the open center');
});

test('candidates stay inside bounds and are unique', () => {
  const order = placementOrder(bounds, .65);
  assert.ok(order.every(([x, z]) => x >= -4.36 && x <= 4.36 && z >= -4.06 && z <= 4.06));
  const set = new Set(order.map(([x, z]) => `${x}:${z}`));
  assert.equal(set.size, order.length);
});

test('invalid bounds, step or margin yield an empty list', () => {
  assert.deepEqual(placementOrder(null, .65), []);
  assert.deepEqual(placementOrder(bounds, 0), []);
  assert.deepEqual(placementOrder({ minX: 1, maxX: 0, minZ: 0, maxZ: 1 }, .65), []);
  assert.deepEqual(placementOrder(bounds, { margin: -1 }), []);
});
