import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy,SHOP_CATALOG,ROOM_TIERS} from '../economy.mjs';

function memory(){const values=new Map(),writes=[];return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push([key,value]);values.set(key,value);}};}
const plainLayout=(value=1)=>({version:3,furniture:{table:{position:[value,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null});

test('legacy small-room saves retain paid expansions from their receipts',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,initialBalance:3000});
  assert.equal(economy.expand({requestId:'paid-1'}).ok,true);assert.equal(economy.expand({requestId:'paid-2'}).ok,true);
  assert.equal(economy.setRoomLevel(0,{requestId:'small'}).ok,true);
  const [key,raw]=[...storage.values][0],legacy=JSON.parse(raw);delete legacy.maxRoomLevel;storage.values.set(key,JSON.stringify(legacy));
  const loaded=createEconomy({storageAdapter:storage});
  assert.equal(loaded.getState().valid,true);assert.equal(loaded.getState().maxRoomLevel,2);assert.equal(loaded.getState().roomLevel,0);
  assert.equal(loaded.setRoomLevel(2,{requestId:'return-large'}).ok,true);assert.equal(loaded.getState().balance,900);
});

test('catalog and room tiers expose the agreed unique products and expansion prices',()=>{
  assert.deepEqual(SHOP_CATALOG.filter(item=>!item.category).map(({sku,price,kind})=>({sku,price,kind})),[
    {sku:'clover-planter',price:120,kind:'furniture'},{sku:'reading-shelf',price:260,kind:'furniture'},
    {sku:'cloud-table',price:180,kind:'furniture'},{sku:'moon-ornament',price:220,kind:'furniture'},
    {sku:'star-lamp',price:240,kind:'furniture'},{sku:'mushroom-stool',price:150,kind:'furniture'},
    {sku:'beehive-ornament',price:210,kind:'furniture'},{sku:'rocket-toy',price:260,kind:'furniture'},
    {sku:'rainbow-arch',price:300,kind:'furniture'},{sku:'candy-tree',price:180,kind:'furniture'},
  ]);
  assert.equal(SHOP_CATALOG.filter(item=>item.category==='flooring').length,8);
  assert.equal(SHOP_CATALOG.filter(item=>item.category==='wall').length,12);
  assert.equal(SHOP_CATALOG.length,30);
  assert.equal(new Set(SHOP_CATALOG.map(item=>item.sku)).size,30,'all furniture, flooring and wall products have distinct ownership keys');
  assert.ok(SHOP_CATALOG.every(item=>item.kind==='furniture'&&Number.isSafeInteger(item.price)&&item.price>0));
  assert.deepEqual(ROOM_TIERS.map(tier=>[tier.level,tier.width,tier.depth,tier.price]),[[0,8.8,8.2,0],[1,10.8,10.2,600],[2,12.8,12.2,1500]]);
  assert.ok(SHOP_CATALOG.every(item=>item.name&&item.description));
});

test('learning applies the 10/5/20 schedule once per event, including after reload',()=>{
  const storage=memory(),events=[],economy=createEconomy({storageAdapter:storage,onEvent:(...args)=>events.push(args)});
  const earned=economy.creditLearning({eventId:'lesson:1',learned:4,reviewed:3,checkIn:true});
  assert.equal(earned.ok,true);assert.equal(earned.state.balance,75);assert.equal(storage.writes.length,1);
  assert.equal(economy.creditLearning({eventId:'lesson:1',learned:100}).code,'ALREADY_CLAIMED');
  const loaded=createEconomy({storageAdapter:storage});assert.equal(loaded.creditLearning({eventId:'lesson:1',checkIn:true}).state.balance,75);
  assert.equal(storage.writes.length,1);assert.equal(events.length,1);assert.equal(events[0][0],'account-change');
  assert.equal(events[0][1].operation,'learning');
});

