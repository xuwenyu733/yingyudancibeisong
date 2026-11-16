import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const defaultPet=()=>({sku:'apricot-fox',petName:'团团',outfit:{hat:'none',scarf:'none',backpack:'none'},growthStage:'baby'});
const defaults={'lamp-cabinet':[-2.37,0,-2.45],'plant-shelf':[-3.67,0,-2.54],'floor-pot':[1.85,0,1.60],'ottoman-a':[-3.10,0,2.53],'ottoman-b':[-1.65,0,3],'front-fence':[3.76,0,1.35]};
const kinds={sofa:'seat','ottoman-a':'seat','ottoman-b':'seat','floor-pot':'water','shop-clover-planter':'water','shop-reading-shelf':'read',table:'tea','shop-cloud-table':'tea','shop-star-lamp':'light','shop-rocket-toy':'rocket',lamp:'lamp'};
const variants={read:['forest','stars','ocean'],tea:['garden','berry','picnic']};
/** A legacy null layout uses automatic placement; never publish hidden inventory. */
export function displayedVisitItems(scene,owned=[],isFurniture=()=>true){
 const held=new Set(owned),stored=new Set(scene.stored||[]),candidates=scene.layout?Object.keys(scene.layout.furniture||{}).filter(id=>id.startsWith('shop-')).map(id=>id.slice(5)):owned;
 return [...new Set(candidates)].filter(sku=>held.has(sku)&&!stored.has(sku)&&!stored.has('shop-'+sku)&&isFurniture(sku));
}
/** Public geometry is a fresh whitelist projection, including legacy saved layouts. */
export function publicVisitLayout(layout,visibleIds){
 if(layout===null||layout===undefined)return null;
 const furniture={},definitions={};
 for(const [id,transform]of Object.entries(layout.furniture||{}))if(visibleIds.has(id)){
  furniture[id]=Object.fromEntries(['position','rotation','scale'].map(key=>[key,Array.isArray(transform[key])?[...transform[key]]:transform[key]]));
  const definition=layout.definitions?.[id];if(definition){const projected={boxes:definition.boxes.map(box=>({center:[...box.center],size:[...box.size]}))};
   if(typeof definition.label==='string')projected.label=definition.label.slice(0,100);
   for(const flag of ['blocksNavigation','blocksPlacement','draggable','locked'])if(typeof definition[flag]==='boolean')projected[flag]=definition[flag];
   definitions[id]=projected;
  }
 }
 return {version:3,furniture,definitions,lampSupport:visibleIds.has('lamp')&&Object.hasOwn(furniture,layout.lampSupport)?layout.lampSupport:null};
}
/** Cache only public appearance and interaction geometry, keyed by authoritative revision. */
export function createVisitPublicHomes(pool,{repository,validate,sourceRoot,now=Date.now}={}){
 const cache=new Map();let imports,cacheWeight=0;
 const forget=key=>{const row=cache.get(key);if(row){cacheWeight-=row.weight;cache.delete(key);}};
 const modules=()=>imports??=(sourceRoot?Promise.all(['room-world.mjs','economy.mjs','growth.mjs','layout.js','pet-boundary.mjs'].map(file=>import(pathToFileURL(resolve(sourceRoot,file)).href))):Promise.resolve([{}, {}, {}, {}, {}]));
 async function loadHome(accountKey,knownRevision){
  let revision=knownRevision;
  if(revision===undefined){const [rows]=await pool.execute('SELECT revision FROM sys_save_slots WHERE namespace=?',[accountKey]);revision=Number(rows[0]?.revision)||0;}
  const cached=cache.get(accountKey);
  if(cached&&cached.revision===revision&&cached.until>now())return cached.home;
  const saved=await repository.load(accountKey),[world,economy,growth,layout,petBoundary]=await modules();
  const estate=saved.entries?validate(accountKey,saved.entries).archive.estate:null,companion=estate?.companion||{},bank=estate?.bank||{};
  const pet={...defaultPet(),sku:bank.activePet||'apricot-fox',petName:companion.petName||'团团',outfit:{hat:companion.outfit?.hat||'none',scarf:companion.outfit?.scarf||'none',backpack:companion.outfit?.backpack||'none'},growthStage:growth.growthFor?.(companion).id||'baby'};
  const floors=(estate?.rooms||[]).map(room=>{
   const scene=world.snapshotRoom&&room.scene?world.snapshotRoom(room,{storageKey:accountKey,legacyLayout:room.id==='room-1'?saved.entries[accountKey]:undefined}).scene:room.scene||{},tier=economy.ROOM_TIERS?.[scene.roomLevel]||{width:8.8,depth:8.2},bounds=petBoundary.petNavigationBounds?.(tier.width,tier.depth)||{minX:-tier.width/2+.66,maxX:tier.width/2-.66,minZ:-tier.depth/2+.66,maxZ:tier.depth/2-.66},targets=new Map(),obstacles=[];
   const transforms=scene.layout?.furniture||{},stored=new Set(scene.stored||[]),owned=new Set(bank.owned||[]);
   const ids=new Set([...Object.keys(kinds),...Object.keys(defaults),...Object.keys(transforms),...[...owned].map(sku=>'shop-'+sku)]);
   for(const id of ids){const base=id.replace(/--copy-\d+$/,''),sku=id.startsWith('shop-')?id.slice(5):id;if(stored.has(sku)||stored.has(id)||id.startsWith('shop-')&&!owned.has(sku)||scene.layout&&!Object.hasOwn(transforms,id))continue;
    const original=layout.FURNITURE?.[id],transform=transforms[id]||original||(defaults[id]?{position:defaults[id],rotation:[0,0,0],scale:[1,1,1]}:null),definition=scene.layout?.definitions?.[id]||layout.COLLIDERS?.[id];
    if(transform&&definition?.blocksNavigation!==false){const [x,,z]=transform.position,scale=Array.isArray(transform.scale)?transform.scale:[transform.scale||1,transform.scale||1,transform.scale||1],angle=transform.rotation?.[1]||0,c=Math.cos(angle),s=Math.sin(angle);for(const box of definition?.boxes||[]){const dx=box.center[0]*scale[0],dz=box.center[2]*scale[2],cx=x+dx*c+dz*s,cz=z-dx*s+dz*c,hx=(Math.abs(box.size[0]*scale[0]*c)+Math.abs(box.size[2]*scale[2]*s))/2+.48,hz=(Math.abs(box.size[0]*scale[0]*s)+Math.abs(box.size[2]*scale[2]*c))/2+.48;obstacles.push({minX:cx-hx,maxX:cx+hx,minZ:cz-hz,maxZ:cz+hz});}}
    if(kinds[base])targets.set(id,{id,kind:kinds[base],position:transform?{x:transform.position[0],z:transform.position[2]}:null,fingerprint:createHash('sha256').update(JSON.stringify({roomId:room.id,level:scene.roomLevel||0,id,transform,definition})).digest('hex')});
   }
   const inside=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z)&&p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
   return {id:room.id,floor:room.floor,name:room.name,targets,bounds,inside,cacheWeight:1+targets.size+obstacles.length,greetPoint(p){for(const [dx,dz]of [[0,1.15],[1.15,0],[-1.15,0],[0,-1.15],[.9,.9],[-.9,.9],[.9,-.9],[-.9,-.9]]){const q={x:p.x+dx,z:p.z+dz};if(inside(q)&&!obstacles.some(b=>q.x>=b.minX&&q.x<=b.maxX&&q.z>=b.minZ&&q.z<=b.maxZ))return q;}return null;}};
  });
  const home={revision:Number(saved.revision)||revision,pet,floors};
  const weight=1+floors.reduce((sum,floor)=>sum+floor.cacheWeight,0);forget(accountKey);
  for(const [key,row]of cache)if(row.until<=now())forget(key);
  while(cache.size&&(cache.size>=1000||cacheWeight+weight>50000))forget(cache.keys().next().value);
  if(weight<=50000){cache.set(accountKey,{revision:home.revision,home,until:now()+30000,weight});cacheWeight+=weight;}return home;
 }
 const publicHome=accountKey=>loadHome(accountKey);
 publicHome.many=async accountKeys=>{
  const keys=[...new Set(accountKeys)];if(keys.length>12)throw new RangeError('来访人数超过公开快照上限');if(!keys.length)return new Map();
  const [rows]=await pool.execute('SELECT namespace,revision FROM sys_save_slots WHERE namespace IN ('+keys.map(()=>'?').join(',')+')',keys),revisions=new Map(rows.map(row=>[row.namespace,Number(row.revision)||0])),result=new Map();
  // The revisions originate only in this trusted query. Missing accounts use
  // their default public animal; saved metadata is still revision-validated.
  for(const key of keys)result.set(key,await loadHome(key,revisions.get(key)||0));return result;
 };
 return publicHome;
}
export function visitTarget(floor,input,{host=false}={}){
 const target=floor.targets.get(input.targetId);if(!target)return null;
 let seat;
 if(input.seatId!==undefined&&input.seatId!==null){
  if(host&&target.kind==='tea'){seat=floor.targets.get(input.seatId);if(seat?.kind!=='seat'||!seat.position||!target.position||Math.hypot(seat.position.x-target.position.x,seat.position.z-target.position.z)>3.5)throw Object.assign(Error('请使用桌边可以坐下的座位'),{status:400,code:'INVALID_VISIT_SEAT'});}
  else if(target.kind!=='seat'||!['main',input.targetId].includes(input.seatId))throw Object.assign(Error('座位编号无效'),{status:400,code:'INVALID_VISIT_SEAT'});
 }
 const allowed=variants[target.kind];if(input.variant!==undefined&&(!allowed||!allowed.includes(input.variant)))throw Object.assign(Error('互动选项无效'),{status:400,code:'INVALID_VISIT_VARIANT'});
 return {...target,...(allowed?{variant:input.variant||allowed[0]}:{}),...(seat?{seatId:seat.id,seatFingerprint:seat.fingerprint}:{})};
}
