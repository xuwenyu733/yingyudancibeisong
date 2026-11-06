import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadConfig} from './config.mjs';
import {createAppServer} from './server.mjs';
test('real MySQL transactional saves, indexes, precise IDs, conflicts and restore',{skip:process.env.PET_ROOM_MYSQL_INTEGRATION!=='1'?'设置 PET_ROOM_MYSQL_INTEGRATION=1 才会对真实数据库执行写入测试':false},async()=>{
  const config={...await loadConfig(),socialEnabled:false}; // Storage-only regression; social authorization has its own real API checks.
  const {createEstateStore}=await import(pathToFileURL(resolve(config.sourceRoot,'estate-state.mjs')).href);
  const {createEconomy}=await import(pathToFileURL(resolve(config.sourceRoot,'economy.mjs')).href);
  const {createCompanionStore}=await import(pathToFileURL(resolve(config.sourceRoot,'companion-state.mjs')).href);
  function fixture(namespace){const map=new Map(),adapter={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},estate=createEstateStore({storageAdapter:adapter,storageKey:namespace,initialPoints:3000}),storage=estate.storageForRoom('room-1');return {map,estate,entries:()=>Object.fromEntries(map),storage,economy:()=>createEconomy({storageAdapter:storage,storageKey:namespace+'-account-v1'}),companion:()=>createCompanionStore({adapter:storage,key:namespace+'-companion-v1'})};}
  const app=await createAppServer(config),namespace='mysql-integration-'+Date.now(),f=fixture(namespace);
  try{
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
    assert.equal(f.economy().purchase('cloud-table',{requestId:'buy-table',layout:{version:3,furniture:{table:{position:[1,0,2],rotation:[0,0,0],scale:[1,1,1]}},definitions:{table:{boxes:[{center:[0,0,0],size:[1,1,1]}]}},lampSupport:null}}).ok,true);
    assert.equal(f.economy().creditLearning({eventId:'lesson',learned:1}).ok,true);assert.equal(f.economy().creditLearning({eventId:'lesson ',learned:1}).ok,true);
    f.companion().learning('lesson',1200);f.companion().saveWallDrawing({version:1,strokes:[{tool:'brush',color:'#abcdef',size:.02,points:[[.1,.2]]}]});f.estate.createRoom({name:'二楼书房',template:'mint'});
    f.storage.setItem(namespace+'-'+ 'x'.repeat(500),'保留长键');f.map.set(namespace+'-estate-backups-v1','{"backups":[]}');
    let response=await fetch(base+'/api/v1/save?namespace='+namespace,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:0,entries:f.entries()})});let result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.revision,1);
    const [wallet]=await app.pool.execute('SELECT balance_points FROM wallet_accounts WHERE account_key=?',[namespace]);assert.equal(wallet[0].balance_points,2240);
    const [counts]=await app.pool.execute('SELECT COUNT(*) n FROM learn_events WHERE account_key=?',[namespace]);assert.equal(counts[0].n,2,'trailing-space IDs remain distinct');
    const [floors]=await app.pool.execute('SELECT floor_no,room_name FROM room_floors WHERE account_key=? ORDER BY floor_no',[namespace]);assert.equal(floors.length,2);assert.equal(floors[1].room_name,'二楼书房');
    const [extras]=await app.pool.execute('SELECT storage_key FROM room_extras WHERE account_key=?',[namespace]);assert.equal(extras[0].storage_key.length,namespace.length+501);
    const loaded=await app.repository.load(namespace);assert.deepEqual(loaded.entries,f.entries());assert.equal(loaded.revision,1);
    assert.equal((await app.repository.save(namespace,0,f.entries())).unchanged,true,'lost-response retry is idempotent');
    f.companion().update({petName:'数据库团团'});assert.equal((await app.repository.save(namespace,0,f.entries())).code,'SAVE_CONFLICT');
    const [left,right]=await Promise.all([app.repository.save(namespace,1,f.entries()),app.repository.save(namespace,1,{...f.entries(),[namespace+'-extra']:'different'})]);assert.equal([left,right].filter(x=>x.ok).length,1);assert.equal([left,right].filter(x=>x.code==='SAVE_CONFLICT').length,1);
    const previous=await app.repository.load(namespace),bad=structuredClone(previous.entries),estate=JSON.parse(bad[namespace+'-estate-v1']);estate.rooms[0].scene.layout.furniture.table.scale=null;bad[namespace+'-estate-v1']=JSON.stringify(estate);
    await assert.rejects(()=>app.repository.save(namespace,previous.revision,bad));assert.deepEqual(await app.repository.load(namespace),previous,'failed projection cannot commit the snapshot');
    const [charges]=await app.pool.execute("SELECT points_delta FROM wallet_receipts WHERE account_key=? AND operation='create-room'",[namespace]);assert.deepEqual(charges.map(row=>row.points_delta),[-600]);
    const safeBefore=await app.repository.load(namespace),bankBefore=f.estate.exportArchive().archive.estate.bank,secondBefore=f.estate.exportArchive().archive.estate.rooms[1];
    const fresh=f.estate.createRoomWorld('room-1',{name:'重新搭建的小屋',template:'mint',backupName:'旧布置备份'});assert.equal(fresh.ok,true);
    let current=await app.repository.save(namespace,safeBefore.revision,f.entries());assert.equal(current.ok,true);
    const [savedWorlds]=await app.pool.execute("SELECT save_kind,save_name,snapshot_json FROM room_world_saves WHERE account_key=? AND room_id='room-1'",[namespace]);assert(savedWorlds.some(row=>row.save_kind==='checkpoint'&&row.save_name==='旧布置备份'));assert(savedWorlds.some(row=>row.save_kind==='current'&&row.save_name==='重新搭建的小屋'));
    assert.deepEqual(f.estate.exportArchive().archive.estate.bank,bankBefore);assert.deepEqual(f.estate.exportArchive().archive.estate.rooms[1],secondBefore);
    assert.equal(f.estate.restoreRoomWorld('room-1',fresh.save.id).ok,true);assert.equal((await app.repository.save(namespace,current.revision,f.entries())).ok,true);
    response=await fetch(base+'/api/v1/save?namespace='+namespace,{method:'PUT',headers:{'Content-Type':'application/json',Origin:'http://untrusted.example'},body:'{}'});assert.equal(response.status,403);
    response=await fetch(base+'/api/v1/rows?table='+encodeURIComponent('usr_accounts;DROP TABLE usr_accounts'));assert.equal(response.status,400);
    response=await fetch(base+'/api/v1/schema');result=await response.json();assert.equal(result.tables.length,53);assert.equal(result.columns.filter(c=>!c.column_comment&& !c.table_name.startsWith('v_')&&!c.table_name.startsWith('新手_')).length,0);
  }finally{await app.pool.execute('DELETE FROM usr_accounts WHERE account_key=?',[namespace]);await app.pool.execute('DELETE FROM sys_save_slots WHERE namespace=?',[namespace]);await app.close();}
});
