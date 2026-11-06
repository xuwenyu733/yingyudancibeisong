import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomMusic} from '../room-music.mjs';
import {DESIGNER_MUSIC_CONFIG} from '../designer-config.mjs';

function fixture({own=false,configuration=DESIGNER_MUSIC_CONFIG,sound={}}={}){
  let nextId=0,closed=0,created=0;const timers=new Map(),listeners=new Map(),oscillators=[],gains=[];
  const context={state:'running',currentTime:0,destination:{},resume(){this.state='running';return Promise.resolve();},close(){closed++;this.state='closed';return Promise.resolve();},
    createGain(){const node={disconnected:false,events:[],connect(target){this.target=target;return target;},disconnect(){this.disconnected=true;}};node.gain={value:.0001,setValueAtTime(value,at){node.events.push({method:'set',value,at});this.value=value;},exponentialRampToValueAtTime(value,at){node.events.push({method:'ramp',value,at});},setTargetAtTime(value,at){node.events.push({method:'target',value,at});this.value=value;},cancelScheduledValues(){}};gains.push(node);return node;},
    createOscillator(){const node={disconnected:false,ended:false,starts:[],stopAt:null,frequency:{setValueAtTime(){}},connect(target){return target;},disconnect(){this.disconnected=true;},start(at){this.starts.push(at);},stop(at=context.currentTime){this.stopAt=at;}};oscillators.push(node);return node;},
  };
  const clock={setTimeout(fn,ms){const id=++nextId;timers.set(id,{fn,at:context.currentTime+ms/1000});return id;},clearTimeout(id){timers.delete(id);}};
  const doc={nodeType:9,hidden:false,defaultView:{...clock,AudioContext:class {constructor(){created++;return context;}}},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    emit(name,properties={}){for(const fn of [...listeners.get(name)||[]])fn({type:name,...properties});},
  };
  const music=createRoomMusic({eventTarget:doc,configuration,sound,audioContext:own?null:context,clock});
  function finishNotes(){for(const osc of oscillators)if(!osc.ended&&osc.stopAt!==null&&osc.stopAt<=context.currentTime){osc.ended=true;osc.onended?.();}}
  function advance(seconds){const target=context.currentTime+seconds;let count=0;while(timers.size){const [id,task]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(task.at>target)break;if(++count>5000)throw new Error('Timer loop');context.currentTime=task.at;timers.delete(id);finishNotes();task.fn();}context.currentTime=target;finishNotes();}
  return {music,doc,context,timers,listeners,oscillators,gains,advance,get closed(){return closed;},get created(){return created;}};
}

test('fixed original music waits for a trusted gesture and then uses a single bounded scheduler',()=>{
  const f=fixture();try{
    assert.deepEqual(f.music.getState(),{track:'cloud-lullaby',title:'云朵小屋',enabled:true,locked:true,muted:false,volume:'quiet',playing:false});assert.equal(f.oscillators.length,0);assert.equal(f.timers.size,0);
    f.doc.emit('pointerdown',{isTrusted:false});f.doc.emit('keydown',{isTrusted:true,ctrlKey:true});assert.equal(f.oscillators.length,0);
    f.doc.emit('pointerdown',{isTrusted:true});assert.equal(f.music.getState().playing,true);assert.ok(f.oscillators.length>0);assert.equal(f.timers.size,1);
    for(let i=0;i<8;i++)f.doc.emit('keydown',{isTrusted:true});assert.equal(f.timers.size,1);
    f.advance(80);assert.equal(f.timers.size,1);assert.ok(f.oscillators.filter(node=>!node.disconnected).length<=12,'旧音符结束后释放节点');
  }finally{f.music.dispose();}
});

