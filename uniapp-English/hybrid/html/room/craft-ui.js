import {LIFE_CATALOG as C,lifeItemName} from './life-catalog.mjs';
import {recipeNeeds} from './room-adventures.mjs';
import {blueprintProgress,blueprintTheme,BLUEPRINT_THEMES} from './blueprint-progress.mjs';

export function createCraftView({container,data,filter='all',setFilter,perform,navigate,preview,placeFurniture}){
 const doc=container.ownerDocument,events=new doc.defaultView.AbortController(),listen={signal:events.signal};const state=data.state,owned=new Set(data.ownedFurniture),placed=new Set(data.placedFurniture);
 const el=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;if(tag==='button')n.type='button';parent?.append(n);return n;};
 const button=(text,run,parent,cls)=>{const b=el('button',text,parent,cls);b.addEventListener('click',()=>void run(),listen);return b;};
 const root=el('section',null,container,'craft-workshop'),hero=el('header',null,root,'craft-hero');el('small','LITTLE MAKER STUDIO',hero);el('h3','把喜欢，亲手做出来',hero);el('p','先做一件家具，就能探索星空系列；做一份点心，还能打开甜甜童话。',hero);
 const paths=el('div',null,hero,'craft-paths');for(const theme of BLUEPRINT_THEMES){const group=C.blueprints.filter(b=>blueprintTheme(b.id)===theme.id),count=group.filter(b=>owned.has(b.id)).length,n=el('span',`${theme.icon} ${theme.name} ${count} / ${group.length}`,paths);n.dataset.complete=String(count===group.length);}
 const filters=el('div',null,root,'craft-filters');filters.setAttribute('aria-label','蓝图主题');for(const theme of [{id:'all',name:'全部蓝图'},...BLUEPRINT_THEMES]){const b=button(theme.name,()=>setFilter(theme.id),filters);b.dataset.craftFilter=theme.id;b.setAttribute('aria-pressed',String(filter===theme.id));}
 const cards=el('div',null,root,'craft-grid');for(const b of C.blueprints.filter(x=>filter==='all'||blueprintTheme(x.id)===filter)){
  const theme=blueprintTheme(b.id),have=owned.has(b.id),recover=!have&&state.crafted.includes(b.id),goal=blueprintProgress(b,state),needs=recipeNeeds(b,state),missing=needs.filter(x=>x.missing),card=el('article',null,cards,'craft-card');card.dataset.blueprint=b.id;card.dataset.theme=theme;card.dataset.locked=String(!goal.unlocked);card.dataset.owned=String(have);
  const art=el('div',null,card,'craft-card-art'),img=el('img',null,art);img.src=new URL(`./assets/products/previews/${b.id}.png`,import.meta.url).href;img.alt=b.name;img.loading='lazy';img.decoding='async';img.draggable=false;
  el('span',have?(placed.has(b.id)?'已摆在小屋':'已放入仓库'):recover?'可以免费找回':goal.unlocked?'可以动手啦':'小目标解锁',art,'craft-badge');const copy=el('div',null,card,'craft-card-copy');el('small',BLUEPRINT_THEMES.find(x=>x.id===theme).name,copy);el('h4',b.name,copy);
  const ingredients=el('div',null,copy,'craft-materials');for(const item of needs){const n=el('span',`${lifeItemName(item.id)} ${item.have}/${item.need}`,ingredients);n.dataset.enough=String(!item.missing);n.title=`需要${item.need}份，已有${item.have}份`;}
  if(!have&&!recover&&!goal.unlocked)el('p',`解锁小目标：${goal.label}（${goal.current}/${goal.need}）`,copy,'craft-goal');
  else if(!have&&!recover&&missing.length)el('p','还缺 '+missing.map(x=>`${lifeItemName(x.id)} × ${x.missing}`).join('、'),copy,'craft-goal');
  else el('p',have?'每件家具都能在装修时自由摆放。':recover?'制作记录还在，不再消耗材料。':'确认制作后才扣材料，不使用学习积分。',copy,'craft-goal');
  const actions=el('div',null,copy,'craft-actions');
  if(have)button(placed.has(b.id)?'调整这件家具':'摆进房间并调整',()=>placeFurniture(b.id),actions,'craft-primary');
  else if(recover)button('免费找回家具',()=>perform({type:'craft',id:b.id}),actions,'craft-primary');
  else if(!goal.unlocked)button('去完成小目标',()=>navigate(goal.tab,{filter:goal.filter}),actions,'craft-primary');
  else if(missing.length)button('去补齐材料',()=>navigate('garden',{sub:'market'}),actions,'craft-primary');
  else button('制作这件家具',()=>perform({type:'craft',id:b.id}),actions,'craft-primary');
  if(!have)button('放进家里试试',()=>preview(b.id),actions);
 }
 return {dispose(){events.abort();root.remove();}};
}
