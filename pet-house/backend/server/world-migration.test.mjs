import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {migrateRoomWorlds} from './migrate-worlds.mjs';

test('incremental schema only adds its idempotent table and version record; fresh schema matches it',async()=>{
  const migration=(await readFile(new URL('../migrations/1.1.0-room-worlds.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n'),schema=(await readFile(new URL('../schema.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  assert.equal(/\b(?:DROP|TRUNCATE|ALTER|DELETE|UPDATE)\s+(?:DATABASE|TABLE|FROM|usr_|sys_save_slots|room_floors)/i.test(migration),false);
  assert.equal((migration.match(/CREATE TABLE /g)||[]).length,1);assert.match(migration,/CREATE TABLE IF NOT EXISTS room_world_saves/);
  assert.match(migration,/PRIMARY KEY \(account_key,room_id,save_key\)/);assert.match(migration,/REFERENCES room_floors\(account_key,room_id\)/);
  const ddl=migration.slice(migration.indexOf('CREATE TABLE'),migration.indexOf('\n\nINSERT INTO sys_schema_migrations'));
  assert.equal(schema.includes(ddl),true);assert.match(migration,/ON DUPLICATE KEY UPDATE description=VALUES\(description\)/);
});
test('explicit migration backfills only world saves, preserves raw archives/revisions and can be repeated (mock database)',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'pet-room-world-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const adminFile=join(dir,'admin.json'),sourceRoot=fileURLToPath(new URL('../../source-connected',import.meta.url));
  await writeFile(adminFile,JSON.stringify({host:'127.0.0.1',user:'admin-test',password:'test-only-password',database:'pet_room',sourceRoot}));
  const estate=createEstateStore({storageAdapter:null,storageKey:'migration-source',initialPoints:3000});assert.equal(estate.createRoom({name:'二楼书房'}).ok,true);
  const legacy=estate.exportArchive().archive;for(const room of legacy.estate.rooms)delete room.world;
  const slots=[{namespace:'world-account-a',revision:12,archive:JSON.stringify(legacy)},{namespace:'world-account-b',revision:7,archive:JSON.stringify(legacy)}],original=JSON.stringify(slots),worlds=[],calls=[];
  let commits=0,rollbacks=0;
  const connection={async query(sql){calls.push(sql);if(sql==='SELECT DATABASE() AS database_name')return [[{database_name:'pet_room'}],[]];if(sql.startsWith('SELECT version'))return [[{version:'1.1.0'}],[]];return [[],[]];},async execute(sql,values=[]){
    calls.push(sql);if(sql.startsWith('SELECT namespace,archive'))return [structuredClone(slots),[]];
    if(sql.startsWith('DELETE FROM room_world_saves')){for(let i=worlds.length-1;i>=0;i--)if(worlds[i].account_key===values[0])worlds.splice(i,1);return [[],[]];}
    assert.match(sql,/^INSERT INTO room_world_saves /,'no old business table may be rebuilt by migration');
    const columns=sql.match(/\(([^)]+)\)/)[1].split(',');worlds.push(Object.fromEntries(columns.map((name,i)=>[name,values[i]])));return [[],[]];
  },async beginTransaction(){},async commit(){commits++;},async rollback(){rollbacks++;},async end(){}};
  const options={env:{PET_ROOM_MYSQL_ADMIN_CONFIG:adminFile},connect:async()=>connection};
  const first=await migrateRoomWorlds(options);assert.equal(first.backfilledAccounts,2);assert.equal(first.backfilledRooms,4);assert.equal(worlds.length,4);
  const before=JSON.stringify(worlds);await migrateRoomWorlds(options);assert.equal(JSON.stringify(worlds),before);assert.equal(JSON.stringify(slots),original);
  assert.equal(commits,2);assert.equal(rollbacks,0);assert.equal(worlds.every(row=>row.save_kind==='current'&&row.world_revision===0),true);
  assert.equal(calls.some(sql=>/^(?:DELETE FROM usr_accounts|UPDATE sys_save_slots)/.test(sql)),false);
});
test('migration requires explicit administrator configuration before opening a database connection',async()=>{
  let connected=false;await assert.rejects(migrateRoomWorlds({env:{},connect:async()=>{connected=true;}}),/PET_ROOM_MYSQL_ADMIN_CONFIG/);assert.equal(connected,false);
});
