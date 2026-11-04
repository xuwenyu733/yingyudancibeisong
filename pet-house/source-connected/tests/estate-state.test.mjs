import test from 'node:test';
import {appendLegacyFloor} from './helpers/legacy-floor.mjs';
import assert from 'node:assert/strict';
import {createEstateStore,ESTATE_SUFFIX,MAX_ESTATE_ROOMS} from '../estate-state.mjs';
import {createEconomy} from '../economy.mjs';
import {createCompanionStore,COMPANION_SUFFIX} from '../companion-state.mjs';
import {createProfile} from '../profile.mjs';

const base='estate-child',estateKey=base+ESTATE_SUFFIX,accountKey=base+'-account-v1',companionKey=base+COMPANION_SUFFIX,profileKey=base+'-profile-v1';
function memory(){return {values:new Map(),writes:[],blocked:false,getItem(key){return this.values.get(key)??null;},setItem(key,value){if(this.blocked)throw new Error('quota');this.writes.push(key);this.values.set(key,value);},removeItem(key){this.values.delete(key);}};}
const estate=(adapter,initialPoints=3000)=>createEstateStore({storageAdapter:adapter,storageKey:base,initialPoints});
const economy=(store,id='room-1')=>createEconomy({storageAdapter:store.storageForRoom(id),storageKey:accountKey});
const companion=(store,id='room-1')=>createCompanionStore({adapter:store.storageForRoom(id),key:companionKey});
const layout=x=>({version:3,furniture:{table:{position:[x,0,1],rotation:[0,0,0],scale:[1,1,1]}},definitions:{},lampSupport:null});

test('estate rooms share points, ownership, pets and event claims while layouts and storage remain independent',()=>{
  const adapter=memory(),store=estate(adapter),first=economy(store);
  assert.equal(first.purchase('cloud-table',{layout:layout(1),requestId:'buy-table'}).ok,true);
  assert.equal(first.purchasePet('cloud-bunny','buy-bunny').ok,true);
  assert.equal(first.storeFurniture('sofa',{requestId:'store-sofa',layout:layout(1)}).ok,true);
  const made=store.createRoom({name:'薄荷书房',template:'mint'});assert.equal(made.ok,true);
  const second=economy(store,made.room.id);
  assert.equal(second.getState().balance,1920);
  assert.deepEqual(second.getState().owned,['cloud-table']);
  assert.equal(second.getState().pets.active,'cloud-bunny');
  assert.deepEqual(second.getState().stored,['cloud-table'],'新房内已收藏的商店家具先在仓库');
  assert.equal(second.getState().stored.includes('sofa'),false,'自带家具的收纳状态独立');
  assert.equal(second.unstoreFurniture('cloud-table',{requestId:'place-table',layout:layout(2)}).ok,true);
  assert.equal(second.getState().balance,1920,'其他房间摆放同一收藏无需再次付费');
  assert.equal(second.creditLearning({eventId:'shared-lesson',learned:1}).ok,true);
  const freshFirst=economy(store);
  assert.equal(freshFirst.getState().balance,1930);
  assert.equal(freshFirst.creditLearning({eventId:'shared-lesson',learned:1}).code,'ALREADY_CLAIMED');
  assert.deepEqual(freshFirst.getLayout(),layout(1));
  assert.deepEqual(economy(store,made.room.id).getLayout(),layout(2));
  assert.deepEqual(economy(store).getState().stored,['sofa']);
  assert.deepEqual(economy(store,made.room.id).getState().stored,[]);
});

test('purchases made after another room exists enter only that other rooms warehouse',()=>{
  const adapter=memory(),store=estate(adapter);store.createRoom({name:'花园屋',template:'candy'});
  const first=economy(store);assert.equal(first.purchase('moon-ornament',{layout:layout(1),requestId:'new-purchase'}).ok,true);
  assert.deepEqual(first.getState().stored,[]);
  assert.deepEqual(economy(store,'room-2').getState().stored,['moon-ornament']);
  assert.equal(economy(store,'room-2').getState().balance,2180);
});

