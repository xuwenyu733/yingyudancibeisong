import {mountPetHouse} from './pet-house.js';
import {createEconomy} from './economy.mjs';
import {defaultCompanion} from './companion-state.mjs';
import {giftProduct} from './gift-catalog.mjs';

/** A visitor receives only displayed decoration. The host's storage adapter and
 * save endpoint are never supplied to this renderer. */
export async function openFriendVisit({client,id,doc=document,onClose=()=>{},isActive=()=>true}){
 const win=doc.defaultView,data=await client.visit(id);if(!isActive())throw new Error('参观已取消');const overlay=doc.createElement('section');overlay.className='social-visit';overlay.setAttribute('aria-label','好友房间参观');
 const header=doc.createElement('header'),title=doc.createElement('strong'),back=doc.createElement('button'),status=doc.createElement('span'),floors=doc.createElement('nav'),stage=doc.createElement('div');
 title.textContent=data.host.name+' 的家 · 只读参观';back.type='button';back.textContent='返回我的小屋';status.setAttribute('role','status');stage.className='social-visit-stage';header.append(title,status,back);overlay.append(header,floors,stage);doc.body.append(overlay);
 let mounted=null,closed=false,timer=0,generation=0,checking=false;
 const close=async(leave=true)=>{if(closed)return;closed=true;generation++;win.clearInterval(timer);mounted?.dispose();overlay.remove();onClose();if(leave)try{await client.post('invitation',{id,action:'leave'});}catch{}};
 back.onclick=()=>void close();
 async function render(floor){
  const serial=++generation;mounted?.dispose();mounted=null;stage.replaceChildren();status.textContent='正在打开 '+floor.name+'…';
  const key='friend-visit',baseline=createEconomy({storageAdapter:null}).getState(),account=JSON.parse(JSON.stringify(baseline));
  for(const name of ['valid','writable','error','catalog','tiers','nextTier','pets'])delete account[name];
  const layout=floor.scene.layout,placed=Object.keys(layout?.furniture||{}).filter(name=>name.startsWith('shop-')).map(name=>name.slice(5));
  account.owned=[...new Set([...placed,...(floor.scene.appearance.flooring?[floor.scene.appearance.flooring]:[])])];account.petOwned=[data.activePet];account.activePet=data.activePet;
  account.roomLevel=floor.scene.roomLevel;account.maxRoomLevel=floor.scene.roomLevel;account.layout=layout;account.layouts=layout?{[String(floor.scene.roomLevel)]:layout}:{};account.stored=floor.scene.stored;account.appearance=floor.scene.appearance;
  const rewards=placed.map(sku=>giftProduct(sku)).filter(Boolean).map(gift=>({id:gift.rewardId,kind:gift.giftKind,name:gift.name,at:null,expiresAt:null}));
  const companion={...defaultCompanion(),...floor.decoration,rewards,roomName:floor.name,petName:data.host.name+'的伙伴',tourDone:true,sound:{muted:true,volume:'quiet'},photos:[]};
  const values=new Map([[key+'-account-v1',JSON.stringify(account)],[key+'-companion-v1',JSON.stringify(companion)],...(layout?[[key,JSON.stringify(layout)]]:[])]);
  const adapter={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  try{const next=mountPetHouse({container:stage,storageKey:key,storageAdapter:adapter,quality:'balanced',panels:false,controls:false,styles:true,demo:false,bridge:false});mounted=next;await next.ready;if(serial!==generation||closed){next.dispose();return;}status.textContent='正在参观 '+floor.name+' · 不能修改主人的布置';}
  catch(error){if(serial===generation)status.textContent='这间房暂时没打开：'+error.message;}
 }
 for(const floor of data.floors){const button=doc.createElement('button');button.type='button';button.textContent=(floor.floor+1)+' 楼 · '+floor.name;button.onclick=()=>void render(floor);floors.append(button);}
 timer=win.setInterval(async()=>{if(closed||checking)return;checking=true;try{await client.visit(id);}catch{if(!closed){status.textContent='邀请已结束，正在回家';await close(false);}}finally{checking=false;}},5000);
 await render(data.floors[0]);
 return {close};
}
