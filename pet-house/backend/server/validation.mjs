import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const MAX_BODY=16*1024*1024;
export const validNamespace=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(value);
export function stableEntries(entries){return JSON.stringify(Object.fromEntries(Object.keys(entries).sort().map(key=>[key,entries[key]])));}
export async function createValidator(sourceRoot){
  const {createEstateStore}=await import(pathToFileURL(resolve(sourceRoot,'estate-state.mjs')).href);
  return function validate(namespace,entries){
    if(!validNamespace(namespace)||!entries||Object.getPrototypeOf(entries)!==Object.prototype||Object.keys(entries).length>80)throw new Error('存档命名空间或条目格式无效');
    for(const [key,value] of Object.entries(entries))if(!(key===namespace||key.startsWith(namespace+'-'))||key===namespace+'-mysql-sync-v1'||typeof value!=='string'||Buffer.byteLength(value)>8*1024*1024)throw new Error('存储键超出当前账户范围或内容太大');
    if(Buffer.byteLength(stableEntries(entries))>MAX_BODY-4096)throw new Error('整份存档超过16MB');
    // The sync timer can run only after a synchronous room transaction completes.
    // Refuse a request that contains no estate/account yet, rather than making fake data.
    if(!entries[namespace+'-estate-v1']&&!entries[namespace+'-account-v1'])throw new Error('请先打开小屋完成存档初始化');
    const map=new Map(Object.entries(entries)),adapter={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
    const estate=createEstateStore({storageAdapter:adapter,storageKey:namespace});
    const result=estate.exportArchive();if(!result.ok)throw new Error(result.message||'存档校验失败');
    // Reuse the public import validator too; this covers profile and all floor projections.
    const verifier=createEstateStore({storageAdapter:null,storageKey:namespace});const accepted=verifier.importArchive(result.archive);if(!accepted.ok)throw new Error(accepted.message);
    const canonical=verifier.exportArchive().archive;
    const hashInput=JSON.stringify({...canonical,exportedAt:null});
    return {archive:canonical,entries,sha256:createHash('sha256').update(hashInput).digest('hex')};
  };
}
