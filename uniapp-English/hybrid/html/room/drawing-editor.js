import {createDrawingHistory,drawFurnitureDrawing,validateFurnitureDrawing,DRAWING_LIMITS} from './drawing.mjs';

/** A furniture-specific draft remains here until saved or explicitly discarded. */
export function createFurnitureDrawingEditor({root,onSave,onDirtyChange}={}){
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
  const el=(tag,cls,text,parent=root)=>{const node=doc.createElement(tag);if(tag==='button')node.type='button';if(cls)node.className=cls;if(text!==undefined)node.textContent=text;parent.append(node);return node;};
  const section=el('section','companion-drawing');section.setAttribute('aria-label','自由手绘小画室');
  el('h4','','给这件家具画一张小作品',section);el('p','companion-help','用手指或画笔自由画；透明的地方会露出家具本来的样子。保存后才会贴到家具上。',section);
  const toolbar=el('div','companion-drawing-tools',undefined,section),brush=el('button','','画笔',toolbar),eraser=el('button','','橡皮',toolbar);
  const colorLabel=el('label','','颜色',toolbar),color=el('input','',undefined,colorLabel);color.type='color';color.value='#e38eaa';color.setAttribute('aria-label','画笔颜色');
  const sizeLabel=el('label','','粗细',toolbar),size=el('input','',undefined,sizeLabel);size.type='range';size.min='2';size.max='48';size.step='1';size.value='10';size.setAttribute('aria-label','画笔粗细');
  const canvas=el('canvas','companion-drawing-paper',undefined,section);canvas.width=512;canvas.height=320;canvas.tabIndex=0;canvas.setAttribute('aria-label','家具手绘画纸');canvas.setAttribute('role','img');
  const actions=el('div','companion-drawing-actions',undefined,section),undo=el('button','','撤销一笔',actions),redo=el('button','','重做一笔',actions),clear=el('button','','清空画纸',actions),discard=el('button','','放弃未保存手绘',actions);
  const save=el('button','companion-primary','保存手绘作品',section),status=el('p','companion-drawing-status','选一件家具，画出自己的喜欢吧～',section);status.setAttribute('role','status');
  let ctx=null;try{ctx=canvas.getContext?.('2d')||null;}catch{}
  let history=createDrawingHistory(),baseline=JSON.stringify(history.value),target='',targetName='',tool='brush',active=null,saving=false,disposed=false,lastDirty=null;
  const say=text=>{status.textContent=text;},isDirty=()=>JSON.stringify(history.value)!==baseline;
  function publishDirty(){const next=!!active||isDirty();if(lastDirty===next)return;lastDirty=next;try{onDirtyChange?.(next);}catch{/* A host observer must not discard the draft. */}}
  function controls(){publishDirty();const locked=disposed||saving||!target||!ctx;for(const node of [brush,eraser,color,size,clear,save])node.disabled=locked;undo.disabled=locked||!history.canUndo;redo.disabled=locked||!history.canRedo;discard.disabled=locked||!isDirty();save.disabled=locked||!isDirty();brush.setAttribute('aria-pressed',String(tool==='brush'));eraser.setAttribute('aria-pressed',String(tool==='eraser'));canvas.setAttribute('aria-disabled',String(locked));}
  function render(){if(ctx)drawFurnitureDrawing(ctx,active?{version:1,strokes:[...history.value.strokes,active.stroke]}:history.value,canvas.width,canvas.height);controls();}
  function endCapture(){if(!active)return;try{canvas.releasePointerCapture?.(active.id);}catch{}active=null;}
  function point(event){const rect=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width))),Math.max(0,Math.min(1,(event.clientY-rect.top)/Math.max(1,rect.height)))].map(n=>Math.round(n*10000)/10000);}
  canvas.addEventListener('pointerdown',event=>{
    if(disposed||saving||!target||!ctx||active||event.button>0)return;
    event.preventDefault();if(history.value.strokes.length>=DRAWING_LIMITS.strokes){say('这张画已经有64笔啦，可以撤销一笔再画～');return;}
    const count=history.value.strokes.reduce((n,s)=>n+s.points.length,0);if(count>=DRAWING_LIMITS.points){say('画纸的线条已经满啦，可以撤销几笔再画～');return;}
    active={id:event.pointerId,count,stroke:{tool,color:color.value,size:Math.round(Math.max(.002,Math.min(.16,Number(size.value)/320))*10000)/10000,points:[point(event)]}};
    try{canvas.setPointerCapture?.(event.pointerId);}catch{}render();
  },listen);
  canvas.addEventListener('pointermove',event=>{
    if(!active||active.id!==event.pointerId)return;event.preventDefault();const stroke=active.stroke,eventsToDraw=event.getCoalescedEvents?.()||[event];
    for(const sample of eventsToDraw){if(active.count+stroke.points.length>=DRAWING_LIMITS.points)break;const next=point(sample),last=stroke.points.at(-1);if(Math.hypot(next[0]-last[0],next[1]-last[1])>=.002)stroke.points.push(next);}render();
  },listen);
  function finish(event){if(!active||event.pointerId!==active.id)return;event.preventDefault();const stroke=active.stroke;endCapture();try{history.push(stroke);say(`「${targetName}」有新的小作品，记得保存呀～`);}catch(error){say(error.message);}render();}
  canvas.addEventListener('pointerup',finish,listen);canvas.addEventListener('pointercancel',event=>{if(active?.id===event.pointerId){endCapture();say('这一笔先收回，前面的作品还在～');render();}},listen);
  canvas.addEventListener('lostpointercapture',event=>{if(active?.id===event.pointerId){active=null;render();}},listen);
  for(const [button,next]of [[brush,'brush'],[eraser,'eraser']])button.addEventListener('click',()=>{tool=next;controls();},listen);
  undo.addEventListener('click',()=>{if(saving)return;endCapture();history.undo();say('撤销好啦，也可以重做～');render();},listen);redo.addEventListener('click',()=>{if(saving)return;endCapture();history.redo();say('这一笔回来啦～');render();},listen);
  clear.addEventListener('click',()=>{if(saving)return;endCapture();history.clear();say('画纸清空了，按撤销还能找回来～');render();},listen);
  discard.addEventListener('click',()=>{if(saving)return;endCapture();history=createDrawingHistory(JSON.parse(baseline));say('回到上一次保存的手绘啦，可以换家具了～');render();},listen);
  async function saveDraft(){
    if(disposed||saving||active||!target||!isDirty())return false;
    const id=target,drawing=history.value;saving=true;controls();say('正在把小作品贴上家具…');
    try{const result=await onSave?.(id,drawing);if(disposed)return false;if(result?.ok===false||result===false||result==null){say(result?.message||'这次没有存好，草稿还在，再试一次吧～');return false;}baseline=JSON.stringify(drawing);say('作品保存好啦！关上手册就能看到～');return true;}
    catch{if(!disposed)say('刚才没有存好，草稿还在，再试一次吧～');return false;}
    finally{saving=false;if(!disposed)controls();}
  }
  save.addEventListener('click',saveDraft,listen);
  canvas.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||!['z','Z','y','Y'].includes(event.key))return;event.preventDefault();if(saving)return;endCapture();if(event.key.toLowerCase()==='y'||event.shiftKey)history.redo();else history.undo();render();},listen);
  render();if(!ctx)say('这个浏览器暂时不能打开画纸，换色和贴纸仍可使用。');
  return {get dirty(){return !!active||isDirty();},get targetId(){return target;},save:saveDraft,
    setTarget(id,name,drawing){
      if(disposed)return false;
      if(id!==target&&(saving||active||isDirty())){say(saving?'小作品正在保存，请稍等一下～':'先保存手绘，或点“放弃未保存手绘”，再换另一件家具吧～');return false;}
      if(id===target&&(saving||active||isDirty()))return true;
      const changedTarget=id!==target,next=validateFurnitureDrawing(drawing)||{version:1,strokes:[]},nextBaseline=JSON.stringify(next);target=id||'';targetName=name||'家具';
      if(changedTarget||nextBaseline!==baseline){history=createDrawingHistory(next);baseline=nextBaseline;}
      if(ctx)say(target?`正在为「${targetName}」创作，画好后记得保存～`:'先选一件家具吧～');render();return true;
    },
    dispose(){if(disposed)return;disposed=true;events.abort();endCapture();try{onDirtyChange?.(false);}catch{}lastDirty=false;section.remove();},
  };
}
