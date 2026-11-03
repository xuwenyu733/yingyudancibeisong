// 可选演示视图。核心mountRoom不依赖这些DOM，也不会自动插入UI。
let viewSequence=0;
const TEMPLATE = `
  <canvas data-room-control="room" tabindex="0" aria-label="伙伴房间。点击灯开关暖光，点击沙发坐下或起立，点击地面行走，按住动物拖动可跟随移动。方向键或WASD移动，空格停下。"></canvas>
  <div data-room-control="loading" role="status"><img class="room-loading-pet" src="${new URL('./assets/pets/previews/apricot-fox.png',import.meta.url).href}" alt="杏橘狐在等你"><strong class="room-loading-title">伙伴正在整理小屋…</strong><p class="room-loading-copy">把小毯子铺好，把小灯点亮，马上就能一起玩啦～</p></div>
  <output data-room-control="scene-status" class="sr-only" aria-hidden="true"></output>
  <button data-room-control="decorate" class="edit-button" disabled>装修</button>
  <output data-room-control="room-area" class="room-area" aria-label="当前房间面积"></output>
  <section data-room-control="decoration-panel" aria-label="装修模式" hidden>
    <header class="decoration-panel__header">
      <h2>布置小房间</h2>
      <button data-room-control="decoration-shop" class="edit-button decoration-panel__shop" aria-label="装修中打开商店和房屋大小">房型 / 商店</button>
      <button data-room-control="toggle-decoration-panel" class="edit-button decoration-panel__toggle" aria-expanded="true" title="折叠装修设置，让房间视野更开阔">收起设置</button>
    </header>
    <div class="decoration-panel__selection">
      <div data-room-control="selected-name">点击一件家具</div>
      <button data-room-control="undo-decoration" class="edit-button" disabled title="撤销上一步摆放或旋转（Ctrl+Z）">撤销</button>
      <button data-room-control="redo-decoration" class="edit-button" disabled title="重做上一步（Ctrl+Shift+Z）">重做</button>
      <button data-room-control="rotate-furniture" class="edit-button" disabled title="将选中的家具旋转90度">旋转90°</button>
      <button data-room-control="store-furniture" class="edit-button" disabled title="将选中的家具收回仓库">收回仓库</button>
    </div>
    <div data-room-control="decoration-panel-body" class="decoration-panel__body">
      <p>点击下方家具选用，或直接拖进房间。拖动房间里的家具可调整位置。</p>
      <label><input data-room-control="snap-grid" type="checkbox" checked> 摆放吸附（0.1米）</label>
      <fieldset class="room-finishes"><legend>墙面颜色 · 免费切换</legend><div data-room-control="wall-colors" class="wall-colors"></div><label>自选墙色<input data-room-control="custom-wall-color" type="color" value="#ffedc2" aria-label="自选墙面颜色"></label><button data-room-control="reset-flooring" class="edit-button">恢复原木地面</button><p class="edit-small">配色与地砖切换即时保存。挂件可拖到左墙、后墙，旋转按钮可换墙。</p></fieldset>
      <details data-room-control="decoration-organizer" class="decoration-organizer">
        <summary>帮这一层整理一下</summary>
        <p class="edit-small">只整理当前楼层，积分与收藏保留。确认后会先保存当前装修。</p>
        <div class="decoration-organizer__actions"><button data-room-control="collect-all-furniture" class="edit-button">一键全收进仓库</button><button data-room-control="reset-room-layout" class="edit-button">恢复默认布局</button></div>
        <section data-room-control="organizer-confirm" class="decoration-organizer__confirm" role="group" aria-label="确认整理当前楼层" hidden><strong data-room-control="organizer-confirm-title"></strong><p data-room-control="organizer-confirm-copy" class="edit-small"></p><div class="decoration-organizer__actions"><button data-room-control="organizer-confirm-yes" class="edit-button edit-primary">确认</button><button data-room-control="organizer-confirm-cancel" class="edit-button">先不整理</button></div></section>
      </details>
      <details data-room-control="collider-settings">
        <summary>高级设置 · 碰撞盒</summary>
        <p class="edit-small">单位：米。单独调整盒子，不改变家具模型。</p>
        <div class="box-fields">
          <label>宽 X<input data-room-control="box-size-x" type="number" min="0.04" max="10" step="0.05" aria-label="碰撞盒宽度"></label>
          <label>高 Y<input data-room-control="box-size-y" type="number" min="0.02" max="10" step="0.05" aria-label="碰撞盒高度"></label>
          <label>深 Z<input data-room-control="box-size-z" type="number" min="0.04" max="10" step="0.05" aria-label="碰撞盒深度"></label>
          <label>偏移 X<input data-room-control="box-center-x" type="number" min="-8" max="8" step="0.05" aria-label="碰撞盒X偏移"></label>
          <label>偏移 Y<input data-room-control="box-center-y" type="number" min="-8" max="8" step="0.05" aria-label="碰撞盒Y偏移"></label>
          <label>偏移 Z<input data-room-control="box-center-z" type="number" min="-8" max="8" step="0.05" aria-label="碰撞盒Z偏移"></label>
        </div>
        <label><input data-room-control="box-blocks-navigation" type="checkbox"> 阻挡伙伴行走</label>
        <label><input data-room-control="box-blocks-placement" type="checkbox"> 参与家具摆放碰撞</label>
      </details>
      <p class="edit-small decoration-panel__note">位置调整可取消；收回、取出家具即时生效。</p>
    </div>
    <div class="edit-actions"><button data-room-control="cancel-decoration" class="edit-button">取消</button><button data-room-control="finish-decoration" class="edit-button edit-primary">完成保存</button></div>
  </section>
  <section data-room-control="storage-strip" class="storage-strip" aria-label="我的家具，横向滑动查看更多" hidden>
    <div class="storage-strip__head">
      <div class="storage-strip__title">我的家具 <span data-room-control="storage-count" class="storage-strip__count"></span></div>
      <div class="storage-strip__filters" role="group" aria-label="家具栏筛选">
        <button data-room-control="strip-filter" data-strip-filter="all" class="storage-strip__filter" aria-pressed="true">全部</button>
        <button data-room-control="strip-filter" data-strip-filter="furniture" class="storage-strip__filter" aria-pressed="false">家具</button>
        <button data-room-control="strip-filter" data-strip-filter="wall" class="storage-strip__filter" aria-pressed="false">挂件</button>
        <button data-room-control="strip-filter" data-strip-filter="storage" class="storage-strip__filter" aria-pressed="false">仓库</button>
      </div>
      <span data-room-control="storage-strip-hint" class="storage-strip__hint">点击选用 · 拖进房间</span>
      <div class="storage-strip__navigation">
        <button data-room-control="storage-prev" class="storage-strip__arrow" aria-label="查看上一排家具" title="向左浏览家具">‹</button>
        <button data-room-control="storage-next" class="storage-strip__arrow" aria-label="查看下一排家具" title="向右浏览家具">›</button>
      </div>
    </div>
    <div class="storage-strip__row" data-room-control="storage-strip-row" tabindex="0" role="group" aria-label="已拥有的家具，可左右滑动"></div>
    <p data-room-control="storage-empty" class="storage-strip__empty" hidden>还没有可用家具，先去商店逛逛吧。</p>
  </section>
  <div data-room-control="edit-feedback" role="status" hidden></div>
  `;
