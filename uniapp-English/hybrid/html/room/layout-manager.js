import { Matrix4, Quaternion, Vector3, Euler } from './vendor/three/three.module.js';
import { createFurnitureCollider, collidersOverlap, isColliderWithinBounds, toPathObstacles } from './colliders.mjs';
import { createPath } from './navigation.mjs';

const VERSION = 3;
const DEFAULT_STORAGE_KEY = 'hamster-room-layout-v3';
export const MAX_LAYOUT_JSON_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 20_000;
const MAX_LOCAL_COORDINATE = 100;
const MAX_POSITION = 1_000;
const MAX_WORLD_SIZE = 100;
const encoder = new TextEncoder();
const SUPPORTS = {
  'lamp-cabinet': { top: 1.12, halfX: 1.27 / 2, halfZ: 1.14 / 2 },
  table: { top: 0.40, halfX: 0.99 / 2, halfZ: 0.5 },
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite3 = (value) => Array.isArray(value) && value.length === 3 && [0, 1, 2].every((index) => Number.isFinite(value[index]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const pointValid = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.z);
const inside = (point, box) => point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;
const rectValid = (box) => box && ['minX','maxX','minZ','maxZ'].every((key) => Number.isFinite(box[key])) && box.minX <= box.maxX && box.minZ <= box.maxZ;
const messageOf = (error) => typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : '布局操作失败';

// Only the import/storage boundary needs a full JSON budget walk. Internal
// rollback snapshots still use the fixed-depth schema parser below.
function decodeLayout(value) {
  const text = typeof value === 'string' ? value : null;
  if (text !== null && (text.length > MAX_LAYOUT_JSON_BYTES || encoder.encode(text).length > MAX_LAYOUT_JSON_BYTES)) {
    throw new RangeError('布局存档超过 256 KB');
  }
  const decoded = text === null ? value : JSON.parse(text);
  const ancestors = new Set();
  let nodes = 0;
  function visit(node, depth) {
    if (++nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) throw new RangeError('布局存档层级或项目过多');
    if (node === null || typeof node === 'boolean') return;
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) throw new TypeError('布局存档包含非有限数值');
      return;
    }
    if (typeof node === 'string') {
      if (node.length > MAX_LAYOUT_JSON_BYTES) throw new RangeError('布局存档超过 256 KB');
      return;
    }
    if (typeof node !== 'object' || ancestors.has(node)) throw new TypeError('布局存档必须是无循环的 JSON 数据');
    const prototype = Object.getPrototypeOf(node);
    if (Array.isArray(node) ? node.length > MAX_JSON_NODES || (prototype !== Array.prototype && prototype !== null)
      : prototype !== Object.prototype && prototype !== null) throw new TypeError('布局存档只接受大小受限的普通 JSON 对象');
    const descriptors = Object.getOwnPropertyDescriptors(node);
    if (own(descriptors, 'toJSON') || Object.values(descriptors).some((descriptor) => !own(descriptor, 'value'))) {
      throw new TypeError('布局存档不接受访问器或自定义序列化');
    }
    const keys = Object.keys(descriptors).filter((key) => descriptors[key].enumerable);
    if (keys.length > MAX_JSON_NODES - nodes) throw new RangeError('布局存档项目过多');
    ancestors.add(node);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (key.length > 256 || !own(descriptor, 'value')) throw new TypeError('布局存档不接受访问器或超长键名');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(node);
  }
  visit(decoded, 0);
  if (text === null) {
    const serialized = JSON.stringify(decoded);
    if (serialized.length > MAX_LAYOUT_JSON_BYTES || encoder.encode(serialized).length > MAX_LAYOUT_JSON_BYTES) {
      throw new RangeError('布局存档超过 256 KB');
    }
  }
  return decoded;
}

