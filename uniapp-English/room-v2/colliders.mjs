/** Pure geometry helpers for explicitly configured furniture collision boxes.
 * Matrices are Three.js-compatible column-major affine matrices. No mesh bounds
 * are inspected. World Y must remain vertical; XZ shear from parent scale is OK.
 */
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const DEFAULT_EPSILON = 1e-5;

/** Combine parent * local; accepts 16-element arrays or { elements } objects. */
export function multiplyMatrices(parent, local) {
  const a = readMatrix(parent);
  const b = readMatrix(local);
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return result;
}

/**
 * createFurnitureCollider({ id, boxes:[{center:[x,y,z],size:[x,y,z]}], matrixWorld })
 * Alternatively supply localMatrix and parentMatrix to combine them here.
 * Returned boxes expose world center, eight corners, XZ footprint, Y range and
 * conservative XZ aabb. Recreate the snapshot after changing furniture transforms.
 */
export function createFurnitureCollider({ id, boxes, matrixWorld, localMatrix, parentMatrix } = {}) {
  if (!Array.isArray(boxes)) throw new TypeError('boxes must be an explicit array of local collision boxes');
  if (matrixWorld != null && (localMatrix != null || parentMatrix != null)) {
    throw new TypeError('Use matrixWorld or localMatrix/parentMatrix, not both');
  }
  const matrix = matrixWorld != null ? readMatrix(matrixWorld)
    : multiplyMatrices(parentMatrix ?? IDENTITY, localMatrix ?? IDENTITY);
  requireVerticalAffine(matrix);

  const worldBoxes = boxes.map((box, boxIndex) => {
    if (!validVector(box?.center) || !validVector(box?.size) || box.size.some((size) => size <= 0)) {
      throw new TypeError(`Collision box ${boxIndex} requires finite center and positive size arrays`);
    }
    const [cx, cy, cz] = box.center;
    const [hx, hy, hz] = box.size.map((size) => size / 2);
    const center = transformPoint(matrix, cx, cy, cz);
    const footprint = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => {
      const point = transformPoint(matrix, cx + x, cy, cz + z);
      return { x: point.x, z: point.z };
    });
    const halfHeight = Math.abs(matrix[5]) * hy;
    const minY = center.y - halfHeight;
    const maxY = center.y + halfHeight;
    if (![center.x, center.y, center.z, minY, maxY, ...footprint.flatMap((point) => [point.x, point.z])].every(Number.isFinite)
      || maxY <= minY || footprint.some((point, index) => {
        const next = footprint[(index + 1) % footprint.length];
        return Math.hypot(point.x - next.x, point.z - next.z) === 0;
      })) throw new RangeError('World collision box is non-finite or loses precision at this scale');
    const corners = [minY, maxY].flatMap((y) => footprint.map(({ x, z }) => ({ x, y, z })));
    const aabb = boundsOf(footprint);
    if (![aabb.maxX - aabb.minX, maxY - minY, aabb.maxZ - aabb.minZ].every(Number.isFinite)) {
      throw new RangeError('World collision dimensions overflow');
    }
    return { boxIndex, center, corners, footprint, minY, maxY, aabb };
  });

  return {
    id,
    matrixWorld: matrix,
    boxes: worldBoxes,
    aabb: worldBoxes.length ? unionBounds(worldBoxes.map((box) => box.aabb)) : null,
    minY: worldBoxes.length ? Math.min(...worldBoxes.map((box) => box.minY)) : null,
    maxY: worldBoxes.length ? Math.max(...worldBoxes.map((box) => box.maxY)) : null,
  };
}

/** Positive-volume overlap only. Edge/face contact and <= epsilon penetration
 * are allowed. SAT checks each pair of explicit boxes, not their union AABBs.
 */
export function collidersOverlap(a, b, { epsilon = DEFAULT_EPSILON } = {}) {
  requireEpsilon(epsilon);
  requireCollider(a);
  requireCollider(b);
  for (const first of a.boxes) {
    for (const second of b.boxes) {
      if (Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY) <= epsilon) continue;
      if (footprintsOverlap(first.footprint, second.footprint, epsilon)) return true;
    }
  }
  return false;
}

/** XZ room-ground check. Contact with the room boundary is allowed. */
export function isColliderWithinBounds(collider, bounds, { epsilon = DEFAULT_EPSILON } = {}) {
  requireEpsilon(epsilon);
  requireCollider(collider);
  if (!validBounds(bounds)) throw new TypeError('bounds requires finite ordered minX/maxX/minZ/maxZ');
  return collider.boxes.every((box) => box.footprint.every(({ x, z }) =>
    x >= bounds.minX - epsilon && x <= bounds.maxX + epsilon
    && z >= bounds.minZ - epsilon && z <= bounds.maxZ + epsilon));
}

