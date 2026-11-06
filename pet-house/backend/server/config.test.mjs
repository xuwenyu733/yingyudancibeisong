import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.mjs';
import {initializeDatabase} from './init.mjs';

const sourceRoot=fileURLToPath(new URL('../../source-connected',import.meta.url));
const config={host:'127.0.0.1',user:'pet_room_app',database:'pet_room',sourceRoot:'../source-connected',password:'test-only-password'};
async function workspace(t){const dir=await mkdtemp(join(tmpdir(),'pet-room-config-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('sourceRoot follows the config location; environment credentials override file credentials',async t=>{
  const dir=await workspace(t),file=join(dir,'mysql.local.json');await writeFile(file,JSON.stringify(config));
  const loaded=await loadConfig({configFile:file,env:{PET_ROOM_MYSQL_PASSWORD:'environment-test-only'}});
  assert.equal(loaded.sourceRoot,resolve(dir,'../source-connected'));assert.equal(loaded.password,'environment-test-only');
  await writeFile(join(dir,'password.txt'),'file-test-only\r\n');
  assert.equal((await loadConfig({configFile:file,env:{PET_ROOM_MYSQL_PASSWORD_FILE:'password.txt'}})).password,'file-test-only');
});
test('generated application config is the default; existing mysql.local.json remains supported',async t=>{
  const dir=await workspace(t);await writeFile(join(dir,'mysql.local.json'),JSON.stringify(config));
  assert.equal((await loadConfig({defaultDirectory:dir,env:{}})).user,'pet_room_app');
  await writeFile(join(dir,'app.local.json'),JSON.stringify({...config,user:'pet_room_app_generated'}));
  assert.equal((await loadConfig({defaultDirectory:dir,env:{}})).user,'pet_room_app_generated');
  assert.equal((await loadConfig({defaultDirectory:dir,env:{PET_ROOM_MYSQL_CONFIG:join(dir,'mysql.local.json')}})).user,'pet_room_app');
});
test('missing credentials and an implicit administrator config fail before any connection',async t=>{
  const dir=await workspace(t),file=join(dir,'mysql.local.json');await writeFile(file,JSON.stringify({...config,password:''}));
  await assert.rejects(loadConfig({configFile:file,env:{}}),/PET_ROOM_MYSQL_PASSWORD/);
  await assert.rejects(loadConfig({env:{},admin:true}),/PET_ROOM_MYSQL_ADMIN_CONFIG/);
  let connections=0;await assert.rejects(initializeDatabase({env:{},connect:async()=>{connections++;}}),/PET_ROOM_MYSQL_ADMIN_CONFIG/);assert.equal(connections,0);
});
test('explicit admin initialization creates a restricted runtime account selected by normal startup (mock database)',async t=>{
  const dir=await workspace(t),adminFile=join(dir,'admin.json'),appFile=join(dir,'app.local.json'),calls=[],connections=[];
  await writeFile(adminFile,JSON.stringify({...config,user:'admin-test',password:'admin-test-only',sourceRoot}));
  const admin={async query(sql,values){calls.push({sql,values});return [[],[]];},async execute(sql,values){calls.push({sql,values});return [[],[]];},async end(){}};
  const app={async query(sql){assert.equal(sql,'SELECT COUNT(*) FROM cfg_items');return [[],[]];},async end(){}};
  const result=await initializeDatabase({env:{PET_ROOM_MYSQL_ADMIN_CONFIG:adminFile},applicationConfigFile:appFile,connect:async options=>{connections.push(options);return connections.length===1?admin:app;}});
  assert.equal(result.ok,true);assert.equal(connections[0].user,'admin-test');assert.equal(connections[1].user,'pet_room_app');
  assert.equal(calls.some(call=>call.sql==='GRANT SELECT, INSERT, UPDATE, DELETE ON pet_room.* TO ?@?'),true);
  const runtime=await loadConfig({defaultDirectory:dir,env:{}});assert.equal(runtime.configFile,appFile);assert.equal(runtime.sourceRoot,sourceRoot);assert.equal(runtime.password,connections[1].password);
});
test('social mode is on by default and can be disabled explicitly',async t=>{
  const dir=await workspace(t),file=join(dir,'mysql.local.json'),base={...config,username:undefined};
  // 未声明 socialEnabled：默认开启（与“默认开启，显式关闭”一致）
  await writeFile(file,JSON.stringify({...config}));
  assert.equal((await loadConfig({configFile:file,env:{}})).socialEnabled,true);
  // 显式 false：关闭
  await writeFile(file,JSON.stringify({...config,socialEnabled:false}));
  assert.equal((await loadConfig({configFile:file,env:{}})).socialEnabled,false);
  // 环境变量 0 覆盖为关闭、1 强制开启
  assert.equal((await loadConfig({configFile:file,env:{PET_ROOM_SOCIAL:'0'}})).socialEnabled,false);
  await writeFile(file,JSON.stringify({...config,socialEnabled:false}));
  assert.equal((await loadConfig({configFile:file,env:{PET_ROOM_SOCIAL:'1'}})).socialEnabled,true);
});
