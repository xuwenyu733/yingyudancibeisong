import {mountRoom} from './room.js';
import {createRoomView} from './view.js';
import {createShopPanel} from './shop-panel.js';
import {createProfilePanel} from './scene-profile.js';
import {createRoomBridge} from './integration.mjs';
import {roomError} from './runtime.mjs';
import {createRoomTheme} from './theme.mjs';
import {createCompanionPanel} from './companion-ui.js';
import {createCreativePanel} from './creative-ui.js';

export {mountRoom} from './room.js';
export {createRoomView} from './view.js';
export {createShopPanel} from './shop-panel.js';
export {createProfilePanel} from './scene-profile.js';
export {createRoomBridge} from './integration.mjs';
export {DEFAULT_ASSET_URLS} from './assets.mjs';

const mounted=new WeakMap(),stylesByRoot=new WeakMap();
const stylesheetURL=new URL('./styles.css',import.meta.url).href;
function acquireStyles(container,timeoutMs=30000){
  const doc=container.ownerDocument,tree=container.getRootNode?.();
  const scope=tree?.nodeType===11&&tree.host?tree:doc;
  let shared=stylesByRoot.get(scope);
  if(!shared){
    const link=doc.createElement('link');link.rel='stylesheet';link.href=stylesheetURL;link.dataset.petHouseStyle='true';
    let finish;
    const ready=new Promise((resolve,reject)=>{
      let settled=false,timer=0;
      const settle=error=>{if(settled)return;settled=true;doc.defaultView.clearTimeout(timer);if(error)reject(error);else resolve();};
      finish=()=>settle();
      link.addEventListener('load',()=>settle(),{once:true});
      link.addEventListener('error',()=>settle(roomError('STYLE_LOAD_FAILED','小屋样式加载失败，请检查部署资源路径')),{once:true});
      timer=doc.defaultView.setTimeout(()=>settle(roomError('STYLE_LOAD_TIMEOUT','小屋样式加载超时，请检查资源地址或稍后重试')),timeoutMs);
    });
    ready.catch(()=>{});
    shared={link,ready,finish,count:0};stylesByRoot.set(scope,shared);
    (scope===doc?(doc.head||doc.documentElement):scope).append(link);
  }
  shared.count++;let released=false;
  return {ready:shared.ready,dispose(){
    if(released)return;released=true;
    if(--shared.count===0){shared.link.remove();shared.finish();stylesByRoot.delete(scope);}
  }};
}

/** 完整 UI 挂载入口。只在调用时访问 DOM；React/Vue 卸载时调用 dispose。 */
export function mountPetHouse(options={}){
  const {container,panels=true,controls=true,styles=true,bridge=false,onError,pointsLabel='学习积分',demo=false,extendApi,...roomOptions}=options;
  const doc=container?.ownerDocument;
  if(!doc?.defaultView||typeof container.append!=='function')throw roomError('INVALID_CONTAINER','需要一个已创建的浏览器 DOM 容器');
  if(mounted.has(container))throw roomError('ALREADY_MOUNTED','此容器已有小屋，请先调用 dispose');
  if(roomOptions.signal?.aborted)throw roomError('ABORTED','小屋挂载已取消');
  const view=createRoomView(container,{controls});
  let disposed=false,failed=false,controller=null,shop=null,profile=null,companion=null,creativePanel=null,connection=null,styleToken=null,theme=null,themeListener=null;
  const safe=(callback,...args)=>{try{callback?.(...args);}catch{/* 宿主观察者异常不影响已完成的操作。 */}};
  function releasePanels(){creativePanel?.dispose();connection?.dispose();shop?.dispose();profile?.dispose();companion?.dispose();creativePanel=connection=shop=profile=companion=null;}
  function dispose(){
    if(disposed)return;disposed=true;
    roomOptions.signal?.removeEventListener('abort',onAbort);
    if(themeListener)view.root.removeEventListener('room-ui-theme-change',themeListener);
    releasePanels();theme?.dispose();controller?.dispose();styleToken?.dispose();view.dispose();
    if(mounted.get(container)===result)mounted.delete(container);
  }
  const onAbort=()=>dispose();
  let result;
  try{
    if(styles)styleToken=acquireStyles(container,roomOptions.loadTimeoutMs||30000);
    controller=mountRoom({...roomOptions,canvas:view.canvas,uiRoot:view.controlsRoot,
      onState(state){if(disposed||failed)return;view.updateState(state);shop?.update(state);profile?.update(state);companion?.update(state);creativePanel?.update(state);safe(roomOptions.onState,state);},
      onEvent(type,detail){
        if(disposed||failed)return;
        if(type!=='ready')connection?.emit(type,detail);safe(roomOptions.onEvent,type,detail);
        if(type==='error'&&!disposed){
          failed=true;releasePanels();theme?.dispose();styleToken?.dispose();
          const error=roomError(detail?.code||'ROOM_FAILED',detail?.message||'小屋运行失败，请重新挂载');
          controller?.dispose();view.error(error);safe(onError,error);
        }
      },
    });
    if(extendApi){if(typeof extendApi!=='function')throw new TypeError('extendApi 必须为宿主提供的函数');const extended=extendApi(controller.api);if(!extended||typeof extended.getState!=='function'||typeof extended.dispose!=='function')throw new TypeError('extendApi 必须保留房间基础接口');controller.api=extended;}
    theme=createRoomTheme({root:view.root,api:controller.api,controls});
    themeListener=event=>{if(controller.api.getState().ready&&event.detail?.theme!==controller.api.getCompanion?.().companion?.theme)controller.api.updateCompanion?.({theme:event.detail.theme});};view.root.addEventListener('room-ui-theme-change',themeListener);
    if(panels&&!failed){shop=createShopPanel({root:view.root,api:controller.api,pointsLabel,demo});profile=createProfilePanel({root:view.root,api:controller.api,pointsLabel});companion=createCompanionPanel({root:view.root,api:controller.api});creativePanel=createCreativePanel({root:view.root,api:controller.api});}
    if(bridge&&!failed){
      const configuration=bridge===true?{}:bridge;
      connection=createRoomBridge({...configuration,api:controller.api,getState:controller.api.getState,eventTarget:view.canvas,
        globalObject:doc.defaultView,legacyName:configuration.legacyName??false});
    }
    result={api:controller.api,view,version:controller.version,protocolVersion:controller.protocolVersion,ready:null,dispose};
    controller.api.dispose=dispose;
    mounted.set(container,result);
    result.ready=Promise.all([controller.ready,styleToken?.ready]).then(async([api])=>{
      if(disposed)throw roomError('ABORTED','小屋挂载已取消');
      const preferred=api.getCompanion?.().companion?.theme;if(preferred)theme?.set(preferred,{persist:false});else theme?.refresh();view.ready();await connection?.ready();
      if(disposed)throw roomError('ABORTED','小屋挂载已取消');
      return api;
    }).catch(error=>{
      if(!disposed&&!failed&&error.code!=='ABORTED'){failed=true;releasePanels();theme?.dispose();controller.dispose();styleToken?.dispose();view.error(error);safe(onError,error);}
      throw error;
    });
    result.ready.catch(()=>{});
    roomOptions.signal?.addEventListener('abort',onAbort,{once:true});
    if(roomOptions.signal?.aborted)dispose();
    return result;
  }catch(error){dispose();throw error;}
}
