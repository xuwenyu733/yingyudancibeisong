/** Short, synthesised room sounds. A trusted gesture unlocks audio; there is no autoplay. */
const PRESETS = Object.freeze({
  click:    { wave: 'sine', freqs: [880], dur: .06, gain: .10 },
  checkin:  { wave: 'triangle', freqs: [440, 660, 880], dur: .18, gain: .12 },
  levelup:  { wave: 'triangle', freqs: [523, 659, 784, 1046], dur: .30, gain: .13 },
  badge:    { wave: 'sine', freqs: [659, 784, 1046, 1318], dur: .34, gain: .12 },
  purchase: { wave: 'triangle', freqs: [587, 880], dur: .18, gain: .12 },
  placement:{ wave: 'sine', freqs: [150, 95], dur: .14, gain: .16 },
  cheer:    { wave: 'triangle', freqs: [523, 659, 784], dur: .27, gain: .10 },
  clap:     { wave: 'triangle', freqs: [920, 710, 1080], dur: .10, gain: .07 },
  stamp:    { wave: 'sine', freqs: [230, 160, 660], dur: .12, gain: .12 },
  error:    { wave: 'sine', freqs: [220, 196], dur: .18, gain: .07 },
  water:    { wave: 'sine', freqs: [1200, 900], dur: .16, gain: .08 },
  snore:    { wave: 'sine', freqs: [86, 74, 64], dur: .55, gain: .025 },
});
export const SFX_VOLUMES = Object.freeze({quiet:.30,standard:.65,loud:1});

export function createSfx({audioContext, eventTarget=globalThis.document, muted:initialMuted=false, volume:initialVolume='quiet'}={}) {
  let ctx=audioContext||null,ctxFactory=null,disposed=false,muted=Boolean(initialMuted);
  let volume=Object.hasOwn(SFX_VOLUMES,initialVolume)?initialVolume:'quiet';
  // An injected context is an already-owned host audio session (and keeps the old test/host API).
  let unlocked=Boolean(audioContext),armedTarget=null;
  const voices=new Set();
  function ensureContext(){
    if(disposed||!unlocked)return null;
    if(!ctx){
      try{ctx=ctxFactory?ctxFactory():typeof globalThis.AudioContext==='function'?new globalThis.AudioContext():null;}catch{return null;}
    }
    if(ctx?.state==='suspended')try{ctx.resume()?.catch?.(()=>{});}catch{/* Audio is optional. */}
    return ctx;
  }
  function unlock(){if(disposed)return false;unlocked=true;return Boolean(ensureContext());}
  function gesture(event){if(event.isTrusted===false)return;if(event.type==='keydown'&&(event.ctrlKey||event.metaKey||event.altKey))return;unlock();}
  function disarm(){armedTarget?.removeEventListener?.('pointerdown',gesture,true);armedTarget?.removeEventListener?.('keydown',gesture,true);armedTarget=null;}
  function arm(target=globalThis.document){
    disarm();if(disposed||!target?.addEventListener)return false;armedTarget=target;
    target.addEventListener('pointerdown',gesture,{capture:true,passive:true});target.addEventListener('keydown',gesture,true);return true;
  }
  function stopVoices(){for(const osc of voices)try{osc.stop();}catch{}voices.clear();}
  function play(name){
    const preset=PRESETS[name];if(muted||disposed||!preset||!unlocked)return false;
    const context=ensureContext();if(!context||typeof context.currentTime!=='number')return false;
    try{
      const start=context.currentTime+.01;
      for(let index=0;index<preset.freqs.length;index++){
        const osc=context.createOscillator(),gain=context.createGain(),at=start+index*.055;
        osc.type=preset.wave;osc.frequency.setValueAtTime(preset.freqs[index],at);
        if(name==='placement')osc.frequency.exponentialRampToValueAtTime?.(Math.max(40,preset.freqs[index]*.55),at+preset.dur);
        gain.gain.setValueAtTime(.0001,at);
        gain.gain.exponentialRampToValueAtTime(preset.gain*SFX_VOLUMES[volume],at+preset.dur/Math.max(1,preset.freqs.length)*.6);
        gain.gain.exponentialRampToValueAtTime(.0001,at+preset.dur);
        osc.connect(gain).connect(context.destination);voices.add(osc);
        osc.onended=()=>{voices.delete(osc);try{osc.disconnect?.();gain.disconnect?.();}catch{}};
        osc.start(at);osc.stop(at+preset.dur+.02);
      }
      return true;
    }catch{return false;}
  }
  // playMelody：播任意频率序列（哼歌/木琴）。不依赖预置，各音符等价于一个短促的 click，
  // 音量取当前档位；静音/未解锁/已释放时安全返回 false。
  function playMelody(freqs=[],{wave='triangle',gap=.09,dur=.16,noteGain=.10}={}){
    const seq=Array.isArray(freqs)?freqs.filter(f=>Number.isFinite(f)&&f>0):[];
    if(muted||disposed||!seq.length||!unlocked)return false;
    const context=ensureContext();if(!context||typeof context.currentTime!=='number')return false;
    try{
      const start=context.currentTime+.02;
      for(let index=0;index<seq.length;index++){
        const osc=context.createOscillator(),gain=context.createGain(),at=start+index*gap;
        osc.type=wave;osc.frequency.setValueAtTime(seq[index],at);
        gain.gain.setValueAtTime(.0001,at);
        gain.gain.exponentialRampToValueAtTime(noteGain*SFX_VOLUMES[volume],at+dur/3);
        gain.gain.exponentialRampToValueAtTime(.0001,at+dur);
        osc.connect(gain).connect(context.destination);voices.add(osc);
        osc.onended=()=>{voices.delete(osc);try{osc.disconnect?.();gain.disconnect?.();}catch{}};
        osc.start(at);osc.stop(at+dur+.02);
      }
      return true;
    }catch{return false;}
  }
  function setMuted(value){muted=Boolean(value);if(muted)stopVoices();return muted;}
  function setVolume(value){if(Object.hasOwn(SFX_VOLUMES,value))volume=value;return volume;}
  function getSettings(){return {muted,volume,unlocked};}
  const api={play,unlock,arm,setMuted,setVolume,getSettings,playMelody,
    configure(settings={}){if(Object.hasOwn(settings,'muted'))setMuted(settings.muted);if(Object.hasOwn(settings,'volume'))setVolume(settings.volume);return getSettings();},
    get muted(){return muted;},get volume(){return volume;},
    setContextFactory(factory){ctxFactory=typeof factory==='function'?factory:null;},
    dispose(){if(disposed)return;disposed=true;disarm();stopVoices();try{ctx?.close?.()?.catch?.(()=>{});}catch{}ctx=null;},
  };
  arm(eventTarget);return api;
}
export const SFX_NAMES=Object.freeze(Object.keys(PRESETS));
