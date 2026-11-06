/** Pure interaction plans. Consumers execute effects; this module never plays sound or mutates state. */
export const INTERACTION_PLAN_VERSION=1;
export const INTERACTION_EVENTS=Object.freeze([
  'ready','return-visit','furniture-landed','furniture-placed','furniture-rotated','furniture-stored',
  'pet-purchased','pet-selected','learning-reward','checkin-done','makeup-done','badge-unlocked','level-up',
  'room-expanded','layout-restored','collect-all','reset-layout','estate-room-entered','water-start','water-done',
  'idle-nuzzle','night-start','gift-unlocked','archive-imported','decoration-mode','decoration-pending',
  'flooring-applied','wall-color-changed','error','path-blocked','water-blocked','layout-persist-failed',
  'layout-restore-warning','study-save-warning','context-lost','context-restored','disposed',
  'asset-loaded','companion-change','lamp-change','layout-change','pet-state','quality-downgrade',
]);
const text=(value,fallback='',max=160)=>typeof value==='string'?[...value.replace(/[\u0000-\u001f]/g,'').trim()].slice(0,max).join('')||fallback:fallback;
const integer=(value,fallback=0)=>Number.isFinite(value)?Math.max(0,Math.floor(value)):fallback;
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}

/**
 * context: {ownerName,isNewFurniture,replayed,reducedMotion,night,roomName}.
 * actions: land{id}, react{kind}, ritual, sync-companion, sync-layout,
 * remember{id,source}, garden-grow{eventId}, transition-layout{durationMs}, night{enabled}, stop-all.
 * bubble is plain text (including an optional {owner} placeholder), never HTML.
 */
