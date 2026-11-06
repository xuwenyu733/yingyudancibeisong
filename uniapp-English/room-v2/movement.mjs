// Pure movement logic: the same controller can be reused by a uni-app renderjs scene.
export const DEFAULT_BOUNDS = Object.freeze({ minX: -4.65, maxX: 4.65, minZ: -3.65, maxZ: 3.65 });
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const EPSILON = 1e-7;
export class MovementController {
  constructor({ speed = 2.4, bounds = DEFAULT_BOUNDS, acceleration = 8, braking = 12, turnRate = 8.5 } = {}) {
    this.speed = speed;
    this.bounds = bounds;
    this.acceleration = acceleration;
    this.braking = braking;
    this.turnRate = turnRate;
    this.reset();
  }
  reset() {
    this.x = 0; this.z = 0; this.yaw = 0; this.target = null;
    this.moving = false; this.turning = false; this.phase = 'idle';
    this.input = '等待操作'; this.travelled = 0; this.currentSpeed = 0;
    this.stepDistance = 0; this.lastDirection = null; this.accumulator = 0;
    this.renderYaw = 0; this.frameDirection = null;
  }
  setTarget(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.target = { x: clamp(x, this.bounds.minX, this.bounds.maxX), z: clamp(z, this.bounds.minZ, this.bounds.maxZ) };
    this.input = '鼠标 / 触屏点击';
    return true;
  }
  stop() { this.target = null; this.currentSpeed = 0; this.stepDistance = 0; this.moving = false; this.turning = false; this.phase = 'idle'; this.accumulator = 0; this.yaw = this.renderYaw; this.frameDirection = null; this.input = '已停止'; }
  update(dt, axis = { x: 0, z: 0 }) {
    this.stepDistance = 0; this.moving = false; this.frameDirection = null;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const previousX = this.x, previousZ = this.z;
    dt = Math.min(dt, 0.25);
    const input = {x: Number.isFinite(axis.x) ? axis.x : 0, z: Number.isFinite(axis.z) ? axis.z : 0};
    if (Math.hypot(input.x, input.z) > EPSILON) {
      this.target = null;
      this.input = '键盘 / 方向按钮';
    }
    // Fixed-size substeps preserve acceleration/turning at low frame rates.
    this.accumulator += dt;
    const step = 1 / 120;
    while (this.accumulator + 1e-10 >= step) {
      this.advance(step, input);
      this.accumulator = Math.max(0, this.accumulator - step);
    }
    const frameX = this.x - previousX, frameZ = this.z - previousZ;
    const frameDistance = Math.hypot(frameX, frameZ);
    this.moving = frameDistance > EPSILON;
    // Keep deterministic simulation heading separate from the displayed face.
    // Low FPS may contain braking and turning in one frame; show the face along
    // that frame's actual displacement, or logical yaw when turning in place.
    if (this.moving) {
      this.frameDirection = {x: frameX / frameDistance, z: frameZ / frameDistance};
      this.renderYaw = Math.atan2(frameX, frameZ);
    } else this.renderYaw = this.yaw;
    this.turning = this.phase === 'turning' && !this.moving;
  }
  advance(dt, axis) {
    let dx = axis.x, dz = axis.z;
    const hasKeyboard = Math.hypot(dx, dz) > EPSILON;
    const hasGoal = !hasKeyboard && this.target !== null;
    let remainingDistance = Infinity;
    if (hasGoal) {
      dx = this.target.x - this.x; dz = this.target.z - this.z;
      remainingDistance = Math.hypot(dx, dz);
      if (remainingDistance < EPSILON) { this.target = null; this.currentSpeed = 0; this.phase = 'idle'; return; }
    }
    // Suppress an outward axis at the border before choosing which way to face.
    const b = this.bounds;
    if ((this.x <= b.minX + EPSILON && dx < 0) || (this.x >= b.maxX - EPSILON && dx > 0)) dx = 0;
    if ((this.z <= b.minZ + EPSILON && dz < 0) || (this.z >= b.maxZ - EPSILON && dz > 0)) dz = 0;
    const magnitude = Math.hypot(dx, dz);
    if (magnitude < EPSILON) {
      this.phase = this.currentSpeed > EPSILON ? 'stopping' : 'idle';
      this.brakeForward(dt);
      return;
    }
    dx /= magnitude; dz /= magnitude;
    const desiredYaw = Math.atan2(dx, dz);
    let difference = angleDifference(desiredYaw, this.yaw);
    // Brake while still facing the previous travel direction, then turn in place.
    // Never translate toward a new heading while the face is pointing elsewhere.
    if (Math.abs(difference) > 0.35 && this.currentSpeed > 0.025) {
      this.phase = 'stopping';
      this.brakeForward(dt);
      return;
    }
    this.yaw += clamp(difference, -this.turnRate * dt, this.turnRate * dt);
    difference = angleDifference(desiredYaw, this.yaw);
    if (Math.abs(difference) > 1e-5) {
      this.currentSpeed = 0;
      this.turning = true;
      this.phase = 'turning';
      return;
    }
    this.yaw = desiredYaw;
    this.turning = false;
    const desiredSpeed = Math.min(this.speed, hasGoal ? Math.sqrt(2 * this.braking * remainingDistance) : this.speed);
    const previousSpeed = this.currentSpeed;
    this.currentSpeed = approach(previousSpeed, desiredSpeed, (desiredSpeed > previousSpeed ? this.acceleration : this.braking) * dt);
    const distance = Math.min((previousSpeed + this.currentSpeed) * 0.5 * dt, remainingDistance);
    this.phase = this.currentSpeed < previousSpeed ? 'stopping' : this.currentSpeed < this.speed - 0.01 ? 'starting' : 'walking';
    const moved = this.moveForward(distance);
    if (moved < distance - EPSILON) this.currentSpeed = 0;
    if (hasGoal && this.target && Math.hypot(this.target.x - this.x, this.target.z - this.z) < EPSILON) {
      this.target = null; this.currentSpeed = 0; this.phase = 'idle';
    }
  }
  brakeForward(dt) {
    const previousSpeed = this.currentSpeed;
    this.currentSpeed = approach(previousSpeed, 0, this.braking * dt);
    const distance = (previousSpeed + this.currentSpeed) * 0.5 * dt;
    if (this.moveForward(distance) < distance - EPSILON) this.currentSpeed = 0;
    if (this.currentSpeed <= EPSILON) { this.currentSpeed = 0; if (!this.turning) this.phase = 'idle'; }
  }
  moveForward(distance) {
    if (distance <= 0) return 0;
    const dx = Math.sin(this.yaw), dz = Math.cos(this.yaw), b = this.bounds;
    // Stop at the first boundary intersection instead of clamping each axis
    // independently, which would make the pet slide sideways against a wall.
    let allowed = distance;
    if (dx > EPSILON) allowed = Math.min(allowed, Math.max(0, (b.maxX - this.x) / dx));
    if (dx < -EPSILON) allowed = Math.min(allowed, Math.max(0, (b.minX - this.x) / dx));
    if (dz > EPSILON) allowed = Math.min(allowed, Math.max(0, (b.maxZ - this.z) / dz));
    if (dz < -EPSILON) allowed = Math.min(allowed, Math.max(0, (b.minZ - this.z) / dz));
    this.x = clamp(this.x + dx * allowed, b.minX, b.maxX);
    this.z = clamp(this.z + dz * allowed, b.minZ, b.maxZ);
    if (allowed > EPSILON) this.lastDirection = {x: dx, z: dz};
    this.travelled += allowed;
    this.stepDistance += allowed;
    return allowed;
  }
}

export function screenAxes(keys, forward, right) {
  const horizontal = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  const vertical = Number(keys.has('ArrowUp') || keys.has('KeyW')) - Number(keys.has('ArrowDown') || keys.has('KeyS'));
  return { x: right.x * horizontal + forward.x * vertical, z: right.z * horizontal + forward.z * vertical };
}
