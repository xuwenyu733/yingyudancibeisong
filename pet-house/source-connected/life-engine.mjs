import {blueprintProgress} from './blueprint-progress.mjs';
import {HOME_CHALLENGES,HOME_STAMPS,defaultAdventures,validateAdventures,evaluateHomeChallenge,stampProgress} from './room-adventures.mjs';
import {LIFE_CATALOG as C,currentLifeOrder} from './life-catalog.mjs';
const clone=value=>JSON.parse(JSON.stringify(value)),has=(list,id)=>list.find(x=>x.id===id);
const fail=message=>{throw Object.assign(new Error(message),{status:400,code:'LIFE_ACTION_REJECTED'});};
export function newLifeState(){return {version:1,stars:12,inventory:{wood:8,cloth:6,pigment:3,crystal:2,flour:4,water:8,carrot:0,berry:0,mint:0,cookies:0,juice:0,tea:0},seeds:{carrot:3,berry:3,mint:3},plots:[null,null,null],quests:{},sets:[],crafted:[],orderSerial:0,job:null,xp:{designer:0,gardener:0,chef:0},careerClaims:[],outfits:[],story:{chapter:0,step:0,choices:[],completed:[]},stats:{quests:0,sets:0,crafted:0,harvested:0,watered:0,cooked:0,delivered:0,photos:0,published:0},cookedRecipes:[],adventures:defaultAdventures()};}
export function validateLifeState(input){
 const s=clone(input);s.adventures=validateAdventures(s.adventures);if(s.version!==1||!Number.isSafeInteger(s.stars)||s.stars<0||s.stars>1_000_000||!Array.isArray(s.plots)||s.plots.length!==3||!Array.isArray(s.careerClaims)||!Array.isArray(s.outfits)||!s.story||!s.quests)throw new Error('小屋生活记录无法读取，请保留备份');
 for(const key of ['inventory','seeds','stats','xp']){if(!s[key]||Array.isArray(s[key]))throw new Error('生活记录格式有误');for(const value of Object.values(s[key]))if(!Number.isSafeInteger(value)||value<0||value>1_000_000)throw new Error('生活物品数量有误');}
 for(const key of Object.keys(s.inventory))if(!Object.hasOwn(C.materials,key))throw new Error('生活物品编号有误');
 const defaults=newLifeState();for(const group of ['inventory','seeds','stats','xp'])for(const name of Object.keys(defaults[group]))if(!Number.isSafeInteger(s[group][name]))throw new Error('生活记录缺少必要的数量字段');
 for(const [name,catalog]of [['sets',C.sets],['crafted',C.blueprints],['careerClaims',C.careerTasks],['outfits',C.jobs]])if(!Array.isArray(s[name])||new Set(s[name]).size!==s[name].length||s[name].some(id=>!has(catalog,id)))throw new Error('生活解锁记录有误');
 if(s.job!==null&&!has(C.jobs,s.job)||!Number.isInteger(s.story.step)||s.story.step<0||s.story.step>(C.chapters[s.story.chapter]?.steps.length||0)||!Array.isArray(s.story.completed)||!Array.isArray(s.story.choices)||s.story.choices.length>20)throw new Error('职业或故事记录有误');
 if(!Number.isSafeInteger(s.orderSerial)||s.orderSerial<0||s.orderSerial>1_000_000||!Number.isInteger(s.story.chapter)||s.story.chapter<0||s.story.chapter>C.chapters.length)throw new Error('生活进度有误');
 for(const plot of s.plots)if(plot&&(!has(C.crops,plot.crop)||!Number.isSafeInteger(plot.plantedAt)||!Number.isSafeInteger(plot.readyAt)||typeof plot.watered!=='boolean'))throw new Error('种植记录有误');
 if(!Array.isArray(s.cookedRecipes)||new Set(s.cookedRecipes).size!==s.cookedRecipes.length||s.cookedRecipes.some(id=>!has(C.recipes,id)))throw new Error('料理收藏记录有误');
 for(const [id,q]of Object.entries(s.quests))if(!has(C.quests,id)||!q||typeof q.accepted!=='boolean'||typeof q.completed!=='boolean')throw new Error('委托记录有误');
 if(JSON.stringify(s).length>100000)throw new Error('生活进度记录过大');return s;
}
export function applyLifeAction(input,action,context){
 const s=validateLifeState(input),owned=new Set(context.owned||[]),placed=new Set(context.placed||[]),result={state:s,grants:[],gifts:[],message:'已经记好啦'};
 const give=reward=>{for(const [key,value]of Object.entries(reward)){if(key==='stars')s.stars+=value;else s.inventory[key]=(s.inventory[key]||0)+value;}};
 const cost=items=>{for(const [key,value]of Object.entries(items))if((s.inventory[key]||0)<value)fail('材料还不够，先去种植、订单或材料铺收集吧');for(const [key,value]of Object.entries(items))s.inventory[key]-=value;};
 const xp=(job,n)=>{if(s.job===job)s.xp[job]+=n;};
 const gift=(id,name,kind='star')=>result.gifts.push({id:'life-'+id,name,kind,at:new Date(context.now).toISOString(),expiresAt:null});
 const plot=()=>{if(!Number.isInteger(action.slot)||action.slot<0||action.slot>2)fail('请选择一块有效种植格');return s.plots[action.slot];};
 switch(action.type){
  case 'focus-challenge':{if(!HOME_CHALLENGES.some(c=>c.id===action.id))fail('请选择已有创作挑战');s.adventures.focus=action.id;result.message='创作目标已经记住，可以按自己的节奏完成';break;}
  case 'claim-challenge':{
   if(!HOME_CHALLENGES.some(c=>c.id===action.id))fail('没有这个创作挑战');
   const evaluated=evaluateHomeChallenge(action.id,{state:s,placed:[...placed],roomArt:context.roomArt,hasDrawing:context.hasDrawing,roomPhotoCount:context.roomPhotoCount});
   if(s.adventures.completed[action.id]){result.message='这份创作纪念已经收藏，不会重复领奖';break;}
   if(!evaluated.complete)fail('还可以试试：'+evaluated.checks.filter(x=>!x.done).map(x=>x.label).join('、'));
   s.adventures.completed[action.id]={at:context.now,roomId:context.roomId||'room-1',roomName:context.roomName||'我的小屋'};gift('challenge-'+action.id,evaluated.gift,evaluated.kind);result.message='创作目标完成！纪念摆件已放入仓库，还可以制作作品卡';break;
  }
  case 'collect-stamp':{if(!HOME_STAMPS.some(x=>x.id===action.id))fail('没有这枚成长印章');const progress=stampProgress(action.id,s);if(progress.collected){result.message='这枚印章已经收藏';break;}if(!progress.ready)fail('先完成这枚印章的小目标：'+progress.text);s.adventures.stamps.push(action.id);result.message='收藏了“'+progress.name+'”印章';break;}
  case 'feed-pet':{
   const recipe=has(C.recipes,action.id);if(!recipe)fail('请选择厨房里做好的料理');cost({[recipe.id]:1});s.adventures.pet.meals++;s.adventures.pet.lastMeal=context.now;if(!s.adventures.pet.recipes.includes(recipe.id))s.adventures.pet.recipes.push(recipe.id);result.message='分享了1份'+recipe.name+'，伙伴记住这份心意啦';break;
  }

  case 'restore-rewards':{
   result.grants=s.crafted.filter(id=>!owned.has(id));
   for(const q of C.quests)if(s.quests[q.id]?.completed)gift('quest-'+q.id,q.gift,q.id==='forest'||q.id==='sweet'?'flower':q.id==='stars'?'lantern':'star');
   for(const set of C.sets)if(s.sets.includes(set.id))gift('set-'+set.id,set.gift,set.kind);
   for(const chapter of C.chapters)if(s.story.completed.includes(chapter.id))gift('story-'+chapter.id,chapter.gift,chapter.kind);
   for(const job of C.jobs)if(s.outfits.includes(job.id))gift('career-'+job.id,job.name+'纪念奖杯',job.id==='gardener'?'flower':job.id==='chef'?'lantern':'star');
   for(const challenge of HOME_CHALLENGES)if(s.adventures.completed[challenge.id])gift('challenge-'+challenge.id,challenge.gift,challenge.kind);
   result.message='已核对领取过的家具和纪念摆件，没有重复增加星星或材料';break;
  }
  case 'accept-quest':{if(!has(C.quests,action.id))fail('没有这个装修委托');s.quests[action.id]??={accepted:true,completed:false};result.message='委托已接取，布置好当前楼层后回来验收';break;}
  case 'claim-quest':{
   const q=has(C.quests,action.id);if(!q||!s.quests[q.id])fail('请先接取这个委托');if(s.quests[q.id].completed){result.message='这个委托已经领取过奖励';break;}
   if(q.drawing?!context.hasDrawing:!q.requires.every(id=>placed.has(id)))fail('当前楼层还没有达到委托条件，请把要求的物品从仓库摆出来');
   s.quests[q.id].completed=true;s.stats.quests++;give(q.reward);xp('designer',3);gift('quest-'+q.id,q.gift,q.id==='forest'||q.id==='sweet'?'flower':q.id==='stars'?'lantern':'star');result.message='验收成功！材料和纪念摆件已送到你的小屋';break;
  }
  case 'claim-set':{
   const set=has(C.sets,action.id);if(!set)fail('没有这个主题图册');if(s.sets.includes(set.id)){result.message='这套图册奖励已经领取过';break;}if(!set.items.every(id=>owned.has(id)))fail('这套家具还没有收集齐');
   s.sets.push(set.id);s.stats.sets++;give({stars:5,crystal:2});xp('designer',4);gift('set-'+set.id,set.gift,set.kind);result.message='整套主题点亮啦，收藏奖杯已放入仓库';break;
  }
  case 'craft':{
   const b=has(C.blueprints,action.id);if(!b)fail('没有这张制作蓝图');if(owned.has(b.id)){result.message='你已经拥有这件家具，本次没有消耗材料';break;}if(s.crafted.includes(b.id)){result.grants.push(b.id);result.message='已经制作过，已免费找回到家具仓库';break;}if(!blueprintProgress(b,s).unlocked)fail('解锁这张蓝图的小目标：'+blueprintProgress(b,s).label);cost(b.cost);s.crafted.push(b.id);s.stats.crafted++;xp('designer',2);result.grants.push(b.id);result.message=b.name+'制作完成，已经放入家具仓库';break;
  }
  case 'buy-material':{
   const product=has(C.market,action.id),quantity=action.quantity??1;if(!product||!Number.isInteger(quantity)||quantity<1||quantity>20)fail('购买数量需要是1到20份');const price=product.price*quantity;if(s.stars<price)fail('小屋星星不够，先完成委托或邻居订单吧');s.stars-=price;
   if(product.id.startsWith('seed-'))s.seeds[product.id.slice(5)]+=quantity;else s.inventory[product.id]+=quantity;result.message=product.name+'已放进材料包';break;
  }
  case 'plant':{if(plot())fail('这一格已经种了作物');const crop=has(C.crops,action.crop);if(!crop||!s.seeds[crop.id])fail('先选择有种子的作物');s.seeds[crop.id]--;s.plots[action.slot]={crop:crop.id,plantedAt:context.now,readyAt:context.now+crop.growMs,watered:false};xp('gardener',1);result.message='种好啦，浇水后可以多收获一份；成熟后不会枯萎';break;}
  case 'water':{const p=plot();if(!p)fail('先在这一格种下作物');if(p.watered){result.message='这株作物已经浇过水，不用重复浇';break;}p.watered=true;s.stats.watered++;xp('gardener',1);result.message='小苗喝饱水啦，收获时多一份';break;}
  case 'harvest':{const p=plot();if(!p)fail('这一格还没有作物');if(context.now<p.readyAt)fail('作物还没成熟，稍后再来收获');const count=p.watered?3:2;s.inventory[p.crop]+=count;s.stats.harvested+=count;s.plots[action.slot]=null;xp('gardener',2);result.message='收获了'+count+'份'+C.materials[p.crop];break;}
  case 'cook':{const r=has(C.recipes,action.id);if(!r)fail('没有这份菜谱');cost(r.cost);s.inventory[r.id]++;s.stats.cooked++;if(!s.cookedRecipes.includes(r.id))s.cookedRecipes.push(r.id);xp('chef',2);result.message=r.name+'做好啦，可以完成邻居订单';break;}
  case 'deliver':{const order=currentLifeOrder(s);if(action.id!==order.id)fail('这份订单已更新，请查看新的订单');if(s.inventory[order.recipe]<1)fail('先在厨房做好订单需要的料理');s.inventory[order.recipe]--;s.orderSerial++;s.stats.delivered++;give(order.reward);xp('chef',3);result.message='邻居收到料理啦，小屋星星和材料已入账';break;}
  case 'choose-job':{if(!has(C.jobs,action.id))fail('请选择小设计师、小园艺师或小厨师');s.job=action.id;const earned=action.id==='designer'?s.stats.crafted*2+s.stats.quests*3+s.stats.sets*4:action.id==='gardener'?s.stats.watered+Math.floor(s.stats.harvested/2)*2:s.stats.cooked*2+s.stats.delivered*3;s.xp[action.id]=Math.max(s.xp[action.id],earned);result.message='职业已切换，以前的经验和已经完成的相关活动都会保留';break;}
  case 'claim-career':{
   const task=has(C.careerTasks,action.id);if(!task||s.job!==task.job)fail('先选择对应的职业');if(s.careerClaims.includes(task.id)){result.message='这份职业奖励已经领取';break;}
   if(s.stats[task.stat]<task.need||s.xp[task.job]<task.xp)fail('专属委托的目标或职业经验还不足');s.careerClaims.push(task.id);give({stars:3,wood:2,cloth:1});
   if(!s.outfits.includes(task.job)){s.outfits.push(task.job);gift('career-'+task.job,has(C.jobs,task.job).name+'纪念奖杯',task.job==='gardener'?'flower':task.job==='chef'?'lantern':'star');}
   result.message='职业奖励已领取，专属帽子已解锁，可在职业页穿戴';break;
  }
  case 'wear-career':{if(!s.outfits.includes(action.id))fail('先完成这个职业的专属委托，解锁职业帽子');result.outfitHat=action.id;result.message='职业帽子戴好啦，关闭面板就能看到';break;}
  case 'story-next':{
   const chapter=C.chapters[s.story.chapter],step=chapter?.steps[s.story.step];if(!step){result.message='三个故事章节都已完成';break;}
   if(step.choices){if(!step.choices.includes(action.choice))fail('请选择一句想对邻居说的话');s.story.choices.push({chapter:chapter.id,step:s.story.step,choice:action.choice});}
   else if(step.require==='quest'&&!s.quests[step.id]?.completed||step.require==='photo'&&(context.photoCount||0)<step.need||step.require==='stat'&&s.stats[step.stat]<step.need)fail('先完成这一步的小目标，再回来继续故事');
   s.story.step++;if(s.story.step===chapter.steps.length){s.story.completed.push(chapter.id);s.story.chapter++;s.story.step=0;give({stars:4,wood:2,cloth:2});gift('story-'+chapter.id,chapter.gift,chapter.kind);result.message='本章完成！新的故事和纪念摆件已解锁';}else result.message='故事进度已经保存';break;
  }
  default:fail('不支持这项生活操作');
 }
 result.state=validateLifeState(s);return result;
}
