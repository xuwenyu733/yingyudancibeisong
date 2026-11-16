import {mountPetHouse} from './pet-house.js';
import {createEconomy} from './economy.mjs';
import {defaultCompanion} from './companion-state.mjs';
import {giftProduct} from './gift-catalog.mjs';
import {createRequestId} from './request-id.mjs';
import {createVisibleTicker} from './visible-ticker.mjs';
import {visitAction,postVisit,createVisitSnapshotGate,applyVisitSnapshot} from './visit-sync.mjs';

/** Render public decoration in memory. The owner's storage and save endpoint never enter this view. */
export async function openFriendVisit({client,id,doc=document,onClose=()=>{},isActive=()=>true,signal}){
 const win=doc.defaultView;let data=await client.visit(id,{signal});if(signal?.aborted||!isActive())throw new Error('参观已取消');
 if(!Array.isArray(data.floors)||!data.floors.length)throw new Error('这间小屋暂时没有可以参观的楼层');
 const overlay=doc.createElement('section');overlay.className='social-visit';overlay.setAttribute('aria-label','好友房间参观');
 const title=doc.createElement('strong'),status=doc.createElement('span'),floors=doc.createElement('nav'),stage=doc.createElement('div'),controls=doc.createElement('div');
 function iconButton(label,path){const button=doc.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.title=label;const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),shape=doc.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');shape.setAttribute('d',path);svg.append(shape);button.append(svg);controls.append(button);return button;}
 const back=iconButton('返回我的小屋','M10 6 4 12l6 6M4 12h10a6 6 0 0 1 6 6'),floorToggle=iconButton('切换参观楼层','m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5'),endInteraction=iconButton('结束互动','M7 7h10v10H7Z');
 title.className='social-visit-title';title.textContent=data.host.name+' 的家 · 好友参观';status.className='social-visit-status';status.setAttribute('role','status');stage.className='social-visit-stage';controls.className='social-visit-controls';controls.setAttribute('aria-label','参观控制');floors.className='social-visit-floors';floors.setAttribute('aria-label','参观楼层');floors.hidden=true;floorToggle.setAttribute('aria-expanded','false');endInteraction.hidden=true;overlay.append(title,stage,status,floors,controls);doc.body.append(overlay);
 let noticeUntil=0;
 function announce(text,notice=false){if(!notice&&Date.now()<noticeUntil)return;noticeUntil=notice?Date.now()+6000:0;status.textContent=text;status.dataset.notice=String(notice);}
 function toggleFloors(show){floors.hidden=!show;floorToggle.setAttribute('aria-expanded',String(show));}
 let mounted=null,closed=false,renderGeneration=0,checking=null,acting=null,refreshing=null,activeFloor=null,sequence=0,requestSequence=0,lastGood=Date.now(),sessionGeneration=null,snapshot=null,homeRevision=data.homeRevision;
 const sessionId=createRequestId(win.crypto).replaceAll('-',''),gate=createVisitSnapshotGate();
 const presence=(active,options={})=>postVisit(client,'visit-presence',{id,sessionId,sequence:++sequence,active,...(activeFloor?{roomId:activeFloor.id}:{}),...(active&&sessionGeneration===null?{join:true}:{})},options);
 const cancelCheck=()=>{if(checking){win.clearTimeout(checking.timeout);checking.controller.abort();checking=null;}};
 const cancelAction=()=>{acting?.controller.abort();acting=null;};
 const cancelRefresh=()=>{if(refreshing){win.clearTimeout(refreshing.timeout);refreshing.controller.abort();refreshing=null;}};
 const selfAction=()=>snapshot?.visitors?.find(row=>row.publicId===client.identity?.publicId)?.action;
 const refreshControls=()=>{endInteraction.hidden=!selfAction();endInteraction.disabled=!selfAction()||!!acting;};
 const clearActors=()=>{mounted?.api?.setVisitInteractionTransport?.(null);applyVisitSnapshot(mounted?.api,{visitors:[],owner:null});endInteraction.hidden=true;endInteraction.disabled=true;};
 const hide=()=>{cancelCheck();cancelAction();cancelRefresh();clearActors();void presence(false,{keepalive:true}).catch(()=>{});};
 const current=(serial,floor)=>!closed&&!doc.hidden&&renderGeneration===serial&&activeFloor===floor;
 function receive(value,request){
  if(!gate.accept(value,request))return false;
  if(value.generation!==undefined)sessionGeneration=value.generation;snapshot=value;
  applyVisitSnapshot(mounted?.api,value,{roomId:activeFloor?.id});
  if(value.homeRevision!==undefined){if(homeRevision===undefined)homeRevision=value.homeRevision;else if(value.homeRevision!==homeRevision)void refreshHome();}
  refreshControls();return true;
 }
 function connect(){mounted?.api?.setVisitInteractionTransport?.(interact,{role:'guest',selfPublicId:client.identity?.publicId});}
 const close=async(leave=true)=>{if(closed)return;closed=true;renderGeneration++;cancelCheck();cancelAction();cancelRefresh();ticker.dispose();win.removeEventListener('pagehide',hide);signal?.removeEventListener('abort',abortVisit);clearActors();void presence(false,{keepalive:true}).catch(()=>{});mounted?.dispose();overlay.remove();onClose();if(leave)try{await client.post('invitation',{id,action:'leave'});}catch{}};
 const abortVisit=()=>void close(false);signal?.addEventListener('abort',abortVisit,{once:true});win.addEventListener('pagehide',hide);
 back.onclick=()=>void close();floorToggle.onclick=()=>toggleFloors(floors.hidden);endInteraction.onclick=()=>void interact({type:'cancel'}).catch(()=>{});
 overlay.addEventListener('pointerdown',event=>{if(!floors.contains(event.target)&&!controls.contains(event.target))toggleFloors(false);});
 overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();if(!floors.hidden){toggleFloors(false);floorToggle.focus();}else void close();}});
 async function render(floor){
  const serial=++renderGeneration;cancelCheck();cancelAction();cancelRefresh();clearActors();activeFloor=null;void presence(false).catch(()=>{});mounted?.dispose();mounted=null;snapshot=null;stage.replaceChildren();toggleFloors(false);announce('正在打开 '+floor.name+'…',true);
  for(const button of floors.children)button.setAttribute('aria-pressed',String(button.dataset.roomId===floor.id));
  const key='friend-visit',baseline=createEconomy({storageAdapter:null}).getState(),account=JSON.parse(JSON.stringify(baseline));
  for(const name of ['valid','writable','error','catalog','tiers','nextTier','pets'])delete account[name];
  const layout=floor.scene.layout,placed=[...new Set([...Object.keys(layout?.furniture||{}).filter(name=>name.startsWith('shop-')).map(name=>name.slice(5)),...(Array.isArray(floor.scene.displayedItems)?floor.scene.displayedItems:[])])];
  account.owned=[...new Set([...placed,...(floor.scene.appearance.flooring?[floor.scene.appearance.flooring]:[])])];account.petOwned=[data.activePet];account.activePet=data.activePet;
  account.roomLevel=floor.scene.roomLevel;account.maxRoomLevel=floor.scene.roomLevel;account.layout=layout;account.layouts=layout?{[String(floor.scene.roomLevel)]:layout}:{};account.stored=floor.scene.stored;account.appearance=floor.scene.appearance;
  const rewards=placed.map(sku=>giftProduct(sku)).filter(Boolean).map(gift=>({id:gift.rewardId,kind:gift.giftKind,name:gift.name,at:null,expiresAt:null}));
  const companion={...defaultCompanion(),...floor.decoration,rewards,roomName:floor.name,petName:data.host.name+'的伙伴',tourDone:true,sound:{muted:true,volume:'quiet'},photos:[]};
  const values=new Map([[key+'-account-v1',JSON.stringify(account)],[key+'-companion-v1',JSON.stringify(companion)],...(layout?[[key,JSON.stringify(layout)]]:[])]);
  const adapter={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  try{const next=mountPetHouse({container:stage,storageKey:key,storageAdapter:adapter,quality:'balanced',panels:false,controls:false,styles:true,demo:false,bridge:false,visitMode:{role:'guest',roomId:floor.id,selfPublicId:client.identity?.publicId,ownerPublicId:data.host.publicId}});mounted=next;await next.ready;if(serial!==renderGeneration||closed){next.dispose();return;}activeFloor=floor;noticeUntil=0;announce('正在参观 '+floor.name+' · 点击宠物或家具可以互动');await check();}
  catch(error){if(serial===renderGeneration&&!closed)announce('这间房暂时没打开：'+error.message,true);}
 }
 function paintFloors(){floors.replaceChildren();floorToggle.hidden=data.floors.length<2;for(const floor of data.floors){const button=doc.createElement('button');button.type='button';button.dataset.roomId=floor.id;button.textContent=(floor.floor+1)+' 楼 · '+floor.name;button.setAttribute('aria-pressed',String(activeFloor?.id===floor.id));button.onclick=()=>void render(floor);floors.append(button);}}
 async function refreshHome(){
  if(refreshing||closed||doc.hidden||!activeFloor)return;
  const attempt={controller:new win.AbortController(),serial:renderGeneration,floor:activeFloor};refreshing=attempt;attempt.timeout=win.setTimeout(()=>attempt.controller.abort(),10000);
  try{const next=await client.visit(id,{signal:attempt.controller.signal});if(!current(attempt.serial,attempt.floor)||refreshing!==attempt)return;if(!Array.isArray(next.floors)||!next.floors.length)throw new Error('主人的房间正在调整，请稍后再来');
   const nextFloor=next.floors.find(floor=>floor.id===attempt.floor.id)||next.floors[0],changed=JSON.stringify(nextFloor)!==JSON.stringify(attempt.floor);data=next;homeRevision=next.homeRevision??snapshot?.homeRevision;title.textContent=data.host.name+' 的家 · 好友参观';paintFloors();
   if(changed){win.clearTimeout(attempt.timeout);refreshing=null;await render(nextFloor);}
  }catch(error){if(current(attempt.serial,attempt.floor)&&refreshing===attempt){if([401,403,404].includes(error.status))void close(false);else announce(error.message||'主人的新布置还在同步，请稍等',true);}}
  finally{win.clearTimeout(attempt.timeout);if(refreshing===attempt)refreshing=null;}
 }
 paintFloors();
 async function interact(intent){
  if(closed||doc.hidden||!activeFloor||sessionGeneration===null)throw new Error('正在连接朋友的小屋，请稍等');
  if(acting&&intent.type!=='cancel')throw new Error('上一个互动还在同步，请稍等');
  const previous=selfAction();
  if(intent.type!=='cancel'&&previous){const floor=activeFloor,serial=renderGeneration,cancelled=await interact({type:'cancel',actionId:previous.id});if(!current(serial,floor))throw new Error('这次互动已取消');if(intent.type==='furniture'&&previous.targetId===intent.targetId)return cancelled;}
  if(intent.type==='cancel')cancelAction();
  const attempt={controller:new win.AbortController(),floor:activeFloor,serial:renderGeneration,request:++requestSequence};acting=attempt;endInteraction.disabled=true;
  const timeout=win.setTimeout(()=>attempt.controller.abort(),10000);
  try{
   const action=visitAction(intent);if(action.type==='cancel'&&!action.actionId){const actionId=selfAction()?.id;if(actionId)action.actionId=actionId;}
   const value=await postVisit(client,'visit-action',{id,sessionId,generation:sessionGeneration,requestId:createRequestId(win.crypto),roomId:attempt.floor.id,action},{signal:attempt.controller.signal});
   if(!current(attempt.serial,attempt.floor)||acting!==attempt)throw new Error('这次互动已取消');
   receive(value,attempt.request);lastGood=Date.now();announce(intent.type==='greet'?'正在和朋友打招呼':'正在参观 '+attempt.floor.name+' · 点击家具可以互动');return value;
  }catch(error){if(current(attempt.serial,attempt.floor)&&acting===attempt){announce(error.message||'互动暂时没连上，请重试',true);if([401,403,404].includes(error.status))void close(false);}throw error;
  }finally{win.clearTimeout(timeout);if(acting===attempt){acting=null;refreshControls();}}
 }
 async function check(){
  if(closed||checking||doc.hidden||!activeFloor)return;
  const attempt={controller:new win.AbortController(),floor:activeFloor,serial:renderGeneration,request:++requestSequence};checking=attempt;attempt.timeout=win.setTimeout(()=>attempt.controller.abort(),10000);
  const valid=()=>current(attempt.serial,attempt.floor)&&checking===attempt;
  try{const value=await presence(true,{signal:attempt.controller.signal});if(!valid())return;receive(value,attempt.request);connect();lastGood=Date.now();announce('正在参观 '+attempt.floor.name+' · 主人可以看到你来访');}
  catch(error){if(!valid())return;if([401,403,404,409].includes(error.status)||Date.now()-lastGood>20000){announce('参观连接已结束，正在回家',true);await close(false);}else announce('连接稍慢，正在重新同步来访状态…',true);}
  finally{win.clearTimeout(attempt.timeout);if(checking===attempt)checking=null;}
 }
 const ticker=createVisibleTicker({doc,interval:3000,onTick:()=>void check(),onHidden:hide,onVisible:()=>void check()});
 await render(data.floors[0]);return {close};
}
