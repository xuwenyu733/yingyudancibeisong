/** Practice advances only after successful room events, never after clicking through instructions. */
export function createCompanionTutorial({root,api}){
  const doc=root.ownerDocument,win=doc.defaultView,events=new win.AbortController(),listen={signal:events.signal};
  let disposed=false,ready=false,started=false,done=false,paused=false,step=0,timer=0,highlighted=null,decorating=false,selected=false;
  const el=(tag,className,text,parent)=>{const node=doc.createElement(tag);if(tag==='button')node.type='button';node.className=className;if(text!=null)node.textContent=text;parent?.append(node);return node;};
  const guide=el('aside','companion-tour companion-practice-tour',null,root);guide.hidden=true;guide.setAttribute('aria-label','伙伴布置小提示');
  const mascot=el('div','companion-practice-pet',null,root);mascot.hidden=true;mascot.setAttribute('aria-hidden','true');
  const pet=el('img','',null,mascot);pet.src=new URL('./assets/pets/previews/apricot-fox.png',import.meta.url).href;pet.alt='';pet.draggable=false;
  el('span','companion-practice-hand','☝',mascot);
  const copy=el('div','companion-tour-copy',null,guide),heading=el('strong','','',copy),text=el('p','','',copy),actions=el('div','companion-tour-actions',null,copy);
  const skip=el('button','','先自己玩',actions),close=el('button','companion-tour-close','×',guide);close.setAttribute('aria-label','关闭布置提示');
  const steps=[
    ['先打开「装修」','点一下装修，我走到按钮旁边等你。','[data-room-control="decorate"]'],
    ['亲手拖一下','从底部选家具，再在房间里拖动，松手摆稳；仓库家具也能向上拖入。','[data-room-control="storage-strip"]'],
    ['帮宝贝转个身','选好家具后点「旋转90°」。触屏也能双指转动、捏合大小。','[data-room-control="rotate-furniture"]'],
    ['把喜欢留住','位置和方向都试过啦！点「完成保存」，我帮你记住这次创作。','[data-room-control="finish-decoration"]'],
  ];
  function clearTarget(){highlighted?.classList.remove('companion-tour-target');highlighted=null;}
  function position(){
    if(disposed||paused||guide.hidden)return;const selector=step===1&&selected?'[data-room-control="room"]':steps[step][2],target=root.querySelector(selector);
    if(!target||target.closest('[hidden]')){clearTarget();return;}if(target!==highlighted){clearTarget();highlighted=target;target.classList.add('companion-tour-target');}
    const bounds=root.getBoundingClientRect?.(),rect=target.getBoundingClientRect?.();if(!bounds||!rect||!bounds.width||!bounds.height||!mascot.style)return;
    const x=Math.max(4,Math.min(bounds.width-90,rect.left-bounds.left+Math.min(36,rect.width/2))),y=Math.max(48,Math.min(bounds.height-105,rect.top-bounds.top-82));
    const transform=`translate(${x}px,${y}px)`;if(mascot.style.transform!==transform)mascot.style.transform=transform;
  }
  function render(){
    const visible=ready&&started&&!done&&!paused&&!disposed;guide.hidden=!visible;mascot.hidden=!visible;if(!visible){clearTarget();return;}
    const title=`${step+1} / ${steps.length} · ${steps[step][0]}`;if(heading.textContent!==title)heading.textContent=title;if(text.textContent!==steps[step][1])text.textContent=steps[step][1];guide.dataset.step=String(step);mascot.dataset.step=String(step);position();
  }
  function finish(){
    if(disposed||done)return;done=true;win.clearTimeout(timer);timer=0;render();
    try{const result=api.updateCompanion?.({tourDone:true});result?.catch?.(()=>{});}catch{/* Skipping remains possible when storage is unavailable. */}
  }
  function start(){if(disposed)return;win.clearTimeout(timer);timer=0;started=true;done=false;selected=false;step=decorating?1:0;render();}
  function interaction(event){
    if(disposed||!started||done||paused)return;const record=event.detail||{},type=record.type,detail=record.detail||record;
    if(type==='decoration-mode'){
      decorating=!!detail.active;
      if(detail.active&&step===0)step=1;
      else if(!detail.active&&detail.saved&&step===3){finish();return;}
      else if(!detail.active){step=0;selected=false;}
    }
    if(decorating){
      if(type==='furniture-selected'){selected=!!detail.id;}
      if(step===1&&type==='furniture-landed'&&['drag','dock-drag'].includes(detail.source))step=2;
      else if(step===2&&type==='furniture-rotated')step=3;
    }
    render();
  }
  skip.addEventListener('click',finish,listen);close.addEventListener('click',finish,listen);
  root.addEventListener('pet-room-interaction',interaction,listen);
  win.addEventListener?.('resize',position,listen);root.addEventListener('scroll',position,{...listen,capture:true});
  return {
    start,pause(){paused=true;render();},resume(){paused=false;render();},
    update(state){
      if(disposed)return;ready=!!state?.ready;decorating=!!state?.decoration;
      if(ready&&!started&&!timer){let saved;try{saved=api.getCompanion?.().companion;}catch{}if(saved?.tourDone){done=true;return;}timer=win.setTimeout(()=>{timer=0;if(!disposed)start();},1800);}
      if(started)render();
    },
    dispose(){if(disposed)return;disposed=true;win.clearTimeout(timer);clearTarget();events.abort();guide.remove();mascot.remove();},
  };
}
