const LABELS={'shop-reading-shelf':'读个故事',table:'一起喝茶','shop-cloud-table':'一起喝茶','floor-pot':'给小苗浇水','shop-clover-planter':'给小苗浇水',sofa:'坐下来','ottoman-a':'坐一会儿','ottoman-b':'坐一会儿',lamp:'开关台灯','shop-star-lamp':'看看星光','shop-rocket-toy':'启动火箭'};
export function createFurnitureHints({root,api}){
 const doc=root.ownerDocument,win=doc.defaultView,abort=new win.AbortController(),options={signal:abort.signal},canvas=root.querySelector('canvas[data-room-control="room"]');
 const layer=doc.createElement('div');layer.className='room-interaction-hints';layer.setAttribute('aria-label','房间里的互动提示');root.append(layer);
 const toggle=doc.createElement('button');toggle.type='button';toggle.textContent='发现家具互动';toggle.setAttribute('aria-pressed','false');root.querySelector('.room-mobile-more')?.append(toggle);
 let shown=false,pointer=null,signature='';const buttons=new Map();
 function update(){
  const blocked=doc.hidden||root.querySelector('.studio-panel:not([hidden]),.studio-guide:not([hidden]),.room-shop[data-open="true"],.room-mobile-more:not([hidden]),.companion-panel:not([hidden]),.estate-panel:not([hidden]),.room-profile:not([hidden])');
  let rows=blocked?[]:api.getFurnitureHintTargets?.()||[];
  if(!shown)rows=pointer?rows.filter(p=>Math.hypot(p.x-pointer.x,p.y-pointer.y)<115).sort((a,b)=>Math.hypot(a.x-pointer.x,a.y-pointer.y)-Math.hypot(b.x-pointer.x,b.y-pointer.y)).slice(0,1):[];
  else rows=rows.sort((a,b)=>(a.id==='shop-reading-shelf'?-1:0)-(b.id==='shop-reading-shelf'?-1:0)).slice(0,4);
  const placed=[];rows=rows.filter(p=>{if(placed.some(q=>Math.abs(q.x-p.x)<115&&Math.abs(q.y-p.y)<45))return false;placed.push(p);return true;});
  const next=rows.map(p=>p.id).join('|');if(next!==signature){signature=next;layer.replaceChildren();buttons.clear();for(const row of rows){const b=doc.createElement('button');b.type='button';b.textContent=LABELS[row.id]||'一起玩';b.dataset.hintFurniture=row.id;b.addEventListener('click',()=>{pointer=null;api.interactFurniture(row.id);update();});layer.append(b);buttons.set(row.id,b);}}
  for(const row of rows){const b=buttons.get(row.id);b.style.left=Math.min(Math.max(row.x,64),root.clientWidth-64)+'px';b.style.top=row.y+'px';}
 }
 toggle.addEventListener('click',()=>{shown=!shown;toggle.setAttribute('aria-pressed',String(shown));toggle.textContent=shown?'收起家具提示':'发现家具互动';root.querySelector('.room-mobile-more').hidden=true;root.querySelector('[data-room-action="more"]')?.setAttribute('aria-expanded','false');update();},options);
 canvas?.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||e.buttons)return;const box=canvas.getBoundingClientRect();pointer={x:e.clientX-box.left,y:e.clientY-box.top};update();},options);
 canvas?.addEventListener('pointerleave',e=>{if(layer.contains(e.relatedTarget))return;pointer=null;update();},options);
 layer.addEventListener('pointerleave',e=>{if(e.relatedTarget===canvas)return;pointer=null;update();},options);const timer=win.setInterval(update,250);
 return {dispose(){abort.abort();win.clearInterval(timer);layer.remove();toggle.remove();buttons.clear();}};
}
