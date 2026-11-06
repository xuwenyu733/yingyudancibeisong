import test from 'node:test';
import assert from 'node:assert/strict';
import {growthFor} from '../growth.mjs';
import {BADGES} from '../profile.mjs';
import {ACHIEVEMENT_SKINS,drawAchievementSkin} from '../achievement-skins.mjs';
import {createPetVoice} from '../pet-voice.mjs';

const days=n=>Array.from({length:n},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
test('growth follows distinct saved active dates and an explicit learning task',()=>{
  assert.equal(growthFor({visitDates:days(6)}).id,'baby');assert.equal(growthFor({visitDates:days(7)}).id,'young');
  const waiting=growthFor({visitDates:days(30),learningSeconds:7199});assert.equal(waiting.id,'young');assert.equal(waiting.tasks[0].done,true);assert.equal(waiting.tasks[1].done,false);assert.ok(waiting.progress<1);
  const grown=growthFor({visitDates:days(30),learningSeconds:7200});assert.equal(grown.id,'adult');assert.equal(grown.next,null);assert.equal(grown.progress,1);
  assert.equal(growthFor({visitDates:Array(30).fill('2026-10-01'),learningSeconds:7200}).id,'baby','same day cannot accelerate growth');
});

test('every achievement has a distinct procedural furniture motif, not only a different tint',()=>{
  assert.deepEqual(ACHIEVEMENT_SKINS.map(s=>s.id),BADGES.map(b=>b.id));const signatures=[];
  for(const skin of ACHIEVEMENT_SKINS){const calls=[],ctx=new Proxy({}, {set(object,key,value){object[key]=value;return true;},get(object,key){return object[key]??((...args)=>calls.push([key,...args]));}});assert.equal(drawAchievementSkin(ctx,skin),true);signatures.push(JSON.stringify(calls));}
  assert.equal(new Set(signatures).size,BADGES.length);assert.equal(drawAchievementSkin(null,ACHIEVEMENT_SKINS[0]),false);
});

function voiceFixture(voices=[{name:'本地中文',lang:'zh-CN',localService:true}]){
  const handlers=new Map(),spoken=[];let cancels=0;
  const eventTarget={addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type,fn){if(handlers.get(type)===fn)handlers.delete(type);}};
  const win={SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>voices,speak:u=>spoken.push(u),cancel(){cancels++;}}};
  const voice=createPetVoice({win,eventTarget});return {voice,handlers,spoken,get cancels(){return cancels;}};
}
test('nickname voice requires an enabled preference, trusted gesture and installed Chinese voice',()=>{
  const f=voiceFixture();assert.equal(f.voice.speak('甜甜').code,'MUTED');f.voice.configure({enabled:true,muted:false,volume:'quiet'});
  assert.equal(f.voice.speak('甜甜').code,'GESTURE_REQUIRED');f.handlers.get('pointerdown')({isTrusted:false});assert.equal(f.voice.getState().unlocked,false);
  f.handlers.get('pointerdown')({isTrusted:true});assert.equal(f.voice.speak('甜甜').ok,true);assert.equal(f.spoken[0].text,'甜甜，你回来啦！');assert.equal(f.spoken[0].volume,.25);assert.equal(f.spoken[0].voice.localService,true);
  assert.equal(f.voice.speak('甜甜').unchanged,true);assert.equal(f.spoken.length,1);assert.equal(f.voice.speak('甜甜',{force:true}).ok,true);assert.equal(f.spoken.length,2);
  f.voice.configure({muted:true});assert.equal(f.cancels,2);assert.equal(f.voice.speak('甜甜').ok,false);f.voice.dispose();assert.equal(f.handlers.size,0);assert.equal(f.cancels,2,'does not cancel unrelated host speech after own voice ended');
});
test('remote Chinese and local non-Chinese voices never cause a remote fallback',()=>{
  const f=voiceFixture([{lang:'zh-CN',localService:false},{lang:'en-US',localService:true}]);f.voice.configure({enabled:true,muted:false});f.handlers.get('keydown')({isTrusted:true});
  assert.equal(f.voice.getState().supported,false);assert.equal(f.voice.speak('甜甜').code,'LOCAL_VOICE_UNAVAILABLE');assert.equal(f.spoken.length,0);f.voice.dispose();
});
test('voices that load later are usable without remounting and completed speech is not cancelled on mute',()=>{
  const voices=[],f=voiceFixture(voices);f.voice.configure({enabled:true,muted:false});f.handlers.get('pointerdown')({});assert.equal(f.voice.speak('团团').ok,false);
  voices.push({lang:'zh-Hans-CN',localService:true});assert.equal(f.voice.speak('团团').ok,true);f.spoken[0].onend();f.voice.configure({muted:true});assert.equal(f.cancels,0);f.voice.dispose();
});
