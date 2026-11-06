import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createEconomy,SHOP_CATALOG,STORAGE_CATALOG} from '../economy.mjs';
import {FLOOR_CATALOG,WALL_CATALOG,WALL_PAINTS} from '../surface-catalog.mjs';
import {createWallHanging,createFloorFinish,applyWallPaint,resolveWallPaint} from '../surface-models.mjs';
import {buildDecor} from '../decor.js';
import {Box3,Scene,MeshToonMaterial,Vector3} from '../vendor/three/three.module.js';

function memory(){return {data:new Map(),writes:0,blocked:false,getItem(key){return this.data.get(key)??null;},setItem(key,value){if(this.blocked)throw new Error('quota');this.data.set(key,value);this.writes++;}};}
const accountKey='surface-account';
const create=(storage,initialBalance=100000)=>createEconomy({storageAdapter:storage,storageKey:accountKey,initialBalance});
function assets(t){const cache=new Map(),roots=[];t.after(()=>{const geometry=new Set(),materials=new Set(cache.values());for(const root of roots)root.traverse(mesh=>{if(mesh.isMesh){geometry.add(mesh.geometry);materials.add(mesh.material);}});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());});return {materials:color=>{if(!cache.has(color))cache.set(color,new MeshToonMaterial({color}));return cache.get(color);},roots};}
function inspect(root){let meshes=0,triangles=0;const hash=createHash('sha256');root.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;const p=mesh.geometry.getAttribute('position');assert.ok(p?.count>0);for(const value of p.array)assert.ok(Number.isFinite(value),'model coordinates must be finite');triangles+=(mesh.geometry.index?.count??p.count)/3;hash.update(new Uint8Array(p.array.buffer,p.array.byteOffset,p.array.byteLength));assert.ok(mesh.layers.isEnabled(1));});return {meshes,triangles,hash:hash.digest('hex'),bounds:new Box3().setFromObject(root)};}

test('legacy accounts migrate appearance without resetting ownership, inventory or balance',()=>{
  const storage=memory(),economy=create(storage,1200);assert.equal(economy.purchase('cloud-table',{requestId:'old-buy'}).ok,true);assert.equal(economy.storeFurniture('cloud-table',{requestId:'old-store'}).ok,true);
  const legacy=JSON.parse(storage.data.get(accountKey));delete legacy.appearance;storage.data.set(accountKey,JSON.stringify(legacy));const writes=storage.writes;
  const loaded=create(storage);assert.equal(loaded.getState().valid,true);assert.equal(loaded.getState().balance,1020);assert.deepEqual(loaded.getState().owned,['cloud-table']);assert.deepEqual(loaded.getState().stored,['cloud-table']);assert.deepEqual(loaded.getState().appearance,{wallColor:'cream',flooring:null});assert.equal(storage.writes,writes,'migration read must not overwrite old data');
  assert.equal(loaded.setAppearance({wallColor:'mint'}).ok,true);assert.equal(create(storage).getState().appearance.wallColor,'mint');assert.equal(create(storage).getState().balance,1020);
});

test('all wall presets and custom hex colors are free, persist, and reject invalid color inputs atomically',()=>{
  const storage=memory(),economy=create(storage,37);
  for(const paint of WALL_PAINTS){const result=economy.setAppearance({wallColor:paint.id});assert.equal(result.ok,true);assert.equal(result.state.balance,37);assert.equal(create(storage).getState().appearance.wallColor,paint.id);}
  assert.equal(economy.setAppearance({wallColor:'#AaBbCc'}).ok,true);assert.equal(create(storage).getState().appearance.wallColor.toLowerCase(),'#aabbcc');const before=storage.data.get(accountKey),writes=storage.writes;
  for(const wallColor of ['unknown','#abc','#12345g','rgb(0,0,0)',null,0])assert.equal(economy.setAppearance({wallColor}).code,'INVALID_COLOR');
  assert.equal(storage.data.get(accountKey),before);assert.equal(storage.writes,writes);assert.equal(economy.getState().balance,37);
});

