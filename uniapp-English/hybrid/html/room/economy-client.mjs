import {createRequestId} from './request-id.mjs';

/** Online transactions are commands: only the server may change assets. */
export function createEconomyClient({fetcher,getRoom,getTransport,doc=globalThis.document,clock=Date.now}={}){
 let busy=false,pending=null;
 const completed=new Map();
 const fail=(code,message)=>({ok:false,code,message});
 async function execute(action,{placement=null,requestId=null,requestScope=null}={}){
  const callerKey=typeof requestId==='string'&&requestId.length<=128?requestId:null;
  const scope=requestScope||JSON.stringify(action),prior=callerKey&&completed.get(callerKey);
  if(prior)return prior.scope===scope?{...prior.result,unchanged:true,replayed:true,state:getRoom()?.api.getShop?.()}:fail('REQUEST_ID_REUSED','这个操作编号已用于其他内容');
  if(busy)return fail('ECONOMY_BUSY','上一项兑换正在保存，请稍等');
  const room=getRoom(),transport=getTransport();
  if(!room?.api?.getState().ready||!transport)return fail('NOT_READY','房间还没准备好，请稍后再试');
  if(room.api.hasUnsavedDrawing?.())return fail('UNSAVED_DRAWING','先保存手绘，再进行兑换');
  busy=true;const app=doc?.getElementById('app'),wasInert=!!app?.inert;
  const wasShop=!!doc?.querySelector('.room-shop[data-open="true"]'),wasProfile=!!doc?.querySelector('.room-profile:not([hidden])');
  const shopTab=doc?.querySelector('.room-shop__tab[aria-selected="true"]')?.dataset.shopTab;
  if(app)app.inert=true;room.api.setPresentationPaused?.(true);
  try{
   const saved=await transport.flush();if(!saved.ok)return saved;
   const fingerprint=scope,now=clock();
   if(pending&&pending.fingerprint!==fingerprint)return fail('ECONOMY_UNCONFIRMED','上一项操作还没有确认，请先重试同一项，或重新进入小屋核对结果');
   if(!pending)pending={fingerprint,issuedAt:now,requestId:now.toString(36)+'_'+createRequestId()};
   const baseRevision=transport.revision;
   const response=await fetcher('/api/v1/economy/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:pending.requestId,issuedAt:pending.issuedAt,baseRevision,roomId:room.api.getEstate().estate.activeRoomId,action})});
   const result=await response.json();
   if(!response.ok||!result.ok){if(response.status<500&&response.status!==429)pending=null;return fail(result.code||'ECONOMY_REJECTED',result.message||'这次操作没有完成');}
   transport.acceptRemote(result.home,baseRevision);pending=null;
   const refreshed=await room.api.reloadFromStorage();if(!refreshed.ok)return fail('ECONOMY_RELOAD','兑换已在服务器保存，请重新进入查看');
   // Ownership is already committed. Place through the fresh scene controller,
   // which validates collisions and persists the layout without spending again.
   if(action.type==='purchase'&&room.api.getShop?.().stored?.includes(action.sku)){
    const placed=await room.api.purchaseFurniture(action.sku,undefined,placement);
    if(!placed.ok)result.message='兑换成功，家具已放入仓库。'+(placed.message||'整理出空位后就能摆放');
    else {const layoutSaved=await transport.flush();if(!layoutSaved.ok)result.message='兑换成功，摆放尚未同步；请保留此页面并重试保存';}
   }
   if(wasShop){doc?.querySelector('.room-shop__trigger')?.click();if(shopTab)doc?.querySelector(`[data-shop-tab="${shopTab}"]`)?.click();}
   if(wasProfile)doc?.querySelector('.room-profile-level')?.click();
   const status=doc?.getElementById('database-sync-status');if(status)status.textContent=result.message||'操作已保存';
   const answer={...result,state:room.api.getShop?.(),balance:room.api.getShop?.().balance};
   if(callerKey){completed.set(callerKey,{scope,result:{...answer,home:undefined}});if(completed.size>100)completed.delete(completed.keys().next().value);}
   return answer;
  }catch(error){return {...fail(error.code||'ECONOMY_NETWORK',error.message||'尚未确认服务器结果，请重试同一项；不会重复扣分'),...(error.code==='SYNC_CONFLICT'&&error.recovery?{recovery:error.recovery}:{})};}
  finally{busy=false;if(app)app.inert=wasInert;room.api.setPresentationPaused?.(wasInert||!!doc?.querySelector('.room-shop[data-open="true"]'));}
 }
 return {execute,get busy(){return busy;}};
}