export function createRoomView(container,{controls=true}={}) {
  if(!container?.ownerDocument)throw new TypeError('需要一个DOM容器');
  const root=container.ownerDocument.createElement('div');root.className='pet-room-view';root.innerHTML=TEMPLATE;
  // 组件可能嵌在宿主 form 中；演示控件不能成为隐式提交按钮。
  for(const button of root.querySelectorAll('button'))button.type='button';
  container.append(root);const get=name=>root.querySelector(`[data-room-control="${name}"]`);
  const body=get('decoration-panel-body');body.id=`pet-room-decoration-body-${++viewSequence}`;
  get('toggle-decoration-panel').setAttribute('aria-controls',body.id);
  if(!controls){get('decorate').remove();get('decoration-panel').remove();get('storage-strip').remove();get('edit-feedback').remove();}
  const win=container.ownerDocument.defaultView;
  let hiddenTimer=0,disposed=false;
  return {root,canvas:get('room'),controlsRoot:controls?root:null,
    updateState(state){if(!disposed){get('scene-status').textContent=JSON.stringify(state);if(state.shop?.width){const area=`${state.shop.roomName} · ${(state.shop.width*state.shop.depth).toFixed(1)} ㎡`;if(get('room-area').textContent!==area)get('room-area').textContent=area;} }},
    ready(){if(disposed)return;win.clearTimeout(hiddenTimer);const loading=get('loading');loading.classList.remove('error');loading.style.opacity='0';hiddenTimer=win.setTimeout(()=>{if(!disposed)loading.hidden=true;},300);},
    error(error){if(disposed)return;win.clearTimeout(hiddenTimer);const loading=get('loading');loading.hidden=false;loading.style.opacity='1';loading.classList.add('error');loading.textContent=`房间暂时无法打开：${error?.message||'未知错误'}。请检查WebGL2支持与资源路径，通过本地服务预览。`;},
    dispose(){if(disposed)return;disposed=true;win.clearTimeout(hiddenTimer);root.remove();},
  };
}
