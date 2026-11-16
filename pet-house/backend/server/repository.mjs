import {projectArchive} from './projection.mjs';
import {stableEntries} from './validation.mjs';
import {assertEconomicAuthority} from './economic-guard.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function createSaveRepository(pool,validate,{sourceRoot}={}){
  async function baseline(namespace){const {createEstateStore}=await import(pathToFileURL(resolve(sourceRoot,'estate-state.mjs')).href);return createEstateStore({storageAdapter:null,storageKey:namespace,initialPoints:0}).exportArchive().archive;}
  async function saveWithin(conn,namespace,baseRevision,entries,{trustedAuthority=false,protectAssets=true}={}){
    if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new Error('存档版本号无效');
    const valid=validate(namespace,entries);
    await conn.execute('INSERT INTO sys_save_slots(namespace,revision,archive,extras,archive_sha256) VALUES(?,0,?,?,?) ON DUPLICATE KEY UPDATE namespace=namespace',[namespace,JSON.stringify(valid.archive),JSON.stringify({entries:null}),valid.sha256]);
    const [rows]=await conn.execute('SELECT revision,extras FROM sys_save_slots WHERE namespace=? FOR UPDATE',[namespace]);const current=rows[0],revision=Number(current.revision),previous=parse(current.extras)?.entries;
    if(previous&&stableEntries(previous)===stableEntries(entries))return {ok:true,revision,unchanged:true};
    if(revision!==baseRevision)return {ok:false,code:'SAVE_CONFLICT',revision,message:'另一窗口已更新数据库，本机改动已保留，请先处理冲突'};
    const previousArchive=previous?validate(namespace,previous).archive:null;
    if(protectAssets&&!trustedAuthority)assertEconomicAuthority(previousArchive||await baseline(namespace),valid.archive,{initialProfile:!previous?.[namespace+'-profile-v1']});
    const next=revision+1;
    await conn.execute('UPDATE sys_save_slots SET revision=?,archive=?,extras=?,archive_sha256=? WHERE namespace=?',[next,JSON.stringify(valid.archive),JSON.stringify({entries}),valid.sha256,namespace]);
    await projectArchive(conn,namespace,valid.archive,{sourceRoot,entries:valid.entries,previousArchive,previousEntries:previous});return {ok:true,revision:next};
  }
  return {
    saveWithin,
    async load(namespace,{connection=pool}={}){const [rows]=await connection.execute('SELECT revision, extras FROM sys_save_slots WHERE namespace=?',[namespace]);if(!rows.length)return {ok:true,revision:0,entries:null};return {ok:true,revision:Number(rows[0].revision),entries:parse(rows[0].extras)?.entries||null};},
    async save(namespace,baseRevision,entries,options={}){
      if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new Error('存档版本号无效');
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const result=await saveWithin(conn,namespace,baseRevision,entries,options);
        if(!result.ok||result.unchanged)await conn.rollback();else await conn.commit();
        return result;
      }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    },
  };
}
