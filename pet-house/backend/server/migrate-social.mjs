import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
export async function migrateSocial({env=process.env,connect=mysql.createConnection}={}){
 const config=await loadConfig({env,admin:true}),connection=await connect({...connectionOptions(config),multipleStatements:true});
 try{const [rows]=await connection.query('SELECT DATABASE() AS database_name');if(rows[0]?.database_name!=='pet_room')throw new Error('只允许升级 pet_room');await connection.query(await readFile(new URL('../migrations/1.3.0-social.sql',import.meta.url),'utf8'));await connection.query(await readFile(new URL('../migrations/1.3.1-direct-entry.sql',import.meta.url),'utf8'));return {ok:true,database:'pet_room',version:'1.3.1',newSocialTables:6};}finally{await connection.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await migrateSocial()));}catch(error){console.error(error.code?'好友升级失败：'+error.code:error.message);process.exitCode=1;}
}
