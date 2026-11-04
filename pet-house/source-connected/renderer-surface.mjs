/** Keep one drawable surface visible; repeated layout notifications must not clear WebGL. */
export function createRendererSurface({canvas,renderer,render}){
  const originalVisibility=canvas.style.visibility;
  let size=null,poster=null,disposed=false;
  function resize(width,height,pixelRatio){
    if(disposed)return false;
    const next=[Math.max(1,Math.floor(width)),Math.max(1,Math.floor(height)),pixelRatio];
    if(size&&next.every((value,index)=>value===size[index]))return false;
    renderer.setDrawingBufferSize(...next);size=next;return true;
  }
  function capture(){
    if(disposed)return false;
    let candidate=poster;
    try{
      render();
      if(!candidate){candidate=canvas.ownerDocument.createElement('canvas');candidate.dataset.roomControl='room-poster';candidate.className='room-poster';candidate.setAttribute('aria-hidden','true');candidate.hidden=true;}
      const context=candidate.getContext('2d');if(!context)throw new Error('静态画布不可用');
      if(candidate.width!==canvas.width)candidate.width=canvas.width;
      if(candidate.height!==canvas.height)candidate.height=canvas.height;
      // Copy in the same task, before hiding WebGL. No asynchronous image decode or empty frame.
      context.drawImage(canvas,0,0,candidate.width,candidate.height);
      if(!poster){canvas.insertAdjacentElement('afterend',candidate);poster=candidate;}
      poster.hidden=false;canvas.style.visibility='hidden';return true;
    }catch{
      if(poster)poster.hidden=true;
      canvas.style.visibility=originalVisibility;return false;
    }
  }
  function resume(){
    if(disposed)return;
    render();canvas.style.visibility=originalVisibility;if(poster)poster.hidden=true;
  }
  return {resize,capture,resume,dispose(){if(disposed)return;disposed=true;poster?.remove();poster=null;canvas.style.visibility=originalVisibility;}};
}
