import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy} from '../economy.mjs';
import {grantDemoTestPoints,DEMO_TEST_POINTS_EVENT} from '../demo-points.mjs';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('demo test currency credits 50000 once and preserves purchases, room unlocks and layout',()=>{
  const storage=memory(),key='test-room',ledger=createEconomy({storageAdapter:storage,storageKey:`${key}-account-v1`,initialBalance:3000});
  assert.equal(ledger.purchase('tile-honey-grid',{requestId:'floor'}).ok,true);
  assert.equal(ledger.expand({requestId:'bigger',layout:{version:3,furniture:{fixture:{position:[1,0,2]}}}}).ok,true);
  assert.equal(ledger.purchasePet('mint-cat',{requestId:'cat'}).ok,true);
  const before=ledger.getState(),result=grantDemoTestPoints({storageAdapter:storage,storageKey:key});
  assert.equal(result.ok,true,result.message);assert.equal(result.state.balance,before.balance+50000);
  for(const field of ['owned','stored','roomLevel','maxRoomLevel','layout','appearance','petOwned','activePet','totalSpent'])assert.deepEqual(result.state[field],before[field]);
  assert.equal(grantDemoTestPoints({storageAdapter:storage,storageKey:key}).code,'ALREADY_APPLIED');
  const loaded=createEconomy({storageAdapter:storage,storageKey:`${key}-account-v1`});
  loaded.spend({eventId:'after-grant',points:100,reason:'test'});
  const replay=grantDemoTestPoints({storageAdapter:storage,storageKey:key});assert.equal(replay.state.balance,before.balance+49900);
  assert.equal(replay.state.claims.rewards.filter(item=>item.id===DEMO_TEST_POINTS_EVENT).length,1);
});
test('broken demo accounts are retained without replacement',()=>{
  const storage=memory();storage.setItem('broken-account-v1','broken');
  assert.equal(grantDemoTestPoints({storageAdapter:storage,storageKey:'broken'}).ok,false);
  assert.equal(storage.getItem('broken-account-v1'),'broken');
});
