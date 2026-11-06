import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
export async function migrateDesigns({env=process.env,connect=mysql.createConnection}={}){
 const config=await loadConfig({env,admin:true}),connection=await connect({...connectionOptions(config),multipleStatements:true});
 try{const [rows]=await connection.query('SELECT DATABASE() database_name');if(rows[0]?.database_name!=='pet_room')throw new Error('只允许升级 pet_room');await connection.query(await readFile(new URL('../migrations/1.4.0-design-codes.sql',import.meta.url),'utf8'));return {ok:true,database:'pet_room',version:'1.4.0'};}finally{await connection.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await migrateDesigns()));}catch(error){console.error(error.code?'装修码升级失败：'+error.code:error.message);process.exitCode=1;}}
