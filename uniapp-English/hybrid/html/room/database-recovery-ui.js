import {listDatabaseRecoveries} from './database-recovery.mjs';
import {saveDatabaseRecovery} from './database-recovery.mjs';
import {recoveryFloors,compareFloor,renderFloorPlan} from './recovery-preview.mjs';
function node(doc,tag,text,parent){const n=doc.createElement(tag);if(text)n.textContent=text;if(tag==='button')n.type='button';parent?.append(n);return n;}
function download(doc,backup){const win=doc.defaultView,url=win.URL.createObjectURL(new win.Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),a=node(doc,'a');a.href=url;a.download='仓鼠屋存档备份-'+backup.createdAt.replace(/[:.]/g,'-')+'.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);}
export function showDatabaseConflict({app,error,onRecovered}){
 const doc=app.ownerDocument,box=node(doc,'section',null,app);box.className='room-entry-message room-sync-recovery';box.setAttribute('role','region');box.setAttribute('aria-label','存档恢复');
 node(doc,'h1','发现两份不同的存档',box);node(doc,'p','本机和数据库保存了不同版本的小屋。你的装修还在，可以先保留两份备份，再继续进入。',box);
 node(doc,'p','继续后使用数据库最新存档。本机版本会单独保留，可在“更多 → 存档备份”中下载。',box);
 const status=node(doc,'output','',box);status.setAttribute('role','status');const enter=node(doc,'button','备份两份存档并进入小屋',box),exportButton=node(doc,'button','仅下载备份，暂不切换',box);
 let busy=false;async function run(action){if(busy)return;busy=true;enter.disabled=exportButton.disabled=true;status.textContent='正在检查并保留存档…';try{await action();}catch(cause){status.textContent=cause.message||'暂时无法恢复，原存档仍保留，请重试。';}finally{busy=false;enter.disabled=exportButton.disabled=false;}}
 enter.addEventListener('click',()=>void run(async()=>{await error.recovery.backupAndLoadRemote();await onRecovered();}));
 exportButton.addEventListener('click',()=>void run(async()=>{download(doc,error.recovery.exportBackup());status.textContent='已导出本机与已读取的数据库副本，当前存档没有切换。';}));
 return box;
}
export function showDatabaseBackups({storageKey,storage=globalThis.localStorage,doc=globalThis.document,getApi=()=>null,flush=async()=>({ok:true}),beforeRestore=flush}){
 if(doc.querySelector('.room-sync-backups'))return;
 const shade=node(doc,'div',null,doc.body);shade.className='room-sync-backups';const panel=node(doc,'section',null,shade);panel.className='room-entry-message';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','存档备份');
 const previous=doc.activeElement;node(doc,'h1','存档备份',panel);node(doc,'p','发生冲突时保留的两份原始存档。下载不会改变当前小屋。',panel);const close=node(doc,'button','关闭备份',panel),events=new doc.defaultView.AbortController(),signal=events.signal;
 const finish=()=>{if(busy)return;events.abort();shade.remove();previous?.focus?.({preventScroll:true});};close.addEventListener('click',finish,{signal});
 const list=node(doc,'div',null,panel);list.className='room-sync-backup-list';
 let busy=false;const result=node(doc,'output','',panel);result.setAttribute('role','status');
 function preview(backup,parent){
  const grid=node(doc,'div',null,parent);grid.className='recovery-versions';
  for(const side of ['local','remote']){const column=node(doc,'section',null,grid);node(doc,'h3',side==='local'?'本机装修':'数据库装修',column);
   try{for(const floor of recoveryFloors(backup,side)){
    const card=node(doc,'article',null,column);node(doc,'strong',floor.id.replace('room-','第 ')+' 层 · '+floor.name,card);node(doc,'small','楼层保存时间：'+new Date(floor.updatedAt).toLocaleString('zh-CN'),card);card.append(renderFloorPlan(doc,floor.archive.snapshot));
    const current=getApi()?.exportRoomWorld?.(floor.id),diff=compareFloor(floor.archive.snapshot,current?.archive?.snapshot);
    node(doc,'p',`相对当前：增加 ${diff.added} 件，收起 ${diff.removed} 件，调整 ${diff.moved} 件。`,card);
    const restore=node(doc,'button','恢复这一层…',card);restore.disabled=!current?.ok;
    const confirmation=node(doc,'div',null,card);confirmation.hidden=true;node(doc,'p','只恢复这层装修，当前积分、已拥有物品和宠物保留；其他楼层正在使用的家具仍留在原处。恢复前会再保留一份当前存档。',confirmation);const yes=node(doc,'button','确认恢复这一层',confirmation),no=node(doc,'button','取消',confirmation);
    restore.addEventListener('click',()=>{if(!busy)confirmation.hidden=false;},{signal});no.addEventListener('click',()=>{if(!busy)confirmation.hidden=true;},{signal});
    yes.addEventListener('click',async()=>{if(busy)return;busy=true;close.disabled=true;for(const b of list.querySelectorAll('button'))b.disabled=true;result.textContent='正在检查同步并保留当前装修…';
     try{const synced=await beforeRestore();if(!synced?.ok)throw new Error(synced?.message||'请先恢复网络或处理同步冲突，再恢复装修。');const entries={};for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key===storageKey||key?.startsWith(storageKey+'-')){const value=storage.getItem(key);if(value!==null)entries[key]=value;}}
      saveDatabaseRecovery({storageKey,storage,local:entries,remote:{revision:synced.revision??0,entries},metadata:{reason:'before-floor-restore'}});
      const restored=await getApi()?.importRoomWorld?.(floor.id,floor.archive);if(!restored?.ok)throw new Error(restored?.message||'请先完成装修，再恢复楼层');const saved=await flush();result.textContent=saved?.ok?'这一层已恢复并同步，当前积分和宠物保留。':saved?.code==='SYNC_CONFLICT'?'恢复结果已保留在本机；数据库又有更新，请重新进入并检查存档冲突。':'这一层已在本机恢复，等待网络恢复后同步。';confirmation.hidden=true;
     }catch(error){result.textContent=error.message;}finally{busy=false;close.disabled=false;for(const b of list.querySelectorAll('button'))b.disabled=false;}
    },{signal});
   }}catch(error){node(doc,'p',error.message+'；仍可下载原始备份。',column);}
  }
 }
 try{const backups=listDatabaseRecoveries({storageKey,storage});if(!backups.length)node(doc,'p','暂时没有冲突备份。',list);for(const backup of backups){const item=node(doc,'article',null,list);node(doc,'strong',new Date(backup.createdAt).toLocaleString('zh-CN'),item);node(doc,'p','包含本机副本及数据库版本 '+(backup.remote?.revision??'未读取'),item);const button=node(doc,'button','下载这份备份',item);button.addEventListener('click',()=>download(doc,backup),{signal});const details=node(doc,'details',null,item);node(doc,'summary','预览并恢复一层装修',details);let rendered=false;details.addEventListener('toggle',()=>{if(details.open&&!rendered){rendered=true;preview(backup,details);}},{signal});}}catch{node(doc,'p','本机备份暂时无法读取，请检查浏览器存储是否可用。',list);}
 shade.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();finish();}else if(event.key==='Tab'){const items=[...panel.querySelectorAll('button,summary')].filter(n=>!n.disabled&&n.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}},{signal});close.focus({preventScroll:true});
}
