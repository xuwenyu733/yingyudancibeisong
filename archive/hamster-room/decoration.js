import * as THREE from 'three';

/** 装修控制器：输入/UI/可视化独立于业务状态；所有摆放都经layout-manager事务提交。 */
export function createDecoration({canvas,scene,camera,furniture,manager,prepare,onEvent=()=>{}}) {
  const abort=new AbortController(),options={signal:abort.signal};
  const $=id=>document.getElementById(id);
  const entry=$('decorate'),panel=$('decoration-panel'),feedback=$('edit-feedback');
  const name=$('selected-name'),rotate=$('rotate-furniture'),settings=$('collider-settings');
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.09);
  const hitPoint=new THREE.Vector3(),scale=new THREE.Vector3();
  let active=false,pending=false,selected=null,drag=null,session=null,invalid=false,feedbackTimer=0,generation=0;
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
  }
  function select(id) {selected=id;invalid=false;fillInspector();}
  async function enter() {
    if(active||pending)return false;
    const token=++generation;
    pending=true;entry.disabled=true;entry.textContent='等待仓鼠站稳…';
    say('仓鼠站稳后进入装修模式');onEvent('decoration-pending');
    const ready=await prepare();if(token!==generation)return false;pending=false;
    if(!ready){entry.disabled=false;entry.textContent='装修';feedback.hidden=true;return false;}
    session=manager.snapshot();active=true;entry.hidden=true;panel.hidden=false;
    say('拖动家具摆放；台面上的灯会跟随家具移动');fillInspector();onEvent('decoration-mode',{active:true});return true;
  }
  function cancelDrag(message='已取消这次拖动') {
    if(!drag)return;
    const before=drag.before,id=drag.pointerId;drag=null;
    manager.restore(before);invalid=false;
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    fillInspector();say(message);canvas.style.cursor='default';
  }
  function finishDrag(cancel=false) {
    if(!drag)return;
    if(cancel){cancelDrag();return;}
    const current=drag;drag=null;
    if(canvas.hasPointerCapture(current.pointerId))canvas.releasePointerCapture(current.pointerId);
    const valid=!current.moved||manager.commit(current.before);
    invalid=false;fillInspector();canvas.style.cursor='default';
    say(valid?(current.moved?'摆放成功，可继续拖动或完成保存':'已选中家具'):'这里不能摆放，已恢复原位置',!valid);
  }
  function exit(save=true) {
    if(pending){generation++;pending=false;entry.disabled=false;entry.textContent='装修';feedback.hidden=true;return true;}
    if(!active)return false;
    if(drag)finishDrag(false);
    if(save) {
      const result=manager.validate();if(!result.valid){say(result.reason||'布局暂不可用',true);return false;}
      if(!manager.persist()){say('本机存储暂不可用，摆放仍保留在当前页面，请稍后重试',true);return false;}
    } else manager.restore(session);
    active=false;selected=null;invalid=false;session=null;panel.hidden=true;
    entry.hidden=false;entry.disabled=false;entry.textContent='装修';
    say(save?'布局已保存到本机':'已取消本次装修');onEvent('decoration-mode',{active:false,saved:save});return true;
  }
  function pointerDown(e) {
    if(!active||e.button!==0)return;
    const id=pick(e);if(!id){select(null);return;}
    select(id);const root=furniture.get(id);if(!ground(e))return;
    drag={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:root.position.x-hitPoint.x,offsetZ:root.position.z-hitPoint.z,before:manager.snapshot(),moved:false};
    canvas.setPointerCapture(e.pointerId);e.preventDefault();
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
  window.addEventListener('blur',()=>cancelDrag(),options);
  window.addEventListener('keydown',e=>{if(active&&e.code==='Escape'){e.preventDefault();if(drag)cancelDrag();else exit(false);}},options);
  return {
    get active(){return active;},get pending(){return pending;},get selected(){return selected;},get dragging(){return Boolean(drag);},
    enter,exit,refresh:()=>{fillInspector();},
    dispose(){generation++;pending=false;if(drag)cancelDrag();abort.abort();clearTimeout(feedbackTimer);entry.disabled=true;panel.hidden=true;feedback.hidden=true;},
  };
}
