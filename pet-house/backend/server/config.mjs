import {readFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const backendRoot=fileURLToPath(new URL('../',import.meta.url));
async function exists(file){try{await access(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
export async function loadConfig({env=process.env,admin=false,configFile,defaultDirectory=backendRoot}={}){
  const prefix=admin?'PET_ROOM_MYSQL_ADMIN':'PET_ROOM_MYSQL';
  let selected=configFile||env[prefix+'_CONFIG'];
  if(admin&&!selected)throw new Error('首次建库请显式设置 PET_ROOM_MYSQL_ADMIN_CONFIG（管理员配置）；日常启动只使用应用账户，不会自动提权');
  if(!selected){const app=resolve(defaultDirectory,'app.local.json');selected=await exists(app)?app:resolve(defaultDirectory,'mysql.local.json');}
  const file=resolve(selected);
  let config;
  try{config=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));}
  catch(error){throw new Error(error.code==='ENOENT'?'未找到数据库配置，请先配置 backend/mysql.local.json 或设置 '+prefix+'_CONFIG':'数据库配置无法读取，请检查文件权限及 JSON 格式');}
  if(config.database!=='pet_room')throw new Error('此安装器只操作 pet_room 数据库');
  if(!['127.0.0.1','localhost'].includes(config.host)&&env.PET_ROOM_ALLOW_REMOTE_DB!=='1')throw new Error('本机数据库连接只允许 localhost；容器数据库需显式设置 PET_ROOM_ALLOW_REMOTE_DB=1');
  let password=config.password;
  if(env[prefix+'_PASSWORD_FILE']){
    try{password=(await readFile(resolve(dirname(file),env[prefix+'_PASSWORD_FILE']),'utf8')).replace(/\r?\n$/,'');}
    catch{throw new Error(prefix+'_PASSWORD_FILE 指定的本机口令文件无法读取');}
  }
  if(Object.hasOwn(env,prefix+'_PASSWORD'))password=env[prefix+'_PASSWORD'];
  if(typeof password!=='string'||!password.length)throw new Error('未提供数据库口令，请设置 '+prefix+'_PASSWORD 或 '+prefix+'_PASSWORD_FILE；口令无需写入分发配置');
  const publicOrigin=env.PET_ROOM_PUBLIC_ORIGIN||config.publicOrigin||'';
  if(publicOrigin){let parsed;try{parsed=new URL(publicOrigin);}catch{throw new Error('服务器公网地址无效');}if(parsed.origin!==publicOrigin||!['http:','https:'].includes(parsed.protocol))throw new Error('服务器公网地址需要完整的http/https源地址，不带路径');}
  return {...config,password,publicOrigin,designCodesEnabled:config.designCodesEnabled!==false,socialEnabled:env.PET_ROOM_SOCIAL==='0'?false:config.socialEnabled===true||env.PET_ROOM_SOCIAL==='1'||config.socialEnabled!==false,trustProxy:env.PET_ROOM_TRUST_PROXY==='1'||config.trustProxy===true,httpHost:env.PET_ROOM_HTTP_HOST||config.httpHost||'127.0.0.1',sourceRoot:resolve(dirname(file),config.sourceRoot||'../source-connected'),configFile:file};
}
export function connectionOptions(config){return {host:config.host,port:config.port||3306,user:config.user,password:config.password,database:config.database,charset:'utf8mb4',timezone:'Z',decimalNumbers:true,connectionLimit:4,multipleStatements:false};}