test('invalid or empty learning cannot alter balance or consume the event id',()=>{
  const economy=createEconomy({storageAdapter:null});
  for(const input of [{eventId:'x',learned:101},{eventId:'x',reviewed:-1},{eventId:'x',learned:1.5},{eventId:'x',checkIn:1},{eventId:''},{eventId:'x',learned:NaN},{eventId:'x'}]){
    assert.equal(economy.creditLearning(input).ok,false);assert.equal(economy.getState().balance,0);
  }
  assert.equal(economy.creditLearning({eventId:'x',learned:100,reviewed:100,checkIn:true}).state.balance,1520);
});

test('purchase atomically saves points, unique ownership, request id and the proposed layout',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,initialBalance:500}),layout=plainLayout();
  const bought=economy.purchase('cloud-table',{layout,requestId:'buy:cloud'});
  assert.equal(bought.ok,true);assert.equal(bought.state.balance,320);assert.deepEqual(bought.state.owned,['cloud-table']);
  assert.deepEqual(JSON.parse(storage.writes[0][1]).layout,layout);assert.equal(storage.writes.length,1);
  layout.furniture.table.position[0]=999;assert.equal(economy.getLayout().furniture.table.position[0],1);
  assert.equal(economy.purchase('cloud-table').code,'ALREADY_OWNED');
  assert.equal(economy.purchase('cloud-table',{requestId:'buy:cloud'}).code,'ALREADY_APPLIED');
  assert.equal(economy.purchase('clover-planter',{requestId:'buy:cloud'}).code,'REQUEST_ID_REUSED');
  assert.equal(storage.writes.length,1);
  const loaded=createEconomy({storageAdapter:storage});assert.equal(loaded.purchase('cloud-table',{requestId:'buy:cloud'}).state.balance,320);
});

test('insufficient points, unknown products and invalid options do not record a transaction',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage});
  assert.equal(economy.purchase('unknown').code,'UNKNOWN_SKU');
  assert.equal(economy.purchase('clover-planter',{requestId:'later'}).code,'INSUFFICIENT_POINTS');
  assert.equal(economy.purchase('clover-planter',{requestId:''}).ok,false);assert.equal(economy.purchase('clover-planter',null).ok,false);
  assert.equal(economy.expand({level:2}).ok,false);assert.equal(storage.writes.length,0);
  economy.creditLearning({eventId:'new',learned:12});assert.equal(economy.purchase('clover-planter',{requestId:'later'}).ok,true);
  assert.equal(economy.getState().balance,0);
});

test('expansion charges 600 then 1500, cannot skip a tier, and retries never buy the next tier',()=>{
  const economy=createEconomy({storageAdapter:null,initialBalance:2200});
  assert.equal(economy.getState().nextTier.price,600);
  const first=economy.expand({layout:plainLayout(2),requestId:'expand:1'});assert.equal(first.state.roomLevel,1);assert.equal(first.state.balance,1600);
  assert.equal(economy.expand({requestId:'expand:1'}).code,'ALREADY_APPLIED');assert.equal(economy.getState().roomLevel,1);
  const second=economy.expand({requestId:'expand:2'});assert.equal(second.state.balance,100);assert.equal(second.state.roomLevel,2);assert.equal(second.state.nextTier,null);
  assert.equal(economy.expand().code,'MAX_ROOM_LEVEL');assert.deepEqual(economy.getLayout(),plainLayout(2));
});

test('every failed storage write rolls points, claims, room size, ownership and layout back, then may retry',()=>{
  const storage=memory();let blocked=false;const normalSet=storage.setItem;
  storage.setItem=function(...args){if(blocked)throw new Error('quota');return normalSet.apply(this,args);};
  const events=[],economy=createEconomy({storageAdapter:storage,initialBalance:2000,onEvent:(...args)=>events.push(args)});
  economy.setLayout(plainLayout());const before=JSON.parse(storage.writes[0][1]);blocked=true;
  for(const action of [()=>economy.purchase('reading-shelf',{layout:plainLayout(7),requestId:'retry'}),()=>economy.expand({layout:null}),()=>economy.creditLearning({eventId:'retry',learned:5}),()=>economy.setLayout(null)]){
    const result=action();assert.equal(result.code,'STORAGE_WRITE_FAILED');assert.equal(result.state.valid,false);assert.equal(result.state.writable,false);
    const state=economy.getState();for(const key of Object.keys(before))assert.deepEqual(state[key],before[key]);
    assert.deepEqual(JSON.parse(storage.values.get('original-pet-room-account-v1')),before);
  }
  assert.equal(events.length,1);blocked=false;
  assert.equal(economy.purchase('reading-shelf',{requestId:'retry'}).ok,true);assert.equal(economy.getState().valid,true);
  assert.equal(economy.creditLearning({eventId:'retry',learned:5}).ok,true);
});

