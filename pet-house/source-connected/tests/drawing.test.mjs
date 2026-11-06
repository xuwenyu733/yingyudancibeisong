import test from 'node:test';
import assert from 'node:assert/strict';
import {DRAWING_LIMITS,validateFurnitureDrawing,drawFurnitureDrawing,createDrawingHistory} from '../drawing.mjs';
import {createFurnitureDrawingEditor} from '../drawing-editor.js';
import {createCompanionStore,defaultCompanion,validateCompanion} from '../companion-state.mjs';
import {createEstateStore} from '../estate-state.mjs';
import {createProfile} from '../profile.mjs';
import {createEconomy} from '../economy.mjs';
import {exportArchive,restoreArchive} from '../archive.mjs';

const mark=(tool='brush',points=[[.1,.2],[.8,.7]])=>({tool,color:'#EA98BA',size:.03,points});
const drawing=()=>({version:1,strokes:[mark(),mark('eraser',[[.4,.4]])]});
const memory=()=>({values:new Map(),blocked:false,getItem(key){return this.values.get(key)??null;},setItem(key,value){if(this.blocked)throw Error('quota');this.values.set(key,value);},removeItem(key){this.values.delete(key);}});
test('drawings preserve editable normalized strokes, reject unsafe content, and never mutate a bad draft',()=>{
  const before=drawing(),normalized=validateFurnitureDrawing(before);assert.equal(normalized.strokes[0].color,'#ea98ba');assert.equal(before.strokes[0].color,'#EA98BA');
  assert.equal(validateFurnitureDrawing({version:1,strokes:[mark('brush',[[.123456,.987654]])]}).strokes[0].points[0][0],.1235);
  for(const bad of [{version:2,strokes:[]},{...before,other:1},{version:1,strokes:[{...mark(),size:Infinity}]},{version:1,strokes:[mark('brush',[[NaN,.2]])]},{version:1,strokes:[mark('brush',[[1.1,.2]])]},{version:1,strokes:[{...mark(),color:'url(x)'}]},{version:1,strokes:[mark('execute')]},{version:1,strokes:Array.from({length:65},()=>mark())},{version:1,strokes:[mark('brush',Array.from({length:DRAWING_LIMITS.points+1},()=>[.2,.3]))]}])assert.throws(()=>validateFurnitureDrawing(bad));
  let touched=false;const getter={version:1};Object.defineProperty(getter,'strokes',{enumerable:true,get(){touched=true;return [];}});assert.throws(()=>validateFurnitureDrawing(getter));assert.equal(touched,false);
  const history=createDrawingHistory(before),snapshot=history.value;assert.throws(()=>history.push(mark('brush',[[Infinity,.2]])));assert.deepEqual(history.value,snapshot);
});
test('eraser actually punches transparency and every rendered stroke restores canvas state',()=>{
  const operations=[],ctx={save(){operations.push('save');},restore(){operations.push('restore');},clearRect(){operations.push('clear');},beginPath(){},moveTo(){},lineTo(){},arc(){},stroke(){operations.push(this.globalCompositeOperation);},fill(){operations.push(this.globalCompositeOperation);}};
  assert.equal(drawFurnitureDrawing(ctx,drawing(),512,320),true);assert.deepEqual(operations,['save','clear','source-over','destination-out','restore']);assert.equal(ctx.lineWidth,.03*320);
});
test('undo, redo and clear preserve stroke order, while a new stroke ends the redo branch',()=>{
  const history=createDrawingHistory();history.push(mark());history.push(mark('eraser'));assert.equal(history.value.strokes.length,2);
  history.undo();assert.equal(history.value.strokes.length,1);history.redo();assert.equal(history.value.strokes.length,2);
  history.clear();assert.equal(history.value.strokes.length,0);history.undo();assert.equal(history.value.strokes.length,2);
  history.undo();history.push(mark('brush',[[.6,.7]]));assert.equal(history.canRedo,false);
  const copy=history.value;copy.strokes[0].points[0][0]=999;assert.notEqual(history.value.strokes[0].points[0][0],999);
});
test('drawing, achievement skin and opt-in voice survive storage and reject a failed replacement',()=>{
  const adapter=memory(),store=createCompanionStore({adapter,key:'art'});assert.equal(store.getState().voiceEnabled,false);
  assert.equal(store.update({voiceEnabled:true}).ok,true);assert.equal(store.customize('shop-gift-star-long-history',{drawing:drawing(),skinId:'first-checkin'}).ok,true);
  const mounted=createCompanionStore({adapter,key:'art'});assert.equal(mounted.getState().voiceEnabled,true);assert.deepEqual(mounted.getState().furnitureStyles['shop-gift-star-long-history'].drawing,validateFurnitureDrawing(drawing()));
  adapter.blocked=true;assert.equal(mounted.customize('shop-gift-star-long-history',{drawing:null}).ok,false);assert.ok(mounted.getState().furnitureStyles['shop-gift-star-long-history'].drawing);
  assert.throws(()=>validateCompanion({...defaultCompanion(),voiceEnabled:'yes'}));assert.equal(store.customize('sofa',{skinId:'imaginary-badge'}).ok,false);
});
test('editable drawings round trip through full archives and stay specific to each estate floor',()=>{
  const adapter=memory(),companion=createCompanionStore();companion.customize('sofa',{drawing:drawing()});companion.update({voiceEnabled:true});
  const archive=exportArchive({profile:createProfile({storageAdapter:null}).getState(),economy:createEconomy({storageAdapter:null}).getState(),meta:{companion:companion.getState()}});
  assert.equal(restoreArchive({json:archive,storageAdapter:adapter,storageKey:'saved'}).ok,true);
  assert.deepEqual(createCompanionStore({adapter,key:'saved-companion-v1'}).getState().furnitureStyles.sofa.drawing,validateFurnitureDrawing(drawing()));
  const estate=createEstateStore({storageAdapter:adapter,storageKey:'art-floors',initialPoints:600}),first=createCompanionStore({adapter:estate.storageForRoom('room-1'),key:'art-floors-companion-v1'});
  assert.equal(first.customize('sofa',{drawing:drawing()}).ok,true);const created=estate.createRoom({name:'第二层',template:'mint'});assert.equal(created.ok,true);
  const second=createCompanionStore({adapter:estate.storageForRoom(created.room.id),key:'art-floors-companion-v1'});assert.equal(second.getState().furnitureStyles.sofa,undefined);
  const saved=estate.exportArchive();assert.equal(saved.ok,true);assert.equal(estate.importArchive(saved.archive).ok,true);
  assert.deepEqual(createCompanionStore({adapter:estate.storageForRoom('room-1'),key:'art-floors-companion-v1'}).getState().furnitureStyles.sofa.drawing,validateFurnitureDrawing(drawing()));
});

