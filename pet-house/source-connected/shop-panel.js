/** 独立商店视图；只使用传入的 room API，不访问存储或修改场景对象。另行引入 shop.css。 */
import {SURFACE_CATALOG} from './surface-catalog.mjs';
import {drawSurfaceIllustration,decorateShopIllustration,drawBuiltinIllustration} from './shop-art.mjs';
import {PRODUCT_PREVIEW_INFO} from './product-previews.mjs';
import {activeElementFor} from './dom.mjs';
import {WISH_KEY_SUFFIX,readWishTargets,writeWishTargets,categoryOf,applyCatalogView,wishTargetOf,SORT_OPTIONS,WISH_CATEGORIES} from './shop-tools.mjs';
import {dailyFeature} from './companion-extra.mjs';
let nextPanel=0;
const surfaceProducts=new Map(SURFACE_CATALOG.map(product=>[product.sku,product]));
const petPreviewNames=Object.freeze({'apricot-fox':'杏橘狐','cloud-bunny':'云朵兔','mint-cat':'薄荷猫','cocoa-bear':'可可熊','starlight-penguin':'星光企鹅'});
const SVG='http://www.w3.org/2000/svg';
const number=value=>Number.isFinite(value)?value:0;
const format=value=>number(value).toLocaleString('zh-CN');
const localDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};

