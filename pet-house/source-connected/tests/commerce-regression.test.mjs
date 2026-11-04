import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import {createEconomy,SHOP_CATALOG,ROOM_TIERS,STORAGE_CATALOG,BUILTIN_STORAGE} from '../economy.mjs';
import {createLayoutManager} from '../layout-manager.js';
import {COLLIDERS,FURNITURE,ROOM,PLACEMENT_BOUNDS} from '../layout.js';
import {buildDecor,buildDecorItem} from '../decor.js';
import {applyRoomTier} from '../scene-economy.js';
import {createShopFurniture} from '../inventory-models.mjs';
import {giftProduct,giftCatalog,giftSku} from '../gift-catalog.mjs';
import {SEATS,WATER_TARGETS,resolveSeatApproach} from '../seats.mjs';
import {placementOrder} from '../placement.mjs';
import {createPetCharacter} from '../characters/pet-models.js';
import {petNavigationBounds} from '../pet-boundary.mjs';
import {compatibleRoomLayout} from '../room-layout.mjs';
import {createWallHanging} from '../surface-models.mjs';
import {createProfile} from '../profile.mjs';
import {createCompanionStore} from '../companion-state.mjs';

// Exercise the delivered commerce functions with the actual layout, collision,
// procedural furniture, pet models and ledger. Only WebGL/GLB IO is replaced.
const source=readFileSync(new URL('../room.js',import.meta.url),'utf8');
const start=source.indexOf('  function canEdit()'),end=source.indexOf('  function creditLearning(',start);
assert.ok(start>=0&&end>start,'room commerce source boundaries changed');
const commerce=source.slice(start,end);
const pruneStart=source.indexOf('      for(const key of initialAccount.stored||[])'),pruneEnd=source.indexOf('      sofaRoot=furniture.get(',pruneStart);
assert.ok(pruneStart>=0&&pruneEnd>pruneStart,'stored initialization source boundaries changed');
const pruneStored=source.slice(pruneStart,pruneEnd);
const memory=()=>({values:new Map(),blocked:false,getItem(key){return this.values.get(key)??null;},setItem(key,value){if(this.blocked)throw new Error('quota');this.values.set(key,value);}});
const clone=value=>JSON.parse(JSON.stringify(value));

test('earned gift follows the real placement, transform, storage and reload path without spending points',async t=>{
 const room=await fixture(t),companion=room.context.companionStore,reward={id:'secret-star',name:'星光礼物',kind:'star',at:'2026-10-29T01:02:03Z',expiresAt:null},sku=giftSku(reward),id=`shop-${sku}`;
 assert.equal(companion.replace({...companion.getState(),rewards:[reward]}).ok,true);assert.equal(room.economy.grantGift(sku,'gift:star').ok,true);
 const balance=room.economy.getState().balance;assert.equal((await room.unstoreFurniture(sku,'gift:place')).ok,true);assert.ok(room.furniture.get(id));
 const before=room.manager.snapshot(),root=room.furniture.get(id);assert.equal(room.manager.previewTransform(id,{rotation:[0,Math.PI/2,0]}),true);assert.equal(room.manager.commit(before),true);
 assert.equal(companion.customize(id,{color:'#ee9abb',sticker:'heart'}).ok,true);assert.equal((await room.storeFurniture(sku,'gift:store')).ok,true);assert.equal(room.furniture.has(id),false);
 const reloaded=await fixture(t,{storage:room.storage});assert.equal(reloaded.economy.getState().stored.includes(sku),true);assert.equal(reloaded.context.companionStore.getState().furnitureStyles[id].sticker,'heart');
 assert.equal((await reloaded.unstoreFurniture(sku,'gift:again')).ok,true);assert.equal(reloaded.economy.getState().balance,balance);
});

test('expired gifts stay visible until collection commits and failed collection restores their real collider',async t=>{
 const room=await fixture(t),companion=room.context.companionStore,reward={id:'timed',name:'限时礼物',kind:'pumpkin',at:'2026-10-01T00:00:00Z',expiresAt:'2099-10-29T00:00:00Z'},sku=giftSku(reward),id=`shop-${sku}`;
 companion.replace({...companion.getState(),rewards:[reward]});room.economy.grantGift(sku,'gift:timed');assert.equal((await room.unstoreFurniture(sku,'gift:show')).ok,true);
 companion.replace({...companion.getState(),rewards:[{...reward,expiresAt:'2000-01-01T00:00:00Z'}]});const root=room.furniture.get(id),pending=[];
 const start=source.indexOf('function syncGiftInventory(){'),end=source.indexOf('function syncCompanion()',start);assert.ok(start>=0&&end>start);
 const context={...room.context,storeFurniture:(...args)=>{const p=room.storeFurniture(...args);pending.push(p);return p;},fx:null};
 const sync=new Function('context',`with(context){${source.slice(start,end)};return syncGiftInventory;}`)(context);
 context.decoration.active=true;sync();assert.equal(root.visible,true);assert.equal(pending.length,0,'editing delays automatic collection');context.decoration.active=false;
 room.storage.blocked=true;sync();await Promise.all(pending.splice(0));assert.equal(room.furniture.get(id),root);assert.equal(root.visible,true);assert.equal(Object.hasOwn(room.manager.definitions,id),true,'failed writes retain visible colliders');
 room.storage.blocked=false;sync();await Promise.all(pending.splice(0));assert.equal(room.furniture.has(id),false);assert.equal(room.economy.getState().stored.includes(sku),true);
 assert.equal((await room.unstoreFurniture(sku,'gift:expired')).code,'GIFT_EXPIRED');assert.equal(companion.getState().rewards[0].at,reward.at);
});

