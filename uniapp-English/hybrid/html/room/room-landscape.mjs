import {measureRoomViewport,visibleRoomViewport} from './responsive-layout.mjs';
/** Room-only orientation lifecycle. Browser rotation always follows a real user gesture. */
export function createRoomLandscape({doc=document,onChange=()=>{},onExit=()=>{},allowPortrait=false}={}){
 const win=doc.defaultView,events=new win.AbortController(),options={signal:events.signal};
 const page=doc.documentElement,mode=page.dataset;
 let blocked=false,disposed=false,requested=false,locked=false,ownsFullscreen=false,pending=false;
 let showHelp=false,rotationTimer=0;
 const element=(tag,text,cls)=>{const node=doc.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
 const shade=element('section',null,'room-landscape-shade');shade.hidden=true;shade.setAttribute('role','dialog');shade.setAttribute('aria-modal','true');shade.setAttribute('aria-label','请横屏进入仓鼠屋');
 const card=element('div',null,'room-landscape-card'),icon=element('div','↻','room-landscape-phone');icon.setAttribute('aria-hidden','true');
 const heading=element('h1','把手机横过来吧'),hint=element('p','横屏看得更宽，布置小屋更方便。'),note=element('p','横屏后就可以布置小屋啦。','room-landscape-note');
 const start=element('button','全屏横屏进入'),exit=element('button','返回学习');start.type=exit.type='button';card.append(icon,heading,hint,note,start,exit);shade.append(card);doc.body.append(shade);
 const help=element('aside',null,'room-landscape-help');help.hidden=true;
 const instructions=element('div');instructions.setAttribute('role','status');
 instructions.append(element('strong','打开自动旋转，再横放手机'),element('p','浏览器未能自动转向。可打开手机的自动旋转，再横放手机；也可以继续竖屏使用。'));
 const dismiss=element('button','知道了');dismiss.type='button';help.append(instructions,dismiss);doc.body.append(help);
 function mobile(){return (win.matchMedia('(pointer:coarse)').matches||win.navigator.maxTouchPoints>0)&&Math.min(win.innerWidth,win.innerHeight)<=900;}
 function landscape(){return win.innerWidth>win.innerHeight;}
 function update(){
  if(disposed)return;
  const isMobile=mobile(),wide=landscape();
  const visible=visibleRoomViewport(win),viewport=measureRoomViewport(visible.width,visible.height,{touch:!!(win.matchMedia('(pointer:coarse)').matches||win.navigator.maxTouchPoints>0)});
  mode.roomViewport='adaptive';mode.roomPageLayout=viewport.layout;mode.roomPageAspect=viewport.aspect;
  page.style.setProperty('--room-viewport-width',visible.width+'px');page.style.setProperty('--room-viewport-height',visible.height+'px');page.style.setProperty('--room-page-scale',String(viewport.scale));
  const shortSide=Math.min(win.innerWidth,win.innerHeight);
  const next=!allowPortrait&&isMobile&&!wide;
  mode.roomMobile=String(isMobile);
  mode.roomPortrait=String(next);
  page.toggleAttribute('data-room-landscape-active',requested&&wide);
  if(isMobile&&wide&&shortSide<=500)mode.roomLandscapeLayout=shortSide<=300?'compact':'wide';
  else delete mode.roomLandscapeLayout;
  if(wide){showHelp=false;clearRotationTimer();}
  shade.hidden=!next;
  help.hidden=!showHelp||next;
  if(next===blocked)return;
  blocked=next;
  if(next)start.focus({preventScroll:true});
  onChange({blocked});
 }
 async function enter(){
  if(disposed)return;
  if(requested){leave();return;}
  if(pending)return;
  const orientation=win.screen.orientation;
  showHelp=false;requested=true;pending=true;update();
  try{
   try{if(!doc.fullscreenElement&&page.requestFullscreen){await page.requestFullscreen();ownsFullscreen=doc.fullscreenElement===page;}}catch{/* Browsers can restrict fullscreen, especially inside an iframe. */}
   if(!requested||disposed)return;
   if(!landscape())rotationTimer=win.setTimeout(()=>{if(!landscape())guideRotation();},1000);
   try{if(orientation?.lock){await orientation.lock('landscape');locked=true;}}catch(error){win.dispatchEvent(new win.CustomEvent('room-orientation-help',{detail:{reason:error?.name||'unsupported'}}));}
   if(!requested||disposed)return;
   if(!landscape()&&!locked)guideRotation();
   else if(landscape()&&!locked&&!ownsFullscreen)requested=false;
  }finally{
   pending=false;
   if(!requested||disposed)release();else update();
  }
 }
 function clearRotationTimer(){if(rotationTimer){win.clearTimeout(rotationTimer);rotationTimer=0;}}
 function release(){if(locked){try{win.screen.orientation.unlock();}catch{}locked=false;}if(ownsFullscreen){ownsFullscreen=false;if(doc.fullscreenElement===page)void doc.exitFullscreen?.().catch(()=>{});}}
 function leave(){requested=false;showHelp=false;clearRotationTimer();release();update();}
 // Keep a successful fullscreen session when a browser refuses orientation lock.
 // Rotating the device then changes the real viewport; never rotate/stretch CSS.
 function guideRotation(){clearRotationTimer();showHelp=true;if(!ownsFullscreen&&!locked)requested=false;update();}
 function resized(){update();}
 function fullscreenChanged(){if(ownsFullscreen&&doc.fullscreenElement!==page)leave();else update();}
 start.addEventListener('click',()=>void enter(),options);exit.addEventListener('click',onExit,options);
 function dismissHelp(){showHelp=false;help.hidden=true;}
 dismiss.addEventListener('click',dismissHelp,options);
 doc.addEventListener('pointerdown',event=>{if(showHelp&&!help.contains(event.target))dismissHelp();},options);
 shade.addEventListener('keydown',event=>{if(event.key!=='Tab')return;if(event.shiftKey&&doc.activeElement===start){event.preventDefault();exit.focus();}else if(!event.shiftKey&&doc.activeElement===exit){event.preventDefault();start.focus();}},options);
 win.addEventListener('resize',resized,options);win.addEventListener('orientationchange',resized,options);win.visualViewport?.addEventListener('resize',resized,options);doc.addEventListener('fullscreenchange',fullscreenChanged,options);
 update();
 return {get blocked(){return blocked;},enter,dispose(){if(disposed)return;disposed=true;events.abort();leave();shade.remove();help.remove();for(const name of ['roomMobile','roomPortrait','roomLandscapeActive','roomLandscapeLayout','roomViewport','roomPageLayout','roomPageAspect'])delete mode[name];for(const name of ['--room-viewport-width','--room-viewport-height','--room-page-scale'])page.style.removeProperty(name);}};
}
