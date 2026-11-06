import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionTutorial} from '../companion-tutorial.js';

function fixture(){
  let doc,id=0,tourDone=false;const timers=new Map(),calls=[];
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.hidden=false;this.listeners=new Map();this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};}
    append(node){node.parentElement=this;this.children.push(node);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
    setAttribute(name,value){this[name]=value;}addEventListener(type,fn,options={}){const list=this.listeners.get(type)||[];list.push({fn,options});this.listeners.set(type,list);}
    emit(type,detail){for(const {fn,options}of this.listeners.get(type)||[])if(!options.signal?.aborted)fn({type,detail});}
    querySelector(selector){return controls.get(selector)||null;}closest(selector){return selector==='[hidden]'&&this.hidden?this:this.parentElement?.closest(selector)||null;}
    getBoundingClientRect(){return this.rect||{left:0,top:0,width:800,height:600};}
  }
  const win={AbortController,setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),addEventListener(){}};
  doc={defaultView:win,createElement:tag=>new Element(tag)};const root=new Element('div'),controls=new Map();
  for(const [name,left,top]of [['decorate',700,20],['storage-strip',0,450],['room',0,0],['rotate-furniture',150,160],['finish-decoration',200,350]]){const node=new Element('button');node.rect={left,top,width:100,height:40};controls.set(`[data-room-control="${name}"]`,node);root.append(node);}
  const api={getCompanion:()=>({companion:{tourDone}}),updateCompanion(patch){calls.push(patch);tourDone=patch.tourDone;return {ok:true};}};
  const tutorial=createCompanionTutorial({root,api}),guide=root.children.find(node=>node.className?.includes('companion-tour ')),pet=root.children.find(node=>node.className==='companion-practice-pet');
  const emit=(type,detail)=>root.emit('pet-room-interaction',{type,detail});
  return {root,tutorial,guide,pet,calls,controls,emit,runTimers(){for(const fn of [...timers.values()])fn();timers.clear();}};
}

test('tutorial requires actual enter, successful drag, rotation and saved finish in order',()=>{
  const f=fixture();f.tutorial.update({ready:true});f.runTimers();assert.equal(f.guide.dataset.step,'0');
  assert.ok(!f.guide.children.some(node=>node.textContent==='下一步'),'there is no click-through bypass');
  f.emit('furniture-rotated',{id:'table'});assert.equal(f.guide.dataset.step,'0');
  f.emit('decoration-mode',{active:true});assert.equal(f.guide.dataset.step,'1');
  f.emit('furniture-selected',{id:'table'});f.emit('layout-change',{});assert.equal(f.guide.dataset.step,'1');
  f.emit('furniture-landed',{id:'table',source:'drag'});assert.equal(f.guide.dataset.step,'2');
  f.emit('furniture-rotated',{id:'table',source:'gesture'});assert.equal(f.guide.dataset.step,'3');
  f.emit('decoration-mode',{active:false,saved:true});assert.equal(f.guide.hidden,true);assert.deepEqual(f.calls,[{tourDone:true}]);f.tutorial.dispose();
});

test('pet moves near current target, pauses for the handbook and reset follows canceled decoration',()=>{
  const f=fixture();f.tutorial.update({ready:true});f.tutorial.start();const first=f.pet.style.transform;
  f.emit('decoration-mode',{active:true});assert.notEqual(f.pet.style.transform,first);const second=f.pet.style.transform;
  f.emit('furniture-selected',{id:'table'});assert.notEqual(f.pet.style.transform,second);
  f.tutorial.pause();assert.equal(f.pet.hidden,true);assert.equal(f.guide.hidden,true);f.tutorial.resume();assert.equal(f.pet.hidden,false);
  f.emit('decoration-mode',{active:false,saved:false});assert.equal(f.guide.dataset.step,'0');assert.equal(f.calls.length,0);
  f.tutorial.dispose();f.emit('decoration-mode',{active:true});assert.equal(f.calls.length,0);
});

test('skipping is always possible, replay starts a fresh practice and disposed timers cannot revive it',()=>{
  const f=fixture();f.tutorial.update({ready:true});f.runTimers();const skip=f.guide.children[0].children.find(n=>n.className==='companion-tour-actions').children[0];
  skip.emit('click');assert.equal(f.guide.hidden,true);assert.equal(f.calls.length,1);
  f.tutorial.start();assert.equal(f.guide.hidden,false);assert.equal(f.guide.dataset.step,'0');f.emit('decoration-mode',{active:true});f.emit('furniture-landed',{id:'table',source:'dock-drag'});assert.equal(f.guide.dataset.step,'2');
  f.tutorial.dispose();f.runTimers();assert.equal(f.root.children.some(n=>n.className==='companion-practice-pet'),false);
});
