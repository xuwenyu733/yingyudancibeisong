import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// All writes run on the caller's connection and transaction. Never open another
// connection here: snapshot and readable rows must commit or roll back together.
const json=value=>value==null?null:JSON.stringify(value);
const datetime=value=>{const parsed=value instanceof Date?value:typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value):null;return parsed?parsed.toISOString().slice(0,23).replace('T',' '):null;};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
const own=(value,key)=>Object.hasOwn(value||{},key);
async function insert(connection,table,values){
  const columns=Object.keys(values);await connection.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(column=>values[column]??null));
}
const modules=new Map();
async function catalogModules(sourceRoot){
  if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot))throw new TypeError('seedCatalog needs an absolute sourceRoot');
  if(!modules.has(sourceRoot))modules.set(sourceRoot,Promise.all(['economy.mjs','profile.mjs','gift-catalog.mjs','room-world.mjs'].map(file=>import(pathToFileURL(path.join(sourceRoot,file)).href))));
  return modules.get(sourceRoot);
}
async function putItem(connection,item){
  await connection.execute(`INSERT INTO cfg_items (item_sku,item_name,item_kind,price_points,description,source_module) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE item_name=VALUES(item_name),item_kind=VALUES(item_kind),price_points=VALUES(price_points),description=VALUES(description),source_module=VALUES(source_module)`,[item.sku||item.id,item.name,item.category||item.kind||'furniture',item.price||0,item.description||'',item.sourceModule||'economy.mjs']);
}

/** Seed current application catalogs. Running again updates labels, not ownership. */
export async function seedCatalog(connection,{sourceRoot}={}){
  const [economy,profile]=await catalogModules(sourceRoot);
  for(const item of economy.SHOP_CATALOG)await putItem(connection,{...item,kind:'furniture'});
  for(const item of economy.BUILTIN_STORAGE)await putItem(connection,{...item,kind:'builtin'});
  for(const pet of economy.PET_CATALOG)await connection.execute(`INSERT INTO cfg_pets (pet_sku,pet_name,price_points,description,model_module) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE pet_name=VALUES(pet_name),price_points=VALUES(price_points),description=VALUES(description),model_module=VALUES(model_module)`,[pet.sku,pet.name,pet.price,pet.description,pet.sku==='apricot-fox'?'characters/original-fox.js':'characters/pet-models.js']);
  for(const badge of [...profile.BADGES.map(b=>({...b,kind:'achievement'})),...profile.BADGE_TIERS.map(b=>({...b,kind:'level',category:'level',description:`达到${b.minLevel}级`} ))])await connection.execute(`INSERT INTO cfg_badges (badge_id,badge_name,badge_kind,category,description,min_level) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE badge_name=VALUES(badge_name),badge_kind=VALUES(badge_kind),category=VALUES(category),description=VALUES(description),min_level=VALUES(min_level)`,[badge.id,badge.name,badge.kind,badge.category,badge.description||'',badge.minLevel??null]);
  for(const tier of economy.ROOM_TIERS)await connection.execute(`INSERT INTO cfg_room_tiers (tier_level,tier_name,width_m,depth_m,price_points) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE tier_name=VALUES(tier_name),width_m=VALUES(width_m),depth_m=VALUES(depth_m),price_points=VALUES(price_points)`,[tier.level,tier.name,tier.width,tier.depth,tier.price]);
  return {items:economy.SHOP_CATALOG.length+economy.BUILTIN_STORAGE.length,pets:economy.PET_CATALOG.length,badges:profile.BADGES.length+profile.BADGE_TIERS.length,roomTiers:economy.ROOM_TIERS.length};
}