test('room-level expansion receipts are isolated and do not invalidate or unlock new rooms',()=>{
  const store=estate(memory()),first=economy(store);
  assert.equal(first.expand({layout:layout(1),requestId:'expand-one'}).ok,true);
  assert.equal(first.setRoomLevel(0,{layout:layout(2),requestId:'small-one'}).ok,true);
  store.createRoom({template:'cream'});
  const second=economy(store,'room-2');
  assert.equal(second.getState().valid,true);
  assert.equal(second.getState().maxRoomLevel,0);
  assert.equal(second.getState().claims.requests.some(request=>request.operation==='expand'),false);
  assert.equal(second.expand({layout:layout(3),requestId:'expand-one'}).ok,true,'不同房间可使用同名本地请求');
  assert.equal(economy(store).getState().maxRoomLevel,1);
  assert.deepEqual(economy(store).getRoomLayout(0),layout(1));
  assert.deepEqual(economy(store,'room-2').getRoomLayout(0),layout(3));
});

test('virtual adapters preserve exact-write conflict checks while rejecting stale bank snapshots',()=>{
  const store=estate(memory()),first=economy(store);
  assert.equal(first.purchase('cloud-table',{requestId:'purchase'}).ok,true);
  assert.equal(first.storeFurniture('cloud-table',{requestId:'store'}).ok,true);
  assert.equal(first.purchasePet('cloud-bunny','pet-after-local-request').ok,true);
  assert.equal(first.reward({eventId:'reward-after-reordered-requests',points:1}).ok,true,'投影字段顺序不能导致自身下一笔交易误报冲突');
  store.createRoom({name:'二号屋'});const second=economy(store,'room-2');
  assert.equal(second.reward({eventId:'other-room-credit',points:2}).ok,true);
  const stale=first.reward({eventId:'stale-write',points:100});
  assert.equal(stale.code,'ARCHIVE_CONFLICT');
  assert.equal(economy(store).getState().balance,1923);
});

test('names and furniture designs are room local while pet outfits, sound, memories and garden are shared',()=>{
  const adapter=memory(),store=estate(adapter);store.createRoom({name:'糖果城堡',template:'candy',stacked:true});
  const first=companion(store);
  assert.equal(first.update({petName:'云云',sound:{muted:true},outfit:{hat:'unicorn'},roomName:'我的小院'}).ok,true);
  assert.equal(first.customize('sofa',{color:'#abcdef',sticker:'heart'}).ok,true);
  assert.equal(first.remember('sofa','甜甜','一起带回家').ok,true);
  assert.equal(first.learning('garden-one',1200).ok,true);
  const second=companion(store,'room-2').getState();
  assert.equal(second.petName,'云云');assert.equal(second.sound.muted,true);assert.equal(second.outfit.hat,'unicorn');
  assert.equal(second.roomName,'糖果城堡');assert.equal(second.theme,'candy');
  assert.deepEqual(second.furnitureStyles,{});assert.equal(second.memories.sofa.by,'甜甜');assert.equal(second.learningSeconds,1200);
  assert.equal(store.getState().rooms[0].name,'我的小院');
  assert.equal(store.renameRoom('room-2','星光二楼').ok,true);
  const reloaded=estate(adapter);
  assert.equal(companion(reloaded,'room-2').getState().roomName,'星光二楼');
  assert.equal(companion(reloaded).getState().furnitureStyles.sofa.color,'#abcdef');
});

