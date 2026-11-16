const ICON_PATHS = {
  shop: 'M4 9h16l-1 11H5L4 9Zm4 0V7a4 4 0 0 1 8 0v2',
  storage: 'M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Zm-1-5h18v5H3zM10 13h4',
  decorate: 'm5 17 10-10 3 3-10 10H5v-3Zm8-8 3 3M4 4v6m-3-3h6M19 3v4m-2-2h4',
  life: 'M12 21v-8M12 16C6 16 4 13 4 7c5 0 8 3 8 9Zm0-3c0-6 3-9 8-9 0 6-3 9-8 9Z',
  friends: 'M15 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m17-11v6m-3-3h6M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
};

/** Keep room-only controls reachable on touch screens; no host app navigation is changed. */
export function createRoomNavigation({root,api}){
 const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
 const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const dock=node('nav',null,'room-mobile-dock');dock.setAttribute('aria-label','仓鼠屋快捷操作');root.append(dock);
 const more=node('section',null,'room-mobile-more');more.hidden=true;more.setAttribute('aria-label','更多小屋功能');root.append(more);
 const cameraTools=node('div',null,'room-camera-tools');cameraTools.setAttribute('aria-label','视野工具');root.append(cameraTools);
 for(const [text,method]of [['看全屋','resetView'],['找宠物','findPet']])if(typeof api[method]==='function'){const button=node('button',text);button.type='button';button.addEventListener('click',()=>api[method](),listen);cameraTools.append(button);}
 const all=[];
 const unified=typeof api.openLife==='function';
 if(unified)root.dataset.roomToolbar='true';
 function action(key,label,text,run){
  const button=node('button',null,'room-mobile-action');
  button.type='button';button.dataset.roomAction=key;button.setAttribute('aria-label',label);
  const icon=node('span',null,'room-mobile-icon');icon.setAttribute('aria-hidden','true');
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width',key==='more'?'3':'1.8');
  svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',ICON_PATHS[key]);
  svg.append(path);icon.append(svg);button.append(icon,node('span',text,'room-mobile-label'));
  button.addEventListener('click',()=>{for(const panel of root.querySelectorAll('.studio-panel,.studio-guide'))panel.hidden=true;run();},listen);dock.append(button);all.push(button);
  return button;
 }
 function activate(selector,global=false){const target=(global?doc:root).querySelector(selector);if(!target||target.disabled)return;more.hidden=true;moreButton.setAttribute('aria-expanded','false');for(const close of root.querySelectorAll('.room-shop[data-open="true"] .room-shop__close,.companion-panel:not([hidden]) .companion-close,.estate-panel:not([hidden]) .estate-close,.creative-panel:not([hidden]) header button,.room-profile:not([hidden]) .room-profile-close'))if(close!==target)close.click();target.click();}
 for(const [key,label,selector]of [
  ['shop','商店','.room-shop__trigger:not(.room-shop__storage-trigger)'],
  ['storage','仓库','.room-shop__storage-trigger'],
  ['decorate','装修','[data-room-control="decorate"]'],
 ])action(key,label,label,()=>activate(selector));
 if(typeof api.openLife==='function')action('life','小屋生活','生活',()=>{closeMore();api.openLife();});
 if(typeof api.inviteFriends==='function')action('friends','邀请朋友参观','邀好友',()=>{closeMore();api.inviteFriends();});
 function closeMore(){more.hidden=true;moreButton.setAttribute('aria-expanded','false');}
 const moreButton=action('more','更多小屋功能','更多',()=>{
  more.hidden=!more.hidden;moreButton.setAttribute('aria-expanded',String(!more.hidden));
 });
 moreButton.setAttribute('aria-expanded','false');
 dock.style.setProperty('--room-action-count',String(all.length));
 for(const [text,selector,global]of [['我的宠物','.room-shop__trigger:not(.room-shop__storage-trigger)'],['城堡楼层','.estate-trigger'],['涂鸦墙','.creative-dock button'],['个人主页','.room-profile-level'],['朋友','.social-trigger',true],['伙伴手册','.companion-handbook-trigger']]){const button=node('button',text);button.type='button';button.addEventListener('click',()=>activate(selector,global),listen);more.append(button);}
 if(typeof api.returnToLearning==='function'){const back=node('button','返回学习');back.type='button';back.addEventListener('click',()=>api.returnToLearning(),listen);more.append(back);}
 if(typeof api.openSyncBackups==='function'){const backup=node('button','存档备份');backup.type='button';backup.addEventListener('click',()=>{closeMore();api.openSyncBackups();},listen);more.append(backup);}
 if(typeof api.enterRoomLandscape==='function'){const fullscreen=node('button');fullscreen.type='button';fullscreen.dataset.roomOrientation='true';fullscreen.append(node('span','全屏横屏'),node('span','退出横屏模式'));fullscreen.addEventListener('click',()=>{closeMore();void api.enterRoomLandscape();},listen);more.append(fullscreen);}
 const themes=root.querySelector('.room-theme-controls');
 if(unified&&themes)more.append(themes);
 return {update(state){for(const button of all)button.disabled=!state?.ready;},dispose(){events.abort();cameraTools.remove();dock.remove();more.remove();if(unified)delete root.dataset.roomToolbar;}};
}
