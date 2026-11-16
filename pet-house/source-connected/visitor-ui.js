import {createVisibleTicker} from './visible-ticker.mjs';
import {createRequestId} from './request-id.mjs';
import {visitAction,postVisit,createVisitSnapshotGate,applyVisitSnapshot} from './visit-sync.mjs';

/** Owner presence and visitor pets share one canonical, account-scoped snapshot. */
export function createVisitorPanel({client,getApi,doc=document}){
 const win=doc.defaultView,box=doc.createElement('aside'),title=doc.createElement('strong'),list=doc.createElement('div'),notice=doc.createElement('p');
 box.className='room-visitors';box.hidden=true;box.setAttribute('aria-label','正在来访的朋友');notice.setAttribute('role','status');box.append(title,list,notice);doc.body.append(box);
 let disposed=false,away=false,guests=[],lastGood=0,lastView='',latestPoll=-Infinity,pending=null,acting=null,epoch=0,sequence=0,requestSequence=0,snapshot=null,joined=false;
 const sessionId=createRequestId(win.crypto).replaceAll('-',''),gate=createVisitSnapshotGate(),known=new Set(),ending=new Set(),ended=new Set();
 const floorId=()=>getApi()?.getEstate?.()?.estate?.activeRoomId||'room-1';
 const hasPresence=()=>typeof getApi()?.getVisitActorState==='function';
 const current=serial=>!disposed&&!away&&!doc.hidden&&epoch===serial;
 function hostPresence(active,action,options={}){
  const state=getApi()?.getVisitActorState?.()||{},data={sessionId,sequence:++sequence,active};
  if(active)Object.assign(data,{roomId:floorId(),busy:!!state.busy,position:state.position||{x:0,z:0},seatId:state.seatId||null,...(!joined?{join:true}:{}),...(action?{action,requestId:createRequestId(win.crypto)}:{})});
  return postVisit(client,'host-presence',data,options);
 }
 function cancelPending(){if(pending){win.clearTimeout(pending.timeout);pending.controller.abort();pending=null;}acting?.controller.abort();acting=null;}
 function inactive(){cancelPending();getApi()?.setVisitInteractionTransport?.(null);getApi()?.setRoomVisitors?.([]);if(hasPresence())void hostPresence(false,undefined,{keepalive:true}).catch(()=>{});}
 function receive(value,request){
  if(!gate.accept(value,request))return false;snapshot=value;if(value.generation!==undefined)joined=true;
  const next=(Array.isArray(value.visitors)?value.visitors:[]).filter(g=>!ended.has(g.id)).sort((a,b)=>a.publicId.localeCompare(b.publicId)),entered=next.filter(g=>!known.has(g.publicId));
  known.clear();for(const g of next)known.add(g.publicId);guests=next;lastGood=Date.now();
  if(entered.length)notice.textContent=entered.length===1?entered[0].name+' 来你家啦！':entered[0].name+' 等 '+entered.length+' 位朋友来你家啦！';
  paint();return true;
 }
 function paint(){
  if(disposed)return;if(Date.now()-lastGood>16000){guests=[];snapshot=null;}const api=getApi(),floor=floorId();box.hidden=away||!guests.length;
  if(api?.getState?.().ready){
   if(away||doc.hidden)api.setRoomVisitors?.([]);
   else{if(snapshot)applyVisitSnapshot(api,snapshot,{roomId:floor,exclude:ended});else api.setRoomVisitors?.([]);if(hasPresence())api.setVisitInteractionTransport?.(interact,{role:'host',selfPublicId:client.identity?.publicId});}
  }
  // Position and action heartbeats must not replace focused roster controls.
  const view=JSON.stringify([guests.map(g=>[g.id,g.publicId,g.name,g.roomId,g.floor]),floor,away,[...ending]]);if(view===lastView)return;lastView=view;list.replaceChildren();title.textContent='朋友来访 · '+guests.length+' 人';
  for(const guest of guests){
   const row=doc.createElement('div'),name=doc.createElement('span'),go=doc.createElement('button'),end=doc.createElement('button');go.type=end.type='button';name.textContent=guest.name;name.title=guest.publicId;
   go.textContent=(guest.floor+1)+' 楼'+(guest.roomId===floor?' · 在这里':' · 去看看');go.disabled=guest.roomId===floor;
   go.onclick=async()=>{go.disabled=true;try{const result=await getApi()?.selectEstateRoom?.(guest.roomId);if(!disposed&&result?.ok===false)notice.textContent=result.message||'请先完成当前装修，再去这一层';latestPoll=-Infinity;}catch(error){if(!disposed)notice.textContent=error.message||'这层房间暂时无法打开，请重试';}finally{lastView='';paint();}};
   end.textContent=ending.has(guest.id)?'结束中…':'结束';end.disabled=ending.has(guest.id);end.setAttribute('aria-label','结束'+guest.name+'的参观');
   end.onclick=async()=>{if(ending.has(guest.id)||disposed)return;ending.add(guest.id);paint();try{await client.post('invitation',{id:guest.id,action:'revoke'});if(disposed)return;ended.add(guest.id);guests=guests.filter(g=>g.id!==guest.id);notice.textContent='这次参观已结束';latestPoll=-Infinity;}catch(error){if(!disposed)notice.textContent=error.message;}finally{ending.delete(guest.id);paint();}};
   row.append(name,go,end);list.append(row);
  }
 }
 async function interact(intent){
  if(!current(epoch)||!hasPresence())throw new Error('请回到自己的小屋后再互动');
  if(intent.type==='greet')throw new Error('朋友可以点击你的宠物，向你打招呼');
  if(acting&&intent.type!=='cancel')throw new Error('上一个互动还在同步，请稍等');
  if(intent.type==='cancel'){acting?.controller.abort();acting=null;}
  const action=visitAction(intent);if(typeof intent.seatId==='string')action.seatId=intent.seatId;if(action.type==='cancel'&&!action.actionId&&snapshot?.owner?.action?.id)action.actionId=snapshot.owner.action.id;
  const attempt={controller:new win.AbortController(),serial:epoch,floor:floorId(),request:++requestSequence};acting=attempt;
  const timeout=win.setTimeout(()=>attempt.controller.abort(),10000);
  try{const value=await hostPresence(true,action,{signal:attempt.controller.signal});if(!current(attempt.serial)||acting!==attempt||floorId()!==attempt.floor)throw new Error('这次互动已取消');receive(value,attempt.request);return value;}
  catch(error){if(current(attempt.serial)&&acting===attempt)notice.textContent=error.message||'互动没有同步，请重试';throw error;}
  finally{win.clearTimeout(timeout);if(acting===attempt)acting=null;}
 }
 async function poll(){
  if(disposed||away||pending||acting||doc.hidden||Date.now()-latestPoll<(guests.length?2400:5900))return;latestPoll=Date.now();
  const attempt={controller:new win.AbortController(),serial:epoch,request:++requestSequence};pending=attempt;attempt.timeout=win.setTimeout(()=>attempt.controller.abort(),10000);
  try{const result=hasPresence()?await hostPresence(true,undefined,{signal:attempt.controller.signal}):await client.request('visitors',{signal:attempt.controller.signal});if(!current(attempt.serial)||pending!==attempt)return;receive(result,attempt.request);}catch(error){if(current(attempt.serial)){if(error.code==='VISIT_SEAT_OCCUPIED'){getApi()?.releaseVisitSeat?.();notice.textContent='这个座位已有来访伙伴，先站起来等一会儿吧';}paint();}}finally{win.clearTimeout(attempt.timeout);if(pending===attempt)pending=null;}
 }
 const tick=()=>{paint();void poll();},visible=()=>{latestPoll=-Infinity;tick();},hidden=()=>{epoch++;inactive();};
 const ticker=createVisibleTicker({doc,interval:1000,onTick:tick,onVisible:visible,onHidden:hidden});win.addEventListener('pagehide',hidden);void poll();
 return {
  setAway(value){const next=!!value;if(next===away)return;away=next;epoch++;if(away)inactive();else{latestPoll=-Infinity;void poll();}paint();},
  dispose(){if(disposed)return;disposed=true;epoch++;ticker.dispose();win.removeEventListener('pagehide',hidden);inactive();box.remove();}
 };
}