async function fixture(t,{storage=memory(),balance=1000,now=()=>new Date()}={}){
  const economy=createEconomy({storageAdapter:storage,storageKey:'commerce-account',initialBalance:balance}),initialAccount=economy.getState();
  const profile=createProfile({storageAdapter:storage,storageKey:'commerce-profile',now}),companionStore=createCompanionStore({adapter:storage,key:'commerce-companion',now});
  const scene=new THREE.Scene(),materials=new Map(),released=new Set(),history=[];
  const solidMaterial=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshToonMaterial({color}));return materials.get(color);};
  const furniture=new Map(buildDecor(scene,solidMaterial).items),furnitureDefinitions=clone(COLLIDERS),interactive=[];
  for(const sku of initialAccount.owned){
    if(initialAccount.stored.includes(sku))continue;
    const product=SHOP_CATALOG.find(item=>item.sku===sku);
    if(product?.category==='flooring')continue;
    const item=product?.category==='wall'?createWallHanging(sku,solidMaterial):createShopFurniture(sku,solidMaterial);scene.add(item.root);furniture.set(item.root.name,item.root);furnitureDefinitions[item.root.name]=item.definition;
  }
  function loadFurniture(id,config){
    const root=new THREE.Group();root.name=id;root.userData.furnitureId=id;root.position.fromArray(config.position);root.rotation.fromArray(config.rotation);root.scale.setScalar(config.scale);
    scene.add(root);furniture.set(id,root);
    if(id==='sofa'){root.userData.interaction='seat';root.userData.seatId=id;interactive.push(root);}
    if(id==='lamp'){root.userData.interaction='lamp';interactive.push(root);}
    return Promise.resolve(root);
  }
  for(const [id,config] of Object.entries(FURNITURE))await loadFurniture(id,config);
  const context={THREE,economy,profile,companionStore,initialAccount,scene,furniture,furnitureDefinitions,interactive,solidMaterial,materialCache:materials,
    createShopFurniture,giftProduct,giftCatalog,giftSku,createWallHanging,compatibleRoomLayout,buildDecorItem,loadFurniture,SHOP_CATALOG,ROOM_TIERS,STORAGE_CATALOG,WATER_TARGETS,FURNITURE,placementOrder,applyRoomTier,petNavigationBounds,createPetCharacter,
    options:{},disposed:false,lifecycle:'ready',commerceBusy:false,decoration:{active:false,pending:false,dragging:false,refresh(){}},
    prepareDecoration:()=>true,setTimeout,clearTimeout,resolveSeat(){},updateStatus(){},celebrateNewBadges(){},resize(){},schedule(){},syncCompanion(){},syncAppearance(){},feel:null,fx:null,defaultRoomLayout:null,
    notify:(type,detail)=>history.push({type,...detail}),gradient:null,
    disposer:{release(resource){released.add(resource);resource.dispose?.();}},
    disposeCharacter(character){character.model.removeFromParent();character.dispose();},
    bounds:{...PLACEMENT_BOUNDS},placementBounds:{...PLACEMENT_BOUNDS},roomTier:ROOM_TIERS[initialAccount.roomLevel],
    sofaRoot:null,lampRoot:null,lampLight:null,lampBulb:null,layoutManager:null,
  };
  // Keep the same JS realm as the real ledger: its strict plain-object checks
  // intentionally reject objects created in a separate vm context.
  applyRoomTier({furniture,width:context.roomTier.width,depth:context.roomTier.depth,bounds:context.bounds,placementBounds:context.placementBounds});
  Object.assign(context.bounds,petNavigationBounds(context.roomTier.width,context.roomTier.depth));
  const api=new Function('context',`with(context){${commerce}\nreturn {purchaseFurniture,applyFlooring,storeFurniture,unstoreFurniture,collectAllFurniture,resetRoomLayout,purchasePet,selectPet,expandRoom,setRoomLevel,attachLamp,releaseRoomItem,removeInteractive};}`)(context);
  context.removeInteractive=api.removeInteractive;context.releaseRoomItem=api.releaseRoomItem;
  new Function('context',`with(context){${pruneStored}}`)(context);
  context.sofaRoot=furniture.get('sofa');context.lampRoot=furniture.get('lamp');
  if(context.lampRoot)api.attachLamp(context.lampRoot);
  const character=createPetCharacter(initialAccount.pets.active),facing=new THREE.Group();facing.add(character.model);scene.add(facing);
  const pet={x:.65,z:2.83,stop(){}};
  context.actor={state:'idle',character,pose:character.pose,facing,ctrl:pet,root:new THREE.Group(),path:[]};
  const accountStorage={
    getItem(){const layout=economy.getLayout();return layout?JSON.stringify(layout):null;},
    setItem(key,value){const result=economy.setLayout(JSON.parse(value));if(!result.ok)throw new Error(result.message);},
  };
  context.layoutManager=createLayoutManager({furniture,definitions:Object.fromEntries(Object.entries(furnitureDefinitions).filter(([id])=>furniture.has(id))),
    roomBounds:context.placementBounds,navigationBounds:context.bounds,grandfatherUnreachableSeats:true,petHeight:ROOM.petHeight,storageAdapter:accountStorage,getPet:()=>pet,
    getSeatApproaches:(obstacles,bounds,from=pet)=>Object.keys(SEATS).filter(id=>furniture.has(id)).map(id=>({id,point:resolveSeatApproach(furniture.get(id),id,{obstacles,bounds,from,petRadius:.48})})),
    afterUpdate:()=>scene.updateMatrixWorld(true)});
  context.defaultRoomLayout=context.layoutManager.snapshot();
  if(initialAccount.layout)assert.equal(context.layoutManager.restore(initialAccount.layout),true,'saved layout should restore');
  const initialValidation=context.layoutManager.validate();assert.equal(initialValidation.valid,true,`fixture must begin in a valid layout: ${initialValidation.reason}`);
  t.after(()=>{context.actor.character.dispose();scene.traverse(object=>{object.geometry?.dispose();});materials.forEach(material=>material.dispose());scene.clear();});
  return {...api,economy,storage,furniture,manager:context.layoutManager,history,released,context};
}

