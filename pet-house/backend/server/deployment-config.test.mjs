import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from './config.mjs';
import {generateEnv} from '../../deploy/generate-env.mjs';
test('remote database and public origins require explicit deployment configuration',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pet-room-deploy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'mysql.json');await writeFile(file,JSON.stringify({host:'db',user:'pet_room_app',database:'pet_room',password:'test-only',httpHost:'0.0.0.0'}));
 await assert.rejects(loadConfig({configFile:file,env:{}}),/PET_ROOM_ALLOW_REMOTE_DB/);
 const env={PET_ROOM_ALLOW_REMOTE_DB:'1',PET_ROOM_PUBLIC_ORIGIN:'https://pets.example.com',PET_ROOM_SOCIAL:'1',PET_ROOM_TRUST_PROXY:'1'};
 const config=await loadConfig({configFile:file,env});assert.equal(config.publicOrigin,'https://pets.example.com');assert.equal(config.socialEnabled,true);assert.equal(config.trustProxy,true);
 for(const origin of ['https://pets.example.com/path','javascript:alert(1)','https://pets.example.com/'])await assert.rejects(loadConfig({configFile:file,env:{...env,PET_ROOM_PUBLIC_ORIGIN:origin}}),/公网地址/);
});
test('deployment generator creates separate random secrets and never overwrites an existing installation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pet-room-env-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'.env');
 for(const domain of ['https://example.com','example.com/path','127.0.0.1','bad name.com','x;echo.example.com'])await assert.rejects(generateEnv(domain,file),/域名/);
 await generateEnv('pets.example.com',file);const before=await readFile(file,'utf8'),values=Object.fromEntries(before.trim().split('\n').map(line=>line.split('=')));
 assert.match(values.MYSQL_PASSWORD,/^[a-f0-9]{64}$/);assert.match(values.MYSQL_ROOT_PASSWORD,/^[a-f0-9]{64}$/);assert.notEqual(values.MYSQL_PASSWORD,values.MYSQL_ROOT_PASSWORD);
 await assert.rejects(generateEnv('other.example.com',file),{code:'EEXIST'});assert.equal(await readFile(file,'utf8'),before);
});
