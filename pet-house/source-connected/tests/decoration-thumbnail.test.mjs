import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripPreviewSource} from '../strip-thumb.mjs';

// Execute the actual DOM render function with a tiny DOM double. No browser or source-token assertion.
const moduleURL=new URL('../decoration.js',import.meta.url);
const source=readFileSync(moduleURL,'utf8'),start=source.indexOf('  function setStripMark('),end=source.indexOf('  function editCollider()',start);
const renderSource=source.slice(start,end).replaceAll('import.meta.url','moduleURL');
function setup(){
  const mark={dataset:{},children:[],textContent:'',replaceChildren(...nodes){this.children=nodes;},append(img){this.children.push(img);}};
  const doc={createElement:tag=>({tagName:tag,listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);}})};
  const card={querySelector:selector=>selector==='.storage-strip__mark'?mark:null};
  const render=new Function('doc','stripPreviewSource','moduleURL',`${renderSource};return setStripMark;`)(doc,stripPreviewSource,moduleURL.href);
  return {mark,card,render};
}

test('decoration thumbnail assigns a real module-relative URL, alt, and only creates it once',()=>{
  const f=setup(),item={id:'sofa',name:'大沙发'};f.render(f.card,item);assert.equal(f.mark.children.length,1);const img=f.mark.children[0];
  assert.equal(img.src,new URL('../assets/products/previews/sofa.png',import.meta.url).href);assert.equal(img.alt,'大沙发');assert.equal(img.draggable,false);
  f.render(f.card,item);assert.equal(f.mark.children[0],img,'刷新家具栏无需反复创建图片');
});

test('failed furniture thumbnail falls back once while unknown furniture keeps a labelled emoji',()=>{
  const f=setup();f.render(f.card,{sku:'table',name:'书桌'});f.mark.children[0].listeners.get('error')();assert.equal(f.mark.textContent,'📦');assert.equal(f.mark.children.length,0);f.render(f.card,{sku:'table',name:'书桌'});assert.equal(f.mark.children.length,0);
  const unknown=setup();unknown.render(unknown.card,{id:'custom-lamp',name:'小台灯'});assert.equal(unknown.mark.textContent,'💡');assert.equal(unknown.mark.children.length,0);
});
