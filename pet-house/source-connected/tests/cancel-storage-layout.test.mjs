import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from '../vendor/three/three.module.js';
import {createLayoutManager} from '../layout-manager.js';
import {createEconomy} from '../economy.mjs';

const definition={label:'测试家具',boxes:[{center:[0,.1,0],size:[.2,.2,.2]}],blocksNavigation:false,blocksPlacement:false};
function fixture(){
  const storage={data:new Map(),blocked:false,writes:0,getItem(key){return this.data.get(key)??null;},setItem(key,value){if(this.blocked)throw new Error('quota');this.writes++;this.data.set(key,value);}};
  const economy=createEconomy({storageAdapter:storage,storageKey:'cancel-account'});
  const furniture=new Map([['floor-pot',new Group()],['rug',new Group()]]),rug=furniture.get('rug');rug.position.x=3;
  const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10};
  // Same account-backed adapter used by room.js: a successful layout write must
  // update the account, rather than a separate legacy layout key.
  const adapter={getItem(){const value=economy.getLayout();return value?JSON.stringify(value):null;},setItem(key,value){const result=economy.setLayout(JSON.parse(value));if(!result.ok)throw new Error(result.message);}};
  const manager=createLayoutManager({furniture,definitions:{'floor-pot':definition,rug:definition},roomBounds:bounds,navigationBounds:bounds,getPet:()=>({x:5,z:5}),getSeatApproaches:()=>[],storageAdapter:adapter});
  assert.equal(manager.persist(),true);
  function move(){const before=manager.snapshot();manager.previewTransform('floor-pot',{position:[2,0,0]});assert.equal(manager.commit(before),true);}
  function store(){assert.equal(manager.unregisterFurniture('rug'),true);furniture.delete('rug');assert.equal(economy.storeFurniture('rug',{layout:manager.snapshot()}).ok,true);}
  function unstore(){furniture.set('rug',rug);assert.equal(manager.registerFurniture('rug',rug,definition),true);assert.equal(economy.unstoreFurniture('rug',{layout:manager.snapshot()}).ok,true);}
  const reload=()=>createEconomy({storageAdapter:storage,storageKey:'cancel-account'});
  return {manager,storage,economy,move,store,unstore,reload};
}

for(const operation of ['store','unstore'])test(`cancel restores moved furniture after reload while preserving ${operation} transaction`,()=>{
  const room=fixture();if(operation==='unstore')room.store();
  assert.equal(room.manager.beginEdit(),true);room.move();room[operation]();
  assert.equal(room.economy.getLayout().furniture['floor-pot'].position[0],2);
  assert.equal(room.manager.finishEdit({save:false,persist:true}),true);
  const account=room.reload();assert.equal(account.getLayout().furniture['floor-pot'].position[0],0);
  assert.equal(account.getState().stored.includes('rug'),operation==='store');
  assert.equal(Boolean(account.getLayout().furniture.rug),operation==='unstore');
  assert.deepEqual(account.getLayout(),JSON.parse(JSON.stringify(room.manager.snapshot())));
});

test('failed cancel write preserves current scene and retryable session',()=>{
  const room=fixture();room.manager.beginEdit();room.move();room.store();
  const before=room.manager.snapshot();room.storage.blocked=true;
  assert.equal(room.manager.finishEdit({save:false,persist:true}),false);
  assert.equal(room.manager.editing,true);assert.deepEqual(room.manager.snapshot(),before);
  assert.equal(room.economy.getLayout().furniture['floor-pot'].position[0],2);
  room.storage.blocked=false;
  assert.equal(room.manager.finishEdit({save:false,persist:true}),true);
  assert.equal(room.manager.editing,false);assert.equal(room.reload().getLayout().furniture['floor-pot'].position[0],0);
});

test('cancel avoids extra writes without collection changes or when persistence is disabled',()=>{
  const room=fixture();room.manager.beginEdit();room.move();const initialWrites=room.storage.writes;
  assert.equal(room.manager.finishEdit({save:false,persist:true}),true);assert.equal(room.storage.writes,initialWrites);
  room.manager.beginEdit();room.move();room.store();const tradedWrites=room.storage.writes;
  assert.equal(room.manager.finishEdit({save:false,persist:false}),true);assert.equal(room.storage.writes,tradedWrites);
  assert.equal(room.manager.snapshot().furniture['floor-pot'].position[0],0);
});
