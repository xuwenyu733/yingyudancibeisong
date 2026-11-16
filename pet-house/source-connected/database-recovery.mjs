/** Recovery copies live outside account namespaces and are never uploaded as active saves. */
const prefix=key=>'pet-room-recovery-v1:'+encodeURIComponent(key)+':';
export function saveDatabaseRecovery({storageKey,storage,local,remote,metadata}){
 const backup={format:'pet-room-database-recovery',version:1,storageKey,createdAt:new Date().toISOString(),local:{entries:local,metadata},remote};
 const key=prefix(storageKey)+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),raw=JSON.stringify(backup);
 try{storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw new Error('Backup readback failed');}
 catch{const error=new Error('本机空间不足或无法写入备份，已停止恢复，两份原存档都未覆盖。请先下载备份。');error.code='SYNC_BACKUP_FAILED';throw error;}
 return {...backup,backupKey:key};
}
export function listDatabaseRecoveries({storageKey,storage}){
 const backups=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix(storageKey)))continue;
  try{const value=JSON.parse(storage.getItem(key));if(value.format==='pet-room-database-recovery'&&value.version===1&&value.storageKey===storageKey)backups.push({...value,backupKey:key});}catch{/* Leave unreadable copies untouched. */}
 }return backups.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
