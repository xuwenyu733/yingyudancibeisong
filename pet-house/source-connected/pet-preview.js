import * as THREE from './vendor/three/three.module.js';
import {createPetCharacter} from './characters/pet-models.js';

/** A separate, disposable preview. It never reads or writes the account. */
export function createPetPreview(container){
 const doc=container.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
 const root=doc.createElement('section');root.className='pet-live-preview';root.hidden=true;container.prepend(root);
 const canvas=doc.createElement('canvas');canvas.setAttribute('aria-label','宠物3D预览，左右拖动旋转');root.append(canvas);
 const hint='左右拖动看看它 · 预览不消耗积分';
 const label=doc.createElement('p');label.textContent=hint;label.setAttribute('role','status');root.append(label);
 const bar=doc.createElement('div');bar.className='pet-settings-actions';root.append(bar);
 let renderer=null,pet=null,frame=0,previous=0,disposed=false,drag=null,mode='idle',walkPhase=0,intersecting=true,contextLost=false;
 let lastWidth=0,lastHeight=0,lastRatio=0;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,20);scene.background=new THREE.Color('#f6f0e4');camera.position.set(1.25,.95,1.95);camera.lookAt(0,.55,0);
 scene.add(new THREE.HemisphereLight(0xffffff,0xbfb39a,1.4));const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(2,4,3);scene.add(sun);
 function stop(){win.cancelAnimationFrame(frame);frame=0;previous=0;}
 function visible(){const r=canvas.getBoundingClientRect();return intersecting&&r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<win.innerHeight&&r.left<win.innerWidth;}
 function runnable(){return !disposed&&!root.hidden&&!doc.hidden&&!contextLost&&renderer&&pet&&visible();}
 function start(){if(!frame&&runnable())frame=win.requestAnimationFrame(tick);}
 function tick(time){
  frame=0;if(!runnable()){previous=0;return;}
  // The preview is secondary to the room. Limit GPU draws to 30 fps.
  if(previous&&time-previous<1000/30){start();return;}
  const dt=Math.min(.05,previous?(time-previous)/1000:0);previous=time;walkPhase+=dt*8;
  const r=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height)),ratio=Math.min(win.devicePixelRatio||1,1.5);
  // Three floors buffer dimensions: rounding cssSize * 1.5 would resize on
  // every frame for odd CSS widths. Cache the actual layout dimensions.
  if(w!==lastWidth||h!==lastHeight||ratio!==lastRatio){
   if(ratio!==renderer.getPixelRatio())renderer.setPixelRatio(ratio);
   renderer.setSize(w,h,false);lastWidth=w;lastHeight=h;lastRatio=ratio;
   camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  pet.pose.setLocomotion?.({speed:mode==='walk'?1:0,weight:mode==='walk'?1:0,phase:walkPhase});pet.pose.update(dt);renderer.render(scene,camera);start();
 }
 function releaseDrag(){if(drag&&canvas.hasPointerCapture?.(drag.id))canvas.releasePointerCapture(drag.id);drag=null;}
 function updateControls(){for(const button of bar.children)button.disabled=!pet||contextLost;}
 for(const [text,action]of [['向左转',()=>{pet.model.rotation.y-=Math.PI/4;}],['向右转',()=>{pet.model.rotation.y+=Math.PI/4;}],['走一走',()=>{mode='walk';pet.pose.stand();}],['坐下来',()=>{mode='idle';pet.pose.sit();}],['打招呼',()=>{mode='idle';pet.pose.stand();pet.pose.setCelebrate?.(1);}]]){
  const b=doc.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',()=>{if(!pet||contextLost||disposed)return;action();start();},listen);bar.append(b);
 }
 canvas.addEventListener('pointerdown',e=>{if(!pet||contextLost||e.button!==0||e.isPrimary===false||drag)return;drag={id:e.pointerId,x:e.clientX};canvas.setPointerCapture(e.pointerId);},listen);
 canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId&&pet){pet.model.rotation.y+=(e.clientX-drag.x)*.014;drag.x=e.clientX;start();}},listen);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId===drag?.id)releaseDrag();},listen);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;stop();releaseDrag();updateControls();label.textContent='3D预览正在恢复，房间和积分不受影响。';},listen);
 canvas.addEventListener('webglcontextrestored',()=>{if(disposed)return;contextLost=false;lastWidth=lastHeight=lastRatio=0;updateControls();label.textContent=hint;start();},listen);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();else start();},listen);
 const resizeObserver=typeof win.ResizeObserver==='function'?new win.ResizeObserver(()=>{if(visible())start();else stop();}):null;resizeObserver?.observe(canvas);
 const intersectionObserver=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{intersecting=entries.at(-1)?.isIntersecting===true;if(intersecting)start();else stop();}):null;intersectionObserver?.observe(canvas);
 // Capture the shop's nested scroller too; older WebViews may lack observers.
 doc.addEventListener('scroll',()=>{if(visible())start();else stop();},{...listen,capture:true,passive:true});win.addEventListener('resize',start,listen);
 function clear(){stop();releaseDrag();pet?.dispose();pet=null;mode='idle';walkPhase=0;updateControls();}
 return {
  show(sku){if(disposed)return;clear();root.hidden=false;try{
   renderer??=new THREE.WebGLRenderer({canvas,antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;
   pet=createPetCharacter(sku);pet.model.rotation.y=-.25;scene.add(pet.model);updateControls();label.textContent=contextLost?'3D预览正在恢复，房间和积分不受影响。':hint;start();
  }catch{clear();label.textContent='当前设备暂不支持3D预览，可以查看上方宠物图片。';}},
  hide(){clear();root.hidden=true;},
  dispose(){if(disposed)return;disposed=true;clear();events.abort();resizeObserver?.disconnect();intersectionObserver?.disconnect();renderer?.dispose();renderer?.forceContextLoss();root.remove();}
 };
}
