const params=new URLSearchParams(location.search);
const enabled=params.get('storage')!=='local';
const status=await fetch('/api/v1/status',{cache:'no-store',signal:AbortSignal.timeout(1500)}).then(response=>response.ok?response.json():null).catch(()=>null);
if(status?.roomAccess){
  // An older active worker can still serve cached dependencies on the first online visit after an upgrade.
  const release=new URL(import.meta.url).searchParams.get('v')?.replaceAll('.','');
  if(release&&navigator.serviceWorker?.controller&&globalThis.caches){
    try{
      const names=await caches.keys();
      await Promise.all(names.filter(name=>name.startsWith('pet-room-v')&&!name.startsWith(`pet-room-v${release}-`)).map(name=>caches.delete(name)));
    }catch{/* The browser may restrict Cache Storage in an embedded frame. */}
  }
  const {startProtectedHouse}=await import('./protected-entry.js?v=2.42.0');await startProtectedHouse();
}else if(!status){
  const message=document.createElement('p');message.className='room-entry-message';message.textContent='无法核验仓鼠屋可用时间，请联网后从学习页面重新打开。';document.getElementById('app').append(message);
}else if(enabled&&status?.social!==false){
  await import('./online-entry.js');
}else{
const [{startDemo},{openDatabaseStorage}]=await Promise.all([import('./demo-app.js'),import('./database-sync.mjs')]);
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
