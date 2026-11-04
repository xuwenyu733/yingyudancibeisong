import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionStore,defaultCompanion,validateCompanion} from '../companion-state.mjs';
import {defaultLearningProgress} from '../learning-bank.mjs';
import {createPetVoice} from '../pet-voice.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};

test('old v1 saves gain safe feature defaults while new preference enums remain strict',()=>{
  const old={version:1,petName:'旧伙伴'};
  const value=validateCompanion(old);assert.equal(value.petName,'旧伙伴');assert.equal(value.ageMode,'kindergarten');assert.equal(value.voiceLanguage,'zh-CN');assert.deepEqual(value.learningProgress,defaultLearningProgress());assert.equal(value.wallDrawing,null);assert.deepEqual(value.photos,[]);
  for(const patch of [{ageMode:'adult'},{voiceLanguage:'bad'},{voiceStyle:'unknown'},{weather:{enabled:true,latitude:null,longitude:null}},{weather:{enabled:false,latitude:91,longitude:0}}])assert.throws(()=>validateCompanion({...defaultCompanion(),...patch}));
  const s=createCompanionStore();assert.equal(s.update({photos:[]}).ok,false);assert.equal(s.update({learningProgress:defaultLearningProgress()}).ok,false);assert.equal(s.update({ageMode:'primary',voiceLanguage:'en-US',voiceStyle:'bright'}).ok,true);
});

test('legacy learning progress is importable while the removed playground has no answer mutation',()=>{
  const adapter=storage(),s=createCompanionStore({adapter}),progress=defaultLearningProgress();
  progress.answers=1;progress.streak=-1;progress.questions['count-1']={attempts:1,correct:0,wrong:1,correctStreak:0,mastered:false,lastAt:'2026-10-29T10:00:00Z'};progress.attemptIds=['legacy-attempt-1'];
  assert.equal(s.replace({...defaultCompanion(),learningProgress:progress}).ok,true);
  assert.deepEqual(createCompanionStore({adapter}).getState().learningProgress,progress);
  assert.equal(typeof s.answerQuestion,'undefined');
  assert.equal(s.update({learningProgress:defaultLearningProgress()}).ok,false);
});

test('photos, wall strokes and complete weather coordinates persist and reject unsafe/oversize data',()=>{
  const adapter=storage(),s=createCompanionStore({adapter}),photo={id:'photo-1',at:'2026-10-29T12:00:00Z',title:'我们的家',dataUrl:'data:image/jpeg;base64,/9j/AAAA'};
  assert.equal(s.savePhoto(photo).ok,true);assert.equal(s.savePhoto(photo).unchanged,true);
  assert.equal(s.savePhoto({...photo,id:'photo-2',dataUrl:'data:image/svg+xml;base64,AAAA'}).ok,false);
  assert.equal(s.savePhoto({...photo,id:'photo-2',dataUrl:'data:image/jpeg;base64,'+'A'.repeat(55000)}).ok,false);
  const drawing={version:1,strokes:[{tool:'brush',color:'#ff0000',size:.01,points:[[.1,.2],[.8,.9]]}]};assert.equal(s.saveWallDrawing(drawing).ok,true);assert.equal(s.update({weather:{enabled:true,latitude:31.2,longitude:121.4,locationName:'上海'}}).ok,true);
  const saved=createCompanionStore({adapter}).getState();assert.deepEqual(saved.photos,[photo]);assert.deepEqual(saved.wallDrawing,drawing);assert.equal(saved.weather.locationName,'上海');assert.equal(s.removePhoto('photo-1').ok,true);assert.deepEqual(s.getState().photos,[]);
});

test('multi-language speech picks only local matching voices and reports missing language honestly',()=>{
  const handlers=new Map(),spoken=[],win={speechSynthesis:{getVoices:()=>[{lang:'en-US',localService:true,name:'Local English'},{lang:'ja-JP',localService:false,name:'Remote Japanese'}],speak:u=>spoken.push(u),cancel(){}},SpeechSynthesisUtterance:class{constructor(t){this.text=t;}}},target={addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};
  const v=createPetVoice({win,eventTarget:target});v.configure({enabled:true,muted:false,voiceLanguage:'en-US',voiceStyle:'bright'});handlers.get('pointerdown')({isTrusted:true});assert.equal(v.speakText('How many apples?',{language:'en-US'}).ok,true);assert.equal(spoken[0].lang,'en-US');assert.equal(spoken[0].pitch,1.3);assert.equal(v.speakText('りんごは いくつ？',{language:'ja-JP'}).code,'LOCAL_VOICE_UNAVAILABLE');assert.equal(spoken.length,1);v.dispose();
});
