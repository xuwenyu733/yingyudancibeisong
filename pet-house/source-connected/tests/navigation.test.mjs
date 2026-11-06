import test from 'node:test';
import assert from 'node:assert/strict';
import { createPath } from '../navigation.mjs';

const bounds = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };

// Independently inspect dense samples along every returned segment.
function assertSafe(start, end, path, obstacles, limits = bounds) {
  assert.ok(Array.isArray(path) && path.length > 0, 'a nonempty path exists');
  assert.deepEqual(path.at(-1), end, 'the exact unsnapped destination is preserved');
  assert.notDeepEqual(path[0], start, 'start is omitted');
  let previous = start;
  for (const waypoint of path) {
    const samples = Math.ceil(Math.hypot(waypoint.x - previous.x, waypoint.z - previous.z) / 0.002) + 1;
    for (let sample = 0; sample <= samples; sample++) {
      const t = sample / samples;
      const x = previous.x + (waypoint.x - previous.x) * t;
      const z = previous.z + (waypoint.z - previous.z) * t;
      assert.ok(x >= limits.minX && x <= limits.maxX && z >= limits.minZ && z <= limits.maxZ,
        'segments remain within room bounds');
      for (const box of obstacles) {
        assert.ok(!(x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ),
          `segment enters obstacle at ${x}, ${z}`);
      }
    }
    previous = waypoint;
  }
}

test('clear space returns only the exact destination', () => {
  const start = { x: 0.15, z: 0.27 };
  const end = { x: 3.83, z: 3.69 };
  assert.deepEqual(createPath(start, end, { bounds }), [end]);
});

test('a valid coincident destination requires no motion', () => {
  assert.deepEqual(createPath({ x: 1, z: 1 }, { x: 1, z: 1 }, { bounds }), []);
});

test('routes around a central obstacle and simplifies redundant grid steps', () => {
  const obstacles = [{ minX: 1.2, maxX: 2.8, minZ: 1.2, maxZ: 2.8 }];
  const start = { x: 0.37, z: 2.03 };
  const end = { x: 3.71, z: 2.09 };
  const path = createPath(start, end, { bounds, obstacles });
  assertSafe(start, end, path, obstacles);
  assert.ok(path.length >= 2 && path.length <= 5, 'line-of-sight simplification removes grid staircases');
});

test('rejects blocked endpoints, including obstacle boundary contact', () => {
  const obstacles = [{ minX: 1, maxX: 2, minZ: 1, maxZ: 2 }];
  assert.equal(createPath({ x: 0.5, z: 0.5 }, { x: 1.5, z: 1.5 }, { bounds, obstacles }), null);
  assert.equal(createPath({ x: 1.5, z: 1.5 }, { x: 3, z: 3 }, { bounds, obstacles }), null);
  assert.equal(createPath({ x: 0.5, z: 0.5 }, { x: 1, z: 1.5 }, { bounds, obstacles }), null);
});

test('a wall spanning the room makes the destination unreachable', () => {
  const obstacles = [{ minX: 1.8, maxX: 2.2, minZ: 0, maxZ: 4 }];
  assert.equal(createPath({ x: 0.5, z: 2 }, { x: 3.5, z: 2 }, { bounds, obstacles }), null);
});

test('cannot cut diagonally through the touching corners of obstacles', () => {
  const smallBounds = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
  const obstacles = [
    { minX: 1, maxX: 2, minZ: 0, maxZ: 1 },
    { minX: 0, maxX: 1, minZ: 1, maxZ: 2 },
  ];
  assert.equal(createPath({ x: 0.5, z: 0.5 }, { x: 1.5, z: 1.5 },
    { bounds: smallBounds, obstacles, cellSize: 0.25 }), null);
});

test('a diagonal tangent to an obstacle corner is routed around the contact', () => {
  const obstacles = [{ minX: 1.5, maxX: 2.5, minZ: 0.5, maxZ: 1.5 }];
  const start = { x: 0.5, z: 0.5 };
  const end = { x: 3.5, z: 3.5 };
  const path = createPath(start, end, { bounds, obstacles });
  assertSafe(start, end, path, obstacles);
  assert.ok(path.length > 1, 'a tangent direct segment must not be accepted');
});

test('finds an offset passage between two wall sections', () => {
  const obstacles = [
    { minX: 1.8, maxX: 2.2, minZ: 0, maxZ: 1.6 },
    { minX: 1.8, maxX: 2.2, minZ: 2.4, maxZ: 4 },
  ];
  const start = { x: 0.43, z: 0.53 };
  const end = { x: 3.73, z: 0.59 };
  assertSafe(start, end, createPath(start, end, { bounds, obstacles }), obstacles);
});

test('line-of-sight simplification does not ignore thin obstacles between grid nodes', () => {
  const obstacles = [{ minX: 1.93, maxX: 1.97, minZ: 0.7, maxZ: 3.3 }];
  const start = { x: 0.5, z: 2 };
  const end = { x: 3.5, z: 2 };
  assertSafe(start, end, createPath(start, end, { bounds, obstacles, cellSize: 0.5 }), obstacles);
});

test('supports negative shifted room coordinates and non-square grids', () => {
  const shifted = { minX: -3.4, maxX: 1.7, minZ: -2.7, maxZ: 0.9 };
  const obstacles = [{ minX: -1.7, maxX: -0.9, minZ: -2, maxZ: 0.2 }];
  const start = { x: -3.1, z: -0.8 };
  const end = { x: 1.43, z: -0.81 };
  assertSafe(start, end, createPath(start, end, { bounds: shifted, obstacles }), obstacles, shifted);
});

test('rejects out-of-bounds and invalid input without starting a grid search', () => {
  const start = { x: 0.5, z: 0.5 };
  const end = { x: 3.5, z: 3.5 };
  assert.equal(createPath(start, { x: 4.1, z: 1 }, { bounds }), null);
  assert.equal(createPath({ x: -0.1, z: 1 }, end, { bounds }), null);
  assert.equal(createPath(start, end, { bounds, cellSize: 0 }), null);
  assert.equal(createPath(start, end, { bounds, cellSize: NaN }), null);
  assert.equal(createPath(start, end, { bounds: { ...bounds, minX: 5 } }), null);
  assert.equal(createPath({ x: Infinity, z: 1 }, end, { bounds }), null);
});

