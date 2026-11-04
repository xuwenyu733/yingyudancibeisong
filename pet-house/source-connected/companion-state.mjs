import {acquireStorageLock} from './storage.mjs';
import {validateFurnitureDrawing} from './drawing.mjs';
import {BADGES} from './profile.mjs';
import {defaultLearningProgress,QUESTION_BANK,questionById} from './learning-bank.mjs';
import {normalizeFriendNames,DEFAULT_FRIEND_NAMES} from './companion-extra.mjs';

export const COMPANION_SUFFIX='-companion-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const safeKey=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,191}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const skinIds=new Set(BADGES.map(badge=>badge.id));
const text=(value,max)=>{if(typeof value!=='string')throw new TypeError('名字要用文字填写哦');return [...value.trim().replace(/[\u0000-\u001f<>]/g,'')].slice(0,max).join('');};
const pick=(value,values)=>{if(!values.includes(value))throw new TypeError('这个选项暂时还没有哦');return value;};
function assertJSON(value,depth=0,seen=new Set(),count={n:0}){if(++count.n>200000||depth>12)throw new TypeError('伙伴手册嵌套过深');if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;if(!Array.isArray(value)&&!plain(value))throw new TypeError('伙伴手册只接受普通数据');if(seen.has(value))throw new TypeError('伙伴手册不能循环引用');seen.add(value);if(Array.isArray(value)&&Object.keys(value).length!==value.length)throw new TypeError('伙伴列表有空缺');for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw new TypeError('伙伴手册含不安全的字段');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new TypeError('伙伴手册不能包含访问器');assertJSON(descriptor.value,depth+1,seen,count);}seen.delete(value);}
export function localDay(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export function defaultCompanion(){return {version:1,petName:'团团',roomName:'暖暖小屋',sound:{muted:false,volume:'quiet'},voiceEnabled:false,ageMode:'kindergarten',voiceLanguage:'zh-CN',voiceStyle:'gentle',homeFriendLimit:2,friendNames:[...DEFAULT_FRIEND_NAMES],learningProgress:defaultLearningProgress(),weather:{enabled:false,latitude:null,longitude:null,locationName:''},wallDrawing:null,photos:[],outfit:{hat:'none',scarf:'none',backpack:'none'},theme:'light',nightMode:true,surprises:true,tourDone:false,furnitureStyles:{},memories:{},rewards:[],visitDates:[],firstVisit:null,lastVisit:null,lastInteraction:null,lastGiftDay:null,learningEvents:[],learningSeconds:0,checkinMilestones:[]};}
export function furnitureStyle(patch={}){
  if(!plain(patch))throw new TypeError('装扮内容有点不对，请再选一次');
  const out={};
  if('color'in patch){if(patch.color!==''&&!/^#[0-9a-f]{6}$/i.test(patch.color))throw new TypeError('请选择六位颜色');out.color=patch.color;}
  if('sticker'in patch)out.sticker=pick(patch.sticker,['none','star','heart','flower']);
  if('doodle'in patch)out.doodle=pick(patch.doodle,['none','rainbow','smile']);
  if('achievementSkin'in patch){if(typeof patch.achievementSkin!=='boolean')throw new TypeError('皮肤开关无效');out.achievementSkin=patch.achievementSkin;}
  if('skinId'in patch){if(patch.skinId!==''&&!skinIds.has(patch.skinId))throw new TypeError('这件成就皮肤还没有收录');out.skinId=patch.skinId;}
  if('drawing'in patch)out.drawing=validateFurnitureDrawing(patch.drawing);
  return out;
}

function validateWeather(value){
  if(value===undefined)return {enabled:false,latitude:null,longitude:null,locationName:''};
  if(!plain(value)||Object.keys(value).some(k=>!['enabled','latitude','longitude','locationName'].includes(k))||typeof value.enabled!=='boolean')throw new TypeError('天气设置格式有误');
  const {latitude=null,longitude=null}=value;
  if(latitude!==null&&(!Number.isFinite(latitude)||latitude< -90||latitude>90)||longitude!==null&&(!Number.isFinite(longitude)||longitude< -180||longitude>180)||((latitude===null)!==(longitude===null)))throw new TypeError('天气坐标需要完整且有效');
  if(value.enabled&&latitude===null)throw new TypeError('先选择天气地点再打开实时天气');
  return {enabled:value.enabled,latitude,longitude,locationName:text(value.locationName||'',40)};
}
function validatePhoto(value){
  if(!plain(value)||Object.keys(value).some(k=>!['id','at','title','dataUrl'].includes(k))||!safeKey(value.id)||typeof value.at!=='string'||!Number.isFinite(Date.parse(value.at))||typeof value.dataUrl!=='string'||value.dataUrl.length>55000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl))throw new TypeError('照片格式有误或太大，请重新拍一张');
  return {id:value.id,at:value.at,title:text(value.title||'小屋瞬间',40),dataUrl:value.dataUrl};
}
function validateLearningProgress(value){
  if(value===undefined)return defaultLearningProgress();
  if(!plain(value)||Object.keys(value).some(k=>!['level','streak','answers','correct','questions','attemptIds'].includes(k)))throw new TypeError('学习进度格式有误');
  const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000;
  if(![1,2,3].includes(value.level)||!Number.isInteger(value.streak)||Math.abs(value.streak)>2||!count(value.answers)||!count(value.correct)||value.correct>value.answers||!plain(value.questions)||Object.keys(value.questions).length>QUESTION_BANK.length||!Array.isArray(value.attemptIds)||value.attemptIds.length>256||value.attemptIds.some(id=>!safeKey(id)))throw new TypeError('学习进度格式有误');
  const result={...defaultLearningProgress(),level:value.level,streak:value.streak,answers:value.answers,correct:value.correct,attemptIds:[...new Set(value.attemptIds)]};
  for(const [id,item] of Object.entries(value.questions)){
    if(!questionById(id)||!plain(item)||Object.keys(item).some(k=>!['attempts','correct','wrong','correctStreak','mastered','lastAt'].includes(k))||![item.attempts,item.correct,item.wrong].every(count)||item.correct+item.wrong<item.attempts||item.correct>item.attempts||item.wrong>item.attempts||![0,1,2].includes(item.correctStreak)||typeof item.mastered!=='boolean'||typeof item.lastAt!=='string'||!Number.isFinite(Date.parse(item.lastAt)))throw new TypeError('错题花园记录有误');
    result.questions[id]={attempts:item.attempts,correct:item.correct,wrong:item.wrong,correctStreak:item.correctStreak,mastered:item.mastered,lastAt:item.lastAt};
  }
  return result;
}

export function validateCompanion(value){
  assertJSON(value);
  if(!plain(value)||value.version!==1)throw new TypeError('伙伴手册格式不受支持');
  const result=defaultCompanion();
  const allowed=new Set([...Object.keys(result),'valid','error']);if(Object.keys(value).some(k=>!allowed.has(k)))throw new TypeError('伙伴手册包含未知字段');
  for(const key of ['petName','roomName'])if(key in value)result[key]=text(value[key],key==='petName'?12:18)||result[key];
  if(value.sound){if(!plain(value.sound)||typeof value.sound.muted!=='boolean')throw new TypeError('声音设置有误');result.sound={muted:value.sound.muted,volume:pick(value.sound.volume||'quiet',['quiet','standard','loud'])};}
  if(value.outfit){if(!plain(value.outfit))throw new TypeError('装扮设置有误');for(const [key,values]of Object.entries({hat:['none','star','unicorn','ears'],scarf:['none','mint','rose'],backpack:['none','school']}))result.outfit[key]=pick(value.outfit[key]||'none',values);}
  result.ageMode=pick(value.ageMode||'kindergarten',['kindergarten','primary']);
  result.voiceLanguage=pick(value.voiceLanguage||'zh-CN',['zh-CN','en-US','ja-JP']);
  result.voiceStyle=pick(value.voiceStyle||'gentle',['gentle','bright']);
  if('homeFriendLimit'in value){if(!Number.isInteger(value.homeFriendLimit)||value.homeFriendLimit<1||value.homeFriendLimit>3)throw new TypeError('好朋友进家上限需为 1–3 位');result.homeFriendLimit=value.homeFriendLimit;}
  if('friendNames'in value){if(!Array.isArray(value.friendNames)||value.friendNames.length>8)throw new TypeError('好朋友名单需为 8 位以内的名字列表');result.friendNames=normalizeFriendNames(value.friendNames);}
  result.learningProgress=validateLearningProgress(value.learningProgress);
  result.weather=validateWeather(value.weather);
  result.wallDrawing=validateFurnitureDrawing(value.wallDrawing);
  if(value.photos!==undefined&&!Array.isArray(value.photos))throw new TypeError('相册格式有误');
  if((value.photos||[]).length>6)throw new TypeError('相册最多留6张照片，请先导出或删除一张');
  result.photos=(value.photos||[]).map(validatePhoto);
  if(new Set(result.photos.map(p=>p.id)).size!==result.photos.length)throw new TypeError('照片编号重复');
  result.theme=pick(value.theme||'light',['light','eye-care','candy']);
  for(const key of ['nightMode','surprises','tourDone','voiceEnabled'])if(key in value){if(typeof value[key]!=='boolean')throw new TypeError('伙伴设置格式有误');result[key]=value[key];}
  for(const key of ['firstVisit','lastVisit','lastInteraction'])if(value[key]!=null){if(typeof value[key]!=='string'||!Number.isFinite(Date.parse(value[key])))throw new TypeError('伙伴日期格式有误');result[key]=value[key];}
  result.lastGiftDay=value.lastGiftDay&&/^\d{4}-\d{2}-\d{2}$/.test(value.lastGiftDay)?value.lastGiftDay:null;
  result.visitDates=[...new Set((value.visitDates||[]).filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)))].sort().slice(-366);
  result.learningEvents=[...new Set((value.learningEvents||[]).filter(v=>typeof v==='string'&&v.length<=128))].slice(-2048);
  result.learningSeconds=Number.isSafeInteger(value.learningSeconds)&&value.learningSeconds>=0?Math.min(value.learningSeconds,1000000000):0;
  result.checkinMilestones=[...new Set((value.checkinMilestones||[]).filter(v=>safeKey(v)))].slice(-160);
  if(!plain(value.furnitureStyles||{}))throw new TypeError('家具装扮格式有误');
  for(const [id,style]of Object.entries(value.furnitureStyles||{}).slice(0,128)){if(!safeKey(id))throw new TypeError('家具编号有误');result.furnitureStyles[id]=furnitureStyle(style);}
  if(!plain(value.memories||{}))throw new TypeError('家具记忆格式有误');
  for(const [id,memory]of Object.entries(value.memories||{}).slice(0,128)){if(!safeKey(id)||!plain(memory))throw new TypeError('家具记忆格式有误');result.memories[id]={at:memory.at&&Number.isFinite(Date.parse(memory.at))?memory.at:null,by:text(memory.by||'小主人',20),source:text(memory.source||'一起带回家',40)};}
  result.rewards=(value.rewards||[]).slice(0,80).map(item=>{if(!plain(item)||!safeKey(item.id)||!['star','pumpkin','lantern','flower'].includes(item.kind))throw new TypeError('礼物记录有误');return {id:item.id,name:text(item.name||'小礼物',30),kind:item.kind,at:item.at&&Number.isFinite(Date.parse(item.at))?item.at:null,expiresAt:item.expiresAt&&Number.isFinite(Date.parse(item.expiresAt))?item.expiresAt:null};});
  if(JSON.stringify(result).length>400000)throw new TypeError('伙伴手册太厚啦，请先导出备份');
  return result;
}
export function createCompanionStore({adapter=null,key='pet-room'+COMPANION_SUFFIX,now=()=>new Date(),random=Math.random}={}){
  let state=defaultCompanion(),invalid=null;
  function read(){if(!adapter)return copy(state);const raw=adapter.getItem(key);if(raw===null)return defaultCompanion();if(typeof raw!=='string'||raw.length>450000)throw new TypeError('伙伴手册无法读取');return validateCompanion(JSON.parse(raw));}
  try{state=read();}catch(error){invalid=error.message;}
  function change(operation){
    if(invalid)return {ok:false,code:'COMPANION_INVALID',message:`伙伴手册暂时打不开：${invalid}`};
    const release=acquireStorageLock(adapter,[key]);if(!release)return {ok:false,code:'BUSY',message:'宝贝正在收拾手册，请稍等一下'};
    try{const candidate=read(),detail=operation(candidate)||{},validated=validateCompanion(candidate);if(adapter){const raw=JSON.stringify(validated),result=adapter.setItem(key,raw);if(result?.then)throw new TypeError('伙伴手册需要同步存储');if(adapter.getItem(key)!==raw)throw new Error('存储没有保留写入');}state=validated;return {ok:true,...detail,companion:copy(state)};}catch(error){return {ok:false,code:'COMPANION_SAVE_FAILED',message:`这次还没记住：${error.message}`};}finally{release();}
  }
  function update(patch){return change(candidate=>{assertJSON(patch);if(!plain(patch))throw new TypeError('设置内容有误');const allowed=['petName','roomName','sound','outfit','theme','nightMode','surprises','tourDone','voiceEnabled','ageMode','voiceLanguage','voiceStyle','homeFriendLimit','friendNames','weather'];for(const k of Object.keys(patch)){if(!allowed.includes(k))throw new TypeError('这个设置不能直接修改');if(['sound','outfit','weather'].includes(k)&&!plain(patch[k]))throw new TypeError('设置内容有误');if(k==='homeFriendLimit'&&(!Number.isInteger(patch[k])||patch[k]<1||patch[k]>3))throw new TypeError('好朋友进家上限需为 1–3 位');if(k==='friendNames'){if(!Array.isArray(patch[k])||patch[k].length>8)throw new TypeError('好朋友名单需为 8 位以内的名字列表');candidate[k]=normalizeFriendNames(patch[k]);}else candidate[k]=['sound','outfit','weather'].includes(k)?{...candidate[k],...patch[k]}:patch[k];}return {message:'记住啦，这是我们的小秘密～'};});}
  function grant(candidate,{id,name,kind,days=null},date){if(candidate.rewards.some(r=>r.id===id))return false;candidate.rewards.push({id,name,kind,at:date.toISOString(),expiresAt:days?new Date(date.getTime()+days*86400000).toISOString():null});return true;}
  return {
    savePhoto(photo){return change(candidate=>{const valid=validatePhoto(photo);if(candidate.photos.some(item=>item.id===valid.id))return {unchanged:true};if(candidate.photos.length>=6)throw new TypeError('相册最多留6张照片，请先导出或删除一张');candidate.photos.push(valid);return {photo:valid,message:'这一刻，收藏进相册啦！'};});},
    removePhoto(id){return change(candidate=>{if(!safeKey(id))throw new TypeError('照片编号有误');candidate.photos=candidate.photos.filter(item=>item.id!==id);return {message:'照片已移出相册'};});},
    saveWallDrawing(drawing){return change(candidate=>{candidate.wallDrawing=validateFurnitureDrawing(drawing);return {message:'小作品已经贴在涂鸦墙啦！'};});},
    getState(){try{if(adapter&&!invalid)state=read();}catch(error){invalid=error.message;}return {...copy(state),valid:!invalid,error:invalid};},
    update,
    replace(value){let valid;try{valid=validateCompanion(value);}catch(error){return {ok:false,message:error.message};}return change(candidate=>{for(const k of Object.keys(candidate))delete candidate[k];Object.assign(candidate,valid);});},
    customize(id,patch){if(!safeKey(id))return {ok:false,message:'这件家具还不能装扮哦'};return change(candidate=>{candidate.furnitureStyles[id]={...candidate.furnitureStyles[id],...furnitureStyle(patch)};return {message:'哇，是你设计的专属家具！'};});},
    remember(id,by='小主人',source='一起从商店带回家',at=now().toISOString()){if(!safeKey(id))return {ok:false};return change(candidate=>{if(!candidate.memories[id])candidate.memories[id]={at,by:text(by||'小主人',20),source};});},
    seedMemories(items){return change(candidate=>{for(const item of items)if(safeKey(item.id)&&!candidate.memories[item.id])candidate.memories[item.id]={at:null,by:'我们',source:item.builtin?'刚入住就陪着我们的家具':'升级前的收藏，日期未记录'};});},
    touch(){return change(candidate=>{candidate.lastInteraction=now().toISOString();});},
    visit(){return change(candidate=>{const date=now(),day=localDay(date),old=candidate.lastVisit,returning=old&&date-Date.parse(old)>30*60000;candidate.firstVisit||=date.toISOString();candidate.lastVisit=date.toISOString();if(!candidate.visitDates.includes(day))candidate.visitDates.push(day);let gift=null;if(returning&&date-Date.parse(old)>4*3600000&&candidate.surprises&&candidate.lastGiftDay!==day){candidate.lastGiftDay=day;if(random()<.25){const item={id:`visit-${day}`,name:'伙伴捡到的星星',kind:'star'};grant(candidate,item,date);gift=item;}}return {returning:!!returning,gift};});},
    learning(eventId,seconds){return change(candidate=>{if(candidate.learningEvents.includes(eventId))return {unchanged:true};if(typeof eventId!=='string'||eventId.length>128||!Number.isSafeInteger(seconds)||seconds<0)throw new TypeError('学习记录有误');candidate.learningEvents.push(eventId);candidate.learningSeconds+=seconds;return {message:'今天又长出一朵小花啦！'};});},
    checkin(streak){return change(candidate=>{const date=now(),day=localDay(date),gifts=[];for(const n of [3,7,14,30]){const milestone=`${day.slice(0,7)}-${n}`;if(streak>=n&&!candidate.checkinMilestones.includes(milestone)){candidate.checkinMilestones.push(milestone);const kind=date.getMonth()===9?'pumpkin':date.getMonth()<2?'lantern':'flower';const gift={id:`stamp-${milestone}`,name:`连续${n}天 · ${kind==='pumpkin'?'节日南瓜':kind==='lantern'?'心愿灯笼':'七彩小花'}`,kind,days:7};grant(candidate,gift,date);gifts.push(gift);}}return {gifts};});},
    redeem(code){return change(candidate=>{const date=now(),month=date.getMonth()+1,day=date.getDate(),value=String(code).trim();let reward;if(value==='星光回家')reward={id:'secret-star',name:'星光口令摆件',kind:'star'};else if(value==='南瓜派对'&&((month===10&&day>=15)||(month===11&&day<=3)))reward={id:`pumpkin-${date.getFullYear()}`,name:'节日南瓜灯',kind:'pumpkin',days:7};else if(value==='新年快乐'&&month<=2)reward={id:`lantern-${date.getFullYear()}`,name:'新年心愿灯笼',kind:'lantern',days:7};else return {ok:false,message:'这个口令还没醒来哦，试试「星光回家」～'};if(!grant(candidate,reward,date))return {unchanged:true,message:'这份礼物已经住进小屋啦～'};return {reward,message:`收到「${reward.name}」！已摆在小花园旁边～`};});},
  };
}
