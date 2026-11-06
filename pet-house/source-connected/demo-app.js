import {mountPetHouse} from './pet-house.js';
import {mountPetEstate} from './estate-house.js';
import {grantDemoTestPoints} from './demo-points.mjs';
import {resolveDirectHome} from './direct-home.mjs';
import {loginAccount,readSession,readAccounts} from './account-session.mjs';
import {exportAccountTransfer} from './account-migration.mjs';

/** Shared standalone entry: an optional transport wraps each account separately. */
export function startDemo({openStorage,legacyStorageKey,legacyLinks=[],onlineAccount,directHomeKey,extraApi={},designService,onReady,onGameEvent}={}){
  const params=new URLSearchParams(location.search),app=document.getElementById('app');
  const storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})();
  let room=null,transport=null,alias=null,generation=0;
  function disposeRoom(){
    room?.dispose();room=null;
    if(alias&&window.HamsterRoom===alias)delete window.HamsterRoom;
    alias=null;
  }
  async function mount(storageKey){
    const serial=++generation;
    disposeRoom();const previous=transport;transport=null;
    if(previous){try{await previous.flush();}finally{previous.dispose();}}
    if(serial!==generation)return;
    app.replaceChildren();
    const loading=document.createElement('p');loading.textContent='正在打开小屋…';app.append(loading);
    let next=null;
    try{
      next=await openStorage?.({storageKey,storage});
      if(serial!==generation){next?.dispose();return;}
      transport=next;
      const adapter=next?.adapter||storage;
      grantDemoTestPoints({storageKey,storageAdapter:adapter});
      app.replaceChildren();
      const exportTransfer=()=>{
        if(serial!==generation||!room)return null;
        const session=readSession(storage);
        if(session.kind!=='account'||session.id!==storageKey)return null;
        const name=readAccounts(storage).list.find(a=>a.id===session.id)?.name||'小屋主人';
        return exportAccountTransfer({storageAdapter:adapter,storageKey,id:session.id,name});
      };
      const utilities={...extraApi,getAccountId:()=>storageKey,exportTransfer};
      room=(params.get('preview')!=='single'?mountPetEstate:mountPetHouse)({
        container:app,storageKey,storageAdapter:adapter,designService,
        quality:['low','balanced','high'].includes(params.get('quality'))?params.get('quality'):'auto',
        initialPoints:1000,pointsLabel:'体验积分',demo:true,styles:false,
        bridge:{legacyName:'PetRoom',roomId:'pet-room-demo'},
        extendApi:core=>({...core,...utilities}),
        onEvent:type=>{if(serial===generation)void onGameEvent?.(type,room?.api);},
      });
      if(!Object.hasOwn(window,'HamsterRoom')){alias=room.api;window.HamsterRoom=alias;}
      Object.assign(room.api,utilities);
      const active=room;
      await active.ready;
      if(serial===generation)await onReady?.(active);
      if(serial===generation)await next?.flush();
    }catch(error){
      if(serial!==generation)return;
      disposeRoom();next?.dispose();transport=null;app.replaceChildren();
      const message=document.createElement('p');message.textContent=error.message;app.append(message);
      const retry=document.createElement('button');retry.type='button';retry.textContent='重新打开';retry.onclick=()=>void mount(storageKey);app.append(retry);
    }
  }
  window.addEventListener('pagehide',event=>{
    if(event.persisted)return;
    ++generation;disposeRoom();const previous=transport;transport=null;
    if(previous)void previous.flush({keepalive:true}).finally(()=>previous.dispose());
  });
  if(onlineAccount){loginAccount(storage,onlineAccount);void mount(onlineAccount);}
  else if(directHomeKey)void mount(directHomeKey);
  else if(legacyStorageKey)void mount(legacyStorageKey);
  else void mount(resolveDirectHome(storage));
}
