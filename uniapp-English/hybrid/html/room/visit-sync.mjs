/** Only interaction intent crosses the visit boundary; coordinates and pets are server-owned. */
export function visitAction(value){
 if(!value||!['furniture','greet','cancel'].includes(value.type))throw new Error('这个互动暂时不可用');
 const action={type:value.type};
 for(const key of ['targetId','variant','actionId'])if(typeof value[key]==='string'&&value[key])action[key]=value[key];
 return action;
}

export function postVisit(client,path,data,options={}){
 return client.request?client.request(path,{...options,method:'POST',data}):client.post(path,data);
}

/** Responses from heartbeats and actions can finish in the opposite order. */
export function createVisitSnapshotGate(){
 let lastRevision=-Infinity,lastTime=-Infinity,lastRequest=-Infinity,runtimeId=null;const retired=new Set();
 return {
  accept(snapshot,request=0){
   if(!snapshot||typeof snapshot!=='object')return false;
   if(typeof snapshot.runtimeId==='string'&&snapshot.runtimeId!==runtimeId){if(retired.has(snapshot.runtimeId))return false;if(runtimeId)retired.add(runtimeId);runtimeId=snapshot.runtimeId;lastRevision=lastTime=lastRequest=-Infinity;}
   const revision=Number(snapshot.revision),time=typeof snapshot.serverNow==='number'?snapshot.serverNow:Date.parse(snapshot.serverNow);
   const hasRevision=snapshot.revision!==undefined&&Number.isFinite(revision),hasTime=Number.isFinite(time);
   if(hasRevision&&revision<lastRevision||hasTime&&time<lastTime)return false;
   if((!hasRevision||revision===lastRevision)&&(!hasTime||time===lastTime)&&request<lastRequest)return false;
   if(hasRevision)lastRevision=revision;if(hasTime)lastTime=time;lastRequest=Math.max(lastRequest,request);return true;
  },
  reset(){lastRevision=lastTime=lastRequest=-Infinity;runtimeId=null;retired.clear();}
 };
}

export function applyVisitSnapshot(api,snapshot,{roomId,exclude=new Set()}={}){
 const visitors=(Array.isArray(snapshot.visitors)?snapshot.visitors:[]).filter(row=>!exclude.has(row.id)&&(!roomId||row.roomId===roomId));
 const projected={...snapshot,visitors};
 if(api?.applyRoomVisitState)api.applyRoomVisitState(projected);else api?.setRoomVisitors?.(visitors);
 return projected;
}
