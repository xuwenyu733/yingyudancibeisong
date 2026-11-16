export const MAX_ACCOUNT_SESSIONS=8;
export async function limitAccountSessions(connection,accountKey,currentHash){
 // The caller holds the account row lock; keep the newly issued token even if
 // several logins have the same millisecond timestamp.
 await connection.execute('DELETE FROM social_sessions WHERE account_key=? AND (expires_at<=UTC_TIMESTAMP(3) OR (account_key LIKE \'learner-%\' AND created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)))',[accountKey]);
 const [keep]=await connection.execute('SELECT token_hash FROM social_sessions WHERE account_key=? ORDER BY (token_hash=?) DESC,created_at DESC,token_hash DESC LIMIT '+MAX_ACCOUNT_SESSIONS+' FOR UPDATE',[accountKey,currentHash]);
 if(keep.length)await connection.execute('DELETE FROM social_sessions WHERE account_key=? AND token_hash NOT IN ('+keep.map(()=>'?').join(',')+')',[accountKey,...keep.map(row=>row.token_hash)]);
}
export function createSessionMaintenance(pool,{intervalMs=60000,tickets=true,life=false,clock=Date.now,onError=()=>{}}={}){
 let pending=null,closed=false;
 async function run(){
  if(closed)return;if(pending)return pending;
  pending=(async()=>{
   await pool.execute("DELETE FROM social_sessions WHERE expires_at<=UTC_TIMESTAMP(3) OR (account_key LIKE 'learner-%' AND created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)) LIMIT 500");
   if(tickets)await pool.execute('DELETE FROM room_entry_tickets WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 500');
   if(life)await pool.execute("DELETE FROM room_life_requests WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(response,'$.requestWindowUntil')) AS UNSIGNED)<? LIMIT 200",[Number(clock())]);
  })();
  try{await pending;}finally{pending=null;}
 }
 const timer=setInterval(()=>void run().catch(onError),intervalMs);timer.unref?.();
 return {run,async close(){closed=true;clearInterval(timer);await pending?.catch(()=>{});}};
}
