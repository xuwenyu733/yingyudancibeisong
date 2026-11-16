import {isDeepStrictEqual} from 'node:util';
const reject=()=>{throw Object.assign(new Error('积分、物品、宠物和解锁进度由服务器保存，请重新连接后操作；旧备份只能恢复装修'),{status:409,code:'ECONOMY_AUTHORITY_REQUIRED'});};
const fields=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value?.[key]??null]));
const profileKeys=['totalStudySeconds','xp','level','lastCheckIn','streakDays','totalCheckIns','badges','pending','checkInDates','makeups','badgeUnlockedAt','badgeAcquiredAt'];
const companionKeys=['rewards','learningEvents','learningSeconds','checkinMilestones','visitDates','firstVisit','lastVisit','lastGiftDay'];
export function assertEconomicAuthority(previous,next,{initialProfile=false}={}){
 if(!previous)throw new TypeError('需要服务器初始账本');
 if(!isDeepStrictEqual(previous.estate.bank,next.estate.bank)||!isDeepStrictEqual(fields(previous.profile,profileKeys),fields(next.profile,profileKeys))||!isDeepStrictEqual(fields(previous.estate.companion,companionKeys),fields(next.estate.companion,companionKeys)))reject();
 if(!initialProfile&&!isDeepStrictEqual(previous.profile.levelBadgeAcquiredAt,next.profile.levelBadgeAcquiredAt))reject();
 const oldRooms=previous.estate.rooms,newRooms=next.estate.rooms;
 if(oldRooms.length!==newRooms.length)reject();
 const economicRequests=room=>(room.scene.requests||[]).filter(x=>!['store','unstore','store-all'].includes(x.operation));
 const layoutIds=room=>new Set([room.scene.layout,...Object.values(room.scene.layouts||{})].flatMap(layout=>Object.keys(layout?.furniture||{})));
 const owned=new Set(previous.estate.bank.owned),badges=new Set(previous.profile.badges);
 for(const room of newRooms){const before=oldRooms.find(x=>x.id===room.id);if(!before||before.floor!==room.floor||before.scene.maxRoomLevel!==room.scene.maxRoomLevel||room.scene.roomLevel>before.scene.maxRoomLevel||!isDeepStrictEqual(economicRequests(before),economicRequests(room)))reject();
  const grandfathered=layoutIds(before);for(const id of layoutIds(room))if(id.startsWith('shop-')&&!owned.has(id.slice(5))&&!grandfathered.has(id))reject();
  for(const [id,style]of Object.entries(room.companion.furnitureStyles||{})){const old=before.companion.furnitureStyles?.[id];if((style.skinId&&!badges.has(style.skinId)||style.achievementSkin&&!badges.size)&&!isDeepStrictEqual(fields(old,['skinId','achievementSkin']),fields(style,['skinId','achievementSkin'])))reject();}
 }
}
