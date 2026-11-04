/**
 * Plan an XZ-plane path around already-inflated, closed AABB obstacles.
 * Returns waypoints excluding start and preserving the exact end, or null.
 * Coincident valid endpoints return [] (the destination is already reached).
 * Grid resolution limits the narrowest passage the search can discover.
 */
export function createPath(start, end, {
  bounds,
  obstacles = [],
  cellSize = 0.22,
} = {}) {
  if (!validPoint(start) || !validPoint(end) || !validRect(bounds)
      || !Number.isFinite(cellSize) || cellSize <= 0
      || !Array.isArray(obstacles) || !obstacles.every(validRect)) return null;

  const insideBounds = (point) => point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
  const blocked = (point) => obstacles.some((box) => insideRect(point, box));
  const clear = (a, b) => !obstacles.some((box) => segmentHitsRect(a, b, box));

  if (!insideBounds(start) || !insideBounds(end) || blocked(start) || blocked(end)) return null;
  if (samePoint(start, end)) return [];
  if (clear(start, end)) return [{ x: end.x, z: end.z }];

  const xSteps = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
  const zSteps = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
  const columns = xSteps + 1;
  const rows = zSteps + 1;
  const count = columns * rows;
  // Protect the UI thread from accidental unbounded search configurations.
  if (!Number.isSafeInteger(count) || count > 1_000_000) return null;

  const xs = Array.from({ length: columns }, (_, x) => x === xSteps ? bounds.maxX
    : bounds.minX + (bounds.maxX - bounds.minX) * x / xSteps);
  const zs = Array.from({ length: rows }, (_, z) => z === zSteps ? bounds.maxZ
    : bounds.minZ + (bounds.maxZ - bounds.minZ) * z / zSteps);
  const pointAt = (id) => ({ x: xs[id % columns], z: zs[Math.floor(id / columns)] });
  const passable = new Uint8Array(count);
  const seesEnd = new Uint8Array(count);
  const closed = new Uint8Array(count);
  const costs = new Float64Array(count).fill(Infinity);
  const parents = new Int32Array(count).fill(-1);
  const open = new MinHeap();

  // Exact endpoints are virtual graph nodes. Visibility links avoid snapping
  // them through a wall, or stranding a valid endpoint beside a blocked cell.
  for (let id = 0; id < count; id++) {
    const point = pointAt(id);
    if (blocked(point)) continue;
    passable[id] = 1;
    seesEnd[id] = Number(clear(point, end));
    if (!clear(start, point)) continue;
    const cost = distance(start, point);
    costs[id] = cost;
    open.push({ id, cost, score: cost + distance(point, end) });
  }

  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  while (open.length) {
    const entry = open.pop();
    const { id, cost } = entry;
    if (closed[id] || cost !== costs[id]) continue;
    closed[id] = 1;
    const point = pointAt(id);

    if (seesEnd[id]) {
      const route = [];
      for (let cursor = id; cursor !== -1; cursor = parents[cursor]) route.push(pointAt(cursor));
      route.reverse();
      route.unshift({ x: start.x, z: start.z });
      route.push({ x: end.x, z: end.z });
      return simplify(route, clear);
    }

    const x = id % columns;
    const z = Math.floor(id / columns);
    for (const [dx, dz] of directions) {
      const nextX = x + dx;
      const nextZ = z + dz;
      if (nextX < 0 || nextX >= columns || nextZ < 0 || nextZ >= rows) continue;
      const nextId = nextZ * columns + nextX;
      if (!passable[nextId] || closed[nextId]) continue;
      // A diagonal may not squeeze between two blocked cardinal neighbours.
      if (dx && dz && (!passable[z * columns + nextX]
        || !passable[nextZ * columns + x])) continue;
      const next = pointAt(nextId);
      // Node occupancy alone misses small AABBs that fall between grid nodes.
      if (!clear(point, next)) continue;
      const nextCost = cost + distance(point, next);
      if (nextCost >= costs[nextId]) continue;
      costs[nextId] = nextCost;
      parents[nextId] = id;
      open.push({ id: nextId, cost: nextCost, score: nextCost + distance(next, end) });
    }
  }
  return null;
}

function validPoint(point) {
  return point != null && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function validRect(box) {
  return box != null && ['minX', 'maxX', 'minZ', 'maxZ'].every((key) => Number.isFinite(box[key]))
    && box.minX <= box.maxX && box.minZ <= box.maxZ;
}

function insideRect(point, box) {
  return point.x >= box.minX - 1e-9 && point.x <= box.maxX + 1e-9
    && point.z >= box.minZ - 1e-9 && point.z <= box.maxZ + 1e-9;
}

function samePoint(a, b) {
  return a.x === b.x && a.z === b.z;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Slab intersection treats edge/corner contact as blocked too.
function segmentHitsRect(a, b, box) {
  let enter = 0;
  let exit = 1;
  for (const [axis, lower, upper] of [['x', 'minX', 'maxX'], ['z', 'minZ', 'maxZ']]) {
    const delta = b[axis] - a[axis];
    const minimum = box[lower] - 1e-9;
    const maximum = box[upper] + 1e-9;
    if (delta === 0) {
      if (a[axis] < minimum || a[axis] > maximum) return false;
      continue;
    }
    let first = (minimum - a[axis]) / delta;
    let second = (maximum - a[axis]) / delta;
    if (first > second) [first, second] = [second, first];
    enter = Math.max(enter, first);
    exit = Math.min(exit, second);
    if (enter > exit) return false;
  }
  return enter <= exit;
}

function simplify(route, clear) {
  const compact = route.filter((point, index) => index === 0 || !samePoint(point, route[index - 1]));
  const result = [];
  let anchor = 0;
  while (anchor < compact.length - 1) {
    let next = compact.length - 1;
    while (next > anchor + 1 && !clear(compact[anchor], compact[next])) next--;
    result.push({ x: compact[next].x, z: compact[next].z });
    anchor = next;
  }
  return result;
}

class MinHeap {
  entries = [];

  get length() { return this.entries.length; }

  push(entry) {
    const entries = this.entries;
    entries.push(entry);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (entries[parent].score <= entry.score) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  }

  pop() {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();
    if (!entries.length) return first;
    let index = 0;
    while (index * 2 + 1 < entries.length) {
      let child = index * 2 + 1;
      if (child + 1 < entries.length && entries[child + 1].score < entries[child].score) child++;
      if (entries[child].score >= last.score) break;
      entries[index] = entries[child];
      index = child;
    }
    entries[index] = last;
    return first;
  }
}
