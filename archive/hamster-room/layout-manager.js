import { Matrix4, Quaternion, Vector3, Euler } from './vendor/three/three.module.js';
import { createFurnitureCollider, collidersOverlap, isColliderWithinBounds, toPathObstacles } from './colliders.mjs';
import { createPath } from './navigation.mjs';

const VERSION = 3;
const DEFAULT_STORAGE_KEY = 'hamster-room-layout-v3';
const SUPPORTS = {
  'lamp-cabinet': { top: 1.12, halfX: 1.27 / 2, halfZ: 1.14 / 2 },
  table: { top: 0.40, halfX: 0.99 / 2, halfZ: 0.5 },
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite3 = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const clone = (value) => JSON.parse(JSON.stringify(value));
const pointValid = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.z);
const inside = (point, box) => point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;
const rectValid = (box) => box && ['minX','maxX','minZ','maxZ'].every((key) => Number.isFinite(box[key])) && box.minX <= box.maxX && box.minZ <= box.maxZ;

function normalizedDefinition(value) {
  if (!record(value) || !Array.isArray(value.boxes) || !value.boxes.length || value.boxes.length > 32) throw new TypeError('碰撞盒配置无效');
  const boxes = value.boxes.map((box) => {
    if (!record(box) || !finite3(box.center) || !finite3(box.size) || box.size.some((size) => size <= 0 || size > 100)) throw new TypeError('碰撞盒需要有限中心及正尺寸');
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
    if (key === 'scale' && vector.some((number) => number <= 0 || number > 100)) throw new TypeError('缩放必须为正数');
    if (key === 'rotation' && (Math.abs(vector[0]) > 1e-8 || Math.abs(vector[2]) > 1e-8)) throw new TypeError('只允许绕 Y 轴旋转');
    result[key] = key === 'rotation' ? [0, vector[1], 0] : [...vector];
  }
  return result;
}

/** Explicit collider layout transactions. Furniture remains directly under scene.
 * Snapshots contain only IDs declared in definitions; the pet is never restored.
 */
export function createLayoutManager({ furniture, definitions: initialDefinitions, roomBounds, navigationBounds,
  petRadius = 0.48, getPet, setPet, getApproach, afterUpdate = () => {}, onEvent = () => {},
  storageKey = DEFAULT_STORAGE_KEY, petHeight = 1.22, navigationHeight = petHeight, groundY = 0.09 } = {}) {
  if (!(furniture instanceof Map) || !rectValid(roomBounds) || !rectValid(navigationBounds)
    || !Number.isFinite(petRadius) || petRadius < 0 || typeof getPet !== 'function' || typeof getApproach !== 'function'
    || (setPet !== undefined && typeof setPet !== 'function')) throw new TypeError('布局管理器参数无效');
  const sourceDefinitions = initialDefinitions instanceof Map ? Object.fromEntries(initialDefinitions) : initialDefinitions;
  if (!record(sourceDefinitions)) throw new TypeError('需要独立碰撞盒定义');
  const definitions = Object.create(null);
  const ids = Object.keys(sourceDefinitions);
  for (const id of ids) {
    if (!furniture.has(id) || id === 'pet') throw new TypeError(`家具不存在或不可编辑: ${id}`);
    definitions[id] = normalizedDefinition(sourceDefinitions[id]);
  }
  const colliders = new Map();
  const obstacles = [];
  let lampSupport = ids.includes('lamp') && ids.includes('lamp-cabinet') ? 'lamp-cabinet' : null;
  let lastGood, defaults;
  const emit = (type, detail = {}) => { try { onEvent(type, detail); } catch (error) { console.warn('Layout event listener failed', error); } };

  function snapshot() {
    const transforms = Object.create(null);
    for (const id of ids) {
      const root = furniture.get(id);
      transforms[id] = { position: root.position.toArray(), rotation: [0, root.rotation.y, 0], scale: root.scale.toArray() };
    }
    return { version: VERSION, furniture: transforms, definitions: clone(definitions), lampSupport };
  }
  function parseSnapshot(value) {
    if (!record(value) || value.version !== VERSION || !record(value.furniture) || !record(value.definitions)) throw new TypeError('布局存档版本或结构无效');
    if (Object.keys(value.furniture).length !== ids.length || Object.keys(value.definitions).length !== ids.length) throw new TypeError('存档家具与当前房间不一致');
    const result = { transforms: Object.create(null), definitions: Object.create(null), lampSupport: value.lampSupport };
    if (result.lampSupport !== null && (!own(SUPPORTS, result.lampSupport) || !ids.includes(result.lampSupport) || !ids.includes('lamp'))) throw new TypeError('台灯支架无效');
    for (const id of ids) {
      if (!own(value.furniture,id) || !own(value.definitions,id)) throw new TypeError(`缺少家具 ${id}`);
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
      applyTransform(furniture.get(id), parsed.transforms[id]);
      definitions[id] = parsed.definitions[id];
    }
    lampSupport = parsed.lampSupport;
  }
  function refresh() {
    for (const id of ids) furniture.get(id).updateMatrixWorld(true);
    afterUpdate();
    colliders.clear();
    for (const id of ids) colliders.set(id, createFurnitureCollider({ id, boxes: definitions[id].boxes, matrixWorld: furniture.get(id).matrixWorld }));
    obstacles.splice(0,obstacles.length,...toPathObstacles([...colliders.values()].filter((collider) => definitions[collider.id].blocksNavigation),
      { padding: petRadius, minY: groundY, maxY: groundY + navigationHeight }));
    return { colliders, obstacles };
  }
  function restore(value) {
    let parsed;
    try { parsed = parseSnapshot(value); } catch (error) { emit('layout-restore-rejected',{reason:error.message}); return false; }
    const previous = snapshot();
    try { applyParsed(parsed); refresh(); return true; }
    catch (error) {
      try { applyParsed(parseSnapshot(previous)); refresh(); } catch (rollbackError) { console.error('Layout rollback failed',rollbackError); }
      emit('layout-restore-rejected',{reason:error.message}); return false;
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
    try { transform = normalizedTransform(value,true); } catch (error) { emit('layout-preview-rejected',{id,reason:error.message}); return false; }
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
    } catch (error) { restore(before); emit('layout-preview-rejected',{id,reason:error.message}); return false; }
  }
  function validate({checkPath=true}={}) {
    try {
      refresh();
      for (const id of ids) {
        normalizedTransform({position:furniture.get(id).position.toArray(),rotation:[furniture.get(id).rotation.x,furniture.get(id).rotation.y,furniture.get(id).rotation.z],scale:furniture.get(id).scale.toArray()});
        normalizedDefinition(definitions[id]);
        if (!isColliderWithinBounds(colliders.get(id),roomBounds)) return {valid:false,reason:`${definitions[id].label || id} 超出房间边界`,id};
      }
      const solid = ids.filter((id) => definitions[id].blocksPlacement);
      for (let first = 0; first < solid.length; first++) for (let second = first + 1; second < solid.length; second++) {
        const a=solid[first],b=solid[second];
        if (!isSupportedPair(a,b) && collidersOverlap(colliders.get(a),colliders.get(b))) return {valid:false,reason:`${definitions[a].label || a} 与 ${definitions[b].label || b} 重叠`,ids:[a,b]};
      }
      if (lampSupport && !isSupportedPair('lamp',lampSupport)) return {valid:false,reason:'台灯已离开支撑台面',id:'lamp'};
      const pet=getPet(),approach=getApproach();
      if (!pointValid(pet) || !inside(pet,navigationBounds)) return {valid:false,reason:'宠物位置不在可行走范围内'};
      if (obstacles.some((box) => inside(pet,box))) return {valid:false,reason:'家具会困住宠物'};
      if (!pointValid(approach) || !inside(approach,navigationBounds)) return {valid:false,reason:'沙发接近点超出可行走范围'};
      if (obstacles.some((box) => inside(approach,box))) return {valid:false,reason:'家具挡住了沙发接近点'};
      if (checkPath && createPath(pet,approach,{bounds:navigationBounds,obstacles,cellSize:0.18}) === null) return {valid:false,reason:'宠物无法到达沙发，请留出通道'};
      return {valid:true,reason:''};
    } catch (error) { return {valid:false,reason:`布局配置无效：${error.message}`}; }
  }
  function commit(beforeSnapshot,{persist:shouldPersist=false}={}) {
    const result=validate();
    if (!result.valid) {
      if (!restore(beforeSnapshot) && lastGood) restore(lastGood);
      emit('layout-invalid',{reason:result.reason}); return false;
    }
    lastGood=snapshot();
    if (shouldPersist) persist();
    emit('layout-change',{lampSupport}); return true;
  }
  function updateCollider(id,patch,boxIndex=0) {
    if (!own(definitions,id) || !record(patch) || !Number.isInteger(boxIndex) || boxIndex < 0 || boxIndex >= definitions[id].boxes.length) return false;
    const before=snapshot(), candidate=clone(definitions[id]);
    if (own(patch,'center')) candidate.boxes[boxIndex].center=patch.center;
    if (own(patch,'size')) candidate.boxes[boxIndex].size=patch.size;
    for (const key of ['blocksNavigation','blocksPlacement']) if (own(patch,key)) candidate[key]=patch[key];
    try { definitions[id]=normalizedDefinition(candidate); refresh(); }
    catch (error) { restore(before); emit('layout-invalid',{id,reason:error.message}); return false; }
    return commit(before);
  }
  function persist() {
    const result=validate();
    if (!result.valid) {emit('layout-save-failed',{reason:result.reason});return false;}
    try {
      const storage=globalThis.localStorage;
      if (!storage) throw new Error('当前环境不支持本地存储');
      storage.setItem(storageKey,JSON.stringify(snapshot()));
      emit('layout-saved'); return true;
    } catch (error) {emit('layout-save-failed',{reason:error.message});return false;}
  }
  function loadSaved() {
    let petBefore=null,relocated=false;
    try {
      const storage=globalThis.localStorage;
      if (!storage) return false;
      const saved=storage.getItem(storageKey);
      if (!saved) return false;
      const initialPet=getPet();
      if (pointValid(initialPet)) petBefore={x:initialPet.x,z:initialPet.z};
      if (!restore(JSON.parse(saved))) throw new Error('存档结构无效');
      // A valid saved layout may occupy the fixed startup spawn. Only loading
      // may relocate the pet; ordinary edit validation/rollback never does.
      const pet=getPet(),approach=getApproach();
      const unsafePet=!pointValid(pet)||!inside(pet,navigationBounds)||obstacles.some(box=>inside(pet,box));
      const safeApproach=pointValid(approach)&&inside(approach,navigationBounds)&&!obstacles.some(box=>inside(approach,box));
      if (setPet&&unsafePet&&safeApproach) {
        relocated=true;
        setPet({x:approach.x,z:approach.z});
      }
      const result=validate();
      if (!result.valid) throw new Error(result.reason);
      lastGood=snapshot(); emit('layout-loaded'); return true;
    } catch (error) {
      restore(defaults);
      if (relocated&&petBefore) {
        try {setPet(petBefore);} catch (petError) {emit('layout-pet-restore-failed',{reason:petError.message});}
      }
      lastGood=snapshot();
      emit('layout-load-rejected',{reason:error.message}); return false;
    }
  }
  refresh(); defaults=snapshot();lastGood=clone(defaults);
  return {snapshot,restore,refresh,previewTransform,validate,commit,updateCollider,persist,loadSaved,
    get obstacles(){return obstacles;},get colliders(){return colliders;},get definitions(){return definitions;},get lampSupport(){return lampSupport;},storageKey};
}