function editorFixture(){
  let doc;const captures=[],copies=[],calls=[];const ctx={save(){},restore(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},arc(){},stroke(){copies.push('stroke');},fill(){copies.push('dot');}};
  class Element{
    constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs=new Map();this.listeners=new Map();this.value='';}
    append(node){this.children.push(node);node.parent=this;}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}setAttribute(name,value){this.attrs.set(name,value);}getAttribute(name){return this.attrs.get(name);}
    addEventListener(type,handler,options={}){const list=this.listeners.get(type)||[];list.push({handler,options});this.listeners.set(type,list);}
    async fire(type,extra={}){let prevented=false;for(const{handler,options}of this.listeners.get(type)||[])if(!options.signal?.aborted)await handler({pointerId:1,button:0,clientX:10,clientY:20,preventDefault(){prevented=true;},...extra});return prevented;}
    getContext(){return ctx;}getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}setPointerCapture(id){captures.push(['capture',id]);}releasePointerCapture(id){captures.push(['release',id]);}
  }
  doc={defaultView:{AbortController},createElement:tag=>new Element(tag)};const root=new Element('div');let fail=false;
  const editor=createFurnitureDrawingEditor({root,onSave:async(id,value)=>{calls.push({id,value});return fail?{ok:false,message:'存储已满'}:{ok:true};}});
  const all=()=>{const values=[];const visit=node=>{values.push(node);node.children.forEach(visit);};visit(root);return values;},text=name=>all().find(n=>n.textContent===name),label=name=>all().find(n=>n.attrs.get('aria-label')===name),paper=label('家具手绘画纸');editor.setTarget('sofa','大沙发',null);
  return {editor,root,captures,copies,calls,text,label,paper,get fail(){return fail;},set fail(value){fail=value;}};
}
test('pointer drawing supports touch capture, eraser, undo/redo and explicit save without losing a switched draft',async()=>{
  const f=editorFixture();assert.equal(await f.paper.fire('pointerdown'),true);await f.paper.fire('pointermove',{clientX:70,clientY:80});await f.paper.fire('pointerup');
  assert.equal(f.editor.dirty,true);assert.deepEqual(f.captures,[['capture',1],['release',1]]);assert.equal(f.editor.setTarget('table','小桌',null),false);assert.equal(f.editor.targetId,'sofa');
  await f.text('橡皮').fire('click');await f.paper.fire('pointerdown',{clientX:30,clientY:40});await f.paper.fire('pointerup');await f.text('撤销一笔').fire('click');await f.text('重做一笔').fire('click');
  assert.equal(await f.editor.save(),true);assert.equal(f.calls[0].id,'sofa');assert.equal(f.calls[0].value.strokes.length,2);assert.equal(f.calls[0].value.strokes[1].tool,'eraser');assert.equal(f.editor.dirty,false);
  assert.equal(f.editor.setTarget('table','小桌',null),true);assert.equal(f.text('撤销一笔').disabled,true,'undo cannot recall another furniture draft');f.editor.dispose();assert.equal(f.root.children.length,0);
});
test('failed saves preserve a draft; cancel, discard and concurrent pointers do not add unwanted marks',async()=>{
  const f=editorFixture();await f.paper.fire('pointerdown');await f.paper.fire('pointermove',{pointerId:2,clientX:50});await f.paper.fire('pointercancel');assert.equal(f.editor.dirty,false);
  await f.paper.fire('pointerdown');await f.paper.fire('pointerup');f.fail=true;assert.equal(await f.editor.save(),false);assert.equal(f.editor.dirty,true);assert.equal(f.editor.setTarget('table','小桌',null),false);
  await f.text('放弃未保存手绘').fire('click');assert.equal(f.editor.dirty,false);assert.equal(f.editor.setTarget('table','小桌',null),true);f.editor.dispose();
});
