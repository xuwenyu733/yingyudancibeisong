import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
import {projectRoomWorldSaves} from './projection.mjs';

// Only this explicitly invoked administrator entry point runs the incremental
// migration. Starting the application never performs DDL or rewrites saves.
export async function migrateRoomWorlds({env=process.env,connect=mysql.createConnection}={}){
  const config=await loadConfig({env,admin:true});
  const conn=await connect({...connectionOptions(config),multipleStatements:true});
  try{
    const [selected]=await conn.query('SELECT DATABASE() AS database_name');
    if(selected[0]?.database_name!=='pet_room')throw new Error('迁移只允许当前已选中的 pet_room 数据库');
    await conn.query(await readFile(new URL('../migrations/1.1.0-room-worlds.sql',import.meta.url),'utf8'));
    const {createEstateStore}=await import(pathToFileURL(resolve(config.sourceRoot,'estate-state.mjs')).href);
    let accounts=0,rooms=0;
    await conn.beginTransaction();
    try{
      // Lock source save rows against concurrent uploads. Only the new readable
      // table is rebuilt; original archives, revisions and all other tables stay
      // byte-for-byte unchanged. A failure rolls the complete backfill back.
      const [slots]=await conn.execute('SELECT namespace,archive,extras FROM sys_save_slots ORDER BY namespace FOR UPDATE');
      for(const slot of slots){
        const verifier=createEstateStore({storageAdapter:null,storageKey:slot.namespace});
        const accepted=verifier.importArchive(typeof slot.archive==='string'?JSON.parse(slot.archive):slot.archive);
        if(!accepted.ok)throw new Error('存档 '+slot.namespace+' 未通过校验，回填已回滚：'+accepted.message);
        const result=verifier.exportArchive();if(!result.ok)throw new Error('存档 '+slot.namespace+' 无法规范化，回填已回滚');
        await conn.execute('DELETE FROM room_world_saves WHERE account_key=?',[slot.namespace]);
        const extras=typeof slot.extras==='string'?JSON.parse(slot.extras):slot.extras;
        for(const room of result.archive.estate.rooms){await projectRoomWorldSaves(conn,slot.namespace,room,{sourceRoot:config.sourceRoot,legacyLayout:extras?.entries?.[slot.namespace]});rooms++;}
        accounts++;
      }
      await conn.commit();
    }catch(error){await conn.rollback();throw error;}
    const [rows]=await conn.query("SELECT version FROM sys_schema_migrations WHERE version='1.1.0'");
    if(!rows.length)throw new Error('世界存档迁移版本未登记，请检查执行结果');
    return {ok:true,database:'pet_room',version:'1.1.0',addedTable:'room_world_saves',existingSaves:'preserved',backfilledAccounts:accounts,backfilledRooms:rooms};
  }finally{await conn.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await migrateRoomWorlds(),null,2));}
  catch(error){console.error(error.code?.startsWith('ER_')?'世界存档迁移未完成（'+error.code+'），请先备份并检查管理员权限':error.message);process.exitCode=1;}
}
