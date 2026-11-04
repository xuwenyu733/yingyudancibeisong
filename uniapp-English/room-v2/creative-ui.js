import {createFurnitureDrawingEditor} from './drawing-editor.js';
export function createCreativePanel({root,api}){
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};let disposed=false,opened=false,signature='',returnFocus=null;
  const el=(tag,text,parent)=>{const n=doc.createElement(tag);if(tag==='button')n.type='button';if(text!==null)n.textContent=text;parent?.append(n);return n;};
  const dock=el('div',null,root);dock.className='creative-dock';const trigger=el('button','🎨 涂鸦墙',dock);trigger.setAttribute('aria-expanded','false');
  const panel=el('section',null,root);panel.className='creative-panel';panel.hidden=true;panel.setAttribute('aria-label','涂鸦墙');panel.setAttribute('role','dialog');
  const header=el('header',null,panel);el('h2','给小屋画一幅画',header);const close=el('button','关闭',header);
  const drawingRoot=el('div',null,panel),editor=createFurnitureDrawingEditor({root:drawingRoot,onSave:(_id,drawing)=>api.saveWallDrawing(drawing),onDirtyChange:dirty=>{root.dataset.roomWallDrawingDirty=String(dirty);}});
  drawingRoot.querySelector('h4').textContent='在小屋的涂鸦墙画一幅画';drawingRoot.querySelector('.companion-help').textContent='用手指画画，保存后作品会挂到后墙上；每层楼保留自己的作品。';
  function refresh(){if(disposed||!opened)return;const c=api.getCompanion?.().companion;if(!c)return;const next=JSON.stringify(c.wallDrawing);if(signature===next)return;signature=next;editor.setTarget('wall','涂鸦墙',c.wallDrawing);}
  function toggle(value){opened=value;panel.hidden=!value;trigger.setAttribute('aria-expanded',String(value));if(value){returnFocus=doc.activeElement;signature='';refresh();close.focus();}else returnFocus?.focus?.();}
  trigger.addEventListener('click',()=>toggle(!opened),listen);close.addEventListener('click',()=>toggle(false),listen);panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();toggle(false);}},listen);
  return {update(state){trigger.disabled=!state?.ready;if(opened)refresh();},dispose(){disposed=true;events.abort();editor.dispose();dock.remove();panel.remove();delete root.dataset.roomWallDrawingDirty;}};
}