/** Project an already validated pet-estate-save. Snapshot remains authoritative. */
export async function projectArchive(connection,namespace,archive,{sourceRoot,entries}={}){
  if(typeof namespace!=='string'||!namespace||namespace.length>160)throw new TypeError('存档空间键无效');
  if(archive?.format!=='pet-estate-save'||archive.version!==1||!archive.estate?.bank||!Array.isArray(archive.estate.rooms)||!archive.profile)throw new TypeError('投影需要经过项目校验的完整庄园存档');
  const [economy,,gifts]=await catalogModules(sourceRoot),estate=archive.estate,bank=estate.bank,companion=estate.companion,profile=archive.profile;
  const itemKeys=new Set([...economy.SHOP_CATALOG.map(item=>item.sku),...economy.BUILTIN_STORAGE.map(item=>item.id)]);
  const allGiftSkus=new Set([...bank.owned,...estate.rooms.flatMap(room=>room.scene.stored||[]),...(companion.rewards||[]).map(gifts.giftSku).filter(Boolean)].filter(sku=>gifts.giftProduct(sku)));
  for(const sku of allGiftSkus){await putItem(connection,{...gifts.giftProduct(sku),sourceModule:'gift-catalog.mjs'});itemKeys.add(sku);}
  const furnitureSku=id=>itemKeys.has(id)?id:id.startsWith('shop-')&&itemKeys.has(id.slice(5))?id.slice(5):null;
  // Cascades remove only this account's previous projection. The outer caller's
  // transaction prevents readers from observing a half-rebuilt set of rows.
  await connection.execute('DELETE FROM usr_accounts WHERE account_key=?',[namespace]);
  await insert(connection,'usr_accounts',{account_key:namespace,display_name:profile.name,gender:profile.gender,avatar_data_url:profile.avatar,level:profile.level,xp:profile.xp,study_seconds:profile.totalStudySeconds,last_checkin:date(profile.lastCheckIn),streak_days:profile.streakDays,total_checkins:profile.totalCheckIns,makeup_month:profile.makeups?.month,makeup_count:profile.makeups?.count||0,active_room_id:estate.activeRoomId,estate_mode:estate.mode,archive_exported_at:datetime(archive.exportedAt)});
  await insert(connection,'usr_settings',{account_key:namespace,pet_nickname:companion.petName,age_mode:companion.ageMode||'kindergarten',sound_muted:!!companion.sound?.muted,sound_volume:companion.sound?.volume||'quiet',voice_enabled:!!companion.voiceEnabled,voice_language:companion.voiceLanguage||'zh-CN',voice_style:companion.voiceStyle||'gentle',outfit_hat:companion.outfit?.hat||'none',outfit_scarf:companion.outfit?.scarf||'none',outfit_backpack:companion.outfit?.backpack||'none',night_mode:!!companion.nightMode,surprises_enabled:!!companion.surprises,tutorial_done:!!companion.tourDone,companion_learning_seconds:companion.learningSeconds||0,first_visit_at:datetime(companion.firstVisit),last_visit_at:datetime(companion.lastVisit),last_interaction_at:datetime(companion.lastInteraction),last_gift_day:date(companion.lastGiftDay)});
  await insert(connection,'wallet_accounts',{account_key:namespace,balance_points:bank.balance,total_spent_points:bank.totalSpent});

  const builtin=new Set(economy.BUILTIN_STORAGE.map(item=>item.id));
  for(const sku of new Set([...builtin,...bank.owned])){
    const gift=gifts.giftProduct(sku),memory=companion.memories?.[gift?.rewardId||sku];
    await insert(connection,'inv_ownership',{account_key:namespace,item_sku:sku,ownership_kind:builtin.has(sku)?'builtin':gift?'gift':'purchased',acquired_at:datetime(memory?.at)});
  }
  for(const room of estate.rooms){
    const scene=room.scene,local=room.companion||{};
    await insert(connection,'room_floors',{account_key:namespace,room_id:room.id,floor_no:room.floor+1,room_name:room.name,template_key:room.template,room_created_at:datetime(room.createdAt),current_tier:scene.roomLevel,max_unlocked_tier:scene.maxRoomLevel,theme:local.theme||'light',wall_color:scene.appearance.wallColor,flooring_sku:scene.appearance.flooring});
    await projectRoomWorldSaves(connection,namespace,room,{sourceRoot,legacyLayout:entries?.[namespace]});
    const layouts={...scene.layouts};if(scene.layout)layouts[String(scene.roomLevel)]=scene.layout;
    for(const [tier,layout]of Object.entries(layouts)){
      if(!layout)continue;const tierLevel=Number(tier);
      await insert(connection,'room_layouts',{account_key:namespace,room_id:room.id,tier_level:tierLevel,layout_version:layout.version||3,is_current:tierLevel===scene.roomLevel,lamp_support_id:layout.lampSupport});
      for(const [id,transform]of Object.entries(layout.furniture||{})){
        const def=layout.definitions?.[id]||{},position=transform.position,rotation=transform.rotation,scale=typeof transform.scale==='number'?[transform.scale,transform.scale,transform.scale]:transform.scale;
        await insert(connection,'room_furniture',{account_key:namespace,room_id:room.id,tier_level:tierLevel,furniture_id:id,item_sku:furnitureSku(id),instance_label:def.label||'',pos_x:position[0],pos_y:position[1],pos_z:position[2],rot_x:rotation[0],rot_y:rotation[1],rot_z:rotation[2],scale_x:scale[0],scale_y:scale[1],scale_z:scale[2],blocks_navigation:def.blocksNavigation!==false,blocks_placement:def.blocksPlacement!==false,draggable:def.draggable!==false});
        for(const [boxIndex,box]of (def.boxes||[]).entries())await insert(connection,'room_colliders',{account_key:namespace,room_id:room.id,tier_level:tierLevel,furniture_id:id,box_index:boxIndex,center_x:box.center[0],center_y:box.center[1],center_z:box.center[2],size_x:box.size[0],size_y:box.size[1],size_z:box.size[2]});
      }
    }
    for(const sku of scene.stored||[])await insert(connection,'inv_room_storage',{account_key:namespace,room_id:room.id,item_sku:sku});
    for(const [id,style]of Object.entries(local.furnitureStyles||{}))await insert(connection,'room_styles',{account_key:namespace,room_id:room.id,furniture_id:id,paint_color:style.color||null,sticker:style.sticker,doodle:style.doodle,achievement_skin:own(style,'achievementSkin')?style.achievementSkin:null,skin_id:style.skinId||null,drawing_json:json(style.drawing)});
    if(local.wallDrawing)await insert(connection,'room_drawings',{account_key:namespace,room_id:room.id,drawing_json:json(local.wallDrawing),stroke_count:local.wallDrawing.strokes.length});
    for(const [key,value]of Object.entries(room.extras||{}))await insert(connection,'room_extras',{account_key:namespace,room_id:room.id,storage_key_hash:createHash('sha256').update(key,'utf8').digest('hex'),storage_key:key,value_text:value});
    await receipts(connection,namespace,room.id,'request',scene.requests||[]);
  }
  for(const sku of bank.petOwned||[])await insert(connection,'pet_ownership',{account_key:namespace,pet_sku:sku,is_active:sku===bank.activePet,acquired_at:datetime(companion.memories?.[sku]?.at)});
  for(const reward of companion.rewards||[])await insert(connection,'pet_rewards',{account_key:namespace,reward_id:reward.id,reward_name:reward.name,reward_kind:reward.kind,item_sku:gifts.giftSku(reward),granted_at:datetime(reward.at),expires_at:datetime(reward.expiresAt)});
  for(const [id,memory]of Object.entries(companion.memories||{}))await insert(connection,'usr_memories',{account_key:namespace,memory_id:id,acquired_at:datetime(memory.at),acquired_by:memory.by,source_text:memory.source});
  for(const day of new Set(profile.checkInDates||[]))await insert(connection,'usr_checkins',{account_key:namespace,checkin_date:day});
  for(const day of new Set(companion.visitDates||[]))await insert(connection,'usr_visits',{account_key:namespace,visit_date:day});
  for(const id of profile.badges||[])await insert(connection,'usr_badges',{account_key:namespace,badge_id:id,unlocked_date:date(profile.badgeUnlockedAt?.[id]),acquired_at:datetime(profile.badgeAcquiredAt?.[id])});
  for(const [id,at]of Object.entries(profile.levelBadgeAcquiredAt||{}))await insert(connection,'usr_badges',{account_key:namespace,badge_id:id,unlocked_date:null,acquired_at:datetime(at)});
  for(const pending of profile.pending||[])await insert(connection,'usr_pending_rewards',{account_key:namespace,event_key:pending.key,points:pending.points});
  const walletLearning=new Set(bank.claims.learning||[]),bookOrder=new Map((companion.learningEvents||[]).map((id,index)=>[id,index]));
  for(const id of new Set([...walletLearning,...bookOrder.keys()]))await insert(connection,'learn_events',{account_key:namespace,event_id:id,has_wallet_claim:walletLearning.has(id),has_companion_record:bookOrder.has(id),book_order:bookOrder.get(id)??null});
  for(const id of companion.checkinMilestones||[])await insert(connection,'learn_checkin_milestones',{account_key:namespace,milestone_id:id});
  await receipts(connection,namespace,'','request',bank.claims.requests||[]);
  await receipts(connection,namespace,'','reward',bank.claims.rewards||[]);
  await receipts(connection,namespace,'','spend',bank.claims.spends||[]);
  return {account:namespace,rooms:estate.rooms.length,learningEvents:new Set([...walletLearning,...bookOrder.keys()]).size};
}

