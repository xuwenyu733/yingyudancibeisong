import {createRequestId} from './request-id.mjs';
import {createStoryBook,createTeaSet} from './cozy-props.mjs';
import {createShopFurniture} from './inventory-models.mjs';
import {createWallHanging,createFloorFinish} from './surface-models.mjs';
import {createFurnitureCollider,collidersOverlap,isColliderWithinBounds} from './colliders.mjs';
import {artById} from './studio-art.mjs';
import {furnitureActivityKind} from './furniture-activity.mjs';

/** Preview meshes never enter the layout registry or the wallet. Only confirm uses the existing transaction. */
export function createStudioScene({THREE,scene,camera,canvas,uiRoot,solidMaterial,furniture,getManager,getSize,getCatalog,getState,getShop,prepare,purchase,notify,say,schedule,reducedMotion=false,onInteract=null}){
 const win=canvas.ownerDocument.defaultView,abort=new win.AbortController(),listen={signal:abort.signal,capture:true};
 let trial=null,disposed=false,busy=false,drag=null,themeId='',ornaments=null,interaction=null,elapsed=0,beginSerial=0;
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),point=new THREE.Vector3();
 function release(root){if(!root)return;root.removeFromParent();const geometries=new Set(),materials=new Set();root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.userData.studioMaterial)for(const m of [].concat(n.material||[]))materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
 function localMaterial(color){return new THREE.MeshToonMaterial({color,transparent:true,opacity:.8,depthWrite:false});}
 function markOwned(root){root.traverse(n=>{if(n.isMesh){n.userData.studioMaterial=true;n.layers.enable(1);n.renderOrder=6;}});}
 function publish(){if(disposed)return;notify('furniture-trial',getTrial()||{active:false});schedule();}
 function getTrial(){return trial?{active:true,mode:trial.mode,sku:trial.product.sku,name:trial.product.name,price:trial.product.price,owned:!!getShop().owned?.includes(trial.product.sku),category:trial.product.category||'furniture',valid:trial.valid,message:trial.message,busy,placement:{...trial.placement}}:null;}
 function validate(){
  if(!trial)return false;
  const {width,depth}=getSize(),m=getManager();
  trial.valid=true;trial.message=trial.mode==='craft'?'仅预览，不扣积分和材料':'位置合适，确认后才会兑换';
  if(trial.product.category!=='flooring'){
   trial.root.updateMatrixWorld(true);const c=createFurnitureCollider({id:'trial',boxes:trial.definition.boxes,matrixWorld:trial.root.matrixWorld});m.refresh();
   if(!isColliderWithinBounds(c,{minX:-width/2+.12,maxX:width/2-.12,minZ:-depth/2+.12,maxZ:depth/2-.12})){trial.valid=false;trial.message='超出房间边界，往里挪一挪';}
   if(trial.valid)for(const [id,other]of m.colliders){if(m.definitions[id]?.blocksPlacement!==false&&collidersOverlap(c,other)){trial.valid=false;trial.message='这里放不下，换个位置试试';break;}}
  }
  trial.root.traverse(n=>{if(n.material){for(const material of [].concat(n.material))material.opacity=trial.valid?.82:.38;}});
  publish();return trial.valid;
 }
 async function begin(sku,options={}){
  if(disposed||busy)return {ok:false,message:'请等当前操作完成'};
  const product=getCatalog().find(x=>x.sku===sku);if(!product)return {ok:false,message:'没有找到这件家具'};
  if(furniture.has('shop-'+sku))return {ok:false,message:'这件家具已在房间里，进入装修即可调整'};
  const serial=++beginSerial;if(!await prepare())return {ok:false,message:'请先完成当前装修'};
  if(disposed||serial!==beginSerial)return {ok:false,message:'这次试摆已结束'};
  cancel('replaced');clearInteraction();const size=getSize();let item;
  try{item=product.category==='flooring'?{root:createFloorFinish(sku,size.width,size.depth,localMaterial)}:product.category==='wall'?createWallHanging(sku,localMaterial):createShopFurniture(sku,localMaterial);}catch(error){return {ok:false,message:error.message};}
  markOwned(item.root);item.root.userData.studioPreview=true;scene.add(item.root);
  trial={product,mode:options?.mode==='craft'?'craft':'shop',...item,placement:{x:0,z:1.5,y:3.5,rotation:0,wallSide:'back'},valid:true,message:''};
  if(product.category==='flooring')item.root.position.y+=.025;
  else if(product.category==='wall'){trial.placement.z=-size.depth/2+.22;move({});}
  else{move({});if(!trial.valid){outer:for(let z=-size.depth/2+1;z<size.depth/2-.5;z+=.7)for(let x=-size.width/2+1;x<size.width/2-.5;x+=.7){trial.placement.x=x;trial.placement.z=z;move({},false);if(trial.valid)break outer;}}}
  uiRoot?.setAttribute('data-room-trial','true');validate();notify('studio-step',{step:'trial'});return {ok:true};
 }
 function move(patch={},emit=true){
  if(!trial||busy)return false;
  for(const key of ['x','z','y','rotation'])if(key in patch&&!Number.isFinite(patch[key]))return false;
  if('wallSide'in patch&&!['back','left'].includes(patch.wallSide))return false;
  Object.assign(trial.placement,patch);const p=trial.placement,{width,depth}=getSize();
  if(trial.product.category==='wall'){trial.root.position.set(p.wallSide==='left'?-width/2+.22:p.x,p.y,p.wallSide==='left'?p.z:-depth/2+.22);trial.root.rotation.y=p.wallSide==='left'?Math.PI/2:0;}
  else if(trial.product.category!=='flooring'){trial.root.position.set(p.x,0,p.z);trial.root.rotation.y=p.rotation;}
  validate();return true;
 }
 async function confirm(){
  if(disposed||!trial||busy)return {ok:false,message:'请先选一件试摆家具'};
  if(trial.mode==='craft'){cancel('return');return {ok:true,preview:true};}
  if(!validate())return {ok:false,message:trial.message};
  const current=trial;busy=true;publish();let result;
  try{result=await purchase(current.product.sku,'trial-'+createRequestId(win.crypto),current.placement);}
  catch(error){result={ok:false,message:error.message};}
  finally{busy=false;}
  if(disposed)return result;
  if(result?.ok){cancel('purchased');say('已经安顿好啦！');notify('studio-step',{step:'arrange'});}else{current.message=result?.message||'没有成功，请重试';publish();}return result;
 }
 function cancel(reason='cancelled'){if(busy||disposed)return false;++beginSerial;const old=trial;if(trial){release(trial.root);trial=null;}drag=null;uiRoot?.removeAttribute('data-room-trial');publish();if(old)notify('furniture-trial-end',{mode:old.mode,sku:old.product.sku,reason});return true;}
 function locate(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const p=trial.placement,{width,depth}=getSize(),wall=trial.product.category==='wall',left=p.wallSide==='left';const plane=wall?new THREE.Plane(new THREE.Vector3(left?1:0,0,left?0:1),(left?width:depth)/2-.22):new THREE.Plane(new THREE.Vector3(0,1,0),0);if(ray.ray.intersectPlane(plane,point))move({x:Math.round(point.x*10)/10,z:Math.round(point.z*10)/10,...wall?{y:Math.max(.5,Math.min(4.8,point.y))}:{}});}
 canvas.addEventListener('pointerdown',e=>{if(!trial||busy||e.button>0)return;e.stopImmediatePropagation();e.preventDefault();drag=e.pointerId;canvas.setPointerCapture?.(drag);locate(e);},listen);
 canvas.addEventListener('pointermove',e=>{if(trial&&drag===e.pointerId){e.stopImmediatePropagation();locate(e);}},listen);
 canvas.addEventListener('pointerup',e=>{if(!trial)return;e.stopImmediatePropagation();if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);drag=null;},listen);
 canvas.addEventListener('pointercancel',()=>{drag=null;},listen);
 function mesh(geometry,color,x,y,z){const m=new THREE.Mesh(geometry,new THREE.MeshToonMaterial({color}));m.position.set(x,y,z);m.userData.studioMaterial=true;m.layers.enable(1);return m;}
 function sync(){
  const art=artById(getState().roomArt),size=getSize(),signature=art.id+':'+size.width+':'+size.depth;if(themeId===signature)return;themeId=signature;release(ornaments);ornaments=new THREE.Group();ornaments.userData.studioDecor=true;scene.add(ornaments);
  if(uiRoot){uiRoot.dataset.roomArt=art.id;uiRoot.style.setProperty('--studio-ink',art.ink);uiRoot.style.setProperty('--studio-paper',art.background);}
  // Small framed reliefs form a coordinated collection; they are cosmetic and never affect saved furniture dimensions.
  if(art.id!=='original'){const {depth}=getSize();for(let i=0;i<3;i++){
   const x=-2.5+i*.7,y=4.35;
   ornaments.add(mesh(new THREE.BoxGeometry(.55,.65,.055),art.colors[1],x,y,-depth/2+.26));
   ornaments.add(mesh(new THREE.BoxGeometry(.45,.55,.07),art.colors[0],x,y,-depth/2+.28));
   if(art.id==='space'){const star=new THREE.Shape();for(let p=0;p<10;p++){const a=p*Math.PI/5-Math.PI/2,r=p%2?.07:.16;p?star.lineTo(Math.cos(a)*r,Math.sin(a)*r):star.moveTo(Math.cos(a)*r,Math.sin(a)*r);}star.closePath();ornaments.add(mesh(new THREE.ShapeGeometry(star),art.colors[2],x,y,-depth/2+.33));}
   else if(art.id==='forest'){const leaf=mesh(new THREE.SphereGeometry(.13,10,6),art.colors[1],x,y,-depth/2+.34);leaf.scale.set(.6,1.5,.13);leaf.rotation.z=.4;ornaments.add(leaf);}
   else{const shell=mesh(new THREE.SphereGeometry(.15,12,6),art.colors[2],x,y,-depth/2+.34);shell.scale.set(1,.75,.15);ornaments.add(shell);}
  }}schedule();
 }
 function clearInteraction(){if(!interaction)return;if(interaction.prop)interaction.prop.dispose();else release(interaction.root);interaction=null;}
 function interact(id,choice=null){
  if(disposed||trial||getManager()?.editing||!furniture.has(id))return false;
  const activity=furnitureActivityKind(id),kind=activity==='read'?'book':activity;if(!kind)return false;
  clearInteraction();const target=furniture.get(id),box=new THREE.Box3().setFromObject(target),center=box.getCenter(new THREE.Vector3()),prop=kind==='book'?createStoryBook({color:choice?.color}):kind==='tea'?createTeaSet(choice?.recipe):null,group=prop?.root||new THREE.Group();scene.add(group);group.position.set(center.x,box.max.y+.04,center.z);group.userData.studioInteraction=true;
  if(kind==='book'){group.scale.setScalar(Math.max(.65,Math.min(1.1,box.max.x-box.min.x)));say(choice?.pages?.[0]||'书页翻开啦，看看这本小小森林故事。');}
  if(kind==='tea'){group.scale.setScalar(Math.max(.6,Math.min(1.15,(box.max.x-box.min.x)*.7)));say(choice?.line||'茶香轻轻升起，翻两页喜欢的小故事吧。');}
  if(kind==='light'){group.position.y=box.max.y-.25;const glow=mesh(new THREE.SphereGeometry(.27,16,10),'#ffdda0',0,0,0);glow.material.transparent=true;glow.material.opacity=.25;glow.material.depthWrite=false;group.add(glow);for(let i=0;i<5;i++)group.add(mesh(new THREE.SphereGeometry(.025,8,6),'#ffe9bd',Math.cos(i*1.26)*.30,Math.sin(i*1.26)*.30,.06));say('星星亮起柔和的光，陪小屋安静一会儿。');}
  if(kind==='rocket'){group.position.y=box.min.y+.18;for(let i=0;i<5;i++){const puff=mesh(new THREE.SphereGeometry(.055,8,6),i%2?'#edc263':'#f9e4bd',(i-2)*.05,-i*.04,.08);group.add(puff);}say('三、二、一！小火箭的探索引擎启动啦。');}
  interaction={root:group,prop,time:0,kind,id,target,choice,page:0};prop?.animate(0,reducedMotion);notify('studio-step',{step:'interact'});schedule();return true;
 }
 function pick(cast){const hit=cast.intersectObjects([...furniture.values()].filter(r=>r.name!=='room-shell'),true)[0];if(!hit)return false;let root=hit.object;while(root&&!furniture.has(root.name))root=root.parent;if(!root||!furnitureActivityKind(root.name))return false;return onInteract?onInteract(root.name):interact(root.name);}
 function frame(dt){
  if(disposed||!Number.isFinite(dt)||dt<0)return;elapsed+=dt;if(!interaction)return;
  if(getManager()?.editing||furniture.get(interaction.id)!==interaction.target||!interaction.target.parent){clearInteraction();return;}
  interaction.time+=dt;const page=Math.min(2,Math.floor(interaction.time/2));if(interaction.choice?.pages&&page!==interaction.page){interaction.page=page;say(interaction.choice.pages[page]);}if(interaction.time>6.5){clearInteraction();return;}interaction.prop?.animate(interaction.time,reducedMotion);
  if(!reducedMotion&&interaction.kind==='light')interaction.root.children[0].scale.setScalar(1+Math.sin(interaction.time*1.4)*.06);
  if(!reducedMotion&&interaction.kind==='rocket')interaction.root.children.forEach((p,i)=>{const phase=(interaction.time*1.2+i*.18)%1;p.position.y=-phase*.36;p.scale.setScalar(1-phase*.7);});
 }
 return {begin,move,confirm,cancel,getTrial,sync,interact,pick,frame,clearInteraction,get active(){return !!interaction;},dispose(){disposed=true;++beginSerial;abort.abort();release(trial?.root);release(ornaments);clearInteraction();trial=ornaments=null;uiRoot?.removeAttribute('data-room-trial');}};
}
