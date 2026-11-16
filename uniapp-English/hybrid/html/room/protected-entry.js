import {createEconomyClient} from './economy-client.mjs';
import {applyPendingCredits as applyHostCredits,notifyHost as sendHostEvent} from './host-credits.mjs';
import {startDemo} from './demo-app.js';
import {connectRoomAccess} from './room-access.mjs';
import {openDatabaseStorage} from './database-sync.mjs';
import {createSocialClient} from './social-client.mjs';
import {createFriendsPanel} from './social-ui.js';
import {createVisitorPanel} from './visitor-ui.js';
import {createRoomLandscape} from './room-landscape.mjs?v=2.42.0';
import {createLifeClient} from './life-client.mjs';
import {createLifePanel} from './life-ui.js';
import {showDatabaseBackups} from './database-recovery-ui.js';

export async function startProtectedHouse({embedded=new URLSearchParams(location.search).get('host')==='1',applyPendingCredits=applyHostCredits,notifyHost=sendHostEvent}={}){
 let access=null,transport=null,started=false,bootReady=false,mountRoom=async()=>{},roomController=null,lifePanel=null,visitors=null;
 const params=new URLSearchParams(location.search),apiBase=embedded?(params.get('roomApi')||location.origin):location.origin;
 const exit=()=>{landscape.dispose();if(embedded){notifyHost?.('room-access-exit',{});}else{const text=document.createElement('p');text.textContent='请返回学习页面，下一次从学习账号重新打开仓鼠屋。';document.getElementById('app')?.append(text);}};
 const landscape=createRoomLandscape({allowPortrait:true,onExit:exit,onChange:()=>{if(!access)return;void access.refreshActivity().then(()=>{if(bootReady&&!started)void mountRoom();});}});
 function showStatus(value){let badge=document.getElementById('database-sync-status');if(!badge){badge=document.createElement('output');badge.id='database-sync-status';badge.className='social-sync-status';badge.setAttribute('role','status');document.body.append(badge);}badge.replaceChildren();badge.append(document.createTextNode(({synced:'装修已保存',pending:'正在保存装修',offline:'网络中断，装修已保留在本机',conflict:'发现不同版本的存档'})[value.state]||value.message));if(value.state==='conflict'){const retry=document.createElement('button');retry.type='button';retry.textContent='重新进入并检查';retry.onclick=()=>location.reload();badge.append(retry);}badge.dataset.state=value.state;}
 try{
  access=await connectRoomAccess({apiBase,isActive:()=>!landscape.blocked});
  const capabilities=await access.fetcher('/api/v1/status').then(r=>r.ok?r.json():{}).catch(()=>({}));
  async function request(path,data){const res=await access.fetcher('/api/v1/designs/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const value=await res.json();if(!res.ok||!value.ok)throw value;return value;}
  const client=createSocialClient({fetcher:access.fetcher});await client.enter();
  visitors=createVisitorPanel({client,getApi:()=>roomController?.api});
  const friends=createFriendsPanel({client,beforeOpen:()=>{if(lifePanel?.opened)lifePanel.close();return !lifePanel?.opened;},beforeInvite:async()=>{if(window.HamsterRoom?.getState().decoration||window.HamsterRoom?.hasUnsavedDrawing?.())throw new Error('先完成装修和保存手绘，再邀请朋友来参观吧');const saved=await transport?.flush();if(!saved?.ok)throw new Error('请等待装修同步完成后再邀请');},onVisiting:value=>{visitors.setAway(value);window.HamsterRoom?.setPresentationPaused?.(value);}});
  const economyService=createEconomyClient({fetcher:access.fetcher,getRoom:()=>roomController,getTransport:()=>transport});
  const life=createLifeClient({fetcher:access.fetcher,getRoom:()=>roomController,getTransport:()=>transport});
  lifePanel=createLifePanel({client:life,getApi:()=>roomController?.api,onWarehouse:()=>document.querySelector('.pet-room-view .room-shop__storage-trigger')?.click(),onInvite:()=>friends.open('friends'),onDesign:async code=>{const opened=await roomController?.api.openDesignPanel('copy');if(!opened?.ok)return;const input=document.querySelector('.design-overlay input[aria-label="4位装修码"]');if(input){input.value=code;for(const button of document.querySelectorAll('.design-overlay button'))if(button.textContent==='查看装修')button.click();}}});
  const designs={publish:async roomId=>{const saved=await transport?.flush();if(!saved?.ok)throw new Error('请先同步装修再发布');return request('publish',{roomId});},get:code=>request(code)};
  async function mount(){
   if(started||!access?.allowed||landscape.blocked)return;started=true;
   startDemo({onlineAccount:access.identity.accountKey,demo:false,initialPoints:0,pointsLabel:'学习积分',designService:designs,economyService,
    extraApi:{openSyncBackups:()=>showDatabaseBackups({storageKey:access.identity.accountKey,getApi:()=>roomController?.api,flush:()=>transport.flush(),beforeRestore:()=>transport.verifyCurrent()}),getAvailableAgeModes:()=>capabilities.juniorStyle?['kindergarten','primary','junior']:['kindergarten','primary'],getSocialIdentity:()=>client.identity,openFriends:()=>friends.open(),inviteFriends:()=>friends.open('friends'),openLife:tab=>lifePanel.open(tab),getLifeState:()=>life.data,returnToLearning:exit,enterRoomLandscape:()=>landscape.enter()},
    openStorage:async({storageKey,storage})=>{transport=await openDatabaseStorage({storageKey,storage,onStatus:showStatus,fetcher:access.fetcher});return transport;},
    onReady:async room=>{roomController=room;access.attach(room);const profile=room.api.getProfile?.();if(profile?.ok&&!profile.profile.name)await room.api.setProfileName(access.identity.name);await transport?.flush();const visit=await economyService.execute({type:'visit'});if(!visit.ok)throw Object.assign(new Error(visit.message),{code:visit.code,recovery:visit.recovery});if(embedded&&applyPendingCredits){const summary=await applyPendingCredits(room.api);notifyHost?.('host-credits-applied',summary);}await transport?.flush();},
    onGameEvent:async(type,api)=>{if(type==='profile-change'){const name=api?.getProfile?.().profile?.name?.slice(0,20);if(name&&name!==client.identity.name)try{await client.post('name',{name});}catch{}}},
   });
  }
  mountRoom=mount;bootReady=true;if(access.allowed)await mount();
  window.addEventListener('pagehide',event=>{if(!event.persisted){visitors.dispose();friends.dispose?.();lifePanel?.dispose();access.dispose();landscape.dispose();}},{once:true});
 }catch(error){
  visitors?.dispose();
  access?.dispose();landscape.dispose();const app=document.getElementById('app');app.replaceChildren();const box=document.createElement('section');box.className='room-entry-message';const title=document.createElement('h1');title.textContent='从学习页面打开仓鼠屋';const text=document.createElement('p');text.textContent=error.message||'暂时无法连接小屋，请稍后再试';const hint=document.createElement('p');hint.textContent='小屋需要联网核验孩子身份，已有装修会保留。';const retry=document.createElement('button');retry.textContent='重新连接';retry.onclick=()=>location.reload();box.append(title,text,hint,retry);if(embedded){const back=document.createElement('button');back.textContent='返回学习';back.onclick=exit;box.append(back);}app.append(box);
 }
}
