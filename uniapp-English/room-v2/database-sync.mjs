/** MySQL transport around the existing synchronous storage contract.
 * The local copy is durable first. Only complete, stable namespace snapshots
 * are uploaded, so a rejected local transaction cannot leak intermediate state.
 */
export async function openDatabaseStorage({storageKey,storage=globalThis.localStorage,fetcher=globalThis.fetch,onStatus=()=>{},win=globalThis}={}){
  if(typeof storageKey!=='string'||!storageKey.trim()||storageKey.length>160)throw new TypeError('数据库存档需要1至160字的独立名称');
  if(!storage||['getItem','setItem','removeItem','key'].some(k=>typeof storage[k]!=='function'))throw new TypeError('数据库同步需要可读写的本地Storage');
  if(typeof fetcher!=='function')throw new TypeError('此环境没有可用的数据库连接通道');
  const metaKey=storageKey+'-mysql-sync-v1',endpoint='/api/v1/save?namespace='+encodeURIComponent(storageKey);
  const owns=key=>typeof key==='string'&&(key===storageKey||key.startsWith(storageKey+'-'))&&key!==metaKey;
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>JSON.stringify(Object.keys(value).sort().map(k=>[k,value[k]]));
  // Change detection only, not an authentication or security hash.
  function fingerprint(value){const text=canonical(value);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n;}return text.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);}
  const same=(a,b)=>canonical(a)===canonical(b);
  let disposed=false,timer=0,retryTimer=0,retryDelay=2000,inflight=null,generation=0,revision=0,pending=false,blocked=false,remoteKnown=false,state='pending';
  function status(next,message){state=next;if(!disposed)try{onStatus({state:next,message,revision});}catch{/* Observers cannot undo an accepted save. */}}
  function error(code,message){const result=new Error(message);result.code=code;return result;}
  function collect(){const out=Object.create(null);for(let i=0;i<storage.length;i++){const key=storage.key(i);if(owns(key)){const raw=storage.getItem(key);if(raw!==null){if(typeof raw!=='string')throw new TypeError('本地存档内容必须为文字');out[key]=raw;}}}return out;}
  function readMeta(){const raw=storage.getItem(metaKey);if(raw===null)return null;let parsed;try{parsed=JSON.parse(raw);}catch{throw error('SYNC_METADATA_INVALID','本机数据库同步记录损坏，原存档仍保留，请先导出备份');}if(!plain(parsed)||parsed.version!==1||!integer(parsed.revision)||typeof parsed.pending!=='boolean'||typeof parsed.fingerprint!=='string'||parsed.upload&&(!plain(parsed.upload)||!integer(parsed.upload.baseRevision)||typeof parsed.upload.fingerprint!=='string'||parsed.upload.fingerprint.length>100))throw error('SYNC_METADATA_INVALID','本机数据库同步记录格式有误，原存档仍保留');return parsed;}
  function putMeta(value){const raw=JSON.stringify(value),result=storage.setItem(metaKey,raw);if(result?.then)throw new TypeError('同步标记需要同步存储');if(storage.getItem(metaKey)!==raw)throw error('SYNC_LOCAL_WRITE_FAILED','本机未能保留同步标记，数据尚未上传');}
  function metadata({pending:dirty=pending,revision:rev=revision,fingerprint:hash=readMeta()?.fingerprint||'',upload=readMeta()?.upload}={}){return {version:1,revision:rev,pending:dirty,fingerprint:hash,...(upload?{upload}:{})};}
  function validateEntries(value){if(!plain(value)||Object.keys(value).length>1000)throw error('SYNC_RESPONSE_INVALID','数据库返回的存档格式有误');const result=Object.create(null);let size=0;for(const [key,raw]of Object.entries(value)){if(!owns(key)||typeof raw!=='string'||(size+=key.length+raw.length)>16*1024*1024)throw error('SYNC_RESPONSE_INVALID','数据库存档超出当前小屋范围或过大');result[key]=raw;}return result;}
  async function getRemote(){const response=await fetcher(endpoint,{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok)throw error('SYNC_NETWORK_FAILED','数据库暂时连不上，本机存档仍然保留');const value=await response.json();if(!plain(value)||value.ok!==true||!integer(value.revision)||value.entries!==null&&!plain(value.entries))throw error('SYNC_RESPONSE_INVALID','数据库返回了无法读取的存档');return {revision:value.revision,entries:value.entries===null?null:validateEntries(value.entries)};}
  function conflict(message='数据库存档已被其他窗口更新，本机修改已保留，请先导出备份再重新打开'){blocked=true;status('conflict',message);return error('SYNC_CONFLICT',message);}
  function hydrate(entries,rev){
    const before=collect(),beforeMeta=storage.getItem(metaKey),touched=[];
    try{
      for(const key of new Set([...Object.keys(before),...Object.keys(entries)])){if(before[key]===entries[key])continue;touched.push(key);const result=Object.hasOwn(entries,key)?storage.setItem(key,entries[key]):storage.removeItem(key);if(result?.then)throw new TypeError('同步载入需要同步存储');if(storage.getItem(key)!==(entries[key]??null))throw new Error('readback mismatch');}
      putMeta({version:1,revision:rev,pending:false,fingerprint:fingerprint(entries)});
    }catch(cause){let failed=false;for(const key of touched.reverse())try{if(Object.hasOwn(before,key))storage.setItem(key,before[key]);else storage.removeItem(key);}catch{failed=true;}try{if(beforeMeta===null)storage.removeItem(metaKey);else storage.setItem(metaKey,beforeMeta);}catch{failed=true;}throw error('SYNC_LOCAL_WRITE_FAILED',failed?'读取数据库失败，且本机副本未能完整还原，请保留备份':'本机空间不足或存储不可用，原存档已保留');}
    revision=rev;pending=false;
  }
  function markPending(){const latest=readMeta();if(latest&&latest.revision>revision)revision=latest.revision;putMeta(metadata({pending:true}));pending=true;generation++;}
  function clearTimers(){if(timer){win.clearTimeout?.(timer);timer=0;}if(retryTimer){win.clearTimeout?.(retryTimer);retryTimer=0;}}
  function schedule(){if(disposed||blocked)return;if(timer)win.clearTimeout?.(timer);timer=win.setTimeout?.(()=>{timer=0;void flush();},500)||0;}
  function retry(){if(disposed||blocked||retryTimer)return;retryTimer=win.setTimeout?.(()=>{retryTimer=0;void flush();},retryDelay)||0;retryDelay=Math.min(30000,retryDelay*2);}
  async function reconcile(remote,before){
    const current=collect(),meta=readMeta(),changedDuringFetch=before&&!same(before,current),localDirty=!!meta?.pending||!!meta?.fingerprint&&meta.fingerprint!==fingerprint(current)||changedDuringFetch;
    remoteKnown=true;
    if(remote.entries!==null&&meta&&remote.revision<meta.revision)throw conflict('数据库返回了较旧版本，已保留本机存档；请检查服务端备份或浏览器缓存后再恢复');
    if(remote.entries===null){revision=remote.revision;pending=Object.keys(current).length>0;putMeta(metadata({pending,fingerprint:pending?'':fingerprint(current)}));status(pending?'pending':'synced',pending?'正在把本机存档保存到数据库':'数据库已连接');return;}
    if(same(current,remote.entries)){revision=remote.revision;pending=false;putMeta(metadata({pending:false,fingerprint:fingerprint(current),upload:null}));status('synced','数据库与本机存档已一致');return;}
    // A response can be lost after MySQL commits. Adopt that acknowledged
    // content as the base only when it matches our durable in-flight marker;
    // later local edits remain pending. Another writer's distinct data conflicts.
    if(meta?.upload&&remote.revision>meta.upload.baseRevision&&fingerprint(remote.entries)===meta.upload.fingerprint){revision=remote.revision;pending=true;putMeta(metadata({pending:true,fingerprint:fingerprint(remote.entries),upload:null}));status('pending','已确认上次保存，正在继续上传新装修');return;}
    if(localDirty){if(!meta||meta.revision!==remote.revision)throw conflict();revision=remote.revision;pending=true;putMeta(metadata({pending:true}));status('pending','本机有尚未上传的修改，正在继续保存');return;}
    if(!meta&&Object.keys(current).length)throw conflict('数据库与本机各有不同存档，已保留本机数据；请先导出备份后选择要恢复的存档');
    hydrate(remote.entries,remote.revision);status('synced','已从数据库载入小屋存档');
  }
  const before=collect(),initialMeta=readMeta();revision=initialMeta?.revision||0;pending=!!initialMeta?.pending;
  try{await reconcile(await getRemote(),before);}catch(cause){if(cause.code==='SYNC_CONFLICT'||cause.code==='SYNC_LOCAL_WRITE_FAILED'||cause.code==='SYNC_METADATA_INVALID')throw cause;remoteKnown=false;pending=pending||Object.keys(collect()).length>0;if(pending)putMeta(metadata({pending:true}));status('offline','数据库暂时连不上，当前修改保存在本机，连接恢复后重试');}
  function assertKey(key){if(!owns(key))throw new TypeError('当前小屋不能访问其他项目的存档');}
  const adapter={
    getItem(key){assertKey(key);return storage.getItem(key);},
    setItem(key,raw){assertKey(key);if(disposed)throw new Error('数据库同步已关闭');if(typeof raw!=='string')throw new TypeError('存档内容必须为文字');if(storage.getItem(key)===raw)return;markPending();const result=storage.setItem(key,raw);if(result?.then)throw new TypeError('小屋需要同步存储适配器');if(storage.getItem(key)!==raw)throw error('SYNC_LOCAL_WRITE_FAILED','本机未能保留这次修改');status(blocked?'conflict':'pending',blocked?'本机修改已保留，数据库存在版本冲突':'已存本机，正在保存到数据库');schedule();},
    removeItem(key){assertKey(key);if(disposed)throw new Error('数据库同步已关闭');if(storage.getItem(key)===null)return;markPending();const result=storage.removeItem(key);if(result?.then)throw new TypeError('小屋需要同步存储适配器');if(storage.getItem(key)!==null)throw error('SYNC_LOCAL_WRITE_FAILED','本机未能移除这条记录');status(blocked?'conflict':'pending','本机修改已保留，正在保存到数据库');schedule();},
    get length(){return Object.keys(collect()).length;},key(index){return Object.keys(collect())[index]??null;},
  };
  async function worker(options){
    while(!disposed&&!blocked){
      const latest=readMeta();if(latest&&latest.revision>revision)revision=latest.revision;pending=!!latest?.pending||pending;
      if(!pending)return {ok:true,revision};
      if(!remoteKnown){const local=collect();try{await reconcile(await getRemote(),local);}catch(cause){if(cause.code==='SYNC_CONFLICT')return {ok:false,code:'SYNC_CONFLICT',message:cause.message};status('offline','数据库暂时连不上，本机存档仍保留，稍后重试');retry();return {ok:false,code:'SYNC_OFFLINE',message:cause.message};}if(!pending)return {ok:true,revision};}
      const entries=collect(),sentGeneration=generation,baseRevision=revision,body=JSON.stringify({baseRevision,entries});
      putMeta(metadata({pending:true,upload:{baseRevision,fingerprint:fingerprint(entries)}}));
      try{
        const response=await fetcher(endpoint,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body,...(options.keepalive?{keepalive:true}:{})});
        if(response.status===409){const cause=conflict();return {ok:false,code:cause.code,message:cause.message};}
        if(!response.ok)throw error('SYNC_NETWORK_FAILED','数据库暂时没能保存');
        const result=await response.json();if(!plain(result)||result.ok!==true||!integer(result.revision)||result.revision<baseRevision||result.revision===baseRevision&&result.unchanged!==true)throw error('SYNC_RESPONSE_INVALID','数据库没有确认本次保存');
        const current=collect(),afterMeta=readMeta();
        if(afterMeta&&afterMeta.revision>result.revision){revision=afterMeta.revision;pending=afterMeta.pending;}
        else{revision=result.revision;pending=sentGeneration!==generation||!same(entries,current);putMeta(metadata({pending,fingerprint:fingerprint(entries),upload:null}));}
        retryDelay=2000;status(pending?'pending':'synced',pending?'数据库已保存，正在继续上传后续修改':'所有修改已保存到本机MySQL数据库');
      }catch(cause){pending=true;remoteKnown=false;status('offline','数据库暂时没能保存，本机修改已保留，连接恢复后重试');retry();return {ok:false,code:'SYNC_OFFLINE',message:cause.message};}
    }
    return {ok:false,code:blocked?'SYNC_CONFLICT':'SYNC_DISPOSED',revision};
  }
  function flush(options={}){if(inflight)return inflight;clearTimers();if(disposed)return Promise.resolve({ok:false,code:'SYNC_DISPOSED'});if(blocked)return Promise.resolve({ok:false,code:'SYNC_CONFLICT'});inflight=worker(options).catch(cause=>{pending=true;status('offline','本机同步记录暂时无法读取，原存档仍保留，请先导出备份');return {ok:false,code:cause.code||'SYNC_LOCAL_WRITE_FAILED',message:cause.message};}).finally(()=>{inflight=null;});return inflight;}
  const online=()=>{if(pending)void flush();};
  const changed=event=>{if(disposed||!owns(event?.key)&&event?.key!==metaKey)return;try{const meta=readMeta();if(meta&&meta.revision>revision)revision=meta.revision;pending=!!meta?.pending;if(pending)schedule();}catch{status('offline','其他窗口的同步记录无法读取，本机数据未覆盖');}};
  const leaving=()=>{if(disposed||blocked||inflight||!pending)return;try{const size=JSON.stringify({baseRevision:revision,entries:collect()}).length;if(size<48000)void flush({keepalive:true});}catch{/* Durable pending marker guarantees retry on the next visit. */}};
  win.addEventListener?.('online',online);win.addEventListener?.('storage',changed);win.addEventListener?.('pagehide',leaving);
  if(pending)schedule();
  return {adapter,flush,get revision(){return revision;},get state(){return state;},get pending(){return pending;},get metadataKey(){return metaKey;},dispose(){if(disposed)return;disposed=true;clearTimers();win.removeEventListener?.('online',online);win.removeEventListener?.('storage',changed);win.removeEventListener?.('pagehide',leaving);}};
}