test('new estates have two floors, a paid second floor and idempotent expansion receipts',()=>{
 const adapter=memory(),store=estate(adapter),points=economy(store).getState().balance;
 const made=store.createRoom({name:'薄荷',template:'mint',requestId:'create:2'});assert.equal(made.ok,true);assert.equal(made.cost,600);assert.equal(made.room.floor,1);assert.equal(MAX_ESTATE_ROOMS,2);
 assert.equal(store.getState().activeRoomId,'room-1');assert.equal(store.createRoom({name:'三楼'}).code,'ROOM_LIMIT');assert.equal(economy(store).getState().balance,points-600);
 assert.equal(store.createRoom({requestId:'create:2'}).unchanged,true);assert.equal(economy(store).getState().balance,points-600);
 const receipt=store.exportArchive().archive.estate.bank.claims.requests.find(item=>item.id==='create:2');assert.equal(receipt.points,600);assert.equal(receipt.level,1);
 assert.equal(store.selectRoom('room-2').ok,true);assert.equal(economy(store,'room-2').getState().appearance.wallColor,'mint');assert.equal(companion(store,'room-2').getState().theme,'eye-care');assert.equal(estate(adapter).getState().rooms.length,2);
});
test('second-floor expansion requires 600 points and failed attempts cannot charge or create a floor',()=>{
 const adapter=memory(),store=estate(adapter,599),before=adapter.getItem(estateKey);assert.equal(store.createRoom({requestId:'expand:2'}).code,'INSUFFICIENT_POINTS');assert.equal(adapter.getItem(estateKey),before);
 assert.equal(economy(store).reward({eventId:'earn-one',points:1}).ok,true);assert.equal(store.createRoom({requestId:'expand:2'}).ok,true);assert.equal(economy(store).getState().balance,0);assert.equal(store.getState().rooms.length,2);
 assert.equal(store.createRoom({requestId:'expand:3'}).code,'ROOM_LIMIT');assert.equal(economy(store).getState().balance,0);
});

test('first migration preserves all legacy keys, prior balance, layout and companion without paying twice',()=>{
  const adapter=memory(),oldEconomy=createEconomy({storageAdapter:adapter,storageKey:accountKey,initialBalance:3000});
  oldEconomy.purchase('cloud-table',{requestId:'old-purchase',layout:layout(9)});oldEconomy.expand({requestId:'old-expand',layout:layout(8)});
  const oldCompanion=createCompanionStore({adapter,key:companionKey});oldCompanion.update({petName:'旧伙伴',roomName:'旧房间'});oldCompanion.customize('table',{color:'#123456'});
  const oldValues=new Map(adapter.values);adapter.writes.length=0;
  const store=estate(adapter,99999);
  assert.equal(store.getState().valid,true);assert.deepEqual(adapter.writes,[estateKey]);
  for(const [key,value]of oldValues)assert.equal(adapter.getItem(key),value,'不修改原始单房间存档');
  assert.equal(economy(store).getState().balance,2220);assert.equal(economy(store).getState().maxRoomLevel,1);
  assert.deepEqual(economy(store).getLayout(),layout(8));assert.equal(companion(store).getState().petName,'旧伙伴');
  assert.equal(store.getState().rooms[0].name,'旧房间');
  assert.equal(estate(adapter,123).getState().rooms.length,1);assert.equal(economy(estate(adapter,123)).getState().balance,2220);
});

test('corrupt estate or legacy state is never overwritten and unknown schemas are rejected',()=>{
  for(const key of [estateKey,accountKey,companionKey]){
    const adapter=memory();adapter.values.set(key,'{broken');const store=estate(adapter);assert.equal(store.getState().valid,false);assert.equal(store.createRoom({}).ok,false);assert.equal(adapter.getItem(key),'{broken');assert.deepEqual(adapter.writes,[]);
  }
  const adapter=memory(),store=estate(adapter),before=adapter.getItem(estateKey),writes=adapter.writes.length;
  assert.equal(store.createRoom({name:'坏参数',unknown:true}).ok,false);
  assert.equal(store.createRoom(JSON.parse('{"__proto__":{"polluted":true}}')).ok,false);
  assert.equal(store.createRoom({template:'unknown'}).ok,false);
  assert.equal(store.selectRoom('__proto__').ok,false);
  assert.equal(store.renameRoom('room-1','').ok,false);
  assert.equal(store.setMode('unknown').ok,false);
  assert.equal(adapter.getItem(estateKey),before);assert.equal(adapter.writes.length,writes);assert.equal({}.polluted,undefined);
  assert.throws(()=>store.storageForRoom('room-99'));
  let reads=0;const input={};Object.defineProperty(input,'name',{enumerable:true,get(){reads++;return '访问器';}});assert.equal(store.createRoom(input).ok,false);assert.equal(reads,0);
});

