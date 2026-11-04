import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstatePanel} from '../estate-ui.js';

function fixture(){
  let document;const downloads=[];
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.dataset={};this.attrs=new Map();this.listeners=new Map();this.hidden=false;this.value='';this.textContent='';this.className='';}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
    replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    setAttribute(name,value){this.attrs.set(name,String(value));}
    getAttribute(name){return this.attrs.get(name)??null;}
    addEventListener(name,handler,options={}){const list=this.listeners.get(name)||[];list.push({handler,options});this.listeners.set(name,list);}
    async fire(name,extra={}){for(const{handler,options}of this.listeners.get(name)||[]){if(!options.signal?.aborted)await handler({type:name,target:this,preventDefault(){},...extra});}await Promise.resolve();await Promise.resolve();await Promise.resolve();}
    focus(){document.activeElement=this;}
    click(){if(this.tagName==='A')downloads.push({href:this.href,name:this.download});else return this.fire('click');}
    contains(other){return other===this||this.children.some(node=>node.contains(other));}
    getRootNode(){return document;}
    get isConnected(){return this===document.body||!!this.parentElement?.isConnected;}
  }
  document={defaultView:{AbortController,Blob,URL:{createObjectURL:()=> 'blob:test-world',revokeObjectURL(){}}},listeners:new Map(),addEventListener:Element.prototype.addEventListener,createElement:tag=>new Element(tag)};
  document.body=new Element('body');const root=new Element('div');document.body.append(root);
  let state={activeRoomId:'a',mode:'courtyard',rooms:[{id:'a',name:'奶油的家',template:'cream',floor:0,createdAt:'2026-10-28'},{id:'b',name:'薄荷的家',template:'mint',floor:1,createdAt:'2026-10-28'}],balance:1234,music:{title:'小花与微风',locked:true,enabled:true,volume:'quiet'}};
  const calls=[];let selectWait=null;
  const api={getEstate:()=>({ok:true,estate:structuredClone(state)}),async createEstateRoom(input){calls.push(['create',input]);state.rooms.push({id:'new',name:input.name||'新楼层',template:input.template,floor:Math.max(...state.rooms.map(room=>room.floor))+1});return{ok:true};},async selectEstateRoom(id){calls.push(['select',id]);if(selectWait)await selectWait;state.activeRoomId=id;return{ok:true};},async collectAllFurniture(){calls.push(['collect']);return{ok:true};},async resetRoomLayout(){calls.push(['reset']);return{ok:true};}};
  const ui=createEstatePanel({root,api}),all=()=>{const list=[];function walk(el){list.push(el);for(const child of el.children)walk(child);}walk(root);return list;};
  const byText=text=>all().find(node=>node.textContent===text),byLabel=text=>all().find(node=>node.getAttribute('aria-label')===text),byClass=name=>all().filter(node=>node.className.split(' ').includes(name)),byRoom=id=>all().find(node=>node.dataset.estateRoom===id);
  ui.update({ready:true});return{root,document,api,ui,calls,downloads,byText,byLabel,byClass,byRoom,all,get state(){return state;},set state(value){state=value;},setSelectWait(value){selectWait=value;}};
}

test('estate UI shows shared points, independent floors and locked music without mode or stacking controls',()=>{
  const f=fixture();assert.ok(f.byText('共享积分 · 1,234'));assert.equal(f.byRoom('a').getAttribute('aria-current'),'page');assert.equal(f.byRoom('b').dataset.template,'mint');assert.ok(f.byText('所有楼层共用积分与收藏，每层独立摆放。'));assert.ok(f.byText('♫ 设计者精选 · 曲目已锁定'));assert.ok(f.byText('小花与微风'));assert.equal(f.all().filter(node=>node.tagName==='SELECT'||node.type==='checkbox').length,0);assert.equal(f.all().some(node=>/小院|平铺/.test(node.textContent)),false);f.ui.dispose();assert.equal(f.root.children.length,0);
});

test('creating the next floor submits only the trimmed name and theme; UI shows the expansion cost without spending points',async()=>{
  const f=fixture();f.state.rooms=f.state.rooms.slice(0,1);f.ui.update({ready:true});f.byLabel('新楼层名字').value='  糖果天空  ';await f.byLabel('糖果城堡').fire('click');
  // v2.23：已有 2 层时，下一次扩建（第3层）需 600 积分，按钮展示费用。
  assert.ok(f.byText('扩建二楼（600 积分）'));
  assert.ok(f.byText('一楼扩建二楼需 600 积分 · 最高 2 层'));
  await f.byText('扩建二楼（600 积分）').fire('click');assert.deepEqual(f.calls,[['create',{name:'糖果天空',template:'candy'}]]);assert.equal(f.state.balance,1234);assert.equal(f.state.rooms.length,2);assert.equal(f.state.rooms[1].floor,1);assert.equal(f.byLabel('新楼层名字').value,'');assert.deepEqual(f.byClass('estate-floor-button').map(button=>button.textContent),['2 楼','1 楼']);assert.ok(f.byText('城堡楼层 · 2 / 2 层'));f.ui.dispose();
});

