import {startDemo} from './demo-app.js';
import {openDatabaseStorage} from './database-sync.mjs';
import {createSocialClient} from './social-client.mjs';
import {createFriendsPanel} from './social-ui.js';
import {resolveDirectHome,rememberDirectHome,carryLocalHouse} from './direct-home.mjs';

const client=createSocialClient(),storage=(()=>{try{return localStorage;}catch{return null;}})(),localKey=resolveDirectHome(storage);
let transport=null;
function showStatus(value){let badge=document.getElementById('database-sync-status');if(!badge){badge=document.createElement('output');badge.id='database-sync-status';badge.className='social-sync-status';badge.setAttribute('role','status');document.body.append(badge);}badge.textContent=value.message;badge.dataset.state=value.state;}
function localHouse(){
 const trigger=document.createElement('button');trigger.type='button';trigger.className='social-trigger';trigger.textContent='朋友';trigger.setAttribute('aria-label','打开朋友');trigger.onclick=()=>showStatus({state:'offline',message:'朋友连接暂时不可用；联网后刷新即可继续。小屋已保存在此浏览器。'});document.body.append(trigger);
 startDemo({directHomeKey:localKey,extraApi:{getSocialIdentity:()=>null,openFriends:()=>trigger.click()},onReady:()=>showStatus({state:'local',message:'小屋自动保存在此浏览器 · 联网后刷新可使用朋友功能'})});
}
async function designRequest(path,body){
 const response=await fetch('/api/v1/designs/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok||!result.ok)throw result;return result;
}
const designService={publish:async roomId=>{const synced=await transport?.flush();if(!synced?.ok)throw new Error('当前装修尚未同步，请连接恢复后再生成装修码');return designRequest('publish',{roomId});},get:code=>designRequest(code)};
function onlineHouse(identity){
 try{carryLocalHouse(storage,localKey,identity.accountKey);}catch{localHouse();return;}
 rememberDirectHome(storage,identity.accountKey);
 const params=new URLSearchParams(location.search);for(const key of ['account','preview','legacy'])params.delete(key);history.replaceState(null,'',location.pathname+'?'+params);
 const panel=createFriendsPanel({client,beforeInvite:async()=>{const result=await transport?.flush();if(result?.ok===false)throw new Error('小屋尚未同步，请连接恢复后再邀请参观');},onVisiting:visiting=>window.HamsterRoom?.setPresentationPaused?.(visiting)});
 startDemo({onlineAccount:identity.accountKey,designService,extraApi:{getSocialIdentity:()=>client.identity,openFriends:()=>panel.open()},
  openStorage:async({storageKey,storage})=>{if(storageKey!==identity.accountKey)throw new Error('小屋存档编号不一致');transport=await openDatabaseStorage({storageKey,storage,onStatus:showStatus,fetcher:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(options.method==='PUT'?20000:4000)})});return transport;},
  onGameEvent:async(type,api)=>{if(type==='profile-change'){const name=api?.getProfile?.().profile?.name?.slice(0,20);if(name&&name!==client.identity.name)try{await client.post('name',{name});}catch{}}},
  onReady:async room=>{const profile=room.api.getProfile?.();if(profile?.ok){if(!profile.profile.name)await room.api.setProfileName(identity.name);else if(profile.profile.name!==identity.name)try{await client.post('name',{name:profile.profile.name.slice(0,20)});}catch{}}},
 });
}
try{
 const enter=()=>client.enter({signal:AbortSignal.timeout(2500)});
 const result=navigator.locks?.request?await navigator.locks.request('pet-room-direct-entry',{signal:AbortSignal.timeout(4000)},enter):await enter();
 onlineHouse(result.identity);
}catch{localHouse();}