function moveFloorPot(room){
  const before=room.manager.snapshot(),origin=before.furniture['floor-pot'].position;
  for(const[x,z]of placementOrder(room.context.bounds,.5)){
    if(Math.hypot(x-origin[0],z-origin[2])<.7)continue;
    if(room.manager.previewTransform('floor-pot',{position:[x,origin[1],z]})&&room.manager.commit(before,{persist:true}))return room.manager.snapshot();
  }
  assert.fail('fixture must have a second valid location for the floor pot');
}

test('new flooring keeps its first precise arrival time through receipt replay, application and remount',async t=>{
  let at='2026-10-28T01:02:03.000Z';const now=()=>new Date(at),room=await fixture(t,{now});
  room.context.profile.setName('甜甜');
  const sku='tile-honey-grid',price=SHOP_CATALOG.find(item=>item.sku===sku).price;
  const result=await room.purchaseFurniture(sku,'floor:arrival');assert.equal(result.ok,true,result.message);
  assert.equal(room.economy.getState().balance,1000-price);
  const first=room.context.companionStore.getState().memories[sku];
  assert.deepEqual(first,{at,by:'甜甜',source:'一起从商店带回家'});
  const saved=room.storage.getItem('commerce-companion');
  at='2028-12-01T20:30:40.000Z';
  assert.equal((await room.purchaseFurniture(sku,'floor:arrival')).code,'ALREADY_APPLIED');
  assert.equal((await room.applyFlooring(null)).ok,true);assert.equal((await room.applyFlooring(sku)).ok,true);
  assert.equal(room.storage.getItem('commerce-companion'),saved,'重新铺设和重复回执不能重写获得时间');
  const loaded=await fixture(t,{storage:room.storage,now});
  assert.deepEqual(loaded.context.companionStore.getState().memories[sku],first);
  assert.equal((await loaded.purchaseFurniture(sku,'floor:arrival')).code,'ALREADY_APPLIED');
  assert.deepEqual(loaded.context.companionStore.getState().memories[sku],first);
});

test('failed flooring purchases do not create a memory, and legacy owned floors keep unknown arrival times',async t=>{
  let at='2026-10-28T01:00:00.000Z';const now=()=>new Date(at),room=await fixture(t,{now}),sku='tile-honey-grid';
  room.storage.blocked=true;assert.equal((await room.purchaseFurniture(sku,'floor:retry')).ok,false);
  assert.equal(room.context.companionStore.getState().memories[sku],undefined);
  room.storage.blocked=false;at='2026-10-28T01:12:34.000Z';
  assert.equal((await room.purchaseFurniture(sku,'floor:retry')).ok,true);assert.equal(room.context.companionStore.getState().memories[sku].at,at);
  // A pre-upgrade ownership record has no reliable precise arrival time.
  room.storage.values.delete('commerce-companion');
  const legacy=await fixture(t,{storage:room.storage,now});
  legacy.context.companionStore.seedMemories([{id:sku,builtin:false}]);
  const unknown=legacy.context.companionStore.getState().memories[sku];assert.equal(unknown.at,null);
  at='2030-01-01T00:00:00.000Z';
  assert.equal((await legacy.purchaseFurniture(sku,'floor:retry')).code,'ALREADY_APPLIED');
  assert.equal((await legacy.applyFlooring(sku)).ok,true);
  assert.deepEqual(legacy.context.companionStore.getState().memories[sku],unknown,'不能把查看或重新应用时间写成历史获得时间');
});

