import {createEstateStore} from './estate-state.mjs';
import {ROOM_TIERS} from './economy.mjs';
import {itemBaseSku} from './inventory-key.mjs';
import {PRODUCT_PREVIEW_INFO} from './product-previews.mjs';

/** Read both versions through the same migration/validation code as the room, in memory only. */
export function recoveryFloors(backup,side){
 if(!['local','remote'].includes(side)||!backup?.storageKey)throw new Error('备份来源无效');
 const entries=backup[side]?.entries;if(!entries||typeof entries!=='object')throw new Error('这份副本没有可读取的楼层');
 const values=new Map(Object.entries(entries));
 const store=createEstateStore({storageKey:backup.storageKey,storageAdapter:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});
 const state=store.getState();if(!state.valid)throw new Error(state.error?.message||'备份未通过检查');
 return state.rooms.map(room=>{const result=store.exportRoomWorld(room.id);if(!result.ok)throw new Error(result.message);return {id:room.id,name:room.name,updatedAt:room.updatedAt||room.world?.updatedAt||backup.createdAt,archive:result.archive};});
}
export function compareFloor(saved,current){
 const a=saved?.scene?.layout?.furniture||{},b=current?.scene?.layout?.furniture||{};
 return {added:Object.keys(a).filter(id=>!b[id]).length,removed:Object.keys(b).filter(id=>!a[id]).length,moved:Object.keys(a).filter(id=>b[id]&&JSON.stringify(a[id])!==JSON.stringify(b[id])).length};
}
/** A labelled floor plan remains readable even on devices without a second WebGL context. */
export function renderFloorPlan(doc,snapshot){
 const {width:roomWidth,depth:roomDepth}=ROOM_TIERS[snapshot.scene.roomLevel]||ROOM_TIERS[0];
 const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox',`${-roomWidth/2-1} ${-roomDepth/2-1} ${roomWidth+2} ${roomDepth+2}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',snapshot.name+'的家具位置示意图');svg.classList.add('recovery-floor-plan');
 const base=doc.createElementNS(ns,'rect');for(const [k,v]of Object.entries({x:-roomWidth/2,y:-roomDepth/2,width:roomWidth,height:roomDepth,rx:.25,fill:'#f6ecd7',stroke:'#c9af86','stroke-width':.08}))base.setAttribute(k,v);svg.append(base);
 for(const [id,t]of Object.entries(snapshot.scene.layout?.furniture||{})){
  const shape=doc.createElementNS(ns,'rect'),box=snapshot.scene.layout.definitions?.[id]?.boxes?.[0],width=Math.max(.18,Math.min(4,(box?.size?.[0]||.6)*t.scale[0])),depth=Math.max(.18,Math.min(4,(box?.size?.[2]||.6)*t.scale[2]));
  for(const [k,v]of Object.entries({x:-width/2,y:-depth/2,width,height:depth,rx:.1,fill:id.startsWith('shop-')?'#b9cfba':'#ddbb81',stroke:'#7d8c72','stroke-width':.04,transform:`translate(${t.position[0]} ${t.position[2]}) rotate(${-t.rotation[1]*180/Math.PI})`}))shape.setAttribute(k,v);
  const title=doc.createElementNS(ns,'title');title.textContent=snapshot.scene.layout.definitions?.[id]?.label||id;shape.append(title);svg.append(shape);
  const sku=itemBaseSku(id.startsWith('shop-')?id.slice(5):id);
  if(PRODUCT_PREVIEW_INFO.has(sku)){const picture=doc.createElementNS(ns,'image');for(const [k,v]of Object.entries({x:t.position[0]-.8,y:t.position[2]-.6,width:1.6,height:1.2,href:new URL(`./assets/products/previews/${sku}.png`,import.meta.url).href}))picture.setAttribute(k,v);svg.append(picture);}
 }
 if(!snapshot.scene.layout){const label=doc.createElementNS(ns,'text');label.setAttribute('text-anchor','middle');label.setAttribute('font-size','.55');label.textContent='初始房间布局';svg.append(label);}
 return svg;
}
