import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionPanel,memoryCaption} from '../companion-ui.js';

// Minimal browser DOM for form/event behavior. Rendering is verified separately
// in the actual browser; this fixture exercises the public UI with its API.
function fixture(){
  let document;const timers=new Map();let timerId=0;
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.dataset={};this.attrs=new Map();this.listeners=new Map();this.hidden=false;this.value='';this.textContent='';this.className='';this.classList={add:name=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),name])].join(' ');},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ');}};}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);if(this.tagName==='SELECT'&&this.children.length===1)this.value=node.value;}}
    replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
    setAttribute(name,value){this.attrs.set(name,String(value));}
    getAttribute(name){return this.attrs.get(name)??null;}
    addEventListener(name,handler,options={}){const handlers=this.listeners.get(name)||[];handlers.push({handler,options});this.listeners.set(name,handlers);}
    async fire(name,extra={}){for(const{handler,options}of this.listeners.get(name)||[]){if(!options.signal?.aborted)await handler({target:this,preventDefault(){},...extra});}await Promise.resolve();await Promise.resolve();}
    getRootNode(){return document;}
    get isConnected(){return this===document.body||!!this.parentElement?.isConnected;}
    contains(other){return this===other||this.children.some(child=>child.contains(other));}
    matches(selector){if(selector==='[hidden]')return this.hidden;if(selector[0]==='.')return this.className.split(' ').includes(selector.slice(1));const match=selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);if(match){const key=match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return this.dataset[key]===match[2];}return false;}
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const found=child.querySelector(selector);if(found)return found;}return null;}
    getContext(){return {save(){},restore(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},arc(){},stroke(){},fill(){}};}
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}setPointerCapture(){}releasePointerCapture(){}
    focus(){document.activeElement=this;}
  }
  document={defaultView:{AbortController,setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}},createElement:tag=>new Element(tag),listeners:new Map(),addEventListener:Element.prototype.addEventListener};
  document.body=new Element('body');const root=new Element('div');document.body.append(root);root.className='pet-room-view';
  let state={petName:'团团',roomName:'甜甜的小屋',ownerName:'甜甜',sound:{muted:false,volume:'quiet'},outfit:{hat:'none',scarf:'none',backpack:'none'},furnitureStyles:{},memories:{sofa:{at:'2026-10-28T00:00:00Z',by:'甜甜',source:'gift'}},garden:{flowers:2,stage:'小花园'},growth:{days:3,stage:'幼年'},theme:'light',nightMode:true,surprises:true,tourDone:true,rewards:[],collection:{pets:[{sku:'apricot-fox',name:'杏橘狐',owned:true,image:'./assets/pets/previews/apricot-fox.png'}],furniture:[{sku:'sofa',name:'大沙发',owned:true,image:'./assets/products/previews/sofa.png'},{sku:'star-lamp',name:'星灯',owned:false,image:'./assets/products/previews/star-lamp.png'}]},furniture:[{id:'sofa',name:'大沙发'}]};
  const calls=[];const api={getCompanion:()=>({ok:true,companion:structuredClone(state)}),updateCompanion(patch){calls.push(['update',patch]);for(const[key,value]of Object.entries(patch))state[key]=['sound','outfit'].includes(key)?{...state[key],...value}:value;return{ok:true};},setProfileName(name){calls.push(['name',name]);state.ownerName=name;return{ok:true};},customizeFurniture(id,patch){calls.push(['furniture',id,patch]);state.furnitureStyles[id]={...state.furnitureStyles[id],...patch};return{ok:true};},speakPetGreeting(){calls.push(['speak']);return {ok:true,message:'甜甜，你回来啦！'};},redeemSecret(code){calls.push(['secret',code]);return{ok:code==='星光回家',message:code==='星光回家'?'找到星星啦':'口令还没对上呀～'};}};
  const ui=createCompanionPanel({root,api}),all=()=>{const result=[];function walk(el){result.push(el);for(const child of el.children)walk(child);}walk(root);return result;};
  const byLabel=label=>all().find(el=>el.getAttribute('aria-label')===label),byText=text=>all().find(el=>el.textContent===text),byClass=name=>all().filter(el=>el.className.split(' ').includes(name));
  ui.update({ready:true});return {root,document,ui,calls,byLabel,byText,byClass,timers,get state(){return state;},set state(next){state=next;}};
}