test('collect-all stores builtin and paid furniture, preserving points, ownership, pets and the empty room after reload',async t=>{
  const room=await fixture(t,{balance:3000});
  for(const sku of ['clover-planter','wall-botanical-frame','tile-honey-grid']){const bought=await room.purchaseFurniture(sku,`bulk:buy:${sku}`);assert.equal(bought.ok,true,bought.message);}
  assert.equal((await room.purchasePet('mint-cat','bulk:pet')).ok,true);
  const account=room.economy.getState(),expected=[...BUILTIN_STORAGE.map(item=>item.id),'clover-planter','wall-botanical-frame'];
  const result=await room.collectAllFurniture('bulk:collect');assert.equal(result.ok,true,result.message);assert.equal(result.count,expected.length);
  const saved=room.economy.getState();
  for(const key of ['balance','owned','pets','totalSpent','appearance'])assert.deepEqual(saved[key],account[key],`${key} must survive collecting all furniture`);
  assert.deepEqual(new Set(saved.stored),new Set(expected));assert.equal(saved.stored.includes('tile-honey-grid'),false,'flooring stays an appearance choice rather than a stored object');
  assert.deepEqual(clone(room.manager.snapshot()),{version:3,furniture:{},definitions:{},lampSupport:null});assert.equal(room.manager.validate().valid,true);
  const loaded=await fixture(t,{storage:room.storage});
  assert.deepEqual(clone(loaded.manager.snapshot()),{version:3,furniture:{},definitions:{},lampSupport:null});
  for(const id of expected.map(sku=>BUILTIN_STORAGE.some(item=>item.id===sku)?sku:`shop-${sku}`))assert.equal(loaded.furniture.has(id),false,`${id} must not resurrect on reload`);
  assert.deepEqual(loaded.economy.getState().stored,saved.stored);assert.deepEqual(loaded.economy.getState().pets,account.pets);assert.equal(loaded.economy.getState().balance,account.balance);
});

test('collect-all write failure restores every same root, lamp support and layout without releasing live geometry',async t=>{
  const room=await fixture(t);assert.equal((await room.purchaseFurniture('clover-planter','bulk:rollback:buy')).ok,true);
  const roots=new Map(room.furniture),before=room.manager.snapshot(),raw=room.storage.getItem('commerce-account'),interactive=room.context.interactive.slice(),lamp={root:room.context.lampRoot,light:room.context.lampLight,bulb:room.context.lampBulb};
  const geometry=[];for(const root of roots.values())root.traverse(node=>{if(node.geometry)geometry.push(node.geometry);});
  room.storage.blocked=true;const failed=await room.collectAllFurniture('bulk:rollback');assert.equal(failed.code,'STORAGE_WRITE_FAILED',failed.message);
  for(const[id,root]of roots){assert.equal(room.furniture.get(id),root,`${id} identity must survive`);assert.equal(root.parent,room.context.scene,`${id} remains attached`);}
  assert.deepEqual(room.manager.snapshot(),before);assert.equal(room.manager.lampSupport,before.lampSupport);assert.equal(room.context.lampRoot,lamp.root);assert.equal(room.context.lampLight,lamp.light);assert.equal(room.context.lampBulb,lamp.bulb);assert.deepEqual(room.context.interactive,interactive);
  for(const item of geometry)assert.equal(room.released.has(item),false,'a rollback must not dispose live geometry');
  assert.equal(room.storage.getItem('commerce-account'),raw);assert.equal(room.manager.validate().valid,true);
  room.storage.blocked=false;assert.equal((await room.collectAllFurniture('bulk:rollback')).ok,true,'a failed request may retry after storage recovers');
});

test('collect-all replay cannot collect furniture that was placed again after the original request',async t=>{
  const room=await fixture(t);assert.equal((await room.purchaseFurniture('clover-planter','bulk:replay:buy')).ok,true);
  assert.equal((await room.collectAllFurniture('bulk:replay')).ok,true);assert.equal((await room.unstoreFurniture('floor-pot','bulk:replay:return')).ok,true);
  const root=room.furniture.get('floor-pot'),before=room.manager.snapshot(),stored=room.economy.getState().stored,raw=room.storage.getItem('commerce-account');
  const result=await room.collectAllFurniture('bulk:replay');assert.equal(result.ok,true,result.message);assert.equal(result.code,'ALREADY_APPLIED');
  assert.equal(room.furniture.get('floor-pot'),root);assert.equal(root.parent,room.context.scene);assert.deepEqual(room.manager.snapshot(),before);assert.deepEqual(room.economy.getState().stored,stored);assert.equal(room.storage.getItem('commerce-account'),raw);
});

