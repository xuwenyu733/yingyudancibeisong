import {createEconomy} from './economy.mjs';

// Invoked only by the standalone demo, never by the embeddable room API.
// A fixed receipt prevents refreshes from repeatedly issuing test currency.
export const DEMO_TEST_POINTS_EVENT='demo-test-credit-50000-v2.15.1';
export function grantDemoTestPoints({storageAdapter,storageKey}={}){
  const account=createEconomy({storageAdapter,storageKey:`${storageKey}-account-v1`,initialBalance:0});
  if(!account.getState().valid)return {ok:false,message:'测试积分未发放，账户存档需要先恢复'};
  return account.reward({eventId:DEMO_TEST_POINTS_EVENT,points:50000,reason:'用户要求的演示测试积分'});
}
