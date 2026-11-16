import {randomBytes} from 'node:crypto';
const fail=(code,message)=>Object.assign(new Error(message),{status:409,code});
const nonce=()=>randomBytes(12).toString('hex');
/** Process-local visual actions. Nothing in this store changes an estate or a bank. */
export function createVisitRuntime({now=Date.now,ttl=15000,retention=60000,maxActors=10000}={}){
 const guests=new Map(),hosts=new Map(),retired=new Map(),receipts=new Map(),runtimeId=nonce();let revision=0;
 const touch=()=>++revision;
 function cancel(row){if(!row)return;const id=row.action?.id;if(id){delete row.action;touch();for(const owner of hosts.values())if(owner.action?.id===id){delete owner.action;touch();}for(const guest of guests.values())if(guest.action?.id===id){delete guest.action;touch();}}row.seatId=null;}
 function prune(){const at=now();for(const map of [guests,hosts])for(const [key,row]of map){if(at-row.at>=ttl&&row.active){row.active=false;cancel(row);touch();}if(at-row.at>retention)map.delete(key);if(row.action&&row.action.expiresAt<=at)cancel(row);}for(const [key,until]of retired)if(until<=at)retired.delete(key);for(const [key,row]of receipts)if(row.until<=at)receipts.delete(key);}
 function update(map,key,input){
  prune();let old=map.get(key);const retiredKey=key+':'+input.sessionId;
  if(retired.has(retiredKey))throw fail('VISIT_SESSION_REPLACED','这个参观窗口已被新窗口替代，请重新进入');
  if(old&&old.sessionId!==input.sessionId){if(!input.active)return old;if(!input.join)throw fail('VISIT_SESSION_REPLACED','请从参观入口重新进入');if(retired.size>=maxActors)throw fail('VISIT_BUSY','来访连接繁忙，请稍后再试');retired.set(key+':'+old.sessionId,now()+retention);cancel(old);old=null;}
  if(old&&input.sequence<=old.sequence)return old;
  if(!old&&!input.active)return null;
  if(map===guests&&input.active&&(!old?.active||old.hostKey!==input.hostKey)&&[...guests.values()].filter(row=>row.active&&row.hostKey===input.hostKey&&row.guestKey!==key).length>=12)throw fail('VISIT_ROOM_FULL','小屋已有12位来访伙伴，请稍后再来');
  if(!old&&map.size>=maxActors)throw fail('VISIT_BUSY','来访连接繁忙，请稍后再试');
  const changedPlace=old&&(old.roomId!==input.roomId||old.hostKey!==input.hostKey||old.id!==input.id);
  if(changedPlace||!input.active)cancel(old);
  const row={...old,...input,generation:!old||changedPlace?nonce():old.generation,at:now()};
  delete row.join;map.set(key,row);touch();return row;
 }
 function currentGuest(key,sessionId,generation){prune();const row=guests.get(key);if(!row?.active||row.sessionId!==sessionId||row.generation!==generation)throw fail('VISIT_SESSION_REPLACED','参观连接已变化，请重新进入');return row;}
 function occupied(hostKey,roomId,targetId,except){return [...guests.values(),...hosts.values()].some(row=>row!==except&&row.active&&row.hostKey===hostKey&&row.roomId===roomId&&row.seatId===targetId);}
 function perform(row,intent,{floor,target,host=false,requestId}={}){
  prune();if(!row?.active)throw fail('VISIT_OFFLINE','参观连接已断开，请重新进入');
  const receiptKey=requestId&&row.actorKey+':'+row.generation+':'+requestId,signature=JSON.stringify({roomId:row.roomId,intent});
  if(receiptKey&&receipts.has(receiptKey)){if(receipts.get(receiptKey).signature!==signature)throw fail('VISIT_REQUEST_REUSED','操作编号已经用于其他内容');return;}
  if(intent.type==='cancel'||intent.type==='release'){
   if(!host&&row.action&&!intent.actionId)throw fail('VISIT_ACTION_CHANGED','互动已经变化，请刷新后再结束');
   if(!intent.actionId||row.action?.id===intent.actionId)cancel(row);
  }else{
   if(row.action)throw fail('VISIT_ACTOR_BUSY','伙伴正在互动，请先结束当前动作');
   let action;
   if(intent.type==='greet'){
    if(host)throw fail('VISIT_ACTION_INVALID','请让来访伙伴点击主人打招呼');
    const owner=hosts.get(row.hostKey);
    if(!owner?.active||owner.roomId!==row.roomId)throw fail('VISIT_OWNER_OFFLINE','主人暂时不在这一层');
    if(owner.busy||owner.seatId||owner.action)throw fail('VISIT_OWNER_BUSY','主人正在忙，等一会儿再打招呼吧');
    const facing={...owner.position},approach=floor.greetPoint(facing);
    if(!approach)throw fail('VISIT_PATH_BLOCKED','主人附近暂时没有可以打招呼的位置');
    action={id:nonce(),kind:'greet',targetId:owner.publicId,startedAt:now(),expiresAt:now()+14000,approach,facing};
    owner.action={...action,actorPublicId:row.publicId};touch();
   }else{
    if(!target)throw fail('VISIT_TARGET_GONE','这件家具已移动、收起或暂不支持互动');
    const seatId=target.kind==='seat'?target.id:target.seatId;
    if(seatId&&occupied(row.hostKey,row.roomId,seatId,row))throw fail('VISIT_SEAT_OCCUPIED','这个座位已经有伙伴啦');
    action={id:nonce(),kind:target.kind,targetId:target.id,slotId:target.kind==='seat'?'main':undefined,variant:target.variant,startedAt:now(),expiresAt:now()+(target.kind==='seat'?60000:30000),targetFingerprint:target.fingerprint,...(seatId?{seatId,seatFingerprint:target.seatFingerprint||target.fingerprint}:{})};
   }
   row.action=action;row.seatId=action.seatId||null;row.seatConfirmed=false;touch();
  }
  if(receiptKey){if(receipts.size>=maxActors)receipts.delete(receipts.keys().next().value);receipts.set(receiptKey,{signature,until:now()+60000});}
 }
 function reconcile(hostKey,home){prune();for(const row of [...guests.values(),...hosts.values()])if(row.hostKey===hostKey&&row.active){const floor=home.floors.find(f=>f.id===row.roomId);if(!floor){row.active=false;cancel(row);touch();continue;}if(row.action?.targetFingerprint&&floor.targets.get(row.action.targetId)?.fingerprint!==row.action.targetFingerprint||row.action?.seatFingerprint&&floor.targets.get(row.action.seatId)?.fingerprint!==row.action.seatFingerprint)cancel(row);if(row.action?.kind==='greet'){const owner=hosts.get(hostKey);if(!owner?.active||owner.roomId!==row.roomId||owner.busy||Math.hypot(owner.position.x-row.action.facing.x,owner.position.z-row.action.facing.z)>.8)cancel(row);}}}
 const publicRow=row=>{const {id,publicId,name,roomId,floor,roomName,pet,action}=row;return {id,publicId,name,roomId,floor,roomName,pet,action:action?{...action}:null};};
 return {
  updateGuest(input){const row=update(guests,input.guestKey,{...input,actorKey:input.guestKey});if(row?.active&&row.action?.kind==='seat')row.action.expiresAt=now()+60000;return row;},
  updateHost(input){const old=hosts.get(input.hostKey);if(old&&old.sessionId===input.sessionId&&input.sequence>old.sequence&&old.action?.kind==='greet'&&(input.busy||old.roomId!==input.roomId))cancel(old);const row=update(hosts,input.hostKey,{...input,actorKey:input.hostKey});if(row?.active&&row.action?.kind==='seat')row.action.expiresAt=now()+60000;return row;},
  currentHost(key,sessionId,generation){prune();const row=hosts.get(key);if(!row?.active||row.sessionId!==sessionId||row.generation!==generation)throw fail('VISIT_SESSION_REPLACED','主人窗口已经变化');return row;},
  hostSequence(key,sessionId){const row=hosts.get(key);return row?.sessionId===sessionId?row.sequence:0;},
  syncHostSeat(row,seatId,{floor,target}={}){if(seatId===undefined)return;if(seatId===null){if(row.seatConfirmed)cancel(row);return;}if(row.seatId===seatId){row.seatConfirmed=true;return;}if(!target||target.kind!=='seat')throw fail('VISIT_TARGET_GONE','这个座位已经移走或收起');if(row.action)throw fail('VISIT_ACTOR_BUSY','请先结束当前互动再换座位');perform(row,{type:'seat',targetId:seatId},{host:true,floor,target});row.seatConfirmed=true;},
  currentGuest,perform,reconcile,
  list(hostKey){prune();return [...guests.values()].filter(row=>row.active&&row.hostKey===hostKey);},
  refreshPet(key,pet){const row=guests.get(key);if(row&&JSON.stringify(row.pet)!==JSON.stringify(pet)){row.pet=pet;touch();}},
  removeInvitation(id){for(const row of guests.values())if(row.id===id){row.active=false;cancel(row);touch();}},
  snapshot(hostKey,homeRevision){prune();const owner=hosts.get(hostKey);return {ok:true,runtimeId,revision,serverNow:now(),homeRevision,owner:owner?.active?{...publicRow(owner),position:owner.position,seatId:owner.seatId||null,busy:owner.busy||false}:null,visitors:this.list(hostKey).slice(0,12).map(publicRow)};},
 };
}
