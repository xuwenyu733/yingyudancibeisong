import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
import {seedCatalog} from './projection.mjs';
export async function initializeDatabase({env=process.env,connect=mysql.createConnection,applicationConfigFile=fileURLToPath(new URL('../app.local.json',import.meta.url))}={}){
  const config=await loadConfig({env,admin:true}),options=connectionOptions(config);delete options.database;
  const target=resolve(applicationConfigFile);let app;
  // A malformed existing runtime config is an error, never permission to create
  // a replacement account or overwrite the user's current connection details.
  try{await access(target);app=await loadConfig({env,configFile:target});if(!/^pet_room_app(?:_|$)/.test(app.user))throw new Error('app.local.json 必须使用独立的 pet_room_app 应用账户');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const conn=await connect({...options,multipleStatements:true});
  try{
    await conn.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
    await seedCatalog(conn,{sourceRoot:config.sourceRoot});
    if(!app){
      let user='pet_room_app';const [exists]=await conn.query("SELECT User FROM mysql.user WHERE User=? AND Host='localhost'",[user]);if(exists.length)user+='_'+randomBytes(6).toString('hex');
      let password=randomBytes(30).toString('base64url');
      if(env.PET_ROOM_MYSQL_PASSWORD_FILE)password=(await readFile(resolve(dirname(target),env.PET_ROOM_MYSQL_PASSWORD_FILE),'utf8')).replace(/\r?\n$/,'');
      if(Object.hasOwn(env,'PET_ROOM_MYSQL_PASSWORD'))password=env.PET_ROOM_MYSQL_PASSWORD;
      if(typeof password!=='string'||!password.length)throw new Error('应用账户口令不能为空，请检查 PET_ROOM_MYSQL_PASSWORD 或口令文件');
      app={host:'127.0.0.1',port:config.port||3306,user,password,database:'pet_room',sourceRoot:relative(dirname(target),config.sourceRoot),httpPort:config.httpPort||8899,socialEnabled:true,designCodesEnabled:true};
      await conn.query('CREATE USER ?@? IDENTIFIED BY ?',[user,'localhost',password]);
      await conn.query('GRANT SELECT, INSERT, UPDATE, DELETE ON pet_room.* TO ?@?',[user,'localhost']);
      // Runtime-only credentials. This file must be excluded from shared ZIPs.
      await writeFile(target,JSON.stringify(app,null,2)+'\n',{mode:0o600,flag:'wx'});
    }
    const runtime=await loadConfig({env,configFile:target});
    const check=await connect(connectionOptions(runtime));try{await check.query('SELECT COUNT(*) FROM cfg_items');}finally{await check.end();}
    const [tables]=await conn.query("SELECT TABLE_TYPE,COUNT(*) total FROM information_schema.TABLES WHERE TABLE_SCHEMA='pet_room' GROUP BY TABLE_TYPE");
    return {ok:true,database:'pet_room',account:app.user,objects:tables,config:target};
  }finally{await conn.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await initializeDatabase(),null,2));}
  catch(error){console.error(error.code?.startsWith('ER_')?'数据库初始化未完成（'+error.code+'），请检查管理员账户及权限':error.message);process.exitCode=1;}
}
