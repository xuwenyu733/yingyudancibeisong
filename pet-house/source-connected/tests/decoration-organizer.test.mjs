import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecoration} from '../decoration.js';
import * as THREE from '../vendor/three/three.module.js';

async function fixture({operationResult={ok:true},pending=false}={}){
  const nodes=new Map(),calls=[],timers=new Set();let editing=false,allowSave=true,resolveOperation;
  class Element{
    constructor(){this.dataset={};this.style={};this.attrs=new Map();this.handlers=new Map();this.hidden=false;this.disabled=false;this.value='';this.checked=false;}
    getAttribute(key){return this.attrs.get(key)??null;}setAttribute(key,value){this.attrs.set(key,String(value));}removeAttribute(key){this.attrs.delete(key);}
    addEventListener(type,handler,options={}){this.handlers.set(type,{handler,options});}
    querySelectorAll(){return [];}focus(){}contains(){return false;}
    async fire(type){const binding=this.handlers.get(type);if(!binding?.options.signal?.aborted)return await binding?.handler({preventDefault(){},target:this});}
  }
  const names=['decorate','decoration-panel','edit-feedback','selected-name','rotate-furniture','collider-settings','snap-grid','finish-decoration','cancel-decoration','box-blocks-navigation','box-blocks-placement','decoration-organizer','collect-all-furniture','reset-room-layout','organizer-confirm','organizer-confirm-title','organizer-confirm-copy','organizer-confirm-yes','organizer-confirm-cancel'];
  for(const kind of ['size','center'])for(const axis of ['x','y','z'])names.push(`box-${kind}-${axis}`);
  for(const name of names)nodes.set(name,new Element());nodes.get('organizer-confirm').hidden=true;
  const win={AbortController,setTimeout(fn,delay){const id=setTimeout(()=>{timers.delete(id);fn();},delay);timers.add(id);return id;},clearTimeout(id){clearTimeout(id);timers.delete(id);},addEventListener(){}};
  const doc={defaultView:win,createElement:()=>new Element()},canvas=new Element();canvas.ownerDocument=doc;
  const uiRoot=new Element();uiRoot.querySelector=selector=>nodes.get(selector.match(/"([^"]+)"/)?.[1])||null;
  const manager={definitions:{},snapshot:()=>({version:3,furniture:{},definitions:{},lampSupport:null}),beginEdit(){calls.push('begin');if(editing)return false;editing=true;return true;},finishEdit({save}){calls.push(save?'save':'cancel');if(save&&!allowSave)return false;editing=false;return true;},validate:()=>({valid:true}),restore:()=>true};
  const operation=action=>async()=>{assert.equal(editing,false,'account operation must run after the edit transaction closes');calls.push(action);if(pending)await new Promise(resolve=>{resolveOperation=resolve;});if(operationResult instanceof Error)throw operationResult;return operationResult;};
  const decoration=createDecoration({canvas,uiRoot,scene:new THREE.Scene(),camera:new THREE.Camera(),furniture:new Map(),manager,prepare:()=>true,onCollectAll:operation('collect'),onResetLayout:operation('reset')});
  await decoration.enter();return {decoration,nodes,calls,get editing(){return editing;},set allowSave(value){allowSave=value;},resolve:()=>resolveOperation?.(),close(){decoration.dispose();for(const id of timers)clearTimeout(id);}};
}

test('decoration organizer confirms or cancels collection and reopens from a fresh edit snapshot',async()=>{
  const f=await fixture();assert.equal(f.nodes.get('decoration-organizer').hidden,false);
  await f.nodes.get('collect-all-furniture').fire('click');assert.equal(f.nodes.get('organizer-confirm').hidden,false);assert.deepEqual(f.calls,['begin']);
  await f.nodes.get('organizer-confirm-cancel').fire('click');assert.equal(f.nodes.get('organizer-confirm').hidden,true);assert.deepEqual(f.calls,['begin']);
  await f.nodes.get('collect-all-furniture').fire('click');await f.nodes.get('organizer-confirm-yes').fire('click');
  assert.deepEqual(f.calls,['begin','save','collect','begin']);assert.equal(f.decoration.active,true);assert.equal(f.editing,true);assert.equal(f.nodes.get('organizer-confirm').hidden,true);f.close();
});

test('reset runs only after successful save and a save failure leaves the current session open',async()=>{
  const f=await fixture();f.allowSave=false;await f.nodes.get('reset-room-layout').fire('click');await f.nodes.get('organizer-confirm-yes').fire('click');
  assert.deepEqual(f.calls,['begin','save']);assert.equal(f.decoration.active,true);assert.equal(f.editing,true);
  f.allowSave=true;await f.nodes.get('organizer-confirm-yes').fire('click');assert.deepEqual(f.calls,['begin','save','save','reset','begin']);f.close();
});

test('failed collection preserves the ability to edit and shows the account error',async()=>{
  const f=await fixture({operationResult:{ok:false,message:'本机空间不足，家具保持原位'}});await f.nodes.get('collect-all-furniture').fire('click');await f.nodes.get('organizer-confirm-yes').fire('click');
  assert.equal(f.decoration.active,true);assert.equal(f.editing,true);assert.match(f.nodes.get('edit-feedback').textContent,/空间不足/);assert.deepEqual(f.calls,['begin','save','collect','begin']);f.close();
});

test('an in-flight organizer operation blocks duplicate actions and disposal prevents reopening',async()=>{
  const f=await fixture({pending:true});await f.nodes.get('reset-room-layout').fire('click');const pending=f.nodes.get('organizer-confirm-yes').fire('click');
  await Promise.resolve();assert.equal(f.decoration.busy,true);assert.equal(await f.decoration.enter(),false);await f.nodes.get('organizer-confirm-yes').fire('click');assert.deepEqual(f.calls,['begin','save','reset']);
  f.close();f.resolve();await pending;assert.deepEqual(f.calls,['begin','save','reset']);assert.equal(f.decoration.active,false);
});