test('every collected furniture item can be placed again for free and survives reopening',async t=>{
  const room=await fixture(t,{balance:120});assert.equal((await room.purchaseFurniture('clover-planter','bulk:return:buy')).ok,true);assert.equal(room.economy.getState().balance,0);
  assert.equal((await room.collectAllFurniture('bulk:return:collect')).ok,true);const account=room.economy.getState();
  const items=account.stored.filter(sku=>sku!=='lamp');items.push('lamp');
  for(const sku of items){const result=await room.unstoreFurniture(sku,`bulk:return:${sku}`);assert.equal(result.ok,true,`${sku}: ${result.message}`);assert.equal(room.economy.getState().balance,0);assert.equal(room.manager.validate().valid,true);}
  assert.deepEqual(room.economy.getState().stored,[]);assert.deepEqual(room.economy.getState().owned,account.owned);assert.deepEqual(room.economy.getState().pets,account.pets);
  const loaded=await fixture(t,{storage:room.storage});assert.deepEqual(clone(loaded.manager.snapshot()),clone(room.manager.snapshot()));assert.equal(loaded.economy.getState().balance,0);assert.equal(loaded.manager.validate().valid,true);
});

test('reset restores placed builtin defaults while preserving purchased furniture, storage and points',async t=>{
  const room=await fixture(t);assert.equal((await room.purchaseFurniture('clover-planter','reset:buy')).ok,true);assert.equal((await room.storeFurniture('rug','reset:store')).ok,true);
  const account=room.economy.getState(),shopPosition=room.furniture.get('shop-clover-planter').position.toArray(),roots=new Map(room.furniture);
  const moved=moveFloorPot(room);assert.notDeepEqual(moved.furniture['floor-pot'].position,room.context.defaultRoomLayout.furniture['floor-pot'].position);
  const result=await room.resetRoomLayout();assert.equal(result.ok,true,result.message);
  assert.deepEqual(room.manager.snapshot().furniture['floor-pot'].position,room.context.defaultRoomLayout.furniture['floor-pot'].position);assert.deepEqual(room.furniture.get('shop-clover-planter').position.toArray(),shopPosition);assert.equal(room.furniture.has('rug'),false);
  for(const[id,root]of roots)assert.equal(room.furniture.get(id),root);
  for(const key of ['balance','owned','stored','pets','totalSpent'])assert.deepEqual(room.economy.getState()[key],account[key]);
  const loaded=await fixture(t,{storage:room.storage});assert.deepEqual(clone(loaded.manager.snapshot()),clone(room.manager.snapshot()));assert.equal(loaded.furniture.has('rug'),false);
});

test('reset persistence failure rolls back the moved layout and keeps roots and lamp support live',async t=>{
  const room=await fixture(t),before=moveFloorPot(room),roots=new Map(room.furniture),raw=room.storage.getItem('commerce-account');
  const lamp={root:room.context.lampRoot,light:room.context.lampLight,bulb:room.context.lampBulb},geometry=[];for(const root of roots.values())root.traverse(node=>{if(node.geometry)geometry.push(node.geometry);});
  room.storage.blocked=true;const result=await room.resetRoomLayout();assert.equal(result.ok,false);assert.equal(result.code,'RESET_LAYOUT_FAILED',result.message);
  assert.deepEqual(room.manager.snapshot(),before);assert.equal(room.storage.getItem('commerce-account'),raw);assert.equal(room.manager.lampSupport,before.lampSupport);
  for(const[id,root]of roots)assert.equal(room.furniture.get(id),root);for(const item of geometry)assert.equal(room.released.has(item),false);
  assert.equal(room.context.lampRoot,lamp.root);assert.equal(room.context.lampLight,lamp.light);assert.equal(room.context.lampBulb,lamp.bulb);assert.equal(room.manager.validate().valid,true);
  room.storage.blocked=false;assert.equal((await room.resetRoomLayout()).ok,true);
});

test('room purchase deducts points; stored furniture returns for free even with zero balance',async t=>{
  const room=await fixture(t,{balance:180});
  const bought=await room.purchaseFurniture('cloud-table','buy');assert.equal(bought.ok,true,bought.message);assert.equal(room.economy.getState().balance,0);
  assert.equal(room.furniture.has('shop-cloud-table'),true);
  assert.equal((await room.storeFurniture('cloud-table','store')).ok,true);assert.equal(room.furniture.has('shop-cloud-table'),false);
  const returned=await room.purchaseFurniture('cloud-table','return');assert.equal(returned.ok,true,returned.message);
  assert.equal(room.economy.getState().balance,0);assert.deepEqual(room.economy.getState().stored,[]);assert.equal(room.furniture.has('shop-cloud-table'),true);
  assert.equal(room.manager.validate().valid,true);
});

test('purchase write failure removes provisional furniture and preserves exact prior layout and points',async t=>{
  const room=await fixture(t),before=room.manager.snapshot();room.storage.blocked=true;
  const failed=await room.purchaseFurniture('reading-shelf','retry');assert.equal(failed.code,'STORAGE_WRITE_FAILED');
  assert.equal(room.economy.getState().balance,1000);assert.equal(room.furniture.has('shop-reading-shelf'),false);assert.deepEqual(room.manager.snapshot(),before);
  room.storage.blocked=false;assert.equal((await room.purchaseFurniture('reading-shelf','retry')).ok,true);
});

