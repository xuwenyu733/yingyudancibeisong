import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';

export async function migrateFriendlyViews({env=process.env,connect=mysql.createConnection}={}){
  const config=await loadConfig({env,admin:true});
  const connection=await connect({...connectionOptions(config),multipleStatements:true});
  try{
    const [selected]=await connection.query('SELECT DATABASE() AS database_name');
    if(selected[0]?.database_name!=='pet_room')throw new Error('只允许为 pet_room 创建中文查询入口');
    const [tables]=await connection.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='room_world_saves'");
    if(!tables.length)throw new Error('请先完成楼层存档数据库升级，再安装中文入口');
    await connection.query(await readFile(new URL('../migrations/1.2.0-friendly-views.sql',import.meta.url),'utf8'));
    const [views]=await connection.execute("SELECT TABLE_NAME,IS_UPDATABLE,SECURITY_TYPE FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND LEFT(TABLE_NAME,3)='新手_' ORDER BY TABLE_NAME");
    const required=views.filter(view=>/^新手_0[0-8]_/.test(view.TABLE_NAME));
    if(required.length!==9||required.some(view=>view.IS_UPDATABLE!=='NO'||view.SECURITY_TYPE!=='INVOKER'))throw new Error('中文只读入口的结构检查未通过');
    return {ok:true,database:'pet_room',version:'1.2.0',readOnlyViews:required.length};
  }finally{await connection.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await migrateFriendlyViews(),null,2));}
  catch(error){console.error(error.code?'中文入口升级失败：'+error.code:error.message);process.exitCode=1;}
}
