import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementController, DEFAULT_BOUNDS, screenAxes } from '../movement.mjs';

const near = (actual, expected, label = '', tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} != ${expected}`);
const wideBounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const position = (movement) => ({ x: movement.x, z: movement.z });
function facingDot(movement, previous) {
  const dx = movement.x - previous.x, dz = movement.z - previous.z;
  const distance = Math.hypot(dx, dz);
  // app.js renders renderYaw; logical yaw may advance during substeps.
  return distance < 1e-9 ? 1 : (dx * Math.sin(movement.renderYaw) + dz * Math.cos(movement.renderYaw)) / distance;
}
function assertForward(movement, previous, label = '') {
  near(facingDot(movement, previous), 1, label, 1e-6);
}
function run(movement, seconds, fps, axis) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) movement.update(1 / fps, axis);
}

test('eight directions translate along the face without diagonal speed gain', () => {
  let referenceDistance;
  for (const [x, z] of [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]]) {
    const movement = new MovementController({ bounds: wideBounds });
    movement.yaw = Math.atan2(x, z);
    for (let frame = 0; frame < 60; frame++) {
      const previous = position(movement);
      movement.update(1 / 60, { x, z });
      assertForward(movement, previous, `direction ${x},${z}, frame ${frame}`);
    }
    assert.ok(movement.travelled > 0 && movement.travelled < movement.speed);
    referenceDistance ??= movement.travelled;
    near(movement.travelled, referenceDistance);
    near(Math.hypot(movement.x, movement.z), referenceDistance);
    near(movement.currentSpeed, movement.speed);
  }
});

test('a turn from rest rotates in place before translating', () => {
  const movement = new MovementController();
  movement.update(1 / 60, { x: 1, z: 0 });
  near(movement.x, 0);
  near(movement.z, 0);
  assert.equal(movement.turning, true);
  for (let frame = 0; frame < 60; frame++) {
    const previous = position(movement);
    movement.update(1 / 60, { x: 1, z: 0 });
    assertForward(movement, previous);
  }
  assert.ok(movement.x > 0);
});

test('a full-speed 180 degree reversal brakes forward, turns stationary, then moves forward', () => {
  const movement = new MovementController({ bounds: wideBounds });
  run(movement, 1, 60, { x: 0, z: 1 });
  let sawStationaryTurn = false, sawReverseTravel = false;
  for (let frame = 0; frame < 90; frame++) {
    const previous = position(movement);
    movement.update(1 / 60, { x: 0, z: -1 });
    assertForward(movement, previous, `reversal frame ${frame}`);
    sawStationaryTurn ||= movement.turning && !movement.moving;
    sawReverseTravel ||= movement.z < previous.z - 1e-9;
  }
  assert.ok(sawStationaryTurn && sawReverseTravel);
});

test('accelerating reversals render every displacement along the final facing at low FPS', () => {
  for (const initialFrames of [6, 10]) {
    const movement = new MovementController({ bounds: wideBounds });
    for (let frame = 0; frame < initialFrames; frame++) movement.update(1 / 60, { x: 1, z: 1 });
    for (let frame = 0; frame < 8; frame++) {
      const previous = position(movement);
      movement.update(0.2, { x: -1, z: -1 });
      assertForward(movement, previous, `${initialFrames} initial frames, reverse frame ${frame}`);
    }
  }
});

test('click movement reaches its target without overshoot and comes to rest', () => {
  const movement = new MovementController();
  const target = { x: 0.7, z: -0.4 };
  movement.setTarget(target.x, target.z);
  let previousDistance = Math.hypot(target.x, target.z);
  for (let frame = 0; movement.target && frame < 600; frame++) {
    const previous = position(movement);
    movement.update(1 / 60);
    const distance = Math.hypot(target.x - movement.x, target.z - movement.z);
    assert.ok(distance <= previousDistance + 1e-9);
    assert.ok(movement.x <= target.x + 1e-9 && movement.z >= target.z - 1e-9);
    assertForward(movement, previous);
    previousDistance = distance;
  }
  assert.equal(movement.target, null);
  near(movement.x, target.x);
  near(movement.z, target.z);
  near(movement.currentSpeed, 0);
  movement.update(1 / 60);
  assert.equal(movement.moving, false);
});

test('keyboard cancels a click target and releasing keys brakes without resuming the target', () => {
  const movement = new MovementController();
  movement.setTarget(2, 0);
  run(movement, 0.6, 60, { x: 0, z: 1 });
  assert.equal(movement.target, null);
  const beforeRelease = movement.z;
  movement.update(1 / 60);
  assert.ok(movement.z > beforeRelease);
  assert.ok(movement.currentSpeed > 0 && movement.currentSpeed < movement.speed);
  run(movement, 0.5, 60);
  assert.equal(movement.currentSpeed, 0);
  assert.equal(movement.moving, false);
  assert.equal(movement.target, null);
  near(movement.x, 0);
  assert.ok(movement.z - beforeRelease <= movement.speed ** 2 / (2 * movement.braking) + 1e-9);
  const stopped = position(movement);
  run(movement, 0.5, 60);
  near(movement.x, stopped.x);
  near(movement.z, stopped.z);
});

test('at a border stop at the first intersection and turn before following the edge', () => {
  const movement = new MovementController();
  movement.x = DEFAULT_BOUNDS.maxX - 0.05;
  movement.yaw = Math.PI / 4;
  movement.currentSpeed = movement.speed;
  for (let frame = 0; frame < 120; frame++) {
    const previous = position(movement);
    movement.update(1 / 60, { x: 1, z: 1 });
    assert.ok(movement.x <= DEFAULT_BOUNDS.maxX && movement.z <= DEFAULT_BOUNDS.maxZ);
    assertForward(movement, previous, `border frame ${frame}`);
  }
  near(movement.x, DEFAULT_BOUNDS.maxX);
  assert.ok(movement.z > 0.5);
});

test('click targets are clamped and continuous keyboard input never leaves bounds', () => {
  const movement = new MovementController();
  movement.setTarget(999, -999);
  assert.deepEqual(movement.target, { x: DEFAULT_BOUNDS.maxX, z: DEFAULT_BOUNDS.minZ });
  run(movement, 10, 60);
  near(movement.x, DEFAULT_BOUNDS.maxX);
  near(movement.z, DEFAULT_BOUNDS.minZ);
  run(movement, 10, 60, { x: -1, z: 1 });
  near(movement.x, DEFAULT_BOUNDS.minX);
  near(movement.z, DEFAULT_BOUNDS.maxZ);
});

test('5 through 144 FPS preserve the same startup trajectory with acceleration and turning', () => {
  let reference;
  for (const fps of [120, 5, 10, 15, 20, 30, 60, 144]) {
    const movement = new MovementController({ bounds: wideBounds });
    run(movement, 1, fps, { x: 1, z: 0 });
    reference ??= { x: movement.x, z: movement.z, yaw: movement.yaw, travelled: movement.travelled };
    for (const field of ['x', 'z', 'yaw', 'travelled']) near(movement[field], reference[field], `${fps} FPS ${field}`);
    near(movement.currentSpeed, movement.speed);
  }
});

test('an accelerating reversal follows the same trajectory at 5 through 144 FPS', () => {
  let reference;
  for (const fps of [120, 5, 10, 15, 20, 30, 60, 144]) {
    const movement = new MovementController({ bounds: wideBounds });
    for (let frame = 0; frame < 10; frame++) movement.update(1 / 60, { x: 1, z: 1 });
    for (let frame = 0; frame < fps; frame++) {
      const previous = position(movement);
      movement.update(1 / fps, { x: -1, z: -1 });
      assertForward(movement, previous, `${fps} FPS reverse frame ${frame}`);
    }
    reference ??= { x: movement.x, z: movement.z, yaw: movement.yaw, travelled: movement.travelled, currentSpeed: movement.currentSpeed };
    for (const field of ['x', 'z', 'yaw', 'travelled', 'currentSpeed']) near(movement[field], reference[field], `${fps} FPS reversal ${field}`);
  }
});

test('an exceptional stall advances a steady walk by at most 0.25 seconds', () => {
  const movement = new MovementController({ bounds: wideBounds });
  run(movement, 1, 60, { x: 0, z: 1 });
  const beforeStall = movement.z;
  movement.update(10, { x: 0, z: 1 });
  near(movement.z - beforeStall, 0.6);
});

test('stop cancels inertia immediately and reset clears speed, heading, and history', () => {
  const movement = new MovementController();
  run(movement, 0.6, 60, { x: 0, z: 1 });
  movement.setTarget(3, 1);
  const stopped = position(movement), travelled = movement.travelled;
  movement.stop();
  assert.equal(movement.target, null);
  assert.equal(movement.currentSpeed, 0);
  assert.equal(movement.moving, false);
  run(movement, 0.5, 60);
  near(movement.x, stopped.x);
  near(movement.z, stopped.z);
  near(movement.travelled, travelled);
  movement.reset();
  for (const field of ['x', 'z', 'yaw', 'renderYaw', 'travelled', 'currentSpeed', 'stepDistance', 'accumulator']) near(movement[field], 0);
  assert.equal(movement.target, null);
  assert.equal(movement.lastDirection, null);
  assert.equal(movement.moving, false);
  assert.equal(movement.turning, false);
});

test('stop preserves the last displayed face when logical yaw differs during a reversal', () => {
  const movement = new MovementController();
  for (let frame = 0; frame < 10; frame++) movement.update(1 / 60, { x: 1, z: 1 });
  movement.update(0.2, { x: -1, z: -1 });
  const displayedYaw = movement.renderYaw;
  assert.ok(Math.abs(movement.yaw - displayedYaw) > 0.1);
  movement.stop();
  near(movement.yaw, displayedYaw);
  near(movement.renderYaw, displayedYaw);
  movement.update(1 / 60);
  near(movement.yaw, displayedYaw);
  near(movement.renderYaw, displayedYaw);
});

test('NaN and Infinity targets are rejected and invalid axes cannot corrupt position', () => {
  const movement = new MovementController();
  assert.equal(movement.setTarget(1, 2), true);
  for (const [x, z] of [[NaN, 0], [0, NaN], [Infinity, 0], [0, -Infinity]]) {
    assert.equal(movement.setTarget(x, z), false);
    assert.deepEqual(movement.target, { x: 1, z: 2 });
  }
  movement.update(1 / 60, { x: NaN, z: Infinity });
  assert.ok(Number.isFinite(movement.x) && Number.isFinite(movement.z));
});

test('screen-relative keyboard follows the camera basis and opposing keys cancel', () => {
  const forward = { x: 0.6, z: -0.8 }, right = { x: 0.8, z: 0.6 };
  assert.deepEqual(screenAxes(new Set(['KeyW']), forward, right), forward);
  assert.deepEqual(screenAxes(new Set(['ArrowRight']), forward, right), right);
  assert.deepEqual(screenAxes(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']), forward, right), { x: 0, z: 0 });
});

