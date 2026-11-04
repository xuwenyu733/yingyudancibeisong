import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrateFriendlyViews} from './migrate-friendly.mjs';

test('friendly view maintenance requires explicit administrator configuration before connection',async()=>{
 let connected=false;await assert.rejects(migrateFriendlyViews({env:{},connect:async()=>{connected=true;}}),/ADMIN_CONFIG/);assert.equal(connected,false);
});
test('friendly views cannot be installed in the wrong database or before the floor migration',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'pet-friendly-'));t.after(()=>rm(folder,{recursive:true,force:true}));const config=join(folder,'admin.json');
 await writeFile(config,JSON.stringify({host:'127.0.0.1',user:'test-admin',password:'test-only',database:'pet_room'}));
 for(const database of ['other_database','pet_room']){
  const calls=[];let closed=false;
  const connection={async query(sql){calls.push(sql);return[[{database_name:database}],[]];},async execute(sql){calls.push(sql);return[[],[]];},async end(){closed=true;}};
  await assert.rejects(migrateFriendlyViews({env:{PET_ROOM_MYSQL_ADMIN_CONFIG:config},connect:async()=>connection}),database==='pet_room'?/先完成楼层/:/只允许/);
  assert(calls.every(sql=>sql.startsWith('SELECT ')));assert.equal(closed,true);
 }
});
