/** 独立商店视图；只使用传入的 room API，不访问存储或修改场景对象。另行引入 shop.css。 */
let nextPanel=0;
const SVG='http://www.w3.org/2000/svg';
const number=value=>Number.isFinite(value)?value:0;
const format=value=>number(value).toLocaleString('zh-CN');
const localDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};

export function createShopPanel({root,api,pointsLabel='学习积分',demo=false}={}){
  if(!root?.ownerDocument||!api||typeof api.getState!=='function')throw new TypeError('商店需要房间根节点和 API');
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal},id=`room-shop-${++nextPanel}`;
  const label=typeof pointsLabel==='string'&&pointsLabel.trim()?pointsLabel:'学习积分';
  let disposed=false,opened=false,activeTab='furniture',state={},pending=false,sequence=0,returnFocus=null;
  let feedback={text:'每一次学习，都让小屋多一点喜欢。',tone:'neutral'};
  const cards=new Map(),claimed=new Set(),tabs=new Map(),panels=new Map();
  function el(tag,className,text,parent){const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;parent?.append(node);return node;}
  function svg(parent,tag,attrs={}){const node=doc.createElementNS(SVG,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;}
  function icon(parent,kind){
    const art=svg(parent,'svg',{viewBox:'0 0 24 24',fill:'none','aria-hidden':'true'});
    if(kind==='bag'){svg(art,'path',{d:'M5 8h14l1 12H4L5 8Z',stroke:'currentColor','stroke-width':1.7,'stroke-linejoin':'round'});svg(art,'path',{d:'M8 9V6a4 4 0 0 1 8 0v3',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round'});}
    else if(kind==='close'){svg(art,'path',{d:'m7 7 10 10M17 7 7 17',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round'});}
    else{svg(art,'circle',{cx:12,cy:12,r:9,fill:'#f5dfa0',stroke:'#b99b50','stroke-width':1.1});svg(art,'path',{d:'M8 15c0-5 3-8 8-8 0 5-3 8-8 8Zm0 1 6-7',fill:'#8aa982',stroke:'#607c59','stroke-width':1.1,'stroke-linecap':'round','stroke-linejoin':'round'});}
    return art;
  }
  function illustration(parent,sku){
    const art=svg(parent,'svg',{viewBox:'0 0 128 108',fill:'none','aria-hidden':'true'});
    svg(art,'ellipse',{cx:64,cy:91,rx:40,ry:7,fill:'#735b3d',opacity:.08});
    if(sku==='clover-planter'){
      svg(art,'path',{d:'M64 72V40M64 56 45 39M64 48 81 29',stroke:'#668c68','stroke-width':4,'stroke-linecap':'round'});
      for(const [cx,cy,rotate] of [[44,37,-28],[58,29,22],[78,29,27],[84,44,-24]])svg(art,'ellipse',{cx,cy,rx:12,ry:9,fill:cx>60?'#88b595':'#b0caa1',transform:`rotate(${rotate} ${cx} ${cy})`});
      svg(art,'path',{d:'m44 64 5 24a5 5 0 0 0 5 4h20a5 5 0 0 0 5-4l5-24Z',fill:'#d7a57d',stroke:'#bf8964','stroke-width':1.3});
      svg(art,'rect',{x:41,y:60,width:46,height:10,rx:4,fill:'#ebc19d'});svg(art,'path',{d:'M53 76h22',stroke:'#f3d6b6','stroke-width':2,'stroke-linecap':'round'});
    }else if(sku==='reading-shelf'){
      svg(art,'rect',{x:33,y:21,width:62,height:70,rx:7,fill:'#b7cbb2',stroke:'#7e9d7a','stroke-width':1.5});
      svg(art,'rect',{x:40,y:28,width:48,height:54,rx:2,fill:'#f9efd8'});
      for(const y of [46,66,83])svg(art,'path',{d:`M39 ${y}h50`,stroke:'#91ae88','stroke-width':4});
      for(const [x,y,h,color] of [[44,31,13,'#dab293'],[52,29,15,'#a3bfc1'],[61,32,12,'#dec77f'],[70,30,14,'#c3b2c9'],[46,51,12,'#d9a494'],[55,49,14,'#b0bf8d'],[65,50,13,'#afc4c7']])svg(art,'rect',{x,y,width:7,height:h,rx:1,fill:color});
      svg(art,'rect',{x:48,y:72,width:31,height:5,rx:2,fill:'#e0ba98'});svg(art,'path',{d:'M41 91v5m46-5v5',stroke:'#8ba282','stroke-width':5,'stroke-linecap':'round'});
    }else if(sku==='cloud-table'){
      svg(art,'path',{d:'m40 68-4 22m51-22 5 22M64 68v22',stroke:'#c6a180','stroke-width':7,'stroke-linecap':'round'});
      svg(art,'path',{d:'M29 53c-4-12 9-22 20-17 3-14 23-16 30-3 15-5 28 8 22 20 9 14-3 25-17 22-8 9-23 7-28 1-19 7-35-7-27-23Z',fill:'#fff9e9',stroke:'#dbd2b8','stroke-width':1.5});
      svg(art,'path',{d:'M42 63c8 5 35 7 46-2',stroke:'#ede4d0','stroke-width':2,'stroke-linecap':'round'});svg(art,'circle',{cx:68,cy:40,r:5,fill:'#d7e7ce'});
    }else if(sku==='moon-ornament'){
      svg(art,'path',{d:'M74 19C39 11 25 49 48 69c14 13 35 7 44-7-24 7-43-14-18-43Z',fill:'#efd68c',stroke:'#cfb36d','stroke-width':1.5});
      svg(art,'path',{d:'M64 74v11',stroke:'#c6a382','stroke-width':4});svg(art,'rect',{x:42,y:84,width:45,height:9,rx:4.5,fill:'#d4b494'});
      svg(art,'path',{d:'m90 24 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',fill:'#cfdfc4'});svg(art,'circle',{cx:37,cy:20,r:3,fill:'#e6cf97'});
    }else svg(art,'rect',{x:38,y:33,width:52,height:52,rx:12,fill:'#bfd2b4'});
  }
  const wrapper=el('div','room-shop',undefined,root);
  const hud=el('div','room-shop__hud',undefined,wrapper);
  // 左上角工具行：钱包 + 商店按钮并排，右上角让位给个人主页等级徽章，避免按钮重叠。
  const topbar=el('div','room-shop__topbar',undefined,hud);
  const balanceButton=el('button','room-shop__wallet',undefined,topbar);balanceButton.type='button';icon(balanceButton,'coin');
  const walletCopy=el('span','room-shop__wallet-copy',undefined,balanceButton),walletLabel=el('span','room-shop__wallet-label',label,walletCopy),balanceText=el('strong','room-shop__balance','0',walletCopy);
  const trigger=el('button','room-shop__trigger',undefined,topbar);trigger.type='button';icon(trigger,'bag');el('span','','商店',trigger);trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',id);
  // v2.8.1：把装修按钮并入左上工具行（钱包｜商店｜装修），与右上角个人主页等级徽章彻底分开。
  const decorate=root.querySelector('[data-room-control="decorate"]');
  if(decorate){decorate.classList.add('room-shop__decorate');topbar.append(decorate);}
  const shade=el('div','room-shop__shade',undefined,wrapper);shade.hidden=true;shade.setAttribute('aria-hidden','true');
  const dialog=el('section','room-shop__sheet',undefined,wrapper);dialog.id=id;dialog.hidden=true;dialog.tabIndex=-1;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',`${id}-title`);
  const header=el('header','room-shop__header',undefined,dialog),heading=el('div','',undefined,header);
  el('p','room-shop__eyebrow','让学习，慢慢住进生活',heading);const title=el('h2','room-shop__title','小屋商店',heading);title.id=`${id}-title`;
  const closeButton=el('button','room-shop__close',undefined,header);closeButton.type='button';closeButton.setAttribute('aria-label','关闭商店');icon(closeButton,'close');
  const tablist=el('div','room-shop__tabs',undefined,dialog);tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','商店分类');
  const body=el('div','room-shop__body',undefined,dialog);
  for(const [name,text] of [['furniture','家具'],['expansion','扩建'],['points','积分']]){
    const tab=el('button','room-shop__tab',text,tablist);tab.type='button';tab.id=`${id}-tab-${name}`;tab.dataset.shopTab=name;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`${id}-panel-${name}`);tabs.set(name,tab);
    const panel=el('div','room-shop__panel',undefined,body);panel.id=`${id}-panel-${name}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panels.set(name,panel);
    tab.addEventListener('click',()=>selectTab(name),listen);
    tab.addEventListener('keydown',event=>{const names=[...tabs.keys()],index=names.indexOf(name);let next;if(event.key==='ArrowRight')next=names[(index+1)%names.length];if(event.key==='ArrowLeft')next=names[(index+names.length-1)%names.length];if(event.key==='Home')next=names[0];if(event.key==='End')next=names.at(-1);if(next){event.preventDefault();selectTab(next);tabs.get(next).focus();}},listen);
  }
  const furniture=panels.get('furniture');el('p','room-shop__intro','把喜欢的小物，一件件带回家。',furniture);const grid=el('div','room-shop__grid',undefined,furniture);
  const expansion=panels.get('expansion'),roomArt=el('div','room-shop__room-art',undefined,expansion);
  const house=svg(roomArt,'svg',{viewBox:'0 0 260 132',fill:'none','aria-hidden':'true'});
  svg(house,'ellipse',{cx:130,cy:115,rx:93,ry:10,fill:'#729178',opacity:.12});svg(house,'path',{d:'m61 57 69-36 69 36v49l-69 18-69-18Z',fill:'#f9e7bb',stroke:'#d6bf8b','stroke-width':2});svg(house,'path',{d:'m61 57 69 22 69-22M130 79v45',stroke:'#d6bf8b','stroke-width':2});svg(house,'path',{d:'m53 56 77-42 77 42-77 29Z',fill:'#acc8ac',stroke:'#8ea98c','stroke-width':2,'stroke-linejoin':'round'});svg(house,'path',{d:'m101 48 29-15 29 15-29 13Z',fill:'#dce9cc'});svg(house,'path',{d:'m151 91 18-5v22l-18 5Z',fill:'#e0bd8f'});svg(house,'path',{d:'m80 79 18 5v14l-18-5Z',fill:'#fdf9e8'});
  const roomName=el('h3','room-shop__room-name','初始小屋',expansion),dimensions=el('p','room-shop__dimensions','',expansion);
  const tierSteps=el('div','room-shop__tier-steps',undefined,expansion),nextBox=el('div','room-shop__next',undefined,expansion);
  const nextTitle=el('strong','','下一站',nextBox),nextDimensions=el('p','','',nextBox),nextDescription=el('span','room-shop__muted','多一点空间，放下更多喜欢。',nextBox);
  const expandButton=el('button','room-shop__primary room-shop__expand','扩建小屋',expansion);expandButton.type='button';expandButton.dataset.shopAction='expand';
  const points=panels.get('points');el('div','room-shop__points-mark','',points);icon(points.firstChild,'coin');
  el('h3','room-shop__points-title',demo?'学习奖励体验':'学习，攒下每一点进步',points);
  el('p','room-shop__points-copy',demo?`这里的${label}用于体验兑换。下面的学习奖励每天各可模拟一次。`:`在 App 中完成新词学习、复习和签到后，${label}会自动记入账户。`,points);
  const rewards=el('div','room-shop__rewards',undefined,points),rewardButtons=[];
  for(const reward of [{key:'learned',name:'新学 10 词',amount:100,description:'新词学习，每词 10 分',input:{learned:10}},{key:'reviewed',name:'复习 10 词',amount:50,description:'温故知新，每词 5 分',input:{reviewed:10}},{key:'check-in',name:'每日签到',amount:20,description:'每天回来，积累一点进步',input:{checkIn:true}}]){
    const row=el('div','room-shop__reward',undefined,rewards),copy=el('div','',undefined,row);el('strong','',demo?reward.name:reward.key==='learned'?'学习新词':reward.key==='reviewed'?'复习单词':'每日签到',copy);el('small','',reward.description,copy);
    if(demo){const button=el('button','room-shop__reward-button',`+${reward.amount}`,row);button.type='button';button.dataset.shopReward=reward.key;rewardButtons.push({button,reward});button.addEventListener('click',()=>{
      const eventId=`demo-${reward.key}:${localDate()}`;
      void act(()=>api.creditLearning({...reward.input,eventId}),result=>{if(result.ok)claimed.add(eventId);});
    },listen);}else el('span','room-shop__reward-rate',reward.key==='check-in'?'+20':reward.key==='learned'?'+10 / 词':'+5 / 词',row);
  }
  el('p','room-shop__footnote',demo?'体验积分仅用于当前演示；实际积分由 App 学习记录发放。':'积分与家具会随账户保存。持续学习，小屋会慢慢长大。',points);
  const footer=el('footer','room-shop__footer',undefined,dialog),status=el('p','room-shop__status','',footer);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');

  function shop(){return state.shop||{};}
  function blocked(){const current=shop();if(pending||current.busy)return '正在处理，请稍候';if(!state.ready||state.lifecycle!=='ready')return '房间尚未就绪';if(state.decoration)return '请先完成或取消装修';if(current.valid===false&&current.error?.code!=='STORAGE_WRITE_FAILED')return current.error?.message||'账户暂不可用';return '';}
  function selectTab(name){activeTab=tabs.has(name)?name:'furniture';for(const [key,tab] of tabs){tab.setAttribute('aria-selected',String(key===activeTab));tab.tabIndex=key===activeTab?0:-1;panels.get(key).hidden=key!==activeTab;}body.scrollTop=0;}
  function makeCard(product){
    const card=el('article','room-shop__card',undefined,grid);card.dataset.shopSku=product.sku;
    const art=el('div','room-shop__product-art',undefined,card);illustration(art,product.sku);const badge=el('span','room-shop__owned','已收藏',art);
    const name=el('h3','room-shop__product-name','',card),description=el('p','room-shop__product-description','',card),bottom=el('div','room-shop__card-bottom',undefined,card),price=el('span','room-shop__price','',bottom);
    const button=el('button','room-shop__buy','兑换',bottom);button.type='button';button.dataset.shopAction='purchase';button.dataset.sku=product.sku;
    button.addEventListener('click',()=>{void act(()=>api.purchaseFurniture(product.sku,requestId('purchase',product.sku)));},listen);
    const record={card,name,description,price,button,badge};cards.set(product.sku,record);return record;
  }
  function render(){
    if(disposed)return;const current=shop(),reason=blocked(),balance=number(current.balance),owned=new Set(current.owned||[]);
    walletLabel.textContent=label;balanceText.textContent=format(balance);balanceButton.setAttribute('aria-label',`${label} ${format(balance)}，查看积分说明`);
    trigger.disabled=state.lifecycle==='disposed';dialog.setAttribute('aria-busy',String(pending||!!current.busy));
    const catalog=Array.isArray(current.catalog)?current.catalog:[],present=new Set();
    for(const product of catalog){
      if(typeof product?.sku!=='string')continue;present.add(product.sku);const item=cards.get(product.sku)||makeCard(product),isOwned=owned.has(product.sku),short=balance<number(product.price);
      item.name.textContent=product.name||product.sku;item.description.textContent=product.description||'';item.price.textContent=`${format(product.price)} 积分`;
      item.button.disabled=isOwned||!!reason||short;item.button.textContent=isOwned?'已拥有':pending||current.busy?'处理中':short?'积分不足':'兑换';item.button.title=isOwned?'这件家具已经在你的小屋里':reason||'';item.button.setAttribute('aria-label',`${isOwned?'已拥有':'兑换'}${product.name||product.sku}，${format(product.price)}${label}`);item.badge.hidden=!isOwned;item.card.dataset.owned=String(isOwned);
    }
    for(const [sku,item] of cards)if(!present.has(sku)){item.card.remove();cards.delete(sku);}
    roomName.textContent=current.roomName||'初始小屋';dimensions.textContent=`${number(current.width).toFixed(1)} × ${number(current.depth).toFixed(1)} 米 · ${(number(current.width)*number(current.depth)).toFixed(1)} ㎡`;
    const tiers=Array.isArray(current.tiers)?current.tiers:[];
    if(tierSteps.children.length!==tiers.length){tierSteps.replaceChildren();for(const tier of tiers){const step=el('span','room-shop__tier','',tierSteps);step.dataset.level=String(tier.level);}}
    [...tierSteps.children].forEach((step,index)=>{const tier=tiers[index];step.textContent=tier.name;step.dataset.active=String(tier.level===current.roomLevel);step.dataset.complete=String(tier.level<current.roomLevel);});
    const next=current.nextTier;nextBox.dataset.complete=String(!next);nextTitle.textContent=next?`下一站 · ${next.name}`:'已经是宽敞大屋';
    nextDimensions.textContent=next?`${number(next.width).toFixed(1)} × ${number(next.depth).toFixed(1)} 米 · ${(number(next.width)*number(next.depth)).toFixed(1)} ㎡`:'每一份喜欢，都有自己的位置。';
    nextDescription.textContent=next?`扩建需要 ${format(next.price)} ${label}`:'继续学习，慢慢布置属于你的小世界。';
    expandButton.disabled=!next||!!reason||balance<number(next?.price);expandButton.textContent=!next?'已达最高等级':pending||current.busy?'正在布置新空间…':balance<number(next.price)?`还差 ${format(next.price-balance)} ${label}`:`扩建小屋 · ${format(next.price)} 积分`;expandButton.title=reason;
    for(const {button,reward} of rewardButtons){const done=claimed.has(`demo-${reward.key}:${localDate()}`);button.disabled=done||!!reason;button.textContent=done?'今日已领取':`+${reward.amount}`;button.title=reason;}
    status.textContent=current.valid===false?(current.error?.message||'账户暂不可用，积分与家具未发生变更'):reason||feedback.text;status.dataset.tone=current.valid===false?'error':reason?'neutral':feedback.tone;
  }
  function update(nextState){if(disposed)return;state=nextState&&typeof nextState==='object'?nextState:{};render();}
  function refresh(){try{update(api.getState());}catch{feedback={text:'暂时无法读取房间状态，请稍后重试。',tone:'error'};render();}}
  function requestId(operation,sku=''){return `${id}:${Date.now().toString(36)}:${++sequence}:${operation}:${sku}`;}
  async function act(operation,after){
    if(disposed)return;const reason=blocked();if(reason){feedback={text:reason,tone:'neutral'};render();return;}
    pending=true;feedback={text:'正在为小屋安排，请稍候…',tone:'neutral'};render();
    try{const result=await operation();if(disposed)return;if(!result||typeof result.ok!=='boolean')throw new Error('房间暂时没有返回操作结果，请稍后重试。');after?.(result);feedback={text:result.message||(result.ok?'已完成，快看看小屋的新变化。':'操作未完成，积分与家具未发生变更。'),tone:result.ok?'success':'error'};}
    catch(error){if(!disposed)feedback={text:error?.message||'暂时未能完成操作，请稍后重试。',tone:'error'};}
    finally{if(!disposed){pending=false;refresh();}}
  }
  function open(tab='furniture'){
    if(disposed)return;refresh();selectTab(tab);if(!opened)returnFocus=doc.activeElement;opened=true;shade.hidden=false;dialog.hidden=false;trigger.setAttribute('aria-expanded','true');
    queueMicrotask(()=>{if(opened&&!disposed)closeButton.focus({preventScroll:true});});
  }
  function close(){if(disposed||!opened)return;opened=false;shade.hidden=true;dialog.hidden=true;trigger.setAttribute('aria-expanded','false');const target=returnFocus?.isConnected&&!returnFocus.closest?.('[hidden]')?returnFocus:trigger;returnFocus=null;target.focus?.({preventScroll:true});}
  trigger.addEventListener('click',()=>opened?close():open(),listen);balanceButton.addEventListener('click',()=>open('points'),listen);closeButton.addEventListener('click',close,listen);shade.addEventListener('click',close,listen);
  expandButton.addEventListener('click',()=>{void act(()=>api.expandRoom(requestId('expand')));},listen);
  doc.addEventListener('keydown',event=>{
    // 多个独立房间共用 document 时，仅当前持有焦点的面板响应快捷键。
    if(!opened||disposed||!dialog.contains(doc.activeElement))return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(node=>!node.closest('[hidden]'));
    const first=focusable[0],last=focusable.at(-1);if(!first){event.preventDefault();dialog.focus();return;}
    if(event.shiftKey&&(doc.activeElement===first||doc.activeElement===dialog)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(doc.activeElement===last||!dialog.contains(doc.activeElement))){event.preventDefault();first.focus();}
  },listen);
  selectTab('furniture');refresh();
  return {update,open,close,dispose(){if(disposed)return;const focused=wrapper.contains(doc.activeElement);disposed=true;events.abort();wrapper.remove();cards.clear();if(focused)root.querySelector('canvas')?.focus({preventScroll:true});}};
}
