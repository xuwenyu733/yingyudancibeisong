import {randomBytes,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createVisitRuntime} from './visit-runtime.mjs';
import {createVisitPublicHomes,visitTarget,displayedVisitItems,publicVisitLayout} from './visit-public-home.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const publicId=value=>typeof value==='string'?value.trim().toUpperCase():'';
const identity=row=>({accountKey:row.account_key,publicId:row.public_id,name:row.display_name});
const peer=row=>({publicId:row.public_id,name:row.display_name});
const pair=(a,b)=>a<b?[a,b]:[b,a];
// 统一把 mysql2 返回的 DATETIME/Date 转成毫秒时间戳；字符串按 UTC 解析，避免本地时区偏移。
const toMillis=value=>{if(value instanceof Date)return value.getTime();if(typeof value==='string'&&value)return Date.parse(value.includes('T')?value:value.replace(' ','T')+'Z');return 0;};
const validPublic=value=>/^PET-[A-F0-9]{10}$/.test(value);
function cleanName(value){const result=typeof value==='string'?value.trim():'';if(!result||[...result].length>20||/[\u0000-\u001f<>]/.test(result))throw fail(400,'INVALID_NAME','昵称需要1至20个字');return result;}
export function createSocialService(pool,{repository,validate,sourceRoot,clock=Date.now}={}){
 const limits=new Map(),presence=createVisitRuntime({now:clock}),publicHome=createVisitPublicHomes(pool,{repository,validate,sourceRoot,now:clock});
 function limit(key,max,window=60000){const now=Date.now();if(limits.size>10000)for(const [key,value]of limits)if(value.until<now)limits.delete(key);let value=limits.get(key);if(!value||value.until<now){value={count:0,until:now+window};limits.set(key,value);}if(++value.count>max)throw fail(429,'RATE_LIMIT','操作太频繁，请稍后再试');}
 async function account(id){const normalized=publicId(id);if(!validPublic(normalized))throw fail(400,'INVALID_ID','请输入完整的好友ID，例如 PET-012345ABCD');const [rows]=await pool.execute('SELECT account_key,public_id,display_name FROM social_accounts WHERE public_id=?',[normalized]);if(!rows.length)throw fail(404,'NOT_FOUND','没有找到这个ID');return rows[0];}
 async function blocked(a,b,connection=pool){const [rows]=await connection.execute('SELECT owner_key FROM social_blocks WHERE (owner_key=? AND peer_key=?) OR (owner_key=? AND peer_key=?) LIMIT 1',[a,b,b,a]);return rows.length>0;}
 async function friendship(a,b,connection=pool,lock=false){const [rows]=await connection.execute('SELECT * FROM social_friendships WHERE user_a=? AND user_b=?'+(lock?' FOR UPDATE':''),pair(a,b));return rows[0];}
 async function friends(a,b,connection=pool,link){const relation=link||await friendship(a,b,connection);if(a===b||await blocked(a,b,connection)||relation?.state!=='accepted')throw fail(403,'FRIEND_REQUIRED','只有双方同意成为好友后才能聊天或参观');return relation;}
 async function pairTransaction(a,b,operation,{create=false}={}){
  const [first,second]=pair(a,b),connection=await pool.getConnection();
  try{await connection.beginTransaction();if(create)await connection.execute("INSERT INTO social_friendships(user_a,user_b,requester,state,updated_at) VALUES(?,?,?,'removed',UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE user_a=user_a",[first,second,a]);const link=await friendship(first,second,connection,true);const result=await operation(connection,link);await connection.commit();return result;}
  catch(error){await connection.rollback();throw error;}finally{connection.release();}
 }
 async function revokePair(connection,a,b){const [rows]=await connection.execute("SELECT invitation_id FROM social_invitations WHERE ((host_key=? AND guest_key=?) OR (host_key=? AND guest_key=?)) AND state IN ('pending','accepted')",[a,b,b,a]);for(const row of rows.sort((left,right)=>left.invitation_id.localeCompare(right.invitation_id)))await connection.execute("UPDATE social_invitations SET state='revoked' WHERE invitation_id=? AND state IN ('pending','accepted')",[row.invitation_id]);}
 async function authenticate(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail(401,'IDENTITY_REQUIRED','请刷新小屋后重试');const [rows]=await pool.execute('SELECT a.account_key,a.public_id,a.display_name FROM social_sessions s JOIN social_accounts a USING(account_key) WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND (a.account_key NOT LIKE \'learner-%\' OR s.created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))',[hash(token)]);if(!rows.length)throw fail(401,'IDENTITY_REQUIRED','小屋身份已失效，请刷新重新进入');return identity(rows[0]);}
 async function enter(token,address,{identity:known}={}){
  if(token){try{const me=known||await authenticate(token);if(me.accountKey.startsWith('learner-'))return {token,identity:me,created:false,persistent:false};await pool.execute('UPDATE social_sessions SET expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 400 DAY) WHERE token_hash=?',[hash(token)]);return {token,identity:me,created:false};}catch(error){if(error.status!==401)throw error;}}
  limit('new-house:'+address,30,3600000);
  for(let i=0;i<4;i++){
   const row={account_key:'user-online-'+randomBytes(12).toString('hex'),public_id:'PET-'+randomBytes(5).toString('hex').toUpperCase(),display_name:'小屋主人'},secret=randomBytes(32).toString('hex'),connection=await pool.getConnection();
   try{await connection.beginTransaction();await connection.execute('INSERT INTO social_accounts(account_key,public_id,display_name,password_salt,password_hash,created_at) VALUES(?,?,?,NULL,NULL,UTC_TIMESTAMP(3))',[row.account_key,row.public_id,row.display_name]);await connection.execute('INSERT INTO social_sessions(token_hash,account_key,expires_at,created_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 400 DAY),UTC_TIMESTAMP(3))',[hash(secret),row.account_key]);await connection.commit();return {token:secret,identity:identity(row),created:true};}
   catch(error){await connection.rollback();if(error.code!=='ER_DUP_ENTRY')throw error;}finally{connection.release();}
  }
  throw fail(503,'ID_BUSY','暂时未能生成小屋ID，请刷新重试');
 }
 async function revoke(me,token,{all=false}={}){
  const connection=await pool.getConnection();try{await connection.beginTransaction();await connection.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[me.accountKey]);
   await connection.execute('DELETE FROM social_sessions WHERE account_key=?'+(all?'':' AND token_hash=?'),[me.accountKey,...(all?[]:[hash(token)])]);
   if(all)await connection.execute('DELETE FROM room_entry_tickets WHERE account_key=?',[me.accountKey]);await connection.commit();return {ok:true};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 }
 async function search(me,id){limit('search:'+me.accountKey,30);const row=await account(id);if(row.account_key===me.accountKey)return {...peer(row),self:true};if(await blocked(me.accountKey,row.account_key))throw fail(404,'NOT_FOUND','没有找到可以添加的账号');const link=await friendship(me.accountKey,row.account_key);return {...peer(row),relation:link?.state||'none'};}
 async function request(me,id){limit('request:'+me.accountKey,20);const target=await account(id);if(target.account_key===me.accountKey)throw fail(400,'SELF_FRIEND','不能添加自己');return pairTransaction(me.accountKey,target.account_key,async(connection,link)=>{if(await blocked(me.accountKey,target.account_key,connection))throw fail(403,'BLOCKED','无法向这个账号发送申请');if(link.state==='accepted')return {ok:true,unchanged:true};if(link.state==='pending'&&link.requester!==me.accountKey)throw fail(409,'INCOMING_REQUEST','对方已向你申请，请在申请列表中同意');await revokePair(connection,me.accountKey,target.account_key);if(link.state!=='pending')await connection.execute("UPDATE social_friendships SET requester=?,state='pending',updated_at=UTC_TIMESTAMP(3) WHERE user_a=? AND user_b=?",[me.accountKey,...pair(me.accountKey,target.account_key)]);return {ok:true};},{create:true});}
 async function respond(me,id,accept){const target=await account(id);return pairTransaction(me.accountKey,target.account_key,async(connection,link)=>{if(await blocked(me.accountKey,target.account_key,connection))throw fail(403,'BLOCKED','这条申请已不可用');if(!link||link.state!=='pending'||link.requester===me.accountKey)throw fail(409,'REQUEST_GONE','申请已处理或不属于你');await revokePair(connection,me.accountKey,target.account_key);await connection.execute("UPDATE social_friendships SET state=?,updated_at=UTC_TIMESTAMP(3) WHERE user_a=? AND user_b=?",[accept?'accepted':'declined',...pair(me.accountKey,target.account_key)]);return {ok:true};});}
 async function remove(me,id){const target=await account(id);return pairTransaction(me.accountKey,target.account_key,async connection=>{await connection.execute("UPDATE social_friendships SET state='removed',updated_at=UTC_TIMESTAMP(3) WHERE user_a=? AND user_b=?",pair(me.accountKey,target.account_key));await revokePair(connection,me.accountKey,target.account_key);return {ok:true};});}
 async function block(me,id,enabled){const target=await account(id);if(target.account_key===me.accountKey)throw fail(400,'SELF_BLOCK','不能屏蔽自己');return pairTransaction(me.accountKey,target.account_key,async connection=>{if(enabled){await connection.execute('INSERT IGNORE INTO social_blocks(owner_key,peer_key,created_at) VALUES(?,?,UTC_TIMESTAMP(3))',[me.accountKey,target.account_key]);await connection.execute("UPDATE social_friendships SET state='removed',updated_at=UTC_TIMESTAMP(3) WHERE user_a=? AND user_b=?",pair(me.accountKey,target.account_key));await revokePair(connection,me.accountKey,target.account_key);}else await connection.execute('DELETE FROM social_blocks WHERE owner_key=? AND peer_key=?',[me.accountKey,target.account_key]);return {ok:true};},{create:enabled});}
 async function overview(me){
  const [links]=await pool.execute("SELECT f.state,f.requester,f.updated_at,a.public_id,a.display_name,a.account_key FROM social_friendships f JOIN social_accounts a ON a.account_key=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END WHERE (f.user_a=? OR f.user_b=?) AND f.state IN ('pending','accepted') AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.owner_key=? AND b.peer_key=a.account_key) OR (b.peer_key=? AND b.owner_key=a.account_key))",[me.accountKey,me.accountKey,me.accountKey,me.accountKey,me.accountKey]);
  const [unread]=await pool.execute('SELECT sender_key,COUNT(*) n FROM social_messages WHERE recipient_key=? AND read_at IS NULL GROUP BY sender_key',[me.accountKey]);const counts=new Map(unread.map(row=>[row.sender_key,Number(row.n)]));
  const [invitations]=await pool.execute("SELECT i.invitation_id,i.state,i.expires_at,i.host_key,i.created_at,a.account_key,a.public_id,a.display_name FROM social_invitations i JOIN social_accounts a ON a.account_key=CASE WHEN i.host_key=? THEN i.guest_key ELSE i.host_key END WHERE (i.host_key=? OR i.guest_key=?) AND i.state IN ('pending','accepted') AND i.expires_at>UTC_TIMESTAMP(3) ORDER BY i.created_at DESC LIMIT 50",[me.accountKey,me.accountKey,me.accountKey]);
  const [blocks]=await pool.execute('SELECT a.public_id,a.display_name FROM social_blocks b JOIN social_accounts a ON a.account_key=b.peer_key WHERE b.owner_key=?',[me.accountKey]);
  return {ok:true,identity:me,friends:links.filter(row=>row.state==='accepted').map(row=>({...peer(row),unread:counts.get(row.account_key)||0})),incoming:links.filter(row=>row.state==='pending'&&row.requester!==me.accountKey).map(peer),outgoing:links.filter(row=>row.state==='pending'&&row.requester===me.accountKey).map(peer),invitations:invitations.filter(row=>links.some(link=>link.state==='accepted'&&link.account_key===row.account_key&&toMillis(row.created_at)>=toMillis(link.updated_at))).map(row=>({id:row.invitation_id,state:row.state,expiresAt:row.expires_at,...peer(row),direction:row.host_key===me.accountKey?'sent':'received'})),blocks:blocks.map(peer)};
 }
 async function send(me,input){limit('message:'+me.accountKey,60);const target=await account(input.peerId);const text=typeof input.text==='string'?input.text.trim():'';if(!text||[...text].length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw fail(400,'INVALID_MESSAGE','消息需要1至1000个字符');if(typeof input.clientId!=='string'||!/^[a-zA-Z0-9:_-]{1,64}$/.test(input.clientId))throw fail(400,'INVALID_MESSAGE_ID','消息编号无效');
  return pairTransaction(me.accountKey,target.account_key,async(connection,link)=>{await friends(me.accountKey,target.account_key,connection,link);
   try{await connection.execute('INSERT INTO social_messages(sender_key,recipient_key,client_id,body,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP(3))',[me.accountKey,target.account_key,input.clientId,text]);}catch(error){if(error.code!=='ER_DUP_ENTRY')throw error;}
   const [rows]=await connection.execute('SELECT CAST(message_id AS CHAR) message_id,recipient_key,body,created_at FROM social_messages WHERE sender_key=? AND client_id=?',[me.accountKey,input.clientId]);const row=rows[0];if(row.recipient_key!==target.account_key||row.body!==text)throw fail(409,'MESSAGE_ID_REUSED','消息编号已用于其他内容');return {ok:true,message:{id:String(row.message_id),text:row.body,sentAt:row.created_at,mine:true}};
  });
 }
 async function messages(me,id,after){const target=await account(id);await friends(me.accountKey,target.account_key);if(after!==undefined&&after!==null&&(!/^\d{1,20}$/.test(String(after))||BigInt(after)>18446744073709551615n))throw fail(400,'INVALID_CURSOR','消息位置无效');const [rows]=await pool.execute('SELECT CAST(message_id AS CHAR) message_id,sender_key,body,created_at FROM social_messages WHERE ((sender_key=? AND recipient_key=?) OR (sender_key=? AND recipient_key=?))'+(after?' AND message_id>?':'')+' ORDER BY social_messages.message_id '+(after?'ASC':'DESC')+' LIMIT 100',[me.accountKey,target.account_key,target.account_key,me.accountKey,...(after?[String(after)]:[])]);if(!after)rows.reverse();await pool.execute('UPDATE social_messages SET read_at=UTC_TIMESTAMP(3) WHERE sender_key=? AND recipient_key=? AND read_at IS NULL AND message_id<=?',[target.account_key,me.accountKey,rows.at(-1)?.message_id||0]);return {ok:true,messages:rows.map(row=>({id:String(row.message_id),text:row.body,sentAt:row.created_at,mine:row.sender_key===me.accountKey}))};}
 async function invite(me,id){limit('invite:'+me.accountKey,20);const target=await account(id);await friends(me.accountKey,target.account_key);const saved=await repository.load(me.accountKey);if(!saved.entries)throw fail(409,'SAVE_FIRST','请先打开并保存自己的小屋');return pairTransaction(me.accountKey,target.account_key,async(connection,link)=>{await friends(me.accountKey,target.account_key,connection,link);const [existing]=await connection.execute("SELECT invitation_id FROM social_invitations WHERE host_key=? AND guest_key=? AND state IN ('pending','accepted') AND expires_at>UTC_TIMESTAMP(3) AND created_at>=? ORDER BY created_at DESC LIMIT 1",[me.accountKey,target.account_key,link.updated_at]);if(existing.length)return {ok:true,id:existing[0].invitation_id};const invitation=randomBytes(16).toString('hex');await connection.execute("INSERT INTO social_invitations(invitation_id,host_key,guest_key,state,expires_at,created_at) VALUES(?,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE),UTC_TIMESTAMP(3))",[invitation,me.accountKey,target.account_key]);return {ok:true,id:invitation};});}
 async function invitation(me,id){if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw fail(404,'INVITATION_GONE','邀请不存在');const [rows]=await pool.execute('SELECT * FROM social_invitations WHERE invitation_id=?',[id]);const row=rows[0];if(!row||![row.host_key,row.guest_key].includes(me.accountKey)||toMillis(row.expires_at)<=Date.now())throw fail(403,'INVITATION_GONE','邀请无效、已过期或不属于你');const link=await friends(row.host_key,row.guest_key);if(toMillis(row.created_at)<toMillis(link.updated_at))throw fail(403,'INVITATION_GONE','好友关系已更新，请让主人重新邀请');return row;}
 async function respondInvite(me,id,action){
  const row=await invitation(me,id);
  if(action==='revoke'){if(row.host_key!==me.accountKey)throw fail(403,'NOT_HOST','只有主人可以结束邀请');}else if(row.guest_key!==me.accountKey)throw fail(403,'NOT_GUEST','只有受邀好友可以处理邀请');
  const state={accept:'accepted',decline:'declined',revoke:'revoked',leave:'left'}[action];if(!state)throw fail(400,'INVALID_ACTION','邀请操作无效');if(!['pending','accepted'].includes(row.state))throw fail(409,'INVITATION_GONE','邀请已经结束');
  if(row.state===state)return {ok:true,unchanged:true};
  const where=action==='revoke'?"state IN ('pending','accepted')":'state=?';
  const [changed]=await pool.execute('UPDATE social_invitations SET state=? WHERE invitation_id=? AND '+where,[state,id,...(action==='revoke'?[]:[row.state])]);
  if(!changed.affectedRows)throw fail(409,'INVITATION_GONE','邀请状态已经变化，请刷新后重试');if(state!=='accepted')presence.removeInvitation(id);return {ok:true};
 }
 async function visit(me,id){const invitationRow=await invitation(me,id);if(invitationRow.guest_key!==me.accountKey||invitationRow.state!=='accepted')throw fail(403,'NOT_INVITED','请先接受发给你的参观邀请');const saved=await repository.load(invitationRow.host_key);if(!saved.entries)throw fail(404,'NO_HOME','主人的小屋暂时无法打开');const valid=validate(invitationRow.host_key,saved.entries),{snapshotRoom}=await import(pathToFileURL(resolve(sourceRoot,'room-world.mjs')).href),{BUILTIN_STORAGE,furnitureProduct}=await import(pathToFileURL(resolve(sourceRoot,'economy.mjs')).href),{giftProduct}=await import(pathToFileURL(resolve(sourceRoot,'gift-catalog.mjs')).href),builtins=new Set(BUILTIN_STORAGE.map(item=>item.id));const [hosts]=await pool.execute('SELECT public_id,display_name FROM social_accounts WHERE account_key=?',[invitationRow.host_key]);
  return {ok:true,homeRevision:saved.revision,host:peer(hosts[0]),expiresAt:invitationRow.expires_at,activePet:valid.archive.estate.bank.activePet,floors:valid.archive.estate.rooms.map(room=>{
   const snapshot=snapshotRoom(room,{storageKey:invitationRow.host_key,legacyLayout:room.id==='room-1'?saved.entries[invitationRow.host_key]:undefined}),displayedItems=displayedVisitItems(snapshot.scene,valid.archive.estate.bank.owned,sku=>{const product=furnitureProduct(sku)||giftProduct(sku);return !!product&&product.category!=='flooring';}),stored=new Set(snapshot.scene.stored),visibleIds=new Set([...builtins].filter(id=>!stored.has(id)).concat(displayedItems.map(sku=>'shop-'+sku)));
   return {id:room.id,floor:room.floor,name:room.name,scene:{roomLevel:snapshot.scene.roomLevel,layout:publicVisitLayout(snapshot.scene.layout,visibleIds),displayedItems,stored:snapshot.scene.stored.filter(sku=>builtins.has(sku)),appearance:snapshot.scene.appearance},decoration:{furnitureStyles:Object.fromEntries(Object.entries(snapshot.companion.furnitureStyles||{}).filter(([id])=>visibleIds.has(id))),theme:snapshot.companion.theme,roomArt:snapshot.companion.roomArt,wallDrawing:snapshot.companion.wallDrawing}};
  })};
 }
 async function rename(me,name){const clean=cleanName(name);await pool.execute('UPDATE social_accounts SET display_name=? WHERE account_key=?',[clean,me.accountKey]);return {ok:true,identity:{...me,name:clean}};}
 function presenceInput(input,{guest=false}={}){
  if(!input||typeof input.sessionId!=='string'||!/^[a-zA-Z0-9_-]{8,64}$/.test(input.sessionId)||!Number.isSafeInteger(input.sequence)||input.sequence<1||typeof input.active!=='boolean'||input.join!==undefined&&typeof input.join!=='boolean'||guest&&(typeof input.id!=='string'||!/^[a-f0-9]{32}$/.test(input.id)))throw fail(400,'INVALID_PRESENCE','来访状态无效');
 }
 function actionInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!['furniture','greet','cancel','seat','release'].includes(input.type)||Object.keys(input).some(key=>!['type','targetId','variant','seatId','actionId'].includes(key)))throw fail(400,'INVALID_VISIT_ACTION','互动操作无效');
  for(const key of ['targetId','variant','seatId','actionId'])if(input[key]!==undefined&&input[key]!==null&&(typeof input[key]!=='string'||input[key].length>160))throw fail(400,'INVALID_VISIT_ACTION','互动目标无效');
  return input;
 }
 async function visitSnapshot(hostKey,knownHome){
  const guests=presence.list(hostKey);
  if(guests.length){
   // Never cache consent, friendship epochs or blocks. One permission query per roster.
   const [rows]=await pool.execute("SELECT i.invitation_id FROM social_invitations i JOIN social_friendships f ON f.user_a=LEAST(i.host_key,i.guest_key) AND f.user_b=GREATEST(i.host_key,i.guest_key) WHERE i.host_key=? AND i.invitation_id IN ("+guests.map(()=>'?').join(',')+") AND i.state='accepted' AND i.expires_at>UTC_TIMESTAMP(3) AND f.state='accepted' AND i.created_at>=f.updated_at AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.owner_key=i.host_key AND b.peer_key=i.guest_key) OR (b.owner_key=i.guest_key AND b.peer_key=i.host_key))",[hostKey,...guests.map(guest=>guest.id)]);
   const allowed=new Set(rows.map(row=>row.invitation_id));for(const guest of guests)if(!allowed.has(guest.id))presence.removeInvitation(guest.id);
  }
  const home=knownHome||await publicHome(hostKey);presence.reconcile(hostKey,home);
  const allowedGuests=presence.list(hostKey),guestHomes=await publicHome.many(allowedGuests.map(guest=>guest.guestKey));
  for(const guest of allowedGuests)presence.refreshPet(guest.guestKey,guestHomes.get(guest.guestKey).pet);
  return presence.snapshot(hostKey,home.revision);
 }
 async function visitPresence(me,input){
  presenceInput(input,{guest:true});limit('presence:'+me.accountKey,120);
  const {id,sessionId,sequence,active,roomId,join}=input;
  if(!active){const current=presence.updateGuest({guestKey:me.accountKey,sessionId,sequence,active:false,id});return current?.hostKey?{...await visitSnapshot(current.hostKey),generation:current.generation}:{ok:true,visitors:[],owner:null,serverNow:clock()};}
  const row=await invitation(me,id);if(row.guest_key!==me.accountKey||row.state!=='accepted')throw fail(403,'NOT_INVITED','参观邀请已经失效');
  const home=await publicHome(row.host_key),floor=home.floors.find(room=>room.id===roomId);if(!floor)throw fail(400,'INVALID_VISIT_FLOOR','这层房间不存在');
  const pet=(await publicHome(me.accountKey)).pet;
  const current=presence.updateGuest({id,guestKey:me.accountKey,hostKey:row.host_key,sessionId,sequence,active,join,publicId:me.publicId,name:me.name,roomId:floor.id,floor:floor.floor,roomName:floor.name,pet});
  return {...await visitSnapshot(row.host_key,home),generation:current.generation};
 }
 async function visitAction(me,input){
  limit('visit-action:'+me.accountKey,60);const action=actionInput(input.action);
  if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,100}$/.test(input.requestId)||typeof input.generation!=='string')throw fail(400,'INVALID_VISIT_ACTION','互动编号无效');
  const invite=await invitation(me,input.id);if(invite.guest_key!==me.accountKey||invite.state!=='accepted')throw fail(403,'NOT_INVITED','参观邀请已经失效');
  const home=await publicHome(invite.host_key);await visitSnapshot(invite.host_key,home);
  const current=presence.currentGuest(me.accountKey,input.sessionId,input.generation),floor=home.floors.find(room=>room.id===input.roomId);
  if(current.id!==input.id||current.hostKey!==invite.host_key||current.roomId!==input.roomId||!floor)throw fail(409,'INVALID_VISIT_FLOOR','房间已切换，请重新操作');
  if(!['furniture','greet','cancel'].includes(action.type))throw fail(400,'INVALID_VISIT_ACTION','来访伙伴的操作无效');
  presence.perform(current,action,{floor,target:action.type==='furniture'?visitTarget(floor,action):null,requestId:input.requestId});
  return {...presence.snapshot(invite.host_key,home.revision),generation:current.generation};
 }
 async function hostPresence(me,input){
  presenceInput(input);limit('host-presence:'+me.accountKey,120);
  const home=await publicHome(me.accountKey),floor=home.floors.find(room=>room.id===input.roomId);
  if(input.active&&(!floor||typeof input.busy!=='boolean'||!floor.inside(input.position)))throw fail(400,'INVALID_HOST_PRESENCE','主人所在房间或位置无效');
  const action=input.action===undefined?null:actionInput(input.action);
  if(input.seatId!==undefined&&input.seatId!==null&&(typeof input.seatId!=='string'||input.seatId.length>160))throw fail(400,'INVALID_VISIT_SEAT','座位状态无效');
  if(input.requestId!==undefined&&(typeof input.requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,100}$/.test(input.requestId)))throw fail(400,'INVALID_VISIT_ACTION','互动编号无效');
  if(action&&presence.hostSequence(me.accountKey,input.sessionId)>=input.sequence)throw fail(409,'VISIT_STALE_ACTION','主人操作已经过时，请重新点击');
  const current=presence.updateHost({hostKey:me.accountKey,sessionId:input.sessionId,sequence:input.sequence,join:input.join,active:input.active,roomId:input.roomId,publicId:me.publicId,name:me.name,pet:home.pet,position:input.active?{x:input.position.x,z:input.position.z}:null,busy:!!input.busy,floor:floor?.floor,roomName:floor?.name});
  await visitSnapshot(me.accountKey,home);
  if(action&&current?.active){
   // Heartbeat position is not a seat claim. Only this atomic action acquires a lease.
   if(presence.currentHost(me.accountKey,input.sessionId,current.generation)!==current)throw fail(409,'VISIT_STALE_ACTION','主人操作已经过时，请重新点击');
   if(action.type==='seat'&&floor.targets.get(action.targetId)?.kind!=='seat')throw fail(400,'INVALID_VISIT_SEAT','这件家具不能坐下');
   presence.perform(current,action,{host:true,floor,target:['furniture','seat'].includes(action.type)?visitTarget(floor,action,{host:true}):null,requestId:input.requestId});
  }else if(current?.active&&current.sequence===input.sequence&&presence.currentHost(me.accountKey,input.sessionId,current.generation)===current){
   const seat=input.seatId&&floor.targets.get(input.seatId);if(seat&&(!seat.position||Math.hypot(current.position.x-seat.position.x,current.position.z-seat.position.z)>2.2))throw fail(400,'INVALID_VISIT_SEAT','主人还没有到达这个座位');
   presence.syncHostSeat(current,input.seatId,{floor,target:input.seatId?floor.targets.get(input.seatId):null});
  }
  return {...presence.snapshot(me.accountKey,home.revision),generation:current?.generation};
 }
 async function visitors(me){return visitSnapshot(me.accountKey);}

 return {authenticate,enter,revoke,search,request,respond,remove,block,overview,send,messages,invite,respondInvite,visit,rename,visitPresence,visitAction,hostPresence,visitors};
}