/** Conservative CLOSED XZ AABBs for navigation.mjs. Only boxes intersecting the
 * requested closed Y band are included. padding is the pet clearance radius.
 * Example: toPathObstacles(colliders, {padding:.4,minY:0,maxY:1.22}).
 */
export function toPathObstacles(colliders = [], { padding = 0, minY = -Infinity, maxY = Infinity } = {}) {
  if (!Number.isFinite(padding) || padding < 0) throw new RangeError('padding must be finite and nonnegative');
  if (typeof minY !== 'number' || typeof maxY !== 'number' || Number.isNaN(minY)
      || Number.isNaN(maxY) || minY > maxY) throw new RangeError('minY/maxY must form an ordered height band');
  const result = [];
  for (const collider of colliders) {
    requireCollider(collider);
    for (const box of collider.boxes) {
      if (box.maxY < minY || box.minY > maxY) continue;
      const obstacle = {
        id: collider.id,
        boxIndex: box.boxIndex,
        minX: box.aabb.minX - padding,
        maxX: box.aabb.maxX + padding,
        minZ: box.aabb.minZ - padding,
        maxZ: box.aabb.maxZ + padding,
      };
      if (![obstacle.minX, obstacle.maxX, obstacle.minZ, obstacle.maxZ].every(Number.isFinite)) {
        throw new RangeError('Navigation padding overflows the collision bounds');
      }
      result.push(obstacle);
    }
  }
  return result;
}

function readMatrix(value = IDENTITY) {
  const elements = value?.elements ?? value;
  if (elements == null || elements.length !== 16 || !Array.from(elements).every(Number.isFinite)) {
    throw new TypeError('Matrix must contain 16 finite column-major elements');
  }
  return Array.from(elements);
}

function requireVerticalAffine(matrix) {
  const tolerance = 1e-10;
  if (!matrix.every(Number.isFinite) || [matrix[1], matrix[3], matrix[4], matrix[6], matrix[7], matrix[9], matrix[11]]
    .some((value) => Math.abs(value) > tolerance) || Math.abs(matrix[15] - 1) > tolerance) {
    throw new RangeError('Collision matrices must be affine with world Y vertical (Y rotation only)');
  }
  const areaScale = matrix[0] * matrix[10] - matrix[8] * matrix[2];
  if (!Number.isFinite(areaScale) || Math.abs(areaScale) < 1e-12 || Math.abs(matrix[5]) < 1e-12) {
    throw new RangeError('Collision matrices must have nonzero horizontal and vertical scale');
  }
}

function validVector(vector) {
  return Array.isArray(vector) && vector.length === 3 && [0, 1, 2].every((index) => Number.isFinite(vector[index]));
}

function requireEpsilon(epsilon) {
  if (!Number.isFinite(epsilon) || epsilon < 0) throw new RangeError('epsilon must be finite and nonnegative');
}

function requireCollider(collider) {
  if (collider == null || !Array.isArray(collider.boxes)) throw new TypeError('Expected a furniture collider');
}

function validBounds(bounds) {
  return bounds != null && ['minX', 'maxX', 'minZ', 'maxZ'].every((key) => Number.isFinite(bounds[key]))
    && bounds.minX <= bounds.maxX && bounds.minZ <= bounds.maxZ;
}

function transformPoint(matrix, x, y, z) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

function boundsOf(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function unionBounds(bounds) {
  return {
    minX: Math.min(...bounds.map((box) => box.minX)),
    maxX: Math.max(...bounds.map((box) => box.maxX)),
    minZ: Math.min(...bounds.map((box) => box.minZ)),
    maxZ: Math.max(...bounds.map((box) => box.maxZ)),
  };
}

function footprintsOverlap(first, second, epsilon) {
  // Edge normals remain correct for nonorthogonal parallelograms produced by a
  // nonuniform parent scale followed by a child's Y rotation.
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const axisX = -dz / length;
      const axisZ = dx / length;
      const one = project(first, axisX, axisZ);
      const two = project(second, axisX, axisZ);
      if (Math.min(one.max, two.max) - Math.max(one.min, two.min) <= epsilon) return false;
    }
  }
  return true;
}

function project(points, axisX, axisZ) {
  const values = points.map((point) => point.x * axisX + point.z * axisZ);
  return { min: Math.min(...values), max: Math.max(...values) };
}