test('all eight flooring purchases save points, ownership and equipped surface in one transaction',()=>{
  const storage=memory(),economy=create(storage);let spent=0;
  assert.equal(economy.setAppearance({flooring:FLOOR_CATALOG[0].sku}).code,'NOT_OWNED');assert.equal(storage.writes,0);
  for(const item of FLOOR_CATALOG){const id=`tile:${item.sku}`,writes=storage.writes,result=economy.purchase(item.sku,{requestId:id});spent+=item.price;assert.equal(result.ok,true);assert.equal(result.state.balance,100000-spent);assert.equal(result.state.appearance.flooring,item.sku);assert.equal(storage.writes,writes+1);const loaded=create(storage);assert.equal(loaded.getState().appearance.flooring,item.sku);assert.ok(loaded.getState().owned.includes(item.sku));assert.equal(economy.purchase(item.sku,{requestId:id}).code,'ALREADY_APPLIED');assert.equal(storage.writes,writes+1);}
  assert.equal(economy.getState().totalSpent,spent);assert.equal(economy.getState().owned.length,8);
  for(const item of FLOOR_CATALOG){assert.equal(economy.setAppearance({flooring:item.sku}).ok,true);assert.equal(economy.getState().balance,100000-spent);assert.equal(create(storage).getState().appearance.flooring,item.sku);assert.equal(STORAGE_CATALOG.some(p=>p.sku===item.sku),false);assert.equal(economy.storeFurniture(item.sku).code,'UNKNOWN_SKU');}
  assert.equal(economy.setAppearance({flooring:null}).ok,true);assert.equal(create(storage).getState().appearance.flooring,null);
});

test('failed flooring purchase or equip write leaves surface, ownership and points unchanged and permits retry',()=>{
  const storage=memory(),economy=create(storage),a=FLOOR_CATALOG[0],b=FLOOR_CATALOG[1];assert.equal(economy.purchase(a.sku,{requestId:'first'}).ok,true);const before=storage.data.get(accountKey),balance=economy.getState().balance;storage.blocked=true;
  assert.equal(economy.purchase(b.sku,{requestId:'retry-tile'}).code,'STORAGE_WRITE_FAILED');assert.equal(storage.data.get(accountKey),before);assert.deepEqual(economy.getState().owned,[a.sku]);assert.equal(economy.getState().appearance.flooring,a.sku);assert.equal(economy.getState().balance,balance);
  storage.blocked=false;assert.equal(economy.purchase(b.sku,{requestId:'retry-tile'}).ok,true);const owned=JSON.stringify(economy.getState().owned),current=storage.data.get(accountKey);storage.blocked=true;
  assert.equal(economy.setAppearance({flooring:a.sku}).code,'STORAGE_WRITE_FAILED');assert.equal(economy.getState().appearance.flooring,b.sku);assert.equal(JSON.stringify(economy.getState().owned),owned);assert.equal(storage.data.get(accountKey),current);
  storage.blocked=false;assert.equal(economy.setAppearance({flooring:a.sku}).ok,true);assert.equal(create(storage).getState().appearance.flooring,a.sku);
});

test('invalid saved surfaces cannot grant unowned flooring or overwrite the stored account',()=>{
  const storage=memory(),economy=create(storage);economy.setAppearance({wallColor:'mint'});const raw=JSON.parse(storage.data.get(accountKey));raw.appearance.flooring=FLOOR_CATALOG[0].sku;const invalid=JSON.stringify(raw);storage.data.set(accountKey,invalid);const writes=storage.writes,loaded=create(storage);assert.equal(loaded.getState().valid,false);assert.equal(loaded.setAppearance({flooring:null}).ok,false);assert.equal(storage.data.get(accountKey),invalid);assert.equal(storage.writes,writes);
});

test('switching to a smaller unlocked room never repurchases an earlier expansion tier',()=>{
  const storage=memory(),economy=create(storage,3000);
  assert.equal(economy.expand({requestId:'unlock-one'}).ok,true);assert.equal(economy.getState().roomLevel,1);assert.equal(economy.getState().maxRoomLevel,1);assert.equal(economy.getState().balance,2400);
  assert.equal(economy.setRoomLevel(0,{requestId:'back-small'}).ok,true);assert.equal(economy.getState().nextTier.level,2);assert.equal(economy.getState().nextTier.price,1500,'next purchase follows the highest unlocked size');
  assert.equal(economy.setRoomLevel(1,{requestId:'free-large'}).ok,true);assert.equal(economy.getState().roomLevel,1);assert.equal(economy.getState().balance,2400,'returning to an unlocked larger room is free');
  assert.equal(economy.setRoomLevel(0,{requestId:'small-before-unlock-two'}).ok,true);const second=economy.expand({requestId:'unlock-two-from-small'});assert.equal(second.ok,true);assert.equal(second.state.roomLevel,2);assert.equal(second.state.maxRoomLevel,2);assert.equal(second.state.balance,900,'second unlock costs 1500, even when currently in the small room');assert.equal(second.state.nextTier,null);assert.equal(second.state.totalSpent,2100);
  for(const level of [0,1,2,0,2]){assert.equal(economy.setRoomLevel(level,{requestId:`free-switch-${level}-${storage.writes}`}).ok,true);assert.equal(economy.getState().balance,900);assert.equal(economy.getState().nextTier,null);}
  const loaded=create(storage);assert.equal(loaded.getState().maxRoomLevel,2);assert.equal(loaded.getState().roomLevel,2);assert.equal(loaded.getState().balance,900);assert.equal(loaded.expand({requestId:'already-largest'}).code,'MAX_ROOM_LEVEL');
});