test('track metadata is locked and visitors can adjust only mute and volume',()=>{
  const config={track:'cloud-lullaby',title:'设计者的云朵曲',enabled:true,locked:false},f=fixture({configuration:config});try{
    config.title='changed';config.track='external';assert.equal(f.music.getState().title,'设计者的云朵曲');assert.equal(f.music.getState().locked,true);assert.equal(f.music.setTrack,undefined);
    const snapshot=f.music.getState();assert.ok(Object.isFrozen(snapshot));assert.throws(()=>{snapshot.track='other';},TypeError);
    f.doc.emit('pointerdown',{isTrusted:true});const master=f.gains[0],quiet=master.events.at(-1).value;
    f.music.configureSound({volume:'standard',track:'intruder',title:'wrong'});const standard=master.events.at(-1).value;f.music.configureSound({volume:'loud'});const loud=master.events.at(-1).value;
    assert.ok(quiet<standard&&standard<loud);assert.equal(f.music.getState().track,'cloud-lullaby');assert.equal(f.music.getState().title,'设计者的云朵曲');
    f.music.configureSound({volume:'unrecognised'});assert.equal(f.music.getState().volume,'loud');
  }finally{f.music.dispose();}
  assert.throws(()=>createRoomMusic({configuration:{track:'https://external.example/song.mp3'}}),RangeError);
});

test('mute fades and stops current notes, clears the timer, and resumes only an already unlocked session',()=>{
  const f=fixture();try{
    f.music.configureSound({muted:false,volume:'standard'});assert.equal(f.timers.size,0,'设置本身不应绕过手势');
    f.doc.emit('pointerdown',{isTrusted:true});f.advance(.4);const active=f.oscillators.filter(node=>!node.ended);
    f.music.configureSound({muted:true});assert.equal(f.timers.size,0);assert.equal(f.music.getState().playing,false);for(const node of active)assert.ok(node.stopAt<=f.context.currentTime+.05);
    const before=f.oscillators.length;f.advance(5);assert.equal(f.oscillators.length,before);assert.ok(active.every(node=>node.disconnected));
    f.music.configureSound({muted:false});assert.equal(f.music.getState().playing,true);assert.equal(f.timers.size,1);
  }finally{f.music.dispose();}
});

test('owner-document visibility and host presentation hiding both stop and resume music safely',()=>{
  const f=fixture();try{
    f.doc.hidden=true;f.doc.emit('visibilitychange');f.doc.emit('pointerdown',{isTrusted:true});assert.equal(f.timers.size,0);
    f.doc.hidden=false;f.doc.emit('visibilitychange');assert.equal(f.music.getState().playing,true);assert.equal(f.timers.size,1);
    f.music.setPresentationHidden(true);assert.equal(f.timers.size,0);assert.equal(f.music.getState().playing,false);f.music.setPresentationHidden(false);assert.equal(f.timers.size,1);
  }finally{f.music.dispose();}
});

test('disposing clears listeners, nodes and timers without closing an injected shared context',()=>{
  const f=fixture();f.doc.emit('pointerdown',{isTrusted:true});f.music.dispose();f.music.dispose();assert.equal(f.closed,0);assert.equal(f.timers.size,0);assert.ok([...f.listeners.values()].every(list=>list.size===0));assert.ok(f.oscillators.every(node=>node.disconnected));assert.ok(f.gains.every(node=>node.disconnected));assert.equal(f.music.unlock(),false);
  const owned=fixture({own:true});assert.equal(owned.created,0);owned.doc.emit('keydown',{isTrusted:true});assert.equal(owned.created,1);owned.music.dispose();owned.music.dispose();assert.equal(owned.closed,1);
});

test('disabled designer music remains off and a long scheduler delay never emits overdue notes in a burst',()=>{
  const disabled=fixture({configuration:{track:'cloud-lullaby',enabled:false}});disabled.doc.emit('pointerdown',{isTrusted:true});assert.equal(disabled.music.getState().enabled,false);assert.equal(disabled.oscillators.length,0);assert.equal(disabled.timers.size,0);disabled.music.dispose();
  const f=fixture();try{
    f.doc.emit('pointerdown',{isTrusted:true});f.context.currentTime+=180;const [id,task]=[...f.timers][0];f.timers.delete(id);const before=f.oscillators.length;task.fn();const added=f.oscillators.slice(before);assert.ok(added.length<=4);assert.ok(added.every(osc=>osc.starts[0]>=f.context.currentTime));assert.equal(f.timers.size,1);
  }finally{f.music.dispose();}
});
