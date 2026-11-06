// UI preferences are deliberately separate from the room account/archive.
export const ROOM_THEME_STORAGE_KEY='original-pet-room-ui-theme-v1';
const themes=new WeakMap();
export const normalizeRoomTheme=value=>value==='candy'?'candy':value==='eye-care'||value==='eye'||value==='dark'?'eye-care':'light';
const validTheme=normalizeRoomTheme;

export function createRoomTheme({root,api,controls=true}={}){
  if(themes.has(root))return themes.get(root);
  const doc=root.ownerDocument,win=doc.defaultView;
  let mode='light',disposed=false;
  const original=root.getAttribute('data-ui-theme');
  try{mode=validTheme(win.localStorage.getItem(ROOM_THEME_STORAGE_KEY)||win.localStorage.getItem('original-pet-room-theme'));}catch{/* Sandboxed hosts may deny storage. */}
  let group=null;
  if(controls){
    group=doc.createElement('div');group.className='room-theme-controls';group.setAttribute('role','group');group.setAttribute('aria-label','界面配色');
    for(const [value,label] of [['light','亮色'],['eye-care','护眼'],['candy','糖果']]){
      const button=doc.createElement('button');button.type='button';button.dataset.uiTheme=value;button.textContent=label;
      button.setAttribute('aria-label',`${label}配色`);button.addEventListener('click',()=>set(value));group.append(button);
    }
    root.append(group);
  }
  function refresh(){
    if(disposed)return;
    root.dataset.uiTheme=mode;
    for(const button of group?.querySelectorAll('button')||[])button.setAttribute('aria-pressed',String(button.dataset.uiTheme===mode));
    // The core also changes scene background/light, without modifying saved wall/floor choices.
    try{const changed=api?.setTheme?.(mode);changed?.catch?.(()=>{});}catch{/* Optional enhancement for custom host APIs. */}
    root.dispatchEvent(new win.CustomEvent('room-ui-theme-change',{detail:{theme:mode}}));
  }
  function set(value,{persist=true}={}){
    if(disposed)return;
    mode=validTheme(value);
    if(persist)try{win.localStorage.setItem(ROOM_THEME_STORAGE_KEY,mode);}catch{/* Theme still works without persistence. */}
    refresh();
  }
  const storageChanged=event=>{if(event.key===ROOM_THEME_STORAGE_KEY)set(event.newValue,{persist:false});};
  const requested=event=>{const value=validTheme(event.detail?.theme);if(value!==mode)set(value);};
  win.addEventListener('storage',storageChanged);
  root.addEventListener('room-theme-request',requested);
  const controller={get value(){return mode;},set,refresh,dispose(){
    if(disposed)return;disposed=true;win.removeEventListener('storage',storageChanged);root.removeEventListener('room-theme-request',requested);group?.remove();
    if(original===null)root.removeAttribute('data-ui-theme');else root.setAttribute('data-ui-theme',original);
    if(themes.get(root)===controller)themes.delete(root);
  }};
  themes.set(root,controller);refresh();return controller;
}

/** Makes the profile shortcut use the same theme as shop, dock and room. */
export function bindRoomThemeButton({root,button,api}={}){
  const owned=!themes.has(root),theme=themes.get(root)||createRoomTheme({root,api,controls:false});
  const render=()=>{const eye=theme.value==='eye-care';button.textContent=eye?'亮色':'护眼';button.setAttribute('aria-label',eye?'切换为亮色配色':'切换为护眼配色');button.title=eye?'当前：护眼配色，点击切换亮色':'当前：亮色配色，点击切换护眼';button.setAttribute('aria-pressed',String(eye));};
  const click=()=>theme.set(theme.value==='eye-care'?'light':'eye-care');
  root.addEventListener('room-ui-theme-change',render);button.addEventListener('click',click);render();
  return {dispose(){root.removeEventListener('room-ui-theme-change',render);button.removeEventListener('click',click);if(owned)theme.dispose();}};
}
