import React,{StrictMode,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createApp,h,ref,nextTick} from 'vue';
import {mount as mountSvelte,unmount as unmountSvelte} from 'svelte';
import ReactPetRoom from '../../../frameworks/ReactPetRoom.jsx';
import VuePetRoom from '../../../frameworks/VuePetRoom.vue';
import SvelteHarness from './SvelteHarness.svelte';
import UniH5 from './UniH5.generated.vue';
import {mountPetHouse} from '../../../pet-house.js';

const results=document.getElementById('results'),summary=document.getElementById('summary'),button=document.getElementById('run');
const strictCheck=__PET_ROOM_STRICT_CHECK__;window.frameworkMode=strictCheck?'strict':'production';
const failures=[],all=[];let formSubmits=0,strictSetups=0,strictCleanups=0,reactRoot=null,vueApp=null,reactApi=null,vueApi=null;
const storage=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};};
const reactStorage=storage(),vueStorage=storage(),vueKey=ref('vue-account-a');
const svelteStorage=storage();let svelteComponent=null,svelteApi=null,svelteReadyCalls=0,reactReadyCalls=0,reactCallbackVersion=0;
const assert=(value,message)=>{if(!value)throw Error(message);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
async function until(check,message,limit=15000){const start=performance.now();while(performance.now()-start<limit){const value=check();if(value)return value;await tick();}throw Error(message);}
async function check(name,run){const row=document.createElement('li');row.textContent=name+' …';results.append(row);try{await run();row.className='pass';row.textContent='通过 · '+name;all.push(name);}catch(error){row.className='fail';row.textContent='失败 · '+name+'：'+error.message;failures.push({name,error:error.message});}summary.textContent=`${all.length} 项通过 / ${failures.length} 项失败`;}
function Probe(){useEffect(()=>{strictSetups++;return()=>strictCleanups++;},[]);return null;}
const errors=[];
function reactTree(){return <StrictMode><Probe/><ReactPetRoom storageKey="react-account-a" storageAdapter={reactStorage} initialPoints={1000} quality="low" style={{height:'100%',minHeight:0}} onReady={api=>{reactApi=api;reactReadyCalls++;}} onState={reactCallbackVersion?()=>{}:undefined} onError={error=>errors.push(error.message)}/></StrictMode>;}
function mountReact(){reactRoot=createRoot(document.getElementById('react'));reactRoot.render(reactTree());}
function mountVue(){vueApp=createApp({setup(){return()=>h(VuePetRoom,{storageKey:vueKey.value,storageAdapter:vueStorage,initialPoints:1000,quality:'low',style:{height:'100%',minHeight:0},onReady:api=>{vueApi=api;},onError:error=>errors.push(error.message)});}});vueApp.mount('#vue');}
document.getElementById('host-form').addEventListener('submit',event=>{event.preventDefault();formSubmits++;});
window.addEventListener('unhandledrejection',event=>{errors.push('未处理拒绝：'+String(event.reason?.message||event.reason));});
button.addEventListener('click',async()=>{
  button.disabled=true;results.replaceChildren();all.length=failures.length=errors.length=0;
  await check('Vite 子目录生产产物：React 与 Vue 均成功加载真实模型',async()=>{
    mountReact();mountVue();await until(()=>reactApi?.getState().ready&&vueApi?.getState().ready,'框架组件加载失败');
    assert(errors.length===0,errors.join('; '));assert(document.querySelectorAll('.pet-room-view').length===2,'场景实例数量错误');
  });
  await check(strictCheck?'React开发StrictMode 的 setup → cleanup → setup 没有遗留场景':'React生产运行时正常挂载且没有重复场景',async()=>{
    assert(strictSetups>=(strictCheck?2:1)&&(!strictCheck||strictCleanups>=1),'预期的React挂载生命周期没有执行');
    assert(document.querySelectorAll('#react .pet-room-view').length===1,'重复挂载留下场景');
  });
  await check('React 回调更新不重建场景或重置账户',async()=>{
    const before=reactApi,count=reactReadyCalls,canvas=document.querySelector('#react canvas');reactCallbackVersion++;reactRoot.render(reactTree());await tick();await tick();
    assert(reactApi===before&&document.querySelector('#react canvas')===canvas&&reactReadyCalls===count,'回调变化重建了场景');
  });
  await check('多实例共用一个样式资源，商店与主页均已加载样式',async()=>{
    assert(document.querySelectorAll('link[data-pet-house-style]').length===1,'共享样式引用计数错误');
    const root=document.querySelector('.pet-room-view');assert(getComputedStyle(root).position==='relative','合并 CSS 未加载');
  });
  await check('React 兑换扣分，与 Vue 的账户和宠物相互隔离',async()=>{
    const result=await reactApi.purchasePet('cloud-bunny','react-buy-bunny');assert(result.ok,result.message);
    assert(reactApi.getShop().balance===700,'兑换未扣300积分');assert(reactApi.getShop().pets.active==='cloud-bunny','真实宠物未切换');
    assert(vueApi.getShop().balance===1000&&vueApi.getShop().pets.active==='apricot-fox','另一实例被修改');
  });
  await check('嵌入宿主 form 后，打开商店不会提交表单',async()=>{
    document.querySelector('#react .room-shop__trigger').click();await tick();
    assert(!document.querySelector('#react .room-shop__sheet').hidden,'商店未打开');assert(formSubmits===0,'宿主表单被提交');
    document.querySelector('#react .room-shop__close').click();
  });
  await check('生产包中5张实际角色图片均加载，商店静置不继续提交WebGL帧',async()=>{
    document.querySelector('#react .room-shop__trigger').click();await tick();
    const images=[...document.querySelectorAll('#react .room-shop__card .room-shop__product-art > .room-shop__pet-model-preview')];assert(images.length===5,'角色图片数量不正确');await Promise.all(images.map(image=>image.decode()));assert(images.every(image=>image.naturalWidth===512),'角色图片未从构建资源中加载');
    const before=reactApi.getState().metrics;assert(before.presentationPaused,'商店未暂停实时画布');await new Promise(resolve=>setTimeout(resolve,650));assert(reactApi.getState().metrics.renderCount===before.renderCount,'弹窗背后仍在不断绘制');document.querySelector('#react .room-shop__close').click();
  });
  await check('生产包中41张商品实图及4类未解锁收藏预览、获取提示均可加载',async()=>{
    const images=[...document.querySelectorAll('#react .room-shop__card .room-shop__product-art > .room-shop__model-preview')];assert(images.length===41,`商品实图数量错误：${images.length}`);await Promise.all(images.map(image=>image.decode()));assert(images.every(image=>image.naturalWidth===512&&image.naturalHeight===384),'构建后的商品实图未完整加载');
    const goals=[...document.querySelectorAll('#react .room-shop__collection-goal')];assert(goals.length===4,'缺少分类收藏目标');
    const previews=goals.map(goal=>goal.querySelector('.room-shop__goal-art img'));assert(previews.every(Boolean),'未解锁收藏缺少实图预览');await Promise.all(previews.map(image=>image.decode()));assert(previews.every(image=>image.naturalWidth===512),'收藏预览未从构建资源中加载');
    assert(goals.every(goal=>goal.querySelector('.room-shop__goal-hint').textContent.includes('未解锁')&&goal.querySelector('[role="progressbar"]')&&goal.querySelector('.room-shop__goal-action').getAttribute('aria-label').includes('待收藏')),'收藏目标缺少解锁提示、进度或跳转入口');
  });
  await check('React 路由卸载清理 UI，旧 API 无法继续写存档',async()=>{
    const old=reactApi,before=JSON.stringify([...reactStorage.data]);reactRoot.unmount();reactRoot=null;reactApi=null;await tick();
    assert(!document.querySelector('#react .pet-room-view'),'卸载后仍有场景');
    assert(old.setProfileName('过期回调').ok===false,'旧 API 仍能修改昵称');assert(old.addStudyTime(60).ok===false,'旧 API 仍能累计时长');
    assert(old.getProfile().ok===false,'旧 API 仍会触发奖励结算');assert(JSON.stringify([...reactStorage.data])===before,'卸载后存档被修改');
  });
  await check('React 回到路由后恢复兑换过的宠物和700积分',async()=>{
    mountReact();await until(()=>reactApi?.getState().ready,'React 重新挂载失败');assert(reactApi.getShop().balance===700,'积分未恢复');assert(reactApi.getShop().pets.active==='cloud-bunny','宠物未恢复');
  });
  await check('Vue 切换账户重新挂载，旧账户 API 和昵称不串到新账户',async()=>{
    const old=vueApi;assert(old.setProfileName('账户甲').ok,'昵称保存失败');vueApi=null;vueKey.value='vue-account-b';await nextTick();await until(()=>vueApi?.getState().ready,'Vue账户切换失败');
    assert(vueApi.getProfile().profile.name!=='账户甲','昵称串账户');assert(old.setProfileName('过期甲').ok===false,'旧账户仍可写入');assert(vueApi.getShop().balance===1000,'新账户余额错误');
  });
  await check('Vue 组件暴露API并可显式重挂',async()=>{
    const host=document.createElement('div');host.style.height='320px';document.body.append(host);const component=ref(null);let ready=null;
    const app=createApp({setup:()=>()=>h(VuePetRoom,{ref:component,storageAdapter:null,panels:false,quality:'low',onReady:api=>ready=api})});app.mount(host);
    try{await until(()=>ready?.getState().ready,'Vue expose挂载失败');assert(component.value.getApi()===ready,'getApi未返回活动实例');const old=ready;ready=null;component.value.remount();await until(()=>ready?.getState().ready,'Vue显式重挂失败');assert(ready!==old&&old.getState().lifecycle==='disposed','旧Vue实例未销毁');}finally{app.unmount();host.remove();}
  });
  await check('Svelte 5 挂载、回调变更、账户切换及卸载均正常',async()=>{
    const host=document.getElementById('svelte');svelteComponent=mountSvelte(SvelteHarness,{target:host,props:{storage:svelteStorage,onReady:api=>{svelteApi=api;svelteReadyCalls++;},onError:error=>errors.push(error.message)}});
    await until(()=>svelteApi?.getState().ready,'Svelte加载失败');assert(svelteComponent.getApi()===svelteApi,'Svelte暴露API错误');const old=svelteApi,canvas=host.querySelector('canvas'),readyCount=svelteReadyCalls;
    svelteComponent.updateCallback();await tick();await tick();assert(svelteApi===old&&host.querySelector('canvas')===canvas&&svelteReadyCalls===readyCount,'Svelte回调更新重建场景');
    old.setProfileName('Svelte账户甲');svelteApi=null;svelteComponent.setAccount('svelte-account-b');await until(()=>svelteApi?.getState().ready,'Svelte账户切换失败');assert(old.getState().lifecycle==='disposed'&&svelteApi.getProfile().profile.name!=='Svelte账户甲','Svelte串账户');
    await unmountSvelte(svelteComponent);svelteComponent=null;assert(!host.querySelector('.pet-room-view'),'Svelte卸载遗留场景');
  });
  await check('导入成功后旧实例停止写入，重新挂载才启用新存档',async()=>{
    const archive=reactApi.exportArchive().archive;archive.profile.name='导入后的昵称';archive.economy.balance=42;
    const old=reactApi,result=old.importArchive(archive);assert(result.ok&&result.relaunchRequired,result.message);
    assert(old.getState().lifecycle==='reload-required','导入后仍在使用旧内存');assert(old.setProfileName('旧回调').ok===false,'旧回调覆盖了导入');
    reactRoot.unmount();reactRoot=null;reactApi=null;mountReact();await until(()=>reactApi?.getState().ready,'导入后重新挂载失败');
    assert(reactApi.getShop().balance===42&&reactApi.getProfile().profile.name==='导入后的昵称','新存档没有生效');
  });
  await check('AbortSignal 在加载中取消，整个 UI 和回调一起释放',async()=>{
    const host=document.createElement('div');host.style.height='360px';document.body.append(host);const abort=new AbortController();let calls=0;
    const room=mountPetHouse({container:host,signal:abort.signal,quality:'low',storageAdapter:storage(),onState:()=>calls++});abort.abort();
    const error=await room.ready.then(()=>null,error=>error);assert(error?.code==='ABORTED','取消未拒绝 ready');const before=calls;await tick();
    assert(host.childElementCount===0,'取消后 UI 仍存在');assert(calls===before,'取消后仍有宿主回调');host.remove();
  });
  await check('桌面上的320px窄容器与隐藏后显示均正常',async()=>{
    const host=document.getElementById('small');host.style.display='none';const room=mountPetHouse({container:host,quality:'low',initialPoints:1000,storageAdapter:storage()});await room.ready;
    host.style.display='block';await tick();document.querySelector('#small .room-shop__trigger').click();await tick();
    const rect=document.querySelector('#small .room-shop__sheet').getBoundingClientRect(),outer=host.getBoundingClientRect();
    assert(rect.width>240&&rect.left>=outer.left-1&&rect.right<=outer.right+1,'商店溢出窄容器');room.dispose();host.style.display='none';
  });
  await check('相对 assetsBaseUrl 在子目录部署中能加载3个模型',async()=>{
    const host=document.createElement('div');host.style.height='320px';document.body.append(host);
    const room=mountPetHouse({container:host,quality:'low',panels:false,assetsBaseUrl:'./resources/',storageAdapter:storage()});
    try{await room.ready;assert(room.api.getState().ready,'相对资源路径未就绪');}finally{room.dispose();host.remove();}
  });
  await check('assetUrls覆盖与手动样式模式可用于原生宿主',async()=>{
    const host=document.createElement('div');host.style.height='320px';document.body.append(host);const urls=Object.fromEntries(['sofa','table','lamp'].map(name=>[name,new URL(`./resources/optimized/${name}.glb`,location.href).href]));const count=document.querySelectorAll('link[data-pet-house-style]').length;
    const room=mountPetHouse({container:host,quality:'low',panels:false,styles:false,assetUrls:urls,storageAdapter:null});try{await room.ready;assert(document.querySelectorAll('link[data-pet-house-style]').length===count,'手动样式模式仍插入共享链接');assert(room.api.getState().ready,'资源覆盖未就绪');}finally{room.dispose();host.remove();}
  });
  await check('uni-app H5条件编译适配器透传配置、事件和API',async()=>{
    const host=document.createElement('div');host.style.height='320px';document.body.append(host);const component=ref(null);let ready=null,states=0;
    const app=createApp({setup:()=>()=>h(UniH5,{ref:component,storageKey:'uni-h5-check',storageAdapter:null,initialPoints:1250,quality:'low',panels:false,controls:false,onReady:api=>ready=api,onState:()=>states++})});app.mount(host);
    try{await until(()=>ready?.getState().ready,'uni-app H5挂载失败');assert(component.value.getApi()===ready&&ready.getShop().balance===1250,'Uni适配器API/初始化配置未透传');assert(!host.querySelector('.room-shop')&&!host.querySelector('[data-room-control="decorate"]'),'panels/controls配置未透传');assert(states>0,'状态事件未透传');assert(!host.textContent.includes('请使用 web-view'),'H5产物包含原生平台回退分支');}finally{app.unmount();host.remove();}
  });
  await check('Custom Element / Shadow DOM宿主样式与弹窗生命周期隔离',async()=>{
    const tag='framework-pet-room-check';if(!customElements.get(tag))customElements.define(tag,class extends HTMLElement{
      connectedCallback(){const scope=this.attachShadow({mode:'open'}),host=document.createElement('div');host.style.height='320px';scope.append(host);this.room=mountPetHouse({container:host,storageAdapter:null,quality:'low'});}
      disconnectedCallback(){this.room?.dispose();}
    });
    const element=document.createElement(tag);document.body.append(element);try{await element.room.ready;const root=element.shadowRoot.querySelector('.pet-room-view');assert(getComputedStyle(root).position==='relative','Shadow DOM内部没有加载样式');root.querySelector('.room-shop__trigger').click();await tick();assert(element.room.api.getState().metrics.presentationPaused,'Shadow DOM商店未暂停画布');}finally{const old=element.room.api;element.remove();assert(old.getState().lifecycle==='disposed','Custom Element移除未卸载');}
  });
  await check('iframe/WebView 页面：限定来源的桥接能查询与兑换宠物',async()=>{
    const frame=document.createElement('iframe');document.getElementById('frame-host').append(frame);let ready=false,count=0;const pending=new Map();
    const listener=event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin)return;const data=event.data;if(data?.event==='ready')ready=true;const task=pending.get(data?.requestId);if(task){pending.delete(data.requestId);task(data);}};
    addEventListener('message',listener);frame.src='./iframe.html';
    const send=(command,params={})=>new Promise((resolve,reject)=>{const requestId='host-'+ ++count;const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('桥接响应超时'));},8000);pending.set(requestId,result=>{clearTimeout(timer);resolve(result);});frame.contentWindow.postMessage({protocolVersion:1,type:'command',roomId:'iframe-test',requestId,command,params},location.origin);});
    try{await until(()=>ready,'iframe 未就绪');const bought=await send('purchasePet',{sku:'mint-cat'});assert(bought.ok&&bought.result.ok,'iframe兑换失败');const query=await send('getShop');assert(query.result.balance===600&&query.result.pets.active==='mint-cat','iframe账本或宠物错误');const invalid=await send('purchasePet',{sku:'mint-cat',price:0});assert(invalid.error?.code==='INVALID_PARAMS','桥接未拒绝非法参数');
      const sibling=document.createElement('iframe');sibling.hidden=true;document.body.append(sibling);try{sibling.contentWindow.eval('window.attack=(target,origin,data)=>target.postMessage(data,origin)');sibling.contentWindow.attack(frame.contentWindow,location.origin,{protocolVersion:1,type:'command',roomId:'iframe-test',requestId:'foreign-frame-request',command:'creditLearning',params:{eventId:'foreign-frame-event',learned:1}});await new Promise(resolve=>setTimeout(resolve,180));const after=await send('getShop');assert(after.result.balance===600,'相同来源域名的未授权兄弟窗口修改了账户');}finally{sibling.remove();}
    }
    finally{removeEventListener('message',listener);frame.remove();}
  });
  await check('全部卸载后，场景、共享样式、工具提示均清空且无未处理异常',async()=>{
    reactRoot?.unmount();reactRoot=null;vueApp?.unmount();vueApp=null;if(svelteComponent)await unmountSvelte(svelteComponent);svelteComponent=null;await tick();
    assert(document.querySelectorAll('.pet-room-view').length===0,'场景未清空');assert(document.querySelectorAll('link[data-pet-house-style]').length===0,'共享样式未释放');assert(document.querySelectorAll('.pet-room-hint').length===0,'工具提示遗留');assert(errors.length===0,errors.join('; '));
  });
  summary.textContent=`验证完成：${all.length} 项通过 / ${failures.length} 项失败`;summary.dataset.result=failures.length?'fail':'pass';
  button.textContent='验证完成';
});
