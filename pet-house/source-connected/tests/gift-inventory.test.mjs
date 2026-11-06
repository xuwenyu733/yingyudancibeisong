import test from 'node:test';import assert from 'node:assert/strict';
import {createEconomy} from '../economy.mjs';
import {giftProduct,giftSku,giftCatalog} from '../gift-catalog.mjs';
import {createEstateStore} from '../estate-state.mjs';
import {createGiftFurniture} from '../gift-models.mjs';
import {badgeTest} from '../profile.mjs';
import {MeshLambertMaterial,Box3} from '../vendor/three/three.module.js';
const storage=()=>({values:new Map(),blocked:false,getItem(key){return this.values.get(key)??null;},setItem(key,value){if(this.blocked)throw new Error('full');this.values.set(key,value);},removeItem(key){this.values.delete(key);}});
test('each reward has its own free inventory SKU; grants, collection and request replay preserve balance',()=>{
 const adapter=storage(),ledger=createEconomy({storageAdapter:adapter,storageKey:'gifts',initialBalance:500});
 const a=giftSku({kind:'star',id:'visit-2026-10-29'}),b=giftSku({kind:'star',id:'secret-star'});assert.notEqual(a,b);
 assert.equal(ledger.purchase(a,{requestId:'buy-gift'}).ok,false,'gifts cannot be purchased or bypass their reward');
 assert.equal(ledger.grantGift(a,'gift:a').ok,true);assert.equal(ledger.grantGift(b,'gift:b').ok,true);
 assert.equal(ledger.getState().balance,500);assert.deepEqual(ledger.getState().stored,[a,b]);assert.equal(ledger.getState().totalSpent,0);
 assert.equal(ledger.unstoreFurniture(a,{requestId:'put:a'}).ok,true);assert.equal(ledger.storeFurniture(a,{requestId:'take:a'}).ok,true);
 assert.equal(ledger.grantGift(a,'gift:a').code,'ALREADY_APPLIED');assert.equal(ledger.getState().owned.length,2);
 const reopened=createEconomy({storageAdapter:adapter,storageKey:'gifts'});assert.equal(reopened.getState().valid,true);assert.equal(reopened.getState().balance,500);
 assert.equal(badgeTest({id:'first-purchase'},{},reopened.getState()),false,'gifts are not fabricated shop purchases');
});
test('gift grant failure is atomic and can retry the same receipt',()=>{
 const adapter=storage(),ledger=createEconomy({storageAdapter:adapter,storageKey:'gifts',initialBalance:50}),sku=giftSku({kind:'pumpkin',id:'stamp-2026-10-3'});
 adapter.blocked=true;assert.equal(ledger.grantGift(sku,'gift:retry').ok,false);assert.deepEqual(ledger.getState().owned,[]);assert.equal(adapter.getItem('gifts'),null);
 adapter.blocked=false;assert.equal(ledger.grantGift(sku,'gift:retry').ok,true);assert.equal(ledger.getState().balance,50);
 assert.equal(ledger.grantGift('gift-bad-x','gift:bad').ok,false);assert.equal(giftProduct('gift-star-../x'),null);
});
test('gift collection and grants share across floors while placement and store receipts remain local',()=>{
 const adapter=storage(),estate=createEstateStore({storageAdapter:adapter,storageKey:'estate',initialPoints:700}),room=estate.createRoom({name:'二楼'}).roomId;
 const a=createEconomy({storageAdapter:estate.storageForRoom('room-1'),storageKey:'estate-account-v1'}),sku=giftSku({kind:'lantern',id:'new-year'});
 assert.equal(a.grantGift(sku,'gift:year').ok,true);const b=createEconomy({storageAdapter:estate.storageForRoom(room),storageKey:'estate-account-v1'});assert.equal(b.getState().owned.includes(sku),true);assert.equal(b.getState().stored.includes(sku),true);
 assert.equal(a.unstoreFurniture(sku,{requestId:'put'}).ok,true);assert.equal(b.getState().stored.includes(sku),true);assert.equal(a.getState().stored.includes(sku),false);
 const save=estate.exportArchive();assert.equal(save.ok,true);assert.equal(estate.importArchive(save.archive).ok,true);assert.equal(estate.getState().valid,true);
});
test('gift expiry keeps metadata and models are real editable bounded meshes for all four kinds',()=>{
 const time=Date.parse('2026-10-29T10:00:00Z'),entries=giftCatalog([{id:'old',name:'旧礼物',kind:'star',expiresAt:'2026-10-28T00:00:00Z'},{id:'new',name:'新礼物',kind:'flower',expiresAt:null}],time);
 assert.equal(entries[0].expired,true);assert.equal(entries[1].expired,false);assert.equal(entries[0].rewardId,'old');
 const material=new MeshLambertMaterial(),counts=[];
 for(const kind of ['star','pumpkin','lantern','flower']){const sku=giftSku({kind,id:'test'}),item=createGiftFurniture(sku,()=>material);assert.equal(item.root.name,`shop-${sku}`);assert.equal(item.definition.draggable,true);assert.equal(new Box3().setFromObject(item.root).isEmpty(),false);counts.push(item.root.children.length);item.root.traverse(node=>node.geometry?.dispose());}assert.ok(new Set(counts).size>2);material.dispose();
});
