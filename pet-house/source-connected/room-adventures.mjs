/** Deterministic, explainable goals. They describe saved work, never taste, popularity or time online. */
export const HOME_CHALLENGES=Object.freeze([
 {id:'cozy',name:'第一间温暖小屋',icon:'☀',art:'original',description:'给伙伴留一个能阅读、休息的小角落。',goals:[['reading','有一张阅读桌'],['light','有一盏小灯'],['green','有一抹植物绿'],['seat','有一个休息座位']],gift:'温暖小屋创作纪念',kind:'star'},
 {id:'forest',name:'森林阅读角',icon:'♧',art:'forest',description:'让自然与书本一起住进房间。',goals:[['forest','使用森林主题'],['reading','准备阅读家具'],['green','摆放绿色植物'],['photo','保存一张房间作品']],gift:'森林阅读创作纪念',kind:'flower'},
 {id:'space',name:'我的星空基地',icon:'✦',art:'space',description:'亲手制作一件家具，搭起自己的探索基地。',goals:[['space','使用星空主题'],['light','摆放照明家具'],['crafted','亲手制作过家具'],['photo','保存一张房间作品']],gift:'星空探索创作纪念',kind:'lantern'},
 {id:'ocean',name:'海边小画室',icon:'≈',art:'ocean',description:'一面自己的画墙，让小屋有你的故事。',goals:[['ocean','使用海洋主题'],['drawing','保存自己的墙面涂鸦'],['reading','留一张创作小桌'],['photo','保存一张房间作品']],gift:'海边画室创作纪念',kind:'flower'},
 {id:'tea',name:'从花园到餐桌',icon:'♨',art:'forest',description:'自己种、自己做，再和唯一的小伙伴分享。',goals:[['harvest','亲手收获过作物'],['cooked','做好一份料理'],['shared','给伙伴分享一份料理'],['seat','摆好休息的座位']],gift:'花园茶会创作纪念',kind:'lantern'},
]);
export const HOME_STAMPS=Object.freeze([
 {id:'first-home',name:'小屋设计师',icon:'⌂',text:'完成一项创作挑战',kind:'challenge',need:1},
 {id:'first-craft',name:'亲手制作',icon:'◇',text:'制作一件家具',stat:'crafted',need:1},
 {id:'first-harvest',name:'小小园艺师',icon:'♧',text:'收获自己的作物',stat:'harvested',need:1},
 {id:'first-dish',name:'第一份料理',icon:'♨',text:'做好一份料理',stat:'cooked',need:1},
 {id:'three-recipes',name:'三味小厨师',icon:'✿',text:'做过三种不同料理',kind:'recipes',need:3},
 {id:'first-share',name:'分享的心意',icon:'♡',text:'把料理分享给伙伴',kind:'share',need:1},
 {id:'first-photo',name:'小屋摄影师',icon:'▧',text:'保存一张作品',stat:'photos',need:1},
 {id:'first-order',name:'邻里的温暖',icon:'✉',text:'送出一份邻居订单',stat:'delivered',need:1},
]);
export const defaultAdventures=()=>({version:1,focus:'cozy',completed:{},stamps:[],pet:{meals:0,recipes:[],lastMeal:null}});
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
export function validateAdventures(value){
 if(value===undefined)return defaultAdventures();
 const bad=()=>{throw new Error('创作与伙伴记录有误，请保留存档');};
 if(!plain(value)||Object.keys(value).some(k=>!['version','focus','completed','stamps','pet'].includes(k))||value.version!==1||!HOME_CHALLENGES.some(x=>x.id===value.focus)||!plain(value.completed)||!Array.isArray(value.stamps)||new Set(value.stamps).size!==value.stamps.length||value.stamps.some(id=>!HOME_STAMPS.some(x=>x.id===id)))bad();
 const p=value.pet;if(!plain(p)||Object.keys(p).some(k=>!['meals','recipes','lastMeal'].includes(k))||!Number.isSafeInteger(p.meals)||p.meals<0||p.meals>1e6||!Array.isArray(p.recipes)||new Set(p.recipes).size!==p.recipes.length||p.recipes.some(x=>!['cookies','juice','tea'].includes(x))||(p.lastMeal!==null&&(!Number.isSafeInteger(p.lastMeal)||p.lastMeal<0)))bad();
 for(const [id,v]of Object.entries(value.completed)){if(!HOME_CHALLENGES.some(x=>x.id===id)||!plain(v)||Object.keys(v).some(k=>!['at','roomId','roomName'].includes(k))||!Number.isSafeInteger(v.at)||v.at<0||typeof v.roomId!=='string'||!/^room-[1-6]$/.test(v.roomId)||typeof v.roomName!=='string'||[...v.roomName].length>40)bad();}
 return JSON.parse(JSON.stringify(value));
}
export function evaluateHomeChallenge(id,{state,placed=[],roomArt='original',hasDrawing=false,roomPhotoCount=0}={}){
 const challenge=HOME_CHALLENGES.find(x=>x.id===id);if(!challenge)throw new Error('没有这个创作挑战');
 const owns=new Set(placed),any=ids=>ids.some(x=>owns.has(x));
 const conditions={reading:any(['table','cloud-table','reading-shelf']),light:any(['lamp','star-lamp']),green:any(['floor-pot','plant-shelf','clover-planter','candy-tree']),seat:any(['sofa','ottoman-a','ottoman-b','mushroom-stool']),forest:roomArt==='forest',space:roomArt==='space',ocean:roomArt==='ocean',drawing:!!hasDrawing,photo:roomPhotoCount>0,crafted:(state?.stats.crafted||0)>0,harvest:(state?.stats.harvested||0)>0,cooked:(state?.stats.cooked||0)>0,shared:(state?.adventures?.pet.meals||0)>0};
 const checks=challenge.goals.map(([key,label])=>({key,label,done:!!conditions[key]})),done=checks.filter(x=>x.done).length;
 return {...challenge,checks,done,total:checks.length,complete:done===checks.length,encouragement:done===checks.length?'目标都实现啦，这间小屋有你的心意！':done?'已经有了自己的样子，再试试下面的小目标。':'从一件喜欢的小家具开始就很好。'};
}
export function stampProgress(id,state){const stamp=HOME_STAMPS.find(x=>x.id===id);if(!stamp)throw new Error('没有这枚成长印章');const a=state.adventures||defaultAdventures();const value=stamp.stat?state.stats[stamp.stat]:stamp.kind==='challenge'?Object.keys(a.completed).length:stamp.kind==='recipes'?state.cookedRecipes.length:a.pet.meals;return {...stamp,current:Math.min(stamp.need,value||0),ready:(value||0)>=stamp.need,collected:a.stamps.includes(id)};}
export function recipeNeeds(recipe,state){return Object.entries(recipe.cost).map(([id,need])=>({id,need,have:state.inventory[id]||0,missing:Math.max(0,need-(state.inventory[id]||0))}));}
export function petFriendship(pet){const variety=pet?.recipes?.length||0;return {name:['初见的小伙伴','一起分享过点心','尝过两种心意','三味小知己'][variety],variety,total:3};}
