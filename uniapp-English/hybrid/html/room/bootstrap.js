import {mountRoom} from './room.js';
import {createRoomView} from './view.js';
import {createRoomBridge} from './integration.mjs';
import {createShopPanel} from './shop-panel.js';
import {createProfilePanel} from './scene-profile.js';

// 这只是独立演示页入口。嵌入Vue/React/其他App时直接使用mountRoom，毋需此文件。
const view=createRoomView(document.getElementById('app'));
const params=new URLSearchParams(location.search);
let bridge=null,shop=null,profile=null,oldAlias=false;
const controller=mountRoom({
  canvas:view.canvas,uiRoot:view.controlsRoot,
  quality:['low','balanced','high'].includes(params.get('quality'))?params.get('quality'):'auto',
  storageKey:params.get('preview')==='qa'?'original-pet-room-qa-v3':'hamster-room-layout-v3',
  initialPoints:1000, // 独立演示账户；实际App挂载默认0，由学习完成事件入账。
  onState:state=>{view.updateState(state);shop?.update(state);profile?.update(state);},
  onEvent:(type,detail)=>{if(type!=='ready')bridge?.emit(type,detail);},
});
shop=createShopPanel({root:view.root,api:controller.api,pointsLabel:'体验积分',demo:true});
profile=createProfilePanel({root:view.root,api:controller.api,pointsLabel:'体验积分'});
bridge=createRoomBridge({api:controller.api,getState:controller.api.getState,eventTarget:view.canvas,globalObject:window,legacyName:'PetRoom',roomId:'pet-room-demo'});
// 仅演示页保留旧接口别名；核心模块不写全局。同名宿主对象绝不覆盖。
if(!Object.hasOwn(window,'HamsterRoom')){window.HamsterRoom=controller.api;oldAlias=true;}
controller.ready.then(async()=>{view.ready();await bridge.ready();}).catch(error=>{if(error.code!=='ABORTED')view.error(error);});
window.addEventListener('pagehide',event=>{
  if(event.persisted)return;
  shop.dispose();profile.dispose();bridge.dispose();controller.dispose();view.dispose();
  if(oldAlias&&window.HamsterRoom===controller.api)delete window.HamsterRoom;
});
