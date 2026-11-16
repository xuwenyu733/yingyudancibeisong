import {HOME_CHALLENGES,HOME_STAMPS,defaultAdventures,stampProgress,petFriendship} from './room-adventures.mjs';
import {LIFE_CATALOG as C} from './life-catalog.mjs';
import {drawLifePhoto,photoJpeg,exportLifePhoto} from './life-photo.mjs';

/** One home for useful activities, backed by the same life service as gardening and cooking. */
export function createAdventureView({container,mode,data,getApi,perform,navigate,close,say}){
 const doc=container.ownerDocument,win=doc.defaultView,abort=new win.AbortController(),listen={signal:abort.signal};let disposed=false,cardBusy=false;
 const state=data.state,a=state.adventures||defaultAdventures(),challenges=data.challenges||[],chosen=challenges.find(x=>x.id===a.focus)||challenges[0];
 const el=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;if(tag==='button')n.type='button';parent?.append(n);return n;};
 const shell=el('section',null,container,'adventure-view adventure-'+mode);
 const button=(text,run,parent,cls='')=>{const n=el('button',text,parent,cls);n.addEventListener('click',()=>void run(),listen);return n;};
 function hero(eyebrow,title,text){const n=el('header',null,shell,'adventure-hero');el('small',eyebrow,n);el('h3',title,n);el('p',text,n);return n;}
 function tile(icon,title,text,run,parent){const n=button('',run,parent,'adventure-tile');el('span',icon,n,'adventure-icon');const copy=el('span',null,n);el('strong',title,copy);el('small',text,copy);el('span','›',n,'adventure-arrow');return n;}
 function leadToGoal(key){
  if(['forest','space','ocean'].includes(key)){close();doc.querySelector('.studio-theme-launch')?.click();}
  else if(key==='photo')navigate('photo');else if(key==='drawing'){close();doc.querySelector('.pet-room-view .creative-dock button')?.click();}
  else if(key==='crafted')navigate('craft');else if(key==='harvest')navigate('garden');else if(key==='cooked')navigate('kitchen');else if(key==='shared')navigate('pet');else{close();doc.querySelector('.pet-room-view .room-shop__storage-trigger')?.click();}
 }
 function goalCard(challenge,parent,{compact=false}={}){
  const done=!!a.completed[challenge.id],n=el('article',null,parent,'adventure-challenge');n.dataset.challenge=challenge.id;n.dataset.completed=String(done);n.style.setProperty('--challenge-color',({original:'#edd8a5',forest:'#b7ceb2',space:'#c0cce6',ocean:'#afd3d2'})[challenge.art]||'#bfd2b4');
  const top=el('div',null,n,'adventure-challenge-title');el('span',challenge.icon,top,'adventure-icon');const text=el('div',null,top);el('small',done?'创作纪念已收藏':challenge.id===a.focus?'我的创作目标':'自由创作挑战',text);el('h4',challenge.name,text);el('p',challenge.description,n);
  const progress=el('div',null,n,'adventure-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',challenge.name+'目标进度');progress.setAttribute('aria-valuenow',String(challenge.done));progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(challenge.total));el('i',null,progress).style.width=`${challenge.done/challenge.total*100}%`;el('small',`当前房间 ${challenge.done} / ${challenge.total} 项目标达成`,n);
  if(!compact){const checks=el('div',null,n,'adventure-checks');for(const check of challenge.checks){const row=el('div',null,checks);el('span',check.done?'✓':'○',row);el('span',check.label,row);if(!check.done)button('去完成',()=>leadToGoal(check.key),row);}}
  el('p',challenge.encouragement,n,'adventure-encouragement');const actions=el('div',null,n,'adventure-actions');
  if(compact)button(done?'看看我的作品':'继续我的创作',()=>navigate('quests'),actions,'adventure-primary');
  else{if(!done&&challenge.id!==a.focus)button('选为我的目标',()=>perform({type:'focus-challenge',id:challenge.id}),actions);const claim=button(done?'制作纪念卡':challenge.complete?'验收并收藏纪念':'继续布置',()=>done?makeCard(challenge):challenge.complete?perform({type:'claim-challenge',id:challenge.id}):leadToGoal(challenge.checks.find(x=>!x.done).key),actions,'adventure-primary');claim.dataset.challengeAction=challenge.id;}
  return n;
 }
 async function makeCard(challenge){
  if(cardBusy||disposed)return;const record=a.completed[challenge.id];if(!record)return;if(record.roomId!==data.activeRoomId){say('这份创作完成在'+record.roomName+'，切回那一层就能拍纪念卡');return;}
  cardBusy=true;shell.querySelector('.adventure-certificate')?.remove();const preview=el('section',null,shell,'adventure-certificate');const title=el('h4','正在拍下你现在的小屋…',preview);preview.setAttribute('aria-label','作品纪念卡');const canvas=el('canvas',null,preview);canvas.hidden=true;
  try{const shot=await getApi()?.captureRoomPhoto?.({pose:'front'});if(!shot?.ok)throw Error(shot?.message||'房间还没准备好拍照');if(disposed)return;
   await drawLifePhoto(canvas,{image:shot.image,title:challenge.name+' · 我的创作纪念',caption:`${data.roomName||'我的小屋'} · ${challenge.total}个创作目标已完成`,frame:({forest:'forest',space:'stars',ocean:'forest'})[challenge.art]||'cream',sticker:challenge.icon});if(disposed)return;
   const image=photoJpeg(canvas);title.textContent='这间小屋，有你的心意';canvas.hidden=false;el('p','记录当前房间的样子，收藏自己的创作。',preview);const actions=el('div',null,preview,'adventure-actions');button('保存到作品相册',()=>perform({type:'photo-save',title:challenge.name+'创作纪念',image}),actions,'adventure-primary');button('下载纪念卡',async()=>{try{const r=await exportLifePhoto({image,title:challenge.name+'创作纪念',doc});if(!disposed)say(r.message);}catch(e){if(!disposed)say(e.message,true);}},actions);button('收起',()=>preview.remove(),actions);preview.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(e){if(!disposed){title.textContent=e.message;say(e.message,true);button('收起',()=>preview.remove(),preview);}}finally{cardBusy=false;}
 }
 if(mode==='home'){
  hero('MY LITTLE HOME','今天想创造什么？','选一件喜欢的小事，慢慢把小屋变成你的样子。');
  const quick=el('div',null,shell,'adventure-quick');tile('⌂','布置我的家','主题、试摆、自由创作',()=>navigate('quests'),quick);tile('♧','照顾小花园','播种、浇水、等候收获',()=>navigate('garden'),quick);tile('♨','做一份点心','做料理，和伙伴分享',()=>navigate('kitchen'),quick);tile('♡','陪陪小伙伴','摸摸头、踢球、分享食物',()=>navigate('pet'),quick);
  const prompt=el('div',null,shell,'adventure-next');el('h4','你可以接着做',prompt);
  const matured=state.plots.map((p,slot)=>({p,slot})).filter(x=>x.p&&x.p.readyAt<=data.serverNow);
  if(matured.length)tile('♧',`${matured.length} 块花坛已经成熟`,'成熟后不会枯萎，想收获时再来',()=>navigate('garden'),prompt);
  const available=HOME_STAMPS.map(x=>stampProgress(x.id,state)).filter(x=>x.ready&&!x.collected);if(available.length)tile('✦',`${available.length} 枚新印章可以收藏`,'把真正完成的小事记下来',()=>navigate('memories'),prompt);
  const dish=C.recipes.find(r=>state.inventory[r.id]>0&&!a.pet.recipes.includes(r.id));if(dish)tile('♡',`和伙伴分享${dish.name}`,'消耗1份已经做好的料理',()=>navigate('pet'),prompt);
  if(!matured.length&&!available.length&&!dish)tile('▧','拍下今天的小屋','留一张自己的创作作品',()=>navigate('photo'),prompt);
  if(chosen)goalCard(chosen,shell,{compact:true});
 }else if(mode==='quests'){
  hero('MY CREATIVE JOURNEY','小屋创作挑战','评价来自具体目标，每个人都可以做出不同的家。完成后收藏纪念摆件和作品卡。');const grid=el('div',null,shell,'adventure-challenges');for(const c of challenges)goalCard(c,grid);
 }else if(mode==='pet'){
  const companion=getApi()?.getCompanion?.().companion||{},friend=petFriendship(a.pet);hero('MY ONE & ONLY FRIEND',`${companion.petName||'伙伴'}，今天一起玩吧`,friend.name+' · 已分享 '+friend.variety+' / 3 种料理');
  const card=el('div',null,shell,'adventure-pet-card');const image=companion.collection?.pets?.[0]?.image;if(image){const img=el('img',null,card);img.src=image;img.alt=companion.petName||'我的唯一伙伴';}const copy=el('div',null,card);el('h4','一个伙伴，很多共同的小事',copy);el('p','离开小屋时它会好好休息，下次回来还能一起玩。',copy);const actions=el('div',null,copy,'adventure-actions');for(const [kind,label]of [['nuzzle','摸摸头'],['ball','一起踢球'],['cheer','开心小舞步']])button(label,()=>{close();const r=getApi()?.playWithPet?.(kind);if(r?.ok===false)say(r.message,true);},actions);
  const dishes=el('div',null,shell,'adventure-foods');for(const recipe of C.recipes){const n=el('article',null,dishes,'adventure-food');el('span',recipe.emoji,n,'adventure-icon');el('h4',recipe.name,n);el('p',`已做好 ${state.inventory[recipe.id]} 份 · ${a.pet.recipes.includes(recipe.id)?'伙伴尝过啦':'还没一起尝过'}`,n);const row=el('div',null,n,'adventure-actions');if(state.inventory[recipe.id]>0)button('分享1份给伙伴',()=>perform({type:'feed-pet',id:recipe.id}),row,'adventure-primary');else button('去厨房做一份',()=>navigate('kitchen',{recipe:recipe.id}),row);}
 }else if(mode==='memories'){
  hero('OUR LITTLE MILESTONES','我的成长纪念册','把第一次做成的小事收进这里。没有过期时间，可以慢慢点亮。');const grid=el('div',null,shell,'adventure-stamps');for(const stamp of HOME_STAMPS){const p=stampProgress(stamp.id,state),n=el('article',null,grid,'adventure-stamp');n.dataset.collected=String(p.collected);el('span',p.icon,n,'adventure-stamp-art');el('h4',p.name,n);el('p',p.text,n);el('small',`${p.current} / ${p.need}`,n);const b=button(p.collected?'已经收藏':p.ready?'收藏印章':'还在探索',()=>perform({type:'collect-stamp',id:p.id}),n);b.dataset.unavailable=String(p.collected||!p.ready);b.disabled=p.collected||!p.ready;}
  const finished=HOME_CHALLENGES.filter(c=>a.completed[c.id]);if(finished.length){el('h4','完成过的创作',shell);const list=el('div',null,shell,'adventure-completed');for(const c of finished){const record=a.completed[c.id];tile(c.icon,c.name,record.roomName+' · '+new Date(record.at).toLocaleDateString('zh-CN'),()=>makeCard(c),list);}}
 }
 return {dispose(){disposed=true;abort.abort();shell.remove();}};
}