// Shared by normal save transactions and the explicitly invoked migration's
// new-table-only backfill. No shared bank, transaction history or unlocks belong
// inside a restorable local room snapshot.
export async function projectRoomWorldSaves(connection,namespace,room,{sourceRoot,legacyLayout}={}){
  const world=room.world||{revision:0,updatedAt:room.createdAt,checkpoints:[]};
  const [,,,worlds]=await catalogModules(sourceRoot);
  const snapshot=worlds.snapshotRoom(room,{storageKey:namespace,legacyLayout:room.id==='room-1'?legacyLayout:undefined});
  await insert(connection,'room_world_saves',{account_key:namespace,room_id:room.id,save_key:'current',save_kind:'current',checkpoint_id:null,save_name:room.name,world_revision:world.revision,saved_at:datetime(world.updatedAt),snapshot_json:json(snapshot)});
  for(const checkpoint of world.checkpoints||[])await insert(connection,'room_world_saves',{account_key:namespace,room_id:room.id,save_key:'checkpoint:'+checkpoint.id,save_kind:'checkpoint',checkpoint_id:checkpoint.id,save_name:checkpoint.name,world_revision:world.revision,saved_at:datetime(checkpoint.createdAt),snapshot_json:json(checkpoint.snapshot)});
}

async function receipts(connection,account,room,kind,list){
  for(const [index,item]of list.entries())await insert(connection,'wallet_receipts',{account_key:account,scope_room_id:room,receipt_kind:kind,receipt_id:item.id,operation:kind==='request'?item.operation:kind,related_sku:item.sku,related_level:item.level,points_delta:kind==='reward'?item.points:kind==='spend'?-item.points:kind==='request'&&['create-room','purchase','expand'].includes(item.operation)&&Number.isSafeInteger(item.points)?-item.points:null,source_order:index,details_json:json(item)});
}