test('failed writes and throw-after-write callbacks restore the exact previous estate snapshot',()=>{
  for(const afterWrite of [false,true]){
    const adapter=memory(),store=estate(adapter),before=adapter.getItem(estateKey),write=adapter.setItem.bind(adapter);let failed=false;
    adapter.setItem=(key,value)=>{if(key===estateKey&&!failed){failed=true;if(afterWrite)write(key,value);throw new Error('quota');}write(key,value);};
    assert.equal(store.createRoom({name:'不应留下'}).ok,false);assert.equal(adapter.getItem(estateKey),before);assert.equal(store.getState().rooms.length,1);
    assert.equal(store.createRoom({name:'重试成功'}).ok,true);assert.equal(store.getState().rooms.length,2);
  }
});

test('failed initial migration is visible and can retry without overwriting original keys',()=>{
  const adapter=memory();adapter.values.set(accountKey,JSON.stringify({version:1,balance:50,roomLevel:0,maxRoomLevel:0,owned:[],stored:[],layout:null,layouts:{},appearance:{wallColor:'cream',flooring:null},claims:{learning:[],requests:[],rewards:[],spends:[]},totalSpent:0,petOwned:['apricot-fox'],activePet:'apricot-fox'}));
  const original=adapter.getItem(accountKey);adapter.blocked=true;
  const store=estate(adapter);assert.equal(store.getState().valid,false);assert.equal(adapter.getItem(estateKey),null);assert.equal(adapter.getItem(accountKey),original);
  adapter.blocked=false;assert.equal(store.selectRoom('room-1').ok,true);assert.equal(store.getState().valid,true);assert.equal(economy(store).getState().balance,50);assert.equal(adapter.getItem(accountKey),original);
  const before=adapter.getItem(estateKey);adapter.setItem=()=>{};
  assert.equal(store.createRoom({name:'未保留'}).ok,false);assert.equal(adapter.getItem(estateKey),before);
});

test('separate registry instances fresh-read and share a lock instead of overwriting another room',()=>{
  const adapter=memory(),a=estate(adapter),b=estate(adapter);
  assert.equal(a.createRoom({name:'A建的'}).ok,true);assert.equal(b.createRoom({name:'B建的'}).code,'ROOM_LIMIT');
  assert.deepEqual(a.getState().rooms.map(room=>room.name),['暖暖小屋','A建的']);
  const write=adapter.setItem.bind(adapter);let reentrant;
  adapter.setItem=(key,value)=>{if(key===estateKey)reentrant=b.setMode('castle');write(key,value);};
  assert.equal(a.renameRoom('room-1','新的名字').ok,true);assert.equal(reentrant.code,'BUSY');assert.equal(a.getState().mode,'castle');
});

test('room extra storage is isolated, profile is global, and other namespaces cannot be accessed',()=>{
  const adapter=memory(),store=estate(adapter);store.createRoom({});const a=store.storageForRoom('room-1'),b=store.storageForRoom('room-2');
  const profile=createProfile({storageAdapter:a,storageKey:profileKey});assert.equal(profile.setName('甜甜').ok,true);
  assert.equal(createProfile({storageAdapter:b,storageKey:profileKey}).getState().name,'甜甜');
  a.setItem(base+'-backups-v1','first');b.setItem(base+'-backups-v1','second');assert.equal(a.getItem(base+'-backups-v1'),'first');assert.equal(b.getItem(base+'-backups-v1'),'second');
  a.removeItem(base+'-backups-v1');assert.equal(a.getItem(base+'-backups-v1'),null);assert.equal(b.getItem(base+'-backups-v1'),'second');
  const before=new Map(adapter.values);assert.throws(()=>a.setItem('another-project-account-v1','no'));assert.throws(()=>b.getItem('another-project-account-v1'));assert.deepEqual(adapter.values,before);
  assert.equal([...adapter.values.keys()].some(key=>key.includes('another-project')),false);
});

