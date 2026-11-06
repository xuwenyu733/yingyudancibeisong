import {DESIGNER_MUSIC_CONFIG} from './designer-config.mjs';

// An original 24-second, 80 BPM melody. No audio downloads, accounts or external assets.
const BEAT=.75,LOOP_SECONDS=32*BEAT,LOOK_AHEAD=.25,TICK_MS=100;
const LEVELS=Object.freeze({quiet:.06,standard:.10,loud:.16});
const MELODY=Object.freeze([72,76,79,76,74,72,69,null,77,81,79,76,74,71,72,null,69,72,76,79,77,76,74,null,77,76,74,71,72,67,72,null]);
const CHORDS=Object.freeze([[48,64,67],[45,60,64],[53,57,60],[55,59,62],[48,64,67],[53,57,60],[55,59,62],[48,60,64]]);
const SCORE=Object.freeze([
  ...MELODY.flatMap((midi,beat)=>midi===null?[]:[{beat,notes:[midi],duration:beat===30?1.1:.55,gain:.12,voice:'bell'}]),
  ...CHORDS.map((notes,index)=>({beat:index*4,notes,duration:2.7,gain:.022,voice:'pad'})),
].sort((a,b)=>a.beat-b.beat));
const frequency=midi=>440*2**((midi-69)/12);
const soundSettings=sound=>({muted:Boolean(sound?.muted),volume:Object.hasOwn(LEVELS,sound?.volume)?sound.volume:'quiet'});

