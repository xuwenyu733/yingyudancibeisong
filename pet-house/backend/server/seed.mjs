import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
import {seedCatalog} from './projection.mjs';
const config=await loadConfig(),connection=await mysql.createConnection(connectionOptions(config));
try{await seedCatalog(connection,{sourceRoot:config.sourceRoot});console.log('商品与徽章目录已就绪');}finally{await connection.end();}
