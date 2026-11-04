import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy,PET_CATALOG} from '../economy.mjs';

const key='pet-account';
function memory(){const values=new Map(),writes=[];return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push([key,value]);values.set(key,value);}};}
const load=storage=>createEconomy({storageAdapter:storage,storageKey:key});

test('new accounts own a free fox and expose four distinct redeemable pets',()=>{
  const economy=createEconomy({storageAdapter:null});
  assert.deepEqual(PET_CATALOG.map(item=>[item.sku,item.price]),[['apricot-fox',0],['cloud-bunny',300],['mint-cat',400],['cocoa-bear',500],['starlight-penguin',650]]);
  assert.deepEqual(economy.getState().pets.owned,['apricot-fox']);
  assert.equal(economy.getState().pets.active,'apricot-fox');
  const snapshot=economy.getState();snapshot.pets.catalog[1].price=1;snapshot.pets.owned.push('mint-cat');
  assert.equal(economy.getState().pets.catalog[1].price,300);
  assert.deepEqual(economy.getState().pets.owned,['apricot-fox']);
});

test('pet redemption atomically deducts points, swaps ownership to one pet, selects it and survives reload',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,storageKey:key,initialBalance:1000});
  const result=economy.purchasePet('cloud-bunny','pet:bunny');
  assert.equal(result.ok,true);assert.equal(result.state.balance,700);assert.equal(result.state.totalSpent,300);
  // v2.23 单宠制：兑换后宠物列表只有新伙伴，原来的狐狸先去休息（可用积分再换回来）。
  assert.deepEqual(result.state.pets.owned,['cloud-bunny']);assert.equal(result.state.pets.active,'cloud-bunny');
  assert.equal(storage.writes.length,1);
  const saved=JSON.parse(storage.writes[0][1]);assert.deepEqual(saved.petOwned,['cloud-bunny']);assert.equal(saved.activePet,'cloud-bunny');assert.equal(Object.hasOwn(saved,'pets'),false);
  const loaded=load(storage);assert.equal(loaded.getState().valid,true);assert.equal(loaded.getState().balance,700);assert.equal(loaded.getState().pets.active,'cloud-bunny');
  assert.equal(loaded.purchasePet('cloud-bunny',{requestId:'pet:bunny'}).code,'ALREADY_APPLIED');
  assert.equal(storage.writes.length,1);assert.equal(loaded.getState().balance,700);
  assert.equal(loaded.purchasePet('cloud-bunny','pet:duplicate').code,'ALREADY_OWNED');
  assert.equal(loaded.purchasePet('mint-cat','pet:bunny').code,'REQUEST_ID_REUSED');
  assert.equal(loaded.purchase('cloud-table',{requestId:'pet:bunny'}).code,'REQUEST_ID_REUSED');
});

test('v2.23: 单宠制下每人同时只有一只宠物，积分兑换即更换，不能免费切换未拥有的伙伴',()=>{
  const storage=memory(),economy=createEconomy({storageAdapter:storage,storageKey:key,initialBalance:300});
  assert.equal(economy.selectPet('mint-cat').code,'NOT_OWNED');assert.equal(economy.selectPet('unknown').code,'UNKNOWN_PET');
  assert.equal(economy.purchasePet('cloud-bunny').ok,true);
  assert.deepEqual(economy.getState().pets.owned,['cloud-bunny']);assert.equal(economy.getState().balance,0);assert.equal(economy.getState().totalSpent,300);
  assert.equal(economy.selectPet('apricot-fox').code,'NOT_OWNED','狐狸已去休息，不能免费切换回来');
  assert.equal(load(storage).getState().pets.active,'cloud-bunny');
  assert.equal(economy.selectPet('cloud-bunny').code,'ALREADY_SELECTED');
  // 兑换默认狐狸（0 积分）可以换回来：单宠制下永远是“兑换即更换”。
  assert.equal(economy.purchasePet('apricot-fox','back-to-fox').ok,true);
  assert.deepEqual(economy.getState().pets.owned,['apricot-fox']);assert.equal(economy.getState().pets.active,'apricot-fox');
  assert.equal(economy.getState().balance,0);assert.equal(storage.writes.length,2);
});

test('invalid pet orders and insufficient points consume neither points nor request ids',()=>{
  const economy=createEconomy({storageAdapter:null,initialBalance:299});
  assert.equal(economy.purchasePet('cloud-bunny','retry').code,'INSUFFICIENT_POINTS');
  assert.equal(economy.purchasePet('unknown','bad').code,'UNKNOWN_PET');
  for(const input of ['',null,{requestId:''},{requestId:12},{other:true}])assert.equal(economy.purchasePet('cloud-bunny',input).ok,false);
  assert.equal(economy.getState().balance,299);assert.deepEqual(economy.getState().claims.requests,[]);
  economy.reward({eventId:'one',points:1});assert.equal(economy.purchasePet('cloud-bunny','retry').ok,true);assert.equal(economy.getState().balance,0);
});

