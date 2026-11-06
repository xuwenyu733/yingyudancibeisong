import {createDesignService} from './design-service.mjs';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
import {createValidator,MAX_BODY,validNamespace} from './validation.mjs';
import {createSaveRepository} from './repository.mjs';
import {pathToFileURL} from 'node:url';
import {createSocialService} from './social-service.mjs';
import {socialRoute,localRequest,sessionToken} from './social-routes.mjs';
export async function createAppServer(config,{pool=mysql.createPool(connectionOptions(config))}={}){
  await pool.query('SELECT 1');
  const validate=await createValidator(config.sourceRoot),repository=createSaveRepository(pool,validate,{sourceRoot:config.sourceRoot});
  const [tableRows]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE IN ('BASE TABLE','VIEW')");
  const tables=new Set(tableRows.map(row=>row.TABLE_NAME));
  const social=config.socialEnabled?createSocialService(pool,{repository,validate,sourceRoot:config.sourceRoot}):null;
  if(social&&!tables.has('social_accounts')){await pool.end();throw new Error('数据库需要好友升级，请先备份并运行 npm run migrate:social');}
  if(social){const [identityColumns]=await pool.execute("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='social_accounts' AND COLUMN_NAME='password_hash'");if(identityColumns[0]?.IS_NULLABLE!=='YES'){await pool.end();throw new Error('需要免登录数据库升级，请先备份并运行升级好友数据库.cmd');}}
  if(social&&config.designCodesEnabled&&!tables.has('social_room_designs')){await pool.end();throw new Error('请先备份，再运行升级装修码数据库.cmd');}
  const designs=social&&config.designCodesEnabled?await createDesignService(pool,{repository,validate,sourceRoot:config.sourceRoot}):null;
  const socialConfig={...config,sourceModuleUrl:pathToFileURL(resolve(config.sourceRoot,'estate-state.mjs')).href};
  const socialRepository={...repository,pool};
  if(!tables.has('room_world_saves')){await pool.end();throw Object.assign(new Error('数据库尚未安装世界存档表。请先备份，再由管理员显式运行 npm run migrate:worlds；启动不会自动修改数据库'),{code:'SCHEMA_MIGRATION_REQUIRED'});}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.md':'text/plain; charset=utf-8'};
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  async function body(req,max=MAX_BODY){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('请求内容太大'),{status:413});chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  const server=createServer(async(req,res)=>{
    try{
      const host=req.headers.host||'',port=server.address()?.port;const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
      if(config.publicOrigin)origins.add(config.publicOrigin);
      const allowedHosts=new Set([...origins].map(origin=>new URL(origin).host));
      if(!allowedHosts.has(host)||req.headers.origin&&!origins.has(req.headers.origin))return json(res,403,{ok:false,message:'请求来源与本站不一致'});
      const url=new URL(req.url,'http://'+host),path=url.pathname;
      if(path==='/api/v1/status')return json(res,200,{ok:true,database:config.database,storage:'mysql',social:!!social,designCodes:!!designs,localOnly:(config.httpHost||'127.0.0.1')==='127.0.0.1'});
      if(path.startsWith('/api/v1/designs/')){
        if(!designs)return json(res,503,{ok:false,code:'DESIGNS_OFFLINE',message:'装修分享尚未连接，请连接数据库后刷新'});
        const me=await social.authenticate(sessionToken(req));
        try{
          if(path==='/api/v1/designs/publish'&&req.method==='POST'){
            if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{ok:false,message:'请使用JSON请求'});
            const data=await body(req,2048);if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>key!=='roomId'))return json(res,400,{ok:false,message:'发布请求格式无效'});
            return json(res,200,await designs.publish(me,data.roomId));
          }
          if(req.method==='GET'&&/^\/api\/v1\/designs\/\d{4}$/.test(path))return json(res,200,await designs.find(me,path.slice(-4)));
          return json(res,400,{ok:false,message:'请输入完整的4位数字装修码'});
        }catch(error){if(error.status)return json(res,error.status,{ok:false,code:error.code,message:error.message});throw error;}
      }
      if(social&&await socialRoute({req,res,path,url,service:social,body,json,config:socialConfig,repository:socialRepository,validate}))return;
      if(!localRequest(req)&&(path.startsWith('/database')||path==='/api/v1/schema'||path==='/api/v1/rows'))return json(res,403,{ok:false,message:'数据库管理只允许在服务器本机查看'});
      if(path==='/api/v1/save'){
        const namespace=url.searchParams.get('namespace');if(!validNamespace(namespace))return json(res,400,{ok:false,message:'账户存档编号无效'});
        if(social){const me=await social.authenticate(sessionToken(req));if(me.accountKey!==namespace)return json(res,403,{ok:false,message:'不能读取或修改其他账号的私人存档'});}
        if(req.method==='GET')return json(res,200,await repository.load(namespace));
        if(req.method==='PUT'){
          if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{ok:false,message:'请使用JSON存档'});
          const input=await body(req);if(Object.keys(input).some(k=>!['baseRevision','entries'].includes(k)))throw new Error('存档请求含未知字段');
          const result=await repository.save(namespace,input.baseRevision,input.entries);return json(res,result.ok?200:409,result);
        }
        return json(res,405,{ok:false,message:'不支持此存档操作'});
      }
      if(path==='/api/v1/schema'&&req.method==='GET'){
        const [schema]=await pool.execute("SELECT TABLE_NAME table_name,TABLE_TYPE table_type,TABLE_COMMENT table_comment FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME");
        const [columns]=await pool.execute('SELECT TABLE_NAME table_name,COLUMN_NAME column_name,COLUMN_TYPE column_type,COLUMN_KEY column_key,IS_NULLABLE is_nullable,COLUMN_COMMENT column_comment FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
        return json(res,200,{ok:true,database:config.database,tables:schema,columns});
      }
      if(path==='/api/v1/rows'&&req.method==='GET'){
        const table=url.searchParams.get('table'),namespace=url.searchParams.get('namespace'),roomId=url.searchParams.get('room_id');if(!tables.has(table))return json(res,400,{ok:false,message:'请从表目录选择'});
        if(roomId&&(!validNamespace(namespace)||!/^room-[1-6]$/.test(roomId)))return json(res,400,{ok:false,message:'按楼层查看时请选择有效的存档空间和楼层ID'});
        const [cols]=await pool.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[table]);const names=cols.map(c=>c.COLUMN_NAME),key=['account_key','namespace','账户键','账号编号'].find(name=>names.includes(name)),roomKey=['room_id','楼层编号'].find(name=>names.includes(name));
        // Large JSON and binary values remain recoverable in SQL, but are summarized in the browser.
        const projection=names.map(name=>`\`${name}\``).join(',');
        if(roomId&&!roomKey)return json(res,400,{ok:false,message:'此表没有独立楼层字段，请清空楼层筛选'});
        const where=[],values=[];if(key&&namespace){where.push('`'+key+'`=?');values.push(namespace);}if(roomId){where.push('`'+roomKey+'`=?');values.push(roomId);}
        const [rows]=await pool.execute(`SELECT ${projection} FROM \`${table}\`${where.length?' WHERE '+where.join(' AND '):''} LIMIT 100`,values);
        return json(res,200,{ok:true,table,columns:names,rows,limit:100});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{ok:false,message:'不支持此操作'});
      if(path==='/database'||path==='/database/'){
        res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-store'});res.end(await readFile(new URL('../database.html',import.meta.url)));return;
      }
      let file=resolve(config.sourceRoot,'.'+decodeURIComponent(path));
      if(file!==config.sourceRoot&&!file.startsWith(config.sourceRoot+sep)||decodeURIComponent(path).split('/').some(part=>part.startsWith('.')))return json(res,403,{ok:false,message:'此文件不对外提供'});
      if((await stat(file)).isDirectory())file=resolve(file,'index.html');
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch(error){const missing=['ENOENT','ENOTDIR'].includes(error.code),denied=['EACCES','EPERM'].includes(error.code),database=error.code?.startsWith('ER_');if(!res.headersSent)json(res,error.status||(missing?404:denied?403:database?500:400),{ok:false,code:database?'DATABASE_ERROR':missing?'NOT_FOUND':denied?'FORBIDDEN':'INVALID_REQUEST',message:missing?'没有找到这个页面或文件':denied?'此文件暂时无法读取':database?(req.method==='GET'||req.method==='HEAD'?'数据库读取失败，请稍后重试':'数据库保存未完成，本机改动仍保留'):error.message});else res.end();}
  });
  return {server,pool,repository,async close(){await new Promise(resolve=>server.close(resolve));await pool.end();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const config=await loadConfig(),app=await createAppServer(config),port=Number(process.env.PORT||config.httpPort||8899);
  app.server.listen(port,config.httpHost||'127.0.0.1',()=>console.log(`MySQL小屋已启动：${config.publicOrigin||'http://127.0.0.1:'+port}/?storage=mysql · 本机数据库目录：http://127.0.0.1:${port}/database`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
