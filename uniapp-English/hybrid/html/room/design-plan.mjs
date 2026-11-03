import {validateRoomSnapshot} from './room-world.mjs';
import {SHOP_CATALOG,BUILTIN_STORAGE,ROOM_TIERS} from './economy.mjs';
import {giftProduct} from './gift-catalog.mjs';
const builtin=new Set(BUILTIN_STORAGE.map(item=>item.id)),catalog=new Map(SHOP_CATALOG.map(item=>[item.sku,item]));
// Only visible decoration is public. Never share profiles, photos, wallets or extra storage.
export function createPublishedDesign(input){
 const saved=validateRoomSnapshot(input),level=saved.scene.roomLevel,stored=saved.scene.stored.filter(id=>builtin.has(id));
 let layout=saved.scene.layout;
 if(layout){
  const furniture={},definitions={};
  for(const [id,item] of Object.entries(layout.furniture)){
   if(saved.scene.stored.includes(id.startsWith('shop-')?id.slice(5):id))continue;
   furniture[id]={position:item.position,rotation:item.rotation,scale:item.scale};
   const def=layout.definitions?.[id];if(def)definitions[id]={boxes:def.boxes.map(box=>({center:box.center,size:box.size})),...Object.fromEntries(['blocksNavigation','blocksPlacement','draggable'].filter(key=>Object.hasOwn(def,key)).map(key=>[key,def[key]]))};
  }
  layout={version:3,furniture,definitions,lampSupport:Object.hasOwn(furniture,layout.lampSupport)?layout.lampSupport:null};
 }
 const visible=new Set(layout?Object.keys(layout.furniture):[...builtin].filter(id=>!stored.includes(id)));
 const furnitureStyles=Object.fromEntries(Object.entries(saved.companion.furnitureStyles).filter(([id])=>visible.has(id)).map(([id,style])=>[id,Object.fromEntries(Object.entries(style).filter(([key])=>!['achievementSkin','skinId'].includes(key)))]));
 return validateRoomSnapshot({name:saved.name,template:saved.template,scene:{roomLevel:level,layout,layouts:layout?{[level]:layout}:{},stored,appearance:saved.scene.appearance},companion:{furnitureStyles,theme:saved.companion.theme,photos:[],wallDrawing:saved.companion.wallDrawing},extras:{}});
}
export function designFingerprint(snapshot){return JSON.stringify(createPublishedDesign(snapshot));}
export function quoteDesign(input,{owned=[],maxRoomLevel=0,balance=0,rewards=[],badges=[]}={}){
 const snapshot=createPublishedDesign(input),required=new Set(),unavailable=[],missing=[],upgrades=[];
 for(const id of Object.keys(snapshot.scene.layout?.furniture||{}))if(id.startsWith('shop-'))required.add(id.slice(5));
 if(snapshot.scene.appearance.flooring)required.add(snapshot.scene.appearance.flooring);
 for(const sku of required){
  const product=catalog.get(sku),gift=giftProduct(sku);
  if(gift){const reward=rewards.find(item=>item.id===gift.rewardId&&item.kind===gift.giftKind);if(!owned.includes(sku)||!reward||(reward.expiresAt&&Date.parse(reward.expiresAt)<=Date.now()))unavailable.push({sku,name:gift.name||sku,reason:'这是限定礼物，需要先自行解锁且仍在有效期内'});}
  else if(!owned.includes(sku))missing.push({sku,name:product.name,price:product.price});
 }
 for(const [id,style]of Object.entries(snapshot.companion.furnitureStyles))if(style.achievementSkin&&(!style.skinId||!badges.includes(style.skinId)))unavailable.push({sku:id,name:'成就专属装扮',reason:'需要先点亮主人使用的对应成就'});
 for(let level=maxRoomLevel+1;level<=snapshot.scene.roomLevel;level++){const tier=ROOM_TIERS[level];upgrades.push({level,name:tier.name,price:tier.price});}
 const total=[...missing,...upgrades].reduce((sum,item)=>sum+item.price,0);
 return {snapshot,missing,upgrades,total,balance,unavailable,canApply:unavailable.length===0&&balance>=total,needsPurchase:total>0,fingerprint:JSON.stringify(snapshot)};
}
