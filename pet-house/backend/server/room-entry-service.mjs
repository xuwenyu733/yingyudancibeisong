import {randomBytes,createHash} from 'node:crypto';
import {limitAccountSessions} from './session-maintenance.mjs';
import {entryTransaction} from './entry-transaction.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createRoomEntryService(pool,{learningApi='http://127.0.0.1:3010/api',fetcher=fetch,onVerifiedIdentity}={}){
 const upstream=new URL(learningApi);if(!['http:','https:'].includes(upstream.protocol)||upstream.username||upstream.password)throw new Error('学习接口地址无效');
 async function ticket(authorization){
  if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_.-]{20,4096}$/.test(authorization))throw fail(401,'请从已登录的学习页面进入仓鼠屋');
  let response;try{response=await fetcher(learningApi.replace(/\/$/,'')+'/children',{headers:{Authorization:authorization},signal:AbortSignal.timeout(5000),redirect:'error'});}catch{throw fail(503,'暂时无法核验学习账号，请稍后再试');}
  if(!response.ok)throw fail(response.status===401?401:503,'学习账号已失效，请返回学习页面重新登录');
  const data=await response.json(),child=Array.isArray(data?.items)&&data.items.find(x=>typeof x?.id==='string'&&x.id===data.currentChildId);
  if(!child||child.id.length>160)throw fail(409,'请先在学习页面选择孩子，再进入仓鼠屋');
  const key='learner-'+hash(learningApi+'|'+child.id).slice(0,48),name=String(child.nickname||'小屋主人').replace(/[\u0000-\u001f<>]/g,'').slice(0,20)||'小屋主人';
  const issued=await entryTransaction(pool,async c=>{
   let owner;for(let attempt=0;attempt<5;attempt++){
    // INSERT first serializes simultaneous first entries without a stale
    // repeatable-read snapshot. A public-ID collision simply retries.
    await c.execute('INSERT INTO social_accounts(account_key,public_id,display_name,password_salt,password_hash,created_at) VALUES(?,?,?,NULL,NULL,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE account_key=account_key',[key,'PET-'+randomBytes(5).toString('hex').toUpperCase(),name]);
    const [rows]=await c.execute('SELECT account_key,public_id,display_name FROM social_accounts WHERE account_key=? FOR UPDATE',[key]);if(rows.length){owner=rows[0];break;}
   }
   if(!owner)throw fail(503,'暂时未能准备小屋身份，请重试');
   const secret=randomBytes(32).toString('hex');await c.execute('INSERT INTO room_entry_tickets(ticket_hash,account_key,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE))',[hash(secret),key]);
   const [tickets]=await c.execute('SELECT ticket_hash FROM room_entry_tickets WHERE account_key=? ORDER BY (ticket_hash=?) DESC,expires_at DESC',[key,hash(secret)]),expired=tickets.slice(8);
   // Delete known excess primary keys only. NOT IN range deletion can lock
   // adjacent accounts' index gaps and deadlock independent first entries.
   for(let at=0;at<expired.length;at+=200){const hashes=expired.slice(at,at+200).map(row=>row.ticket_hash);await c.execute('DELETE FROM room_entry_tickets WHERE account_key=? AND ticket_hash IN ('+hashes.map(()=>'?').join(',')+')',[key,...hashes]);}
   return {ok:true,ticket:secret};
  });
  if(onVerifiedIdentity)try{await onVerifiedIdentity({accountKey:key,authorization,child});}catch{console.warn('学习奖励暂未同步，将在下次入屋时重试');}
  return issued;
 }
 async function redeem(secret){
  if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw fail(401,'入屋凭据无效，请从学习页面重新打开');
  return entryTransaction(pool,async c=>{
   const [candidate]=await c.execute('SELECT account_key FROM room_entry_tickets WHERE ticket_hash=? AND expires_at>UTC_TIMESTAMP(3)',[hash(secret)]);
   if(!candidate.length)throw fail(401,'入屋凭据已用过或已过期，请从学习页面重新打开');
   await c.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[candidate[0].account_key]);
   const [rows]=await c.execute('SELECT t.account_key,a.public_id,a.display_name FROM room_entry_tickets t JOIN social_accounts a USING(account_key) WHERE t.ticket_hash=? AND t.expires_at>UTC_TIMESTAMP(3) FOR UPDATE',[hash(secret)]);
   if(!rows.length)throw fail(401,'入屋凭据已用过或已过期，请从学习页面重新打开');const owner=rows[0],token=randomBytes(32).toString('hex');
   await c.execute('DELETE FROM room_entry_tickets WHERE ticket_hash=?',[hash(secret)]);
   await c.execute('INSERT INTO social_sessions(token_hash,account_key,expires_at,created_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR),UTC_TIMESTAMP(3))',[hash(token),owner.account_key]);await limitAccountSessions(c,owner.account_key,hash(token));
   return {ok:true,accessToken:token,identity:{accountKey:owner.account_key,publicId:owner.public_id,name:owner.display_name}};
  });
 }
 return {ticket,redeem};
}
