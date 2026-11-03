import {startDemo} from './demo-app.js';
import {openDatabaseStorage} from './database-sync.mjs';

const params=new URLSearchParams(location.search);
const enabled=params.get('storage')!=='local';
const status=enabled?await fetch('/api/v1/status',{cache:'no-store',signal:AbortSignal.timeout(1500)}).then(response=>response.ok?response.json():null).catch(()=>null):null;
if(enabled&&status?.social!==false){
  await import('./online-entry.js');
}else{
let badge;
function showStatus(value){
  if(!badge){
    badge=document.createElement('output');badge.id='database-sync-status';badge.setAttribute('role','status');
    badge.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:1100;font:12px/1.4 system-ui;background:#fff9e9ed;color:#436753;padding:5px 12px;border-radius:12px;max-width:70%;pointer-events:none';document.body.append(badge);
  }
  badge.textContent=value.message;badge.dataset.state=value.state;
}
// Explicit legacy links retain their original namespace. New sessions use the
// same account/guest gate as the current standalone release.
const legacy=params.get('preview');
const legacyStorageKey=params.get('legacy')==='default'?'hamster-room-layout-v3':legacy==='qa'?'original-pet-room-qa-v3':legacy==='estate'?'original-pet-room-estate-qa-v1':legacy==='single'?'hamster-room-layout-v3':undefined;
startDemo({
  ...(enabled?{openStorage:({storageKey,storage})=>openDatabaseStorage({storageKey,storage,onStatus:showStatus})}:{}),
  legacyLinks:[
    {label:'继续旧版默认小屋',href:'/?legacy=default&storage='+ (enabled?'mysql':'local')},
    {label:'继续旧版体验小屋',href:'/?preview=qa&storage='+ (enabled?'mysql':'local')},
    {label:'继续旧版多房间小屋',href:'/?preview=estate&storage='+ (enabled?'mysql':'local')},
  ],
  ...(legacyStorageKey?{legacyStorageKey}:{}),
});
}