export function createShopPanel({root,api,pointsLabel='学习积分',demo=false}={}){
  if(!root?.ownerDocument||!api||typeof api.getState!=='function')throw new TypeError('商店需要房间根节点和 API');
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal},id=`room-shop-${++nextPanel}`;
  const label=typeof pointsLabel==='string'&&pointsLabel.trim()?pointsLabel:'学习积分';
  let disposed=false,opened=false,activeTab='furniture',state={},pending=false,sequence=0,returnFocus=null,lastRenderKey=null;
  let feedback={text:'每一次学习，都让小屋多一点喜欢。',tone:'neutral'};
  const cards=new Map(),claimed=new Set(),tabs=new Map(),panels=new Map();
  // v2.17/F4：每类一个筛选条（搜索/价格排序/只看未拥有）+ 每类心愿目标（本地持久化）。
  const views=new Map();const wish={targets:null,key:null,init:false};
  function healthyStorage(){try{return win.localStorage||null;}catch{return null;}}
  function currentWishKey(){if(wish.init&&wish.key)return wish.key;wish.key=null;wish.init=true;const key=shop().storageKey;if(typeof key==='string'&&key.trim())wish.key=key+WISH_KEY_SUFFIX;return wish.key;}
  function ensureWishTargets(){const key=currentWishKey();if(wish.targets!==null)return;wish.targets=key?readWishTargets(key,healthyStorage()):{pets:'',furniture:'',flooring:'',wall:''};}
  function setWish(category,sku){
    if(!WISH_CATEGORIES.includes(category))return;ensureWishTargets();
    wish.targets[category]=typeof sku==='string'&&sku&&wish.targets[category]!==sku?sku:'';
    const key=currentWishKey();if(key)writeWishTargets(key,wish.targets,healthyStorage());
    render();
  }
  function el(tag,className,text,parent){const node=doc.createElement(tag);if(tag==='button')node.type='button';if(className)node.className=className;if(text!==undefined)node.textContent=text;parent?.append(node);return node;}
  function svg(parent,tag,attrs={}){const node=doc.createElementNS(SVG,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;}
  function icon(parent,kind){
    const art=svg(parent,'svg',{viewBox:'0 0 24 24',fill:'none','aria-hidden':'true'});
    if(kind==='bag'){svg(art,'path',{d:'M5 8h14l1 12H4L5 8Z',stroke:'currentColor','stroke-width':1.7,'stroke-linejoin':'round'});svg(art,'path',{d:'M8 9V6a4 4 0 0 1 8 0v3',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round'});}
    else if(kind==='close'){svg(art,'path',{d:'m7 7 10 10M17 7 7 17',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round'});}
    else if(kind==='box'){svg(art,'path',{d:'M4 8.5 12 4l8 4.5v8L12 21l-8-4.5Z',stroke:'currentColor','stroke-width':1.6,'stroke-linejoin':'round'});svg(art,'path',{d:'M4 8.5 12 13l8-4.5M12 13v8M8 6.3l8 4.5',stroke:'currentColor','stroke-width':1.6,'stroke-linejoin':'round'});}
    else{svg(art,'circle',{cx:12,cy:12,r:9,fill:'#f5dfa0',stroke:'#b99b50','stroke-width':1.1});svg(art,'path',{d:'M8 15c0-5 3-8 8-8 0 5-3 8-8 8Zm0 1 6-7',fill:'#8aa982',stroke:'#607c59','stroke-width':1.1,'stroke-linecap':'round','stroke-linejoin':'round'});}
    return art;
  }
  function illustration(parent,sku,product={},allowModelPreview=true){
    if(product.category==='gift'&&product.image){const preview=doc.createElement('img');preview.src=product.image;preview.alt=product.name;preview.className='room-shop__model-preview';preview.draggable=false;parent.append(preview);return;}
    if(Object.hasOwn(petPreviewNames,sku)){
      const preview=doc.createElement('img');preview.className='room-shop__pet-model-preview';
      preview.src=new URL(`./assets/pets/previews/${sku}.png`,import.meta.url).href;
      preview.alt=`${petPreviewNames[sku]}实际模型`;preview.width=512;preview.height=512;preview.decoding='async';preview.draggable=false;
      parent.append(preview);return;
    }
    if(allowModelPreview&&PRODUCT_PREVIEW_INFO.has(sku)){
      const item=PRODUCT_PREVIEW_INFO.get(sku),preview=doc.createElement('img');preview.className='room-shop__model-preview';
      preview.src=new URL(`./assets/products/previews/${sku}.png`,import.meta.url).href;preview.alt=item.name;preview.width=512;preview.height=384;preview.decoding='async';preview.draggable=false;
      preview.addEventListener('error',()=>{if(disposed||!preview.isConnected)return;preview.remove();illustration(parent,sku,product,false);},{once:true,signal:events.signal});
      parent.dataset.modelPreview='true';parent.append(preview);return;
    }
    const art=svg(parent,'svg',{viewBox:'0 0 128 108',fill:'none','aria-hidden':'true'});
    const surface=surfaceProducts.get(sku);decorateShopIllustration(svg,art,sku,surface||product);
    if(surface){drawSurfaceIllustration(svg,art,surface);return;}
    if(drawBuiltinIllustration(svg,art,sku))return;
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
    }else if(sku==='star-lamp'){
      svg(art,'ellipse',{cx:64,cy:86,rx:30,ry:6,fill:'#c6a382'});svg(art,'rect',{x:56,y:76,width:16,height:7,rx:3,fill:'#8a5a2f'});
      svg(art,'path',{d:'M62 78v-30',stroke:'#e8c471','stroke-width':4,'stroke-linecap':'round'});
      svg(art,'path',{d:'m64 24 8 15 17 3-12 12 3 17-16-8-16 8 3-17-12-12 17-3Z',fill:'#f5df8f',stroke:'#e0b44f','stroke-width':1.5,'stroke-linejoin':'round'});
      svg(art,'circle',{cx:64,cy:41,r:6,fill:'#fff1a8'});svg(art,'path',{d:'m76 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z',fill:'#ffe28a'});
      svg(art,'path',{d:'m46 28 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z',fill:'#fff3c4'});
    }else if(sku==='mushroom-stool'){
      svg(art,'path',{d:'M54 84h20c0-4-2-8-6-10-2-9-10-15-19-13-8 2-13 9-12 16-5 2-8 5-8 9Z',fill:'#d97f5b',stroke:'#bf6a48','stroke-width':1.4});
      svg(art,'ellipse',{cx:64,cy:58,rx:21,ry:15,fill:'#e08561'});
      svg(art,'rect',{x:60,y:63,width:8,height:19,rx:4,fill:'#f9efd8'});svg(art,'rect',{x:52,y:80,width:24,height:7,rx:3.5,fill:'#d7a57d'});
      for(const [x,y] of [[55,58],[67,53],[60,66],[72,62]])svg(art,'circle',{cx:x,cy:y,r:4.2,fill:'#fff7e6'});
      svg(art,'ellipse',{cx:64,cy:47,rx:27,ry:11,fill:'#e08561'});
      svg(art,'path',{d:'M54 41c6-2 12-2 18 0',stroke:'#c96f4c','stroke-width':1.6,'fill':'none','stroke-linecap':'round'});
    }else if(sku==='beehive-ornament'){
      svg(art,'path',{d:'M44 88h40l-4-6c-2-12-9-21-16-21s-14 9-16 21Z',fill:'#d7a57d',stroke:'#bf8964','stroke-width':1.4});
      svg(art,'ellipse',{cx:64,cy:61,rx:26,ry:22,fill:'#e8c471',stroke:'#cfab4f','stroke-width':1.5});
      svg(art,'path',{d:'M42 54c5 3 10 3 15 0M47 63c5 3 10 3 15 0M45 70c5 2 9 2 13 0',stroke:'#cfab4f','stroke-width':1.6,'stroke-linecap':'round','fill':'none'});
      svg(art,'path',{d:'M50 64 72 55',stroke:'#f3dc9a','stroke-width':2,'stroke-linecap':'round'});svg(art,'circle',{cx:54,cy:60,r:3.4,fill:'#8a5a2f'});
      svg(art,'ellipse',{cx:85,cy:44,rx:9,ry:7,fill:'#e8c471',stroke:'#cfab4f','stroke-width':1.2});
      svg(art,'ellipse',{cx:87,cy:41,rx:7,ry:5,fill:'#d7e7ce'});svg(art,'path',{d:'m81 36 8-3-2 8',stroke:'#3d2b1e','stroke-width':1.2,'fill':'none','stroke-linecap':'round'});
    }else if(sku==='rocket-toy'){
      svg(art,'path',{d:'M64 78 52 96h24Z',fill:'#d97f5b'});svg(art,'ellipse',{cx:64,cy:86,rx:20,ry:5,fill:'#e8c471'});
      svg(art,'ellipse',{cx:64,cy:78,rx:12,ry:8,fill:'#f5df8f'});svg(art,'path',{d:'M64 40v34',stroke:'#bf8964','stroke-width':3,'stroke-linecap':'round'});
      svg(art,'path',{d:'M64 40c-10 0-17 9-17 19 0 14 7 23 17 23s17-9 17-23c0-10-7-19-17-19Z',fill:'#fff3dc',stroke:'#c6a382','stroke-width':1.6});
      svg(art,'circle',{cx:64,cy:58,r:7,fill:'#9cc9b2',stroke:'#7e9d7a','stroke-width':1.4});svg(art,'circle',{cx:64,cy:58,r:3,fill:'#d7e7ce'});
      svg(art,'path',{d:'m50 41 7 7-7 7M78 41l-7 7 7 7',fill:'#d97f5b'});
      svg(art,'path',{d:'m44 22 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z',fill:'#ffe28a'});svg(art,'path',{d:'m84 18 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z',fill:'#fff3c4'});
    }else if(sku==='rainbow-arch'){
      for(const [cx,color] of [[52,'#e5aa8e'],[58,'#dba88a'],[64,'#e8c471'],[70,'#88b9a0'],[76,'#94b8c1'],[82,'#b8a5c7']])svg(art,'path',{d:`M${cx} 34a${86-cx} ${86-cx} 0 0 0-${(86-cx)*2} 0`,fill:'none',stroke:color,'stroke-width':6,'stroke-linecap':'round'});
      for(const [x] of [[22],[90]]){svg(art,'ellipse',{cx:x,cy:72,rx:11,ry:9,fill:'#fff3dc'});svg(art,'ellipse',{cx:x-6,cy:68,rx:7,ry:6,fill:'#fff3dc'});svg(art,'ellipse',{cx:x+6,cy:68,rx:7,ry:6,fill:'#fff3dc'});}
      svg(art,'path',{d:'m64 16 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z',fill:'#ffe28a'});
    }else if(sku==='candy-tree'){
      svg(art,'rect',{x:56,y:74,width:16,height:22,rx:7,fill:'#c6a382'});svg(art,'rect',{x:49,y:94,width:30,height:7,rx:3.5,fill:'#8a5a2f'});
      svg(art,'path',{d:'M64 74c-2 0-4 2-4 4s2 4 4 4 4-2 4-4-2-4-4-4Z',fill:'#d97f5b'});
      svg(art,'path',{d:'M64 72c-14 0-24 10-24 22 0 10 8 15 16 15h16c8 0 16-5 16-15 0-12-10-22-24-22Z',fill:'#9cc9b2',stroke:'#7e9d7a','stroke-width':1.5});
      svg(art,'path',{d:'M46 74c-6 0-9 4-9 9 0 4 3 6 6 6 4 0 6-3 6-6s-1-9-3-9Z',fill:'#b0cfa1'});
      svg(art,'path',{d:'m64 74 10-8M64 82l-12-7',stroke:'#88b595','stroke-width':2,'stroke-linecap':'round'});
      for(const [x,y,c] of [[54,78,'#e5aa8e'],[62,70,'#e8c471'],[70,76,'#b8a5c7'],[58,64,'#e8c471'],[68,66,'#e5aa8e']])svg(art,'circle',{cx:x,cy:y,r:3.4,fill:c});
      svg(art,'path',{d:'m64 20 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z',fill:'#ffd34d'});
    }else svg(art,'rect',{x:38,y:33,width:52,height:52,rx:12,fill:'#bfd2b4'});
  }
  const wrapper=el('div','room-shop',undefined,root);
  const hud=el('div','room-shop__hud',undefined,wrapper);
  // 左上角工具行：钱包 + 商店按钮并排，右上角让位给个人主页等级徽章，避免按钮重叠。
  const topbar=el('div','room-shop__topbar',undefined,hud);
  const balanceButton=el('button','room-shop__wallet',undefined,topbar);balanceButton.type='button';icon(balanceButton,'coin');
  const walletCopy=el('span','room-shop__wallet-copy',undefined,balanceButton),walletLabel=el('span','room-shop__wallet-label',label,walletCopy),balanceText=el('strong','room-shop__balance','0',walletCopy);
  const trigger=el('button','room-shop__trigger',undefined,topbar);trigger.type='button';icon(trigger,'bag');el('span','','商店',trigger);trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',id);
  // v2.8.2：仓库按钮（已购买但收进仓库的家具，随时查看与摆回）。与商店按钮同排。
  const storageTrigger=el('button','room-shop__trigger room-shop__storage-trigger',undefined,topbar);storageTrigger.type='button';icon(storageTrigger,'box');el('span','','仓库',storageTrigger);storageTrigger.setAttribute('aria-expanded','false');storageTrigger.setAttribute('aria-controls',id);
  // v2.8.1：把装修按钮并入左上工具行（钱包｜商店｜装修），与右上角个人主页等级徽章彻底分开。
  const decorate=root.querySelector('[data-room-control="decorate"]');
  const decorateParent=decorate?.parentNode,decorateNext=decorate?.nextSibling,decorateClass=decorate?.className;
  if(decorate){decorate.classList.add('room-shop__decorate');topbar.append(decorate);}
  const shade=el('div','room-shop__shade',undefined,wrapper);shade.hidden=true;shade.setAttribute('aria-hidden','true');
  const dialog=el('section','room-shop__sheet',undefined,wrapper);dialog.id=id;dialog.hidden=true;dialog.tabIndex=-1;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',`${id}-title`);
  const header=el('header','room-shop__header',undefined,dialog),heading=el('div','',undefined,header);
  el('p','room-shop__eyebrow','让学习，慢慢住进生活',heading);const title=el('h2','room-shop__title','小屋商店',heading);title.id=`${id}-title`;
  const closeButton=el('button','room-shop__close',undefined,header);closeButton.type='button';closeButton.setAttribute('aria-label','关闭商店');icon(closeButton,'close');
  const tablist=el('div','room-shop__tabs',undefined,dialog);tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','商店分类');
  const body=el('div','room-shop__body',undefined,dialog);
  for(const [name,text] of [['pets','宠物'],['furniture','家具'],['flooring','地砖'],['wall','墙上挂件'],['room','屋内家具'],['storage','仓库'],['expansion','扩建'],['points','积分']]){
    const tab=el('button','room-shop__tab',text,tablist);tab.type='button';tab.id=`${id}-tab-${name}`;tab.dataset.shopTab=name;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`${id}-panel-${name}`);tabs.set(name,tab);
    const panel=el('div','room-shop__panel',undefined,body);panel.id=`${id}-panel-${name}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panels.set(name,panel);
    tab.addEventListener('click',()=>selectTab(name),listen);
    tab.addEventListener('keydown',event=>{const names=[...tabs.keys()],index=names.indexOf(name);let next;if(event.key==='ArrowRight')next=names[(index+1)%names.length];if(event.key==='ArrowLeft')next=names[(index+names.length-1)%names.length];if(event.key==='Home')next=names[0];if(event.key==='End')next=names.at(-1);if(next){event.preventDefault();selectTab(next);tabs.get(next).focus();}},listen);
  }
  const furniture=panels.get('furniture');el('p','room-shop__intro','给宝贝挑一件喜欢的小家具，我们一起把家装得暖暖的～',furniture);const grid=el('div','room-shop__grid',undefined,furniture);
  const flooring=panels.get('flooring');el('p','room-shop__intro','从清新格纹到金色拼花。兑换后铺满全屋，已收藏的地砖可免费切换。',flooring);
  const flooringGrid=el('div','room-shop__grid',undefined,flooring);
  const wall=panels.get('wall');el('p','room-shop__intro','墙上挂件集中在这里管理。已收藏的挂件可收回仓库、免费摆回墙上。',wall);
  const wallGrid=el('div','room-shop__grid',undefined,wall),productGrids={furniture:grid,flooring:flooringGrid,wall:wallGrid};
  const petsPanel=panels.get('pets');el('p','room-shop__intro','用学习积分结识新伙伴。每人同时只养一只宠物，积分兑换会请新的伙伴入住，原来的伙伴先去休息～',petsPanel);
  const petGrid=el('div','room-shop__grid',undefined,petsPanel),petCards=new Map();
  const collectionGoals=new Map();
  for(const [category,parent,items] of [['pets',petsPanel,petGrid],['furniture',furniture,grid],['flooring',flooring,flooringGrid],['wall',wall,wallGrid]]){
    // v2.17/F4：该分类的搜索/价格排序/只看未拥有工具条。
    const viewBar=el('div','room-shop__view-bar',undefined,parent);viewBar.dataset.viewBar=category;
    const viewSearch=el('input','room-shop__view-search',undefined,viewBar);viewSearch.type='search';
    viewSearch.placeholder='搜索名称…';viewSearch.setAttribute('aria-label',`搜索${{pets:'伙伴',furniture:'家具',flooring:'地砖',wall:'墙上挂件'}[category]}`);
    const viewSort=el('select','room-shop__view-sort',undefined,viewBar);viewSort.setAttribute('aria-label','价格排序');
    for(const option of SORT_OPTIONS){const opt=doc.createElement('option');opt.value=option.value;opt.textContent=option.label;viewSort.append(opt);}
    const viewUnowned=el('label','room-shop__view-unowned',undefined,viewBar);const unownedBox=doc.createElement('input');unownedBox.type='checkbox';viewUnowned.prepend(unownedBox);el('span','','只看未拥有',viewUnowned);
    const viewEmpty=el('p','room-shop__view-empty','咦，小宝贝躲到哪里去啦？换个关键词，或关掉筛选再找找～',parent);viewEmpty.hidden=true;
    const view={category,search:viewSearch,sort:viewSort,unowned:unownedBox,empty:viewEmpty};
    views.set(category,view);
    viewSearch.addEventListener('input',()=>render(),listen);
    viewSort.addEventListener('change',()=>render(),listen);
    unownedBox.addEventListener('change',()=>render(),listen);
    const goal=el('section','room-shop__collection-goal',undefined,parent);goal.dataset.collectionGoal=category;
    goal.setAttribute('aria-label',category==='pets'?'伙伴 · 单宠状态':`${({pets:'伙伴',furniture:'家具',flooring:'地砖',wall:'墙上挂件'})[category]}收藏目标`);
    const art=el('div','room-shop__goal-art',undefined,goal),copy=el('div','room-shop__goal-copy',undefined,goal);
    const count=el('span','room-shop__goal-count','',copy),title=el('strong','room-shop__goal-title','',copy),hint=el('p','room-shop__goal-hint','',copy);
    const track=el('div','room-shop__goal-track',undefined,copy),fill=el('span','',undefined,track);
    track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');
    const button=el('button','room-shop__goal-action','查看这件',copy);
    const record={goal,art,count,title,hint,track,fill,button,sku:null};collectionGoals.set(category,record);
    button.addEventListener('click',()=>{const item=(category==='pets'?petCards:cards).get(record.sku);if(!item?.card)return;item.card.tabIndex=-1;item.card.scrollIntoView({block:'nearest',behavior:'auto'});item.card.focus({preventScroll:true});},listen);
    parent.insertBefore(goal,items);
    parent.insertBefore(viewBar,goal);
  }
  function renderCollectionGoal(category,catalog,owned,balance){
    const record=collectionGoals.get(category),products=catalog.filter(product=>typeof product?.sku==='string');
    record.goal.hidden=!products.length;if(!products.length)return;
    if(category==='pets'){
      // v2.24 · 单宠制：不收集多只，只展示"当前伙伴 + 积分兑换换新伙伴"。
      const current=products.find(product=>owned.has(product.sku));
      record.goal.dataset.wished='false';record.goal.dataset.complete='false';
      record.track.hidden=true;record.button.hidden=true;record.art.hidden=false;
      record.count.textContent='每人同时只养一只';
      if(current){record.title.textContent=`当前伙伴 · ${current.name||current.sku}`;record.hint.textContent='想换新伙伴？用学习积分兑换，请新的伙伴入住，原来的伙伴先去休息～';}
      else{record.title.textContent='还没有自己的伙伴';record.hint.textContent='选一位喜欢的伙伴，用学习积分请它入住你的小屋吧～';}
      const target=current||products[0];
      if(record.sku!==target.sku){record.art.replaceChildren();illustration(record.art,target.sku,target);record.sku=target.sku;}
      return;
    }
    const count=products.filter(product=>owned.has(product.sku)).length;
    ensureWishTargets();
    const wished=typeof wish.targets[category]==='string'&&wish.targets[category]?wish.targets[category]:'';
    const next=wishTargetOf(products,sku=>owned.has(sku),wished);
    record.goal.dataset.wished=String(Boolean(next&&next.sku===wished));
    record.count.textContent=`已收藏 ${count} / ${products.length}`;
    record.track.setAttribute('aria-valuemax',String(products.length));record.track.setAttribute('aria-valuenow',String(count));
    record.track.setAttribute('aria-label',`收藏进度 ${count}/${products.length}`);record.fill.style.width=`${Math.round(count/products.length*100)}%`;
    record.art.hidden=!next;record.button.hidden=!next;record.goal.dataset.complete=String(!next);
    if(!next){record.title.textContent='本类收藏已集齐';record.hint.textContent='每一件喜欢，都已经属于你。也可以看看其他分类。';record.sku=null;return;}
    const userPicked=next.sku===wished;
    record.title.textContent=userPicked?`心愿收藏 · ${next.name||next.sku}`:`下一件收藏 · ${next.name||next.sku}`;
    const short=Math.max(0,number(next.price)-balance),ratio=number(next.price)>0?short/number(next.price):1;
    record.hint.textContent=short?`${userPicked?'心愿目标 · 未解锁':'未解锁'} · 还差 ${format(short)} ${label}，${ratio<=0.25?'就差一点点啦，再努力一点点！':ratio<=0.5?'就快攒够啦，加油！':'学习与签到慢慢攒。'}`:`${userPicked?'心愿目标':'未解锁'} · ${format(next.price)} ${label}，积分已足够，可到下方兑换。`;
    record.button.setAttribute('aria-label',`查看${userPicked?'心愿':''}待收藏的${next.name||next.sku}`);
    if(record.sku!==next.sku){record.art.replaceChildren();illustration(record.art,next.sku,next);record.sku=next.sku;}
  }
  function finishLine(parent,product,key=product.sku||product.id){
    const item=PRODUCT_PREVIEW_INFO.get(key),petStyle={
      'apricot-fox':['尖耳 · 蓬松尾',[0xedb16e,0x8fbba3,0xfff0ce]],'cloud-bunny':['长耳 · 棉花尾',[0xf8f2e9,0xadcddd,0xedb4bd]],
      'mint-cat':['猫脸 · 卷尾',[0xa2cbbb,0xf5d898,0xfff4dc]],'cocoa-bear':['圆耳 · 厚厚熊掌',[0xaa795c,0xe5b864,0xefd3ad]],'starlight-penguin':['扁鳍 · 蹼足',[0x526d88,0xeac56c,0xfff6dd]],
    }[key];
    if(!item&&!petStyle)return;const line=el('div','room-shop__finish',undefined,parent);
    el('span','room-shop__finish-label',petStyle?petStyle[0]:item.finish,line);
    const palette=el('span','room-shop__palette',undefined,line);palette.setAttribute('aria-hidden','true');
    for(const color of (petStyle?petStyle[1]:item.colors||[]).slice(0,3)){const swatch=el('i','',undefined,palette);swatch.style.backgroundColor=`#${color.toString(16).padStart(6,'0')}`;}
  }
  function makePetCard(product){
    const card=el('article','room-shop__card room-shop__pet-card',undefined,petGrid);card.dataset.petSku=product.sku;
    card.dataset.category='pet';card.dataset.rarity=product.price>=500?'premium':'fresh';
    const art=el('div','room-shop__product-art',undefined,card);illustration(art,product.sku,product);
    el('span','room-shop__collection-label',product.price>=500?'星光伙伴':'温柔陪伴',art);
    const badge=el('span','room-shop__owned','',art),name=el('h3','room-shop__product-name',product.name,card);
    el('p','room-shop__product-description',product.description,card);
    finishLine(card,product);
    const bottom=el('div','room-shop__card-bottom',undefined,card),price=el('span','room-shop__price','',bottom),button=el('button','room-shop__buy','',bottom);button.type='button';
    const wishButton=el('button','room-shop__wish','☆',bottom);wishButton.type='button';
    wishButton.setAttribute('aria-label','设为想入住的伙伴');
    wishButton.addEventListener('click',()=>setWish('pets',product.sku),listen);
    button.after(wishButton);
    button.addEventListener('click',()=>{const owned=shop().pets?.owned?.includes(product.sku);void act(()=>owned?api.selectPet(product.sku):api.purchasePet(product.sku,requestId('pet',product.sku)),
      // 心愿达成庆祝（清单29）：心愿伙伴被成功带回家时放小派对（此时心愿表尚未刷新）。
      result=>{if(result?.ok&&!result.unchanged&&!owned&&wish.targets&&wish.targets.pets===product.sku){try{api.celebrateParty?.();feedback={text:'心愿达成！你也太棒啦～',tone:'success'};}catch{}}});});
    const item={card,badge,name,price,button,wishButton};petCards.set(product.sku,item);return item;
  }
  const roomPanel=panels.get('room');el('p','room-shop__intro','这里管理正在屋内的地面家具。墙上装饰请到「墙上挂件」管理。台灯边柜需先收起上面的台灯。',roomPanel);
  const roomGrid=el('div','room-shop__grid',undefined,roomPanel),roomCards=new Map();
  function makeRoomCard(product,key){
    const card=el('article','room-shop__card',undefined,roomGrid),art=el('div','room-shop__product-art',undefined,card);illustration(art,key,product);
    card.dataset.shopSku=key;card.dataset.category='furniture';
    el('h3','room-shop__product-name',product.name,card);finishLine(card,product,key);const button=el('button','room-shop__buy','收回仓库',card);button.type='button';button.setAttribute('aria-label',`收回${product.name}`);
    button.addEventListener('click',()=>{void act(()=>api.storeFurniture(key,requestId('store',key)));});
    const item={card,button};roomCards.set(key,item);return item;
  }
  const builtinWallCards=new Map();
  function makeBuiltinWallCard(product,key){
    const card=el('article','room-shop__card',undefined,wallGrid);card.dataset.shopSku=key;card.dataset.category='wall';card.dataset.builtin='true';
    const art=el('div','room-shop__product-art',undefined,card);illustration(art,key,product);
    const badge=el('span','room-shop__owned','自带收藏',art);el('h3','room-shop__product-name',product.name||key,card);
    el('p','room-shop__product-description','随小屋一起入住的装饰画，可免费收纳和摆回。',card);finishLine(card,product,key);
    const bottom=el('div','room-shop__card-bottom',undefined,card),price=el('span','room-shop__price','',bottom),button=el('button','room-shop__buy','',bottom);button.dataset.sku=key;
    button.addEventListener('click',()=>{const stored=shop().stored?.includes(key);void act(()=>stored?api.unstoreFurniture(key,requestId('unstore',key)):api.storeFurniture(key,requestId('store',key)));},listen);
    const item={card,badge,price,button};builtinWallCards.set(key,item);return item;
  }
  const expansion=panels.get('expansion'),roomArt=el('div','room-shop__room-art',undefined,expansion);
  const house=svg(roomArt,'svg',{viewBox:'0 0 260 132',fill:'none','aria-hidden':'true'});
  svg(house,'ellipse',{cx:130,cy:119,rx:98,ry:10,fill:'#729178',opacity:.12});
  svg(house,'path',{d:'m37 84 93-43 94 43v8l-94 36-93-36Z',fill:'#cdb18b',stroke:'#c2a47b','stroke-width':1.2});
  svg(house,'path',{d:'m37 84 93-43 94 43-94 36Z',fill:'#eee5c9',stroke:'#d2c2a0','stroke-width':1.2});
  svg(house,'path',{d:'M37 31 130 7v35L37 85Z',fill:'#e7d8ba',stroke:'#cab590','stroke-width':1.2});
  svg(house,'path',{d:'m130 7 94 42v35l-94-42Z',fill:'#f7e8c8',stroke:'#d8c19a','stroke-width':1.2});
  svg(house,'path',{d:'M37 79 130 38l94 40M59 94l94-42m-72 51 94-40m-71 49 94-39M60 73l93 38M83 62l93 39M107 52l93 39',stroke:'#d6c6a4','stroke-width':.7});
  svg(house,'path',{d:'m154 29 38 17v25l-38-17Z',fill:'#c5deda',stroke:'#d0af7d','stroke-width':3});svg(house,'path',{d:'M173 38v25m-17-17 34 15',stroke:'#e8cc9e','stroke-width':1.6});
  svg(house,'path',{d:'m61 40 20-6v20l-20 8Z',fill:'#fff7df',stroke:'#cba87a','stroke-width':2});svg(house,'path',{d:'m68 43 8-3-2 12-6 2Z',fill:'#91b594'});
  svg(house,'path',{d:'m121 68 39-16 28 13v20l-38 15-29-12Z',fill:'#b8c9a1',stroke:'#94ab82','stroke-width':1});svg(house,'path',{d:'m121 69 29 13 38-17m-38 17v17',stroke:'#e5e7cf','stroke-width':1.4});
  svg(house,'path',{d:'m80 85 27-12 21 10-27 12Z',fill:'#e8c69c',stroke:'#ba9871','stroke-width':1});svg(house,'path',{d:'M83 87v8m18 1v8m23-20v8',stroke:'#b58f65','stroke-width':2,'stroke-linecap':'round'});
  const roomName=el('h3','room-shop__room-name','初始小屋',expansion),dimensions=el('p','room-shop__dimensions','',expansion);
  const areaCompare=el('div','room-shop__area-compare',undefined,expansion);
  el('p','room-shop__area-heading','同一比例，看见空间的变化',areaCompare);
  const areaPlans=el('div','room-shop__area-plans',undefined,areaCompare),areaRecords=[];
  for(const kind of ['current','target']){
    const item=el('div',`room-shop__area-item room-shop__area-item--${kind}`,undefined,areaPlans);
    const space=el('div','room-shop__area-space',undefined,item),plan=el('div','room-shop__area-plan',undefined,space);
    const label=el('span','room-shop__area-label','',item),value=el('strong','room-shop__area-value','',item);areaRecords.push({plan,label,value});
  }
  const areaGain=el('p','room-shop__area-gain','',areaCompare);
  const tierSteps=el('div','room-shop__tier-steps',undefined,expansion),nextBox=el('div','room-shop__next',undefined,expansion);
  const nextTitle=el('strong','','下一站',nextBox),nextDimensions=el('p','','',nextBox),nextDescription=el('span','room-shop__muted','多一点空间，放下更多喜欢。',nextBox);
  const expandButton=el('button','room-shop__primary room-shop__expand','扩建小屋',expansion);expandButton.type='button';expandButton.dataset.shopAction='expand';
  // v2.10：已解锁档位可随意切换大小（换回原来的小房子也免费）。未解锁档位用扩建按钮解锁。
  const switchBox=el('div','room-shop__switch-box',undefined,expansion);
  const switchLabel=el('p','room-shop__switch-label','切换小屋大小（已解锁档位免费切换）',switchBox);
  const switchRow=el('div','room-shop__switch-row',undefined,switchBox);
  const switchHint=el('p','room-shop__switch-hint','换回小房子前请先收回仓库里放不下的家具。',switchBox);
  // Keep the paid upgrade next to free size switches, ahead of the large
  // comparison artwork so it is visible when this tab first opens on mobile.
  switchBox.append(expandButton);
  expansion.insertBefore(switchBox,areaCompare);
  expansion.insertBefore(roomArt,tierSteps);
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
  // v2.8.2 仓库：已购买但收进仓库的家具（不占房间），可随时重新摆回。
  const storage=panels.get('storage'),storageGrid=el('div','room-shop__grid',undefined,storage);
  const storageEmpty=el('p','room-shop__intro room-shop__storage-empty','这里空空的，宝贝的家具都在家里呢～想收起来时，在装修里选中家具，点「收回仓库」就好啦。',storage);
  const storageCards=new Map();
  function makeStorageCard(product){
    // 固有家具（BUILTIN_STORAGE）只有 id 没有 sku：统一用 sku||id 作入参与键，
    // 否则摆回房间会传 undefined 而 UNKNOWN_ITEM 失败，且卡片键与查询键不一致反复重建。
    const key=product.sku||product.id;
    const card=el('article','room-shop__card',undefined,storageGrid);card.dataset.shopSku=key;
    const art=el('div','room-shop__product-art',undefined,card);illustration(art,key,product);
    const name=el('h3','room-shop__product-name','',card);finishLine(card,product,key);const bottom=el('div','room-shop__card-bottom',undefined,card);
    const button=el('button','room-shop__buy','摆回房间',bottom);button.type='button';button.dataset.shopAction='unstore';button.dataset.sku=key;
    button.addEventListener('click',()=>{void act(()=>api.unstoreFurniture(key,requestId('unstore',key)));});
    const record={card,name,button};storageCards.set(key,record);return record;
  }
  const footer=el('footer','room-shop__footer',undefined,dialog),status=el('p','room-shop__status','',footer);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');

  function shop(){return state.shop||{};}
  function blocked(){const current=shop();if(pending||current.busy)return '正在处理，请稍候';if(!state.ready||state.lifecycle!=='ready')return '房间尚未就绪';if(current.valid===false&&current.error?.code!=='STORAGE_WRITE_FAILED')return current.error?.message||'账户暂不可用';return '';}
  function revealTab(){const tab=tabs.get(activeTab);if(!tab||!tablist.clientWidth)return;const a=tab.getBoundingClientRect(),b=tablist.getBoundingClientRect();if(a.left<b.left)tablist.scrollLeft-=b.left-a.left+5;else if(a.right>b.right)tablist.scrollLeft+=a.right-b.right+5;}
  function selectTab(name){activeTab=tabs.has(name)?name:'furniture';for(const [key,tab] of tabs){tab.setAttribute('aria-selected',String(key===activeTab));tab.tabIndex=key===activeTab?0:-1;panels.get(key).hidden=key!==activeTab;}body.scrollTop=0;revealTab();}
  function makeCard(product){
    const category=product.category==='flooring'?'flooring':product.category==='wall'?'wall':'furniture';
    const card=el('article','room-shop__card',undefined,productGrids[category]);card.dataset.shopSku=product.sku;card.dataset.category=category;
    card.dataset.rarity=number(product.price)>=700?'heirloom':number(product.price)>=400?'premium':number(product.price)>=220?'refined':'fresh';
    const art=el('div','room-shop__product-art',undefined,card);illustration(art,product.sku,product);const badge=el('span','room-shop__owned','已收藏',art);
    el('span','room-shop__collection-label',product.rarity||({heirloom:'典藏',premium:'珍藏',refined:'精致',fresh:'清新'}[card.dataset.rarity]),art);
    const name=el('h3','room-shop__product-name','',card),description=el('p','room-shop__product-description','',card);finishLine(card,product);const bottom=el('div','room-shop__card-bottom',undefined,card),price=el('span','room-shop__price','',bottom);
    const wishButton=el('button','room-shop__wish','☆',bottom);wishButton.type='button';wishButton.dataset.category=category;
    wishButton.setAttribute('aria-label','设为心愿目标');
    wishButton.addEventListener('click',()=>setWish(category,product.sku),listen);
    const button=el('button','room-shop__buy','兑换',bottom);button.type='button';button.dataset.shopAction='purchase';button.dataset.sku=product.sku;
    button.after(wishButton);
    button.addEventListener('click',()=>{void act(()=>{
      const current=shop();
      if(category==='wall'&&current.owned?.includes(product.sku))return current.stored?.includes(product.sku)?api.unstoreFurniture(product.sku,requestId('unstore',product.sku)):api.storeFurniture(product.sku,requestId('store',product.sku));
      return category==='flooring'&&current.owned?.includes(product.sku)?api.applyFlooring(product.sku):api.purchaseFurniture(product.sku,requestId('purchase',product.sku));
    // 心愿达成庆祝（清单29）：心愿目标被成功带回家时放小派对（此时心愿表尚未刷新）。
    },result=>{if(result?.ok&&!result.unchanged&&wish.targets&&Object.values(wish.targets).includes(product.sku)){try{api.celebrateParty?.();feedback={text:'心愿达成！你也太棒啦～',tone:'success'};}catch{}}});},listen);
    const record={card,name,description,price,button,badge,wishButton};cards.set(product.sku,record);return record;
  }
  function render(){
    if(disposed)return;const current=shop(),reason=blocked(),balance=number(current.balance),owned=new Set(current.owned||[]),decorating=Boolean(state.decoration);
    const featureSku=(dailyFeature((current.catalog||[]).map(item=>({sku:item.sku||item.id,name:item.name,description:item.description})),localDate())||{}).sku||'';
    ensureWishTargets();
    // Room metrics and pet animation update independently of shop content.
    // Keep the mounted dialog unchanged until its business state changes.
    const viewSig=[...views.entries()].map(([category,view])=>`${category}:${view.search.value}|${view.sort.value}|${view.unowned.checked}`).join(';');
    const renderKey=JSON.stringify([state.ready,state.lifecycle,decorating,current,pending,feedback,localDate(),viewSig,wish.targets]);
    if(renderKey===lastRenderKey)return;
    // v2.17/F4：当前筛选下每个分类可见的 sku 集合（null=不筛选，全部展示）。
    const visibleSkus=(category,products,ownedSet)=>{const view=views.get(category);if(!view)return null;return new Set(applyCatalogView(products,{search:view.search.value,sort:view.sort.value,unownedOnly:view.unowned.checked,owned:sku=>ownedSet.has(sku)}).map(product=>product.sku));};
    walletLabel.textContent=label;balanceText.textContent=format(balance);balanceButton.setAttribute('aria-label',`${label} ${format(balance)}，查看积分说明`);
    trigger.disabled=state.lifecycle==='disposed';dialog.setAttribute('aria-busy',String(pending||!!current.busy));
    const catalog=Array.isArray(current.catalog)?current.catalog:[],present=new Set();
    const pets=current.pets||{catalog:[],owned:[],active:null},petPresent=new Set();
    for(const product of pets.catalog||[]){
      petPresent.add(product.sku);const item=petCards.get(product.sku)||makePetCard(product),has=pets.owned.includes(product.sku),active=pets.active===product.sku,short=!has&&balance<number(product.price);
      if(has&&wish.targets.pets===product.sku){wish.targets.pets='';const key=currentWishKey();if(key)writeWishTargets(key,wish.targets,healthyStorage());}
      item.wishButton.hidden=has;item.wishButton.textContent=wish.targets.pets===product.sku?'★':'☆';
      item.wishButton.setAttribute('aria-pressed',String(wish.targets.pets===product.sku));
      // v2.24 单宠制措辞：心愿 = 想请来入住的伙伴（不再叫"收藏目标"）。
      item.wishButton.setAttribute('aria-label',wish.targets.pets===product.sku?`取消把${product.name}请来入住`:`把${product.name}设为想入住的伙伴`);
      // v2.23 单宠制：只有当前伙伴算“已拥有”，其余伙伴一律积分兑换（兑换即更换）。
      item.badge.hidden=!has;item.badge.textContent=active?'正在陪伴':'已拥有';item.card.dataset.active=String(active);
      item.price.textContent=has?'当前伙伴 · 陪伴中':`${format(product.price)} 积分`;
      item.button.disabled=active||!!reason||short;item.button.textContent=active?'当前伙伴':short?'去学习攒积分':'积分兑换';item.button.title=reason||(short?'学习或签到都能攒积分，去攒够再来带它回家吧～':active?'这是你正在陪伴的伙伴～':'用积分兑换，新的伙伴会入住，原来的伙伴先去休息～');
      item.button.setAttribute('aria-label',`${active?'当前伙伴':has?'切换为':'兑换'}${product.name}${has?'':`，${product.price}积分`}`);
    }
    for(const [key,item] of petCards)if(!petPresent.has(key)){item.card.remove();petCards.delete(key);}
    const petVisible=visibleSkus('pets',pets.catalog||[],new Set(pets.owned||[]));
    for(const [key,item] of petCards){const product=(pets.catalog||[]).find(p=>p.sku===key);if(product&&petVisible)item.card.hidden=!petVisible.has(key);}
    if(views.has('pets')&&petVisible)views.get('pets').empty.hidden=[...petCards.values()].some(card=>!card.card.hidden);
    const storedOwned=new Set(current.stored||[]);
    for(const product of catalog){
      if(typeof product?.sku!=='string')continue;present.add(product.sku);const item=cards.get(product.sku)||makeCard(product),isOwned=owned.has(product.sku),inStorage=storedOwned.has(product.sku),short=!isOwned&&balance<number(product.price);
      const category=categoryOf(product);
      if(isOwned&&wish.targets[category]===product.sku){wish.targets[category]='';const key=currentWishKey();if(key)writeWishTargets(key,wish.targets,healthyStorage());}
      item.wishButton.hidden=isOwned;item.wishButton.textContent=wish.targets[category]===product.sku?'★':'☆';
      item.wishButton.setAttribute('aria-pressed',String(wish.targets[category]===product.sku));
      item.wishButton.setAttribute('aria-label',wish.targets[category]===product.sku?`取消${product.name||product.sku}的心愿目标`:`把${product.name||product.sku}设为心愿目标`);
      item.name.textContent=product.name||product.sku;item.description.textContent=product.description||'';item.price.textContent=isOwned?'已拥有 · 摆回免费':`${format(product.price)} 积分`;
      if(product.category==='flooring'){
        const applied=current.appearance?.flooring===product.sku;
        item.price.textContent=isOwned?'已收藏 · 免费切换':`${format(product.price)} 积分`;
        item.button.disabled=applied||!!reason||short;item.button.textContent=applied?'已铺设':isOwned?'免费铺设':short?'积分不足':'兑换并铺设';
        item.button.title=applied?'这款地砖正在使用':reason||'';item.button.setAttribute('aria-label',`${applied?'已铺设':isOwned?'铺设':'兑换并铺设'}${product.name||product.sku}${isOwned?'':`，${format(product.price)}${label}`}`);
        item.badge.hidden=!isOwned;item.badge.textContent=applied?'正在铺设':'已收藏';item.card.dataset.owned=String(isOwned);item.card.dataset.applied=String(applied);continue;
      }
      if(product.category==='wall'){
        const action=isOwned?(inStorage?'摆回墙上':'收回仓库'):'兑换';
        item.price.textContent=isOwned?(inStorage?'已收藏 · 在仓库':'已挂在墙上'):`${format(product.price)} 积分`;
        item.button.disabled=!!reason||short;item.button.textContent=short?'去学习攒积分':action;item.button.title=reason||(short?'学习或签到都能攒积分，去攒够再来带它回家吧～':undefined);
        item.button.dataset.shopAction=isOwned?(inStorage?'unstore':'store'):'purchase';
        item.button.setAttribute('aria-label',`${action}${product.name||product.sku}${isOwned?'':`，${format(product.price)}${label}`}`);
        item.badge.hidden=!isOwned;item.badge.textContent=inStorage?'已收藏':'正在墙上';item.card.dataset.owned=String(isOwned);item.card.dataset.stored=String(inStorage);continue;
      }
      // 已拥有且已收回仓库时按钮可点（购买契约支持 owned&&stored 直接摆回），避免“已拥有”真实状态被 UI 封死。
      item.button.disabled=(isOwned&&!inStorage)||!!reason||short;item.button.textContent=isOwned&&!inStorage?'已拥有':(isOwned&&inStorage?'摆回房间':pending||current.busy?'处理中':short?'去学习攒积分':'兑换');item.button.title=isOwned&&!inStorage?'这件家具已经在你的小屋里':(reason||(short?'学习或签到都能攒积分，去攒够再来带它回家吧～':undefined));item.button.setAttribute('aria-label',`${isOwned&&!inStorage?'已拥有':isOwned&&inStorage?'摆回房间':'兑换'}${product.name||product.sku}，${format(product.price)}${label}`);item.badge.hidden=!isOwned;item.card.dataset.owned=String(isOwned);
      // 今日推荐（清单58）：每日一物未拥有的对应卡片加角标，温柔引导。
      const featured=item.card.dataset.featured==='true';
      if(!isOwned&&featureSku===product.sku&&!featured){item.card.dataset.featured='true';if(!item.card.querySelector('.room-shop__featured')){const tag=el('span','room-shop__featured','今日推荐',item.card);tag.setAttribute('aria-label','今日推荐宝贝');}}
      else if(isOwned&&featured){item.card.dataset.featured='false';item.card.querySelector('.room-shop__featured')?.remove();}
    }
    for(const [sku,item] of cards)if(!present.has(sku)){item.card.remove();cards.delete(sku);}
    // v2.17/F4：应用每类搜索/排序/未拥有筛选并切换空态提示。
    const byCategory={furniture:[],flooring:[],wall:[]};
    for(const [sku,item] of cards){const product=(catalog||[]).find(p=>p.sku===sku);if(!product)continue;byCategory[categoryOf(product)].push(item);}
    for(const category of ['furniture','flooring','wall']){
      const view=views.get(category),vis=visibleSkus(category,(catalog||[]).filter(product=>categoryOf(product)===category),owned);
      if(vis){for(const item of byCategory[category])item.card.hidden=!vis.has(item.card.dataset.shopSku);}
      if(view&&vis)view.empty.hidden=byCategory[category].some(item=>!item.card.hidden);
    }
    renderCollectionGoal('pets',pets.catalog||[],new Set(pets.owned||[]),balance);
    for(const category of ['furniture','flooring','wall'])renderCollectionGoal(category,catalog.filter(product=>(product.category==='flooring'?'flooring':product.category==='wall'?'wall':'furniture')===category),owned,balance);
    roomName.textContent=current.roomName||'初始小屋';dimensions.textContent=`${number(current.width).toFixed(1)} × ${number(current.depth).toFixed(1)} 米 · ${(number(current.width)*number(current.depth)).toFixed(1)} ㎡`;
    const tiers=Array.isArray(current.tiers)?current.tiers:[];
    const comparison=current.nextTier||tiers[0]||{width:current.width,depth:current.depth,name:current.roomName};
    const baseline=current.nextTier?{width:current.width,depth:current.depth,name:'当前面积'}:comparison;
    const target=current.nextTier?comparison:{width:current.width,depth:current.depth,name:'当前面积'};
    const maxSpan=Math.max(number(baseline.width),number(baseline.depth),number(target.width),number(target.depth),1);
    [baseline,target].forEach((tier,index)=>{const item=areaRecords[index];item.plan.style.width=`${number(tier.width)/maxSpan*100}%`;item.plan.style.height=`${number(tier.depth)/maxSpan*100}%`;item.label.textContent=index===0?(current.nextTier?'现在':'初始面积'):(current.nextTier?'扩建后':'现在');item.value.textContent=`${(number(tier.width)*number(tier.depth)).toFixed(1)} ㎡`;});
    const baseArea=number(baseline.width)*number(baseline.depth),targetArea=number(target.width)*number(target.depth),gain=Math.max(0,targetArea-baseArea);
    areaGain.textContent=gain>0?`${current.nextTier?'本次增加':'累计增加'} ${gain.toFixed(1)} ㎡ · +${Math.round(gain/Math.max(1,baseArea)*100)}%`:'从这里开始，让小屋慢慢长大。';
    if(tierSteps.children.length!==tiers.length){tierSteps.replaceChildren();for(const tier of tiers){const step=el('button','room-shop__tier','',tierSteps);step.dataset.level=String(tier.level);step.addEventListener('click',()=>switchLevel(Number(step.dataset.level)),listen);}}
    [...tierSteps.children].forEach((step,index)=>{const tier=tiers[index],unlocked=tier.level<=number(current.maxRoomLevel);step.textContent=`${tier.name}${unlocked?'':' · 未解锁'}`;step.dataset.active=String(tier.level===current.roomLevel);step.dataset.complete=String(unlocked);step.disabled=!unlocked||tier.level===current.roomLevel||!!reason;step.setAttribute('aria-label',`${unlocked?'切换为':'尚未解锁'}${tier.name}`);});
    const next=current.nextTier;nextBox.dataset.complete=String(!next);nextTitle.textContent=next?`下一站 · ${next.name}`:'已经是宽敞大屋';
    nextDimensions.textContent=next?`${number(next.width).toFixed(1)} × ${number(next.depth).toFixed(1)} 米 · ${(number(next.width)*number(next.depth)).toFixed(1)} ㎡`:'每一份喜欢，都有自己的位置。';
    nextDescription.textContent=next?`扩建需要 ${format(next.price)} ${label}`:'继续学习，慢慢布置属于你的小世界。';
    // v2.10：已解锁档位随意切换大小（含换回原来的小房子）。当前档位高亮禁用；
    // 换小放不下时后端返回 NO_SPACE，这里的 status 会把提示原文展示出来。
    const unlocked=number(current.maxRoomLevel)>=0?Math.max(0,Math.min(number(current.maxRoomLevel),tiers.length-1)):0;
    const switches=Array.isArray(current.tiers)?current.tiers.slice(0,unlocked+1):[];
    if(switchRow.children.length!==switches.length){switchRow.replaceChildren();for(const tier of switches){const step=el('button','room-shop__switch','',switchRow);step.type='button';step.dataset.switchLevel=String(tier.level);step.addEventListener('click',()=>switchLevel(Number(step.dataset.switchLevel)),listen);}}
    [...switchRow.children].forEach((step,index)=>{const tier=switches[index];step.textContent=`${tier.name}\n${(number(tier.width)*number(tier.depth)).toFixed(1)} ㎡${tier.level===number(current.roomLevel)?' · 当前':''}`;const currentLevel=number(current.roomLevel);step.dataset.active=String(tier.level===currentLevel);step.disabled=tier.level===currentLevel||!!reason;step.title=tier.level===currentLevel?'当前就是这个大小':decorating?'保存当前装修并免费切换到这个大小':'免费切换到这个大小';});
    switchHint.textContent=decorating?'点击档位会先保存当前装修，再切换房屋大小。':'已解锁档位可免费来回切换。伙伴会自动回到安全位置；超出小屋范围的家具需要先移回或收进仓库。';
    switchBox.hidden=tiers.length<2;
    // v2.8.2 修复「买东西点击没反应」：装修模式下购买/仓库摆回不再被整体禁用
    // （trade 已允许装修会话内注册家具，点击即可生效）；仅扩建与装修会话冲突（需改房间边界），
    // 装修中明确禁用并提示，避免按钮看似可点却无反应。
    expandButton.disabled=!next||!!reason||balance<number(next?.price)||decorating;const expandShort=Math.max(0,number(next?.price||0)-balance),expandRatio=number(next?.price)>0?expandShort/number(next?.price):1;expandButton.textContent=!next?'房屋已达最高等级':pending||current.busy?'正在布置新空间…':decorating?'升级扩建 · 请先完成装修':balance<number(next.price)?`升级扩建 · 还差 ${format(next.price-balance)} ${label}${expandRatio<=0.25?' · 就差一点点啦！':''}`:`升级扩建为${next.name} · ${format(next.price)} 积分`;expandButton.title=decorating?'请先完成或取消装修，再扩建小屋':reason;
    for(const {button,reward} of rewardButtons){const done=claimed.has(`demo-${reward.key}:${localDate()}`);button.disabled=done||!!reason;button.textContent=done?'今日已领取':`+${reward.amount}`;button.title=reason;}
    // 仓库：列出收进仓库的家具（stored ⊆ STORAGE_CATALOG），可摆回房间。
    const stored=new Set(current.stored||[]);
    const storageMeta=new Map((Array.isArray(current.storageCatalog)?current.storageCatalog:[]).map(item=>[item.sku||item.id,item]));
    const builtinWall=storageMeta.get('wall-pictures');
    if(builtinWall){
      const key='wall-pictures',item=builtinWallCards.get(key)||makeBuiltinWallCard(builtinWall,key),inStorage=stored.has(key),action=inStorage?'摆回墙上':'收回仓库';
      item.price.textContent=inStorage?'自带收藏 · 在仓库':'自带收藏 · 正在墙上';item.card.dataset.owned='true';item.card.dataset.stored=String(inStorage);
      item.button.disabled=!!reason;item.button.title=reason;item.button.textContent=action;item.button.dataset.shopAction=inStorage?'unstore':'store';item.button.setAttribute('aria-label',`${action}${builtinWall.name||key}`);
    }else if(builtinWallCards.has('wall-pictures')){builtinWallCards.get('wall-pictures').card.remove();builtinWallCards.delete('wall-pictures');}
    const presentRoom=new Set();
    for(const [key,product] of storageMeta){
      if(product.category==='flooring'||product.category==='wall'||key==='wall-pictures')continue;
      if(stored.has(key)||(product.sku&&!owned.has(key)))continue;
      presentRoom.add(key);const item=roomCards.get(key)||makeRoomCard(product,key);item.button.disabled=!!reason;item.button.title=reason;
    }
    for(const [key,item] of roomCards)if(!presentRoom.has(key)){item.card.remove();roomCards.delete(key);}
    const presentStored=new Set();
    for(const sku of stored){
      const product=storageMeta.get(sku);if(!product)continue;
      if(product.category==='flooring')continue;
      presentStored.add(sku);
      const item=storageCards.get(sku)||makeStorageCard(product);
      item.name.textContent=product.name||sku;
      item.button.disabled=!!reason||!!product.expired;item.button.title=product.expired?'限时已结束，收藏与获得记录会保留':reason;
    }
    for(const [sku,item] of storageCards)if(!presentStored.has(sku)){item.card.remove();storageCards.delete(sku);}
    storageEmpty.hidden=presentStored.size>0;
    status.textContent=current.valid===false?(current.error?.message||'账户暂不可用，积分与家具未发生变更'):reason||feedback.text;status.dataset.tone=current.valid===false?'error':reason?'neutral':feedback.tone;
    lastRenderKey=renderKey;
  }
  function update(nextState){if(disposed)return;state=nextState&&typeof nextState==='object'?nextState:{};if(opened&&state.ready&&!state.metrics?.presentationPaused)api.setPresentationPaused?.(true);render();}
  function refresh(){try{update(api.getState());}catch{feedback={text:'暂时无法读取房间状态，请稍后重试。',tone:'error'};render();}}
  function requestId(operation,sku=''){return `${id}:${Date.now().toString(36)}:${++sequence}:${operation}:${sku}`;}
  function switchLevel(level){
    if(typeof api.setRoomLevel!=='function'){feedback={text:'当前环境暂不支持切换小屋大小。',tone:'error'};render();return;}
    void act(async()=>{
      if(state.decoration){
        const saved=await api.setDecorationMode?.(false);
        if(!saved)return {ok:false,message:'当前装修尚未保存，请调整红色家具位置或取消装修后再切换。'};
      }
      return api.setRoomLevel(level,requestId('room',level));
    });
  }
  async function act(operation,after){
    if(disposed)return;const reason=blocked();if(reason){feedback={text:reason,tone:'neutral'};render();return;}
    pending=true;feedback={text:'正在为小屋安排，请稍候…',tone:'neutral'};render();
    try{const result=await operation();if(disposed)return;if(!result||typeof result.ok!=='boolean')throw new Error('小屋暂时没有返回结果，请稍后再试一次。');after?.(result);
    feedback={text:result.message||(result.ok?'好啦！快来看看我们小屋的新变化～':'这次没能完成，积分和小家具都还好好地在原处。'),tone:result.ok?'success':'error'};}
    catch(error){if(!disposed)feedback={text:error?.message||'暂时未能完成操作，请稍后重试。',tone:'error'};}
    finally{if(!disposed){pending=false;refresh();}}
  }
  function open(tab='furniture'){
    if(disposed)return;if(!opened)api.setPresentationPaused?.(true);refresh();selectTab(tab);if(!opened)returnFocus=activeElementFor(root);opened=true;wrapper.dataset.open='true';shade.hidden=false;dialog.hidden=false;trigger.setAttribute('aria-expanded','true');storageTrigger.setAttribute('aria-expanded',String(activeTab==='storage'));
    revealTab();
    queueMicrotask(()=>{if(opened&&!disposed)closeButton.focus({preventScroll:true});});
  }
  function close(){if(disposed||!opened)return;opened=false;wrapper.dataset.open='false';shade.hidden=true;dialog.hidden=true;trigger.setAttribute('aria-expanded','false');storageTrigger.setAttribute('aria-expanded','false');api.setPresentationPaused?.(false);const target=returnFocus?.isConnected&&!returnFocus.closest?.('[hidden]')?returnFocus:trigger;returnFocus=null;target.focus?.({preventScroll:true});}
  trigger.addEventListener('click',()=>opened?close():open('pets'),listen);storageTrigger.addEventListener('click',()=>opened&&activeTab==='storage'?close():open('storage'),listen);balanceButton.addEventListener('click',()=>open('points'),listen);closeButton.addEventListener('click',close,listen);shade.addEventListener('click',close,listen);
  root.querySelector('[data-room-control="decoration-shop"]')?.addEventListener('click',()=>open('expansion'),listen);
  expandButton.addEventListener('click',()=>{void act(()=>api.expandRoom(requestId('expand')));},listen);
  doc.addEventListener('keydown',event=>{
    // 多个独立房间共用 document 时，仅当前持有焦点的面板响应快捷键。
    const focused=activeElementFor(root);
    if(!opened||disposed||!dialog.contains(focused))return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(node=>!node.closest('[hidden]'));
    const first=focusable[0],last=focusable.at(-1);if(!first){event.preventDefault();dialog.focus();return;}
    if(event.shiftKey&&(focused===first||focused===dialog)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(focused===last||!dialog.contains(focused))){event.preventDefault();first.focus();}
  },listen);
  selectTab('furniture');refresh();
  return {update,open,close,dispose(){if(disposed)return;const focused=wrapper.contains(activeElementFor(root));disposed=true;events.abort();if(opened)api.setPresentationPaused?.(false);
    // 装修按钮属于 view，商店只借用其位置；卸载商店必须归还，便于宿主重复挂载。
    if(decorate&&decorateParent&&decorate.parentNode===topbar){decorate.className=decorateClass;decorateParent.insertBefore(decorate,decorateNext?.parentNode===decorateParent?decorateNext:null);}
    wrapper.remove();cards.clear();petCards.clear();storageCards.clear();roomCards.clear();if(focused)root.querySelector('[data-room-control="room"]')?.focus({preventScroll:true});}};
}
