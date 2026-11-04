import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createAppServer} from './server.mjs';

test('all four Chinese views and ordinary tables honor namespace filters without changing global catalogs',async()=>{
  const views=['v_account_overview','v_room_furniture_search','v_room_storage_search','v_wallet_receipt_search'];
  const names={...Object.fromEntries(views.map(view=>[view,['账户键','名称']])),usr_accounts:['account_key','display_name'],sys_save_slots:['namespace','revision'],cfg_items:['item_sku','item_name'],room_world_saves:['account_key','room_id','save_key','snapshot_json'],'新手_03_房间存档':['账号名称','账号编号','楼层编号','存档类型']};
  const queries=[];
  const pool={async query(sql){assert.equal(sql,'SELECT 1');return [[],[]];},async execute(sql,values=[]){
    queries.push({sql,values});
    if(sql.includes('information_schema.TABLES'))return [Object.keys(names).map(TABLE_NAME=>({TABLE_NAME})),[]];
    if(sql.includes('information_schema.COLUMNS'))return [names[values[0]].map(COLUMN_NAME=>({COLUMN_NAME})),[]];
    if(sql.startsWith('SELECT '))return [sql.includes(' WHERE ')?[]:[{label:'one'},{label:'two'}],[]];
    throw new Error('test refuses unexpected SQL');
  },async end(){}};
  const app=await createAppServer({sourceRoot:fileURLToPath(new URL('../../source-connected',import.meta.url)),database:'pet_room'},{pool});
  try{
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
    for(const table of [...views,'usr_accounts','sys_save_slots']){
      const response=await fetch(base+'/api/v1/rows?'+new URLSearchParams({table,namespace:'missing-account'})),body=await response.json();
      assert.equal(response.status,200);assert.deepEqual(body.rows,[],table+' must apply the chosen account');
      assert.deepEqual(queries.at(-1).values,['missing-account']);
      const unfiltered=await (await fetch(base+'/api/v1/rows?'+new URLSearchParams({table}))).json();assert.equal(unfiltered.rows.length,2);
    }
    const catalog=await(await fetch(base+'/api/v1/rows?table=cfg_items&namespace=missing-account')).json();assert.equal(catalog.rows.length,2);
    const worlds=await fetch(base+'/api/v1/rows?table=room_world_saves&namespace=chosen-account&room_id=room-2');assert.equal(worlds.status,200);
    assert.match(queries.at(-1).sql,/WHERE `account_key`=\? AND `room_id`=\?/);assert.deepEqual(queries.at(-1).values,['chosen-account','room-2']);
    const friendly=await fetch(base+'/api/v1/rows?'+new URLSearchParams({table:'新手_03_房间存档',namespace:'chosen-account',room_id:'room-2'}));assert.equal(friendly.status,200);
    assert.match(queries.at(-1).sql,/WHERE `账号编号`=\? AND `楼层编号`=\?/);assert.deepEqual(queries.at(-1).values,['chosen-account','room-2']);
    assert.equal((await fetch(base+'/api/v1/rows?table=room_world_saves&room_id=room-2')).status,400,'same room id across accounts cannot be selected without an account');
    assert.equal((await fetch(base+'/api/v1/rows?table=room_world_saves&namespace=chosen-account&room_id=room-9')).status,400);
    assert.equal((await fetch(base+'/api/v1/rows?table=not-a-table')).status,400);
  }finally{await app.close();}
});
test('startup detects a missing worlds migration using read-only queries and never performs DDL',async()=>{
  const calls=[];let ended=false;
  const pool={async query(sql){calls.push(sql);return [[],[]];},async execute(sql){calls.push(sql);return [[],[]];},async end(){ended=true;}};
  await assert.rejects(createAppServer({sourceRoot:fileURLToPath(new URL('../../source-connected',import.meta.url)),database:'pet_room'},{pool}),error=>error.code==='SCHEMA_MIGRATION_REQUIRED');
  assert.equal(ended,true);assert.equal(calls.every(sql=>sql.startsWith('SELECT ')),true);
});