test('invalid saved state is not overwritten or silently replaced with a spendable account',()=>{
  for(const raw of ['{broken',JSON.stringify({version:1,balance:-1}),JSON.stringify({version:1,balance:0,roomLevel:0,owned:[],layout:null,claims:[]})]){
    const storage=memory();storage.values.set('account',raw);
    const economy=createEconomy({storageAdapter:storage,storageKey:'account',initialBalance:9999});
    assert.equal(economy.getState().valid,false);assert.equal(economy.purchase('cloud-table').code,'INVALID_STATE');
    assert.equal(economy.creditLearning({eventId:'x',learned:1}).ok,false);assert.equal(storage.writes.length,0);assert.equal(storage.values.get('account'),raw);
  }
});

test('blocked storage getters and read errors are explicit; null memory mode never touches localStorage',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let reads=0;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){reads++;throw new Error('blocked');}});
  try{
    const memoryOnly=createEconomy({storageAdapter:null});assert.equal(memoryOnly.creditLearning({eventId:'memory',learned:1}).ok,true);assert.equal(reads,0);
    const blocked=createEconomy();assert.equal(blocked.getState().error.code,'STORAGE_UNAVAILABLE');assert.equal(blocked.setLayout(null).ok,false);assert.equal(reads,1);
    const failed=createEconomy({storageAdapter:{getItem(){throw 1;},setItem(){assert.fail('must not overwrite');}}});assert.equal(failed.getState().error.code,'STORAGE_READ_FAILED');
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});

test('layout and state are independent plain JSON, rejecting accessors, classes, cycles and oversized layouts',()=>{
  const economy=createEconomy({storageAdapter:null}),layout=plainLayout();assert.equal(economy.setLayout(layout).ok,true);
  const state=economy.getState();state.balance=500;state.owned.push('reading-shelf');state.catalog[0].price=1;state.layout.furniture.table.position[0]=900;
  assert.equal(economy.getState().balance,0);assert.equal(economy.getState().catalog[0].price,120);assert.deepEqual(economy.getLayout(),layout);
  let reads=0;const accessor={};Object.defineProperty(accessor,'x',{enumerable:true,get(){reads++;return 1;}});
  const cycle={};cycle.self=cycle;
  for(const invalid of [accessor,cycle,{number:Infinity},{f(){}},new Date(),[],{big:'x'.repeat(262145)}])assert.equal(economy.setLayout(invalid).ok,false);
  assert.equal(reads,0);assert.deepEqual(economy.getLayout(),layout);assert.equal(economy.setLayout(null).ok,true);
  assert.deepEqual(JSON.parse(JSON.stringify(economy.getState())),economy.getState());
});

test('successful persistence precedes callbacks and callback failures cannot undo a completed transaction',()=>{
  const storage=memory();let reentered,callbacks=0,economy;
  economy=createEconomy({storageAdapter:storage,onEvent(type,detail){callbacks++;assert.equal(JSON.parse(storage.writes.at(-1)[1]).balance,detail.state.balance);if(callbacks===1)reentered=economy.creditLearning({eventId:'second',checkIn:true});throw new Error('host failure');}});
  assert.equal(economy.creditLearning({eventId:'first',learned:1}).ok,true);assert.equal(reentered.ok,true);assert.equal(economy.getState().balance,30);assert.equal(callbacks,2);
});

test('storage adapter reentry is rejected while a transaction is being committed',()=>{
  let economy,reentered;const storage=memory();storage.setItem=function(key,value){reentered=economy.creditLearning({eventId:'nested',learned:10});this.values.set(key,value);};
  economy=createEconomy({storageAdapter:storage});assert.equal(economy.creditLearning({eventId:'outer',learned:1}).ok,true);
  assert.equal(reentered.code,'BUSY');assert.equal(economy.getState().balance,10);assert.deepEqual(economy.getState().claims.learning,['outer']);
});

