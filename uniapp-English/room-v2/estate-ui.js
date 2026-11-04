/** Multiple rooms share an account; this view delegates every operation to the host API. */
import {activeElementFor} from './dom.mjs';
import {floorExpansionCost,MAX_ESTATE_ROOMS} from './estate-state.mjs';

const MAX_ROOMS=MAX_ESTATE_ROOMS;
const TEMPLATES=[['cream','奶油小屋','暖暖的奶油色，把喜欢轻轻装进去。'],['mint','薄荷花房','清清爽爽，和小花一起长大。'],['candy','糖果城堡','粉粉甜甜，留一间给天马行空。']];
let estateSequence=0;
const roomFloor=room=>Number.isInteger(room?.floor)&&room.floor>=0?room.floor:0;
const templateName=value=>TEMPLATES.find(item=>item[0]===value)?.[1]||'奶油小屋';

export function createEstatePanel({root,api}={}){
  if(!root?.ownerDocument||!api)throw new TypeError('房间管理需要小屋根节点与 API');
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
  let disposed=false,opened=false,busy=false,ready=false,current=null,roomState=null,signature='',roomsSignature='',returnFocus=null,selectedTemplate='cream';
  let worldRoomId=null,worldSaves=[],worldLoading=false,worldRequest=0,pendingWorldAction=null,worldTemplate='cream';
  const el=(tag,className,text,parent)=>{const node=doc.createElement(tag);if(tag==='button')node.type='button';if(className)node.className=className;if(text!==undefined&&text!==null)node.textContent=text;parent?.append(node);return node;};
  const trigger=el('button','estate-trigger','城堡 / 楼层',root);trigger.disabled=true;trigger.setAttribute('aria-expanded','false');
  const panel=el('section','estate-panel',null,root);panel.id=`estate-panel-${++estateSequence}`;panel.hidden=true;panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','城堡楼层');trigger.setAttribute('aria-controls',panel.id);
  const header=el('header','estate-header',null,panel),heading=el('div','',null,header);el('small','','一层一层，装下你的喜欢',heading);el('h2','','我们的城堡',heading);
  const closeButton=el('button','estate-close','×',header);closeButton.setAttribute('aria-label','关闭城堡楼层');
  const shared=el('div','estate-account',null,panel);const balance=el('strong','','共享积分 · 0',shared);el('span','','所有楼层共用积分与收藏，每层独立摆放。',shared);
  const body=el('div','estate-body',null,panel);
  el('p','estate-help estate-castle-help','每层一间，往上添一层，就是新的小世界。点楼层推门进入，展示你选中的这一层。',body);
  const roomSummary=el('p','estate-room-summary','',body),roomList=el('div','estate-rooms',null,body);
  roomList.setAttribute('aria-label','我的城堡楼层');
  const worldCard=el('section','estate-card estate-world',null,body);worldCard.setAttribute('aria-label','当前楼层的小世界存档');
  const worldTitle=el('h3','','这一层的小世界',worldCard);
  el('p','estate-world-help','每层装修都会自动保存。给喜欢的布置留个存档点，以后可以单独读取这一层。',worldCard);
  const worldStatus=el('p','estate-world-state','',worldCard);worldStatus.setAttribute('role','status');
  const worldNameLabel=el('label','estate-field',null,worldCard);el('span','','存档点名字',worldNameLabel);const worldName=el('input','',null,worldNameLabel);worldName.type='text';worldName.maxLength=40;worldName.placeholder='例如：花园午后、冬日书房';worldName.setAttribute('aria-label','这一层的存档点名字');
  const saveWorld=el('button','estate-primary','保存此层',worldCard);saveWorld.dataset.estateAction='world-save';
  const designCard=el('div','estate-world-new',null,worldCard);el('h4','','换一套新装修',designCard);el('p','estate-help','先给当前布置留一份备份，再从空房间开始自由搭建。家具会收进这一层的仓库，积分和收藏继续保留。',designCard);
  const designNameLabel=el('label','estate-field',null,designCard);el('span','','新房间名字',designNameLabel);const designName=el('input','',null,designNameLabel);designName.maxLength=18;designName.placeholder='例如：森林书房、星空卧室';designName.setAttribute('aria-label','新房间名字');
  const designThemes=el('div','estate-templates',null,designCard);designThemes.setAttribute('role','group');designThemes.setAttribute('aria-label','新房间主题');const designThemeButtons=new Map();
  for(const[value,name]of TEMPLATES){const button=el('button','estate-template',name,designThemes);button.setAttribute('aria-label','新房间主题：'+name);button.addEventListener('click',()=>{if(locked()||worldLoading)return;worldTemplate=value;for(const [key,item]of designThemeButtons)item.setAttribute('aria-pressed',String(key===value));},listen);designThemeButtons.set(value,button);}
  const newDesign=el('button','estate-primary','备份并新建装修',designCard);newDesign.dataset.estateAction='world-new';
  const worldCount=el('p','estate-help','每层最多保留 5 个存档点。',worldCard),worldList=el('div','estate-world-saves',null,worldCard);worldList.setAttribute('aria-label','这一层的存档点');
  const worldFiles=el('div','estate-world-files',null,worldCard),exportWorld=el('button','estate-world-button','导出这一层',worldFiles);exportWorld.dataset.estateAction='world-export';
  const importLabel=el('label','estate-world-import',null,worldFiles);el('span','','导入这一层的存档文件',importLabel);const importWorld=el('input','',null,importLabel);importWorld.type='file';importWorld.accept='.json,application/json';importWorld.setAttribute('aria-label','导入这一层的存档文件');
  el('p','estate-help','读取或导入只替换这一层的布置；共享积分、收藏与其他楼层继续保留。',worldCard);
  const worldConfirm=el('section','estate-world-confirm',null,worldCard);worldConfirm.hidden=true;worldConfirm.setAttribute('role','group');worldConfirm.setAttribute('aria-label','确认读取这一层');
  const confirmTitle=el('strong','','',worldConfirm),confirmCopy=el('p','','',worldConfirm),confirmActions=el('div','estate-confirm-actions',null,worldConfirm);
  const confirmYes=el('button','estate-confirm-yes','确认读取这一层',confirmActions),confirmCancel=el('button','','先不读取',confirmActions);
  const newCard=el('section','estate-card estate-create-card',null,body);el('h3','','给城堡添下一层楼',newCard);const freeText=el('p','estate-free','一楼扩建二楼需 600 积分 · 最高 2 层',newCard);
  const nameLabel=el('label','estate-field',null,newCard);el('span','','新楼层名字',nameLabel);const nameInput=el('input','',null,nameLabel);nameInput.type='text';nameInput.maxLength=18;nameInput.setAttribute('aria-label','新楼层名字');nameInput.placeholder='给下一层起个喜欢的名字';
  el('p','estate-field-label','选择新楼层的配色',newCard);const templateGroup=el('div','estate-templates',null,newCard);templateGroup.setAttribute('role','group');templateGroup.setAttribute('aria-label','新楼层主题');const templateButtons=new Map();
  for(const[value,name,description]of TEMPLATES){const button=el('button','estate-template',null,templateGroup);button.dataset.estateTemplate=value;button.setAttribute('aria-label',name);button.title=description;el('span','estate-template-swatch','',button).setAttribute('aria-hidden','true');el('span','',name,button);button.addEventListener('click',()=>{if(busy)return;selectedTemplate=value;renderTemplateButtons();},listen);templateButtons.set(value,button);}
  const createButton=el('button','estate-primary','扩建二楼（600 积分）',newCard);createButton.dataset.estateAction='create';const capacity=el('p','estate-help','',newCard);
  const musicCard=el('section','estate-music',null,body);el('span','estate-music-label','♫ 设计者精选 · 曲目已锁定',musicCard);const musicTitle=el('strong','','小屋的陪伴旋律',musicCard),musicState=el('small','','',musicCard);el('p','','声音开关与音量，可以在「伙伴手册」里调整。',musicCard);
  const status=el('p','estate-status','选一层楼，推门去看看吧～',panel);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const operational=[nameInput,createButton,...templateButtons.values()];
  const locked=()=>busy||!ready||!current||current.busy||roomState?.decoration||roomState?.shop?.busy||root.dataset.roomDrawingDirty==='true'||root.dataset.roomWallDrawingDirty==='true';
  const activeRoom=()=>current?.rooms?.find(room=>room.id===current.activeRoomId)||null;
  const readableTime=value=>{const date=new Date(value);return value&&Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):null;};
  function say(message,error=false){if(disposed)return;status.textContent=message;status.dataset.tone=error?'error':'happy';}
  function renderTemplateButtons(){for(const[value,button]of templateButtons)button.setAttribute('aria-pressed',String(value===selectedTemplate));}
  function refreshControls(){const count=current?.rooms?.length||0,full=count>=MAX_ROOMS,cost=floorExpansionCost(count),blocked=!!locked();for(const node of operational)node.disabled=blocked;createButton.disabled=blocked||full;freeText.textContent=`一楼扩建二楼需 ${floorExpansionCost(1)} 积分 · 最高 ${MAX_ROOMS} 层`;createButton.textContent=full?'二楼已建成':'扩建二楼（'+cost+' 积分）';createButton.title=full?'每层都可以备份并新建不同装修':'扩建二楼消耗 '+cost+' 学习积分';capacity.textContent=count>MAX_ROOMS?'旧版额外楼层已保留，当前版本不再增加楼层。':full?'两层已经建好。想换个风格，可以在当前层备份并新建装修。':'二楼与一楼独立布置，两层共用积分和收藏。';panel.setAttribute('aria-busy',String(busy||worldLoading));trigger.disabled=!ready;renderRooms();renderWorld();}
  async function run(method,args,success){
    if(disposed||locked())return null;busy=true;refreshControls();
    try{
      if(typeof api[method]!=='function'){say('伙伴还在准备这扇新门，请稍后再试～',true);return null;}
      const result=await api[method](...args);if(disposed)return result;
      if(result?.ok===false){say(result.message||'刚才没有完成，原来的小屋还好好的～',true);return result;}
      say(result?.message||success||'整理好啦，我们去看看～');refresh(true);return result;
    }catch{if(!disposed)say('刚才的小动作没完成，再试一下吧～',true);return null;}
    finally{busy=false;if(!disposed)refreshControls();}
  }
  let worldSignature='';
  function clearWorldConfirmation(){pendingWorldAction=null;worldConfirm.hidden=true;}
  function renderWorld(){
    const room=activeRoom();
    if(room?.id!==worldRoomId){worldRoomId=room?.id||null;worldSaves=[];worldSignature='';worldLoading=false;++worldRequest;worldName.value='';designName.value='';worldTemplate=room?.template||'cream';for(const[key,button]of designThemeButtons)button.setAttribute('aria-pressed',String(key===worldTemplate));clearWorldConfirmation();if(opened&&room)void loadWorldSaves();}
    worldTitle.textContent=room?`${roomFloor(room)+1} 楼 · ${room.name} 的小世界`:'这一层的小世界';
    const updated=readableTime(room?.world?.updatedAt),revision=room?.world?.revision;
    worldStatus.textContent=updated?`✓ 已自动保存 · ${updated}${Number.isSafeInteger(revision)?` · 第 ${revision} 版`:''}`:'这一层的装修会自动保存';
    const count=Math.max(worldSaves.length,room?.world?.checkpointCount||0),disabled=!!locked()||worldLoading||!room;
    designName.disabled=disabled;newDesign.disabled=disabled||count>=5;for(const button of designThemeButtons.values())button.disabled=disabled;worldName.disabled=disabled;saveWorld.disabled=disabled||count>=5;exportWorld.disabled=disabled;importWorld.disabled=disabled;
    confirmYes.disabled=disabled;confirmCancel.disabled=busy;
    worldCount.textContent=count>=5?'已保存 5 / 5 个存档点；删除不需要的存档点后可以继续保存。':`已保存 ${count} / 5 个存档点 · 自动保存会一直保留当前布置`;
    const next=JSON.stringify([worldRoomId,worldSaves,disabled]);if(next===worldSignature)return;worldSignature=next;worldList.replaceChildren();
    if(!worldSaves.length){el('p','estate-help',worldLoading?'正在翻开这一层的存档…':'还没有存档点，给喜欢的布置留个名字吧。',worldList);return;}
    for(const save of worldSaves){
      const row=el('div','estate-world-save',null,worldList),copy=el('div','estate-world-save-copy',null,row);el('strong','',save.name||'未命名存档',copy);el('small','',readableTime(save.createdAt)||'保存时间未知',copy);
      const actions=el('div','estate-world-save-actions',null,row),restore=el('button','estate-world-button','读取',actions),remove=el('button','estate-world-button estate-world-remove','删除',actions);
      restore.dataset.estateWorldRestore=save.id;remove.dataset.estateWorldRemove=save.id;restore.disabled=disabled;remove.disabled=disabled;restore.setAttribute('aria-label',`读取存档点 ${save.name}`);remove.setAttribute('aria-label',`删除存档点 ${save.name}`);
      restore.addEventListener('click',()=>{if(locked()||worldLoading)return;showWorldConfirmation({method:'restoreRoomWorld',roomId:room.id,saveId:save.id,name:save.name});},listen);
      remove.addEventListener('click',async()=>{if(activeRoom()?.id!==room.id||worldLoading)return;const result=await run('removeRoomWorldSave',[room.id,save.id],'存档点已删除，当前楼层的布置还在。');if(result?.ok!==false&&result)await loadWorldSaves();},listen);
    }
  }
  async function loadWorldSaves(){
    const room=activeRoom();if(disposed||!room||typeof api.listRoomWorldSaves!=='function')return;
    clearWorldConfirmation();const request=++worldRequest,id=room.id;worldLoading=true;refreshControls();
    try{
      const result=await api.listRoomWorldSaves(id);if(disposed||request!==worldRequest||activeRoom()?.id!==id)return;
      if(result?.ok===false){say(result.message||'这一层的存档暂时没有打开，请稍后再试。',true);return;}
      worldSaves=(Array.isArray(result?.saves)?result.saves:[]).filter(save=>save&&typeof save.id==='string').slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,5);
      room.world={...room.world,...(result?.world||{}),...(Number.isSafeInteger(result?.revision)?{revision:result.revision}:{}),...(result?.updatedAt?{updatedAt:result.updatedAt}:{}),checkpointCount:worldSaves.length};
    }catch{if(!disposed&&request===worldRequest)say('这一层的存档暂时没有打开，请稍后再试。',true);}
    finally{if(!disposed&&request===worldRequest){worldLoading=false;refreshControls();}}
  }
  function showWorldConfirmation(action){
    const room=activeRoom();if(!room||room.id!==action.roomId||locked())return;pendingWorldAction=action;
    if(action.method==='createRoomWorld'){
      worldConfirm.setAttribute('aria-label','确认备份并新建装修');confirmTitle.textContent=`在 ${roomFloor(room)+1} 楼新建「${action.input.name||'新房间'}」？`;confirmCopy.textContent=`当前布置会备份为「${action.input.backupName||room.name+' · 新建前备份'}」，然后打开${templateName(action.input.template)}风格的空房间。家具收入仓库，已解锁房型、积分、收藏和其他楼层全部保留。`;confirmYes.textContent='确认备份并新建';confirmCancel.textContent='先不新建';worldConfirm.hidden=false;confirmYes.focus({preventScroll:true});return;
    }
    worldConfirm.setAttribute('aria-label','确认读取这一层');confirmYes.textContent='确认读取这一层';confirmCancel.textContent='先不读取';
    confirmTitle.textContent=`读取到 ${roomFloor(room)+1} 楼「${room.name}」？`;
    confirmCopy.textContent=`「${action.name||'导入的存档'}」将替换这一层当前的家具摆放、配色与作品。共享积分、收藏与其他楼层保留。想留下当前布置，请先取消并点「保存此层」。`;
    worldConfirm.hidden=false;confirmYes.focus({preventScroll:true});
  }
  saveWorld.addEventListener('click',async()=>{
    const room=activeRoom();if(!room||worldLoading||locked())return;
    if(Math.max(worldSaves.length,room.world?.checkpointCount||0)>=5){say('这一层已有 5 个存档点，请先删除不需要的存档点。',true);return;}
    const result=await run('saveRoomWorld',[room.id,{name:worldName.value.trim()}],'这一层的小世界保存好啦。');
    if(!disposed&&result&&result.ok!==false){worldName.value='';await loadWorldSaves();}
  },listen);
  newDesign.addEventListener('click',()=>{const room=activeRoom();if(!room||locked()||worldLoading)return;if(Math.max(worldSaves.length,room.world?.checkpointCount||0)>=5){say('备份位置已满，请先导出或删除一个旧备份。',true);return;}showWorldConfirmation({method:'createRoomWorld',roomId:room.id,input:{...(designName.value.trim()?{name:designName.value.trim()}:{}),template:worldTemplate,...(worldName.value.trim()?{backupName:worldName.value.trim()}:{})}});},listen);
  confirmCancel.addEventListener('click',()=>{if(busy)return;clearWorldConfirmation();saveWorld.focus({preventScroll:true});},listen);
  confirmYes.addEventListener('click',async()=>{
    const action=pendingWorldAction;if(!action||locked()||worldLoading||activeRoom()?.id!==action.roomId)return;
    const args=action.method==='createRoomWorld'?[action.roomId,action.input]:action.method==='importRoomWorld'?[action.roomId,action.json]:[action.roomId,action.saveId];
    const result=await run(action.method,args,'这一层已读取，其他楼层和共享收藏都还在。');
    if(!disposed&&result&&result.ok!==false){clearWorldConfirmation();await loadWorldSaves();}
  },listen);
  exportWorld.addEventListener('click',async()=>{
    const room=activeRoom();if(!room||worldLoading)return;const result=await run('exportRoomWorld',[room.id],'这一层的存档已导出。');
    if(disposed||!result||result.ok===false)return;
    let url;
    try{const json=result.json||JSON.stringify(result.archive),urls=win.URL||globalThis.URL;url=urls.createObjectURL(new (win.Blob||globalThis.Blob)([json],{type:'application/json'}));const link=el('a','',null,doc.body);link.href=url;link.download=`${roomFloor(room)+1}楼-${room.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')}-小世界.json`;link.click();link.remove();urls.revokeObjectURL(url);}
    catch{if(url)try{(win.URL||globalThis.URL).revokeObjectURL(url);}catch{}say('存档已准备好，但下载未完成，请再试一次。',true);}
  },listen);
  importWorld.addEventListener('change',async()=>{
    const file=importWorld.files?.[0],room=activeRoom();if(!file||!room||locked()||worldLoading)return;
    clearWorldConfirmation();const request=++worldRequest,id=room.id;worldLoading=true;refreshControls();
    try{const json=await file.text();if(disposed||request!==worldRequest||activeRoom()?.id!==id)return;JSON.parse(json);worldLoading=false;refreshControls();showWorldConfirmation({method:'importRoomWorld',roomId:id,json,name:file.name||'导入的存档'});}
    catch{if(!disposed&&request===worldRequest)say('这个文件暂时无法读取，请选择导出的小世界存档文件。',true);}
    finally{if(!disposed&&request===worldRequest){worldLoading=false;importWorld.value='';refreshControls();}}
  },listen);
  createButton.addEventListener('click',async()=>{if((current?.rooms?.length||0)>=MAX_ROOMS){say('小屋最高两层，想换风格可以备份并新建装修。',true);return;}const result=await run('createEstateRoom',[{...(nameInput.value.trim()?{name:nameInput.value.trim()}:{}),template:selectedTemplate}],'城堡又长高一层啦，去给它一点你的颜色～');if(result&&result.ok!==false&&!disposed)nameInput.value='';},listen);
  function roomCard(room){
    const button=el('button','estate-room-card',null,null);button.dataset.estateRoom=room.id;button.dataset.template=TEMPLATES.some(item=>item[0]===room.template)?room.template:'cream';const active=room.id===current.activeRoomId;button.setAttribute('aria-label',`${roomFloor(room)+1} 楼，${room.name}，${templateName(room.template)}，${active?'当前楼层':'进入楼层'}`);button.disabled=!!locked()||active;button.setAttribute('aria-current',active?'page':'false');
    const preview=el('span','estate-room-preview',null,button);preview.setAttribute('aria-hidden','true');el('i','estate-preview-window','',preview);el('i','estate-preview-sofa','',preview);el('i','estate-preview-plant','',preview);
    const copy=el('span','estate-room-copy',null,button);el('strong','',room.name,copy);el('small','',templateName(room.template),copy);el('span','estate-room-state',active?'✓ 我们正在这里':'推门进去 →',copy);
    button.addEventListener('click',()=>void run('selectEstateRoom',[room.id],`到「${room.name}」这一层啦，伙伴跟着你一起过来～`),listen);return button;
  }
  function renderRooms(force=false){
    const rooms=Array.isArray(current?.rooms)?current.rooms:[],next=JSON.stringify([current?.activeRoomId,rooms,busy,!!locked()]);if(!force&&next===roomsSignature)return;roomsSignature=next;roomList.replaceChildren();roomList.dataset.mode='castle';roomSummary.textContent=rooms.length>MAX_ROOMS?`城堡楼层 · ${rooms.length} 层（旧版保留）`:`城堡楼层 · ${rooms.length} / ${MAX_ROOMS} 层`;
    if(!rooms.length){el('p','estate-empty','城堡还空空的，先添上暖暖的第一层吧～',roomList);return;}
    const tower=el('div','estate-castle',null,roomList);el('div','estate-castle-roof','我们的小城堡',tower);
    for(const room of rooms.slice().sort((a,b)=>roomFloor(b)-roomFloor(a))){const floor=roomFloor(room),level=el('div','estate-floor',null,tower),floorButton=el('button','estate-floor-button',`${floor+1} 楼`,level);floorButton.setAttribute('aria-label',`前往 ${floor+1} 楼，${room.name}`);floorButton.setAttribute('aria-current',room.id===current.activeRoomId?'step':'false');floorButton.disabled=!!locked()||room.id===current.activeRoomId;floorButton.addEventListener('click',()=>void run('selectEstateRoom',[room.id],`来到 ${floor+1} 楼啦～`),listen);const row=el('div','estate-floor-rooms',null,level);row.append(roomCard(room));}
    el('div','estate-castle-base','每层都有一个小小世界',tower);
  }
  function refresh(force=false){
    if(disposed||typeof api.getEstate!=='function')return;let result;try{result=api.getEstate();}catch{say('楼层目录还在整理，稍后再翻开看看～',true);return;}
    if(!result||result.ok===false){if(result?.message)say(result.message,true);return;}const next=result.estate||result,nextSignature=JSON.stringify(next);if(!force&&signature===nextSignature)return;signature=nextSignature;
    current=next;
    const points=Number.isSafeInteger(next.balance)&&next.balance>=0?next.balance:0;balance.textContent=`共享积分 · ${points.toLocaleString('zh-CN')}`;
    musicTitle.textContent=next.music?.title||'小屋的陪伴旋律';musicState.textContent=next.music?.enabled?'背景音乐 · 已开启':'背景音乐 · 已关闭';renderRooms(force);refreshControls();
  }
  function open(){if(disposed||opened)return;opened=true;returnFocus=activeElementFor(root);panel.hidden=false;trigger.setAttribute('aria-expanded','true');refresh(true);void loadWorldSaves();closeButton.focus({preventScroll:true});}
  function close(){if(disposed||!opened)return;opened=false;clearWorldConfirmation();panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus?.isConnected)returnFocus.focus?.({preventScroll:true});else trigger.focus({preventScroll:true});returnFocus=null;}
  trigger.addEventListener('click',()=>opened?close():open(),listen);closeButton.addEventListener('click',close,listen);
  doc.addEventListener('keydown',event=>{if(event.key!=='Escape'||!opened||!panel.contains(activeElementFor(root)))return;event.preventDefault();if(pendingWorldAction&&!busy){clearWorldConfirmation();saveWorld.focus({preventScroll:true});}else close();},listen);
  renderTemplateButtons();refresh(true);
  return {open,close,update(state){if(disposed)return;roomState=state;ready=state?.ready===true||state?.lifecycle==='ready';refresh();refreshControls();},dispose(){if(disposed)return;disposed=true;++worldRequest;pendingWorldAction=null;events.abort();panel.remove();trigger.remove();current=null;}};
}
