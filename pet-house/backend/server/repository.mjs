import {projectArchive} from './projection.mjs';
import {stableEntries} from './validation.mjs';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function createSaveRepository(pool,validate,{sourceRoot}={}){
  return {
    async load(namespace,{connection=pool}={}){const [rows]=await connection.execute('SELECT revision, extras FROM sys_save_slots WHERE namespace=?',[namespace]);if(!rows.length)return {ok:true,revision:0,entries:null};return {ok:true,revision:Number(rows[0].revision),entries:parse(rows[0].extras)?.entries||null};},
    async save(namespace,baseRevision,entries){
      if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new Error('存档版本号无效');
      const valid=validate(namespace,entries),conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        // A real row lock also serializes concurrent first-time saves of one namespace.
        await conn.execute('INSERT INTO sys_save_slots(namespace,revision,archive,extras,archive_sha256) VALUES(?,0,?,?,?) ON DUPLICATE KEY UPDATE namespace=namespace',[namespace,JSON.stringify(valid.archive),JSON.stringify({entries:null}),valid.sha256]);
        const [rows]=await conn.execute('SELECT revision,extras FROM sys_save_slots WHERE namespace=? FOR UPDATE',[namespace]);const current=rows[0],revision=Number(current.revision),previous=parse(current.extras)?.entries;
        if(previous&&stableEntries(previous)===stableEntries(entries)){await conn.rollback();return {ok:true,revision,unchanged:true};}
        if(revision!==baseRevision){await conn.rollback();return {ok:false,code:'SAVE_CONFLICT',revision,message:'另一窗口已更新数据库，本机改动已保留，请先处理冲突'};}
        const next=revision+1;
        await conn.execute('UPDATE sys_save_slots SET revision=?,archive=?,extras=?,archive_sha256=? WHERE namespace=?',[next,JSON.stringify(valid.archive),JSON.stringify({entries}),valid.sha256,namespace]);
        await projectArchive(conn,namespace,valid.archive,{sourceRoot,entries:valid.entries});
        await conn.commit();return {ok:true,revision:next};
      }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    },
  };
}
