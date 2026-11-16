import {buildGardenScenery} from './garden-scenery.js';
import {HOME_COLORS as HC,HOME_LIGHT} from './visual-style.mjs';
import {createDish} from './cozy-props.mjs';
import * as THREE from './vendor/three/three.module.js';
import {RoundedBoxGeometry} from './vendor/addons/geometries/RoundedBoxGeometry.js';
import {recipeNeeds} from './room-adventures.mjs';
import {LIFE_CATALOG as C,lifeItemName} from './life-catalog.mjs';

/** An optional 3D view of server-owned plots and recipes. No timers or drag gestures award inventory locally. */
export function createLifeStage({container,kind,data,perform,isBusy=()=>false,recentCook=null,selection={},navigate=()=>{}}){
 const doc=container.ownerDocument,win=doc.defaultView,abort=new win.AbortController(),listen={signal:abort.signal};let disposed=false,frame=0,renderer=null,observer=null,selected=Number.isInteger(selection.slot)&&selection.slot>=0&&selection.slot<3?selection.slot:0,recipe=C.recipes.find(x=>x.id===selection.recipe)||C.recipes[0],added={},mixed=false,drag=null,t=0,mixing=false,mixTimer=0,mixStarted=0,served=null,dragGhost=null,falling=[],pendingIngredient=null;
 let controlsEvents=new win.AbortController(),contextLost=false,resizeStage=()=>{},resumeDraw=()=>{};
 const reducedMotion=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;const cookedAvailable=recentCook&&data.state.inventory[recentCook]>0;const suggestedCrop=kind==='garden'&&C.crops.some(c=>c.id===selection.crop)?selection.crop:null;if(suggestedCrop){const matching=data.state.plots.findIndex(p=>p?.crop===suggestedCrop),empty=data.state.plots.findIndex(p=>!p);if(matching>=0||empty>=0)selected=selection.slot=matching>=0?matching:empty;delete selection.crop;}
 const node=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(tag==='button')n.type='button';if(cls)n.className=cls;parent?.append(n);return n;};
 const shell=node('section',null,container,'life-stage');shell.dataset.stage=kind;
 const heading=node('div',null,shell,'life-stage-heading');node('small',kind==='garden'?'MY LITTLE GARDEN':'LITTLE HOME KITCHEN',heading);node('h3',kind==='garden'?'我的阳光花园':'今天的小小料理家',heading);
 if(kind==='garden')node('p','种下一点期待，收获一份小快乐。',heading,'garden-heading-copy');
 const grid=node('div',null,shell,'life-stage-grid'),viewport=node('div',null,grid,'life-stage-viewport'),canvas=node('canvas',null,viewport);canvas.setAttribute('aria-label',kind==='garden'?'3D种植园，点击种植格，也可用旁边按钮操作':'3D厨房，拖动食材到碗中，也可用旁边按钮操作');canvas.tabIndex=0;
 const controls=node('div',null,grid,'life-stage-controls'),status=node('output','',shell,'life-stage-status');status.setAttribute('role','status');
 const scene=new THREE.Scene();scene.background=new THREE.Color(kind==='garden'?'#e7eee1':'#efe5d8');
 const camera=new THREE.PerspectiveCamera(35,1,.1,70);camera.position.set(7,8,10);camera.lookAt(0,.4,0);
 scene.add(new THREE.HemisphereLight(HOME_LIGHT.sky,HOME_LIGHT.ground,1.7));const sun=new THREE.DirectionalLight(HOME_LIGHT.key,2.1);sun.position.set(-3,7,5);scene.add(sun);const fill=new THREE.DirectionalLight(HOME_LIGHT.fill,.55);fill.position.set(5,3,-2);scene.add(fill);
 const props=new THREE.Group();scene.add(props);let targets=[],plants=[],drops=[],bowlContents=null,spoon=null,plate=null,gardenScenery=null;
 const materials=new Map();function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.8}));return materials.get(color);}
 function add(geometry,color,x,y,z,parent=props){const n=new THREE.Mesh(geometry,mat(color));n.position.set(x,y,z);parent.add(n);return n;}
 function box(w,h,d,color,x,y,z,parent=props){return add(new RoundedBoxGeometry(w,h,d,2,Math.min(.08,w/5,h/5,d/5)),color,x,y,z,parent);}
 function sphere(r,color,x,y,z,parent=props){return add(new THREE.SphereGeometry(r,12,8),color,x,y,z,parent);}
 function label(text,x,y,z){const c=doc.createElement('canvas');c.width=256;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,256,96);ctx.fillStyle='#465746';ctx.textAlign='center';ctx.font='bold 38px sans-serif';ctx.fillText(text,128,61);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(1.05,.39,1);sprite.position.set(x,y,z);props.add(sprite);return sprite;}
 function resetControls(){controlsEvents.abort();controlsEvents=new win.AbortController();controls.replaceChildren();}
 function button(text,fn,parent=controls){const b=node('button',text,parent);b.addEventListener('click',()=>{if(!isBusy())void fn();},controls.contains(b)?{signal:controlsEvents.signal}:listen);return b;}
 function removeGeometry(group){group.traverse(n=>n.geometry?.dispose());group.clear();}
 const receivedAt=Number.isFinite(data._receivedAt)?data._receivedAt:win.performance.now();
 function now(){return data.serverNow+win.performance.now()-receivedAt;}
 function growth(p){if(!p)return 0;const duration=C.crops.find(c=>c.id===p.crop)?.growMs||60000;return Math.max(.14,Math.min(1,1-(p.readyAt-now())/duration));}
 function cropModel(id,x,z,parent){const group=new THREE.Group();group.position.set(x,.48,z);parent.add(group);for(let i=0;i<3;i++){const leaf=sphere(.2,id==='mint'?'#74a48a':'#77a35b',Math.sin(i*2.1)*.13,.35,Math.cos(i*2.1)*.13,group);leaf.scale.set(.5,1.5,.8);leaf.rotation.z=(i-1)*.6;}if(id==='carrot'){add(new THREE.ConeGeometry(.18,.45,10),'#df984d',0,.05,0,group).rotation.x=Math.PI;}if(id==='berry')for(let i=0;i<3;i++)sphere(.13,'#ce787b',Math.sin(i*2.1)*.2,.23,Math.cos(i*2.1)*.2,group);return group;}
 function renderGardenControls(){
  resetControls();const row=node('div',null,controls,'life-stage-tabs');
  for(let i=0;i<3;i++){const b=button('种植格 '+(i+1),()=>{selected=selection.slot=i;renderGardenControls();},row);b.setAttribute('aria-pressed',String(i===selected));}
  const p=data.state.plots[selected];
  if(suggestedCrop)node('p','这份料理需要'+lifeItemName(suggestedCrop)+'，'+(p?.crop===suggestedCrop?'这里已经种着，成熟后就能收获。':!p?'可以在这块空地种下它。':'先收获成熟作物，空出一格再种。'),controls,'life-crop-goal');
  node('strong','第 '+(selected+1)+' 格 · '+(p?C.crops.find(c=>c.id===p.crop)?.name:'等待播种'),controls);
  if(!p){
   node('p','挑一包种子，开启这块花坛的小故事。',controls);
   const seeds=node('div',null,controls,'garden-seed-grid');
   for(const crop of C.crops){const count=data.state.seeds[crop.id]||0,b=button('',()=>perform({type:'plant',slot:selected,crop:crop.id}),seeds);b.className='garden-seed-card';b.dataset.crop=crop.id;b.setAttribute('aria-label',crop.emoji+' '+crop.name+' · 种子 '+count);node('span',crop.emoji,b,'garden-seed-art');node('b',crop.name,b);node('small','种子 '+count+' 包',b);b.dataset.unavailable=String(!count);b.disabled=!count;}
   node('small','离开后也会生长，成熟了不会枯萎。',controls,'garden-gentle-note');
  }else{
   const progress=node('div',null,controls,'garden-growth');progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','作物生长进度');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');node('span',null,progress);
   const timer=node('p','',controls);timer.dataset.stageTimer='true';
   const actions=node('div',null,controls,'garden-care-actions');
   const water=button(p.watered?'✓ 已经浇过水':'给小苗浇水',()=>perform({type:'water',slot:selected}),actions);water.dataset.unavailable=String(p.watered);water.disabled=p.watered;
   const harvest=button('收获成熟作物',()=>perform({type:'harvest',slot:selected}),actions);harvest.dataset.stageHarvest='true';
   node('small',p.watered?'这次可收获3份，慢慢等它长大就好。':'浇水后多收获一份，成熟后不会枯萎。',controls,'garden-gentle-note');
  }
  if(!p&&!C.crops.some(c=>data.state.seeds[c.id]>0))button('去材料铺买种子',()=>navigate('garden',{sub:'market'}));
  status.textContent='点花坛或上方编号切换 · 每一次照料都会保存';updateGarden();
 }
 function updateGarden(){
  const p=data.state.plots[selected],seconds=p?Math.max(0,Math.ceil((p.readyAt-now())/1000)):0;
  const timer=controls.querySelector('[data-stage-timer]'),text=seconds?'再等 '+(seconds>=60?Math.floor(seconds/60)+'分 ':'')+seconds%60+'秒，就可以收获啦':'成熟啦，把这份小收获装进口袋吧';
  if(timer&&timer.textContent!==text)timer.textContent=text;
  const progress=controls.querySelector('.garden-growth'),percent=p?Math.min(100,Math.round(growth(p)*100)):0;
  if(progress&&progress.getAttribute('aria-valuenow')!==String(percent)){progress.setAttribute('aria-valuenow',String(percent));progress.firstElementChild.style.width=percent+'%';}
  const h=controls.querySelector('[data-stage-harvest]');if(h){h.dataset.unavailable=String(seconds>0);h.disabled=seconds>0||isBusy();}
  for(let i=0;i<plants.length;i++){const plant=plants[i];if(plant){const g=growth(data.state.plots[i]);plant.scale.setScalar(.35+g*.65);plant.rotation.y=reducedMotion?0:Math.sin(t*.7+i)*.035;}targets[i].material=mat(i===selected?'#d8bd85':'#bd986d');}
 }
 function buildGarden(){
  gardenScenery=buildGardenScenery({THREE,props,box,sphere,add,label,mat,doc});
  for(let i=0;i<3;i++){
   const x=(i-1)*2.05,bed=box(1.8,.39,2.5,'#bd986d',x,.42,0);bed.userData.slot=i;targets.push(bed);
   box(1.57,.055,2.26,'#806147',x,.63,0);
   for(const side of [-1,1]){box(.13,.12,2.58,'#e4c695',x+side*.86,.64,0);box(1.86,.12,.13,'#e4c695',x,.64,side*1.22);}
   for(let row=0;row<4;row++)box(1.37,.022,.035,'#6c513c',x,.666,-.83+row*.55);
   for(let n=0;n<9;n++){const pebble=sphere(.025,n%2?'#b8956c':'#6d513c',x+Math.sin(n*2.4)*.6,.675,Math.cos(n*2.4)*.95);pebble.scale.y=.5;}
   label(String(i+1)+'号花坛',x,.48,1.39);
   const p=data.state.plots[i];let plant=null;
   if(p){plant=new THREE.Group();plant.position.set(x,.67,0);props.add(plant);for(const [dx,dz]of [[-.33,-.55],[.33,-.55],[-.33,.48],[.33,.48]]){const crop=cropModel(p.crop,dx,dz,plant);crop.position.y=0;}}
   plants.push(plant);
   if(p?.watered)for(let j=0;j<3;j++)drops.push(sphere(.035,'#a4ced1',x+(j-1)*.2,.69,.85));
  }
  renderGardenControls();
 }
 function allAdded(){return Object.entries(recipe.cost).every(([id,n])=>(added[id]||0)>=n);}
 function put(id){if(isBusy()||mixed||mixing)return;if(!(id in recipe.cost))return;const count=added[id]||0;if(count>=recipe.cost[id]){status.textContent='这份食材已经放够啦';return;}if(data.state.inventory[id]<recipe.cost[id]){status.textContent=lifeItemName(id)+'不够，先去种植园或材料铺补充';return;}added[id]=count+1;pendingIngredient=id;renderKitchenControls();renderBowl();}
 function resetPreparation(){win.clearTimeout(mixTimer);mixTimer=0;mixing=mixed=false;added={};falling=[];pendingIngredient=null;clearDrag();renderBowl();renderKitchenControls();}
 function renderBowl(){removeGeometry(bowlContents);falling=[];let n=0;for(const [id,count]of Object.entries(added))for(let i=0;i<count;i++){const piece=sphere(.095,({carrot:'#e9a15e',berry:'#cb7181',mint:'#7eae83',flour:'#f5ead4',water:'#9ac7d2'})[id],Math.sin(n*2.4)*.2,1.16,Math.cos(n++*2.4)*.2,bowlContents);piece.scale.y=.65;if(!reducedMotion&&id===pendingIngredient&&i===count-1){piece.userData.dropAt=t;falling.push(piece);}}pendingIngredient=null;if(mixed||mixing)add(new THREE.CylinderGeometry(.35,.35,.04,24),recipe.id==='juice'?'#d8949c':recipe.id==='tea'?'#aac2a0':'#e7c99d',0,1.17,0,bowlContents);}
 function stirRecipe(){if(!allAdded()||mixing||mixed)return;mixing=true;mixStarted=t;renderBowl();renderKitchenControls();status.textContent='轻轻搅拌，让食材混合在一起…';mixTimer=win.setTimeout(()=>{if(disposed)return;mixing=false;mixed=true;mixTimer=0;renderBowl();renderKitchenControls();status.textContent='混合好啦，确认后扣除食材并保存料理';},reducedMotion?0:750);}
 function renderKitchenControls(){resetControls();const picker=node('select',null,controls);picker.setAttribute('aria-label','选择料理');for(const r of C.recipes){const op=node('option',r.emoji+' '+r.name,picker);op.value=r.id;}picker.value=recipe.id;picker.disabled=mixing;picker.addEventListener('change',()=>{recipe=C.recipes.find(x=>x.id===picker.value);selection.recipe=recipe.id;resetPreparation();},{signal:controlsEvents.signal});
  const missing=recipeNeeds(recipe,data.state).filter(x=>x.missing);if(missing.length){node('p','还缺：'+missing.map(x=>lifeItemName(x.id)+' × '+x.missing).join('、'),controls,'life-missing');for(const item of missing){const crop=C.crops.find(c=>c.id===item.id);button(crop?'去种植'+crop.name:'去材料铺购买'+lifeItemName(item.id),()=>navigate('garden',{sub:crop?'plots':'market',crop:crop?.id}));}}
  node('p','① 放入食材 → ② 搅拌 → ③ 确认制作',controls);for(const [id,n]of Object.entries(recipe.cost)){const b=button(`${lifeItemName(id)} ${(added[id]||0)} / ${n} · 库存 ${data.state.inventory[id]}`,()=>put(id));b.dataset.ingredient=id;const blocked=mixed||mixing||(added[id]||0)>=n||data.state.inventory[id]<n;b.dataset.unavailable=String(blocked);b.disabled=blocked;}
  const stir=button(mixing?'正在轻轻搅拌…':mixed?'已经搅拌好啦':'搅拌食材',stirRecipe);stir.dataset.unavailable=String(!allAdded()||mixed||mixing);stir.disabled=!allAdded()||mixed||mixing;
  const finish=button('装盘并制作 · '+recipe.name,()=>{if(mixed)void perform({type:'cook',id:recipe.id});});finish.dataset.unavailable=String(!mixed);finish.disabled=!mixed;
  button('重新准备',resetPreparation);node('small','准备和搅拌不扣材料；只有确认制作成功才扣除。',controls);
  
  status.textContent=cookedAvailable?'刚刚做好 '+C.recipes.find(r=>r.id===recentCook)?.name+'，已放入食材包。':'可以拖食材到碗里，也可以点击食材按钮。';}
 function buildKitchen(){box(6.7,.25,4.1,'#c7b79c',0,.1,0);box(6.4,.8,3.8,'#b8c7b4',0,.6,0);box(6.7,.18,4,'#f5ecda',0,1.03,0);for(const x of [-2,0,2]){box(1.75,.6,.06,'#d5ddcb',x,.6,1.92);box(.5,.055,.08,'#9a8c70',x,.73,1.98);}box(6.7,1.8,.1,'#ede1c8',0,1.8,-1.9);for(let i=0;i<5;i++){box(.025,1.6,.025,'#fff8e9',i*1.3-2.6,1.8,-1.83);}add(new THREE.CylinderGeometry(.58,.35,.4,24),'#f5faf0',0,1.28,0);add(new THREE.CylinderGeometry(.49,.49,.035,24),'#d7d7bc',0,1.49,0);bowlContents=new THREE.Group();bowlContents.position.y=.34;props.add(bowlContents);
  spoon=box(.06,.8,.06,'#b98c5d',.3,1.65,.1);spoon.rotation.z=-.4;
  const ids=['carrot','berry','mint','flour','water'];for(let i=0;i<ids.length;i++){const x=(i-2)*1.15,id=ids[i],g=new THREE.Group();g.position.set(x,1.1,-1.1);g.userData.ingredient=id;props.add(g);add(new THREE.CylinderGeometry(.29,.23,.36,16),[HC.clay,HC.coral,HC.mint,HC.woodLight,HC.blue][i],0,.22,0,g);targets.push(g);if(id==='carrot'){const c=add(new THREE.ConeGeometry(.09,.25,12),HC.coral,0,.47,0,g);c.rotation.z=.5;for(let j=0;j<3;j++){const leaf=sphere(.055,HC.leaf,(j-1)*.04,.61,0,g);leaf.scale.set(.6,1.4,.6);}}else if(id==='berry'){for(let j=0;j<3;j++){sphere(.075,'#bc7782',(j-1)*.09,.45,j%2*.06,g);}}else if(id==='mint'){for(let j=0;j<3;j++){const leaf=sphere(.09,HC.leaf,(j-1)*.07,.45,0,g);leaf.scale.set(.5,.2,1);leaf.rotation.y=j*.6;}}else add(new THREE.CylinderGeometry(.20,.20,.012,20),id==='water'?'#8ebac8':'#fff5df',0,.409,0,g);label(lifeItemName(id),x,1.85,-1.1);}
  plate=add(new THREE.CylinderGeometry(.6,.54,.07,24),'#fcf8ee',1.9,1.17,.5);const rim=add(new THREE.TorusGeometry(.52,.012,6,24),'#d8bc91',1.9,1.21,.5);rim.rotation.x=Math.PI/2;if(cookedAvailable){served=createDish(recentCook,{plate:false});served.root.position.set(1.9,1.21,.5);served.root.scale.setScalar(1.25);props.add(served.root);}
  // A compact backsplash and warm kitchen details use only a handful of shared materials.
  box(1.1,.06,.38,'#b7946b',-2.2,2.42,-1.65);for(let i=0;i<3;i++){add(new THREE.CylinderGeometry(.10,.09,.24,12),['#c8d7bc','#e4c6a4','#d7a8a4'][i],-2.52+i*.30,2.57,-1.65);box(.14,.025,.14,'#b4926d',-2.52+i*.30,2.70,-1.65);}box(.65,.018,.48,'#dfbaa0',-2,1.132,.65);for(let i=0;i<5;i++)box(.005,.003,.45,'#f8edda',-2.25+i*.12,1.145,.65);
  box(1.7,.012,1.25,'#e5d6ba',0,1.135,.07);for(let j=0;j<5;j++)box(.008,.003,1.18,'#f7f0df',-.75+j*.375,1.144,.07);for(let i=0;i<5;i++)for(let j=0;j<2;j++){box(.32,.32,.018,i%2?HC.cream:HC.woodLight,-2.5+i*1.25,1.52+j*.56,-1.83);}
  renderKitchenControls();}
 if(kind==='garden')buildGarden();else buildKitchen();
 if(kind==='kitchen'&&cookedAvailable){const result=node('div',null,shell,'life-stage-result');shell.insertBefore(result,grid);const copy=node('div',null,result);node('strong',lifeItemName(recentCook)+'做好啦',copy);node('small','库存 '+data.state.inventory[recentCook]+' 份 · 已保存',copy);const actions=node('div',null,result);button('和伙伴分享料理',()=>navigate('pet'),actions);button('看看邻居订单',()=>navigate('kitchen',{sub:'orders'}),actions);}
 
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();function hit(e,objects){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);scene.updateMatrixWorld(true);return ray.intersectObjects(objects,true)[0];}
 function clearDrag(){if(dragGhost){dragGhost.geometry.dispose();dragGhost.removeFromParent();dragGhost=null;}drag=null;}
 function moveDrag(e){if(!dragGhost)return;hit(e,[]);const p=new THREE.Vector3();if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-1.6),p))dragGhost.position.copy(p);}
 canvas.addEventListener('pointerdown',e=>{if(isBusy()||contextLost)return;const h=hit(e,targets);if(!h)return;let target=h.object;while(target&&!targets.includes(target))target=target.parent;if(!target)return;e.preventDefault();if(kind==='garden'){selected=selection.slot=target.userData.slot;renderGardenControls();}else{if(mixed||mixing)return;clearDrag();drag={id:e.pointerId,ingredient:target.userData.ingredient};dragGhost=sphere(.12,({carrot:'#e9a15e',berry:'#cb7181',mint:'#7eae83',flour:'#f5ead4',water:'#9ac7d2'})[drag.ingredient],0,1.6,0);dragGhost.name='kitchen-drag-ingredient';moveDrag(e);canvas.setPointerCapture?.(e.pointerId);status.textContent='把 '+lifeItemName(drag.ingredient)+' 放到中间的碗里';}},listen);
 canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)moveDrag(e);},listen);
 canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const p=new THREE.Vector3();hit(e,[]);const landing=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-1.3),p);if(landing&&Math.hypot(p.x,p.z)<1)put(drag.ingredient);else status.textContent='放到中间的碗里试试，也可点击旁边的食材按钮';clearDrag();if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);},listen);
 canvas.addEventListener('pointercancel',clearDrag,listen);
 const fallback=node('p','',viewport,'life-stage-fallback');fallback.hidden=true;fallback.setAttribute('role','status');
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(disposed)return;contextLost=true;clearDrag();win.cancelAnimationFrame(frame);frame=0;canvas.hidden=true;fallback.hidden=false;fallback.textContent='3D预览暂时中断，仍可用下方或右侧按钮种植、做料理；恢复后会自动显示。';},listen);
 canvas.addEventListener('webglcontextrestored',()=>{queueMicrotask(()=>{if(disposed)return;contextLost=false;canvas.hidden=false;fallback.hidden=true;resizeStage();resumeDraw();});},listen);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden){win.cancelAnimationFrame(frame);frame=0;clearDrag();}else resumeDraw();},listen);
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const resize=()=>{if(disposed||contextLost)return;const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.zoom=1;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(props),p=new THREE.Vector3();let extent=.01;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){p.set(x,y,z).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}camera.zoom=Math.min(2.1,.85/extent);camera.updateProjectionMatrix();};resizeStage=resize;observer=new win.ResizeObserver(resize);observer.observe(viewport);resize();
  let previous=0;function draw(time){frame=0;if(disposed||contextLost||doc.hidden)return;frame=win.requestAnimationFrame(draw);if(time-previous<40)return;previous=time;t=time/1000;if(kind==='garden')updateGarden();if(spoon){spoon.position.set(mixing&&!reducedMotion?Math.sin((t-mixStarted)*9)*.20:.3,1.65,mixing&&!reducedMotion?Math.cos((t-mixStarted)*9)*.16:.1);spoon.rotation.z=mixing&&!reducedMotion?Math.sin(t*9)*.25:-.4;}for(const piece of falling){const progress=Math.min(1,Math.max(0,(t-piece.userData.dropAt)/.30));piece.position.y=1.16+(1-progress)*(1-progress)*.40;}served?.animate(t,reducedMotion);renderer.render(scene,camera);}resumeDraw=()=>{if(!disposed&&!contextLost&&!doc.hidden&&!frame)frame=win.requestAnimationFrame(draw);};resumeDraw();
 }catch{contextLost=true;canvas.hidden=true;fallback.hidden=false;fallback.textContent='当前设备暂不支持3D预览，可继续用下方或右侧按钮操作。';}
 const timer=win.setInterval(()=>{if(!disposed&&kind==='garden')updateGarden();},1000);
 return {dispose(){if(disposed)return;disposed=true;controlsEvents.abort();abort.abort();win.cancelAnimationFrame(frame);win.clearInterval(timer);win.clearTimeout(mixTimer);clearDrag();served?.dispose();gardenScenery?.dispose();served=null;observer?.disconnect();scene.traverse(n=>{n.geometry?.dispose();if(n.isSprite){n.material.map?.dispose();n.material.dispose();}});for(const m of materials.values())m.dispose();renderer?.dispose();renderer?.forceContextLoss();shell.remove();}};
}