function normalizedDefinition(value) {
  if (!record(value) || !Array.isArray(value.boxes) || !value.boxes.length || value.boxes.length > 32) throw new TypeError('碰撞盒配置无效');
  const boxes = value.boxes.map((box) => {
    if (!record(box) || !finite3(box.center) || box.center.some((number) => Math.abs(number) > MAX_LOCAL_COORDINATE)
      || !finite3(box.size) || box.size.some((size) => size < 1e-4 || size > 100)) throw new TypeError('碰撞盒需要范围内的有限中心及正尺寸');
    return { center: [...box.center], size: [...box.size] };
  });
  for (const key of ['blocksNavigation','blocksPlacement','draggable']) if (own(value, key) && typeof value[key] !== 'boolean') throw new TypeError(`${key} 必须为布尔值`);
  return { label: typeof value.label === 'string' ? value.label.slice(0, 100) : '', boxes,
    blocksNavigation: value.blocksNavigation !== false, blocksPlacement: value.blocksPlacement !== false, draggable: value.draggable !== false };
}
function normalizedTransform(value, partial = false) {
  if (!record(value)) throw new TypeError('变换必须为对象');
  const result = {};
  for (const key of ['position','rotation','scale']) {
    if (!own(value, key) || (partial && value[key] === undefined)) { if (!partial) throw new TypeError(`缺少 ${key}`); else continue; }
    const vector = key === 'scale' && Number.isFinite(value[key]) ? [value[key],value[key],value[key]] : value[key];
    if (!finite3(vector)) throw new TypeError(`${key} 必须包含三个有限数`);
    if (key === 'position' && vector.some((number) => Math.abs(number) > MAX_POSITION)) throw new TypeError('位置超出允许范围');
    if (key === 'scale' && vector.some((number) => number < 1e-4 || number > 100)) throw new TypeError('缩放必须为范围内的正数');
    if (key === 'rotation' && vector.some((number) => Math.abs(number) > 1e6)) throw new TypeError('旋转角度超出允许范围');
    if (key === 'rotation' && (Math.abs(vector[0]) > 1e-8 || Math.abs(vector[2]) > 1e-8)) throw new TypeError('只允许绕 Y 轴旋转');
    result[key] = key === 'rotation' ? [0, vector[1], 0] : [...vector];
  }
  return result;
}

/** Explicit collider layout transactions. Furniture remains directly under scene.
 * Snapshots contain only IDs declared in definitions; the pet is never restored.
 */