test('whole-estate exports restore every room, shared wallet, companion and profile together',()=>{
  const adapter=memory(),store=estate(adapter),a=store.storageForRoom('room-1');
  createProfile({storageAdapter:a,storageKey:profileKey}).setName('原主人');economy(store).purchase('cloud-table',{requestId:'paid',layout:layout(1)});
  store.createRoom({name:'二楼花园',template:'mint',stacked:true});economy(store,'room-2').unstoreFurniture('cloud-table',{requestId:'room-two',layout:layout(2)});companion(store,'room-2').customize('table',{sticker:'flower'});store.setMode('castle');store.selectRoom('room-2');
  const saved=store.exportArchive();assert.equal(saved.ok,true);assert.equal(saved.archive.format,'pet-estate-save');
  const targetAdapter=memory(),target=estate(targetAdapter,10);const imported=target.importArchive(JSON.stringify(saved.archive));assert.equal(imported.ok,true);assert.equal(imported.relaunchRequired,true);
  assert.deepEqual(target.getState(),store.getState());assert.equal(economy(target).getState().balance,2220);assert.deepEqual(economy(target).getLayout(),layout(1));assert.deepEqual(economy(target,'room-2').getLayout(),layout(2));
  assert.equal(companion(target,'room-2').getState().furnitureStyles.table.sticker,'flower');assert.equal(createProfile({storageAdapter:target.storageForRoom('room-2'),storageKey:profileKey}).getState().name,'原主人');
  const legacy=target.importArchive({format:1,version:'2.18.0',exportedAt:new Date().toISOString(),meta:{},profile:{},economy:{}});
  assert.equal(legacy.code,'ARCHIVE_VERSION');assert.match(legacy.message,/先用旧版导入/);
});

test('whole-estate import validates before writes and rolls back estate when the profile write fails',()=>{
  const source=estate(memory());source.createRoom({name:'备份房间'});const archive=source.exportArchive().archive;
  for(const existingProfile of [false,true]){
    const adapter=memory(),target=estate(adapter);if(existingProfile)createProfile({storageAdapter:target.storageForRoom('room-1'),storageKey:profileKey}).setName('保留');
    const before=new Map(adapter.values),write=adapter.setItem.bind(adapter);let failed=false;
    adapter.setItem=(key,value)=>{if(key===profileKey&&!failed){failed=true;write(key,value);throw new Error('profile write failed');}write(key,value);};
    assert.equal(target.importArchive(archive).ok,false);assert.deepEqual(adapter.values,before);
  }
  const adapter=memory(),target=estate(adapter),before=new Map(adapter.values),writes=adapter.writes.length;
  const malformed=structuredClone(archive);malformed.estate.bank.balance=-1;assert.equal(target.importArchive(malformed).ok,false);
  const unknown=structuredClone(archive);unknown.estate.rooms[0].unexpected=true;assert.equal(target.importArchive(unknown).ok,false);
  const nullProfile=structuredClone(archive);nullProfile.profile=null;assert.equal(target.importArchive(nullProfile).ok,false);
  const proto=JSON.parse(JSON.stringify(archive));proto.estate.bank=JSON.parse('{"__proto__":{"polluted":true}}');assert.equal(target.importArchive(proto).ok,false);
  assert.deepEqual(adapter.values,before);assert.equal(adapter.writes.length,writes);
});

function legacyCourtyardArchive(){
  const store=estate(memory(),4000);
  assert.equal(economy(store).purchase('cloud-table',{requestId:'old-table',layout:layout(11)}).ok,true);
  appendLegacyFloor(store,{name:'薄荷旧房',template:'mint'});
  appendLegacyFloor(store,{name:'糖果旧房',template:'candy'});
  appendLegacyFloor(store,{name:'奶油旧房',template:'cream'});
  assert.equal(economy(store,'room-2').unstoreFurniture('cloud-table',{requestId:'old-second-place',layout:layout(22)}).ok,true);
  companion(store,'room-2').customize('table',{color:'#abcdef',sticker:'heart'});
  store.storageForRoom('room-3').setItem(base+'-old-extra','原附加记录');
  store.selectRoom('room-3');
  const archive=store.exportArchive().archive;
  archive.estate.mode='courtyard';
  archive.estate.rooms.forEach((room,index)=>{room.floor=[2,0,0,1][index];});
  return archive;
}
const withoutFloor=room=>Object.fromEntries(Object.entries(room).filter(([key])=>key!=='floor'));