test('failed pet storage writes roll back deduction, ownership, selection and request claim',()=>{
  const storage=memory();let blocked=false;const write=storage.setItem;
  storage.setItem=function(...args){if(blocked)throw new Error('full');write.apply(this,args);};
  const economy=createEconomy({storageAdapter:storage,storageKey:key,initialBalance:1000});
  economy.setLayout(null);blocked=true;
  assert.equal(economy.purchasePet('cocoa-bear','retry').code,'STORAGE_WRITE_FAILED');
  assert.equal(economy.getState().balance,1000);assert.equal(economy.getState().totalSpent,0);
  assert.deepEqual(economy.getState().pets.owned,['apricot-fox']);assert.equal(economy.getState().pets.active,'apricot-fox');assert.deepEqual(economy.getState().claims.requests,[]);
  blocked=false;assert.equal(economy.purchasePet('cocoa-bear','retry').ok,true);
  assert.deepEqual(economy.getState().pets.owned,['cocoa-bear']);assert.equal(economy.getState().pets.active,'cocoa-bear');
  // v2.23：单宠制下“兑换更换”同样必须整笔原子回滚（扣分、产权、选中都退回）。
  blocked=true;
  assert.equal(economy.purchasePet('cloud-bunny','swap-fail').code,'STORAGE_WRITE_FAILED');
  assert.deepEqual(economy.getState().pets.owned,['cocoa-bear']);assert.equal(economy.getState().pets.active,'cocoa-bear');
  assert.equal(economy.getState().balance,500);assert.equal(economy.getState().totalSpent,500);assert.equal(economy.getState().claims.requests.some(request=>request.sku==='cloud-bunny'),false);
});

test('legacy furniture accounts migrate without resetting furniture, stored inventory, points or layout',()=>{
  const storage=memory(),layout={version:3,furniture:{}};
  storage.values.set(key,JSON.stringify({version:1,balance:812,roomLevel:1,owned:['cloud-table'],stored:['cloud-table','rug'],layout,claims:{learning:[],requests:[{id:'old',operation:'purchase',sku:'cloud-table'}]},totalSpent:780}));
  const economy=load(storage),state=economy.getState();assert.equal(state.valid,true);assert.equal(state.balance,812);assert.equal(state.roomLevel,1);
  assert.deepEqual(state.owned,['cloud-table']);assert.deepEqual(state.stored,['cloud-table','rug']);assert.deepEqual(state.layout,layout);
  assert.deepEqual(state.pets.owned,['apricot-fox']);assert.equal(economy.purchasePet('mint-cat').ok,true);
  assert.equal(load(storage).getState().pets.active,'mint-cat');assert.deepEqual(load(storage).getState().stored,['cloud-table','rug']);
});

test('tampered pet ownership and active selection are rejected',()=>{
  // v2.23 单宠制下：宠物列表必须恰好一只且等于当前伙伴；空列表、重复、未知宠物、伙伴不在列表内一律拒绝。
  for(const patch of [{petOwned:['apricot-fox','unknown']},{petOwned:['apricot-fox','apricot-fox']},{petOwned:[]},{activePet:'mint-cat'},{petOwned:['cloud-bunny']}]){
    const storage=memory();storage.values.set(key,JSON.stringify({version:1,balance:1000,roomLevel:0,owned:[],stored:[],layout:null,claims:{learning:[],requests:[]},totalSpent:0,...patch}));
    assert.equal(load(storage).getState().valid,false);assert.equal(storage.writes.length,0);
  }
  // 兑换请求指向未拥有的宠物是合法操作（兑换即更换），存档可正常读取。
  const storage=memory();storage.values.set(key,JSON.stringify({version:1,balance:1000,roomLevel:0,owned:[],stored:[],layout:null,claims:{learning:[],requests:[{id:'valid',operation:'purchase-pet',sku:'mint-cat'}]},totalSpent:0}));
  assert.equal(load(storage).getState().valid,true);
});

test('two fresh pages cannot overwrite the first pet purchase or its deduction',()=>{
  const storage=memory(),first=createEconomy({storageAdapter:storage,storageKey:key,initialBalance:1000}),stale=createEconomy({storageAdapter:storage,storageKey:key,initialBalance:1000});
  assert.equal(first.purchasePet('mint-cat','first').ok,true);
  assert.equal(stale.purchasePet('cloud-bunny','stale').code,'ARCHIVE_CONFLICT');
  const current=load(storage).getState();assert.equal(current.balance,600);assert.deepEqual(current.pets.owned,['mint-cat']);
  assert.equal(storage.writes.length,1);
});
