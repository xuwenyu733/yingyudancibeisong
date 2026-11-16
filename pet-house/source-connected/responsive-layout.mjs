/** Layout follows the available CSS pixels, including iPad split view. World geometry is untouched. */
export function measureRoomViewport(width,height,{touch=false}={}){
 const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),short=Math.min(w,h),wide=w>h;
 const layout=wide&&h<=540?'compact':w<600?'phone':touch&&short>=600||w<1100?'tablet':'desktop';
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const scale=layout==='compact'?clamp(h/390,.85,1):layout==='phone'?clamp(w/390,.95,1.08):layout==='tablet'?clamp(short/768,1,1.25):clamp(Math.min(w/1440,h/900),1,1.2);
 return {width:Math.round(w),height:Math.round(h),layout,aspect:wide?'landscape':'portrait',scale:Math.round(scale*1000)/1000};
}

export function visibleRoomViewport(win){
 const vv=win.visualViewport,useVisual=vv&&Math.abs((vv.scale||1)-1)<.05;
 const width=win.document?.documentElement?.clientWidth||win.innerWidth,height=win.document?.documentElement?.clientHeight||win.innerHeight;
 return {width,height:useVisual?Math.min(height,vv.height||height):height};
}

export function observeRoomViewport(root){
 const win=root.ownerDocument.defaultView,events=new win.AbortController(),listen={signal:events.signal};
 let disposed=false,frame=0,signature='';
 function update(){
  frame=0;if(disposed)return;const box=root.getBoundingClientRect();
  const state=measureRoomViewport(root.clientWidth||box.width,root.clientHeight||box.height,{touch:!!(win.matchMedia?.('(pointer:coarse)').matches||win.navigator?.maxTouchPoints>0)});
  const next=JSON.stringify(state);if(next===signature)return;signature=next;
  root.dataset.roomAdaptive='true';root.dataset.roomLayout=state.layout;root.dataset.roomAspect=state.aspect;
  root.style.setProperty('--room-ui-scale',String(state.scale));
  root.dispatchEvent(new win.CustomEvent('room-viewport-change',{detail:state}));
 }
 function schedule(){if(!disposed&&!frame)frame=win.requestAnimationFrame(update);}
 const observer=win.ResizeObserver?new win.ResizeObserver(schedule):null;observer?.observe(root);
 win.addEventListener('resize',schedule,listen);win.visualViewport?.addEventListener('resize',schedule,listen);update();
 return {dispose(){if(disposed)return;disposed=true;events.abort();observer?.disconnect();if(frame)win.cancelAnimationFrame(frame);root.style.removeProperty('--room-ui-scale');for(const key of ['roomAdaptive','roomLayout','roomAspect'])delete root.dataset[key];}};
}