test('只有一层时展示600积分费用，点击后创建二楼',async()=>{
  const f=fixture();f.state={...f.state,rooms:[{id:'a',name:'奶油的家',template:'cream',floor:0,createdAt:'2026-10-28'}]};f.ui.update({ready:true});
  assert.ok(f.byText('扩建二楼（600 积分）'));assert.ok(f.byText('一楼扩建二楼需 600 积分 · 最高 2 层'));
  await f.byText('扩建二楼（600 积分）').fire('click');assert.deepEqual(f.calls,[['create',{template:'cream'}]]);f.ui.dispose();
});

test('legacy extra floors cannot create another floor even with programmatic clicks',async()=>{
  const f=fixture();f.state={...f.state,rooms:Array.from({length:4},(_,i)=>({id:String(i),name:`楼层${i}`,template:'cream',floor:i}))};f.ui.update({ready:true});const button=f.byText('二楼已建成');assert.equal(button.disabled,true);await button.fire('click');assert.equal(f.calls.length,0);assert.match(f.byClass('estate-status')[0].textContent,/最高两层/);assert.ok(f.byText('城堡楼层 · 4 层（旧版保留）'));f.ui.dispose();
});

test('even a legacy courtyard state always renders one room per tower floor and buttons switch floors',async()=>{
  const f=fixture();assert.equal(f.state.mode,'courtyard');assert.equal(f.byClass('estate-castle').length,1);assert.deepEqual(f.byClass('estate-floor-button').map(button=>button.textContent),['2 楼','1 楼']);assert.equal(f.byClass('estate-floor').length,f.state.rooms.length);assert.ok(f.byClass('estate-floor-rooms').every(row=>row.children.length===1));await f.byLabel('前往 2 楼，薄荷的家').fire('click');assert.deepEqual(f.calls,[['select','b']]);assert.equal(f.state.activeRoomId,'b');assert.equal(f.byLabel('前往 2 楼，薄荷的家').getAttribute('aria-current'),'step');f.ui.dispose();
});

test('floor management keeps travel and expansion while organizer actions live in decoration',()=>{
  const f=fixture();assert.equal(f.byText('帮这一层整理一下'),undefined);assert.equal(f.byText('一键全收进仓库'),undefined);assert.equal(f.byText('恢复默认布局'),undefined);assert.equal(f.byClass('estate-confirm').length,0);assert.ok(f.byText('二楼已建成'));assert.ok(f.byRoom('b'));f.ui.dispose();
});

test('pending room selection rejects duplicate operations and disposal tolerates completion',async()=>{
  const f=fixture();let finish;f.setSelectWait(new Promise(resolve=>{finish=resolve;}));await f.byRoom('b').fire('click');assert.equal(f.byRoom('b').disabled,true);await f.byRoom('b').fire('click');assert.equal(f.calls.length,1);f.ui.dispose();finish();await Promise.resolve();await Promise.resolve();assert.equal(f.root.children.length,0);
});


