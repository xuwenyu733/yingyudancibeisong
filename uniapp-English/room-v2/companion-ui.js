/** 儿童伙伴手册。只通过 room API 读写，不直接触碰账户存档。 */
import {activeElementFor} from './dom.mjs';
import {furnitureMemoryAge} from './furniture-memory.mjs';
import {acquisitionCaption} from './acquisition-time.mjs';
import {createFurnitureDrawingEditor} from './drawing-editor.js';
import {createCompanionTutorial} from './companion-tutorial.js';
import {seasonalWish,weeklyChallenge,hiddenAchievements,spinWheelResult,feedMood,hiddenCritter,addFriend,removeFriend} from './companion-extra.mjs';

const VOLUMES=[['quiet','轻声 · 课堂'],['standard','标准'],['loud','响亮']];
const THEMES=[['light','奶油亮色'],['eye-care','温柔护眼'],['candy','糖果乐园']];
const HATS=[['none','不戴帽子'],['star','星星帽'],['unicorn','独角兽帽'],['ears','猫耳帽']];
const SCARVES=[['none','不戴围巾'],['mint','薄荷围巾'],['rose','莓果围巾']];
const BAGS=[['none','轻装出门'],['school','小书包']];
const STICKERS=[['none','不贴贴纸'],['star','小星星'],['heart','爱心'],['flower','小花']];
const DOODLES=[['none','留白也很美'],['rainbow','彩虹涂鸦'],['smile','笑脸涂鸦']];
const finite=value=>Number.isFinite(value)?Math.max(0,value):0;
let panelSequence=0;

export function memoryCaption(memory,options={}){
  if(!memory||typeof memory!=='object')return '获得时间未记录。';
  const sourceText=({gift:'收到的礼物',checkin:'坚持签到的小礼物',secret:'口令找到的宝藏'})[memory.source]||(typeof memory.source==='string'&&memory.source.trim())||'一起带回家的宝贝';
  const source=sourceText.replace(/[,，·\s]*(?:获得时间|日期)未记录/g,'').trim();
  const age=furnitureMemoryAge(memory,options);
  const when=acquisitionCaption({acquiredAt:memory.at},options);
  return [memory.by||'你',when,source,age.daysHeld===null?'':`到家第 ${age.daysHeld} 天`].filter(Boolean).join(' · ')+'。';
}