test('invalid initial balances and safe integer overflow never create spendable invalid points',()=>{
  for(const initialBalance of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const economy=createEconomy({storageAdapter:null,initialBalance});assert.equal(economy.getState().valid,false);assert.equal(economy.purchase('cloud-table').ok,false);
  }
  const economy=createEconomy({storageAdapter:null,initialBalance:Number.MAX_SAFE_INTEGER});
  assert.equal(economy.creditLearning({eventId:'overflow',learned:1}).code,'BALANCE_OVERFLOW');assert.equal(economy.getState().balance,Number.MAX_SAFE_INTEGER);
  assert.deepEqual(economy.getState().claims.learning,[]);
});

test('undefined optional host fields preserve defaults and omitted layouts',()=>{
  const economy=createEconomy({storageAdapter:null,initialBalance:1000});economy.setLayout(plainLayout());
  assert.equal(economy.creditLearning({eventId:'optional',learned:undefined,reviewed:undefined,checkIn:true}).state.balance,1020);
  assert.equal(economy.purchase('clover-planter',{requestId:undefined,layout:undefined}).ok,true);
  assert.deepEqual(economy.getLayout(),plainLayout());assert.equal(economy.expand({requestId:undefined,layout:undefined}).ok,true);
});

test('an asynchronous adapter cannot be reported as a successful synchronous save',()=>{
  const economy=createEconomy({storageAdapter:{getItem:()=>null,setItem:async()=>{throw new Error('offline');}}});
  const result=economy.creditLearning({eventId:'async',learned:1});assert.equal(result.ok,false);assert.equal(result.code,'STORAGE_UNAVAILABLE');
  assert.equal(economy.getState().balance,0);assert.deepEqual(economy.getState().claims.learning,[]);
});

test('reward credits points once per event id and is independent of learning claims',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,initialBalance:0});
  assert.equal(economy.reward({eventId:'checkin:2026-01-01',points:3}).ok,true);
  assert.equal(economy.getState().balance,3);
  // 同一事件幂等，不再加积分
  assert.equal(economy.reward({eventId:'checkin:2026-01-01',points:3}).code,'ALREADY_APPLIED');
  assert.equal(economy.getState().balance,3);
  // 与学习事件互不干扰（同字符串也可分别入账，因为是两套去重表）
  assert.equal(economy.creditLearning({eventId:'checkin:2026-01-01',checkIn:true}).ok,true);
  assert.equal(economy.getState().balance,23);
  // 重新加载后仍然幂等
  const loaded=createEconomy({storageAdapter:storage});
  assert.equal(loaded.reward({eventId:'checkin:2026-01-01',points:3}).code,'ALREADY_APPLIED');
  assert.equal(loaded.getState().balance,23);
});

test('invalid rewards never alter balance',()=>{
  const economy=createEconomy({storageAdapter:null});
  for(const input of [{eventId:'x',points:0},{eventId:'x',points:-1},{eventId:'x',points:100001},{eventId:'x',points:1.5},{eventId:'x',points:NaN},{eventId:''},{eventId:'x'},{eventId:'x',points:1,extra:true}]){
    assert.equal(economy.reward(input).ok,false);
  }
  assert.equal(economy.getState().balance,0);
  assert.deepEqual(economy.getState().claims.rewards,[]);
});

test('legacy accounts without a rewards claim list parse and accept rewards',()=>{
  const legacy=JSON.stringify({version:1,balance:10,roomLevel:0,owned:[],layout:null,claims:{learning:[],requests:[]}});
  const values=new Map([['legacy-account',legacy]]);
  const storage={values,getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);}};
  const economy=createEconomy({storageAdapter:storage,storageKey:'legacy-account'});
  assert.equal(economy.getState().balance,10);
  assert.deepEqual(economy.getState().claims.rewards,[]);
  assert.equal(economy.reward({eventId:'legacy-bonus',points:5}).ok,true);
  assert.equal(economy.getState().balance,15);
  assert.deepEqual(economy.getState().claims.rewards,[{id:'legacy-bonus',points:5}]);
  // 解析后写回的存档含新字段
  assert.ok(storage.values.get('legacy-account').includes('rewards'));
});

