import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy,BUILTIN_STORAGE,STORAGE_CATALOG} from '../economy.mjs';

function memory(){const values=new Map(),writes=[];return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push([key,value]);values.set(key,value);}};}
const plainLayout=value=>({version:3,furniture:{table:{position:[value,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null});

test('v2.8 storage: purchase -> store (收回仓库) -> unstore (摆回), 一次事务落账、不动积分',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,initialBalance:500});
  const bought=economy.purchase('cloud-table',{layout:plainLayout(1),requestId:'buy:cloud'});
  assert.equal(bought.ok,true);assert.equal(bought.state.balance,320);
  assert.deepEqual(bought.state.stored,[]);

  const stored=economy.storeFurniture('cloud-table',{layout:plainLayout(2),requestId:'store:cloud'});
  assert.equal(stored.ok,true);assert.equal(stored.message,'家具已收回仓库');
  assert.deepEqual(stored.state.stored,['cloud-table']);
  assert.equal(stored.state.balance,320,'回收不应扣积分');
  assert.equal(storage.writes.length,2);
  // 重复回收幂等
  assert.equal(economy.storeFurniture('cloud-table',{requestId:'store:cloud'}).code,'ALREADY_APPLIED');
  assert.equal(economy.storeFurniture('cloud-table').code,'ALREADY_STORED');

  const out=economy.unstoreFurniture('cloud-table',{layout:plainLayout(3),requestId:'unstore:cloud'});
  assert.equal(out.ok,true);assert.equal(out.message,'家具已摆回房间');
  assert.deepEqual(out.state.stored,[]);assert.equal(out.state.balance,320);
  assert.equal(economy.unstoreFurniture('cloud-table',{requestId:'unstore:cloud'}).code,'ALREADY_APPLIED');
  assert.equal(economy.unstoreFurniture('cloud-table').code,'NOT_STORED');
});

test('v2.8 storage: requestId 复用于不同操作/不同商品被拒绝，重载后状态一致',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,initialBalance:900});
  economy.purchase('clover-planter',{layout:plainLayout(1),requestId:'p:1'});
  economy.purchase('moon-ornament',{layout:plainLayout(1),requestId:'p:2'});
  economy.storeFurniture('clover-planter',{layout:plainLayout(2),requestId:'s:1'});
  // 同编号用于另一商品
  assert.equal(economy.storeFurniture('moon-ornament',{requestId:'s:1'}).code,'REQUEST_ID_REUSED');
  // 同编号用于另一操作（unstore）
  economy.storeFurniture('moon-ornament',{layout:plainLayout(2),requestId:'s:2'});
  assert.equal(economy.unstoreFurniture('moon-ornament',{requestId:'s:2'}).code,'REQUEST_ID_REUSED');
  const loaded=createEconomy({storageAdapter:storage});
  assert.deepEqual(loaded.getState().stored,['clover-planter','moon-ornament']);
  assert.deepEqual(loaded.getState().owned,['clover-planter','moon-ornament']);
});

test('v2.8 storage: 校验——未拥有/未知商品/未在仓库/重复入仓都被拒绝',()=>{
  const economy=createEconomy({storageAdapter:null,initialBalance:999});
  assert.equal(economy.storeFurniture('reading-shelf').code,'NOT_OWNED');
  assert.equal(economy.storeFurniture('not-a-sku').code,'UNKNOWN_SKU');
  assert.equal(economy.unstoreFurniture('reading-shelf').code,'NOT_STORED');
  economy.purchase('reading-shelf',{layout:plainLayout(1)});
  economy.storeFurniture('reading-shelf',{layout:plainLayout(2)});
  assert.equal(economy.storeFurniture('reading-shelf').code,'ALREADY_STORED');
  // 已入仓的不能再买（产权唯一）；取出后可再买幂等
  assert.equal(economy.purchase('reading-shelf',{requestId:'buy:again'}).code,'ALREADY_OWNED');
  economy.unstoreFurniture('reading-shelf',{layout:plainLayout(3)});
  assert.equal(economy.unstoreFurniture('reading-shelf').code,'NOT_STORED');
});

test('v2.8 storage: 旧存档（无 stored 字段）加载后补空数组，存档校验拒绝 stored 越权',()=>{
  const storage=memory();
  storage.setItem('legacy-account-v1',JSON.stringify({version:1,balance:100,roomLevel:0,owned:['clover-planter'],layout:null,claims:{learning:[],requests:[],rewards:[],spends:[]},totalSpent:0}));
  const legacy=createEconomy({storageAdapter:storage,storageKey:'legacy-account-v1'});
  assert.deepEqual(legacy.getState().stored,[]);
  assert.equal(legacy.storeFurniture('clover-planter',{layout:plainLayout(1)}).ok,true);
  // stored 含未拥有商品 → 存档无效
  storage.setItem('bad-account-v1',JSON.stringify({version:1,balance:100,roomLevel:0,owned:[],stored:['cloud-table'],layout:null,claims:{learning:[],requests:[],rewards:[],spends:[]},totalSpent:0}));
  const bad=createEconomy({storageAdapter:storage,storageKey:'bad-account-v1'});
  assert.equal(bad.getState().valid,false);
  assert.equal(bad.getState().error?.code,'INVALID_STATE');
});

test('v2.8.2 storage: 房间固有/核心家具（无产权）无需购买即可收回与摆回',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage});
  assert.ok(BUILTIN_STORAGE.some(item=>item.id==='sofa'),'大沙发在固有目录');
  assert.ok(STORAGE_CATALOG.some(item=>(item.sku||item.id)==='rug'),'地毯在仓库目录');
  // 未购买也允许收回固有件（它们本就属于房间）
  const stored=economy.storeFurniture('rug',{layout:plainLayout(1),requestId:'s:rug'});
  assert.equal(stored.ok,true);assert.equal(stored.message,'家具已收回仓库');
  assert.deepEqual(stored.state.stored,['rug']);assert.deepEqual(stored.state.owned,[]);
  // 核心件 sofa 同规则
  assert.equal(economy.storeFurniture('sofa',{layout:plainLayout(1),requestId:'s:sofa'}).ok,true);
  assert.deepEqual(economy.getState().stored,['rug','sofa']);
  const out=economy.unstoreFurniture('rug',{layout:plainLayout(2),requestId:'u:rug'});
  assert.equal(out.ok,true);assert.deepEqual(out.state.stored,['sofa']);
  assert.equal(economy.unstoreFurniture('sofa',{layout:plainLayout(2),requestId:'u:sofa'}).ok,true);
  assert.deepEqual(economy.getState().stored,[]);
  // 未在目录里的 id 拒绝
  assert.equal(economy.storeFurniture('room-shell').code,'UNKNOWN_SKU');
});