test('twelve wall hangings have distinct finite geometry and fit their wall-only collision boxes',t=>{
  const {materials,roots}=assets(t),fingerprints=new Set();assert.ok(WALL_CATALOG.length>=12);
  for(const item of WALL_CATALOG){const {root,definition}=createWallHanging(item.sku,materials);roots.push(root);const info=inspect(root);fingerprints.add(info.hash);assert.equal(root.name,`shop-${item.sku}`);assert.equal(root.userData.wallHanging,true);assert.equal(definition.blocksNavigation,false);assert.equal(definition.blocksPlacement,false);assert.equal(definition.draggable,true);assert.ok(info.meshes>=2&&info.meshes<=8,`${item.sku}: ${info.meshes} material batches`);assert.ok(info.triangles>150&&info.triangles<50000,`${item.sku}: ${info.triangles} triangles`);const size=info.bounds.getSize(new Vector3());assert.ok(Math.abs(size.x-item.width)<1e-4);assert.ok(Math.abs(size.y-item.height)<1e-4);assert.ok(info.bounds.min.z>=-1e-6&&size.z<=.201);const box=definition.boxes[0];for(const [axis,i]of [['x',0],['y',1],['z',2]]){assert.ok(info.bounds.min[axis]>=box.center[i]-box.size[i]/2-1e-5,`${item.sku}: min ${axis}`);assert.ok(info.bounds.max[axis]<=box.center[i]+box.size[i]/2+1e-5,`${item.sku}: max ${axis}`);}}
  assert.equal(fingerprints.size,WALL_CATALOG.length,'every price tier should be a different design');assert.throws(()=>createWallHanging('missing',materials),RangeError);
});

test('eight flooring patterns cover the room at both base and expanded sizes with bounded material batches',t=>{
  const {materials,roots}=assets(t),fingerprints=new Set();
  for(const item of FLOOR_CATALOG)for(const [width,depth]of [[8.8,8.2],[12.8,12.2]]){const root=createFloorFinish(item.sku,width,depth,materials);roots.push(root);const info=inspect(root);if(width===8.8)fingerprints.add(info.hash);assert.ok(info.meshes>=2&&info.meshes<=6,`${item.sku}: ${info.meshes} batches`);assert.ok(info.triangles>100&&info.triangles<200000,`${item.sku}: ${info.triangles} triangles`);assert.ok(Math.abs(info.bounds.min.x+width/2)<1e-4);assert.ok(Math.abs(info.bounds.max.x-width/2)<1e-4);assert.ok(Math.abs(info.bounds.min.z+depth/2)<1e-4);assert.ok(Math.abs(info.bounds.max.z-depth/2)<1e-4);assert.ok(info.bounds.min.y>=.03&&info.bounds.max.y<.08,'finish stays above base floor and below furniture');}
  assert.equal(fingerprints.size,8);assert.throws(()=>createFloorFinish(FLOOR_CATALOG[0].sku,NaN,8,materials),TypeError);assert.throws(()=>createFloorFinish('missing',8,8,materials),RangeError);
});

test('wall paint recolors only wall material clones and reuses clones for repeated changes',t=>{
  const {materials,roots}=assets(t),scene=new Scene(),furniture=new Map(buildDecor(scene,materials).items);roots.push(...furniture.values());const shell=furniture.get('room-shell'),other=[];for(const [id,root]of furniture)if(id!=='room-shell')root.traverse(mesh=>{if(mesh.isMesh)other.push({mesh,material:mesh.material,color:mesh.material.color.getHex()});});
  const before=[];shell.traverse(mesh=>{if(mesh.isMesh)before.push({mesh,material:mesh.material,color:mesh.material.color.getHex()});});assert.ok(before.some(v=>v.color===0xffedc2),'shell contains walls');
  assert.ok(applyWallPaint(furniture,'mint'));const painted=before.filter(v=>v.mesh.userData.wallPaintRole);assert.ok(painted.length>=2);for(const item of painted)assert.notEqual(item.mesh.material,item.material);const clones=painted.map(v=>v.mesh.material);
  assert.ok(applyWallPaint(furniture,'rose'));assert.ok(applyWallPaint(furniture,'#abcdef'));painted.forEach((v,i)=>assert.equal(v.mesh.material,clones[i]));for(const item of other){assert.equal(item.mesh.material,item.material);assert.equal(item.material.color.getHex(),item.color);}
  assert.equal(applyWallPaint(furniture,'bad-color'),false);assert.equal(resolveWallPaint('bad-color'),null);assert.equal(resolveWallPaint('#ABCDEF').id,'#abcdef');assert.equal(SHOP_CATALOG.filter(p=>p.category==='flooring').length,FLOOR_CATALOG.length);
});