test('store write failure restores the same furniture object without disposing live geometry',async t=>{
  const room=await fixture(t);assert.equal((await room.purchaseFurniture('clover-planter','buy')).ok,true);
  const root=room.furniture.get('shop-clover-planter'),before=room.manager.snapshot(),geometry=root.children[0].geometry;room.storage.blocked=true;
  const failed=await room.storeFurniture('clover-planter','store');assert.equal(failed.code,'STORAGE_WRITE_FAILED');
  assert.equal(room.furniture.get('shop-clover-planter'),root);assert.equal(root.parent,room.context.scene);assert.equal(room.released.has(geometry),false);
  assert.deepEqual(room.manager.snapshot(),before);assert.deepEqual(room.economy.getState().stored,[]);assert.equal(room.manager.validate().valid,true);
});

test('unstore write failure keeps item in storage and removes its provisional scene object',async t=>{
  const room=await fixture(t);assert.equal((await room.purchaseFurniture('moon-ornament','buy')).ok,true);assert.equal((await room.storeFurniture('moon-ornament','store')).ok,true);
  const before=room.manager.snapshot();room.storage.blocked=true;
  const failed=await room.unstoreFurniture('moon-ornament','return');assert.equal(failed.code,'STORAGE_WRITE_FAILED');
  assert.deepEqual(room.economy.getState().stored,['moon-ornament']);assert.equal(room.furniture.has('shop-moon-ornament'),false);assert.deepEqual(room.manager.snapshot(),before);
});

test('all seats can be stored and a seat-free room still accepts purchases',async t=>{
  const room=await fixture(t);
  for(const id of ['ottoman-a','ottoman-b','sofa']){const result=await room.storeFurniture(id,`store:${id}`);assert.equal(result.ok,true,`${id}: ${result.message}`);}
  assert.equal(room.manager.validate().valid,true);assert.equal((await room.purchaseFurniture('cloud-table','buy')).ok,true);
  assert.deepEqual(room.economy.getState().stored,['ottoman-a','ottoman-b','sofa']);
});

test('lamp returns and snaps to the cabinet; its support cannot be stored until lamp is stored',async t=>{
  const room=await fixture(t);
  assert.equal((await room.storeFurniture('lamp-cabinet','blocked')).code,'LAMP_ON_SUPPORT');
  const stored=await room.storeFurniture('lamp','store:lamp');assert.equal(stored.ok,true,stored.message);
  const returned=await room.unstoreFurniture('lamp','return:lamp');assert.equal(returned.ok,true,returned.message);
  assert.equal(room.manager.lampSupport,'lamp-cabinet');assert.equal(room.manager.validate().valid,true);
});

test('refresh prunes stored builtin and purchased furniture before layout registration',async t=>{
  const room=await fixture(t);assert.equal((await room.purchaseFurniture('cloud-table','buy')).ok,true);
  for(const id of ['cloud-table','rug','sofa','lamp'])assert.equal((await room.storeFurniture(id,`store:${id}`)).ok,true);
  const loaded=await fixture(t,{storage:room.storage});
  for(const id of ['shop-cloud-table','rug','sofa','lamp']){assert.equal(loaded.furniture.has(id),false,id);assert.equal(Object.hasOwn(loaded.manager.definitions,id),false,id);}
  assert.deepEqual(loaded.economy.getState().stored,['cloud-table','rug','sofa','lamp']);assert.equal(loaded.manager.validate().valid,true);
});

test('v2.23: 宠物兑换即更换——换新伙伴扣积分、失败保留旧伙伴、重放旧请求不覆盖后来的伙伴',async t=>{
  const room=await fixture(t,{balance:1000}),first=room.context.actor.character;
  const bought=await room.purchasePet('mint-cat','pet');assert.equal(bought.ok,true,bought.message);assert.equal(room.economy.getState().balance,600);
  assert.deepEqual(room.economy.getState().pets.owned,['mint-cat']);assert.equal(room.economy.getState().pets.active,'mint-cat');
  assert.notEqual(room.context.actor.character,first);assert.equal(room.context.actor.facing.children.length,1);
  const cat=room.context.actor.character;room.storage.blocked=true;
  assert.equal((await room.purchasePet('apricot-fox','swap-fox')).code,'STORAGE_WRITE_FAILED');
  assert.equal(room.context.actor.character,cat);assert.deepEqual(room.economy.getState().pets.owned,['mint-cat']);assert.equal(room.economy.getState().pets.active,'mint-cat');
  room.storage.blocked=false;assert.equal((await room.purchasePet('apricot-fox','swap-fox')).ok,true);
  assert.deepEqual(room.economy.getState().pets.owned,['apricot-fox']);assert.equal(room.economy.getState().balance,600,'兑换回默认狐狸不扣积分');
  const fox=room.context.actor.character;assert.equal((await room.purchasePet('mint-cat','pet')).code,'ALREADY_APPLIED');assert.equal(room.context.actor.character,fox,'replaying an old purchase must not replace a later pet selection');
});

test('stored wall pictures return against the current expanded rear wall',async t=>{
  const room=await fixture(t,{balance:3000});assert.equal((await room.expandRoom('expand')).ok,true);
  const before=room.furniture.get('wall-pictures').position.z;
  assert.equal(before,-1);assert.equal((await room.storeFurniture('wall-pictures','store:pictures')).ok,true);
  const result=await room.unstoreFurniture('wall-pictures','return:pictures');assert.equal(result.ok,true,result.message);
  assert.equal(room.furniture.get('wall-pictures').position.z,before);
});