export function planInteraction(event,detail={},context={}){
  detail=detail&&typeof detail==='object'?detail:{};context=context&&typeof context==='object'?context:{};
  const name=text(event,'',64),owner=text(context.ownerName,'{owner}',20),item=text(detail.name||detail.label,'小家具',30),id=text(detail.id||detail.sku,'',128),memoryId=text(detail.sku||detail.id,'',128);
  const plan={version:INTERACTION_PLAN_VERSION,event:name,sounds:[],actions:[],bubble:null,celebration:null,suppressed:false};
  const react=kind=>{if(!context.reducedMotion)plan.actions.push({type:'react',kind});};
  const ritual=()=>{if(!context.reducedMotion)plan.actions.push({type:'ritual'});};
  const sync=()=>plan.actions.push({type:'sync-companion'});
  const replay=Boolean(context.replayed||detail.unchanged||detail.code==='ALREADY_CLAIMED');
  if(replay&&['furniture-placed','pet-purchased','learning-reward','checkin-done','makeup-done','badge-unlocked','level-up','room-expanded','gift-unlocked','collect-all','reset-layout','estate-room-entered'].includes(name)){plan.suppressed=true;return freeze(plan);}
  switch(name){
    case 'ready':case 'return-visit':
      plan.bubble=context.night?`${owner}，夜深啦，我陪你安静休息～`:`${owner}，你回来啦！今天也一起装满小小喜欢～`;
      if(!context.night)react(detail.gift?'cheer':'nuzzle');break;
    case 'furniture-landed':case 'furniture-placed':
      plan.sounds.push('placement');if(id&&!context.reducedMotion)plan.actions.push({type:'land',id});
      if(name==='furniture-placed'){
        sync();if(context.isNewFurniture||detail.firstAcquisition){react('cheer');plan.bubble=`${owner}，新家具来啦！我好喜欢～`;if(memoryId)plan.actions.push({type:'remember',id:memoryId,source:'一起从商店带回家'});}
      }break;
    case 'furniture-rotated':plan.sounds.push('click');plan.bubble='转好啦！这个角度也可爱～';break;
    case 'furniture-stored':sync();plan.bubble=`${item}先去仓库歇一会儿，随时欢迎它回来～`;break;
    case 'pet-purchased':plan.sounds.push('cheer');react('cheer');sync();plan.bubble=`${owner}，又认识一位新朋友啦～`;if(memoryId)plan.actions.push({type:'remember',id:memoryId,source:'一起认识的新伙伴'});break;
    case 'pet-selected':sync();break;
    case 'learning-reward':plan.sounds.push('clap');react('clap');sync();plan.actions.push({type:'garden-grow',eventId:text(detail.eventId,'',128)});plan.bubble=`${owner}，学会新本领啦！小花也长高了一点～`;break;
    case 'checkin-done':plan.sounds.push('stamp');react('cheer');sync();plan.celebration={kind:'checkin',name:`连续第 ${Math.max(1,integer(detail.streak,1))} 天`};break;
    case 'makeup-done':plan.sounds.push('stamp');react('cheer');sync();plan.bubble='昨天的小脚印补好啦，我们慢慢向前走～';break;
    case 'badge-unlocked':{
      const count=Array.isArray(detail.ids)?detail.ids.length:1;plan.sounds.push('badge');react('cheer');sync();plan.celebration={kind:'badge',name:count>1?`点亮 ${count} 枚新成就！`:text(detail.name,'新的成就',60)};break;
    }
    case 'level-up':plan.sounds.push('levelup');react('cheer');plan.bubble=`${owner}，你又长大了一点！${detail.level?`现在是 ${integer(detail.level)} 级啦～`:'真为你开心～'}`;break;
    case 'room-expanded':plan.sounds.push('purchase');sync();ritual();plan.bubble=`${owner}，搬进新家啦！我先转一圈看看～`;break;
    case 'layout-restored':sync();if(!context.reducedMotion)plan.actions.push({type:'transition-layout',durationMs:300});break;
    case 'collect-all':plan.sounds.push('click');sync();plan.actions.push({type:'sync-layout'});plan.bubble='小家具都收进仓库啦，重新布置也很棒～';break;
    case 'reset-layout':plan.sounds.push('placement');sync();plan.actions.push({type:'sync-layout'});if(!context.reducedMotion)plan.actions.push({type:'transition-layout',durationMs:300});plan.bubble='小家具回到最初的位置啦！我们再添一点新想法吧～';break;
    case 'estate-room-entered':plan.sounds.push('click');sync();ritual();plan.bubble=`欢迎来到「${text(detail.roomName||context.roomName,'暖暖小屋',30)}」，${owner}，我先替你看看新家～`;break;
    case 'water-start':plan.bubble='咕嘟咕嘟，给小花喝一口水～';break;
    case 'water-done':plan.sounds.push('water');plan.bubble='喝饱啦！小叶子也在对你挥手呢～';break;
    case 'idle-nuzzle':react('nuzzle');plan.bubble=`${owner}，我来蹭蹭你～休息一下也很好呀。`;break;
    case 'night-start':plan.actions.push({type:'night',enabled:true});plan.bubble=`${owner}，夜深啦，我会把灯留得暖暖的～`;break;
    case 'gift-unlocked':plan.sounds.push('cheer');sync();react('cheer');plan.bubble=text(detail.message,`${owner}，送你一个小礼物！它已经在小花园旁边啦～`);break;
    case 'archive-imported':sync();plan.actions.push({type:'sync-layout'});plan.bubble='记忆小盒子打开啦，我们的小家回来啦～';break;
    case 'decoration-pending':plan.bubble='等我站稳小脚丫，就陪你布置～';break;
    case 'decoration-mode':if(detail.active)plan.bubble='拖一下、转一转，让小家变成你喜欢的样子～';else if(detail.saved)plan.bubble='记住啦，这是你亲手布置的小家～';break;
    case 'flooring-applied':case 'wall-color-changed':sync();plan.bubble='哇！你选的颜色，让小屋亮起来啦～';break;
    case 'context-lost':plan.bubble='小屋的画面歇了一下，正在努力找回来～';break;
    case 'context-restored':plan.bubble='找到啦！我们的小家又亮起来了～';break;
    case 'error':case 'path-blocked':case 'water-blocked':case 'layout-persist-failed':case 'layout-restore-warning':case 'study-save-warning':
      plan.sounds.push('error');plan.bubble=text(detail.message||detail.reason,'这里有点不顺利，请稍后再试一次哦。',240);break;
    case 'disposed':plan.actions.push({type:'stop-all'});break;
  }
  return freeze(plan);
}
export const createInteractionPlan=planInteraction;
