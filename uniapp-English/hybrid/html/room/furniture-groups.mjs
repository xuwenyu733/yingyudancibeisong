export const GROUPS_SUFFIX='-furniture-groups-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
export function validateGroups(raw){
 const data=typeof raw==='string'?JSON.parse(raw):raw;
 if(!data||data.version!==1||!Array.isArray(data.groups)||data.groups.length>12)throw new Error('家具组合收藏格式无效');
 const seen=new Set();for(const group of data.groups){if(typeof group.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(group.id)||seen.has(group.id)||typeof group.name!=='string'||!group.name.trim()||[...group.name].length>18||/[<>\u0000-\u001f]/.test(group.name)||!Array.isArray(group.items)||!group.items.length||group.items.length>24)throw new Error('组合名字或家具数量无效');seen.add(group.id);
  const ids=new Set();for(const item of group.items){if(typeof item.id!=='string'||!item.id||item.id.length>160||ids.has(item.id))throw new Error('组合家具编号无效');ids.add(item.id);for(const key of ['position','rotation','scale'])if(!Array.isArray(item[key])||item[key].length!==3||item[key].some(n=>!Number.isFinite(n)||Math.abs(n)>1000))throw new Error('组合位置无效');if(item.scale.some(n=>n<=0||n>100)||item.rotation[0]!==0||item.rotation[2]!==0)throw new Error('组合旋转或大小无效');}
 }return clone(data);
}
export function createFurnitureGroups({storage,key}){
 const read=()=>{const raw=storage?.getItem(key);return raw?validateGroups(raw):{version:1,groups:[]};};
 function write(data){const raw=JSON.stringify(validateGroups(data));if(!storage)throw new Error('当前环境无法保存组合');storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw new Error('组合保存失败，请重试');}
 return {list:()=>read().groups,save(name,snapshot,ids){const data=read();if(data.groups.length>=12)throw new Error('最多收藏12个组合，请先删除不用的组合');const items=[...new Set(ids)].map(id=>{if(!snapshot.furniture[id])throw new Error('请先选择房间里的家具');return {id,...clone(snapshot.furniture[id])};});const group={id:'group-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:name.trim(),items};data.groups.push(group);write(data);return group;},remove(id){const data=read();data.groups=data.groups.filter(group=>group.id!==id);write(data);}};
}