test('resizing brings a pet standing in the extension back safely and keeps every paid tier',async t=>{
  const room=await fixture(t,{balance:3000});
  for(const request of ['first','second'])assert.equal((await room.expandRoom(request)).ok,true);
  room.context.actor.ctrl.x=5.7;room.context.actor.ctrl.z=4.8;
  assert.equal(room.manager.validate().valid,true);
  const balance=room.economy.getState().balance;
  for(const level of [0,1,2,0,2]){
    const result=await room.setRoomLevel(level,`switch:${level}:${room.history.length}`);
    assert.equal(result.ok,true,result.message);assert.equal(room.manager.validate().valid,true);
    assert.equal(room.economy.getState().roomLevel,level);assert.equal(room.economy.getState().maxRoomLevel,2);
    assert.equal(room.economy.getState().nextTier,null);assert.equal(room.economy.getState().balance,balance);
  }
  const loaded=await fixture(t,{storage:room.storage});
  assert.equal(loaded.economy.getState().roomLevel,2);assert.equal(loaded.economy.getState().maxRoomLevel,2);
});

test('resizing storage failure rolls back the pet, room bounds and furniture exactly',async t=>{
  const room=await fixture(t,{balance:3000});assert.equal((await room.expandRoom('expand')).ok,true);
  const pet=room.context.actor.ctrl,originalPet={x:room.context.bounds.maxX-.1,z:room.context.bounds.maxZ-.1};pet.x=originalPet.x;pet.z=originalPet.z;
  assert.equal(room.manager.validate().valid,true,'the pet starts inside the larger room with the new wall clearance');
  const before=room.manager.snapshot(),bounds={...room.context.bounds};room.storage.blocked=true;
  const result=await room.setRoomLevel(0,'retry');assert.equal(result.code,'STORAGE_WRITE_FAILED');
  assert.equal(pet.x,originalPet.x);assert.equal(pet.z,originalPet.z);assert.deepEqual(room.context.bounds,bounds);
  assert.deepEqual(room.manager.snapshot(),before);assert.equal(room.economy.getState().roomLevel,1);
  room.storage.blocked=false;assert.equal((await room.setRoomLevel(0,'retry')).ok,true);
});

test('legacy missing target layout with furniture outside a smaller room reports its name and preserves the large layout',async t=>{
  const initial=await fixture(t,{balance:3000});assert.equal((await initial.expandRoom('expand')).ok,true);
  assert.equal((await initial.storeFurniture('floor-pot','store')).ok,true);
  assert.equal((await initial.unstoreFurniture('floor-pot','place',{x:4.8,z:3.2})).ok,true);
  // Legacy saves may have only the current room slot. Without a saved smaller
  // layout to restore, resizing must validate the current furniture footprint.
  const raw=JSON.parse(initial.storage.getItem('commerce-account'));delete raw.layouts['0'];
  initial.storage.values.set('commerce-account',JSON.stringify(raw));
  const room=await fixture(t,{storage:initial.storage});
  assert.equal(room.economy.getRoomLayout(0),null);
  const before=room.manager.snapshot();
  const result=await room.setRoomLevel(0,'small');assert.equal(result.code,'NO_SPACE');
  assert.equal(result.furnitureId,'floor-pot');assert.match(result.message,/超出房间边界/);
  assert.equal(room.economy.getState().roomLevel,1);assert.deepEqual(room.manager.snapshot(),before);
  assert.equal((await room.storeFurniture('floor-pot','store-again')).ok,true);
  assert.equal((await room.setRoomLevel(0,'small')).ok,true);
  assert.equal((await room.setRoomLevel(1,'large-again')).ok,true);
});

test('saved smaller-room layout restores before validation, and real room switches keep independent arrangements after reload',async t=>{
  const room=await fixture(t,{balance:3000});
  const small=clone(room.manager.snapshot()),smallPosition=small.furniture['floor-pot'].position;
  assert.equal(room.economy.setLayout(small).ok,true);
  assert.equal((await room.expandRoom('independent:expand')).ok,true);
  assert.equal((await room.storeFurniture('floor-pot','independent:store')).ok,true);
  assert.equal((await room.unstoreFurniture('floor-pot','independent:large-place',{x:4.8,z:3.2})).ok,true);
  const large=clone(room.manager.snapshot());
  assert.notDeepEqual(large.furniture['floor-pot'].position,smallPosition);
  const balance=room.economy.getState().balance;
  for(let index=0;index<2;index++){
    const smaller=await room.setRoomLevel(0,`independent:small:${index}`);
    assert.equal(smaller.ok,true,smaller.message);
    assert.equal(room.manager.validate().valid,true);
    assert.deepEqual(room.manager.snapshot().furniture['floor-pot'].position,smallPosition,'小房型恢复它自己的旧布置');
    assert.deepEqual(room.economy.getRoomLayout(1),large,'小房型不能覆盖大房型存档');
    const larger=await room.setRoomLevel(1,`independent:large:${index}`);
    assert.equal(larger.ok,true,larger.message);
    assert.deepEqual(room.manager.snapshot().furniture['floor-pot'].position,[4.8,large.furniture['floor-pot'].position[1],3.2]);
    assert.deepEqual(room.economy.getRoomLayout(0),small,'大房型不能覆盖小房型存档');
    assert.equal(room.economy.getState().balance,balance,'已解锁房型往返不重复收费');
  }
  const loaded=await fixture(t,{storage:room.storage});
  assert.deepEqual(loaded.economy.getRoomLayout(0),small);
  assert.deepEqual(loaded.economy.getRoomLayout(1),large);
  assert.deepEqual(clone(loaded.manager.snapshot()),large);
  assert.equal((await loaded.setRoomLevel(0,'independent:reload-small')).ok,true);
  assert.deepEqual(clone(loaded.manager.snapshot()),small);
});

