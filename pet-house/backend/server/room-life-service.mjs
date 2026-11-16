import {createHash,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requestWindow} from './request-window.mjs';
import {databaseNow} from './database-clock.mjs';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const fail=(status,message,code='LIFE_REJECTED')=>Object.assign(new Error(message),{status,code});
const title=value=>{if(typeof value!=='string')throw fail(400,'请填写作品标题');const text=value.trim().replace(/[<>\u0000-\u001f]/g,'');if(!text||[...text].length>40)throw fail(400,'标题需要1至40个字');return text;};
const key=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,80}$/.test(value);
const hash=value=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
const schema={
 'focus-challenge':['id'],'claim-challenge':['id'],'collect-stamp':['id'],'feed-pet':['id'],
 'accept-quest':['id'],'claim-quest':['id'],'claim-set':['id'],craft:['id'],'buy-material':['id','quantity'],plant:['slot','crop'],water:['slot'],harvest:['slot'],cook:['id'],deliver:['id'],'choose-job':['id'],'claim-career':['id'],'wear-career':['id'],'story-next':['choice'],
 'photo-save':['title','image'],'photo-delete':['id'],'publish':['photoId','title','theme'],'post-delete':['id'],reaction:['id','reaction'],favorite:['id','enabled'],'restore-rewards':[],
};
export async function createRoomLifeService(pool,{repository,validate,sourceRoot,clock}={}){
 const load=name=>import(pathToFileURL(resolve(sourceRoot,name)).href);
 const [{LIFE_CATALOG:catalog},{newLifeState,validateLifeState,applyLifeAction},{createEstateStore},{createEconomy,SHOP_CATALOG,BUILTIN_STORAGE},{createCompanionStore,COMPANION_SUFFIX},{giftSku}]=await Promise.all(['life-catalog.mjs','life-engine.mjs','estate-state.mjs','economy.mjs','companion-state.mjs','gift-catalog.mjs'].map(load));
 const {HOME_CHALLENGES,evaluateHomeChallenge}=await load('room-adventures.mjs');
 const movable=new Set(SHOP_CATALOG.filter(x=>x.category!=='flooring').map(x=>x.sku));
 const now=c=>clock?clock():databaseNow(c);
 async function initialize(c,account){await c.execute('INSERT IGNORE INTO room_life_accounts(account_key,state) VALUES(?,?)',[account,JSON.stringify(newLifeState())]);}
 function homeContext(account,home,roomId){
  if(!home.entries)throw fail(409,'请先打开仓鼠屋，等待装修同步完成');const saved=validate(account,home.entries).archive,estate=saved.estate;
  const room=estate.rooms.find(x=>x.id===(roomId||estate.activeRoomId));if(!room||room.id!==estate.activeRoomId)throw fail(409,'楼层已切换，请重新打开生活面板');
  const stored=new Set(room.scene.stored),owned=estate.bank.owned;
  return {archive:saved,room,owned,placed:[...BUILTIN_STORAGE.map(x=>x.id),...owned.filter(x=>movable.has(x))].filter(x=>!stored.has(x)),hasDrawing:!!room.companion.wallDrawing?.strokes?.length};
 }
 async function readState(account,{connection=pool}={}){
  await initialize(connection,account);
  const [rows]=await connection.execute('SELECT revision,state FROM room_life_accounts WHERE account_key=?',[account]),state=validateLifeState(parse(rows[0].state));
  const [photos]=await connection.execute('SELECT photo_id id,room_id roomId,title,image,created_at createdAt FROM room_life_photos WHERE owner_key=? ORDER BY created_at DESC,photo_id DESC',[account]);
  const home=await repository.load(account,{connection});let context=null;if(home.entries)context=homeContext(account,home);
  const roomPhotoCount=context?photos.filter(p=>p.roomId===context.room.id).length:0;const challenges=HOME_CHALLENGES.map(c=>evaluateHomeChallenge(c.id,{state,placed:context?.placed||[],roomArt:context?.room.companion.roomArt,hasDrawing:context?.hasDrawing,roomPhotoCount}));
  return {ok:true,catalog,state,photos,challenges,roomName:context?.room.name||'',roomArt:context?.room.companion.roomArt||'original',lifeRevision:Number(rows[0].revision),homeRevision:home.revision,activeRoomId:context?.room.id||null,ownedFurniture:context?.owned||[],placedFurniture:context?.placed||[],serverNow:await now(connection)};
 }
 const visibleSql=`(p.owner_key=? OR (EXISTS(SELECT 1 FROM social_friendships f WHERE f.state='accepted' AND ((f.user_a=? AND f.user_b=p.owner_key) OR (f.user_b=? AND f.user_a=p.owner_key))) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.owner_key=? AND b.peer_key=p.owner_key) OR (b.peer_key=? AND b.owner_key=p.owner_key))))`;
 const visibility=account=>[account,account,account,account,account];
 async function visiblePost(c,account,id){if(!/^[a-f0-9]{32}$/.test(id||''))throw fail(400,'作品编号无效');const [rows]=await c.execute(`SELECT p.* FROM room_life_posts p WHERE p.post_id=? AND ${visibleSql}`,[id,...visibility(account)]);if(!rows.length)throw fail(404,'作品已删除，或你与作者尚未互为好友');return rows[0];}
 async function gallery(account,{page=0,favorites=false}={}){
  if(!Number.isInteger(page)||page<0||page>100)throw fail(400,'作品页码无效');
  const filter=favorites?' AND EXISTS(SELECT 1 FROM room_life_favorites f WHERE f.post_id=p.post_id AND f.account_key=?)':'';
  const args=[...visibility(account),...(favorites?[account]:[])];
  const [counts]=await pool.execute(`SELECT COUNT(*) count FROM room_life_posts p WHERE ${visibleSql}${filter}`,args);
  const [posts]=await pool.execute(`SELECT p.post_id id,p.title,p.theme,p.image,p.design_code designCode,p.room_id roomId,p.created_at createdAt,a.public_id authorId,a.display_name authorName,p.owner_key=? mine,(SELECT COUNT(*) FROM room_life_reactions r WHERE r.post_id=p.post_id) reactions,(SELECT reaction FROM room_life_reactions r WHERE r.post_id=p.post_id AND r.account_key=?) reaction,EXISTS(SELECT 1 FROM room_life_favorites f WHERE f.post_id=p.post_id AND f.account_key=?) favorite FROM room_life_posts p JOIN social_accounts a ON a.account_key=p.owner_key WHERE ${visibleSql}${filter} ORDER BY p.created_at DESC,p.post_id DESC LIMIT 12 OFFSET ${page*12}`,[account,account,account,...args]);
  return {ok:true,posts,page,pages:Math.max(1,Math.ceil(Number(counts[0].count)/12)),total:Number(counts[0].count)};
 }
 async function act(account,input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(x=>!['requestId','baseRevision','roomId','issuedAt','action'].includes(x))||!key(input.requestId)||input.requestId.startsWith('economy:')||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)throw fail(400,'生活操作格式无效');
  const action=input.action;if(!action||Object.getPrototypeOf(action)!==Object.prototype||!Object.hasOwn(schema,action.type)||Object.keys(action).some(x=>x!=='type'&&!schema[action.type].includes(x)))throw fail(400,'生活操作参数无效');
  const digest=hash(action),c=await pool.getConnection();let response;
  try{
   await c.beginTransaction();const [owners]=await c.execute('SELECT account_key FROM social_accounts WHERE account_key=? FOR UPDATE',[account]);if(!owners.length)throw fail(401,'小屋身份已失效');
   await initialize(c,account);
   const [seen]=await c.execute('SELECT body_hash,response FROM room_life_requests WHERE account_key=? AND request_id=?',[account,input.requestId]);
   if(seen.length){if(seen[0].body_hash!==digest)throw fail(409,'这个操作编号已用于另一项操作');const previous=parse(seen[0].response);response={...previous,replayed:true};}
   else {
    requestWindow(input,await now(c));
    const [records]=await c.execute('SELECT state FROM room_life_accounts WHERE account_key=? FOR UPDATE',[account]),state=validateLifeState(parse(records[0].state));
    const home=await repository.load(account,{connection:c});if(home.revision!==input.baseRevision)throw fail(409,'房间已被另一窗口更新，请刷新小屋后再操作','LIFE_HOME_CONFLICT');
    const context=homeContext(account,home,input.roomId),timestamp=await now(c);
    const [photoCount]=await c.execute('SELECT COUNT(*) count,COALESCE(SUM(room_id=?),0) room_count FROM room_life_photos WHERE owner_key=?',[context.room.id,account]);
    let result={state,grants:[],gifts:[],message:'已经保存'};
    if(action.type==='photo-save'){
     if(Number(photoCount[0].count)>=8)throw fail(400,'相册最多保存8张作品，请先下载或删除一张');
     if(typeof action.image!=='string'||action.image.length>180000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(action.image))throw fail(400,'请保存180KB以内的JPEG作品');
     const bytes=Buffer.from(action.image.split(',')[1],'base64');if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw fail(400,'作品不是有效的JPEG图片');
     const id=randomBytes(16).toString('hex');await c.execute('INSERT INTO room_life_photos(photo_id,owner_key,room_id,title,image) VALUES(?,?,?,?,?)',[id,account,context.room.id,title(action.title),action.image]);state.stats.photos++;result.message='作品已保存到摄影相册';
    }else if(action.type==='photo-delete'){
     const [deleted]=await c.execute('DELETE FROM room_life_photos WHERE photo_id=? AND owner_key=?',[String(action.id),account]);if(!deleted.affectedRows)throw fail(404,'这张照片不存在或不属于你');result.message='照片已删除；已发布的展厅作品会单独保留';
    }else if(action.type==='publish'){
     if(!catalog.themes.some(x=>x.id===action.theme))throw fail(400,'请选择作品主题');
     const [photos]=await c.execute('SELECT * FROM room_life_photos WHERE photo_id=? AND owner_key=?',[String(action.photoId),account]);if(!photos.length)throw fail(404,'请先保存自己的摄影作品');
     const [existing]=await c.execute('SELECT post_id FROM room_life_posts WHERE owner_key=? AND photo_id=?',[account,action.photoId]);if(existing.length)throw fail(409,'这张作品已经发布，可以在展厅里查看');
     const [count]=await c.execute('SELECT COUNT(*) count FROM room_life_posts WHERE owner_key=?',[account]);if(Number(count[0].count)>=8)throw fail(400,'展厅最多发布8件作品，请先整理旧作品');
     const [codes]=await c.execute('SELECT design_code FROM social_room_designs WHERE owner_key=? AND room_id=?',[account,photos[0].room_id]);
     await c.execute('INSERT INTO room_life_posts(post_id,owner_key,photo_id,room_id,title,theme,image,design_code) VALUES(?,?,?,?,?,?,?,?)',[randomBytes(16).toString('hex'),account,action.photoId,photos[0].room_id,title(action.title),action.theme,photos[0].image,codes[0]?.design_code||null]);state.stats.published++;result.message='作品已发布，互为好友的小伙伴可以看到';
    }else if(action.type==='post-delete'){
     const [deleted]=await c.execute('DELETE FROM room_life_posts WHERE post_id=? AND owner_key=?',[String(action.id),account]);if(!deleted.affectedRows)throw fail(404,'这件作品不存在或不属于你');result.message='作品已从展厅移除';
    }else if(action.type==='reaction'||action.type==='favorite'){
     const post=await visiblePost(c,account,action.id);
     if(action.type==='reaction'){
      if(post.owner_key===account)throw fail(400,'把表情留给朋友的作品吧');if(!['like','creative','cozy',null].includes(action.reaction))throw fail(400,'请使用好看、有创意或温馨表情');
      if(action.reaction===null)await c.execute('DELETE FROM room_life_reactions WHERE post_id=? AND account_key=?',[post.post_id,account]);else await c.execute('INSERT INTO room_life_reactions(post_id,account_key,reaction) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reaction=VALUES(reaction)',[post.post_id,account,action.reaction]);
     }else{if(typeof action.enabled!=='boolean')throw fail(400,'收藏状态无效');if(action.enabled)await c.execute('INSERT IGNORE INTO room_life_favorites(post_id,account_key) VALUES(?,?)',[post.post_id,account]);else await c.execute('DELETE FROM room_life_favorites WHERE post_id=? AND account_key=?',[post.post_id,account]);}result.message='作品互动已保存';
    }else result=applyLifeAction(state,action,{now:timestamp,owned:context.owned,placed:context.placed,hasDrawing:context.hasDrawing,photoCount:Number(photoCount[0].count),roomPhotoCount:Number(photoCount[0].room_count),roomArt:context.room.companion.roomArt,roomId:context.room.id,roomName:context.room.name});
    let committed={ok:true,revision:home.revision,unchanged:true};
    if(result.grants.length||result.gifts.length||result.outfitHat){
     const map=new Map(Object.entries(home.entries)),adapter={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},estate=createEstateStore({storageAdapter:adapter,storageKey:account}),facade=estate.storageForRoom(context.room.id),economy=createEconomy({storageAdapter:facade,storageKey:account+'-account-v1'});
     for(const sku of result.grants){const granted=economy.grantFurniture(sku,'life:'+input.requestId+':'+sku);if(!granted.ok)throw fail(409,granted.message||'制作家具保存失败');}
     const companion=createCompanionStore({adapter:facade,key:account+COMPANION_SUFFIX}),value=companion.getState();delete value.valid;delete value.error;
     for(const g of result.gifts){if(!value.rewards.some(x=>x.id===g.id))value.rewards.push(g);const granted=economy.grantGift(giftSku(g),'life:'+input.requestId+':'+g.id);if(!granted.ok)throw fail(409,granted.message||'纪念摆件保存失败');}
     if(result.outfitHat)value.outfit.hat=result.outfitHat;const replaced=companion.replace(value);if(!replaced.ok)throw fail(409,replaced.message);
     committed=await repository.saveWithin(c,account,home.revision,Object.fromEntries(map),{trustedAuthority:true});if(!committed.ok)throw fail(409,committed.message,'LIFE_HOME_CONFLICT');
    }
    await c.execute('UPDATE room_life_accounts SET revision=revision+1,state=?,updated_at=UTC_TIMESTAMP(3) WHERE account_key=?',[JSON.stringify(validateLifeState(result.state)),account]);
    response={ok:true,message:result.message,homeChanged:!committed.unchanged,requestWindowUntil:input.issuedAt+5*60000};
    await c.execute('INSERT INTO room_life_requests(account_key,request_id,body_hash,response) VALUES(?,?,?,?)',[account,input.requestId,digest,JSON.stringify(response)]);
   }
   const data=await readState(account,{connection:c});if(response.homeChanged)response.home=await repository.load(account,{connection:c});
   await c.commit();return {...response,...data};
  }catch(error){await c.rollback();throw error;}finally{c.release();}
 }
 return {state:readState,act,gallery};
}
