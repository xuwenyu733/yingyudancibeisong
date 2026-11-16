import {ROOM_TIME_POLICY,roomDay,settleRoomTime,roomTimeStatus} from './room-time-policy.mjs';
import {databaseNow} from './database-clock.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createRoomUsageService(pool,{clock,policy=ROOM_TIME_POLICY}={}){
 async function update(accountKey,input={}){
  const {sessionId,sequence,active}=input;
  if(sessionId!==undefined&&(!/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)||!Number.isSafeInteger(sequence)||sequence<1||typeof active!=='boolean'))throw fail(400,'在线心跳格式无效');
  const c=await pool.getConnection();
  try{
   await c.beginTransaction();
   const [owners]=await c.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[accountKey]);if(!owners.length)throw fail(401,'请从学习页面重新打开小屋');
   const now=clock?clock():await databaseNow(c),day=roomDay(now);
   await c.execute('INSERT IGNORE INTO room_usage_days(account_key,usage_day,settled_ms) VALUES(?,?,?)',[accountKey,day.key,now]);
   const [rows]=await c.execute('SELECT * FROM room_usage_days WHERE account_key=? AND usage_day=? FOR UPDATE',[accountKey,day.key]);
   const [leases]=await c.execute('SELECT * FROM room_usage_sessions WHERE account_key=?',[accountKey]);
   const row=rows[0],state=settleRoomTime({used:Number(row.used_ms),continuous:Number(row.continuous_ms),settled:Number(row.settled_ms),lastActive:Number(row.last_active_ms),restUntil:Number(row.rest_until_ms)},leases.map(x=>({from:Number(x.starts_ms),until:Number(x.until_ms)})),now,policy);
   const status=roomTimeStatus(state,now,policy);
   if(sessionId!==undefined){
    const old=leases.find(x=>x.session_id===sessionId);
    if(!old||sequence>Number(old.sequence_no)){
     const start=old&&Number(old.until_ms)>=now?Number(old.starts_ms):now,until=active?now+policy.leaseMs:now;
     await c.execute('INSERT INTO room_usage_sessions(account_key,session_id,starts_ms,until_ms,sequence_no) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE starts_ms=VALUES(starts_ms),until_ms=VALUES(until_ms),sequence_no=VALUES(sequence_no)',[accountKey,sessionId,start,until,sequence]);
    }
   }
   await c.execute('UPDATE room_usage_days SET used_ms=?,continuous_ms=?,settled_ms=?,last_active_ms=?,rest_until_ms=? WHERE account_key=? AND usage_day=?',[state.used,state.continuous,state.settled,state.lastActive,state.restUntil,accountKey,day.key]);
   await c.execute('DELETE FROM room_usage_sessions WHERE account_key=? AND until_ms<?',[accountKey,now-300_000]);
   await c.commit();return status;
  }catch(error){await c.rollback();throw error;}finally{c.release();}
 }
 return {update};
}