for(const sku of ['floor-pot','cloud-table']){
  const id=sku==='cloud-table'?`shop-${sku}`:sku;
  async function storedFixture(t){
    const room=await fixture(t);
    if(sku==='cloud-table')assert.equal((await room.purchaseFurniture(sku,'drop:buy')).ok,true);
    const root=room.furniture.get(id),point={x:root.position.x,z:root.position.z};
    assert.equal((await room.storeFurniture(sku,'drop:store')).ok,true);
    return {room,point};
  }
  test(`${sku} exact drops reject occupied, outside and non-finite points atomically`,async t=>{
    const {room}=await storedFixture(t),before=room.manager.snapshot(),account=room.economy.getState();
    const occupied=room.furniture.get('sofa').position;
    const cases=[
      [{x:occupied.x,z:occupied.z},'NO_SPACE'],
      [{x:100,z:0},'NO_SPACE'],
      [{x:NaN,z:0},'INVALID_POSITION'],
      [{x:0,z:Infinity},'INVALID_POSITION'],
    ];
    for(const [index,[point,code]]of cases.entries()){
      const result=await room.unstoreFurniture(sku,`drop:invalid:${index}`,point);
      assert.equal(result.code,code,result.message);
      assert.deepEqual(room.economy.getState(),account,'failed drop must not change the account or request claims');
      assert.deepEqual(room.manager.snapshot(),before,'failed drop must restore all transforms and definitions');
      assert.equal(room.furniture.has(id),false);assert.equal(Object.hasOwn(room.manager.definitions,id),false);
      assert.equal(room.context.scene.getObjectByName(id),undefined,'failed drop must remove provisional scene roots');
      assert.equal(room.manager.validate().valid,true);
    }
    const persisted=createEconomy({storageAdapter:room.storage,storageKey:'commerce-account'});
    assert.deepEqual(persisted.getState().stored,account.stored);
    assert.equal(persisted.getState().balance,account.balance);assert.deepEqual(persisted.getLayout(),account.layout);
  });

  test(`${sku} exact drop honors coordinates and persists inventory and layout together`,async t=>{
    const {room,point}=await storedFixture(t),balance=room.economy.getState().balance;
    // Use the freed, validated former footprint; the exact-point path must not
    // silently replace this point with its normal automatic placement search.
    const result=await room.unstoreFurniture(sku,'drop:valid',point);assert.equal(result.ok,true,result.message);
    const root=room.furniture.get(id);assert.equal(root.position.x,point.x);assert.equal(root.position.z,point.z);
    const loaded=await fixture(t,{storage:room.storage});
    assert.equal(loaded.furniture.get(id).position.x,point.x);assert.equal(loaded.furniture.get(id).position.z,point.z);
    assert.equal(loaded.economy.getState().stored.includes(sku),false);assert.equal(loaded.economy.getState().balance,balance);
    assert.deepEqual(loaded.economy.getLayout(),clone(room.manager.snapshot()));
    assert.equal(loaded.manager.validate().valid,true);
  });

  test(`${sku} exact drop ledger write failure preserves storage and clears its temporary object`,async t=>{
    const {room,point}=await storedFixture(t),before=room.manager.snapshot(),account=room.economy.getState();
    room.storage.blocked=true;
    const failed=await room.unstoreFurniture(sku,'drop:quota',point);assert.equal(failed.code,'STORAGE_WRITE_FAILED');
    const state=room.economy.getState();
    for(const key of ['balance','owned','stored','layout','claims','totalSpent'])assert.deepEqual(state[key],account[key],`${key} must survive a failed ledger write`);
    assert.equal(state.error.code,'STORAGE_WRITE_FAILED');assert.deepEqual(room.manager.snapshot(),before);
    assert.deepEqual(createEconomy({storageAdapter:room.storage,storageKey:'commerce-account'}).getLayout(),account.layout);
    assert.equal(room.furniture.has(id),false);assert.equal(Object.hasOwn(room.manager.definitions,id),false);
    assert.equal(room.context.scene.getObjectByName(id),undefined);assert.equal(room.manager.validate().valid,true);
    room.storage.blocked=false;
    assert.equal((await room.unstoreFurniture(sku,'drop:quota',point)).ok,true,'same request can retry after failed storage write');
    assert.equal(room.economy.getState().stored.includes(sku),false);assert.equal(room.economy.getState().balance,account.balance);
  });
}