export function createCompanionPanel({root,api}={}){
  if(!root?.ownerDocument||!api)throw new TypeError('伙伴手册需要房间根节点与 API');
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
  let disposed=false,opened=false,companion=null,returnFocus=null,activeTab='home',signature='',collectionSignature='',selectedFurniture='',busy=false;
  const dirty=new Set();
  const create=(tag,className,text,parent)=>{const node=doc.createElement(tag);if(tag==='button')node.type='button';if(className)node.className=className;if(text!==undefined&&text!==null)node.textContent=text;parent?.append(node);return node;};
  const dock=create('div','companion-dock',null,root);
  const trigger=create('button','companion-handbook-trigger','📖 伙伴手册',dock);trigger.setAttribute('aria-expanded','false');
  trigger.disabled=true;
  const mute=create('button','companion-mute','🔔',dock);mute.setAttribute('aria-label','关闭所有音效');mute.title='关闭所有音效';
  const panel=create('section','companion-panel',null,root);panel.id=`companion-handbook-${++panelSequence}`;trigger.setAttribute('aria-controls',panel.id);panel.hidden=true;panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','伙伴手册');
  const header=create('header','companion-header',null,panel);
  const heading=create('div','',null,header);create('small','','把小小喜欢，装进我们的小屋',heading);create('h2','','伙伴手册',heading);
  const closeButton=create('button','companion-close','×',header);closeButton.setAttribute('aria-label','关闭伙伴手册');
  const tabs=create('div','companion-tabs',null,panel);tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','伙伴手册分类');
  const body=create('div','companion-body',null,panel),sections=new Map(),tabButtons=new Map();
  for(const [id,name]of [['home','我们的名字'],['dress','换装创造'],['collection','图鉴册'],['garden','成长花园'],['settings','家长设置']]){
    const button=create('button','companion-tab',name,tabs);button.id=`${panel.id}-tab-${id}`;button.setAttribute('role','tab');button.dataset.companionTab=id;button.addEventListener('click',()=>selectTab(id),listen);tabButtons.set(id,button);
    const section=create('section','companion-section',null,body);section.id=`${panel.id}-page-${id}`;section.dataset.companionPage=id;section.setAttribute('role','tabpanel');section.setAttribute('aria-label',name);section.setAttribute('aria-labelledby',button.id);button.setAttribute('aria-controls',section.id);sections.set(id,section);
  }
  const status=create('p','companion-status','想怎么布置，我们一起试试呀～',panel);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  function say(text,error=false){if(disposed)return;status.textContent=text;status.dataset.tone=error?'error':'happy';}
  function title(parent,text,description){create('h3','',text,parent);if(description)create('p','companion-help',description,parent);}
  function card(parent){return create('div','companion-card',null,parent);}
  function labelField(parent,label,type='text',maxLength){const wrap=create('label','companion-field',null,parent);create('span','',label,wrap);const input=create('input','',null,wrap);input.type=type;input.setAttribute('aria-label',label);if(maxLength)input.maxLength=maxLength;input.addEventListener('input',()=>dirty.add(input),listen);return input;}
  function selectField(parent,label,options){const wrap=create('label','companion-field',null,parent);create('span','',label,wrap);const input=create('select','',null,wrap);input.setAttribute('aria-label',label);for(const[value,text]of options){const option=create('option','',text,input);option.value=value;}return input;}
  function toggleField(parent,label,description){const wrap=create('label','companion-check',null,parent),input=create('input','',null,wrap);input.type='checkbox';create('span','',label,wrap);if(description)create('small','',description,wrap);input.setAttribute('aria-label',label);return input;}
  function fill(input,value){if(!dirty.has(input)&&activeElementFor(root)!==input)input.value=value??'';}
  function invoke(method,...args){if(typeof api[method]!=='function')return {ok:false,message:'伙伴还在准备这个小惊喜，请稍后再试～'};return api[method](...args);}
  async function perform(method,args,success){
    if(disposed||busy)return null;busy=true;panel.setAttribute('aria-busy','true');
    try{const result=await invoke(method,...args);if(disposed)return result;if(result?.ok===false){say(result.message||'这次没存好，再试一下吧～',true);return result;}say(result?.message||success||'记好啦，伙伴替你保管着～');refresh(true);return result;}
    catch{if(!disposed)say('刚才的小动作没完成，再试一下吧～',true);return null;}
    finally{busy=false;if(!disposed)panel.setAttribute('aria-busy','false');}
  }

  const home=sections.get('home'),nameCard=card(home);title(nameCard,'你好呀，我的小主人','你起的名字，会陪我们一起长大。');
  const ownerName=labelField(nameCard,'主人昵称','text',40);ownerName.placeholder='伙伴该怎么叫你呢？';
  const petName=labelField(nameCard,'宠物名字','text',12);petName.placeholder='给宝贝起个名字';
  const roomName=labelField(nameCard,'房间名字','text',18);roomName.placeholder='给门口的小名牌写个名字';
  const saveNames=create('button','companion-primary','把名字记下来',nameCard);
  saveNames.addEventListener('click',async()=>{
    if(busy)return;
    if(ownerName.value.trim()!==(companion?.ownerName||'')){
      const result=await perform('setProfileName',[ownerName.value.trim()],'伙伴记住你的名字啦～');if(!result||result.ok===false)return;dirty.delete(ownerName);
    }
    const result=await perform('updateCompanion',[{petName:petName.value.trim(),roomName:roomName.value.trim()}],'名字写上小名牌啦，欢迎回家～');
    if(result&&result.ok!==false){dirty.delete(petName);dirty.delete(roomName);refresh(true);}
  },listen);
  const dress=sections.get('dress'),outfitCard=card(dress);title(outfitCard,'今天穿什么呀？','帽子、围巾、小书包，选一套喜欢的出门装。');
  const hat=selectField(outfitCard,'宠物帽子',HATS),scarf=selectField(outfitCard,'宠物围巾',SCARVES),backpack=selectField(outfitCard,'宠物书包',BAGS);
  for(const control of [hat,scarf,backpack])control.addEventListener('change',()=>void perform('updateCompanion',[{outfit:{hat:hat.value,scarf:scarf.value,backpack:backpack.value}}],'新衣服穿好啦，可爱加一颗星～'),listen);
  const paintCard=card(dress);title(paintCard,'家具创作小工坊','换个颜色、贴个笑脸，这一件就是你的作品。');
  const furniture=selectField(paintCard,'选择要装扮的家具',[]);const paintControls=create('div','companion-paint-controls',null,paintCard);
  const color=labelField(paintControls,'家具颜色','color'),sticker=selectField(paintControls,'家具贴纸',STICKERS),doodle=selectField(paintControls,'家具涂鸦',DOODLES);
  const achievementSkin=toggleField(paintControls,'穿上成就皮肤','点亮成就后，家具也能拥有闪亮的新衣裳。');
  const skin=selectField(paintControls,'成就专属纹样',[['','保留原本的花纹']]);let skinSignature='';
  const drawingEditor=createFurnitureDrawingEditor({root:paintControls,onSave:(id,drawing)=>perform('customizeFurniture',[id,{drawing}],'手绘作品已经贴上家具啦～'),onDirtyChange:dirty=>{root.dataset.roomDrawingDirty=String(dirty);}});
  const paint=create('button','companion-primary','完成我的创作',paintControls);const furnitureEmpty=create('p','companion-help','这里空空的，先给宝贝挑一件家具吧～',paintCard);
  furniture.addEventListener('change',()=>{const id=furniture.value,item=companion?.furniture?.find(item=>item.id===id);if(!drawingEditor.setTarget(id,item?.name,companion?.furnitureStyles?.[id]?.drawing)){furniture.value=selectedFurniture;return;}selectedFurniture=id;renderFurnitureStyle();},listen);
  paint.addEventListener('click',()=>void perform('customizeFurniture',[furniture.value,{color:color.value,sticker:sticker.value,doodle:doodle.value,achievementSkin:achievementSkin.checked,skinId:skin.value}],'这件家具，是你独一份的小作品～'),listen);
  function renderFurnitureStyle(){const style=companion?.furnitureStyles?.[furniture.value]||{};color.value=/^#[0-9a-f]{6}$/i.test(style.color||'')?style.color:'#f1c58b';sticker.value=style.sticker||'none';doodle.value=style.doodle||'none';achievementSkin.checked=!!style.achievementSkin;skin.value=style.skinId||'';const item=companion?.furniture?.find(item=>item.id===furniture.value);drawingEditor.setTarget(furniture.value,item?.name,style.drawing);}

  const collection=sections.get('collection');title(collection,'一点点，收藏我们的喜欢','亮起来的是已经带回家的宝贝。灰色格子也在等你慢慢认识，不用着急。');
  const collectionSummary=create('p','companion-collection-summary','',collection),collectionTabs=create('div','companion-subtabs',null,collection);
  const petCollectionButton=create('button','','伙伴图鉴',collectionTabs),furnitureCollectionButton=create('button','','家具图鉴',collectionTabs);let collectionKind='pets';
  const collectionGrid=create('div','companion-collection-grid',null,collection),memoryText=create('p','companion-memory','点一格亮起来的宝贝，看看它哪天来到我们身边～',collection);memoryText.setAttribute('role','status');
  petCollectionButton.addEventListener('click',()=>{collectionKind='pets';renderCollection(true);},listen);furnitureCollectionButton.addEventListener('click',()=>{collectionKind='furniture';renderCollection(true);},listen);
  // 每日一物（清单58）：今天想认识的一件宝贝，未拥有时提醒去商店看看。
  const featureCard=card(collection);create('strong','','今天想认识谁呀？',featureCard);const featureText=create('p','companion-daily-feature','',featureCard);featureText.setAttribute('role','status');
  function renderCollection(force=false){
    const items=companion?.collection?.[collectionKind]||[],next=JSON.stringify([collectionKind,items,companion?.memories]);if(!force&&next===collectionSignature)return;collectionSignature=next;
    petCollectionButton.setAttribute('aria-pressed',String(collectionKind==='pets'));furnitureCollectionButton.setAttribute('aria-pressed',String(collectionKind==='furniture'));
    const owned=items.filter(item=>item.owned).length;
    const pct=companion?.daily?.collection?.[collectionKind]?.percent;
    collectionSummary.textContent=`${collectionKind==='pets'?'小伙伴':'家具宝贝'} · 已点亮 ${owned} / ${items.length}${Number.isFinite(pct)?`（收集 ${pct}%）`:''}`;collectionGrid.replaceChildren();
    const feature=companion?.daily?.feature;
    if(feature)featureText.textContent=`${feature.name}：${feature.hint}`;
    if(!items.length){create('p','companion-empty','图鉴正在翻开新一页，等伙伴准备一下呀～',collectionGrid);return;}
    for(const item of items){
      const cell=create('button',`companion-collection-cell${item.owned?' owned':' locked'}`,null,collectionGrid);cell.setAttribute('aria-label',`${item.name}，${item.owned?'已点亮，查看获得时间与来历':'未拥有'}`);
      const image=create('img','',null,cell);image.alt=item.name;image.loading='lazy';image.decoding='async';if(item.image)image.src=new URL(item.image,import.meta.url).href;
      image.addEventListener('error',()=>{image.hidden=true;create('span','companion-collection-placeholder',item.owned?'✦':'？',cell);},{once:true});
      create('strong','',item.name,cell);create('small','',item.owned?'✦ 已点亮':'等待相遇',cell);
      cell.addEventListener('click',()=>{memoryText.textContent=item.owned?`${item.name}：${memoryCaption(companion?.memories?.[item.sku])}`:`${item.name}还在等我们相遇，到商店慢慢看看吧～`;},listen);
    }
  }

  const garden=sections.get('garden'),gardenCard=card(garden);title(gardenCard,'学习长成小花园','每一份认真，都会被小花记得。');
  const gardenArt=create('div','companion-garden-art','🌱',gardenCard);gardenArt.setAttribute('aria-hidden','true');
  const gardenSummary=create('p','companion-garden-summary','',gardenCard),growthSummary=create('p','companion-help','',gardenCard),growthTasks=create('div','companion-growth-tasks',null,gardenCard),rewardsList=create('div','companion-rewards',null,garden);
  growthTasks.setAttribute('aria-label','伙伴成长任务');
  // 成长缩略图（清单76）：把成长阶段画成一排小点，已到达的亮起，当前阶段脉动，让进度一眼可见。
  const growthThumb=create('div','companion-growth-thumb',null,gardenCard);growthThumb.setAttribute('aria-label','成长阶段缩略图');
  const GROWTH_STAGES=['幼年','小芽','学步','懂事','暖暖','能手','小大人','伙伴星'];
  function renderGrowthThumb(stage){
    growthThumb.replaceChildren();
    const current=(typeof stage==='string'&&GROWTH_STAGES.includes(stage))?GROWTH_STAGES.indexOf(stage):0;
    GROWTH_STAGES.forEach((name,i)=>{const dot=create('span','companion-growth-dot',name==='幼年'?'🌱':name==='伙伴星'?'⭐':'🔵',growthThumb);dot.title=name;dot.dataset.index=String(i);dot.dataset.reached=String(i<=current);dot.dataset.current=String(i===current);});
  }
  // 节日倒计时（清单59）与今日心情（清单50）：纯信息卡，零交互依赖。
  const holidayCard=card(garden);create('strong','','接下来有什么节日？',holidayCard);const holidayText=create('p','companion-holiday-countdown','',holidayCard);
  const moodCard=card(garden);create('strong','','现在小屋的心情',moodCard);const moodText=create('p','companion-room-mood','',moodCard);
  // 今天的心情日记（清单73）：点一个表情记下今天的心情，攒成一周的心情小点点。本机保存，不上传、不改存档。
  const diaryCard=card(garden);create('strong','','今天的心情日记',diaryCard);const diaryHint=create('p','companion-help','轻轻点一个表情，把今天的心情收进小本本～',diaryCard);
  const diaryRow=create('div','companion-mood-row',null,diaryCard);const diaryStatus=create('p','companion-mood-today','',diaryCard);diaryStatus.setAttribute('role','status');
  const diaryCurve=create('div','companion-mood-curve',null,diaryCard);let diaryKey='pet-room-mood-diary';
  const DIARY_FACES=[['happy','😄','很开心'],['smile','😊','开心'],['ok','😐','还好'],['sad','😢','有点低落'],['cry','😭','想抱抱']];
  function diaryDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function readDiary(){try{return JSON.parse(win.localStorage?.getItem(diaryKey)||'{}')||{};}catch{return {};}}
  function writeDiary(map){try{win.localStorage?.setItem(diaryKey,JSON.stringify(map));}catch{/* 本机记忆失败也不影响游玩 */}}
  function renderDiaryCurve(){
    const map=readDiary(),today=diaryDate(),days=[];
    for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;days.push({key,face:map[key]});}
    diaryCurve.replaceChildren();
    for(const day of days){const dot=create('span','companion-mood-dot',day.face?day.face:'·',diaryCurve);dot.title=day.key+(day.face?` · ${DIARY_FACES.find(f=>f[0]===day.face)?.[1]||''}`:'');dot.dataset.filled=String(!!day.face);if(day.key===today)dot.dataset.today='true';}
    const todayFace=map[today];diaryStatus.textContent=todayFace?`今天：${DIARY_FACES.find(f=>f[0]===todayFace)?.[2]||'还好'}。一周的心情都在小点点里～`:'今天还没记心情呢，来点一个吧。';
  }
  for(const [face,emoji,label] of DIARY_FACES){const b=create('button','companion-mood-face',emoji,diaryRow);b.type='button';b.dataset.face=face;b.setAttribute('aria-label',label);b.addEventListener('click',()=>{const map=readDiary();map[diaryDate()]=face;writeDiary(map);renderDiaryCurve();},listen);}
  renderDiaryCurve();
  // 季节限定心愿 + 周挑战 + 隐藏成就（清单100/101/104）：纯信息卡，鼓励回访与探索。
  const wishCard=card(garden);create('strong','','本季限定心愿',wishCard);const wishText=create('p','companion-seasonal-wish','',wishCard);
  const weeklyCard=card(garden);create('strong','','本周小挑战',weeklyCard);const weeklyText=create('p','companion-weekly-challenge','',weeklyCard);
  const hiddenCard=card(garden);create('strong','','悄悄藏的成就',hiddenCard);const hiddenList=create('div','companion-hidden-list',null,hiddenCard);
  // 内容预告日历 + 本月童话（清单102/75）：吊胃口式内容运营，纯信息卡。
  const fableCard=card(garden);create('strong','','本月童话',fableCard);const fableText=create('p','companion-monthly-fable','',fableCard);
  const previewCard=card(garden);create('strong','','接下来几天',previewCard);const previewList=create('div','companion-preview-list',null,previewCard);
  // 依恋值/季节窗景/成长绘本/里程碑/成就叙事（清单47/40/65/96/74）：纯信息卡，强化情感联结与回访。
  const attachCard=card(garden);create('strong','','我们多熟啦',attachCard);const attachText=create('p','companion-attach','',attachCard);
  const windowCard=card(garden);create('strong','','窗外现在',windowCard);const windowText=create('p','companion-window','',windowCard);
  const pageCard=card(garden);create('strong','','我的成长绘本',pageCard);const pageText=create('p','companion-growth-page','',pageCard);
  const storyCard=card(garden);create('strong','','陪你走过的路',storyCard);const storyText=create('p','companion-ach-story','',storyCard);
  const milestoneCard=card(garden);create('strong','','重要瞬间墙',milestoneCard);const milestoneList=create('div','companion-milestone-list',null,milestoneCard);
  const critterCard=card(garden);create('strong','','角落里的小访客',critterCard);const critterText=create('p','companion-critter','',critterCard);const critterSeed=Math.floor(Math.random()*977);
  const critterButton=create('button','companion-primary','看看角落',critterCard);
  critterButton.addEventListener('click',()=>{const c=hiddenCritter(critterSeed);critterText.textContent=`${c.emoji} ${c.name}：${c.line}`;try{api.celebrateParty?.();}catch{}say(c.line);},listen);
  // 每日免费转盘（清单103）：每天转一次，转出一点小惊喜；本地记日期，不重复发放、不改存档。
  const spinCard=card(garden);create('strong','','每日幸运转盘',spinCard);const spinText=create('p','companion-spin','转一下，看看今天的小幸运。',spinCard);const spinSlot=create('div','companion-spin-slot',null,spinCard);
  const spinButton=create('button','companion-primary','转一转！',spinCard);const spinKey='pet-room-spin-last',spinToday='pet-room-spin-today';
  function spinDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function spinSpun(){try{return win.localStorage?.getItem(spinToday)===spinDate();}catch{return false;}}
  function renderSpin(){const spun=spinSpun();spinButton.disabled=spun;spinButton.textContent=spun?'明天再来转': '转一转！';spinSlot.textContent=spun?'今天的幸运已经转过啦':((win.localStorage?.getItem(spinKey)||''));}
  spinButton.addEventListener('click',()=>{
    if(spinSpun()){say('今天的转盘已经转过啦，明天还有一次机会～');return;}
    try{win.localStorage?.setItem(spinToday,spinDate());}catch{}
    const result=spinWheelResult(new Date(),Math.floor(Math.random()*977));
    win.localStorage?.setItem(spinKey,result.text);
    spinSlot.textContent=`${result.text}`;spinButton.disabled=true;spinButton.textContent='明天再来转';
    try{api.celebrateParty?.();}catch{}
    say('转出了小幸运，开心一下！');
  },listen);
  renderSpin();
  // 宠物喂养 buff（清单86）：喂不同食物获得不同心情加成，吃什么长什么样（本机记录、不改存档）。
  const feedCard=card(garden);create('strong','','喂喂小伙伴',feedCard);const feedHint=create('p','companion-help','选择一份小零食，看看伙伴的心情变化～',feedCard);
  const feedRow=create('div','companion-feed-row',null,feedCard);const feedStatus=create('p','companion-feed-status','',feedCard);feedStatus.setAttribute('role','status');
  const feedKey='pet-room-last-feed';
  const FEED_KINDS=[['bread','🍞','面包'],['fish','🐟','小鱼'],['carrot','🥕','萝卜']];
  function renderFeed(){const last=win.localStorage?.getItem(feedKey);if(last&&FEED_KINDS.some(k=>k[0]===last)){const m=feedMood(last);feedStatus.textContent=`最近喂了${m.emoji}${m.name}：伙伴现在${m.mood}。`;}else feedStatus.textContent='还没喂过呢，来选一份吧。';}
  for(const [food,emoji,label] of FEED_KINDS){const b=create('button','companion-feed-face',emoji,feedRow);b.type='button';b.dataset.food=food;b.setAttribute('aria-label',`喂${label}`);b.addEventListener('click',()=>{const m=feedMood(food);try{win.localStorage?.setItem(feedKey,food);}catch{}renderFeed();say(`伙伴吃了${m.emoji}${m.name}，${m.mood}！`);try{api.celebrateParty?.();}catch{}},listen);}
  renderFeed();
  // 番茄学习钟（清单92）：专注 10 分钟 → 休息 1 分钟（眼保健操拥抱版），纯本地计时，不改存档。
  const pomodoroCard=card(garden);create('strong','','番茄学习钟',pomodoroCard);const pomodoroText=create('p','companion-pomodoro','学 10 分钟，休息 1 分钟，眼睛也要照顾好。',pomodoroCard);
  const pomodoroButton=create('button','companion-primary','开始专注 10 分钟',pomodoroCard);let pomodoroTimer=0,pomodoroUntil=0,pomodoroPhase='idle';
  function pomodoroTick(){
    if(disposed)return;const left=Math.max(0,Math.ceil((pomodoroUntil-Date.now())/1000));
    if(pomodoroPhase==='focus'){pomodoroText.textContent=left>0?`专注中…还有 ${Math.floor(left/60)} 分 ${left%60} 秒。学完别忘了休息哦。`:'时间到！揉揉眼睛，休息 1 分钟～';
      if(left<=0){pomodoroPhase='break';pomodoroUntil=Date.now()+60000;api.celebrateParty?.();pomodoroText.textContent='休息 1 分钟，看看远处，眨眨眼睛～';}
    } else if(pomodoroPhase==='break'){pomodoroText.textContent=left>0?`休息中…还有 ${left} 秒。`:'休息好啦，继续加油！';if(left<=0){pomodoroPhase='idle';pomodoroButton.textContent='开始专注 10 分钟';pomodoroButton.disabled=false;say('休息好啦，眼睛亮亮的，继续加油～');return;}}
    pomodoroTimer=win.setTimeout(pomodoroTick,1000);
  }
  pomodoroButton.addEventListener('click',()=>{if(pomodoroPhase!=='idle'){win.clearTimeout(pomodoroTimer);pomodoroPhase='idle';pomodoroButton.textContent='开始专注 10 分钟';pomodoroText.textContent='学 10 分钟，休息 1 分钟，眼睛也要照顾好。';return;}
    pomodoroPhase='focus';pomodoroUntil=Date.now()+600000;pomodoroButton.textContent='暂停番茄钟';pomodoroTick();},listen);
  // 派对模式（清单97）：一键小热闹，不花积分、不改存档。
  const partyCard=card(garden);title(partyCard,'开个小派对','学累了就来放松一小会儿，彩带和伙伴都准备好了。');
  const partyButton=create('button','companion-primary','🎉 开个小派对',partyCard);partyButton.addEventListener('click',()=>{if(busy)return;const ok=api.celebrateParty?.();if(ok===false)say('房间还没准备好开派对，再等一下下～',true);else say('派对开始啦，今天也要开心！');},listen);
  const secretCard=card(garden);title(secretCard,'悄悄话寻宝','小口令里，藏着一份不用花积分的礼物。');
  const secret=labelField(secretCard,'寻宝口令','text',40);secret.placeholder='输入伙伴告诉你的小口令';
  const redeem=create('button','companion-primary','听听这句悄悄话',secretCard);redeem.addEventListener('click',()=>void perform('redeemSecret',[secret.value.trim()],'找到小宝藏啦～'),listen);
  create('p','companion-help','常驻口令：星光回家。10月15日—11月3日：南瓜派对；1—2月：新年快乐。节日装饰会陪伴你7天，日期外也可以先记在心里。',secretCard);

  const settings=sections.get('settings'),soundCard=card(settings);title(soundCard,'安静地陪伴，也很好','课堂轻轻响，家里自在玩；所有音效都能一键关闭。');
  const soundMuted=toggleField(soundCard,'关闭所有音效'),volume=selectField(soundCard,'音量档位',VOLUMES);
  soundMuted.addEventListener('change',()=>void perform('updateCompanion',[{sound:{muted:soundMuted.checked,volume:volume.value}}],'声音偏好记好啦～'),listen);
  volume.addEventListener('change',()=>void perform('updateCompanion',[{sound:{muted:soundMuted.checked,volume:volume.value}}],'声音轻重调整好啦～'),listen);
  // v2.23：回房间欢迎语不再朗读语音，保留文字小气泡；原语音设置改为文字说明。
  create('p','companion-help','欢迎语以文字小气泡显示，安静又温柔，不再播放语音朗读。',soundCard);
  const welcomePreview=create('button','','看看欢迎语',soundCard);welcomePreview.addEventListener('click',()=>void perform('speakPetGreeting',[],'欢迎语已换成文字气泡啦～'),listen);
  const friendLimit=selectField(soundCard,'好朋友进家上限',[['1','1 位'],['2','2 位'],['3','3 位']]);
  friendLimit.addEventListener('change',()=>void perform('updateCompanion',[{homeFriendLimit:Number(friendLimit.value)}],'好朋友进家上限记好啦～'),listen);
  create('p','companion-help','名单里登记的好朋友才能进小屋玩；家里最多同时进来几位好朋友（绒绒伙伴算 1 位）。没登记的小朋友会在门口等一等，明天再来～',soundCard);
  // v2.24 · 好友白名单：只有登记的好朋友能进，陌生人被拦在门口。
  const friendRow=create('div','companion-friend-row',null,soundCard);
  const friendInput=labelField(friendRow,'好朋友名字','text',8);friendInput.placeholder='写个名字，比如：小桃子';
  const friendAdd=create('button','companion-primary','加入名单',friendRow);
  friendAdd.addEventListener('click',()=>{const name=friendInput.value.trim();if(!name){say('先写一个好朋友的名字再添加哦～',true);return;}const next=addFriend(companion?.friendNames||[],name);if(next.ok===false){say(next.message,true);return;}void perform('updateCompanion',[{friendNames:next.friendNames}],next.message);friendInput.value='';dirty.delete(friendInput);},listen);
  friendInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();friendAdd.click();}},listen);
  const friendChips=create('div','companion-friend-chips',null,soundCard);
  create('p','companion-help','名单最多 8 位；全部移出后就先不接待客人啦。',soundCard);
  const ageCard=card(settings);title(ageCard,'适龄显示','幼儿园模式使用更大的按钮，减少花园信息卡；小学模式显示完整内容。');
  const ageMode=selectField(ageCard,'适龄模式',[['kindergarten','幼儿园 · 轻松大按钮'],['primary','小学 · 完整探索']]);
  ageMode.addEventListener('change',()=>void perform('updateCompanion',[{ageMode:ageMode.value}],'适龄模式切换好啦～'),listen);
  const themeCard=card(settings);title(themeCard,'给界面换件外衣');const theme=selectField(themeCard,'界面主题',THEMES);theme.addEventListener('change',()=>void perform('updateCompanion',[{theme:theme.value}],'配色换好啦，眼睛也要舒服哦～'),listen);
  const night=toggleField(themeCard,'开启夜间彩蛋','22点后伙伴会放轻动作，准备休息。'),surprises=toggleField(themeCard,'开启回访小礼物','偶尔收到伙伴带回的小物，不需要花积分。');
  night.addEventListener('change',()=>void perform('updateCompanion',[{nightMode:night.checked}],'夜间偏好记好啦～'),listen);surprises.addEventListener('change',()=>void perform('updateCompanion',[{surprises:surprises.checked}],'小礼物偏好记好啦～'),listen);
  const parents=card(settings);title(parents,'给家长的小抽屉','完整存档、备份和恢复保留在个人主页的「家长设置 / 高级」里。');
  create('p','companion-help','所有奖励均为小屋装饰，不含付费购买。',parents);
  const tutorial=createCompanionTutorial({root,api});
  const replayTour=create('button','','再听一次布置小提示',parents);replayTour.addEventListener('click',()=>{close();tutorial.start();},listen);
  function selectTab(id){activeTab=id;for(const[key,section]of sections)section.hidden=key!==id;for(const[key,button]of tabButtons){button.setAttribute('aria-selected',String(key===id));button.tabIndex=key===id?0:-1;}if(id==='collection')renderCollection(true);}
  tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const keys=[...tabButtons.keys()];let index=keys.indexOf(activeTab);if(event.key==='Home')index=0;else if(event.key==='End')index=keys.length-1;else index=(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;event.preventDefault();selectTab(keys[index]);tabButtons.get(keys[index]).focus();},listen);
  function open(){if(disposed||opened)return;returnFocus=activeElementFor(root);opened=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');tutorial.pause();refresh(true);closeButton.focus({preventScroll:true});}
  function close(){if(disposed)return;opened=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');tutorial.resume();if(returnFocus?.isConnected)returnFocus.focus?.({preventScroll:true});else trigger.focus({preventScroll:true});returnFocus=null;}
  trigger.addEventListener('click',()=>opened?close():open(),listen);closeButton.addEventListener('click',close,listen);
  mute.addEventListener('click',()=>void perform('updateCompanion',[{sound:{muted:!companion?.sound?.muted,volume:companion?.sound?.volume||'quiet'}}],companion?.sound?.muted?'声音回来啦～':'嘘，我们轻轻地玩～'),listen);
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened&&panel.contains(activeElementFor(root))){event.preventDefault();close();}},listen);
  root.addEventListener('room-ui-theme-change',()=>refresh(true),listen);
  function refresh(force=false){
    if(disposed||typeof api.getCompanion!=='function')return;
    let result;try{result=api.getCompanion();}catch{return;}if(!result||result.ok===false)return;const next=result.companion||result;const nextSignature=JSON.stringify(next);if(!force&&nextSignature===signature)return;signature=nextSignature;companion=next;
    root.dataset.ageMode=next.ageMode||'kindergarten';ageMode.value=next.ageMode||'kindergarten';friendLimit.value=String(next.homeFriendLimit||2);
    const friends=Array.isArray(next.friendNames)?next.friendNames:[];
    const friendSignature=JSON.stringify(friends);
    if(friendSignature!==friendChips.dataset.signature){friendChips.dataset.signature=friendSignature;friendChips.replaceChildren();if(!friends.length){const empty=create('span','companion-friend-chip','名单是空的 · 先不接待客人',friendChips);empty.dataset.empty='true';}for(const name of friends){const chip=create('span','companion-friend-chip',name,friendChips);const remove=create('button','companion-friend-remove','✕',chip);remove.type='button';remove.setAttribute('aria-label',`把${name}移出名单`);remove.addEventListener('click',()=>{const next=removeFriend(friends,name);void perform('updateCompanion',[{friendNames:next.friendNames}],next.message);},listen);}}
    const muted=!!next.sound?.muted;mute.textContent=muted?'🔕':'🔔';mute.setAttribute('aria-label',muted?'开启所有音效':'关闭所有音效');mute.setAttribute('aria-pressed',String(muted));mute.title=muted?'开启所有音效':'关闭所有音效';
    fill(ownerName,next.ownerName);fill(petName,next.petName);fill(roomName,next.roomName);hat.value=next.outfit?.hat||'none';scarf.value=next.outfit?.scarf||'none';backpack.value=next.outfit?.backpack||'none';soundMuted.checked=muted;volume.value=next.sound?.volume||'quiet';theme.value=next.theme==='eye'?'eye-care':next.theme||'light';night.checked=next.nightMode!==false;surprises.checked=next.surprises!==false;
    const nextSkins=JSON.stringify(next.skins||[]);if(nextSkins!==skinSignature){skinSignature=nextSkins;skin.replaceChildren();const original=create('option','','保留原本的花纹',skin);original.value='';for(const item of next.skins||[]){const option=create('option','',`${item.name}${item.unlocked?'':' · 尚未解锁'}`,skin);option.value=item.id;option.disabled=!item.unlocked;}}
    const available=Array.isArray(next.furniture)?next.furniture:[];const furnitureSignature=JSON.stringify(available);if(furniture.dataset.signature!==furnitureSignature){furniture.dataset.signature=furnitureSignature;furniture.replaceChildren();for(const item of available){const option=create('option','',item.name,furniture);option.value=item.id;}furniture.value=available.some(item=>item.id===selectedFurniture)?selectedFurniture:available[0]?.id||'';selectedFurniture=furniture.value;renderFurnitureStyle();}
    paintControls.hidden=available.length===0;furnitureEmpty.hidden=available.length>0;furniture.disabled=available.length===0;
    if(activeElementFor(root)!==color&&activeElementFor(root)!==sticker&&activeElementFor(root)!==doodle&&activeElementFor(root)!==achievementSkin&&activeElementFor(root)!==skin&&!dirty.has(color))renderFurnitureStyle();
    const flowers=finite(next.garden?.flowers),days=finite(next.growth?.days);gardenArt.textContent=flowers>=10?'🌳🌸🦋':flowers>=3?'🌷🌼🌷':flowers?'🌷':'🌱';gardenSummary.textContent=`认真开出了 ${flowers} 朵小花 · ${next.garden?.stage||'嫩芽小花园'}`;growthSummary.textContent=`${next.petName||'伙伴'}陪你度过 ${days} 天 · ${next.growth?.stage||'幼年'}。${next.growth?.next?`下一站：${next.growth.next.stage}，需要 ${next.growth.next.daysRequired} 个活跃日${next.growth.next.learningSecondsRequired?`和累计 ${Math.ceil(next.growth.next.learningSecondsRequired/60)} 分钟学习`:''}。`:'今天玩一小会儿，也记得休息哦。'}`;
    if(typeof renderGrowthThumb==='function')renderGrowthThumb(next.growth?.stage);
    const holiday=next.daily?.holiday,mood=next.daily?.mood;
    if(holiday)holidayText.textContent=holiday.leftDays===0?`今天就是${holiday.name}！欢迎回家看看～`:`还有 ${holiday.leftDays} 天就是${holiday.name}啦，到时候小屋会有小惊喜。`;
    if(mood)moodText.textContent=mood.text;
    if(next.daily?.seasonal)wishText.textContent=`${next.daily.seasonal.season==='spring'?'春':next.daily.seasonal.season==='summer'?'夏':next.daily.seasonal.season==='autumn'?'秋':'冬'}季心愿：${next.daily.seasonal.wish}`;
    if(next.daily?.weekly)weeklyText.textContent=next.daily.weekly.challenge;
    hiddenList.replaceChildren();for(const item of next.daily?.hidden||[]){const row=create('p','companion-hidden-item',`${item.unlocked?'✦ 已点亮':'？'} ${item.name}${item.unlocked?'':' · '+item.hint}`,hiddenList);row.dataset.unlocked=String(!!item.unlocked);}
    if(next.daily?.fable)fableText.textContent=next.daily.fable;
    previewList.replaceChildren();for(const item of next.daily?.preview||[]){create('p','companion-preview-item',`${item.date} · ${item.hint}`,previewList);}
    if(next.daily?.attachment){attachText.textContent=`${next.daily.attachment.name}（已陪你 ${next.daily.attachment.days} 天）：${next.daily.attachment.welcome}`;}
    if(next.daily?.seasonWindow)windowText.textContent=`${next.daily.seasonWindow.emoji} ${next.daily.seasonWindow.scene}`;
    if(next.daily?.growthPage)pageText.textContent=next.daily.growthPage;
    if(next.daily?.achievementStory)storyText.textContent=next.daily.achievementStory;
    milestoneList.replaceChildren();for(const m of next.daily?.milestones?.moments||[]){create('p','companion-milestone',`${m.emoji} ${m.title}：${m.text}`,milestoneList);}
    growthTasks.replaceChildren();for(const task of next.growth?.tasks||[]){const row=create('p','companion-growth-task',`${task.done?'✓':'○'} ${task.label} · ${task.current} / ${task.target}`,growthTasks);row.dataset.done=String(!!task.done);}
    rewardsList.replaceChildren();if(next.rewards?.length){title(rewardsList,'收到的小礼物');for(const reward of next.rewards){const rewardCard=card(rewardsList);create('strong','',reward.name,rewardCard);create('p','companion-acquired-time',acquisitionCaption({acquiredAt:next.memories?.[reward.id]?.at||reward.at}),rewardCard);const end=typeof reward.expiresAt==='string'&&reward.expiresAt?new Date(reward.expiresAt):null;create('p','companion-help',!end||Number.isNaN(end.getTime())?'已经放进我们的小收藏，会一直陪着你～':`陪伴到 ${end.toLocaleDateString('zh-CN')}，到期后还会留下收藏回忆。`,rewardCard);}}else create('p','companion-help','小礼物的小抽屉还空着，签到或试试小口令吧～',rewardsList);
    if(opened&&activeTab==='collection')renderCollection();
  }
  selectTab('home');refresh(true);
  return {open,close,update(state){if(disposed)return;const ready=state?.ready||state?.lifecycle==='ready';trigger.disabled=!ready;if(ready)refresh();tutorial.update(state);},dispose(){if(disposed)return;disposed=true;events.abort();drawingEditor.dispose();delete root.dataset.roomDrawingDirty;delete root.dataset.ageMode;tutorial.dispose();win.clearTimeout(pomodoroTimer);panel.remove();dock.remove();dirty.clear();}};
}
