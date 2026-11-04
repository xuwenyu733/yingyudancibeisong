/** Speech uses installed local voices. Timbre depends on the OS; no remote audio is sent. */
export function createPetVoice({win=globalThis,eventTarget=win.document}={}){
  let enabled=false,muted=true,volume='quiet',language='zh-CN',style='gentle',unlocked=false,disposed=false,lastText='',lastAt=0,current=null;
  const levels={quiet:.25,standard:.6,loud:.9},languages=['zh-CN','en-US','ja-JP'];
  const engine=win.speechSynthesis,Utterance=win.SpeechSynthesisUtterance;
  const voice=(lang=language)=>{try{const prefix=lang.split('-')[0].toLowerCase();const local=engine?.getVoices?.().filter(item=>item.localService===true)||[];return local.find(item=>item.lang?.toLowerCase()===lang.toLowerCase())||local.find(item=>item.lang?.split(/[-_]/)[0].toLowerCase()===prefix)||null;}catch{return null;}};
  const stop=()=>{if(!current)return;current.onend=null;current.onerror=null;current=null;try{engine?.cancel?.();}catch{}};
  function gesture(event){if(event?.isTrusted===false||event?.ctrlKey||event?.metaKey||event?.altKey)return;unlocked=true;}
  eventTarget?.addEventListener?.('pointerdown',gesture,{capture:true,passive:true});eventTarget?.addEventListener?.('keydown',gesture,true);
  function getState(){return {enabled,muted,volume,language,style,unlocked,supported:!!engine&&typeof Utterance==='function'&&!!voice(),localOnly:true,availableLanguages:languages.filter(lang=>!!voice(lang))};}
  function speakText(value,{language:requested=language,force=false}={}){
    if(disposed||!enabled||muted)return {ok:false,code:'MUTED',message:'语音已关闭，伙伴会继续用图片和文字陪你。'};
    if(!unlocked)return {ok:false,code:'GESTURE_REQUIRED',message:'点一下小屋，再听伙伴说话吧～'};
    const lang=languages.includes(requested)?requested:language,selected=voice(lang);
    if(!engine||typeof Utterance!=='function'||!selected)return {ok:false,code:'LOCAL_VOICE_UNAVAILABLE',message:'设备尚未安装这个语言的本地语音，图片和文字仍可使用；可在系统语音设置中添加。'};
    const text=String(value||'').trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,500);if(!text)return {ok:false,code:'EMPTY_TEXT',message:'先选一句想听的话呀～'};
    const now=Date.now(),key=lang+':'+text;if(!force&&key===lastText&&now-lastAt<30000)return {ok:true,unchanged:true};
    try{stop();const utterance=new Utterance(text);utterance.voice=selected;utterance.lang=selected.lang;utterance.volume=levels[volume];utterance.rate=style==='bright'?1:.88;utterance.pitch=style==='bright'?1.3:1.12;current=utterance;utterance.onend=utterance.onerror=()=>{if(current===utterance)current=null;};engine.speak(utterance);lastText=key;lastAt=now;return {ok:true,message:'伙伴在轻轻读给你听～'};}catch{current=null;return {ok:false,code:'VOICE_FAILED',message:'这次语音没能播放，图片和文字继续陪你。'};}
  }
  return {
    configure(configuration={}){if(disposed)return getState();if(typeof configuration.enabled==='boolean')enabled=configuration.enabled;if(typeof configuration.muted==='boolean')muted=configuration.muted;if(Object.hasOwn(levels,configuration.volume))volume=configuration.volume;const lang=configuration.voiceLanguage||configuration.language,tone=configuration.voiceStyle||configuration.style;if(languages.includes(lang))language=lang;if(['gentle','bright'].includes(tone))style=tone;if(!enabled||muted)stop();return getState();},
    getState,speakText,
    speak(name,{force=false}={}){const nickname=String(name||'小主人').trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,40)||'小主人';return speakText(language==='en-US'?`Welcome back, ${nickname}!`:language==='ja-JP'?`${nickname}、おかえり！`:`${nickname}，你回来啦！`,{force});},
    dispose(){if(disposed)return;disposed=true;stop();eventTarget?.removeEventListener?.('pointerdown',gesture,true);eventTarget?.removeEventListener?.('keydown',gesture,true);},
  };
}