test('a storage conflict from another tab is rejected instead of overwriting', () => {
  const values=new Map(),storage={values,getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);}};
  const economy=createEconomy({storageAdapter:storage,storageKey:'conflict-account',initialBalance:100});
  assert.equal(economy.reward({eventId:'a',points:5}).ok,true);
  // 另一个窗口改写了账户
  const external=JSON.parse(values.get('conflict-account'));
  external.balance=999;
  values.set('conflict-account',JSON.stringify(external));
  const conflict=economy.reward({eventId:'b',points:10});
  assert.equal(conflict.ok,false);
  assert.equal(conflict.code,'ARCHIVE_CONFLICT');
  assert.equal(economy.getState().balance,105); // 内存未被污染
  // 重新加载后以存储为准
  const reloaded=createEconomy({storageAdapter:storage,storageKey:'conflict-account'});
  assert.equal(reloaded.getState().balance,999);
});

test('v2.10 setRoomLevel switches freely inside unlocked tiers, never beyond max, and is idempotent',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,initialBalance:4000});
  // 未扩建时只能待在自己的档位
  assert.equal(economy.setRoomLevel(0).ok,true);assert.equal(economy.setRoomLevel(0).code,'SAME_ROOM_LEVEL');
  assert.equal(economy.setRoomLevel(1).code,'LOCKED_ROOM_LEVEL');
  assert.equal(economy.setRoomLevel(-1).code,'INVALID_ROOM_LEVEL');
  assert.equal(economy.setRoomLevel(1.5).code,'INVALID_ROOM_LEVEL');
  assert.equal(economy.setRoomLevel(99).code,'INVALID_ROOM_LEVEL');
  // 扩建解锁 1 级、2 级后，可在已解锁档位任意切换（免费、不退款、不扣分）
  economy.expand({layout:plainLayout(2),requestId:'e1'});
  economy.expand({layout:plainLayout(3),requestId:'e2'});
  assert.equal(economy.getState().maxRoomLevel,2);
  assert.equal(economy.getState().balance,4000-600-1500);
  const down=economy.setRoomLevel(0,{requestId:'back:0'});
  assert.equal(down.ok,true);assert.equal(down.state.roomLevel,0);assert.equal(down.state.balance,4000-600-1500);
  assert.equal(economy.getState().maxRoomLevel,2); // 最高档位记录保留
  assert.equal(economy.setRoomLevel(1,{requestId:'mid:1'}).ok,true);assert.equal(economy.getState().roomLevel,1);
  // requestId 重放不重复扣分/不重复记账
  assert.equal(economy.setRoomLevel(1,{requestId:'mid:1'}).code,'ALREADY_APPLIED');
  // 重新加载后仍能自由切换，且 maxRoomLevel 保留
  const loaded=createEconomy({storageAdapter:storage});
  assert.equal(loaded.getState().maxRoomLevel,2);
  assert.equal(loaded.setRoomLevel(2).ok,true);assert.equal(loaded.getState().roomLevel,2);
  assert.equal(loaded.setRoomLevel(2).code,'SAME_ROOM_LEVEL');
  assert.equal(loaded.setRoomLevel(3).code,'INVALID_ROOM_LEVEL'); // 档位上限之外不存在
});

test('legacy accounts without maxRoomLevel parse and keep roomLevel as their ceiling',()=>{
  const legacy=JSON.stringify({version:1,balance:10,roomLevel:2,owned:[],layout:plainLayout(3),claims:{learning:[],requests:[]}});
  const values=new Map([['legacy-account2',legacy]]);
  const storage={values,getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);}};
  const economy=createEconomy({storageAdapter:storage,storageKey:'legacy-account2'});
  assert.equal(economy.getState().maxRoomLevel,2);
  assert.equal(economy.setRoomLevel(1).ok,true);assert.equal(economy.getState().roomLevel,1);
  assert.equal(economy.getState().maxRoomLevel,2);
});
