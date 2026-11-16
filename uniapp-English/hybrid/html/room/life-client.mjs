import {createRequestId} from './request-id.mjs';
/** Server-owned progress. A reward snapshot is adopted only over a clean, matching local revision. */
export function createLifeClient({fetcher,getRoom,getTransport,monotonicNow=()=>globalThis.performance.now()}={}){
 let data=null,pending=null,busy=false,serverClock=null;
 async function readState(){const value=await request('state');if(!Number.isSafeInteger(value.serverNow)||value.serverNow<=0)throw new Error('生活进度的时间尚未同步，请重新连接');serverClock={epoch:value.serverNow,received:monotonicNow()};data=value;return value;}
 async function request(path,body){const r=await fetcher('/api/v1/life/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok||!value.ok)throw Object.assign(new Error(value.message||'小屋生活暂时未连接'),{code:value.code,status:r.status});return value;}
 async function clean(){const room=getRoom(),transport=getTransport();if(!room?.api?.getState().ready||!transport)throw new Error('等待房间准备好后再打开生活面板');if(room.api.getState().decoration||room.api.getFurnitureTrial?.()||room.api.hasUnsavedDrawing?.()||room.view?.root?.dataset?.roomDrawingDirty==='true')throw new Error('请先完成装修和保存手绘，再进行生活操作');const result=await transport.flush();if(!result.ok)throw new Error(result.message||'先等待装修同步完成，避免覆盖你刚才的布置');return {room,transport};}
 return {
  get data(){return data;},
  async refresh(){await clean();return readState();},
  gallery:options=>request('gallery?'+new URLSearchParams({page:String(options?.page||0),favorites:options?.favorites?'1':'0'})),
  async act(action){
   if(busy)throw new Error('上一项操作还在保存，请稍等');busy=true;
   try{
    const {room,transport}=await clean(),fingerprint=JSON.stringify(action),recovering=!!pending&&pending.fingerprint!==fingerprint;
    if(!pending){
     // Phone clocks may be wrong, or jump after waking. Use a recent server clock.
     if(!serverClock||monotonicNow()-serverClock.received>60000||monotonicNow()<serverClock.received)await readState();
     const issuedAt=Math.floor(serverClock.epoch+monotonicNow()-serverClock.received);pending={fingerprint,issuedAt,id:issuedAt.toString(36)+'_'+createRequestId(),action:JSON.parse(fingerprint),roomId:room.api.getEstate().estate.activeRoomId,baseRevision:transport.revision};
    }
    const baseRevision=transport.revision;let result;
    // Resolve an uncertain old receipt before a different action; never change its floor or payload.
    try{result=await request('action',{requestId:pending.id,issuedAt:pending.issuedAt,baseRevision:pending.baseRevision,roomId:pending.roomId,action:pending.action});}
    catch(error){
     if(error.code==='REQUEST_EXPIRED'){
      pending=null;serverClock=null;
      // Never silently resend an expired spending request: show fresh state for reconfirmation.
      try{error.recoveredState=await readState();error.message='已同步最新种植和材料状态，请检查后再点一次；本次没有重复消耗材料';}catch{error.message='操作时间需要重新同步，请重新打开生活面板后再确认';}
     }else if(error.status>=400&&error.status<500){pending=null;}
     throw error;
    }
    data=result;
    const olderReceipt=result.replayed&&result.homeChanged&&result.home?.revision<baseRevision;
    if(result.homeChanged&&!olderReceipt){transport.acceptRemote(result.home,baseRevision);const refreshed=await room.api.reloadFromStorage();if(!refreshed.ok)throw new Error(refreshed.message||'奖励已保存，请重新打开小屋显示');room.api.setPresentationPaused(true);}
    pending=null;
    if(recovering||olderReceipt){const current=await readState();throw Object.assign(new Error('上一项操作已确认，材料状态已更新，请查看后再选择下一项'),{recoveredState:current});}
    return result;
   }finally{busy=false;}
  },
 };
}
