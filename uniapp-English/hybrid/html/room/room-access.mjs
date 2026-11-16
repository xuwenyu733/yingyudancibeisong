import {createVisibleTicker} from './visible-ticker.mjs';
import {createRequestId} from './request-id.mjs';
/** Verified child identity and online statistics. No countdown or time-based lockout. */
export async function connectRoomAccess({apiBase=location.origin,doc=document,fetcher=fetch,isActive=()=>true}={}){
 const win=doc.defaultView,base=new URL(apiBase);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('小屋服务地址无效');
 const origin=base.origin,key='room-private-session:'+origin;
 const hash=new URLSearchParams(win.location.hash.slice(1)),ticket=hash.get('roomTicket');
 let token;try{token=win.sessionStorage.getItem(key)||'';}catch{}
 async function raw(path,options={}){return fetcher(origin+path,{...options,credentials:'omit',cache:'no-store',headers:{...options.headers,...(token?{Authorization:'Bearer '+token}:{})},signal:options.signal||AbortSignal.timeout(8000)});}
 if(ticket){
  // A one-use ticket is carried only in the URL fragment, never in HTTP URLs/logs.
  const response=await raw('/api/v1/room-access/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})}),value=await response.json();
  if(!response.ok||!value.accessToken)throw new Error(value.message||'入屋凭据已过期，请从学习页面重新打开');
  token=value.accessToken;try{win.sessionStorage.setItem(key,token);}catch{}
  hash.delete('roomTicket');win.history.replaceState(null,'',win.location.pathname+win.location.search+(hash.size?'#'+hash:''));
 }
 if(!/^[a-f0-9]{64}$/.test(token||''))throw new Error('请从已登录的学习页面进入仓鼠屋，以便按孩子账号保护使用时长');
 const meResponse=await raw('/api/v1/social/me'),me=await meResponse.json();if(!meResponse.ok||!me.identity?.accountKey?.startsWith('learner-'))throw new Error('小屋身份已失效，请从学习页面重新打开');
 let disposed=false,sequence=0,current=null,pending=null,room=null;
 const sessionId=createRequestId(win.crypto).replaceAll('-','');
 function pause(){const inactive=!isActive()||doc.visibilityState!=='visible'||!!doc.querySelector('.room-life-shade:not([hidden])'),app=doc.getElementById('app');if(app)app.inert=inactive;try{const shopOpen=!!doc.querySelector('.room-shop[data-open="true"]');room?.api.setPresentationPaused?.(inactive||shopOpen);win.dispatchEvent(new win.CustomEvent('room-access-pause',{detail:{paused:inactive}}));}catch{}}
 async function beat(){
  if(disposed)return current;if(pending)return pending;
  pending=(async()=>{try{
   const response=await raw('/api/v1/room-access/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,sequence:++sequence,active:doc.visibilityState==='visible'&&isActive()})});const value=await response.json();
   if(!response.ok||!value.ok)throw new Error('暂时无法同步在线记录');current=value;return value;
  }catch{return null;}finally{pending=null;}})();return pending;
 }
 const visible=()=>{pause();void (async()=>{if(pending)await pending;if(!disposed)await beat();})();};
 const hide=()=>{try{void raw('/api/v1/room-access/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,sequence:++sequence,active:false}),keepalive:true}).catch(()=>{});}catch{}};win.addEventListener('pagehide',hide);
 const ticker=createVisibleTicker({doc,interval:5000,onTick:()=>void beat(),onHidden:visible,onVisible:visible});await beat();
 return {identity:me.identity,get allowed(){return !disposed;},get status(){return current;},
  fetcher(input,options={}){const path=new URL(input,origin);if(path.origin!==origin||!path.pathname.startsWith('/api/v1/'))throw new Error('小屋凭据不能发送给其他服务');return raw(path.pathname+path.search,options);},
  attach(value){room=value;pause();},check:beat,async refreshActivity(){pause();if(pending)await pending;if(!disposed)return beat();},
  dispose(){if(disposed)return;hide();disposed=true;ticker.dispose();win.removeEventListener('pagehide',hide);},
 };
}
