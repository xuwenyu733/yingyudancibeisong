/** Keep visible-page polling separate from a final inactive notification. */
export function createVisibleTicker({doc=document,interval,onTick,onHidden=()=>{},onVisible=onTick}){
 const win=doc.defaultView;let timer=null,disposed=false,hidden=doc.hidden;
 const stop=()=>{if(timer!==null){win.clearInterval(timer);timer=null;}};
 const start=()=>{if(!disposed&&!doc.hidden&&timer===null)timer=win.setInterval(onTick,interval);};
 const visibility=()=>{if(disposed||hidden===doc.hidden)return;hidden=doc.hidden;if(hidden){stop();onHidden();}else{start();onVisible();}};
 doc.addEventListener('visibilitychange',visibility);start();
 return {dispose(){if(disposed)return;disposed=true;stop();doc.removeEventListener('visibilitychange',visibility);}};
}