test('handbook persists names and nested sound choices through the public API',async()=>{
  const f=fixture();await f.byText('📖 伙伴手册').fire('click');
  for(const[label,value]of[['主人昵称','小雨'],['宠物名字','毛球'],['房间名字','云朵城堡']]){const field=f.byLabel(label);field.value=value;await field.fire('input');}
  await f.byText('把名字记下来').fire('click');
  assert.deepEqual(f.calls.slice(0,2),[['name','小雨'],['update',{petName:'毛球',roomName:'云朵城堡'}]]);
  await f.byClass('companion-mute')[0].fire('click');assert.equal(f.state.sound.muted,true);assert.equal(f.state.sound.volume,'quiet');
  const volume=f.byLabel('音量档位');volume.value='standard';await volume.fire('change');assert.equal(f.state.sound.volume,'standard');assert.equal(f.state.sound.muted,true);
  f.ui.dispose();assert.equal(f.root.children.length,0);
});

test('collection lights owned cells and shows the real furniture memory',async()=>{
  const f=fixture();await f.byText('📖 伙伴手册').fire('click');await f.byText('图鉴册').fire('click');await f.byText('家具图鉴').fire('click');
  const cells=f.byClass('companion-collection-cell');assert.equal(cells.length,2);assert.match(cells[0].className,/owned/);assert.match(cells[1].className,/locked/);
  assert.match(cells[0].children[0].src,/assets\/products\/previews\/sofa\.png$/);await cells[0].fire('click');assert.match(f.byClass('companion-memory')[0].textContent,/甜甜.*2026年10月28日.*礼物/);
  f.ui.dispose();
});

test('handbook has no postcard entry or export action',async()=>{
  const f=fixture();await f.byText('📖 伙伴手册').fire('click');
  assert.ok(f.byText('把名字记下来'),'the names form remains available');
  assert.equal(f.byText('寄一张小屋明信片'),undefined);
  assert.equal(f.byText('📷 留住今天的小屋'),undefined);
  await f.byText('家长设置').fire('click');await f.byText('我们的名字').fire('click');
  assert.equal(f.byText('寄一张小屋明信片'),undefined);
  assert.equal(f.calls.some(([action])=>action==='exportPostcard'),false);
  f.ui.dispose();
});

test('removed learning playground has no tab, question UI or recording controls',async()=>{
  const f=fixture();await f.byText('📖 伙伴手册').fire('click');
  assert.equal(f.byText('学习游乐场'),undefined);
  assert.equal(f.byText('开始录音'),undefined);
  assert.equal(f.byClass('learning-card').length,0);
  assert.ok(f.byLabel('适龄模式'));
  // v2.23：语音朗读设置已移除，欢迎语改为文字气泡；语音控件不再出现。
  assert.equal(f.byLabel('语音喊昵称'),undefined);
  assert.equal(f.byLabel('朗读语言'),undefined);
  assert.equal(f.byLabel('朗读声线'),undefined);
  assert.equal(f.byText('听听伙伴叫我'),undefined);
  assert.ok(f.byText('看看欢迎语'));
  assert.ok(f.byLabel('好朋友进家上限'));
  f.ui.dispose();
});

test('customization sends the selected furniture and every appearance choice',async()=>{
  const f=fixture();f.byLabel('家具颜色').value='#aabbcc';f.byLabel('家具贴纸').value='flower';f.byLabel('家具涂鸦').value='rainbow';f.byLabel('穿上成就皮肤').checked=true;await f.byText('完成我的创作').fire('click');
  assert.deepEqual(f.calls.at(-1),['furniture','sofa',{color:'#aabbcc',sticker:'flower',doodle:'rainbow',achievementSkin:true,skinId:''}]);f.ui.dispose();
});

test('the optional tour can be skipped and never requires completing a room action',async()=>{
  const f=fixture();f.state={...f.state,tourDone:false};f.ui.update({ready:true});for(const fn of [...f.timers.values()])fn();
  assert.equal(f.byClass('companion-tour')[0].hidden,false);await f.byText('先自己玩').fire('click');assert.equal(f.state.tourDone,true);assert.equal(f.byClass('companion-tour')[0].hidden,true);f.ui.dispose();
});

test('memory copy gracefully handles missing dates and unknown memories',()=>{
  assert.equal(memoryCaption(null),'获得时间未记录。');assert.match(memoryCaption({at:'invalid',by:'主人',source:'secret'}),/获得时间未记录.*宝藏/);
  const legacy=memoryCaption({at:null,by:'主人',source:'升级前的收藏，日期未记录'});
  assert.match(legacy,/升级前的收藏/);assert.doesNotMatch(legacy,/1970/);assert.equal(legacy.match(/获得时间未记录/g).length,1);assert.doesNotMatch(legacy,/日期未记录/);
});

test('name field limits match the persistence contract',()=>{
  const f=fixture();assert.equal(f.byLabel('主人昵称').maxLength,40);assert.equal(f.byLabel('宠物名字').maxLength,12);assert.equal(f.byLabel('房间名字').maxLength,18);f.ui.dispose();
});

