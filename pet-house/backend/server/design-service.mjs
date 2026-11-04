import {randomInt} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
export async function createDesignService(pool,{repository,validate,sourceRoot,chooseCode=()=>String(randomInt(10000)).padStart(4,'0')}={}){
 const {snapshotRoom}=await import(pathToFileURL(resolve(sourceRoot,'room-world.mjs')).href),{createPublishedDesign}=await import(pathToFileURL(resolve(sourceRoot,'design-plan.mjs')).href);
 const limits=new Map();
 function limit(key,max){const now=Date.now();if(limits.size>10000)for(const [key,value]of limits)if(value.until<now)limits.delete(key);let value=limits.get(key);if(!value||value.until<now){value={count:0,until:now+60000};limits.set(key,value);}if(++value.count>max)throw fail(429,'RATE_LIMIT','查询装修码太频繁，请稍后重试');}
 async function publish(me,roomId){
  limit('publish:'+me.accountKey,20);if(typeof roomId!=='string'||!/^room-[1-6]$/.test(roomId))throw fail(400,'INVALID_ROOM','请选择自己的楼层');
  const connection=await pool.getConnection();
  try{
   await connection.beginTransaction();await connection.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[me.accountKey]);
   const saved=await repository.load(me.accountKey,{connection});if(!saved.entries)throw fail(409,'SAVE_FIRST','请先完成装修并同步小屋');
   const valid=validate(me.accountKey,saved.entries),room=valid.archive.estate.rooms.find(item=>item.id===roomId);if(!room)throw fail(404,'ROOM_NOT_FOUND','这层楼还没有建好');
   const snapshot=createPublishedDesign(snapshotRoom(room,{storageKey:me.accountKey,legacyLayout:roomId==='room-1'?saved.entries[me.accountKey]:undefined})),raw=JSON.stringify(snapshot);
   if(Buffer.byteLength(raw)>2*1024*1024)throw fail(413,'DESIGN_TOO_LARGE','装修内容太大，请减少手绘后再分享');
   const [existing]=await connection.execute('SELECT design_code,revision FROM social_room_designs WHERE owner_key=? AND room_id=?',[me.accountKey,roomId]);let code,revision;
   if(existing.length){code=existing[0].design_code;revision=existing[0].revision+1;await connection.execute('UPDATE social_room_designs SET snapshot_json=?,revision=?,updated_at=UTC_TIMESTAMP(3) WHERE design_code=?',[raw,revision,code]);}
   else{
    const [rows]=await connection.execute('SELECT design_code FROM social_room_designs');const used=new Set(rows.map(row=>row.design_code));
    // 4 位码空间为 0000-9999；已满则直接失败，避免每次发布都做上万次插入试探。
    if(used.size>=10000)throw fail(409,'DESIGN_CODES_FULL','4位装修码已全部分配，请联系管理员扩充分享方式');
    // 优先随机候选；仅当随机候选不足时顺序补齐一个未用码，把插入尝试限制在常数次内。
    const candidates=[];
    for(let i=0;i<8;i++){const value=chooseCode();if(/^\d{4}$/.test(value)&&!used.has(value)&&!candidates.includes(value))candidates.push(value);}
    for(let i=0;i<10000&&candidates.length<2;i++){const value=String(i).padStart(4,'0');if(!used.has(value)&&!candidates.includes(value))candidates.push(value);}
    for(const value of candidates){try{await connection.execute('INSERT INTO social_room_designs(design_code,owner_key,room_id,snapshot_json,revision,created_at,updated_at) VALUES(?,?,?,?,1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',[value,me.accountKey,roomId,raw]);code=value;revision=1;break;}catch(error){if(error.code!=='ER_DUP_ENTRY')throw error;}}
    if(!code)throw fail(409,'DESIGN_CODES_FULL','4位装修码已全部分配，请联系管理员扩充分享方式');
   }
   await connection.commit();return {ok:true,code,revision,name:snapshot.name};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 }
 async function find(me,code){limit('read:'+me.accountKey,60);if(typeof code!=='string'||!/^\d{4}$/.test(code))throw fail(400,'INVALID_CODE','请输入完整的4位数字装修码');const [rows]=await pool.execute('SELECT d.snapshot_json,d.design_code,d.revision,a.display_name FROM social_room_designs d JOIN social_accounts a ON a.account_key=d.owner_key WHERE d.design_code=?',[code]);if(!rows.length)throw fail(404,'DESIGN_NOT_FOUND','没有找到这个装修码，请向主人确认');const row=rows[0],snapshot=createPublishedDesign(typeof row.snapshot_json==='string'?JSON.parse(row.snapshot_json):row.snapshot_json);return {ok:true,code:row.design_code,revision:row.revision,name:snapshot.name,authorName:row.display_name,snapshot};}
 return {publish,find};
}