test('legacy courtyard and duplicate floors migrate once in stable floor order without losing room contents or shared points',()=>{
  const archive=legacyCourtyardArchive(),legacy=archive.estate,adapter=memory();
  adapter.values.set(estateKey,JSON.stringify(legacy));
  const store=estate(adapter,99999),state=store.getState();
  assert.equal(state.valid,true);assert.equal(state.mode,'castle');assert.equal(state.activeRoomId,'room-3');
  assert.deepEqual(state.rooms.map(room=>room.id),['room-2','room-3','room-4','room-1']);
  assert.deepEqual(state.rooms.map(room=>room.floor),[0,1,2,3]);
  assert.deepEqual(adapter.writes,[estateKey],'初始化只原子写一次规范化的庄园键');
  const migrated=store.exportArchive().archive.estate;
  assert.equal(migrated.bank.balance,2020);
  assert.deepEqual(migrated.bank,legacy.bank);assert.deepEqual(migrated.companion,legacy.companion);
  for(const old of legacy.rooms)assert.deepEqual(withoutFloor(migrated.rooms.find(room=>room.id===old.id)),withoutFloor(old));
  assert.deepEqual(economy(store,'room-1').getLayout(),layout(11));
  assert.deepEqual(economy(store,'room-2').getLayout(),layout(22));
  assert.equal(companion(store,'room-2').getState().furnitureStyles.table.color,'#abcdef');
  assert.equal(store.storageForRoom('room-3').getItem(base+'-old-extra'),'原附加记录');
  const canonical=adapter.getItem(estateKey),writes=adapter.writes.length,ledger=economy(store,'room-1');
  for(let index=0;index<5;index++)store.getState();
  const another=estate(adapter);another.getState();
  assert.equal(adapter.getItem(estateKey),canonical);assert.equal(adapter.writes.length,writes,'get与再次初始化不能反复改写JSON');
  assert.equal(ledger.reward({eventId:'after-normalization',points:1}).ok,true,'读取规范化不能引入账本脏JSON冲突');
  assert.equal(economy(store,'room-2').getState().balance,2021);
  const beforeReject=adapter.getItem(estateKey);assert.equal(store.setMode('courtyard').code,'MODE_UNSUPPORTED');assert.equal(adapter.getItem(estateKey),beforeReject);
  assert.equal(store.createRoom({name:'继续叠层',stacked:false}).code,'ROOM_LIMIT');
});

test('legacy floor migration failures preserve the exact old save and retry safely',()=>{
  for(const afterWrite of [false,true]){
    const adapter=memory(),old=JSON.stringify(legacyCourtyardArchive().estate);adapter.values.set(estateKey,old);
    const write=adapter.setItem.bind(adapter);let failed=false;
    adapter.setItem=(key,value)=>{if(key===estateKey&&!failed){failed=true;if(afterWrite)write(key,value);throw new Error('migration quota');}write(key,value);};
    const store=estate(adapter);assert.equal(store.getState().valid,false);assert.equal(adapter.getItem(estateKey),old);
    assert.equal(store.setMode('castle').ok,true);assert.equal(store.getState().valid,true);
    assert.equal(store.getState().activeRoomId,'room-3');assert.deepEqual(store.getState().rooms.map(room=>room.floor),[0,1,2,3]);
    assert.equal(economy(store,'room-2').getState().balance,2020);
  }
});