export function createLayoutManager({ furniture, definitions: initialDefinitions, roomBounds, navigationBounds,
  petRadius = 0.48, getPet, setPet, getApproach, getSeatApproaches, afterUpdate = () => {}, onEvent = () => {},
  storageKey = DEFAULT_STORAGE_KEY, storageAdapter, petHeight = 1.22, navigationHeight = petHeight, groundY = 0.09,
  grandfatherUnreachableSeats = false } = {}) {
  if (!(furniture instanceof Map) || !rectValid(roomBounds) || !rectValid(navigationBounds)
    || !Number.isFinite(petRadius) || petRadius < 0 || typeof getPet !== 'function'
    || (typeof getApproach !== 'function' && typeof getSeatApproaches !== 'function')
    || (getSeatApproaches !== undefined && typeof getSeatApproaches !== 'function')
    || (setPet !== undefined && typeof setPet !== 'function') || !Number.isFinite(petHeight) || petHeight <= 0
    || !Number.isFinite(navigationHeight) || navigationHeight <= 0 || !Number.isFinite(groundY)
    || typeof grandfatherUnreachableSeats !== 'boolean') throw new TypeError('布局管理器参数无效');
  const sourceDefinitions = initialDefinitions instanceof Map ? Object.fromEntries(initialDefinitions) : initialDefinitions;
  if (!record(sourceDefinitions)) throw new TypeError('需要独立碰撞盒定义');
  const definitions = Object.create(null);
  const ids = Object.keys(sourceDefinitions);
  // v2.8：内置启动家具（来自初始 definitions）加进版本后，旧存档缺它们的条目时用默认补齐；
  // 动态注册的商店家具不在此集合，缺失仍严格拒绝（保住购买回滚的语义）。
  const builtinIds = new Set(ids);
  for (const id of ids) {
    if (!furniture.has(id) || id === 'pet') throw new TypeError(`家具不存在或不可编辑: ${id}`);
    definitions[id] = normalizedDefinition(sourceDefinitions[id]);
  }
  const colliders = new Map();
  const colliderInputs = new Map();
  const obstacles = [];
  let lampSupport = ids.includes('lamp') && ids.includes('lamp-cabinet') ? 'lamp-cabinet' : null;
  let lastGood, defaults, storageFailure = '', editSession = null;
  let legacyBlockedSeats = new Set();
  const emit = (type, detail = {}) => { try { onEvent(type, detail); } catch (error) { console.warn('Layout event listener failed', error); } };
  // Access to the browser storage getter is deferred until inside a guarded
  // persistence operation; injected hosts never touch another room's globals.
  const getStorage = () => storageAdapter === undefined ? globalThis.localStorage : storageAdapter;

  function snapshot() {
    const transforms = Object.create(null);
    for (const id of ids) {
      const root = furniture.get(id);
      // v2.8.3 孤儿护栏：id 在注册表内但家具 Map 缺失（调用方误删）时给可读错误，
      // 而不是让后续页面裸抛 "Cannot read properties of undefined (reading 'position')"。
      if (!root) throw new RangeError(`布局内部状态不一致：家具 ${id} 已从场景移除但未注销`);
      transforms[id] = { position: root.position.toArray(), rotation: [0, root.rotation.y, 0], scale: root.scale.toArray() };
    }
    return { version: VERSION, furniture: transforms, definitions: clone(definitions), lampSupport };
  }
  function seatApproaches(from=getPet()) {
    if (!getSeatApproaches) return [{id:'sofa',point:getApproach()}];
    const entries=getSeatApproaches(obstacles,navigationBounds,from);
    if (!Array.isArray(entries)) throw new TypeError('座位接近点格式无效');
    // v2.8.2：所有座位都收回仓库时允许空（室内无座是合法状态），返回空数组让校验跳过。
    return entries.filter(entry=>record(entry)&&typeof entry.id==='string'&&own(definitions,entry.id));
  }
  function seatReachable(entry,from=getPet()) {
    const approach=entry.point;
    return pointValid(from)&&pointValid(approach)&&inside(from,navigationBounds)&&inside(approach,navigationBounds)
      &&!obstacles.some(box=>inside(from,box)||inside(approach,box))
      &&createPath(from,approach,{bounds:navigationBounds,obstacles,cellSize:.18})!==null;
  }
  // Capture only at startup / accepted startup restore. Previews must never
  // turn newly obstructed seats into a legacy exception.
  function captureLegacySeats() {
    resetNavigationBaseline();
  }
  function blockedSeatIds(){return [...legacyBlockedSeats].filter(id=>own(definitions,id));}
  function getNavigationBaseline(){return [...legacyBlockedSeats];}
  function restoreNavigationBaseline(saved){
    if(!Array.isArray(saved)||saved.length>128||new Set(saved).size!==saved.length
      ||saved.some(id=>typeof id!=='string'||!own(definitions,id)&&!builtinIds.has(id)))return false;
    legacyBlockedSeats=new Set(grandfatherUnreachableSeats?saved:[]);return true;
  }
  // Only a trusted room-size / startup restore may establish a new baseline.
  // A stale point in the previous room extension must not exempt every seat.
  function resetNavigationBaseline(from=getPet()){
    if(!grandfatherUnreachableSeats)return [];
    try {
      refresh();
      if(!pointValid(from)||!inside(from,navigationBounds)||obstacles.some(box=>inside(from,box)))return null;
      const next=seatApproaches(from).filter(entry=>!seatReachable(entry,from)).map(entry=>entry.id);
      legacyBlockedSeats=new Set(next);return blockedSeatIds();
    }catch(error){emit('layout-navigation-warning',{reason:messageOf(error)});return null;}
  }
  function acceptNavigationState() {
    if(!grandfatherUnreachableSeats)return [];
    try {
      refresh();
      // Calculate all successes before mutating the baseline, so a throwing host
      // callback cannot partially retire exceptions or reverse an accepted save.
      const restored=seatApproaches().filter(entry=>legacyBlockedSeats.has(entry.id)&&seatReachable(entry)).map(entry=>entry.id);
      for(const id of legacyBlockedSeats)if(!own(definitions,id)||restored.includes(id))legacyBlockedSeats.delete(id);
    } catch(error) {emit('layout-navigation-warning',{reason:messageOf(error)});}
    return blockedSeatIds();
  }
  function parseSnapshot(value) {
    if (!record(value) || value.version !== VERSION || !record(value.furniture) || !record(value.definitions)) throw new TypeError('布局存档版本或结构无效');
    const savedIds = Object.keys(value.furniture);
    if (savedIds.some((id) => !ids.includes(id))) throw new TypeError('存档包含未知家具');
    const result = { transforms: Object.create(null), definitions: Object.create(null), lampSupport: value.lampSupport };
    if (result.lampSupport !== null && (!own(SUPPORTS, result.lampSupport) || !ids.includes(result.lampSupport) || !ids.includes('lamp'))) throw new TypeError('台灯支架无效');
    for (const id of ids) {
      if (!own(value.furniture,id) || !own(value.definitions,id)) {
        // 旧版存档缺少本轮新增的内置家具（如地面盆栽）：用默认位置/碰撞补齐，保留其余布局。
        if (!builtinIds.has(id) || !own(defaults.furniture,id) || !own(defaults.definitions,id)) throw new TypeError(`缺少家具 ${id}`);
        result.transforms[id] = normalizedTransform(defaults.furniture[id]);
        result.definitions[id] = normalizedDefinition(defaults.definitions[id]);
        continue;
      }
      result.transforms[id] = normalizedTransform(value.furniture[id]);
      result.definitions[id] = normalizedDefinition(value.definitions[id]);
    }
    return result;
  }
  function applyTransform(root, transform) {
    if (transform.position) root.position.fromArray(transform.position);
    if (transform.rotation) root.rotation.set(0,transform.rotation[1],0);
    if (transform.scale) root.scale.fromArray(transform.scale);
    root.updateMatrixWorld(true);
  }
  function applyParsed(parsed) {
    for (const id of ids) {
      const root = furniture.get(id);
      if (!root) throw new RangeError(`布局内部状态不一致：家具 ${id} 已从场景移除但未注销`);
      applyTransform(root, parsed.transforms[id]);
      definitions[id] = parsed.definitions[id];
    }
    lampSupport = parsed.lampSupport;
  }
  function refresh() {
    for (const id of ids) {
      const root = furniture.get(id);
      if (!root) throw new RangeError(`布局内部状态不一致：家具 ${id} 已从场景移除但未注销`);
      root.updateWorldMatrix(true, false);
    }
    afterUpdate();
    const nextColliders = new Map(), nextInputs = new Map();
    let changed = colliders.size !== ids.length;
    for (const id of ids) {
      const root = furniture.get(id), definition = definitions[id];
      const input = [...root.matrixWorld.elements, definition.blocksNavigation, definition.blocksPlacement, definition.boxes.length];
      for (const box of definition.boxes) input.push(...box.center, ...box.size);
      const previous = colliderInputs.get(id);
      let collider = colliders.get(id);
      if (!collider || !previous || input.length !== previous.length || input.some((value, index) => value !== previous[index])) {
        collider = createFurnitureCollider({ id, boxes: definition.boxes, matrixWorld: root.matrixWorld });
        for (const box of collider.boxes) {
          const dimensions = [box.aabb.maxX - box.aabb.minX, box.maxY - box.minY, box.aabb.maxZ - box.aabb.minZ];
          if (dimensions.some((size) => !Number.isFinite(size) || size > MAX_WORLD_SIZE + 1e-8)
            || [box.center.x, box.center.y, box.center.z].some((number) => Math.abs(number) > MAX_POSITION)) {
            throw new RangeError(`${id} 的世界碰撞盒超出允许范围`);
          }
        }
        changed = true;
      }
      nextColliders.set(id, collider); nextInputs.set(id, input);
    }
    if (changed) {
      const nextObstacles = toPathObstacles([...nextColliders.values()].filter((collider) => definitions[collider.id].blocksNavigation),
        { padding: petRadius, minY: groundY, maxY: groundY + navigationHeight });
      colliders.clear(); colliderInputs.clear();
      for (const [id, collider] of nextColliders) { colliders.set(id, collider); colliderInputs.set(id, nextInputs.get(id)); }
      obstacles.splice(0, obstacles.length, ...nextObstacles);
    }
    return { colliders, obstacles };
  }
  function restore(value) {
    let parsed;
    try { parsed = parseSnapshot(value); } catch (error) { emit('layout-restore-rejected',{reason:messageOf(error)}); return false; }
    const previous = snapshot();
    try { applyParsed(parsed); refresh(); return true; }
    catch (error) {
      try { applyParsed(parseSnapshot(previous)); refresh(); } catch (rollbackError) { console.error('Layout rollback failed',rollbackError); }
      emit('layout-restore-rejected',{reason:messageOf(error)}); return false;
    }
  }
  function supportFits(supportId, lampCollider) {
    const root = furniture.get(supportId), support = SUPPORTS[supportId];
    if (!root || !support || !lampCollider?.boxes.length) return false;
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    return lampCollider.boxes.every((box) => box.footprint.every((point) => {
      const local = new Vector3(point.x,0,point.z).applyMatrix4(inverse);
      return Math.abs(local.x) <= support.halfX + 1e-5 && Math.abs(local.z) <= support.halfZ + 1e-5;
    }));
  }
  function topHeight(supportId) {
    return new Vector3(0,SUPPORTS[supportId].top,0).applyMatrix4(furniture.get(supportId).matrixWorld).y;
  }
  function isSupportedPair(first, second) {
    if (!lampSupport || !((first === 'lamp' && second === lampSupport) || (second === 'lamp' && first === lampSupport))) return false;
    const lamp = furniture.get('lamp');
    return supportFits(lampSupport, colliders.get('lamp')) && Math.abs(lamp.getWorldPosition(new Vector3()).y - topHeight(lampSupport)) < 0.04;
  }
  function snapLamp() {
    const lamp = furniture.get('lamp');
    if (!lamp || !definitions.lamp) return;
    lamp.updateMatrixWorld(true);
    const candidate = createFurnitureCollider({id:'lamp',boxes:definitions.lamp.boxes,matrixWorld:lamp.matrixWorld});
    const preferred = [lampSupport, 'lamp-cabinet','table'].filter((id,index,array) => id && array.indexOf(id) === index);
    const support = preferred.find((id) => ids.includes(id) && supportFits(id,candidate));
    lampSupport = support ?? null;
    const world = lamp.getWorldPosition(new Vector3()); world.y = support ? topHeight(support) : 0.04;
    if (lamp.parent) lamp.parent.worldToLocal(world);
    lamp.position.copy(world); lamp.updateMatrixWorld(true);
  }
  function previewTransform(id, value) {
    if (!own(definitions,id) || !definitions[id].draggable) return false;
    let transform;
    try { transform = normalizedTransform(value,true); } catch (error) { emit('layout-preview-rejected',{id,reason:messageOf(error)}); return false; }
    const before = snapshot();
    try {
      const root = furniture.get(id); root.updateMatrixWorld(true);
      const oldWorld = root.matrixWorld.clone();
      const lamp = furniture.get('lamp');
      if (lamp) lamp.updateMatrixWorld(true);
      const oldLampWorld = lamp?.matrixWorld.clone();
      applyTransform(root,transform);
      if (id !== 'lamp' && lampSupport === id && lamp && oldLampWorld) {
        const delta = new Matrix4().multiplyMatrices(root.matrixWorld,oldWorld.invert());
        const lampMatrix = new Matrix4().multiplyMatrices(delta,oldLampWorld);
        if (lamp.parent) lampMatrix.premultiply(lamp.parent.matrixWorld.clone().invert());
        const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
        lampMatrix.decompose(position,rotation,scale);
        const euler = new Euler().setFromQuaternion(rotation,'YXZ');
        applyTransform(lamp,{position:position.toArray(),rotation:[0,euler.y,0],scale:scale.toArray()});
      } else if (id === 'lamp') snapLamp();
      refresh(); return true;
    } catch (error) { restore(before); emit('layout-preview-rejected',{id,reason:messageOf(error)}); return false; }
  }
  // Resizing changes the walking boundary while the pet may still be standing
  // in the old extension. Find a safe spot without changing furniture or state.
  function findSafePetPosition({checkSeats=true}={}) {
    if(typeof checkSeats!=='boolean')return null;
    refresh();
    const pet=getPet(),safe=point=>pointValid(point)&&inside(point,navigationBounds)&&!obstacles.some(box=>inside(point,box));
    const approaches=seatApproaches().map(entry=>entry.point);
    const candidates=[];
    const inset=petRadius+.06;
    if(pointValid(pet))candidates.push({x:pet.x,z:pet.z},{x:Math.max(navigationBounds.minX+inset,Math.min(navigationBounds.maxX-inset,pet.x)),z:Math.max(navigationBounds.minZ+inset,Math.min(navigationBounds.maxZ-inset,pet.z))});
    candidates.push(...approaches,{x:.65,z:2.83});
    // Seat-free rooms still need a safe spawn. Search from the centre outwards.
    const grid=[];
    for(let x=navigationBounds.minX+.15;x<navigationBounds.maxX;x+=.4)for(let z=navigationBounds.minZ+.15;z<navigationBounds.maxZ;z+=.4)grid.push({x,z});
    grid.sort((a,b)=>Math.hypot(a.x-(pet?.x||0),a.z-(pet?.z||0))-Math.hypot(b.x-(pet?.x||0),b.z-(pet?.z||0)));
    candidates.push(...grid);
    return candidates.find(point=>safe(point)&&(!checkSeats||seatApproaches(point).every(({id,point:approach})=>legacyBlockedSeats.has(id)||safe(approach)&&createPath(point,approach,{bounds:navigationBounds,obstacles,cellSize:.18})!==null)))||null;
  }
  function validate({checkPath=true}={}) {
    try {
      refresh();
      for (const id of ids) {
        normalizedTransform({position:furniture.get(id).position.toArray(),rotation:[furniture.get(id).rotation.x,furniture.get(id).rotation.y,furniture.get(id).rotation.z],scale:furniture.get(id).scale.toArray()});
        normalizedDefinition(definitions[id]);
        const mounted=furniture.get(id);
        if(mounted.userData.wallHanging){
          const left=Math.abs(mounted.rotation.y-Math.PI/2)<.001,back=Math.abs(mounted.rotation.y)<.001;
          const target=left?roomBounds.minX+.18:roomBounds.minZ+.18,actual=left?mounted.position.x:mounted.position.z;
          const halfHeight=(mounted.userData.hangingHeight||1.2)*mounted.scale.y/2;
          if((!left&&!back)||Math.abs(actual-target)>.025||mounted.position.y-halfHeight<.45||mounted.position.y+halfHeight>5.12)return {valid:false,reason:'挂件需要贴在左墙或后墙的合适高度',id};
        }
        if (!isColliderWithinBounds(colliders.get(id),roomBounds)) return {valid:false,reason:`${definitions[id].label || id} 超出房间边界`,id};
      }
      const solid = ids.filter((id) => definitions[id].blocksPlacement);
      for (let first = 0; first < solid.length; first++) for (let second = first + 1; second < solid.length; second++) {
        const a=solid[first],b=solid[second];
        if (!isSupportedPair(a,b) && collidersOverlap(colliders.get(a),colliders.get(b))) return {valid:false,reason:`${definitions[a].label || a} 与 ${definitions[b].label || b} 重叠`,ids:[a,b]};
      }
      if (lampSupport && !isSupportedPair('lamp',lampSupport)) return {valid:false,reason:'台灯已离开支撑台面',id:'lamp'};
      const pet=getPet();
      if (!pointValid(pet) || !inside(pet,navigationBounds)) return {valid:false,reason:'宠物位置不在可行走范围内'};
      if (obstacles.some((box) => inside(pet,box))) return {valid:false,reason:'家具会困住宠物'};
      for (const {id,point:approach} of seatApproaches()) {
        if(legacyBlockedSeats.has(id))continue;
        const label=id==='sofa'?'沙发':definitions[id]?.label||id;
        if (!pointValid(approach) || !inside(approach,navigationBounds)) return {valid:false,reason:`${label}接近点超出可行走范围`,id};
        if (obstacles.some((box) => inside(approach,box))) return {valid:false,reason:`家具挡住了${label}接近点`,id};
        if (checkPath && createPath(pet,approach,{bounds:navigationBounds,obstacles,cellSize:0.18}) === null) return {valid:false,reason:`宠物无法到达${label}，请留出通道`,id};
      }
      return {valid:true,reason:''};
    } catch (error) { return {valid:false,reason:`布局配置无效：${messageOf(error)}`}; }
  }
  function commit(beforeSnapshot,{persist:shouldPersist=false}={}) {
    const goodBefore=lastGood;
    const result=validate();
    if (!result.valid) {
      if (!restore(beforeSnapshot) && lastGood) restore(lastGood);
      emit('layout-invalid',{reason:result.reason}); return false;
    }
    if (shouldPersist&&!persist()) {
      if (!restore(beforeSnapshot) && goodBefore) restore(goodBefore);
      lastGood=goodBefore;
      emit('layout-invalid',{reason:storageFailure||'布局保存失败'});return false;
    }
    lastGood=snapshot();
    acceptNavigationState();
    emit('layout-change',{lampSupport}); return true;
  }
  function updateCollider(id,patch,boxIndex=0) {
    if (!own(definitions,id) || !record(patch) || !Number.isInteger(boxIndex) || boxIndex < 0 || boxIndex >= definitions[id].boxes.length) return false;
    const before=snapshot(), candidate=clone(definitions[id]);
    if (own(patch,'center')) candidate.boxes[boxIndex].center=patch.center;
    if (own(patch,'size')) candidate.boxes[boxIndex].size=patch.size;
    for (const key of ['blocksNavigation','blocksPlacement']) if (own(patch,key)) candidate[key]=patch[key];
    try { definitions[id]=normalizedDefinition(candidate); refresh(); }
    catch (error) { restore(before); emit('layout-invalid',{id,reason:messageOf(error)}); return false; }
    return commit(before);
  }
  function writeStoredLayout(value,{force=false}={}) {
    storageFailure = '';
    if (editSession&&!force) {emit('layout-save-deferred');return true;}
    try {
      const storage=getStorage();
      if (!storage || typeof storage.setItem !== 'function') throw new Error('当前环境不支持本地存储');
      const serialized=JSON.stringify(value);
      if (serialized.length > MAX_LAYOUT_JSON_BYTES || encoder.encode(serialized).length > MAX_LAYOUT_JSON_BYTES) throw new RangeError('布局存档超过 256 KB');
      storage.setItem(storageKey,serialized);
      emit('layout-saved'); return true;
    } catch (error) {storageFailure=messageOf(error);emit('layout-save-failed',{reason:storageFailure});return false;}
  }
  function persist() {
    const result=validate();
    if (!result.valid) {emit('layout-save-failed',{reason:result.reason});return false;}
    const saved=writeStoredLayout(snapshot());
    if(saved&&!editSession)acceptNavigationState();
    return saved;
  }
  /** App-facing import: bounded JSON/object input, full placement/path checks,
   * optional synchronous persistence, and rollback to the current layout on any
   * failure. Unlike startup loadSaved(), imports never reset to defaults or move
   * the pet. Missing storage is only an error when persist:true is requested.
   */
  function importLayout(value, options={}) {
    const goodBefore=lastGood;
    let before=null,applied=false;
    try {
      if (!record(options)) throw new TypeError('导入选项必须为对象');
      const shouldPersist=options.persist??false;
      if (typeof shouldPersist !== 'boolean') throw new TypeError('persist 必须为布尔值');
      const parsed=parseSnapshot(decodeLayout(value));
      before=snapshot();applied=true;
      applyParsed(parsed);
      const result=validate();
      if (!result.valid) throw new Error(result.reason);
      const imported=snapshot();
      if (shouldPersist&&!writeStoredLayout(imported)) throw new Error(storageFailure||'布局保存失败');
      lastGood=imported;
      acceptNavigationState();
      emit('layout-imported',{persisted:shouldPersist&&!editSession});
      return {ok:true,reason:''};
    } catch (error) {
      if (applied&&before&&!restore(before)) emit('layout-import-rollback-failed');
      lastGood=goodBefore;
      const reason=messageOf(error);
      emit('layout-import-rejected',{reason});
      return {ok:false,reason};
    }
  }
  function loadSaved() {
    let petBefore=null,relocated=false;
    const baselineBefore=new Set(legacyBlockedSeats);
    try {
      const storage=getStorage();
      if (!storage) return false;
      if (typeof storage.getItem !== 'function') throw new TypeError('存储适配器缺少 getItem');
      const saved=storage.getItem(storageKey);
      if (!saved) return false;
      const initialPet=getPet();
      if (pointValid(initialPet)) petBefore={x:initialPet.x,z:initialPet.z};
      if (!restore(decodeLayout(saved))) throw new Error('存档结构无效');
      // A valid saved layout may occupy the fixed startup spawn. Only loading
      // may relocate the pet; ordinary edit validation/rollback never does.
      const pet=getPet(),approach=seatApproaches().map(entry=>entry.point).find(point=>pointValid(point)&&inside(point,navigationBounds)&&!obstacles.some(box=>inside(point,box)));
      const unsafePet=!pointValid(pet)||!inside(pet,navigationBounds)||obstacles.some(box=>inside(pet,box));
      const safeApproach=pointValid(approach)&&inside(approach,navigationBounds)&&!obstacles.some(box=>inside(approach,box));
      if (setPet&&unsafePet&&safeApproach) {
        relocated=true;
        setPet({x:approach.x,z:approach.z});
      }
      captureLegacySeats();
      const result=validate();
      if (!result.valid) throw new Error(result.reason);
      lastGood=snapshot(); emit('layout-loaded'); return true;
    } catch (error) {
      restore(defaults);
      legacyBlockedSeats=baselineBefore;
      if (relocated&&petBefore) {
        try {setPet(petBefore);} catch (petError) {emit('layout-pet-restore-failed',{reason:petError.message});}
      }
      lastGood=snapshot();
      emit('layout-load-rejected',{reason:messageOf(error)}); return false;
    }
  }
  /** Transactions cover edits to the current registry, not account purchases.
   * Register/unregister/expansion must be completed outside an edit session.
   */
  function beginEdit() {
    if (editSession || !validate().valid) return false;
    editSession={entry:snapshot(),collectionChanged:false,seatBaseline:new Set(legacyBlockedSeats)};emit('layout-edit-begin');return true;
  }
  function finishEdit({save=true,persist:shouldPersist=false}={}) {
    if (!editSession || typeof save!=='boolean' || typeof shouldPersist!=='boolean') return false;
    const session=editSession;
    if (!save) {
      const before=snapshot(),baselineBefore=new Set(legacyBlockedSeats);
      if (!restore(session.entry)) return false;
      legacyBlockedSeats=new Set(session.seatBaseline);
      // Warehouse transactions already persisted the current layout together
      // with their inventory change. Persist the canceled transforms too, so a
      // reload cannot resurrect earlier, unsaved moves. Hosts opting out of
      // persistence and edits without collection changes retain their behavior.
      if (session.collectionChanged && shouldPersist) {
        const result=validate();
        if (!result.valid) {
          restore(before);legacyBlockedSeats=baselineBefore;emit('layout-invalid',{reason:result.reason});return false;
        }
        if (!writeStoredLayout(snapshot(),{force:true})) {
          restore(before);legacyBlockedSeats=baselineBefore;return false;
        }
      }
      legacyBlockedSeats=new Set(session.seatBaseline);lastGood=snapshot();editSession=null;emit('layout-change',{canceled:true,lampSupport});return true;
    }
    const result=validate();
    if (!result.valid) {emit('layout-invalid',{reason:result.reason});return false;}
    if (shouldPersist) {
      // Only this final write escapes deferral. A quota/adapter error leaves the
      // original entry snapshot open so users can retry or cancel safely.
      const saved=writeStoredLayout(snapshot(),{force:true});
      if (!saved) return false;
    }
    editSession=null;lastGood=snapshot();acceptNavigationState();emit('layout-change',{saved:save,lampSupport});return true;
  }
  function registerFurniture(id,root,definition) {
    if (typeof id!=='string' || !id || id.length>128 || ['pet','__proto__','prototype','constructor'].includes(id)
      || own(definitions,id) || furniture.get(id)!==root || !root?.isObject3D || ids.length>=128) return false;
    const before=snapshot(),goodBefore=lastGood,defaultsBefore=defaults;
    try {
      const normalized=normalizedDefinition(definition);
      normalizedTransform({position:root.position.toArray(),rotation:root.rotation.toArray().slice(0,3),scale:root.scale.toArray()});
      ids.push(id);definitions[id]=normalized;
      if(id==='lamp')snapLamp();
      const result=validate();if (!result.valid) throw new Error(result.reason);
      // v2.8.2 仓库：装修编辑会话内也允许注册（摆回家具），并同步入口快照，
      // 取消装修时新摆回的家具保持生效，与仓库事务一致。
      if (editSession) {
        editSession.entry.furniture[id] = normalizedTransform({position:root.position.toArray(),rotation:root.rotation.toArray().slice(0,3),scale:root.scale.toArray()});
        editSession.entry.definitions[id] = normalized;
      }
      // The account's current registered collection becomes a compatible safe
      // fallback; old snapshots remain restorable after unregistering this ID.
      defaults=snapshot();lastGood=clone(defaults);
      if (editSession) editSession.collectionChanged=true;
      emit('layout-change',{registered:id,lampSupport});return true;
    } catch (error) {
      const index=ids.indexOf(id);if(index!==-1)ids.splice(index,1);delete definitions[id];
      if (editSession) { delete editSession.entry.furniture[id]; delete editSession.entry.definitions[id]; }
      restore(before);lastGood=goodBefore;defaults=defaultsBefore;
      emit('layout-register-rejected',{id,reason:messageOf(error)});return false;
    }
  }
  function unregisterFurniture(id) {
    const index=ids.indexOf(id);
    if (index===-1) return false;
    const before=snapshot(),definition=definitions[id],supportBefore=lampSupport;
    const goodBefore=lastGood,defaultsBefore=defaults;
    const entryTransform = editSession?.entry.furniture?.[id];
    const entryDefinition = editSession?.entry.definitions?.[id];
    const entryLampSupport = editSession?.entry.lampSupport;
    ids.splice(index,1);delete definitions[id];
    if (id==='lamp'||id===lampSupport)lampSupport=null;
    // v2.8.2 仓库：装修编辑会话内也允许注销（收回家具），并同步入口快照，
    // 取消装修时已收回的家具不会复活，与仓库事务一致。
    if (editSession) { delete editSession.entry.furniture[id]; delete editSession.entry.definitions[id]; if (editSession.entry.lampSupport===id) editSession.entry.lampSupport=null; }
    try {
      const result=validate();if(!result.valid)throw new Error(result.reason);
      defaults=snapshot();lastGood=clone(defaults);
      if (editSession) editSession.collectionChanged=true;
      emit('layout-change',{unregistered:id,lampSupport});return true;
    } catch (error) {
      ids.splice(index,0,id);definitions[id]=definition;lampSupport=supportBefore;
      if (editSession) {
        if (entryTransform) editSession.entry.furniture[id] = entryTransform;
        else delete editSession.entry.furniture[id];
        if (entryDefinition) editSession.entry.definitions[id] = entryDefinition;
        else delete editSession.entry.definitions[id];
        editSession.entry.lampSupport = entryLampSupport;
      }
      restore(before);lastGood=goodBefore;defaults=defaultsBefore;
      emit('layout-unregister-rejected',{id,reason:messageOf(error)});return false;
    }
  }
  function setBounds(newRoomBounds,newNavigationBounds=newRoomBounds) {
    if(editSession||!rectValid(newRoomBounds)||!rectValid(newNavigationBounds))return false;
    const keys=['minX','maxX','minZ','maxZ'];
    if(roomBounds===navigationBounds&&keys.some(key=>newRoomBounds[key]!==newNavigationBounds[key]))return false;
    const beforeRoom={...roomBounds},beforeNavigation={...navigationBounds};
    const nextRoom=Object.fromEntries(keys.map(key=>[key,newRoomBounds[key]]));
    const nextNavigation=Object.fromEntries(keys.map(key=>[key,newNavigationBounds[key]]));
    Object.assign(roomBounds,nextRoom);Object.assign(navigationBounds,nextNavigation);
    const result=validate();
    if(!result.valid){Object.assign(roomBounds,beforeRoom);Object.assign(navigationBounds,beforeNavigation);refresh();emit('layout-bounds-rejected',{reason:result.reason});return false;}
    emit('layout-bounds-change',{roomBounds:{...roomBounds},navigationBounds:{...navigationBounds}});return true;
  }
  refresh();captureLegacySeats(); defaults=snapshot();lastGood=clone(defaults);
  return {snapshot,restore,refresh,previewTransform,validate,findSafePetPosition,commit,updateCollider,persist,loadSaved,importLayout,
    beginEdit,finishEdit,registerFurniture,unregisterFurniture,setBounds,acceptNavigationState,resetNavigationBaseline,getNavigationBaseline,restoreNavigationBaseline,get blockedSeats(){return blockedSeatIds();},get editing(){return Boolean(editSession);},
    get obstacles(){return obstacles;},get colliders(){return colliders;},get definitions(){return definitions;},get lampSupport(){return lampSupport;},storageKey};
}
