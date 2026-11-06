import {makeGuestKey} from './account-session.mjs';
import {createEstateStore} from './estate-state.mjs';
const KEY='pet-room-direct-home-v1',valid=key=>typeof key==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(key);
export function rememberDirectHome(storage,key){if(!valid(key))throw new TypeError('小屋编号无效');try{storage?.setItem(KEY,key);}catch{}return key;}
export function resolveDirectHome(storage){
 try{
  const saved=storage?.getItem(KEY);if(valid(saved))return saved;
  const candidates=[];for(let i=0;i<(storage?.length||0);i++){const name=storage.key(i),match=/^(pet-room-guest-([a-z0-9]+)-[a-z0-9]+)-estate-v1$/.exec(name||'');if(match)candidates.push({key:match[1],time:parseInt(match[2],36)});}
  candidates.sort((a,b)=>b.time-a.time);
  if(candidates.length)return rememberDirectHome(storage,candidates[0].key);
  if(storage?.getItem('hamster-room-layout-v3-estate-v1'))return rememberDirectHome(storage,'hamster-room-layout-v3');
 }catch{}
 return rememberDirectHome(storage,makeGuestKey());
}
/** Copy only this browser's house into a new local namespace. Remote saves still
 * take precedence in database-sync. Neither the source nor another house is deleted. */
export function carryLocalHouse(storage,from,to){
 if(!storage||from===to||!valid(from)||!valid(to)||!storage.getItem(from+'-estate-v1')||storage.getItem(to+'-estate-v1'))return {copied:false};
 const values=new Map();for(let i=0;i<storage.length;i++){const key=storage.key(i);if((key===from||key?.startsWith(from+'-'))&&!key.endsWith('-mysql-sync-v1'))values.set(key,storage.getItem(key));}
 const adapter=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
 const source=createEstateStore({storageAdapter:adapter(values),storageKey:from}).exportArchive();if(!source.ok)throw new Error(source.message);
 const archive=structuredClone(source.archive),first=archive.estate.rooms.find(room=>room.id==='room-1');if(first&&!first.scene.layout&&values.has(from))first.extras[from]=values.get(from);
 // The full archive records its source namespace; importArchive performs the
 // remapping once, including checkpoints and overlapping namespace prefixes.
 const target=new Map(),imported=createEstateStore({storageAdapter:adapter(target),storageKey:to}).importArchive(archive);if(!imported.ok)throw new Error(imported.message);
 const old=new Map();try{for(const [key,value]of target){old.set(key,storage.getItem(key));storage.setItem(key,value);if(storage.getItem(key)!==value)throw new Error('本机空间不足，小屋原进度已保留');}}
 catch(error){for(const [key,value]of old)try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{}throw error;}
 return {copied:true};
}
