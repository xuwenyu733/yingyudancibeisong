import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createSocialService} from './social-service.mjs';
import {createEstateStore} from '../../source-connected/estate-state.mjs';
import {insidePetBounds,petNavigationBounds} from '../../source-connected/pet-boundary.mjs';
const sourceRoot=fileURLToPath(new URL('../../source-connected',import.meta.url));
function fixture(){
 const host={accountKey:'host',publicId:'PET-0000000001',name:'主人'},a={accountKey:'guest-a',publicId:'PET-0000000002',name:'兔兔'},b={accountKey:'guest-b',publicId:'PET-0000000003',name:'猫猫'},ids=new Map([[a.accountKey,'a'.repeat(32)],[b.accountKey,'b'.repeat(32)]]),homes=new Map(),revisions=new Map(),trace=[];let now=Date.now(),allowed=true;
 for(const me of [host,a,b]){const estate=createEstateStore({storageAdapter:null,storageKey:me.accountKey,initialPoints:7777});estate.createRoom({name:'二楼'});homes.set(me.accountKey,estate.exportArchive().archive);revisions.set(me.accountKey,1);}
 const companion=homes.get(a.accountKey).estate.companion;companion.petName='花花';companion.outfit={hat:'star',scarf:'none',backpack:'none'};companion.visitDates=Array.from({length:7},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0'));companion.learningSeconds=12345;homes.get(a.accountKey).estate.bank.activePet='cloud-bunny';
 const pool={async execute(sql,args){trace.push(sql);if(sql.startsWith('SELECT public_id,display_name'))return [[{public_id:host.publicId,display_name:host.name}],[]];if(sql.startsWith('SELECT namespace,revision'))return [args.map(namespace=>({namespace,revision:revisions.get(namespace)||0})),[]];if(sql.startsWith('SELECT revision'))return [[{revision:revisions.get(args[0])||0}],[]];if(sql.startsWith('SELECT * FROM social_invitations')){const guest=[...ids].find(([,id])=>id===args[0])?.[0];return [guest?[{invitation_id:args[0],host_key:host.accountKey,guest_key:guest,state:allowed?'accepted':'revoked',created_at:new Date(now-1000),expires_at:new Date(now+60000)}]:[],[]];}if(sql.startsWith('SELECT * FROM social_friendships'))return [[{state:'accepted',updated_at:new Date(now-2000)}],[]];if(sql.startsWith('SELECT owner_key'))return [[],[]];if(sql.startsWith('SELECT i.invitation_id'))return [allowed?[...ids.values()].map(invitation_id=>({invitation_id})):[],[]];throw Error('Unexpected query '+sql);}};
 const service=createSocialService(pool,{sourceRoot,clock:()=>now,repository:{async load(key){return {revision:revisions.get(key)||0,entries:homes.get(key)||null};}},validate:(key,entries)=>({archive:entries})});
 const heartbeat=(me=a,over={})=>service.visitPresence(me,{id:ids.get(me.accountKey),sessionId:'session-'+me.accountKey,sequence:1,active:true,roomId:'room-1',...over});
 const hostbeat=(over={})=>service.hostPresence(host,{sessionId:'session-host',sequence:1,active:true,roomId:'room-1',busy:false,position:{x:0,z:2},...over});
 let counter=0;const action=(me,generation,intent,over={})=>service.visitAction(me,{id:ids.get(me.accountKey),sessionId:'session-'+me.accountKey,generation,requestId:'request-'+(++counter),roomId:'room-1',action:intent,...over});
 return {service,host,a,b,ids,homes,revisions,heartbeat,hostbeat,action,trace,block(){allowed=false;},advance(ms){now+=ms;}};
}
test('public pet reflects saved selected animal/name/outfit/stage, privacy whitelist and revision refresh',async()=>{
 const f=fixture(),result=await f.heartbeat();assert.deepEqual(result.visitors[0].pet,{sku:'cloud-bunny',petName:'花花',outfit:{hat:'star',scarf:'none',backpack:'none'},growthStage:'young'});
 for(const key of ['learningSeconds','learningEvents','balance','claims','accountKey','sessionId','guestKey','hostKey'])assert(!JSON.stringify(result).includes('"'+key+'"'));
 f.homes.get(f.a.accountKey).estate.bank.activePet='mint-cat';f.revisions.set(f.a.accountKey,2);assert.equal((await f.service.visitors(f.host)).visitors[0].pet.sku,'mint-cat');
});
test('server validates guest action generation, floor, supported target and variants; never changes saves',async()=>{
 const f=fixture(),before=JSON.stringify([...f.homes]),joined=await f.heartbeat();
 await assert.rejects(f.action(f.a,'wrong',{type:'furniture',targetId:'sofa'}),e=>e.code==='VISIT_SESSION_REPLACED');
 await assert.rejects(f.action(f.a,joined.generation,{type:'furniture',targetId:'sofa'},{roomId:'room-2'}),e=>e.code==='INVALID_VISIT_FLOOR');
 await assert.rejects(f.action(f.a,joined.generation,{type:'furniture',targetId:'shop-rocket-toy'}),e=>e.code==='VISIT_TARGET_GONE');
 await assert.rejects(f.action(f.a,joined.generation,{type:'furniture',targetId:'table',variant:'invented'}),e=>e.code==='INVALID_VISIT_VARIANT');
 await assert.rejects(f.action(f.a,joined.generation,{type:'greet',position:{x:999,z:999}}),e=>e.code==='INVALID_VISIT_ACTION');
 const started=await f.action(f.a,joined.generation,{type:'furniture',targetId:'table',variant:'garden'});assert.equal(started.visitors[0].action.kind,'tea');assert.equal(JSON.stringify([...f.homes]),before);
});
test('two simultaneous guests and host arbitrate one seat; stored target cancels and releases it',async()=>{
 const f=fixture(),[a,b]=await Promise.all([f.heartbeat(f.a),f.heartbeat(f.b)]);await f.hostbeat();
 const results=await Promise.allSettled([f.action(f.a,a.generation,{type:'furniture',targetId:'sofa'}),f.action(f.b,b.generation,{type:'furniture',targetId:'sofa'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'VISIT_SEAT_OCCUPIED');
 await assert.rejects(f.hostbeat({sequence:2,action:{type:'furniture',targetId:'sofa'}}),e=>e.code==='VISIT_SEAT_OCCUPIED');
 f.homes.get(f.host.accountKey).estate.rooms[0].scene.stored.push('sofa');f.revisions.set(f.host.accountKey,2);assert((await f.service.visitors(f.host)).visitors.every(g=>!g.action));
 await assert.rejects(f.action(f.a,a.generation,{type:'furniture',targetId:'sofa'}),e=>e.code==='VISIT_TARGET_GONE');
});
test('greeting uses shared canonical geometry and owner busy state cancels both without save mutation',async()=>{
 const f=fixture(),joined=await f.heartbeat(),before=JSON.stringify([...f.homes]);await f.hostbeat();const result=await f.action(f.a,joined.generation,{type:'greet'});
 assert.equal(result.owner.action.id,result.visitors[0].action.id);assert.equal(result.owner.action.actorPublicId,f.a.publicId);assert.deepEqual(result.owner.action.facing,{x:0,z:2});assert(Number.isFinite(result.owner.action.approach.x));
 const ended=await f.hostbeat({sequence:2,busy:true});assert.equal(ended.owner.action,null);assert.equal(ended.visitors[0].action,null);assert.equal(JSON.stringify([...f.homes]),before);
});
test('revoke/permission change removes actor and rejects further actions immediately',async()=>{
 const f=fixture(),joined=await f.heartbeat();await f.action(f.a,joined.generation,{type:'furniture',targetId:'sofa'});f.block();assert.equal((await f.service.visitors(f.host)).visitors.length,0);
 await assert.rejects(f.action(f.a,joined.generation,{type:'greet'}),e=>e.code==='NOT_INVITED');
});
test('host validates live position and stale cancel sequence cannot cancel newer action',async()=>{
 const f=fixture();await assert.rejects(f.hostbeat({position:{x:999,z:0}}),e=>e.code==='INVALID_HOST_PRESENCE');
 const first=await f.hostbeat({action:{type:'furniture',targetId:'sofa'}});assert.equal(first.owner.action.kind,'seat');
 await f.hostbeat({sequence:3,action:{type:'cancel'}});const next=await f.hostbeat({sequence:4,action:{type:'furniture',targetId:'sofa'}});
 await assert.rejects(f.hostbeat({sequence:2,action:{type:'cancel'}}),e=>e.code==='VISIT_STALE_ACTION');
 const busy=await f.hostbeat({sequence:5,busy:true});assert.equal(busy.owner.action.id,next.owner.action.id);
});
test('already seated owner adopts a validated lease; pending reservation survives null until arrival, then standing releases it',async()=>{
 const f=fixture(),joined=await f.heartbeat();
 await assert.rejects(f.hostbeat({seatId:'sofa',position:{x:0,z:2}}),e=>e.code==='INVALID_VISIT_SEAT');
 const adopted=await f.hostbeat({sequence:2,seatId:'sofa',position:{x:1.12,z:-2.28}});assert.equal(adopted.owner.seatId,'sofa');
 await assert.rejects(f.action(f.a,joined.generation,{type:'greet'}),e=>e.code==='VISIT_OWNER_BUSY');
 await assert.rejects(f.action(f.a,joined.generation,{type:'furniture',targetId:'sofa'}),e=>e.code==='VISIT_SEAT_OCCUPIED');
 assert.equal((await f.hostbeat({sequence:3,seatId:null})).owner.action,null);
 const reserved=await f.hostbeat({sequence:4,seatId:null,action:{type:'furniture',targetId:'sofa'}});
 assert.equal((await f.hostbeat({sequence:5,seatId:null})).owner.action.id,reserved.owner.action.id);
 await f.hostbeat({sequence:6,seatId:'sofa',position:{x:1.12,z:-2.28}});
 assert.equal((await f.hostbeat({sequence:7,seatId:null})).owner.action,null);
});
test('host tea reserves nearby physical seat; guest tea cannot claim it and seat mutations cancel tea',async()=>{
 const f=fixture(),joined=await f.heartbeat();const result=await f.hostbeat({action:{type:'furniture',targetId:'table',seatId:'ottoman-b',variant:'garden'}});
 assert.equal(result.owner.action.kind,'tea');assert.equal(result.owner.action.seatId,'ottoman-b');assert(result.owner.action.seatFingerprint);
 await assert.rejects(f.action(f.a,joined.generation,{type:'furniture',targetId:'ottoman-b'}),e=>e.code==='VISIT_SEAT_OCCUPIED');
 await assert.rejects(f.action(f.a,joined.generation,{type:'furniture',targetId:'table',seatId:'ottoman-a'}),e=>e.code==='INVALID_VISIT_SEAT');
 f.homes.get(f.host.accountKey).estate.rooms[0].scene.stored.push('ottoman-b');f.revisions.set(f.host.accountKey,2);assert.equal((await f.service.visitors(f.host)).owner.action,null);
 await assert.rejects(f.hostbeat({sequence:2,action:{type:'furniture',targetId:'table',seatId:'not-a-seat'}}),e=>e.code==='INVALID_VISIT_SEAT');
});
test('greeting near the front edge uses the same walkable pet boundary as the renderer',async()=>{
 const f=fixture(),joined=await f.heartbeat(),bounds=petNavigationBounds(8.8,8.2);
 await f.hostbeat({position:{x:0,z:2.4}});
 const result=await f.action(f.a,joined.generation,{type:'greet'}),point=result.visitors[0].action.approach;
 assert(insidePetBounds(point,bounds));assert.notDeepEqual(point,{x:0,z:3.55},'old half-unit inset allowed an unreachable front-edge point');
 await assert.rejects(f.hostbeat({sequence:2,position:{x:0,z:3.55}}),e=>e.code==='INVALID_HOST_PRESENCE');
});
test('cached twelve-person roster uses one guest revision batch and fresh permission query, not twelve reads',async()=>{
 const f=fixture(),guests=[f.a,f.b];
 for(let i=0;i<10;i++){const me={accountKey:'batch-guest-'+i,publicId:'PET-'+String(i+10).padStart(10,'0'),name:'访客'+i};f.ids.set(me.accountKey,String(i+10).padStart(32,'0'));f.homes.set(me.accountKey,structuredClone(f.homes.get(f.a.accountKey)));f.revisions.set(me.accountKey,1);guests.push(me);}
 for(const guest of guests)await f.heartbeat(guest);
 f.trace.length=0;assert.equal((await f.service.visitors(f.host)).visitors.length,12);
 assert.equal(f.trace.filter(sql=>sql.startsWith('SELECT i.invitation_id')).length,1);
 assert.equal(f.trace.filter(sql=>sql.startsWith('SELECT namespace,revision')).length,1);
 assert.equal(f.trace.filter(sql=>sql.startsWith('SELECT revision')).length,1,'only the owner revision needs an individual read');
 assert.equal(f.trace.length,3);
 f.homes.get(guests[5].accountKey).estate.bank.activePet='mint-cat';f.revisions.set(guests[5].accountKey,2);
 assert.equal((await f.service.visitors(f.host)).visitors.find(row=>row.publicId===guests[5].publicId).pet.sku,'mint-cat');
 f.block();f.trace.length=0;assert.equal((await f.service.visitors(f.host)).visitors.length,0);assert.equal(f.trace.some(sql=>sql.startsWith('SELECT namespace,revision')),false,'revoked guests do not enter the metadata batch');
});
test('visit projects legacy layout and styles without stored inventory, preserving visible wall geometry and original save',async()=>{
 const f=fixture(),archive=f.homes.get(f.host.accountKey),room=archive.estate.rooms[0],transform={position:[-2,3,-4],rotation:[0,0,0],scale:[1,1,1]},definition={label:'可见挂画',boxes:[{center:[0,.5,0],size:[1,1,.1]}],blocksNavigation:false,blocksPlacement:true,draggable:true,locked:false};
 archive.estate.bank.owned.push('wall-botanical-frame','moon-ornament');
 room.scene.stored.push('moon-ornament','lamp-cabinet');room.scene.layout={version:3,furniture:{lamp:{...transform,privateInventory:'不公开附加字段'},'lamp-cabinet':transform,'shop-wall-botanical-frame':transform,'shop-moon-ornament':transform},definitions:{lamp:definition,'lamp-cabinet':definition,'shop-wall-botanical-frame':{...definition,warehouseHistory:'不公开历史'},'shop-moon-ornament':{...definition,label:'隐藏月亮库存'},'shop-orphan-stock':definition},lampSupport:'lamp-cabinet',warehouseSnapshot:'不公开仓库快照'};
 room.companion.furnitureStyles={'shop-wall-botanical-frame':{color:'#ff9900'},'shop-moon-ornament':{sticker:'star'},'shop-orphan-stock':{sticker:'heart'}};
 const before=JSON.stringify(archive),visit=await f.service.visit(f.a,f.ids.get(f.a.accountKey)),floor=visit.floors[0],json=JSON.stringify(floor);
 assert.deepEqual(floor.scene.displayedItems,['wall-botanical-frame']);assert.deepEqual(Object.keys(floor.scene.layout.furniture),['lamp','shop-wall-botanical-frame']);assert.deepEqual(Object.keys(floor.scene.layout.definitions),['lamp','shop-wall-botanical-frame']);assert.equal(floor.scene.layout.lampSupport,null);
 assert.deepEqual(floor.scene.layout.furniture['shop-wall-botanical-frame'],transform);assert.deepEqual(floor.scene.layout.definitions['shop-wall-botanical-frame'],definition);assert.deepEqual(floor.decoration.furnitureStyles,{'shop-wall-botanical-frame':{color:'#ff9900'}});
 for(const hidden of ['moon-ornament','orphan-stock','warehouse','privateInventory','不公开','隐藏月亮'])assert(!json.includes(hidden),hidden+' leaked');assert.equal(JSON.stringify(archive),before,'public projection does not mutate the authoritative save');
});
