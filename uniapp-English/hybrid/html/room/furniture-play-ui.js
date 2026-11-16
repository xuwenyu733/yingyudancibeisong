import {ACTIVITY_CHOICES,activityChoice} from './activity-content.mjs';
import {createFurnitureHints} from './furniture-hints-ui.js';
const ACTIONS=[
 ['shop-reading-shelf','reading-shelf','阅读书架','走过去，翻开小故事'],['table','table','小桌茶会','到桌旁坐坐、喝杯茶'],['shop-cloud-table','cloud-table','云朵茶会','到桌旁坐坐、喝杯茶'],
 ['sofa','sofa','软软沙发','走过去坐下，再点可起身'],['ottoman-a','ottoman-a','小软凳','坐下来歇一会儿'],['ottoman-b','ottoman-b','另一张软凳','走过去坐坐'],
 ['floor-pot','floor-pot','照顾盆栽','走近小苗，给它浇水'],['shop-clover-planter','clover-planter','四叶草盆栽','给四叶草浇点水'],['lamp','lamp','暖暖台灯','轻轻点亮或关灯'],
 ['shop-star-lamp','star-lamp','星星夜灯','和伙伴一起看星光'],['shop-rocket-toy','rocket-toy','小火箭','走近后启动探索引擎']
];
export function createFurniturePlayPanel({root,api}){
 const doc=root.ownerDocument,win=doc.defaultView,abort=new win.AbortController(),listen={signal:abort.signal};let disposed=false,cardEvents=null;
 const el=(tag,text,parent,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;if(tag==='button')n.type='button';parent?.append(n);return n;};
 const hints=createFurnitureHints({root,api}),variants={read:'forest',tea:'garden'};
 const more=root.querySelector('.room-mobile-more')||root,launch=el('button','家具小玩法',more,'studio-play-launch');
 const panel=el('section',null,root,'studio-panel studio-play-panel');panel.hidden=true;panel.setAttribute('aria-label','家具小玩法');const header=el('header',null,panel);el('h2','小屋里，一起玩',header);const close=el('button','收起',header);
 el('p','点一件家具，伙伴会找到路走过去。只有已经摆在这一层的家具才会出现在这里。',panel,'studio-note');const cards=el('div',null,panel,'furniture-play-grid'),message=el('output','',panel,'studio-status');message.setAttribute('role','status');
 const status=el('section',null,root,'furniture-activity-status');status.hidden=true;const text=el('output','',status);text.setAttribute('role','status');const stop=el('button','结束互动',status);stop.addEventListener('click',()=>api.cancelFurnitureActivity(),listen);
 function refresh(){cardEvents?.abort();cardEvents=new win.AbortController();cards.replaceChildren();const layout=api.getLayout();const rows=ACTIONS.filter(([id])=>layout?.furniture?.[id]&&api.getFurniture?.(id));
  for(const [kind,label]of [['read','今天读什么'],['tea','今天的茶会']]){if(!rows.some(([id])=>kind==='read'?id==='shop-reading-shelf':['table','shop-cloud-table'].includes(id)))continue;const line=el('label',label,cards,'furniture-variant');const picker=el('select',null,line);picker.setAttribute('aria-label',label);for(const choice of ACTIVITY_CHOICES[kind]){const op=el('option',choice.name,picker);op.value=choice.id;}picker.value=variants[kind];picker.addEventListener('change',()=>variants[kind]=picker.value,{signal:cardEvents.signal});}
  for(const [id,sku,name,help]of rows){const b=el('button',null,cards,'furniture-play-card');b.dataset.furniturePlay=id;const img=el('img',null,b);img.src=new URL(`./assets/products/previews/${sku}.png`,import.meta.url).href;img.alt='';img.draggable=false;const copy=el('span',null,b);el('strong',name,copy);el('small',help,copy);b.addEventListener('click',()=>{if(api.interactFurniture(id,{variant:id==='shop-reading-shelf'?variants.read:variants.tea})){panel.hidden=true;}else{message.textContent='暂时走不到这里。先结束装修，或挪开挡住的家具再试试。';}},{signal:cardEvents.signal});}
  if(!rows.length)el('p','这一层还没有可互动的家具，去仓库摆上桌子或盆栽吧。',cards);message.textContent='这些小互动不消耗积分或食材。';
 }
 function renderActivity(){const a=api.getFurnitureActivity?.();status.hidden=!a;root.toggleAttribute('data-furniture-activity',!!a);if(a)text.textContent=(a.phase==='approach'?'正在走过去 · ':'正在一起玩 · ')+a.label+(a.phase==='playing'?(activityChoice(a.kind,a.variant)?.pages?.[Math.min(2,Math.floor(a.elapsed/2))]?' · '+activityChoice(a.kind,a.variant).pages[Math.min(2,Math.floor(a.elapsed/2))]:' · '+(activityChoice(a.kind,a.variant)?.name||'')):'');}
 const activityTimer=win.setInterval(renderActivity,400);
 launch.addEventListener('click',()=>{for(const n of root.querySelectorAll('.studio-panel,.studio-guide'))n.hidden=true;more.hidden=true;root.querySelector('[data-room-action="more"]')?.setAttribute('aria-expanded','false');panel.hidden=false;refresh();close.focus();},listen);close.addEventListener('click',()=>{panel.hidden=true;root.querySelector('.room-mobile-dock button:last-child')?.focus();},listen);
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close.click();}},listen);
 root.addEventListener('pet-room-interaction',e=>{const {type,detail}=e.detail||{};if(type==='furniture-activity')renderActivity();if(type==='furniture-trial'&&detail.active||type==='decoration-mode'&&detail.active)panel.hidden=true;if(!panel.hidden&&['layout-change','furniture-stored','furniture-placed','ready'].includes(type))refresh();},listen);
 return {dispose(){if(disposed)return;disposed=true;hints.dispose();win.clearInterval(activityTimer);cardEvents?.abort();abort.abort();launch.remove();panel.remove();status.remove();root.removeAttribute('data-furniture-activity');}};
}
