import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionFx} from '../companion-fx.js';

function fixture(reducedMotion=false){
  let id=0;const timers=new Map(),sounds=[];
  const doc={defaultView:{setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(key){timers.delete(key);}}};
  doc.createElement=tag=>({tagName:tag,children:[],hidden:false,style:{setProperty(){}},dataset:{},attributes:{},parent:null,
    setAttribute(k,v){this.attributes[k]=v;},append(...nodes){for(const child of nodes){child.parent=this;this.children.push(child);}},
    replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.append(...nodes);},
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;},
  });
  const root=doc.createElement('div'),fx=createCompanionFx({root,doc,getOwner:()=>'<甜甜>',onSound:name=>sounds.push(name),reducedMotion});return {root,fx,timers,sounds};
}

test('bubbles use owner text and timers are replaced and cleared on dispose',()=>{
  const f=fixture(),bubble=f.root.children[0];f.fx.say('{owner}，你回来啦！');assert.equal(bubble.textContent,'<甜甜>，你回来啦！');assert.equal(bubble.hidden,false);assert.equal(f.timers.size,1);
  f.fx.say('拍拍爪子～');assert.equal(f.timers.size,1);const [{fn}]=f.timers.values();fn();assert.equal(bubble.hidden,true);f.fx.dispose();assert.equal(f.root.children.length,0);assert.equal(f.timers.size,0);
});

test('badge confetti is non-blocking and repeated celebrations replace, then remove, their content',()=>{
  const f=fixture(),overlay=f.root.children[1];f.fx.celebrate({name:'第一件家具'});assert.equal(overlay.style.pointerEvents,'none');assert.equal(overlay.children.length,43);assert.deepEqual(f.sounds,['badge']);
  f.fx.celebrate({kind:'checkin',name:'连续3天'});assert.equal(overlay.children.length,43);assert.equal(f.timers.size,1);const [{fn,ms}]=f.timers.values();assert.equal(ms,3200,'同次签到不能把新徽章的庆祝提前覆盖');assert.equal(overlay.dataset.kind,'badge');fn();assert.equal(overlay.hidden,true);assert.equal(overlay.children.length,0);f.fx.celebrate({kind:'checkin',name:'连续3天'});assert.equal([...f.timers.values()].at(-1).ms,1800);f.fx.dispose();assert.equal(f.timers.size,0);
});

test('reduced motion keeps the badge announcement without moving confetti',()=>{
  const f=fixture(true);f.fx.celebrate({name:'小小学者'});assert.equal(f.root.children[1].children.length,1);assert.equal(f.root.children[1].hidden,false);f.fx.dispose();
});