test('an empty optional floor name uses the store default instead of submitting an invalid blank name',async()=>{
  const f=fixture();f.state.rooms=f.state.rooms.slice(0,1);f.ui.update({ready:true});f.byLabel('新楼层名字').value='  ';await f.byText('扩建二楼（600 积分）').fire('click');
  assert.deepEqual(f.calls,[['create',{template:'cream'}]]);assert.equal(f.state.rooms.length,2);f.ui.dispose();
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function worldsFixture(){
  const f=fixture(),saves=new Map([['a',[{id:'save-a',roomId:'a',name:'花园午后',createdAt:'2026-10-30T03:10:00Z'}]],['b',[{id:'save-b',roomId:'b',name:'薄荷书房',createdAt:'2026-10-30T04:20:00Z'}]]]);
  for(const room of f.state.rooms)room.world={revision:3,updatedAt:'2026-10-30T05:30:00Z',checkpointCount:saves.get(room.id).length};
  Object.assign(f.api,{
    listRoomWorldSaves(id){return{ok:true,roomId:id,revision:3,updatedAt:'2026-10-30T05:30:00Z',saves:structuredClone(saves.get(id)||[])};},
    async saveRoomWorld(id,input){f.calls.push(['world-save',id,input]);const list=saves.get(id);list.unshift({id:'save-new',roomId:id,name:input.name||'存档点 2',createdAt:'2026-10-30T06:00:00Z'});f.state.rooms.find(room=>room.id===id).world.checkpointCount=list.length;return{ok:true};},
    async restoreRoomWorld(id,saveId){f.calls.push(['world-restore',id,saveId]);return{ok:true};},
    async removeRoomWorldSave(id,saveId){f.calls.push(['world-remove',id,saveId]);saves.set(id,saves.get(id).filter(save=>save.id!==saveId));f.state.rooms.find(room=>room.id===id).world.checkpointCount=saves.get(id).length;return{ok:true};},
    async exportRoomWorld(id){f.calls.push(['world-export',id]);return{ok:true,archive:{format:'pet-room-world',roomId:id,snapshot:{name:'test'}}};},
    async importRoomWorld(id,json){f.calls.push(['world-import',id,json]);return{ok:true};},
  });
  f.ui.update({ready:true});return{...f,saves};
}

test('each floor shows its automatic save revision and only its own named checkpoints',async()=>{
  const f=worldsFixture();f.ui.open();await settle();
  assert.ok(f.byText('1 楼 · 奶油的家 的小世界'));
  assert.match(f.byClass('estate-world-state')[0].textContent,/已自动保存.*第 3 版/);
  assert.ok(f.byText('花园午后'));assert.equal(f.byText('薄荷书房'),undefined);
  await f.byRoom('b').fire('click');await settle();
  assert.ok(f.byText('2 楼 · 薄荷的家 的小世界'));assert.ok(f.byText('薄荷书房'));assert.equal(f.byText('花园午后'),undefined);
  f.ui.dispose();
});

test('saving a named floor checkpoint uses the current floor and keeps shared points',async()=>{
  const f=worldsFixture();f.ui.open();await settle();f.byLabel('这一层的存档点名字').value='  冬日书房  ';
  await f.byText('保存此层').fire('click');await settle();
  assert.deepEqual(f.calls,[['world-save','a',{name:'冬日书房'}]]);assert.equal(f.state.balance,1234);
  assert.ok(f.byText('冬日书房'));assert.equal(f.byLabel('这一层的存档点名字').value,'');
  assert.equal(f.byClass('estate-world-save').length,2);f.ui.dispose();
});

test('new decoration first confirms a backup and submits the selected room name and style without adding a floor',async()=>{
  const f=worldsFixture();f.api.createRoomWorld=async(id,input)=>{f.calls.push(['world-new',id,input]);const room=f.state.rooms.find(item=>item.id===id);f.saves.get(id).push({id:'before-new',roomId:id,name:input.backupName,createdAt:'2026-10-30T07:00:00Z'});room.name=input.name;room.template=input.template;room.world.checkpointCount=f.saves.get(id).length;return{ok:true};};
  f.ui.open();await settle();f.byLabel('这一层的存档点名字').value='旧一楼';f.byLabel('新房间名字').value='森林阅读屋';await f.byLabel('新房间主题：薄荷花房').fire('click');await f.byText('备份并新建装修').fire('click');assert.equal(f.calls.length,0);assert.equal(f.byLabel('确认备份并新建装修').hidden,false);
  await f.byText('先不新建').fire('click');assert.equal(f.calls.length,0);await f.byText('备份并新建装修').fire('click');await f.byText('确认备份并新建').fire('click');await settle();assert.deepEqual(f.calls,[['world-new','a',{name:'森林阅读屋',template:'mint',backupName:'旧一楼'}]]);assert.equal(f.state.rooms.length,2);assert.equal(f.state.balance,1234);assert.ok(f.byText('旧一楼'));assert.equal(f.state.rooms[0].name,'森林阅读屋');f.ui.dispose();
});

test('a full backup list blocks new decoration even if a disabled button receives a programmatic click',async()=>{
 const f=worldsFixture();while(f.saves.get('a').length<5)f.saves.get('a').push({id:'s'+f.saves.get('a').length,roomId:'a',name:'旧备份',createdAt:'2026-10-30T07:00:00Z'});f.state.rooms[0].world.checkpointCount=5;f.ui.open();await settle();const button=f.byText('备份并新建装修');assert.equal(button.disabled,true);await button.fire('click');assert.equal(f.calls.length,0);assert.equal(f.byClass('estate-world-confirm')[0].hidden,true);f.ui.dispose();
});

test('reading a checkpoint requires a specific inline confirmation and can be canceled',async()=>{
  const f=worldsFixture();f.ui.open();await settle();
  await f.byLabel('读取存档点 花园午后').fire('click');assert.equal(f.calls.length,0);
  assert.equal(f.byClass('estate-world-confirm')[0].hidden,false);
  assert.ok(f.byText('读取到 1 楼「奶油的家」？'));
  assert.match(f.byClass('estate-world-confirm')[0].children[1].textContent,/花园午后.*共享积分、收藏与其他楼层保留/);
  await f.byText('先不读取').fire('click');assert.equal(f.byClass('estate-world-confirm')[0].hidden,true);assert.equal(f.calls.length,0);
  await f.byLabel('读取存档点 花园午后').fire('click');await f.byText('确认读取这一层').fire('click');await settle();
  assert.deepEqual(f.calls,[['world-restore','a','save-a']]);assert.equal(f.state.balance,1234);f.ui.dispose();
});

test('deleting a checkpoint refreshes that floor list without reading or changing the layout',async()=>{
  const f=worldsFixture();f.ui.open();await settle();await f.byLabel('删除存档点 花园午后').fire('click');await settle();
  assert.deepEqual(f.calls,[['world-remove','a','save-a']]);assert.equal(f.byText('花园午后'),undefined);assert.equal(f.saves.get('b').length,1);assert.equal(f.state.balance,1234);f.ui.dispose();
});

test('five checkpoints disable saving and even a synthetic click cannot evict one silently',async()=>{
  const f=worldsFixture();f.saves.set('a',Array.from({length:5},(_,i)=>({id:`saved-${i}`,name:`存档 ${i}`,createdAt:`2026-10-${20+i}T00:00:00Z`})));
  f.ui.open();await settle();assert.equal(f.byClass('estate-world-save').length,5);assert.equal(f.byText('保存此层').disabled,true);
  await f.byText('保存此层').fire('click');assert.equal(f.calls.length,0);assert.equal(f.saves.get('a').length,5);f.ui.dispose();
});

test('one-floor file export downloads a file and import waits for inline confirmation',async()=>{
  const f=worldsFixture();f.ui.open();await settle();await f.byText('导出这一层').fire('click');
  assert.deepEqual(f.calls,[['world-export','a']]);assert.equal(f.downloads.length,1);assert.match(f.downloads[0].name,/1楼-奶油的家.*\.json$/);
  const input=f.byLabel('导入这一层的存档文件'),json=JSON.stringify({format:'pet-room-world',roomId:'a',snapshot:{name:'恢复的花园'}});
  input.files=[{name:'我的花园.json',text:async()=>json}];await input.fire('change');assert.equal(f.calls.length,1);
  assert.equal(f.byClass('estate-world-confirm')[0].hidden,false);assert.match(f.byClass('estate-world-confirm')[0].children[1].textContent,/我的花园.json/);
  await f.byText('确认读取这一层').fire('click');await settle();assert.deepEqual(f.calls[1],['world-import','a',json]);f.ui.dispose();
});

test('invalid files, busy work, decoration and unsaved drawings never submit a world mutation',async()=>{
  const f=worldsFixture();f.ui.open();await settle();const input=f.byLabel('导入这一层的存档文件');
  input.files=[{name:'broken.json',text:async()=>'{broken'}];await input.fire('change');assert.match(f.byClass('estate-status')[0].textContent,/无法读取/);assert.equal(f.byClass('estate-world-confirm')[0].hidden,true);
  for(const state of [{ready:true,decoration:true},{ready:true,shop:{busy:true}}]){f.ui.update(state);assert.equal(f.byText('保存此层').disabled,true);await f.byText('保存此层').fire('click');}
  f.ui.update({ready:true});f.root.dataset.roomDrawingDirty='true';f.ui.update({ready:true});assert.equal(f.byText('保存此层').disabled,true);await f.byText('保存此层').fire('click');
  f.root.dataset.roomDrawingDirty='false';f.root.dataset.roomWallDrawingDirty='true';await f.byText('保存此层').fire('click');assert.equal(f.calls.length,0);f.ui.dispose();
});

test('pending saves reject duplicates and a disposed panel ignores late completion',async()=>{
  const f=worldsFixture();f.ui.open();await settle();let finish;f.api.saveRoomWorld=async(id,input)=>{f.calls.push(['world-save',id,input]);await new Promise(resolve=>{finish=resolve;});return{ok:true};};
  const first=f.byText('保存此层').fire('click');await Promise.resolve();await f.byText('保存此层').fire('click');assert.equal(f.calls.length,1);
  f.ui.dispose();finish();await first;await settle();assert.equal(f.root.children.length,0);
});

test('an old asynchronous checkpoint list cannot replace a newly selected floor list',async()=>{
  const f=worldsFixture();let finish;f.api.listRoomWorldSaves=id=>id==='a'?new Promise(resolve=>{finish=resolve;}):{ok:true,saves:f.saves.get(id)};
  f.ui.open();await Promise.resolve();await f.byRoom('b').fire('click');await settle();assert.ok(f.byText('薄荷书房'));
  finish({ok:true,saves:[{id:'old',name:'旧楼层迟到的存档',createdAt:'2026-10-30'}]});await settle();assert.equal(f.byText('旧楼层迟到的存档'),undefined);assert.ok(f.byText('薄荷书房'));f.ui.dispose();
});
