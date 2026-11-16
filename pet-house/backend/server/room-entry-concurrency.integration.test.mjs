import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';
import {createRoomEntryService} from './room-entry-service.mjs';
test('real MySQL repeated simultaneous first entries keep one identity and one-use independent sessions',{skip:process.env.PET_ROOM_SOCIAL_INTEGRATION!=='1'},async()=>{
 const config=await loadConfig(),pool=mysql.createPool(connectionOptions(config)),keys=new Set(),errors=[];
 const instrumented={async getConnection(){const connection=await pool.getConnection();return new Proxy(connection,{get(target,key){if(key==='execute')return async(sql,args)=>{try{return await target.execute(sql,args);}catch(error){errors.push({code:error.code,errno:error.errno,operation:sql.split(' ').slice(0,3).join(' ')});throw error;}};const value=target[key];return typeof value==='function'?value.bind(target):value;}});}};
 try{
  for(let round=0;round<30;round++){
   const entries=Array.from({length:2},()=>{const childId='entry-race-'+randomBytes(10).toString('hex'),key='learner-'+createHash('sha256').update(config.learningApi+'|'+childId).digest('hex').slice(0,48);keys.add(key);return {key,entry:createRoomEntryService(instrumented,{learningApi:config.learningApi,fetcher:async()=>Response.json({currentChildId:childId,items:[{id:childId,nickname:'并发回归测试'}]})})};});
   const results=await Promise.allSettled(entries.flatMap(({entry,key})=>Array.from({length:2},async()=>{const issued=await entry.ticket('Bearer '+'a'.repeat(40));const entered=await entry.redeem(issued.ticket);assert.equal(entered.identity.accountKey,key);return entered;})));
   const rejected=results.filter(row=>row.status==='rejected');assert.equal(rejected.length,0,JSON.stringify(errors));
   const sessions=results.map(row=>row.value);assert.equal(new Set(sessions.map(row=>row.identity.accountKey)).size,2);assert.equal(new Set(sessions.map(row=>row.accessToken)).size,4);
   const hashes=sessions.map(row=>createHash('sha256').update(row.accessToken).digest('hex')),[live]=await pool.execute('SELECT COUNT(*) n FROM social_sessions WHERE token_hash IN ('+hashes.map(()=>'?').join(',')+') AND expires_at>UTC_TIMESTAMP(3)',hashes);assert.equal(Number(live[0].n),4,'waiting for the account lock must not prune sessions hidden by an older repeatable-read snapshot');
  }
 }finally{for(const key of keys)await pool.execute('DELETE FROM social_accounts WHERE account_key=?',[key]);await pool.end();}
});
