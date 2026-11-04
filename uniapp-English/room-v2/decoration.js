import * as THREE from './vendor/three/three.module.js';
import {WALL_PAINTS} from './surface-catalog.mjs';
import {activeElementFor,elementAtPointFor} from './dom.mjs';
import {createEditHistory,cloneForHistory} from './edit-history.mjs';
import {stripPreviewSource,stripFilterMatch} from './strip-thumb.mjs';
import {createTouchHold} from './touch-hold.mjs';
import {createTransformGesture,gestureTransform} from './gesture-helper.mjs';
import {FURNITURE} from './layout.js';

/** 装修控制器：输入/UI/可视化独立于业务状态；所有摆放都经layout-manager事务提交。
 * onStoreItem(id)：把选中的商店家具收回仓库（由宿主房间 API 完成；返回结果对象）。
 * onUnstoreItem(sku)：把仓库中的一件家具摆回房间（由宿主房间 API 完成；返回结果对象）。
 * getStorage()：返回已拥有家具 [{id/sku, name, furnitureId?, stored?, ...}]；兼容仅含仓库的旧宿主。
 * onUnstoreItem(key, {x,z}?)：第二参数为拖入落点，宿主须先校验位置再提交仓库事务。
 */
export function createDecoration({canvas,scene,camera,furniture,manager,prepare,onEvent=()=>{},uiRoot,persistLayout=true,onStoreItem=null,onUnstoreItem=null,getStorage=null,getRoomSize=()=>({width:8.8,depth:8.2}),getAppearance=()=>null,onWallColor=null,onFlooring=null,onCollectAll=null,onResetLayout=null}) {
  const doc=canvas.ownerDocument,win=doc.defaultView;
  const abort=new win.AbortController(),options={signal:abort.signal};
  if(!uiRoot?.querySelector)throw new TypeError('装修UI需要独立的uiRoot');
  const $=id=>uiRoot.querySelector(`[data-room-control="${id}"]`);
  const required=['decorate','decoration-panel','edit-feedback','selected-name','rotate-furniture','collider-settings','snap-grid','finish-decoration','cancel-decoration','box-blocks-navigation','box-blocks-placement',...['size','center'].flatMap(kind=>['x','y','z'].map(axis=>`box-${kind}-${axis}`))];
  if(required.some(name=>!$(name)))throw new TypeError('装修UI缺少必要控件，请提供完整uiRoot或省略它使用无UI模式');
  const entry=$('decorate'),panel=$('decoration-panel'),feedback=$('edit-feedback');
  const canvasLabel=canvas.getAttribute('aria-label');
  const name=$('selected-name'),rotate=$('rotate-furniture'),settings=$('collider-settings');
  const storeBtn=$('store-furniture'); // v2.8 仓库：老宿主没有此控件时可空，功能自动禁用。
  const storageStrip=$('storage-strip'),storageRow=$('storage-strip-row'); // v2.8.2 装修仓库条：缺省时隐藏。
  const togglePanel=$('toggle-decoration-panel'),panelBody=$('decoration-panel-body');
  const storagePrev=$('storage-prev'),storageNext=$('storage-next');
  const undoBtn=$('undo-decoration'),redoBtn=$('redo-decoration');
  const organizer=$('decoration-organizer'),collectAll=$('collect-all-furniture'),resetLayout=$('reset-room-layout'),organizerConfirm=$('organizer-confirm');
  let organizerAction=null;
  const filterButtons=[...uiRoot.querySelectorAll('[data-room-control="strip-filter"]')];
  let stripFilter='all';
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.09);
  const history=createEditHistory({cap:40});
  const hitPoint=new THREE.Vector3(),scale=new THREE.Vector3();
  let active=false,pending=false,selected=null,drag=null,session=null,invalid=false,feedbackTimer=0,generation=0,cancelPending=null,disposed=false,trading=false;
  const stripCards=new Map();let storageMeta=new Map(); // v2.8.2 装修仓库条卡片缓存
  let dockDrag=null,ghost=null,ignoreClickKey=null,collapsed=false,gestureSession=null;
  const touchHold=createTouchHold({setTimer:(fn,delay)=>win.setTimeout(fn,delay),clearTimer:id=>win.clearTimeout(id),onHold:pointerId=>{
    if(!drag||drag.pointerId!==pointerId||drag.moved||disposed||trading||!active)return;
    drag=null;if(canvas.hasPointerCapture?.(pointerId))canvas.releasePointerCapture(pointerId);
    rotateSelected();
  }});
  const gestures=createTransformGesture({
    onStart(){
      if(disposed||trading||!active||dockDrag||!selected||manager.definitions[selected]?.draggable===false)return false;
      const root=furniture.get(selected);if(!root)return false;
      const before=drag?.before||manager.snapshot();if(drag)manager.restore(before);touchHold.cancel();drag=null;
      const configured=root.userData.defaultScale,baseScale=Array.isArray(configured)&&configured.length===3&&configured.every(n=>Number.isFinite(n)&&n>0)?configured.slice():Array(3).fill(FURNITURE[selected]?.scale||1);
      gestureSession={id:selected,before,initial:{rotation:root.rotation.toArray().slice(0,3),scale:root.scale.toArray()},baseScale,wall:!!root.userData.wallHanging,changed:false,rejected:false};
      fillInspector();canvas.style.cursor='grabbing';say(root.userData.wallHanging?'双指捏合调整挂件大小，松手确认～':'双指转一转、捏一捏，松手就安顿好～');return true;
    },
    onUpdate(delta){
      if(!gestureSession)return;const patch=gestureTransform(gestureSession.initial,delta,{rotate:!gestureSession.wall,baseScale:gestureSession.baseScale});
      gestureSession.changed=!!patch&&((!gestureSession.wall&&Math.abs(delta.rotation)>.005)||patch.scale.some((n,i)=>Math.abs(n-gestureSession.initial.scale[i])>.00001));
      gestureSession.rejected=!patch||!manager.previewTransform(gestureSession.id,patch);const check=manager.validate({checkPath:false});invalid=gestureSession.rejected||!check.valid;updatePlacementState();
      say(invalid?check.reason||'这里有点挤，松手会回原位':'松手确认旋转和大小',invalid);
    },
    onEnd(){
      const current=gestureSession;gestureSession=null;if(!current)return;
      const valid=!current.changed||(!current.rejected&&manager.commit(current.before));if(!valid)manager.restore(current.before);
      if(valid&&current.changed){history.push(cloneForHistory(current.before));const root=furniture.get(current.id);onEvent('furniture-transformed',{id:current.id,source:'gesture',rotation:root.rotation.toArray().slice(0,3),scale:root.scale.toArray()});if(!current.wall&&Math.abs(root.rotation.y-current.initial.rotation[1])>.005)onEvent('furniture-rotated',{id:current.id,source:'gesture'});}
      invalid=false;fillInspector();canvas.style.cursor='default';say(valid?'安顿好啦，这是你选的角度和大小～':'这里有点挤，宝贝回原位啦～',!valid);
    },
    onCancel(){const current=gestureSession;gestureSession=null;if(!current)return;manager.restore(current.before);invalid=false;fillInspector();canvas.style.cursor='default';say('先回到双指操作前的样子～');},
  });
  function cancelGestures(){const ids=gestures.pointerIds;gestures.cancel();for(const id of ids)if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
  const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
  function say(text,bad=false) {
    if(disposed)return;
    feedback.hidden=false;feedback.textContent=text;feedback.style.color=bad?'#a85545':'#755d41';
    win.clearTimeout(feedbackTimer);if(!pending)feedbackTimer=win.setTimeout(()=>{if(!disposed)feedback.hidden=true;},bad?5500:3600);
  }
  function ground(event) {
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(plane,hitPoint);
  }
  function wallPoint(event){
    ground(event);const {width,depth}=getRoomSize(),hits=[];
    for(const [wallSide,normal,constant] of [['left',new THREE.Vector3(1,0,0),width/2-.22],['back',new THREE.Vector3(0,0,1),depth/2-.22]]){
      const p=ray.ray.intersectPlane(new THREE.Plane(normal,constant),new THREE.Vector3());
      if(p&&p.y>=.4&&p.y<=5.15&&p.x>=-width/2&&p.x<=width/2&&p.z>=-depth/2&&p.z<=depth/2)hits.push({x:p.x,y:p.y,z:p.z,wallSide,distance:ray.ray.origin.distanceTo(p)});
    }
    return hits.sort((a,b)=>a.distance-b.distance)[0]||null;
  }
  function wallPatch(point,offsetY=0){
    const {width,depth}=getRoomSize(),snap=$('snap-grid').checked,round=v=>snap?Math.round(v*10)/10:v,left=point.wallSide==='left';
    return {position:[left?-width/2+.22:round(point.x),round(point.y+offsetY),left?round(point.z):-depth/2+.22],rotation:[0,left?Math.PI/2:0,0]};
  }
  function pick(event) {
    if(!ground(event))return null;
    const roots=Object.entries(manager.definitions).filter(([id,d])=>d.draggable!==false&&furniture.has(id)).map(([id])=>furniture.get(id));
    // 合批/程序化几何的世界矩阵可能落后于当前帧（首帧、掉帧、离屏低帧率）；
    // 每次拾取前刷新，保证 raycast 命中最新位置与旋转（v2.8 修复花盆点不中）。
    for(const root of roots)root.updateMatrixWorld(true);
    const hit=ray.intersectObjects(roots,true)[0];if(!hit)return null;
    let root=hit.object;while(root&&!manager.definitions[root.userData.furnitureId])root=root.parent;
    return root?.userData.furnitureId||null;
  }
  function updatePlacementState() {
    // 碰撞仅做逻辑计算。按用户要求，选择/拖拽/普通状态均不绘制线框或网格。
    canvas.dataset.placementValid=String(!invalid);
  }
  // ---- v2.17/F2：撤销 / 重做（只记录变换型操作，集合变更会清空栈） ----
  function updateHistoryButtons() {
    if(!undoBtn&&!redoBtn)return;
    const blocked=!active||trading||Boolean(drag||gestureSession||dockDrag?.started);
    if(undoBtn)undoBtn.disabled=blocked||!history.canUndo;
    if(redoBtn)redoBtn.disabled=blocked||!history.canRedo;
  }
  function applyHistorySnapshot(snapshot) {
    if(!snapshot)return false;
    // layout-manager.restore 在快照解析失败时返回 false（不抛异常），
    // 必须检查返回值：否则撤销失败仍会提示“已撤销上一步”，状态却未恢复。
    let ok=false;try{ok=manager.restore(cloneForHistory(snapshot));}catch{ok=false;}
    if(!ok){history.clear();fillInspector();updateHistoryButtons();say('这一步暂时无法恢复，已清空撤销记录',true);return false;}
    invalid=false;manager.refresh();fillInspector();updateHistoryButtons();return true;
  }
  function undoStep() {
    if(disposed||!active||trading||drag||gestureSession||dockDrag?.started)return;
    const snapshot=history.undo(manager.snapshot());
    if(applyHistorySnapshot(snapshot))say('已撤销上一步');
  }
  function redoStep() {
    if(disposed||!active||trading||drag||gestureSession||dockDrag?.started)return;
    const snapshot=history.redo(manager.snapshot());
    if(applyHistorySnapshot(snapshot))say('已重做');
  }
  function clearHistory() {history.clear();updateHistoryButtons();}
  function fillInspector() {
    if(disposed)return;
    const d=manager.definitions[selected],root=furniture.get(selected);
    name.textContent=d?d.label||selected:'点一件家具，陪我一起布置吧～';rotate.disabled=!d||d.draggable===false||trading||Boolean(drag||gestureSession||dockDrag?.started);
    rotate.textContent=root?.userData.wallHanging?(Math.abs(root.rotation.y-Math.PI/2)<.1?'换到后墙':'换到左墙'):'旋转90°';
    $('finish-decoration').disabled=trading;$('cancel-decoration').disabled=trading;
    if(collectAll)collectAll.disabled=trading||!active||typeof onCollectAll!=='function';if(resetLayout)resetLayout.disabled=trading||!active||typeof onResetLayout!=='function';
    if($('organizer-confirm-yes'))$('organizer-confirm-yes').disabled=trading;
    if($('organizer-confirm-cancel'))$('organizer-confirm-cancel').disabled=trading;
    if(storeBtn){ // 任何可编辑家具都可收回仓库（房间结构件不在定义中、无法选中）。
      storeBtn.hidden=!d;storeBtn.disabled=!d||Boolean(drag||gestureSession)||trading;
    }
    const enabled=Boolean(d&&root)&&!trading,box=d?.boxes[0];
    if(root)root.getWorldScale(scale);
    for(const kind of ['size','center'])for(const [i,axis] of ['x','y','z'].entries()) {
      const input=$(`box-${kind}-${axis}`);input.disabled=!enabled;
      input.value=enabled?+(box[kind][i]*Math.abs(scale[axis])).toFixed(3):'';
    }
    for(const [id,key] of [['box-blocks-navigation','blocksNavigation'],['box-blocks-placement','blocksPlacement']]) {
      $(id).disabled=!enabled;$(id).checked=Boolean(d?.[key]);
    }
    updatePlacementState();
    for(const [key,card] of stripCards)card.setAttribute('aria-pressed',String(Boolean(selected&&itemId(key)===selected)));
    const appearance=getAppearance();for(const button of $('wall-colors')?.querySelectorAll('button')||[]){button.disabled=trading;button.setAttribute('aria-pressed',String(button.dataset.wallColor===appearance?.wallColor));}
    if($('custom-wall-color'))$('custom-wall-color').disabled=trading;
    if($('reset-flooring'))$('reset-flooring').disabled=trading||!appearance?.flooring;
    updateHistoryButtons();
  }
  function select(id) {const changed=id!==selected;selected=id;invalid=false;fillInspector();if(changed)onEvent('furniture-selected',{id});}
  function setCollapsed(value) {
    if(!togglePanel||!panelBody)return;
    collapsed=Boolean(value);panel.dataset.collapsed=String(collapsed);panelBody.hidden=collapsed;
    togglePanel.setAttribute('aria-expanded',String(!collapsed));togglePanel.textContent=collapsed?'展开设置':'收起设置';
    togglePanel.setAttribute('aria-label',collapsed?'展开装修设置':'收起装修设置');
  }
  function itemId(key) {return storageMeta.get(key)?.furnitureId||(furniture.has(key)?key:`shop-${key}`);}
  async function enter() {
    if(disposed||active||pending||trading)return false;
    const token=++generation;
    pending=true;entry.disabled=true;entry.textContent='等待伙伴站稳…';
    say('伙伴站稳后进入装修模式');onEvent('decoration-pending');
    const canceled=new Promise(resolve=>{cancelPending=resolve;});
    let waitTimer=0,timedOut=false,ready;
    const timeout=new Promise(resolve=>{waitTimer=win.setTimeout(()=>{timedOut=true;resolve(false);},8000);});
    try{ready=await Promise.race([prepare(),canceled,timeout]);}catch{ready=false;}finally{win.clearTimeout(waitTimer);}
    if(token!==generation)return false;pending=false;cancelPending=null;
    if(!ready){entry.disabled=false;entry.textContent='装修';if(timedOut)say('伙伴暂时没有就位，请重试装修',true);else feedback.hidden=true;return false;}
    try{session=manager.snapshot();if(manager.beginEdit&&manager.beginEdit()===false)throw new Error('装修会话暂时不可用');}
    catch{session=null;entry.disabled=false;entry.textContent='装修';say('暂时无法进入装修，请稍后重试',true);return false;}
    active=true;entry.hidden=true;panel.hidden=false;uiRoot.dataset.roomDecorating='true';setCollapsed(collapsed);
    canvas.setAttribute('aria-label','装修中的房间。拖动家具调整位置；底部家具栏可点击选中或向上拖入。R旋转，Esc取消当前拖动或装修。');
    refreshStorageStrip(); // v2.8.2 进入装修即显示底部「我的仓库」卡片条
    say('底部左右浏览家具；点击选中或自动摆放，向上拖入可指定位置');fillInspector();onEvent('decoration-mode',{active:true});return true;
  }
  function cancelDrag(message='已取消这次拖动') {
    touchHold.cancel();
    if(!drag)return;
    const before=drag.before,id=drag.pointerId;drag=null;
    manager.restore(before);invalid=false;
    if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
    fillInspector();say(message);canvas.style.cursor='default';
  }
  function finishDrag(cancel=false) {
    touchHold.cancel();
    if(!drag)return;
    if(cancel){cancelDrag();return;}
    const current=drag;drag=null;
    if(canvas.hasPointerCapture?.(current.pointerId))canvas.releasePointerCapture(current.pointerId);
    const valid=!current.moved||manager.commit(current.before);
    if(valid&&current.moved)history.push(cloneForHistory(current.before));
    if(valid&&current.moved)onEvent('furniture-landed',{id:current.id,source:'drag'});
    invalid=false;fillInspector();canvas.style.cursor='default';
    say(valid?(current.moved?'咚！安顿好啦，还可以拖一拖、转一转～':'选中啦！拖动换位置，长按转一圈～'):'这里有点挤，宝贝先回原来的位置啦',!valid);
  }
  function exit(save=true) {
    if(disposed)return false;
    if(trading){say('家具正在处理中，请稍候再完成装修');return false;}
    if(pending){generation++;pending=false;cancelPending?.(false);cancelPending=null;entry.disabled=false;entry.textContent='装修';feedback.hidden=true;return true;}
    if(!active)return false;
    cancelGestures();
    cancelDockDrag(false);
    if(drag)finishDrag(false);
    if(manager.finishEdit){if(!manager.finishEdit({save,persist:persistLayout})){say('布局暂时无法保存，请稍后重试',true);return false;}}
    else if(save) {
      const result=manager.validate();if(!result.valid){say(result.reason||'布局暂不可用',true);return false;}
      if(persistLayout&&!manager.persist()){say('本机存储暂不可用，摆放仍保留在当前页面，请稍后重试',true);return false;}
    } else manager.restore(session);
    active=false;selected=null;invalid=false;session=null;panel.hidden=true;organizerAction=null;if(organizerConfirm)organizerConfirm.hidden=true;
    // v2.17/F2：退出装修即清空撤销/重做栈，避免下一次会话撤销到上一次的残留快照
    //（上次会话可能已保存/取消，或两次会话之间集合已变化，残留快照会造成误撤销）。
    history.clear();updateHistoryButtons();
    if(storageStrip)storageStrip.hidden=true;delete uiRoot.dataset.roomDecorating;
    if(canvasLabel===null)canvas.removeAttribute('aria-label');else canvas.setAttribute('aria-label',canvasLabel);
    entry.hidden=false;entry.disabled=false;entry.textContent='装修';
    say(save?(persistLayout?'布局已保存到本机':'布局已应用'):'已取消本次装修');onEvent('decoration-mode',{active:false,saved:save});return true;
  }
  function pointerDown(e) {
    if(!disposed&&!trading&&active&&!dockDrag&&e.pointerType==='touch'&&gestures.down(e)){touchHold.cancel();canvas.setPointerCapture?.(e.pointerId);e.preventDefault();return;}
    if(drag){touchHold.cancel();return;}
    if(disposed||trading||!active||dockDrag||e.button!==0)return;
    canvas.focus({preventScroll:true});const id=pick(e);if(!id){select(null);return;}
    select(id);const root=furniture.get(id),wall=root.userData.wallHanging,point=wall?wallPoint(e):ground(e);if(!point)return;
    drag={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:root.position.x-point.x,offsetZ:root.position.z-point.z,offsetY:wall?root.position.y-point.y:0,before:manager.snapshot(),moved:false};
    touchHold.begin(e);
    canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
  }
  function pointerMove(e) {
    if(gestures.move(e)){touchHold.cancel();e.preventDefault();return;}
    touchHold.move(e);
    if(disposed||trading||!active||dockDrag)return;
    if(!drag){canvas.style.cursor=pick(e)?'grab':'default';return;}
    if(e.pointerId!==drag.pointerId)return;
    const wall=furniture.get(drag.id)?.userData.wallHanging,point=wall?wallPoint(e):ground(e);if(!point)return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;
    touchHold.cancel();drag.moved=true;const root=furniture.get(drag.id),snap=$('snap-grid').checked;
    let x=hitPoint.x+drag.offsetX,z=hitPoint.z+drag.offsetZ;
    if(snap){x=Math.round(x*10)/10;z=Math.round(z*10)/10;}
    manager.previewTransform(drag.id,wall?wallPatch(point,drag.offsetY):{position:[x,root.position.y,z]});
    const check=manager.validate({checkPath:false});invalid=!check.valid;updatePlacementState();canvas.style.cursor='grabbing';
    say(check.valid?'松手确认摆放':check.reason||'位置不可用，松手会回退',!check.valid);
  }
  function rotateSelected() {
    if(disposed||trading||!active||!selected||drag||gestureSession||dockDrag)return;
    const root=furniture.get(selected),before=manager.snapshot();
    if(root.userData.wallHanging){const {width,depth}=getRoomSize(),left=Math.abs(root.rotation.y-Math.PI/2)<.1;manager.previewTransform(selected,wallPatch({x:left?root.position.z:root.position.x,y:root.position.y,z:left?root.position.z:root.position.x,wallSide:left?'back':'left'}));}
    else manager.previewTransform(selected,{rotation:[0,root.rotation.y+Math.PI/2,0]});
    const valid=manager.commit(before);if(valid)history.push(cloneForHistory(before));
    if(valid)onEvent('furniture-rotated',{id:selected});
    fillInspector();say(valid?'转好啦！这个角度也可爱～':'转身有点挤，先回到刚才的方向吧',!valid);
  }
  async function storeSelected() {
    if(disposed||trading||!active||!selected||drag||gestureSession||dockDrag||typeof onStoreItem!=='function')return;
    const id=selected,label=manager.definitions[id]?.label||id;
    const token=generation;trading=true;fillInspector();refreshStorageStrip();
    try{const result=await onStoreItem(id);if(disposed||token!==generation)return;
      if(result?.ok){select(null);clearHistory();say(`已把${label}收回仓库，可随时从仓库重新摆放`);}
      else say(result?.message||'暂时无法收回仓库，请稍后重试',true);
    }catch{if(!disposed&&token===generation)say('暂时无法收回仓库，请稍后重试',true);}
    finally{if(!disposed&&token===generation){trading=false;fillInspector();refreshStorageStrip();}}
  }
  async function placeFromStorage(key,placement=null) {
    if(disposed||trading||!active||drag||typeof onUnstoreItem!=='function')return;
    const meta=storageMeta.get(key),label=meta?.name||key;
    const token=generation;trading=true;fillInspector();refreshStorageStrip();
    try{const result=await onUnstoreItem(key,placement||undefined);if(disposed||token!==generation)return;
      if(result?.ok){clearHistory();const id=itemId(key);if(furniture.has(id))select(id);say(`已摆放${label}，可继续拖动或旋转`);}
      else say(result?.message||'暂时无法摆回房间，请稍后重试',true);
    }catch{if(!disposed&&token===generation)say('暂时无法摆回房间，请稍后重试',true);}
    finally{if(!disposed&&token===generation){trading=false;fillInspector();refreshStorageStrip();}}
  }
  function refreshStorageStrip() {
    if(disposed||!storageStrip||!storageRow)return;
    if(typeof getStorage!=='function'){storageStrip.hidden=true;return;}
    const list=getStorage()||[];
    storageMeta=new Map(list.map(item=>[item.sku||item.id,item]));
    storageStrip.hidden=!active;
    // v2.17/F1：筛选「全部/家具/挂件/仓库」，未摆放的条目归「仓库」，摆放在地的归「家具」，墙上的归「挂件」。
    let visible=0;
    for(const item of list){
      const key=item.sku||item.id;if(typeof key!=='string')continue;
      const placed=furniture.has(itemId(key));
      const wall=Boolean(item.category==='wall'||(item.furnitureId&&manager.definitions[item.furnitureId]?.wallHanging)||furniture.get(itemId(key))?.userData.wallHanging);
      const card=stripCards.get(key);
      if(card)card.hidden=!stripFilterMatch(stripFilter,{placed,wall});
      if(stripFilterMatch(stripFilter,{placed,wall}))visible++;
    }
    const hasAny=list.length>0;
    storageRow.hidden=visible===0;
    if($('storage-empty')){$('storage-empty').hidden=visible>0;$('storage-empty').textContent=hasAny?'这一格空空的～换个标签，找找我的小家具吧。':'这里空空的，给宝贝挑一件家具吧～';}
    if($('storage-count'))$('storage-count').textContent=stripFilter==='all'?`${list.length} 件`:`${visible} 件`;
    const known=new Set(storageMeta.keys());
    for(const [key,node] of stripCards)if(!known.has(key)){node.remove();stripCards.delete(key);}
    for(const item of list){
      const key=item.sku||item.id;if(typeof key!=='string')continue;
      let card=stripCards.get(key);
      if(!card){
        card=doc.createElement('button');card.type='button';card.className='storage-strip__card';card.dataset.stripSku=key;
        const art=doc.createElement('span');art.className='storage-strip__mark';art.textContent='🛋'; // 占位，见 setStripMark
        const cap=doc.createElement('span');cap.className='storage-strip__caption';
        const status=doc.createElement('span');status.className='storage-strip__status';card.append(art,cap,status);
        card.addEventListener('click',e=>{
          // A drag can last arbitrarily long. Suppress its generated mouse
          // click until a new pointer gesture; keyboard activation still works.
          if(ignoreClickKey===key){ignoreClickKey=null;if(e.detail>0)return;}
          if(disposed||!active||trading||drag||gestureSession||dockDrag)return;
          const id=itemId(key);if(furniture.has(id)){select(id);say(`已选中${storageMeta.get(key)?.name||key}，可直接拖动或旋转`);}
          else void placeFromStorage(key);
        },options);
        card.addEventListener('pointerdown',e=>startDockDrag(e,key,card),options);
        storageRow.append(card);stripCards.set(key,card);
      }
      const cap=card.querySelector('.storage-strip__caption');if(cap)cap.textContent=item.name||key;
      setStripMark(card,item);
      const placed=furniture.has(itemId(key));
      card.hidden=!stripFilterMatch(stripFilter,{placed,wall:Boolean(item.category==='wall'||(item.furnitureId&&manager.definitions[item.furnitureId]?.wallHanging)||furniture.get(itemId(key))?.userData.wallHanging)});
      card.dataset.placed=String(placed);card.disabled=trading;
      card.setAttribute('aria-pressed',String(Boolean(selected&&itemId(key)===selected)));
      card.querySelector('.storage-strip__status').textContent=placed?'房间中 · 选择':'仓库 · 可摆放';
      card.title=placed?`选择${item.name||key}，或拖动卡片调整位置`:`点击自动摆放${item.name||key}，或向上拖到房间内`;
      card.setAttribute('aria-label',`${item.name||key}，${placed?'已在房间，点击选中':'在仓库，点击摆放或向上拖入'}`);
    }
    updateScrollButtons();
  }
  function updateScrollButtons() {
    if(disposed||!storageRow)return;
    const max=Math.max(0,storageRow.scrollWidth-storageRow.clientWidth);
    if(storagePrev)storagePrev.disabled=storageRow.scrollLeft<=1;
    if(storageNext)storageNext.disabled=storageRow.scrollLeft>=max-1;
  }
  function scrollStorage(direction) {
    if(!storageRow)return;
    storageRow.scrollBy({left:direction*Math.max(88,storageRow.clientWidth*.8),behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    // Instant/reduced-motion scrolling reaches its destination synchronously;
    // its scroll event arrives later. Keep arrow state correct immediately.
    updateScrollButtons();
  }
  function overCanvas(e) {
    const r=canvas.getBoundingClientRect();
    return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&elementAtPointFor(canvas,e.clientX,e.clientY)===canvas;
  }
  function dropPoint(e,key=null) {
    if(!overCanvas(e)||!ground(e))return null;
    if(storageMeta.get(key)?.category==='wall'||furniture.get(itemId(key))?.userData.wallHanging){const wall=wallPoint(e);if(!wall)return null;const patch=wallPatch(wall);return {x:patch.position[0],y:patch.position[1],z:patch.position[2],wallSide:wall.wallSide};}
    const snap=$('snap-grid').checked;
    return {x:snap?Math.round(hitPoint.x*10)/10:hitPoint.x,z:snap?Math.round(hitPoint.z*10)/10:hitPoint.z};
  }
  function startDockDrag(e,key,card) {
    if(disposed||!active||trading||drag||gestureSession||dockDrag||e.button!==0||e.isPrimary===false)return;
    ignoreClickKey=null;
    const id=itemId(key);
    if(furniture.has(id)&&manager.definitions[id]?.draggable===false)return;
    dockDrag={key,id,card,pointerId:e.pointerId,pointerType:e.pointerType,startX:e.clientX,startY:e.clientY,started:false,before:null};
  }
  function moveDockDrag(e) {
    const current=dockDrag;if(!current||e.pointerId!==current.pointerId||disposed||!active)return;
    const dx=e.clientX-current.startX,dy=e.clientY-current.startY;
    if(!current.started){
      if(current.pointerType==='touch'){
        if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){dockDrag=null;return;}
        if(dy>=-10||Math.abs(dy)<Math.abs(dx)*1.15)return;
      }else if(Math.hypot(dx,dy)<7)return;
      current.started=true;current.before=furniture.has(current.id)?manager.snapshot():null;
      current.card.setPointerCapture?.(e.pointerId);
      ignoreClickKey=current.key;
      if(furniture.has(current.id))select(current.id);
      ghost=doc.createElement('div');ghost.className='storage-strip__ghost';ghost.setAttribute('aria-hidden','true');uiRoot.append(ghost);fillInspector();
    }
    e.preventDefault();
    const point=dropPoint(e,current.key),r=uiRoot.getBoundingClientRect();
    let valid=Boolean(point);
    if(point&&current.before){
      const root=furniture.get(current.id);
      valid=manager.previewTransform(current.id,root.userData.wallHanging?wallPatch(point):{position:[point.x,root.position.y,point.z]})!==false&&manager.validate({checkPath:false}).valid;
      invalid=!valid;updatePlacementState();
    }
    ghost.style.left=`${Math.max(8,Math.min(r.width-120,e.clientX-r.left-56))}px`;
    ghost.style.top=`${Math.max(8,Math.min(r.height-54,e.clientY-r.top-54))}px`;
    ghost.dataset.valid=String(valid&&Boolean(current.before));ghost.textContent=`${storageMeta.get(current.key)?.name||current.key} · ${valid?(current.before?'松手摆放':'松手检查并摆放'):'移到房间空位'}`;
    canvas.style.cursor=valid?'grabbing':'not-allowed';
  }
  function clearDockDrag() {
    const current=dockDrag;dockDrag=null;ghost?.remove();ghost=null;canvas.style.cursor='default';
    if(current?.card.hasPointerCapture?.(current.pointerId))current.card.releasePointerCapture(current.pointerId);
    return current;
  }
  function cancelDockDrag(announce=true) {
    const current=clearDockDrag();
    if(current?.started){if(current.before)manager.restore(current.before);invalid=false;fillInspector();if(announce)say('已取消拖入，家具保持原样');}
  }
  function finishDockDrag(e) {
    if(!dockDrag||e.pointerId!==dockDrag.pointerId)return;
    const current=clearDockDrag();if(!current.started)return;
    ignoreClickKey=current.key;
    const point=dropPoint(e,current.key);
    if(!point){if(current.before)manager.restore(current.before);invalid=false;fillInspector();say('未放入房间，家具保持原样');return;}
    if(current.before){
      const root=furniture.get(current.id);
      const previewed=manager.previewTransform(current.id,root.userData.wallHanging?wallPatch(point):{position:[point.x,root.position.y,point.z]})!==false;
      const valid=previewed&&manager.commit(current.before);
      if(!previewed)manager.restore(current.before);
      if(valid)history.push(cloneForHistory(current.before));
      if(valid)onEvent('furniture-landed',{id:current.id,source:'dock-drag'});
      invalid=false;fillInspector();say(valid?'咚！小家具找到新家啦～':'这里有点挤，宝贝先回原来的位置啦',!valid);
    }else void placeFromStorage(current.key,point);
  }
  // 家具栏卡片标记（v2.17/F1）：优先展示商品真实缩略图，找不到时回退 Emoji。
  function setStripMark(card,item){
    const mark=card.querySelector('.storage-strip__mark');
    if(!mark)return;
    const source=stripPreviewSource(item);
    if(source.kind==='image'){
      // 缩略图加载失败后保持 Emoji 回退，不再每次刷新都重新尝试加载同一张坏图。
      if(mark.dataset.thumbFailed==='1')return;
      if(mark.dataset.src===source.src)return;
      mark.replaceChildren();mark.dataset.src=source.src;
      const img=doc.createElement('img');img.className='storage-strip__thumb';img.alt=source.alt||item.name||'';
      img.draggable=false;img.loading='lazy';img.decoding='async';
      img.src=new URL(source.src,import.meta.url).href;
      img.addEventListener('error',()=>{if(mark.dataset.src===source.src){mark.dataset.thumbFailed='1';mark.dataset.src='';mark.replaceChildren();mark.textContent='📦';}},{once:true});
      mark.append(img);
    }else{
      mark.dataset.thumbFailed='';mark.dataset.src='';mark.replaceChildren();mark.textContent=source.text;
    }
  }
  function editCollider() {
    if(disposed||trading||!active||!selected||drag||gestureSession||dockDrag)return;
    const root=furniture.get(selected);root.getWorldScale(scale);
    const before=manager.snapshot();
    const patch={};
    for(const kind of ['size','center'])patch[kind]=['x','y','z'].map(axis=>Number($(`box-${kind}-${axis}`).value)/Math.max(.0001,Math.abs(scale[axis])));
    patch.blocksNavigation=$('box-blocks-navigation').checked;patch.blocksPlacement=$('box-blocks-placement').checked;
    if(!finite3(patch.size)||!finite3(patch.center)||patch.size.some(v=>v<=0)) {say('请输入有效的正尺寸',true);fillInspector();return;}
    const valid=manager.updateCollider(selected,patch);if(valid)history.push(cloneForHistory(before));
    fillInspector();say(valid?'碰撞盒已更新，模型尺寸保持原样':'碰撞盒使布局不可用，已回退',!valid);
  }
  function requestOrganizer(action){
    if(disposed||trading||!active||drag||gestureSession||dockDrag)return;
    if(typeof (action==='collect'?onCollectAll:onResetLayout)!=='function'||!organizerConfirm)return;
    organizerAction=action;organizerConfirm.hidden=false;
    $('organizer-confirm-title').textContent=action==='collect'?'把这一层的家具全收好吗？':'让这一层恢复默认布置吗？';
    $('organizer-confirm-copy').textContent=action==='collect'?'家具会回到仓库，积分与收藏保留。需要时可以免费摆回。':'已摆放家具会回到默认位置，仓库、积分与收藏保留。';
    $('organizer-confirm-yes').textContent=action==='collect'?'确认全部收好':'确认恢复默认';
    $('organizer-confirm-yes').focus?.({preventScroll:true});
  }
  async function confirmOrganizer(){
    if(disposed||trading||!active||!organizerAction||drag||gestureSession||dockDrag)return false;
    const operation=organizerAction==='collect'?onCollectAll:onResetLayout;
    // Whole-room operations require a closed edit transaction. Persist first,
    // run the account operation atomically, then start a fresh undo baseline.
    if(!exit(true))return false;
    trading=true;entry.hidden=true;entry.disabled=true;panel.hidden=false;uiRoot.dataset.roomDecorating='true';fillInspector();
    say('正在整理这一层，请稍等一下～');let result;
    try{result=await operation();}
    catch{result={ok:false,message:'刚才没有整理好，原来的家具还在，请再试一次'};}
    finally{
      trading=false;
      if(!disposed){panel.hidden=true;entry.hidden=false;entry.disabled=false;delete uiRoot.dataset.roomDecorating;await enter();}
    }
    if(!disposed)say(result?.message||(result?.ok?'这一层整理好啦，可以继续装修～':'这次没有整理好，请再试一次'),!result?.ok);
    return result?.ok===true;
  }
  if(organizer)organizer.hidden=typeof onCollectAll!=='function'&&typeof onResetLayout!=='function';
  collectAll?.addEventListener('click',()=>requestOrganizer('collect'),options);resetLayout?.addEventListener('click',()=>requestOrganizer('reset'),options);
  $('organizer-confirm-yes')?.addEventListener('click',confirmOrganizer,options);
  $('organizer-confirm-cancel')?.addEventListener('click',()=>{organizerAction=null;organizerConfirm.hidden=true;say('好呀，先保留现在的布置～');},options);
  entry.disabled=false;entry.addEventListener('click',enter,options);
  async function changeFinish(operation){
    if(disposed||!active||trading||drag||gestureSession||dockDrag)return;trading=true;fillInspector();
    try{const result=await operation();if(!disposed)say(result?.ok?'配色已保存，收起地毯可查看完整地砖':result?.message||'配色暂未保存',!result?.ok);}catch{if(!disposed)say('配色暂未保存，请重试',true);}finally{if(!disposed){trading=false;fillInspector();}}
  }
  if($('wall-colors')&&typeof onWallColor==='function')for(const paint of WALL_PAINTS){const button=doc.createElement('button');button.type='button';button.dataset.wallColor=paint.id;button.style.background=`#${paint.color.toString(16).padStart(6,'0')}`;button.title=paint.name;button.setAttribute('aria-label',paint.name);button.addEventListener('click',()=>changeFinish(()=>onWallColor(paint.id)),options);$('wall-colors').append(button);}
  $('custom-wall-color')?.addEventListener('change',e=>{if(typeof onWallColor==='function')void changeFinish(()=>onWallColor(e.target.value));},options);
  $('reset-flooring')?.addEventListener('click',()=>{if(typeof onFlooring==='function')void changeFinish(()=>onFlooring(null));},options);
  togglePanel?.addEventListener('click',()=>setCollapsed(!collapsed),options);
  storagePrev?.addEventListener('click',()=>scrollStorage(-1),options);
  storageNext?.addEventListener('click',()=>scrollStorage(1),options);
  storageRow?.addEventListener('scroll',updateScrollButtons,options);
  storageRow?.addEventListener('wheel',e=>{
    if(Math.abs(e.deltaX)>=Math.abs(e.deltaY))return;
    const max=storageRow.scrollWidth-storageRow.clientWidth;
    if(max<=0||(e.deltaY<0&&storageRow.scrollLeft<=0)||(e.deltaY>0&&storageRow.scrollLeft>=max-1))return;
    e.preventDefault();storageRow.scrollLeft+=e.deltaY;
  },{...options,passive:false});
  const stripResize=storageRow&&win.ResizeObserver?new win.ResizeObserver(updateScrollButtons):null;
  if(stripResize)stripResize.observe(storageRow);
  win.addEventListener('resize',updateScrollButtons,options);
  $('finish-decoration').addEventListener('click',()=>exit(true),options);
  $('cancel-decoration').addEventListener('click',()=>exit(false),options);
  rotate.addEventListener('click',rotateSelected,options);
  undoBtn?.addEventListener('click',undoStep,options);
  redoBtn?.addEventListener('click',redoStep,options);
  for(const button of filterButtons)button.addEventListener('click',()=>{
    stripFilter=button.dataset.stripFilter||'all';
    for(const other of filterButtons)other.setAttribute('aria-pressed',String(other===button));
    refreshStorageStrip();
  },options);
  storeBtn?.addEventListener('click',storeSelected,options);
  for(const input of settings.querySelectorAll('input'))input.addEventListener('change',editCollider,options);
  canvas.addEventListener('pointerdown',pointerDown,options);canvas.addEventListener('pointermove',pointerMove,options);
  canvas.addEventListener('pointerup',e=>{if(gestures.up(e)){if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);return;}if(drag?.pointerId===e.pointerId)finishDrag();},options);
  canvas.addEventListener('pointercancel',e=>{gestures.up(e,true);cancelDrag();},options);
  canvas.addEventListener('lostpointercapture',e=>{if(gestures.owns(e.pointerId))cancelGestures();if(drag)cancelDrag();},options);
  win.addEventListener('pointermove',moveDockDrag,{...options,passive:false});
  win.addEventListener('pointerup',finishDockDrag,options);
  win.addEventListener('pointercancel',e=>{if(dockDrag?.pointerId===e.pointerId)cancelDockDrag();},options);
  storageRow?.addEventListener('lostpointercapture',e=>{if(dockDrag?.pointerId===e.pointerId)cancelDockDrag();},options);
  win.addEventListener('blur',()=>{cancelGestures();cancelDrag();cancelDockDrag();},options);
  win.addEventListener('keydown',e=>{
    const focused=activeElementFor(uiRoot);
    if(!(active||pending)||!(focused===canvas||uiRoot.contains(focused)))return;
    const typing=['INPUT','TEXTAREA','SELECT'].includes(focused?.tagName)||focused?.isContentEditable;
    if(e.code==='Escape'){e.preventDefault();if(gestureSession)cancelGestures();else if(dockDrag)cancelDockDrag();else if(drag)cancelDrag();else exit(false);}
    // v2.17/F2：Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 或 Ctrl/⌘+Y 重做（输入框内让浏览器处理）。
    if(active&&(e.code==='KeyZ'||e.code==='KeyY')&&(e.ctrlKey||e.metaKey)&&!e.altKey){
      if(typing)return;
      e.preventDefault();
      if(e.shiftKey||e.code==='KeyY')redoStep();else undoStep();
      return;
    }
    if(active&&e.code==='KeyR'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!typing){e.preventDefault();rotateSelected();}
  },options);
  return {
    get active(){return active;},get pending(){return pending;},get selected(){return selected;},get dragging(){return Boolean(drag||gestureSession||dockDrag?.started);},get busy(){return trading;},
    enter,exit,refresh:()=>{fillInspector();refreshStorageStrip();},
    dispose(){if(disposed)return;cancelGestures();cancelDockDrag(false);disposed=true;generation++;pending=false;trading=false;cancelPending?.(false);cancelPending=null;if(drag)cancelDrag();if(active&&manager.finishEdit)manager.finishEdit({save:false,persist:false});active=false;selected=null;session=null;history.clear();abort.abort();stripResize?.disconnect();win.clearTimeout(feedbackTimer);entry.disabled=true;entry.hidden=false;entry.textContent='装修';panel.hidden=true;if(storageStrip)storageStrip.hidden=true;feedback.hidden=true;canvas.style.cursor='';if(canvasLabel===null)canvas.removeAttribute('aria-label');else canvas.setAttribute('aria-label',canvasLabel);delete uiRoot.dataset.roomDecorating;delete canvas.dataset.placementValid;stripCards.clear();storageMeta.clear();},
  };
}
