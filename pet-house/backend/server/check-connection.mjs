import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
let connection;
try{
  const config=await loadConfig();connection=await mysql.createConnection({...connectionOptions(config),connectTimeout:5000});
  await connection.query('SELECT 1');
  const [rows]=await connection.execute('SELECT TABLE_TYPE type,COUNT(*) count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() GROUP BY TABLE_TYPE');
  console.log(JSON.stringify({ok:true,database:config.database,objects:rows,readOnly:true}));
}catch(error){console.error(error.code?'数据库连接检查失败：'+error.code:error.message);process.exitCode=1;}
finally{await connection?.end();}