test('old full-estate archives normalize duplicate floors on import and export only the castle form',()=>{
  const archive=legacyCourtyardArchive(),before=JSON.stringify(archive),adapter=memory(),store=estate(adapter,10);
  assert.equal(store.importArchive(archive).ok,true);assert.equal(JSON.stringify(archive),before,'导入不能修改用户的存档对象');
  const state=store.getState();assert.equal(state.mode,'castle');assert.equal(state.activeRoomId,'room-3');assert.deepEqual(state.rooms.map(room=>room.floor),[0,1,2,3]);
  const saved=store.exportArchive();assert.equal(saved.ok,true);assert.equal(saved.archive.estate.mode,'castle');
  const next=estate(memory(),0);assert.equal(next.importArchive(JSON.stringify(saved.archive)).ok,true);
  assert.deepEqual(next.getState(),state);assert.equal(economy(next,'room-4').getState().balance,2020);
  assert.deepEqual(economy(next,'room-1').getLayout(),layout(11));assert.deepEqual(economy(next,'room-2').getLayout(),layout(22));
  assert.equal(next.createRoom({name:'第五层'}).code,'ROOM_LIMIT');
});


test('four floors share all earnings and spending while wall drawings and legacy photo records survive independently',()=>{
  const adapter=memory(),store=estate(adapter,3000),photo={id:'photo-first',at:'2026-10-29T01:00:00Z',title:'一楼合影',dataUrl:'data:image/jpeg;base64,/9j/2Q=='};
  const drawing={version:1,strokes:[{tool:'brush',color:'#ff6699',size:.02,points:[[.1,.2],[.4,.6]]}]};
  const firstCompanion=companion(store);assert.equal(firstCompanion.replace({...firstCompanion.getState(),photos:[photo]}).ok,true);
  assert.equal(companion(store).saveWallDrawing(drawing).ok,true);
  for(let n=2;n<=4;n++)assert.equal(appendLegacyFloor(store,{name:`${n} 楼`}).ok,true);
  assert.equal(store.createRoom({}).code,'ROOM_LIMIT');
  for(const id of ['room-2','room-3','room-4']){
    assert.deepEqual(companion(store,id).getState().photos,[]);
    assert.equal(companion(store,id).getState().wallDrawing,null);
  }
  assert.equal(companion(store,'room-2').saveWallDrawing({...drawing,strokes:[]}).ok,true);
  const secondCompanion=companion(store,'room-2');assert.equal(secondCompanion.replace({...secondCompanion.getState(),photos:[{...photo,id:'photo-second',title:'二楼合影'}]}).ok,true);
  assert.equal(economy(store,'room-4').creditLearning({eventId:'lesson-upstairs',learned:1}).ok,true);
  assert.equal(economy(store,'room-3').purchase('cloud-table',{requestId:'purchase-upstairs'}).ok,true);
  const balance=economy(store).getState().balance;
  for(const id of ['room-1','room-2','room-3','room-4'])assert.equal(economy(store,id).getState().balance,balance);
  const restored=estate(memory(),0);assert.equal(restored.importArchive(store.exportArchive().archive).ok,true);
  assert.deepEqual(companion(restored).getState().photos,[photo]);assert.deepEqual(companion(restored).getState().wallDrawing,drawing);
  assert.equal(companion(restored,'room-2').getState().photos[0].title,'二楼合影');
  assert.deepEqual(companion(restored,'room-2').getState().wallDrawing,{version:1,strokes:[]});
  assert.equal(companion(restored,'room-4').getState().photos.length,0);
});

test('legacy six-floor saves retain every floor but cannot expand further',()=>{
  const adapter=memory(),store=estate(adapter),archive=store.exportArchive().archive;
  for(let n=2;n<=6;n++)archive.estate.rooms.push({...structuredClone(archive.estate.rooms[0]),id:`room-${n}`,name:`旧${n}楼`,floor:n-1});
  archive.estate.activeRoomId='room-6';
  assert.equal(store.importArchive(archive).ok,true);
  assert.equal(store.getState().rooms.length,6);assert.equal(store.getState().activeRoomId,'room-6');
  assert.equal(store.createRoom({}).code,'ROOM_LIMIT');
  assert.equal(estate(adapter).getState().valid,true);
  assert.equal(store.exportArchive().archive.estate.rooms[5].name,'旧6楼');
});
