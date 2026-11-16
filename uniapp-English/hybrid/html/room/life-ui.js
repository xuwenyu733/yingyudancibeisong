import {createAdventureView} from './adventure-ui.js';
import {createCraftView} from './craft-ui.js';
import {createLifeStage} from './life-stage.js';
import {LIFE_CATALOG as C,lifeItemName,careerLevel,currentLifeOrder} from './life-catalog.mjs';
import {drawLifePhoto,photoJpeg,exportLifePhoto} from './life-photo.mjs';
const TABS=[['home','今天'],['pet','我的伙伴'],['memories','成长纪念'],['quests','创作挑战'],['sets','家具图册'],['craft','蓝图制作'],['photo','摄影室'],['garden','种植园'],['gallery','好友展厅'],['kitchen','厨房订单'],['story','邻里故事'],['career','职业']];
const GROUPS=[['home','小屋生活',['home']],['quests','创作工坊',['quests','sets','craft','career']],['garden','小花园',['garden']],['kitchen','小厨房',['kitchen']],['pet','我的伙伴',['pet']],['photo','作品与纪念',['photo','memories','gallery']],['story','邻里故事',['story']]];
export function createLifePanel({doc=document,client,getApi,onWarehouse,onInvite,onDesign}={}){
 const win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};let disposed=false,opened=false,busy=false,active='home',data=null,gallery=null,galleryTail=null,favorites=false,sub='plots',photoMode='capture',photoImage=null,photoGeneration=0,returnFocus=null,loadGeneration=0;
 const el=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;if(tag==='button')n.type='button';parent?.append(n);return n;};
 const shade=el('section',null,doc.body,'room-life-shade');shade.hidden=true;shade.setAttribute('role','dialog');shade.setAttribute('aria-modal','true');shade.setAttribute('aria-label','小屋生活');
 const panel=el('div',null,shade,'room-life-panel'),header=el('header',null,panel,'life-header'),heading=el('div',null,header),title=el('h2','小屋生活',heading),summary=el('small','材料和进度两层共用 · 小屋星星与学习积分分开',heading);
 const exit=el('button','关闭',header,'life-close');exit.setAttribute('aria-label','关闭小屋生活');const tabs=el('nav',null,panel,'life-tabs');tabs.setAttribute('aria-label','小屋生活功能');
 const toolbar=el('div',null,panel,'life-toolbar'),body=el('div',null,panel,'life-body');
 body.tabIndex=0;body.setAttribute('role','region');body.setAttribute('aria-label','生活内容，可滚动');
 const footer=el('footer',null,panel,'life-footer'),status=el('output','正在连接小屋生活…',footer,'life-status');status.setAttribute('role','status');
 let renderEvents=new win.AbortController();let stage=null,recentCook=null,adventureView=null,craftView=null,craftFilter='all',previewReturn=null;const stageSelection={slot:0,recipe:'cookies'};
 const tabButtons=new Map();for(const [id,label] of GROUPS){const b=el('button',label,tabs);b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.dataset.lifeTab=id;tabButtons.set(id,b);b.addEventListener('click',()=>navigate(id),listen);}
 let craftHandoff=false;
 async function placeCrafted(sku){
  if(busy||disposed||craftHandoff)return;craftHandoff=true;close();
  try{const api=getApi(),id='shop-'+sku;if(!api?.getState().ready)throw new Error('房间还没准备好，请稍后再试');
   if(!api.getFurniture(id)){const result=await api.unstoreFurniture(sku);if(!result?.ok)throw new Error(result?.message||'暂时摆不下，家具仍在仓库里');}
   if(disposed)return;if(!await api.setDecorationMode(true))throw new Error('家具已经保存，稍后可从装修中调整');
   if(!api.selectDecorationFurniture(id))throw new Error('没有选中这件家具，可从底部家具栏选择');
  }catch(error){if(!disposed){await open('craft');say(error.message,true);}}
  finally{craftHandoff=false;}
 }
 function navigate(id,options={}){if(busy||!TABS.some(x=>x[0]===id))return;active=id;body.scrollTop=0;sub=options.sub||(id==='garden'?'plots':id==='kitchen'?'recipes':sub);if(options.filter)craftFilter=options.filter;if(options.recipe)stageSelection.recipe=options.recipe;if(options.crop)stageSelection.crop=options.crop;if(Number.isInteger(options.slot))stageSelection.slot=options.slot;render();}
 const say=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
 function button(parent,text,action,{disabled=false,label}={}){const b=el('button',text,parent);b.disabled=disabled||busy;b.dataset.unavailable=String(disabled);if(label)b.setAttribute('aria-label',label);b.addEventListener('click',()=>void action(),{signal:renderEvents.signal});return b;}
 function field(parent,label,value='',max=40){const wrap=el('label',null,parent);el('span',label,wrap);const input=el('input',null,wrap);input.value=value;input.maxLength=max;input.setAttribute('aria-label',label);return input;}
 function select(parent,label,items,value){const wrap=el('label',null,parent);el('span',label,wrap);const input=el('select',null,wrap);input.setAttribute('aria-label',label);for(const [id,text]of items){const option=el('option',text,input);option.value=id;}input.value=value;return input;}
 function card(name,description,parent=body){const n=el('article',null,parent,'life-card');el('h3',name,n);if(description)el('p',description,n,'life-help');return n;}
 const materials=cost=>Object.entries(cost).map(([id,n])=>lifeItemName(id)+' × '+n).join(' · ');
 function pause(value){const inactive=doc.documentElement.dataset.roomPortrait==='true'||doc.visibilityState!=='visible';const app=doc.getElementById('app');if(app)app.inert=value||inactive;getApi()?.setPresentationPaused?.(value||inactive);win.dispatchEvent(new win.CustomEvent('room-access-pause',{detail:{paused:value||inactive}}));}
 async function perform(action,prepare){
  if(busy||disposed)return;
  busy=true;setBusy();let shared=null;
  try{
   await prepare?.();const result=await client.act(action);if(disposed)return;
   data=received(result);say(result.message);shared=action.type==='feed-pet'?action.id:null;if(action.type==='cook')recentCook=action.id;win.dispatchEvent(new win.CustomEvent('room-life-success',{detail:{type:action.type}}));
   const loaded=Math.max(1,gallery?.nextPage||0);resetGallery();
   if(active==='gallery'){
    try{while(gallery.nextPage<loaded&&gallery.nextPage<gallery.pages)await fetchGalleryPage(gallery);}
    catch(error){gallery.error=error.message;}
   }
   render();return result;
  }catch(error){if(!disposed){if(error.recoveredState){data=received(error.recoveredState);render();}say(error.message,true);}}
  finally{busy=false;if(!disposed){setBusy();if(shared){close();getApi()?.playWithPet?.('snack',{recipe:shared});}pause(opened);maybeLoadGallery();}}
 }
 function setBusy(){panel.dataset.busy=String(busy);for(const b of panel.querySelectorAll('button'))b.disabled=busy||b.dataset.unavailable==='true';for(const input of panel.querySelectorAll('input,select'))input.disabled=busy;}
 function markUnavailable(b,disabled){b.dataset.unavailable=String(disabled);b.disabled=busy||disabled;return b;}
 function navButtons(label,rows,value,changed){const chosen=select(toolbar,label,rows,value);chosen.addEventListener('change',()=>{body.scrollTop=0;changed(chosen.value);},{signal:renderEvents.signal});}
 function render(){
  if(disposed||!opened)return;renderEvents.abort();renderEvents=new win.AbortController();stage?.dispose();stage=null;adventureView?.dispose();adventureView=null;craftView?.dispose();craftView=null;const scrollTop=body.scrollTop;galleryTail=null;toolbar.replaceChildren();body.replaceChildren();body.className='life-body';for(const [id,b]of tabButtons)b.setAttribute('aria-selected',String(GROUPS.find(g=>g[0]===id)?.[2].includes(active)));
  if(!data){card('正在连接','稍等一下，伙伴正在翻开生活记录。');return;}
  panel.dataset.lifePage=active;panel.dataset.ageMode=getApi()?.getCompanion?.().companion?.ageMode||'kindergarten';const s=data.state;title.textContent=(panel.dataset.ageMode==='junior'?'创作工作室 · ':'小屋生活 · ')+'星星 '+s.stars;summary.textContent='生活星星不扣学习积分 · 两层进度共用 · '+(data.activeRoomId==='room-2'?'二楼':'一楼');
  const group=GROUPS.find(g=>g[2].includes(active));if(group?.[2].length>1){const row=el('div',null,toolbar,'life-subtabs');for(const id of group[2]){const b=button(row,TABS.find(x=>x[0]===id)[1],()=>navigate(id));b.dataset.lifeSubtab=id;b.setAttribute('aria-pressed',String(id===active));}}
  const owned=new Set(data.ownedFurniture),placed=new Set(data.placedFurniture);
  if(['home','pet','memories'].includes(active)){body.classList.add('life-one');adventureView=createAdventureView({container:body,mode:active,data,getApi,perform,navigate,close,say});
  }else if(active==='quests'){
   body.classList.add('life-one');adventureView=createAdventureView({container:body,mode:'quests',data,getApi,perform,navigate,close,say});
   const legacy=el('details',null,body,'life-neighbor-quests');el('summary','邻里委托 · 帮邻居做一件小事',legacy);
   button(toolbar,'找回已领奖品',()=>perform({type:'restore-rewards'}));
   el('span','布置当前楼层后验收；重复领奖不会重复发放。',toolbar);button(toolbar,'去仓库摆放',()=>{close();onWarehouse?.();});
   C.quests.forEach(q=>{const done=!!s.quests[q.id]?.completed,accepted=!!s.quests[q.id],n=card(q.npc+' · '+q.name,q.text,legacy);if(q.requires)el('p',q.requires.map(id=>(placed.has(id)?'✓ ':'○ ')+(C.blueprints.find(x=>x.id===id)?.name||({table:'书桌',lamp:'台灯','floor-pot':'地面盆栽'})[id]||id)).join(' · '),n,'life-checks');el('small','奖励：'+materials(q.reward)+' · '+q.gift,n);markUnavailable(button(n,done?'已完成':accepted?'验收并领奖':'接取委托',()=>perform({type:accepted?'claim-quest':'accept-quest',id:q.id})),done);});
  }else if(active==='sets'){
   el('span','图册按拥有的家具点亮，不消耗已有家具。',toolbar);
   C.sets.forEach(set=>{const n=card(set.name);for(const id of set.items)el('p',(owned.has(id)?'✓ ':'○ ')+(C.blueprints.find(x=>x.id===id)?.name||id),n,'life-set-item');const done=s.sets.includes(set.id);el('small','集齐奖励：'+set.gift+'、5颗小屋星星和2份星砂',n);markUnavailable(button(n,done?'奖励已领取':'领取套装奖励',()=>perform({type:'claim-set',id:set.id})),done||!set.items.every(x=>owned.has(x)));});
  }else if(active==='craft'){
   body.classList.add('life-one');button(toolbar,'我的材料包',()=>navigate('garden',{sub:'inventory'}));
   craftView=createCraftView({container:body,data,filter:craftFilter,setFilter:value=>{craftFilter=value;body.scrollTop=0;render();},perform,navigate,placeFurniture:placeCrafted,preview:async sku=>{previewReturn=sku;close();const result=await getApi()?.beginFurnitureTrial?.(sku,{mode:'craft'});if(!result?.ok){await open('craft');say(result?.message||'稍后再试试',true);}}});
  }else if(active==='garden'){
   navButtons('种植园页面',[['plots','种植格'],['market','材料铺'],['inventory','材料包']],sub,v=>{sub=v;render();});
   button(toolbar,'去厨房做点心',()=>navigate('kitchen'));
   if(sub==='plots')stage=createLifeStage({container:body,kind:'garden',data,perform,isBusy:()=>busy,selection:stageSelection,navigate});
   else if(sub==='market')C.market.forEach(item=>{const n=card(item.name,'每份 '+item.price+' 颗小屋星星');const amount=select(n,'购买'+item.name+'数量',[[1,'1份'],[3,'3份'],[5,'5份']],1);button(n,'购买材料',()=>perform({type:'buy-material',id:item.id,quantity:Number(amount.value)}));});
   else{body.classList.add('life-one');const n=card('我的材料包','小屋星星只用于生活玩法，不消耗学习积分。'),grid=el('div',null,n,'life-inventory');for(const [id,count]of Object.entries(s.inventory))el('span',lifeItemName(id)+' × '+count,grid);for(const crop of C.crops)el('span',crop.name+'种子 × '+s.seeds[crop.id],grid);}
  }else if(active==='kitchen'){
   navButtons('厨房页面',[['recipes','做料理'],['orders','邻居订单'],['inventory','查看食材']],['recipes','orders','inventory'].includes(sub)?sub:'recipes',v=>{sub=v;render();});
   button(toolbar,'和伙伴分享',()=>navigate('pet'));
   if(sub==='orders'){body.classList.add('life-one');const order=currentLifeOrder(s),n=card(order.npc+'的订单','想要一份'+order.name);el('p','完成可得：'+materials(order.reward),n);el('p','已完成 '+s.stats.delivered+' 份订单',n);const available=s.inventory[order.recipe]>0;el('small','已有 '+s.inventory[order.recipe]+' 份'+order.name,n);markUnavailable(button(n,'送出1份料理并领奖',()=>perform({type:'deliver',id:order.id})),!available);if(!available)button(n,'去做这份料理',()=>navigate('kitchen',{recipe:order.recipe}));}
   else if(sub==='inventory'){body.classList.add('life-one');const n=card('食材和料理'),grid=el('div',null,n,'life-inventory');for(const id of ['carrot','berry','mint','flour','water','cookies','juice','tea'])el('span',lifeItemName(id)+' × '+s.inventory[id],grid);button(n,'前往材料铺',()=>{active='garden';sub='market';body.scrollTop=0;render();});}
   else stage=createLifeStage({container:body,kind:'kitchen',data,perform,isBusy:()=>busy,recentCook,selection:stageSelection,navigate});
  }else if(active==='story'){
   body.classList.add('life-one');const chapter=C.chapters[s.story.chapter],step=chapter?.steps[s.story.step];if(!step){card('我们的故事，已经写满三章','三份章节纪念摆件都保留在仓库里，可以继续装修和制作。');}
   else{const n=card(chapter.npc+' · 第'+(s.story.chapter+1)+'章 '+chapter.name,step.text);el('small','本章进度 '+(s.story.step+1)+' / '+chapter.steps.length+' · 已完成的选择和进度自动保存',n);if(step.choices){const choices=el('div',null,n,'life-actions');for(const choice of step.choices)button(choices,choice,()=>perform({type:'story-next',choice}));}else{button(n,'完成目标，继续故事',()=>perform({type:'story-next'}));const destination=step.require==='quest'?'quests':step.require==='photo'?'photo':({harvested:'garden',delivered:'kitchen',crafted:'craft',sets:'sets',published:'photo'})[step.stat];if(destination)button(n,'去完成这个小目标',()=>{navigate(destination,step.stat==='delivered'?{sub:'orders'}:{});if(step.require==='quest'){const detail=body.querySelector('.life-neighbor-quests');if(detail){detail.open=true;detail.scrollIntoView({block:'nearest'});}}});}}
  }else if(active==='career'){
   navButtons('当前职业',[["",'选择一个职业'],...C.jobs.map(x=>[x.id,x.emoji+x.name])],s.job||'',v=>{if(v)void perform({type:'choose-job',id:v});});const job=C.jobs.find(x=>x.id===s.job);
   if(!job){body.classList.add('life-one');card('每一种喜欢，都能成为小职业','选择小设计师、小园艺师或小厨师；可以随时切换，各职业进度不会丢。');}
   else{el('span',job.name+' Lv.'+careerLevel(s.xp[job.id])+' · 经验 '+s.xp[job.id],toolbar);if(s.outfits.includes(job.id))button(toolbar,'穿戴职业帽',()=>perform({type:'wear-career',id:job.id}));C.careerTasks.filter(x=>x.job===job.id).forEach(task=>{const n=card(task.name,'进度 '+s.stats[task.stat]+' / '+task.need+' · 职业经验需 '+task.xp);el('p','首个专属委托解锁职业帽和奖杯，后续领取材料与小屋星星。',n,'life-help');const done=s.careerClaims.includes(task.id);markUnavailable(button(n,done?'已领取':'领取职业奖励',()=>perform({type:'claim-career',id:task.id})),done);});}
  }else if(active==='photo')renderPhoto();
  else if(active==='gallery')renderGallery();
  body.scrollTop=scrollTop;tick();setBusy();maybeLoadGallery();
 }
 function resetGallery(){gallery={posts:new Map(),nextPage:0,pages:1,loading:false,error:''};}
 async function fetchGalleryPage(current){
  const result=await client.gallery({page:current.nextPage,favorites});
  if(current!==gallery||disposed)return [];
  current.nextPage++;
  current.pages=Math.min(result.pages,101);
  const added=[];
  for(const post of result.posts){if(!current.posts.has(post.id))added.push(post);current.posts.set(post.id,post);}
  return added;
 }
 function refreshGallery(){resetGallery();body.scrollTop=0;render();}
 function renderGallery(){
  button(toolbar,'刷新作品',refreshGallery);
  navButtons('展厅范围',[['all','好友与自己的作品'],['favorites','我的收藏']],favorites?'favorites':'all',value=>{favorites=value==='favorites';refreshGallery();});
  button(toolbar,'邀请朋友参观',()=>{close();onInvite?.();});
  galleryTail=el('div',null,body,'life-gallery-tail');galleryTail.setAttribute('role','status');
  for(const post of gallery.posts.values())drawGalleryCard(post);
  updateGalleryTail();
 }
 function updateGalleryTail(){
  if(!galleryTail)return;
  galleryTail.replaceChildren();
  galleryTail.hidden=false;
  if(gallery.error){
   el('span',gallery.error,galleryTail);
   button(galleryTail,'重试加载',()=>{gallery.error='';void loadMoreGallery();});
  }else if(gallery.loading)galleryTail.textContent='正在读取作品…';
  else if(gallery.nextPage<gallery.pages)galleryTail.textContent='继续滑动查看更多作品';
  else if(!gallery.posts.size)galleryTail.textContent='这里还没有作品。可以到摄影室拍照并发布到展厅。';
  else galleryTail.hidden=true;
 }
 function maybeLoadGallery(){
  if(!opened||disposed||busy||active!=='gallery'||!galleryTail||gallery.loading||gallery.error||gallery.nextPage>=gallery.pages)return;
  if(body.scrollHeight-body.clientHeight-body.scrollTop<=24)void loadMoreGallery();
 }
 async function loadMoreGallery(){
  const current=gallery;current.loading=true;updateGalleryTail();
  try{
   const added=await fetchGalleryPage(current);
   if(opened&&active==='gallery'&&current===gallery&&galleryTail){
    const scrollTop=body.scrollTop;
    for(const post of added)drawGalleryCard(post);
    body.scrollTop=scrollTop;
   }
  }catch(error){current.error=error.message||'暂时无法读取作品';}
  finally{
   current.loading=false;
   if(opened&&active==='gallery'&&current===gallery){updateGalleryTail();maybeLoadGallery();}
  }
 }
 function drawGalleryCard(post){
  const n=card(post.title),image=el('img',null,n,'life-photo-thumb');image.loading='lazy';image.src=post.image;image.alt=post.title;el('small',post.authorName+' · '+(C.themes.find(x=>x.id===post.theme)?.name||'原创')+' · '+post.reactions+' 个表情',n);
   const row=el('div',null,n,'life-actions');if(post.mine)button(row,'撤下作品',()=>confirm('从展厅撤下这件作品？相册中的照片会保留。')&&perform({type:'post-delete',id:post.id}));else for(const [reaction,emoji,label]of [['like','👍','好看'],['creative','💡','有创意'],['cozy','💛','温馨']])button(row,(post.reaction===reaction?'✓':'')+emoji,()=>perform({type:'reaction',id:post.id,reaction:post.reaction===reaction?null:reaction}),{label:'为'+post.title+'送出'+label});button(row,post.favorite?'★':'☆',()=>perform({type:'favorite',id:post.id,enabled:!post.favorite}),{label:post.favorite?'取消收藏'+post.title:'收藏'+post.title});if(post.designCode)button(n,'查看装修码 '+post.designCode,()=>{close();onDesign?.(post.designCode);});
  body.insertBefore(n,galleryTail);
 }
 let pose='front',photoTitle='我的小屋作品',caption='',frame='cream',sticker='⭐',zoom=1,editorCanvas=null,photoRoomId=null;
 async function paint(){if(!editorCanvas||!photoImage)return;const generation=++photoGeneration,canvas=editorCanvas;try{const buffer=doc.createElement('canvas');await drawLifePhoto(buffer,{image:photoImage,title:photoTitle,caption,frame,sticker,zoom});if(generation!==photoGeneration||canvas!==editorCanvas||!opened||disposed)return;canvas.width=buffer.width;canvas.height=buffer.height;canvas.getContext('2d').drawImage(buffer,0,0);}catch(error){say(error.message,true);}}
 function renderPhoto(){
  navButtons('摄影室页面',[['capture','拍摄与编辑'],['album','我的相册（'+data.photos.length+'/8）']],photoMode==='album'?'album':'capture',v=>{photoMode=v;render();});
  if(photoMode==='album'){
   const theme=select(toolbar,'发布主题',C.themes.map(x=>[x.id,x.name]),'original');
   if(!data.photos.length){body.classList.add('life-one');card('相册还没有作品','拍摄、加上标题和边框，然后保存到相册。');return;}
   data.photos.forEach(p=>{const n=card(p.title),image=el('img',null,n,'life-photo-thumb');image.src=p.image;image.alt=p.title;const row=el('div',null,n,'life-actions');button(row,'发布展厅',()=>perform({type:'publish',photoId:p.id,title:p.title,theme:theme.value},async()=>{const api=getApi();if(api.publishDesign){const published=await api.publishDesign(p.roomId);if(!published.ok)throw new Error(published.message);}}));button(row,'下载',()=>void download(p.image,p.title));button(row,'删除',()=>confirm('删除这张相册作品？已发布的展厅作品不会一起删除。')&&perform({type:'photo-delete',id:p.id}));});return;
  }
  body.classList.add('life-photo-editor');const preview=el('div',null,body,'life-photo-preview');editorCanvas=el('canvas',null,preview);editorCanvas.setAttribute('aria-label','明信片预览');
  const controls=el('div',null,body,'life-photo-controls'),poses=select(controls,'仓鼠动作',[['front','自然站立'],['tilt','可爱歪头'],['hop','跳起来']],pose);poses.addEventListener('change',()=>{pose=poses.value;},{signal:renderEvents.signal});
  button(controls,photoImage?'重新拍摄':'拍一张',()=>{const r=getApi()?.captureRoomPhoto?.({pose});if(!r?.ok){say(r?.message||'房间还没准备好拍照',true);return;}photoImage=r.image;photoRoomId=data.activeRoomId;void paint();});
  const titleInput=field(controls,'作品标题',photoTitle,26),captionInput=field(controls,'一句话',caption,40);titleInput.addEventListener('input',()=>{photoTitle=titleInput.value;void paint();},{signal:renderEvents.signal});captionInput.addEventListener('input',()=>{caption=captionInput.value;void paint();},{signal:renderEvents.signal});
  const border=select(controls,'边框',[['cream','奶油'],['forest','森林'],['stars','星空'],['candy','糖果']],frame),decor=select(controls,'照片贴纸',[['⭐','星星'],['🌸','小花'],['🎀','蝴蝶结'],['🍓','草莓'],['','不贴']],sticker),crop=select(controls,'照片缩放',[[1,'完整画面'],[1.2,'放大1.2倍'],[1.5,'放大1.5倍']],zoom);
  for(const input of [border,decor,crop])input.addEventListener('change',()=>{frame=border.value;sticker=decor.value;zoom=Number(crop.value);void paint();},{signal:renderEvents.signal});
  const row=el('div',null,controls,'life-actions');button(row,'保存到相册',async()=>{if(!photoImage)return say('先拍一张照片吧',true);try{await paint();await perform({type:'photo-save',title:photoTitle,image:photoJpeg(editorCanvas)});}catch(error){say(error.message,true);}});button(row,'下载明信片',async()=>{if(!photoImage)return say('先拍一张照片吧',true);await paint();try{await download(photoJpeg(editorCanvas),photoTitle);}catch(error){say(error.message,true);}});
  if(photoImage)void paint();else{editorCanvas.width=960;editorCanvas.height=600;const c=editorCanvas.getContext('2d');c.fillStyle='#f3eddf';c.fillRect(0,0,960,600);c.fillStyle='#7d8c6c';c.font='30px system-ui';c.textAlign='center';c.fillText('先给你的房间拍一张照片吧',480,300);}
 }
 async function download(image,name){try{const result=await exportLifePhoto({image,title:name,doc});say(result.message);}catch(error){say(error.message,true);}}
 body.addEventListener('scroll',maybeLoadGallery,{...listen,passive:true});
 function tick(){if(!opened||!data)return;const current=data.serverNow+(win.performance.now()-(data._receivedAt??win.performance.now()));for(const timer of body.querySelectorAll('[data-life-ready-at]')){const seconds=Math.max(0,Math.ceil((Number(timer.dataset.lifeReadyAt)-current)/1000));timer.textContent=seconds?'约 '+Math.floor(seconds/60)+'分'+seconds%60+'秒后成熟':'已经成熟，可以收获啦';}}
 const timer=win.setInterval(tick,1000);const received=value=>{value._receivedAt=win.performance.now();return value;};
 async function open(tab='home'){
  if(disposed)return;const serial=++loadGeneration;active=TABS.some(x=>x[0]===tab)?tab:'home';body.scrollTop=0;resetGallery();data=null;sub=active==='kitchen'?'recipes':'plots';returnFocus=doc.activeElement;opened=true;shade.hidden=false;pause(true);exit.focus();render();say('正在同步房间和生活记录…');
  try{const refreshed=await client.refresh();if(disposed||serial!==loadGeneration)return;data=received(refreshed);if(photoRoomId&&photoRoomId!==data.activeRoomId){photoImage=null;photoRoomId=null;}render();say('生活进度已连接；材料与奖励会自动保存');}catch(error){if(!disposed&&serial===loadGeneration){say(error.message,true);body.replaceChildren();const n=card('暂时没有打开',error.message);button(n,'重新连接',()=>open(active));}}
 }
 function close(){if(disposed)return;if(busy)return say('正在保存，请稍等一下');opened=false;renderEvents.abort();stage?.dispose();stage=null;adventureView?.dispose();adventureView=null;craftView?.dispose();craftView=null;++loadGeneration;shade.hidden=true;photoGeneration++;pause(false);returnFocus?.focus?.({preventScroll:true});}
 exit.addEventListener('click',close,listen);shade.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const all=[...panel.querySelectorAll('button,input,select,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!all.length)return;const first=all[0],last=all.at(-1);if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}},listen);
 doc.addEventListener('pet-room-interaction',event=>{const {type,detail}=event.detail||{};if(type!=='furniture-trial-end'||detail?.mode!=='craft'||detail.sku!==previewReturn)return;previewReturn=null;if(detail.reason==='return'&&!disposed){void open('craft').then(()=>{if(disposed||!opened||active!=='craft')return;const card=[...body.querySelectorAll('[data-blueprint]')].find(n=>n.dataset.blueprint===detail.sku);card?.scrollIntoView({block:'nearest'});card?.querySelector('button')?.focus({preventScroll:true});});}}, {...listen,capture:true});
 win.addEventListener('resize',maybeLoadGallery,listen);
 return {open,close,get opened(){return opened;},dispose(){if(disposed)return;const wasOpened=opened;disposed=true;opened=false;++loadGeneration;++photoGeneration;renderEvents.abort();stage?.dispose();stage=null;adventureView?.dispose();adventureView=null;craftView?.dispose();craftView=null;events.abort();win.clearInterval(timer);shade.remove();if(wasOpened)pause(false);}};
}
