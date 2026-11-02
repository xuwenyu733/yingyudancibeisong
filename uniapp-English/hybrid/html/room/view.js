// 可选演示视图。核心mountRoom不依赖这些DOM，也不会自动插入UI。
const TEMPLATE = `
  <canvas data-room-control="room" tabindex="0" aria-label="伙伴房间。点击灯开关暖光，点击沙发坐下或起立，双击地面行走。方向键或WASD移动，空格停下。"></canvas>
  <div data-room-control="loading" role="status">正在布置伙伴的小房间…</div>
  <output data-room-control="scene-status" class="sr-only" aria-hidden="true"></output>
  <button data-room-control="decorate" class="edit-button" disabled>装修</button>
  <section data-room-control="decoration-panel" aria-label="装修模式" hidden>
    <h2>布置小房间</h2>
    <p>拖动家具摆放，不可用的位置会自动回退。</p>
    <label><input data-room-control="snap-grid" type="checkbox" checked> 摆放吸附（0.1米）</label>
    <hr style="border:0;border-top:1px solid #e9dbc5;margin:12px 0">
    <div class="owned-furniture-block">
      <div class="owned-furniture-title">已兑换家具</div>
      <div data-room-control="owned-furniture" aria-label="已兑换家具列表"></div>
    </div>
    <hr style="border:0;border-top:1px solid #e9dbc5;margin:12px 0">
    <div data-room-control="selected-name">点击一件家具</div>
    <button data-room-control="rotate-furniture" class="edit-button" disabled style="margin-top:8px">旋转90°</button>
    <details data-room-control="collider-settings">
      <summary>碰撞盒设置</summary>
      <p class="edit-small">单位：米。单独调整盒子，不改变家具模型。</p>
      <div class="box-fields">
        <label>宽 X<input data-room-control="box-size-x" type="number" min="0.04" max="10" step="0.05" aria-label="碰撞盒宽度"></label>
        <label>高 Y<input data-room-control="box-size-y" type="number" min="0.02" max="10" step="0.05" aria-label="碰撞盒高度"></label>
        <label>深 Z<input data-room-control="box-size-z" type="number" min="0.04" max="10" step="0.05" aria-label="碰撞盒深度"></label>
        <label>偏移 X<input data-room-control="box-center-x" type="number" min="-8" max="8" step="0.05" aria-label="碰撞盒X偏移"></label>
        <label>偏移 Y<input data-room-control="box-center-y" type="number" min="-8" max="8" step="0.05" aria-label="碰撞盒Y偏移"></label>
        <label>偏移 Z<input data-room-control="box-center-z" type="number" min="-8" max="8" step="0.05" aria-label="碰撞盒Z偏移"></label>
      </div>
      <label style="margin-top:8px"><input data-room-control="box-blocks-navigation" type="checkbox"> 阻挡伙伴行走</label>
      <label><input data-room-control="box-blocks-placement" type="checkbox"> 参与家具摆放碰撞</label>
    </details>
    <div class="edit-actions"><button data-room-control="cancel-decoration" class="edit-button">取消</button><button data-room-control="finish-decoration" class="edit-button edit-primary">完成保存</button></div>
  </section>
  <div data-room-control="edit-feedback" role="status" hidden></div>
  `;
export function createRoomView(container,{controls=true}={}) {
  if(!container?.ownerDocument)throw new TypeError('需要一个DOM容器');
  const root=container.ownerDocument.createElement('div');root.className='pet-room-view';root.innerHTML=TEMPLATE;
  container.append(root);const get=name=>root.querySelector(`[data-room-control="${name}"]`);
  if(!controls){get('decorate').remove();get('decoration-panel').remove();get('edit-feedback').remove();}
  let hiddenTimer=0;
  return {root,canvas:get('room'),controlsRoot:controls?root:null,
    updateState(state){get('scene-status').textContent=JSON.stringify(state);},
    ready(){const loading=get('loading');loading.style.opacity='0';hiddenTimer=setTimeout(()=>loading.hidden=true,300);},
    error(error){const loading=get('loading');loading.hidden=false;loading.style.opacity='1';loading.classList.add('error');loading.textContent=`房间暂时无法打开：${error.message}。请检查WebGL2支持与资源路径，通过本地服务预览。`;},
    dispose(){clearTimeout(hiddenTimer);root.remove();},
  };
}