test('v2.23: 欢迎语只用文字气泡——不再朗读语音，预览走公开问候方法，好友上限可配置并随状态刷新',async()=>{
  const f=fixture();await f.byText('📖 伙伴手册').fire('click');
  assert.ok(f.byText('欢迎语以文字小气泡显示，安静又温柔，不再播放语音朗读。'));
  const preview=f.byText('看看欢迎语');await preview.fire('click');assert.deepEqual(f.calls.at(-1),['speak']);
  const limit=f.byLabel('好朋友进家上限');assert.equal(limit.value,'2','默认好友上限2位');
  limit.value='3';await limit.fire('change');assert.deepEqual(f.calls.at(-1),['update',{homeFriendLimit:3}]);
  f.state={...f.state,homeFriendLimit:1};f.ui.update({ready:true});assert.equal(f.byLabel('好朋友进家上限').value,'1','状态刷新后上限跟随存档');
  await f.byClass('companion-mute')[0].fire('click');assert.equal(f.state.sound.muted,true);
  f.ui.dispose();
});

test('v2.24: 好友白名单——添加走 updateCompanion、标签随存档刷新、可逐个移除',async()=>{
  const f=fixture();f.state={...f.state,friendNames:['小桃子','小石头']};f.ui.update({ready:true});
  await f.byText('📖 伙伴手册').fire('click');
  assert.equal(f.byClass('companion-friend-chip').length,2,'默认名单渲染成标签');
  const input=f.byLabel('好朋友名字');input.value='新朋友';await f.byText('加入名单').fire('click');
  assert.deepEqual(f.calls.at(-1),['update',{friendNames:['小桃子','小石头','新朋友']}],'添加后提交完整新名单');
  assert.equal(f.state.friendNames.length,3);
  // 重复名字：纯逻辑拒绝，不提交。
  const before=f.calls.length;input.value='小桃子';await f.byText('加入名单').fire('click');
  assert.equal(f.calls.length,before,'重复好友不重复提交');
  // 空名单状态提示。
  f.state={...f.state,friendNames:[]};f.ui.update({ready:true});
  const empty=f.byClass('companion-friend-chip')[0];assert.equal(empty.dataset.empty,'true','名单为空显示"暂不接待"');
  // 移除按钮。
  f.state={...f.state,friendNames:['小桃子','小石头']};f.ui.update({ready:true});
  const chips=f.byClass('companion-friend-chip');assert.equal(chips.length,2);
  const remove=chips[0].children.find(el=>el.className.split(' ').includes('companion-friend-remove'));
  await remove.fire('click');
  assert.deepEqual(f.calls.at(-1),['update',{friendNames:['小石头']}],'移除后提交剩余名单');
  f.ui.dispose();
});

test('every achievement skin is listed and locked options stay unavailable',async()=>{
  const f=fixture();f.state={...f.state,skins:[{id:'first-checkin',name:'初次签到纹样',unlocked:true},{id:'streak-7',name:'一周星光纹样',unlocked:false}],growth:{days:7,stage:'少年伙伴',next:{stage:'成年伙伴',daysRequired:30,learningSecondsRequired:7200},tasks:[{id:'days',label:'一起回家',current:7,target:30,done:false}]}};f.ui.update({ready:true});
  const select=f.byLabel('成就专属纹样');assert.equal(select.children.length,3);assert.equal(select.children[1].disabled,false);assert.equal(select.children[2].disabled,true);
  select.value='first-checkin';await f.byText('完成我的创作').fire('click');assert.equal(f.calls.at(-1)[2].skinId,'first-checkin');
  assert.match(f.byClass('companion-growth-task')[0].textContent,/一起回家.*7 \/ 30/);f.ui.dispose();
});

test('the room exposes unsaved drawing state until save or explicit discard, including a closed handbook',async()=>{
  const f=fixture(),paper=f.byLabel('家具手绘画纸'),start=()=>paper.fire('pointerdown',{pointerId:1,button:0,clientX:20,clientY:30}),finish=()=>paper.fire('pointerup',{pointerId:1});
  assert.equal(f.root.dataset.roomDrawingDirty,'false');await f.byText('📖 伙伴手册').fire('click');await start();assert.equal(f.root.dataset.roomDrawingDirty,'true','a stroke in progress also blocks travel');
  await finish();await f.byLabel('关闭伙伴手册').fire('click');assert.equal(f.root.dataset.roomDrawingDirty,'true','closing keeps the draft and its travel guard');
  await f.byText('📖 伙伴手册').fire('click');await f.byText('保存手绘作品').fire('click');assert.equal(f.root.dataset.roomDrawingDirty,'false');
  await start();await finish();assert.equal(f.root.dataset.roomDrawingDirty,'true');await f.byText('放弃未保存手绘').fire('click');assert.equal(f.root.dataset.roomDrawingDirty,'false');
  await start();await finish();f.ui.dispose();assert.equal(f.root.dataset.roomDrawingDirty,undefined,'disposing cleans the host marker');
});
