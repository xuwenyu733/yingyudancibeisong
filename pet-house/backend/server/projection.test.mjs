import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {projectArchive,seedCatalog} from './projection.mjs';
function resolveSourceRoot(){if(process.env.PET_ROOM_SOURCE_ROOT)return process.env.PET_ROOM_SOURCE_ROOT;for(const candidate of ['../../source-connected/','../../../work/source/']){const url=fileURLToPath(new URL(candidate,import.meta.url));if(existsSync(url))return url;}throw new Error('未找到小屋源码目录：请设置 PET_ROOM_SOURCE_ROOT');}
const sourceRoot=resolveSourceRoot();
const {createEstateStore}=await import(pathToFileURL(path.join(sourceRoot,'estate-state.mjs')).href);
function connection(){const calls=[];return {calls,async execute(sql,values){calls.push({sql,values});return [[],[]];}};}
function rows(conn,table){return conn.calls.filter(call=>call.sql.startsWith(`INSERT INTO ${table} (`)).map(call=>Object.fromEntries(call.sql.match(/\(([^)]+)\)/)[1].split(',').map((column,index)=>[column.trim(),call.values[index]])));}

test('current world projection preserves legacy layouts only in their owning floor and ignores nested backup histories',async()=>{
  const namespace='projection-qa',archive=fixture(),first=archive.estate.rooms.find(room=>room.id==='room-1');
  first.scene.layout=null;first.scene.layouts={};
  const layout=x=>JSON.stringify({version:3,furniture:{table:{position:[x,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null});
  const conn=connection();await projectArchive(conn,namespace,archive,{sourceRoot,entries:{[namespace]:layout(3)}});
  const snapshots=rows(conn,'room_world_saves').filter(row=>row.save_kind==='current');
  assert.equal(JSON.parse(snapshots.find(row=>row.room_id==='room-1').snapshot_json).scene.layout.furniture.table.position[0],3);
  assert.equal(JSON.parse(snapshots.find(row=>row.room_id==='room-2').snapshot_json).scene.layout,null);
  first.extras[namespace]=layout(5);first.extras[namespace+'-backups-v1']='old history';
  const next=connection();await projectArchive(next,namespace,archive,{sourceRoot,entries:{[namespace]:layout(3)}});
  const snapshot=JSON.parse(rows(next,'room_world_saves').find(row=>row.room_id==='room-1').snapshot_json);
  assert.equal(snapshot.scene.layout.furniture.table.position[0],5);assert.equal(snapshot.extras[namespace+'-backups-v1'],undefined);
});
function fixture(){
  const store=createEstateStore({storageAdapter:null,storageKey:'projection-qa',initialPoints:600});store.createRoom({name:'二楼书房',template:'mint'});
  const archive=store.exportArchive().archive,c=archive.estate.companion,b=archive.estate.bank,p=archive.profile;
  b.balance=1234;b.totalSpent=180;b.owned=['cloud-table','gift-star-demo'];b.petOwned=['apricot-fox','cloud-bunny'];b.activePet='cloud-bunny';
  b.claims.learning=['study','study '];b.claims.requests=[{id:'purchase-1',operation:'purchase',sku:'cloud-table'}];b.claims.rewards=[{id:'reward-1',points:8}];b.claims.spends=[{id:'spend-1',points:3}];
  c.learningEvents=['study '];c.learningSeconds=1200;c.visitDates=['2026-10-29'];c.checkinMilestones=['2026-10-7'];
  c.memories={'cloud-table':{at:null,by:'我们',source:'升级前的收藏'},'cloud-bunny':{at:'2026-10-29T01:02:03.000Z',by:'小主人',source:'解锁'},demo:{at:'2026-10-29T01:02:03.000Z',by:'小主人',source:'gift'}};
  c.rewards=[{id:'demo',kind:'star',name:'星星礼物',at:'2026-10-29T01:02:03.000Z',expiresAt:null}];
  p.name='小主人';p.badges=['first-checkin'];p.badgeUnlockedAt={'first-checkin':'2026-10-29'};p.badgeAcquiredAt={'first-checkin':null};p.pending=[{key:'checkin:2026-10-29',points:3}];p.checkInDates=['2026-10-29'];
  const room=archive.estate.rooms[0],drawing={version:1,strokes:[{tool:'brush',color:'#ff0000',size:.02,points:[[.1,.2]]}]};
  room.scene.layout={version:3,furniture:{table:{position:[1,0,2],rotation:[0,.4,0],scale:[1,1,1]}},definitions:{table:{label:'书桌',boxes:[{center:[0,.3,0],size:[1,.6,1]}],blocksNavigation:true,blocksPlacement:true,draggable:true}},lampSupport:null};room.scene.layouts={'0':room.scene.layout};room.scene.stored=['sofa'];room.scene.requests=[{id:'store-1',operation:'store',sku:'sofa'}];
  room.companion.furnitureStyles.table={color:'#ff0000',sticker:'star',drawing};room.companion.wallDrawing=drawing;room.extras['projection-qa-'+('长'.repeat(300))]='保留完整长键';
  return archive;
}
test('projection maps actual source fields, keeps unknown temporal amounts null and never commits independently',async()=>{
  const conn=connection();await seedCatalog(conn,{sourceRoot});await projectArchive(conn,'projection-qa',fixture(),{sourceRoot});
  assert.equal(conn.calls.some(call=>call.values?.some(value=>value===undefined)),false);
  assert.equal(rows(conn,'usr_accounts')[0].display_name,'小主人');assert.equal(rows(conn,'wallet_accounts')[0].balance_points,1234);
  assert.deepEqual(rows(conn,'room_floors').map(row=>row.floor_no),[1,2]);
  assert.equal(rows(conn,'room_furniture')[0].rot_y,.4);assert.equal(rows(conn,'room_colliders')[0].size_y,.6);
  assert.equal(rows(conn,'usr_pending_rewards')[0].event_key,'checkin:2026-10-29');
  assert.equal(rows(conn,'inv_ownership').find(row=>row.item_sku==='cloud-table').acquired_at,null);
  const receipts=rows(conn,'wallet_receipts');assert.equal(receipts.find(row=>row.receipt_kind==='request').points_delta,null);assert.equal(receipts.find(row=>row.receipt_kind==='reward').points_delta,8);assert.equal(receipts.find(row=>row.receipt_kind==='spend').points_delta,-3);
  assert.equal(rows(conn,'usr_badges').find(row=>row.badge_id==='first-checkin').acquired_at,null);
  assert.equal(conn.calls.some(call=>/^(BEGIN|COMMIT|ROLLBACK)/i.test(call.sql)),false);
});
test('binary identities and long raw storage keys are preserved without trimming or truncation',async()=>{
  const conn=connection();await projectArchive(conn,'projection-qa',fixture(),{sourceRoot});
  assert.deepEqual(rows(conn,'learn_events').map(row=>row.event_id),['study','study ']);
  const extra=rows(conn,'room_extras')[0];assert.equal(extra.storage_key.length>255,true);assert.equal(extra.storage_key_hash,createHash('sha256').update(extra.storage_key).digest('hex'));assert.equal(extra.value_text,'保留完整长键');
  assert.equal(rows(conn,'room_drawings')[0].stroke_count,1);assert.equal(rows(conn,'pet_ownership').find(row=>row.pet_sku==='cloud-bunny').is_active,true);
});
