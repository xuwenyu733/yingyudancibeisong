import * as THREE from './vendor/three/three.module.js';

/** 装修控制器：输入/UI/可视化独立于业务状态；所有摆放都经layout-manager事务提交。 */
export function createDecoration({canvas,scene,camera,furniture,manager,prepare,onEvent=()=>{},uiRoot,persistLayout=true}) {
  const doc=canvas.ownerDocument,win=doc.defaultView;
  const abort=new win.AbortController(),options={signal:abort.signal};
  if(!uiRoot?.querySelector)throw new TypeError('装修UI需要独立的uiRoot');
  const $=id=>uiRoot.querySelector(`[data-room-control="${id}"]`);
  const required=['decorate','decoration-panel','edit-feedback','selected-name','rotate-furniture','collider-settings','snap-grid','finish-decoration','cancel-decoration','box-blocks-navigation','box-blocks-placement',...['size','center'].flatMap(kind=>['x','y','z'].map(axis=>`box-${kind}-${axis}`))];
  if(required.some(name=>!$(name)))throw new TypeError('装修UI缺少必要控件，请提供完整uiRoot或省略它使用无UI模式');
  const entry=$('decorate'),panel=$('decoration-panel'),feedback=$('edit-feedback');
  const name=$('selected-name'),rotate=$('rotate-furniture'),settings=$('collider-settings');
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.09);
  const hitPoint=new THREE.Vector3(),scale=new THREE.Vector3();
  let active=false,pending=false,selected=null,drag=null,session=null,invalid=false,feedbackTimer=0,generation=0,cancelPending=null;
  const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
  function say(text,bad=false) {
    feedback.hidden=false;feedback.textContent=text;feedback.style.color=bad?'#a85545':'#755d41';
    clearTimeout(feedbackTimer);if(!active&&!pending)feedbackTimer=setTimeout(()=>feedback.hidden=true,3200);
  }
  function ground(event) {
    const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(plane,hitPoint);
  }
  function pick(event) {
    ground(event);
    const roots=Object.entries(manager.definitions).filter(([id,d])=>d.draggable!==false&&furniture.has(id)).map(([id])=>furniture.get(id));
    const hit=ray.intersectObjects(roots,true)[0];if(!hit)return null;
    let root=hit.object;while(root&&!manager.definitions[root.userData.furnitureId])root=root.parent;
    return root?.userData.furnitureId||null;
  }
  function updatePlacementState() {
    // 碰撞仅做逻辑计算。按用户要求，选择/拖拽/普通状态均不绘制线框或网格。
    canvas.dataset.placementValid=String(!invalid);
  }
  function shopOwnedEntries() {
    return Object.entries(manager.definitions)
      .filter(([id,d])=>id.startsWith('shop-')&&d.draggable!==false&&furniture.has(id));
  }
  function renderOwnedList() {
    const list=$('owned-furniture');if(!list)return;
    list.replaceChildren();
    const owned=shopOwnedEntries();
    if(!owned.length){
      const empty=doc.createElement('p');empty.className='owned-furniture-empty';
      empty.textContent='还没有兑换家具。先点「完成保存」退出装修，去商店兑换后会自动放进房间，再回来这里点选摆放。';
      list.append(empty);return;
    }
    const wrap=doc.createElement('div');wrap.className='owned-furniture-list';
    for(const [id,d] of owned){
      const btn=doc.createElement('button');btn.type='button';
      btn.className='owned-furniture-chip'+(selected===id?' is-selected':'');
      btn.textContent=d.label||id;
      btn.addEventListener('click',()=>{
        if(drag)return;
        select(id);say(`已选中「${d.label||id}」，拖动或再点地面放到想要的位置`);
      },options);
      wrap.append(btn);
    }
    list.append(wrap);
  }
  function fillInspector() {
    const d=manager.definitions[selected],root=furniture.get(selected);
    name.textContent=d?d.label||selected:'点击一件家具';rotate.disabled=!d;
    const enabled=Boolean(d&&root),box=d?.boxes[0];
    if(root)root.getWorldScale(scale);
    for(const kind of ['size','center'])for(const [i,axis] of ['x','y','z'].entries()) {
      const input=$(`box-${kind}-${axis}`);input.disabled=!enabled;
      input.value=enabled?+(box[kind][i]*Math.abs(scale[axis])).toFixed(3):'';
    }
    for(const [id,key] of [['box-blocks-navigation','blocksNavigation'],['box-blocks-placement','blocksPlacement']]) {
      $(id).disabled=!enabled;$(id).checked=Boolean(d?.[key]);
    }
    updatePlacementState();
    renderOwnedList();
  }
  function select(id) {selected=id;invalid=false;fillInspector();}
  function placeSelectedAt(x,z) {
    if(!selected||drag)return false;
    const root=furniture.get(selected);if(!root||!manager.definitions[selected]?.draggable)return false;
    const before=manager.snapshot();
    let px=x,pz=z;if($('snap-grid').checked){px=Math.round(px*10)/10;pz=Math.round(pz*10)/10;}
    manager.previewTransform(selected,{position:[px,root.position.y,pz]});
    const valid=manager.commit(before);fillInspector();
    say(valid?'已摆放到这里':'这里不能摆放，已恢复原位置',!valid);return valid;
  }
  async function enter() {
    if(active||pending)return false;
    const token=++generation;
    pending=true;entry.disabled=true;entry.textContent='等待伙伴站稳…';
    say('伙伴站稳后进入装修模式');onEvent('decoration-pending');
    const canceled=new Promise(resolve=>{cancelPending=resolve;});
    let ready;try{ready=await Promise.race([prepare(),canceled]);}catch{ready=false;}
    if(token!==generation)return false;pending=false;cancelPending=null;
    if(!ready){entry.disabled=false;entry.textContent='装修';feedback.hidden=true;return false;}
    session=manager.snapshot();if(manager.beginEdit&&manager.beginEdit()===false)return false;active=true;entry.hidden=true;panel.hidden=false;
    const ownedCount=shopOwnedEntries().length;
    say(ownedCount?`可拖动家具；已兑换 ${ownedCount} 件，点左侧列表选中后摆放`:'拖动家具摆放；台面上的灯会跟随家具移动');
    fillInspector();onEvent('decoration-mode',{active:true});return true;
  }
  function cancelDrag(message='已取消这次拖动') {
    if(!drag)return;
    const before=drag.before,id=drag.pointerId;drag=null;
    manager.restore(before);invalid=false;
    if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
    fillInspector();say(message);canvas.style.cursor='default';
  }
  function finishDrag(cancel=false) {
    if(!drag)return;
    if(cancel){cancelDrag();return;}
    const current=drag;drag=null;
    if(canvas.hasPointerCapture?.(current.pointerId))canvas.releasePointerCapture(current.pointerId);
    const valid=!current.moved||manager.commit(current.before);
    invalid=false;fillInspector();canvas.style.cursor='default';
    say(valid?(current.moved?'摆放成功，可继续拖动或完成保存':'已选中家具'):'这里不能摆放，已恢复原位置',!valid);
  }
  function exit(save=true) {
    if(pending){generation++;pending=false;cancelPending?.(false);cancelPending=null;entry.disabled=false;entry.textContent='装修';feedback.hidden=true;return true;}
    if(!active)return false;
    if(drag)finishDrag(false);
    if(manager.finishEdit){if(!manager.finishEdit({save,persist:persistLayout})){say('布局暂时无法保存，请稍后重试',true);return false;}}
    else if(save) {
      const result=manager.validate();if(!result.valid){say(result.reason||'布局暂不可用',true);return false;}
      if(persistLayout&&!manager.persist()){say('本机存储暂不可用，摆放仍保留在当前页面，请稍后重试',true);return false;}
    } else manager.restore(session);
    active=false;selected=null;invalid=false;session=null;panel.hidden=true;
    entry.hidden=false;entry.disabled=false;entry.textContent='装修';
    say(save?(persistLayout?'布局已保存到本机':'布局已应用'):'已取消本次装修');onEvent('decoration-mode',{active:false,saved:save});return true;
  }
  function pointerDown(e) {
    if(!active||e.button!==0)return;
    canvas.focus({preventScroll:true});const id=pick(e);
    if(!id){
      // 已从列表选中家具时，点空地可直接落到该点。
      if(selected&&ground(e)){placeSelectedAt(hitPoint.x,hitPoint.z);e.preventDefault();return;}
      select(null);return;
    }
    select(id);const root=furniture.get(id);if(!ground(e))return;
    drag={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:root.position.x-hitPoint.x,offsetZ:root.position.z-hitPoint.z,before:manager.snapshot(),moved:false};
    canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
  }
  function pointerMove(e) {
    if(!active)return;
    if(!drag){canvas.style.cursor=pick(e)?'grab':'default';return;}
    if(e.pointerId!==drag.pointerId||!ground(e))return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;
    drag.moved=true;const root=furniture.get(drag.id),snap=$('snap-grid').checked;
    let x=hitPoint.x+drag.offsetX,z=hitPoint.z+drag.offsetZ;
    if(snap){x=Math.round(x*10)/10;z=Math.round(z*10)/10;}
    manager.previewTransform(drag.id,{position:[x,root.position.y,z]});
    const check=manager.validate({checkPath:false});invalid=!check.valid;updatePlacementState();canvas.style.cursor='grabbing';
    say(check.valid?'松手确认摆放':check.reason||'位置不可用，松手会回退',!check.valid);
  }
  function rotateSelected() {
    if(!selected||drag)return;
    const root=furniture.get(selected),before=manager.snapshot();
    manager.previewTransform(selected,{rotation:[0,root.rotation.y+Math.PI/2,0]});
    const valid=manager.commit(before);fillInspector();say(valid?'已旋转90°':'旋转后空间不足，已回退',!valid);
  }
  function editCollider() {
    if(!active||!selected||drag)return;
    const root=furniture.get(selected);root.getWorldScale(scale);
    const patch={};
    for(const kind of ['size','center'])patch[kind]=['x','y','z'].map(axis=>Number($(`box-${kind}-${axis}`).value)/Math.max(.0001,Math.abs(scale[axis])));
    patch.blocksNavigation=$('box-blocks-navigation').checked;patch.blocksPlacement=$('box-blocks-placement').checked;
    if(!finite3(patch.size)||!finite3(patch.center)||patch.size.some(v=>v<=0)) {say('请输入有效的正尺寸',true);fillInspector();return;}
    const valid=manager.updateCollider(selected,patch);fillInspector();say(valid?'碰撞盒已更新，模型尺寸保持原样':'碰撞盒使布局不可用，已回退',!valid);
  }
  entry.disabled=false;entry.addEventListener('click',enter,options);
  $('finish-decoration').addEventListener('click',()=>exit(true),options);
  $('cancel-decoration').addEventListener('click',()=>exit(false),options);
  rotate.addEventListener('click',rotateSelected,options);
  for(const input of settings.querySelectorAll('input'))input.addEventListener('change',editCollider,options);
  canvas.addEventListener('pointerdown',pointerDown,options);canvas.addEventListener('pointermove',pointerMove,options);
  canvas.addEventListener('pointerup',e=>{if(drag?.pointerId===e.pointerId)finishDrag();},options);
  canvas.addEventListener('pointercancel',()=>cancelDrag(),options);
  canvas.addEventListener('lostpointercapture',()=>{if(drag)cancelDrag();},options);
  win.addEventListener('blur',()=>cancelDrag(),options);
  win.addEventListener('keydown',e=>{if(active&&e.code==='Escape'&&(doc.activeElement===canvas||uiRoot.contains(doc.activeElement))){e.preventDefault();if(drag)cancelDrag();else exit(false);}},options);
  return {
    get active(){return active;},get pending(){return pending;},get selected(){return selected;},get dragging(){return Boolean(drag);},
    enter,exit,refresh:()=>{fillInspector();},
    dispose(){generation++;pending=false;cancelPending?.(false);cancelPending=null;if(drag)cancelDrag();if(active&&manager.finishEdit)manager.finishEdit({save:false,persist:false});abort.abort();clearTimeout(feedbackTimer);entry.disabled=true;panel.hidden=true;feedback.hidden=true;},
  };
}