/** Locked background music. Runtime controls intentionally expose no track setter. */
export function createRoomMusic({eventTarget=globalThis.document,configuration=DESIGNER_MUSIC_CONFIG,sound={},audioContext=null,clock=null}={}){
  const chosen=configuration?.track??DESIGNER_MUSIC_CONFIG.track;
  if(chosen!=='cloud-lullaby')throw new RangeError('未知的小屋背景音乐，请由设计者选择支持的曲目');
  const config=Object.freeze({track:chosen,title:typeof configuration?.title==='string'?[...configuration.title.trim().replace(/[\u0000-\u001f]/g,'')].slice(0,40).join('')||'云朵小屋':'云朵小屋',enabled:configuration?.enabled!==false,locked:true});
  const ownerDocument=eventTarget?.ownerDocument||(eventTarget?.nodeType===9?eventTarget:null)||(eventTarget?.document?.nodeType===9?eventTarget.document:null);
  const ownerWindow=ownerDocument?.defaultView||eventTarget?.defaultView||globalThis;
  const timerOwner=typeof clock?.setTimeout==='function'&&typeof clock?.clearTimeout==='function'?clock:ownerWindow;
  const setTimer=(fn,ms)=>timerOwner.setTimeout(fn,ms),clearTimer=id=>timerOwner.clearTimeout(id);
  let settings=soundSettings(sound),context=audioContext,ownsContext=false,master=null;
  let unlocked=false,disposed=false,hidden=Boolean(ownerDocument?.hidden),playing=false,timer=null,cursor=0,cycleStart=0;
  const voices=new Set();

  function state(){return Object.freeze({...config,...settings,playing:playing&&context?.state!=='suspended'&&context?.state!=='closed'});}
  function clearSchedule(){if(timer!==null){clearTimer(timer);timer=null;}}
  function disconnect(voice){if(!voices.delete(voice))return;try{voice.osc.disconnect?.();voice.gain.disconnect?.();}catch{}}
  function fadeMaster(target){
    if(!master||!context)return;const at=context.currentTime;
    try{master.gain.cancelScheduledValues?.(at);if(master.gain.setTargetAtTime)master.gain.setTargetAtTime(target,at,.018);else master.gain.setValueAtTime(target,at);}catch{}
  }
  function stop(immediate=false){
    clearSchedule();playing=false;fadeMaster(.0001);
    const at=context?.currentTime||0;
    for(const voice of [...voices]){
      try{voice.gain.gain.cancelScheduledValues?.(at);voice.gain.gain.setTargetAtTime?.(.0001,at,.012);voice.osc.stop(at+(immediate?0:.045));}catch{}
      if(immediate)disconnect(voice);
    }
  }
  function ensureContext(){
    if(disposed||!unlocked)return null;
    if(!context){const Audio=ownerWindow.AudioContext||ownerWindow.webkitAudioContext;try{if(typeof Audio!=='function')return null;context=new Audio({latencyHint:'playback'});ownsContext=true;}catch{return null;}}
    if(context.state==='closed')return null;
    if(!master)try{master=context.createGain();master.gain.setValueAtTime(.0001,context.currentTime);master.connect(context.destination);}catch{return null;}
    if(context.state==='suspended')try{const resumed=context.resume?.();resumed?.catch?.(()=>stop(true));}catch{return null;}
    return context;
  }
  function note(midi,at,duration,gain,kind){
    if(!context||!master)return;
    let voice;
    try{
      const osc=context.createOscillator(),amp=context.createGain();voice={osc,gain:amp};
      osc.type='sine';osc.frequency.setValueAtTime(frequency(midi),at);
      // Gentle rounded bell/pad envelopes keep background music below action sounds.
      amp.gain.setValueAtTime(.0001,at);amp.gain.exponentialRampToValueAtTime(gain,at+(kind==='pad'?.45:.035));
      amp.gain.exponentialRampToValueAtTime(gain*.35,at+duration*.65);amp.gain.exponentialRampToValueAtTime(.0001,at+duration+.35);
      osc.connect(amp).connect(master);voices.add(voice);osc.onended=()=>disconnect(voice);osc.start(at);osc.stop(at+duration+.38);
    }catch{if(voice){try{voice.osc.stop();}catch{}disconnect(voice);}}
  }
  function advance(){cursor++;if(cursor===SCORE.length){cursor=0;cycleStart+=LOOP_SECONDS;}}
  function tick(){
    timer=null;if(!playing||disposed||hidden||settings.muted||!context)return;
    try{
      const now=context.currentTime;
      // A throttled/blocked tab never emits a burst of overdue notes.
      if(now-cycleStart>LOOP_SECONDS*2){cycleStart+=Math.floor((now-cycleStart)/LOOP_SECONDS)*LOOP_SECONDS;cursor=0;}
      for(let count=0;count<SCORE.length*2;count++){
        const event=SCORE[cursor],at=cycleStart+event.beat*BEAT;if(at>now+LOOK_AHEAD)break;
        if(at>=now-.03)for(const midi of event.notes)note(midi,Math.max(at,now+.005),event.duration,event.gain,event.voice);
        advance();
      }
      if(playing&&!disposed)timer=setTimer(tick,TICK_MS);
    }catch{stop(true);}
  }
  function start(){
    if(disposed||playing||!unlocked||hidden||settings.muted||!config.enabled)return false;
    if(!ensureContext())return false;
    playing=true;cursor=0;cycleStart=context.currentTime+.06;fadeMaster(LEVELS[settings.volume]);tick();return true;
  }
  function unlock(){if(disposed)return false;unlocked=true;return start()||playing;}
  function gesture(event){if(event.isTrusted!==true||event.type==='keydown'&&(event.ctrlKey||event.metaKey||event.altKey))return;unlock();}
  function visibility(){setPresentationHidden(Boolean(ownerDocument?.hidden));}
  function setPresentationHidden(value){if(disposed)return;hidden=Boolean(value);if(hidden)stop();else start();}
  function configureSound(sound={}){
    if(disposed)return state();
    if(!sound||typeof sound!=='object')return state();
    if(Object.hasOwn(sound,'muted'))settings.muted=Boolean(sound.muted);
    if(Object.hasOwn(LEVELS,sound.volume))settings.volume=sound.volume;
    if(settings.muted)stop();else if(playing)fadeMaster(LEVELS[settings.volume]);else start();
    return state();
  }
  eventTarget?.addEventListener?.('pointerdown',gesture,{capture:true,passive:true});
  eventTarget?.addEventListener?.('keydown',gesture,true);
  ownerDocument?.addEventListener?.('visibilitychange',visibility);
  return Object.freeze({configureSound,setPresentationHidden,getState:state,unlock,
    dispose(){if(disposed)return;disposed=true;stop(true);eventTarget?.removeEventListener?.('pointerdown',gesture,true);eventTarget?.removeEventListener?.('keydown',gesture,true);ownerDocument?.removeEventListener?.('visibilitychange',visibility);try{master?.disconnect?.();}catch{}master=null;if(ownsContext)try{context?.close?.()?.catch?.(()=>{});}catch{}context=null;},
  });
}
