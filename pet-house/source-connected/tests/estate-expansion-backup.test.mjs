import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstateStore} from '../estate-state.mjs';
import {expandEstateWithBackup} from '../estate-house.js';
import {addBackup,MAX_BACKUPS,readBackups} from '../backup.mjs';
function fixture(points){const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},estate=createEstateStore({storageAdapter:storage,storageKey:'house',initialPoints:points}),backupsKey='house-estate-backups-v1';for(let i=0;i<MAX_BACKUPS;i++)addBackup({adapter:storage,key:backupsKey,archive:estate.exportArchive().archive,note:'旧备份'+i,now:new Date(1700000000000+i)});return {values,storage,estate,backupsKey};}
test('insufficient points, invalid input and a third-floor attempt leave existing backups untouched',()=>{
 for(const [points,input,code]of [[599,{requestId:'second'},'INSUFFICIENT_POINTS'],[1000,{name:''},'INVALID_NAME'],[1000,{template:'invalid'},'INVALID_TEMPLATE']]){const f=fixture(points),before=new Map(f.values);assert.equal(expandEstateWithBackup({...f,input}).code,code);assert.deepEqual(f.values,before);}
 const f=fixture(1000);f.estate.createRoom({requestId:'second'});const before=new Map(f.values);assert.equal(expandEstateWithBackup({...f,input:{requestId:'third'}}).code,'ROOM_LIMIT');assert.deepEqual(f.values,before);
});
test('successful expansion keeps an actual pre-charge copy and replaying it does not add another backup',()=>{
 const f=fixture(1000),result=expandEstateWithBackup({...f,input:{requestId:'second'}});assert.equal(result.ok,true);assert.equal(result.cost,600);const backups=readBackups(f.storage,f.backupsKey).backups;assert.equal(backups[0].archive.estate.bank.balance,1000);assert.equal(backups[0].archive.estate.rooms.length,1);assert.equal(f.estate.exportArchive().archive.estate.bank.balance,400);
 const before=f.storage.getItem(f.backupsKey);assert.equal(expandEstateWithBackup({...f,input:{requestId:'second'}}).unchanged,true);assert.equal(f.storage.getItem(f.backupsKey),before);
});
