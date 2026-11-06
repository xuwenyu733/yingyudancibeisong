import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function generateEnv(domain,target=new URL('./.env',import.meta.url)){
 domain=String(domain||'').trim().toLowerCase();
 if(domain.length>253||!domain.includes('.')||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||/^\d+(\.\d+){3}$/.test(domain))throw new Error('请提供已解析的域名，例如 room.example.com；不要加https或路径');
 const content='DOMAIN='+domain+'\nMYSQL_PASSWORD='+randomBytes(32).toString('hex')+'\nMYSQL_ROOT_PASSWORD='+randomBytes(32).toString('hex')+'\n';
 await writeFile(target,content,{encoding:'utf8',mode:0o600,flag:'wx'});
 return {ok:true,domain};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await generateEnv(process.argv[2])));console.log('已生成 deploy/.env，含两组独立随机口令。原有文件不会被覆盖，请妥善保管。');}
 catch(error){console.error(error.code==='EEXIST'?'deploy/.env 已存在，未覆盖；修改域名请编辑原文件，保留数据库口令。':error.message);process.exitCode=1;}
}
