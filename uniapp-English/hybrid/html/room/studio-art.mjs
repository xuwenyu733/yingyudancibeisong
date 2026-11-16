export const ROOM_ART = Object.freeze([
  {id:'original',name:'暖暖原木',subtitle:'奶油阳光 · 温暖的第一间家',colors:['#f2e4c8','#c4955e','#809a72'],background:'#f3eddc',ink:'#65503a',tint:'#ecd6af',icon:'☀'},
  {id:'forest',name:'森林书房',subtitle:'苔绿与胡桃木 · 把自然带回家',colors:['#dce5d0','#749484','#b58961'],background:'#eaf0e4',ink:'#355c4c',tint:'#93ba99',icon:'♧'},
  {id:'space',name:'星空基地',subtitle:'雾蓝与星光金 · 留一盏探索的灯',colors:['#d9e1ef','#7389b0','#e5ba70'],background:'#e5ebf4',ink:'#3c5078',tint:'#9fb9e5',icon:'✦'},
  {id:'ocean',name:'海洋研究室',subtitle:'海盐蓝与珊瑚 · 听见清新的海风',colors:['#d4e9e8','#70aaa9','#dfa58e'],background:'#e5f1ef',ink:'#386e73',tint:'#8acbcb',icon:'≈'},
]);
export const artById=id=>ROOM_ART.find(x=>x.id===id)||ROOM_ART[0];
export const STUDIO_STEPS=['theme','trial','arrange','interact','plant','cook'];
export function groupTransforms(layout,ids,{dx=0,dz=0,angle=0,align=null}={}){
  if(![dx,dz,angle].every(Number.isFinite)||!ids.length||ids.some(id=>!layout.furniture[id]))throw new Error('请先选择房间里的家具');
  const items=ids.map(id=>layout.furniture[id]),cx=items.reduce((s,v)=>s+v.position[0],0)/items.length,cz=items.reduce((s,v)=>s+v.position[2],0)/items.length;
  return Object.fromEntries(ids.map((id,i)=>{const item=items[i],x=item.position[0]-cx,z=item.position[2]-cz;
    return [id,{position:[align==='x'?cx:cx+x*Math.cos(angle)+z*Math.sin(angle)+dx,item.position[1],align==='z'?cz:cz-x*Math.sin(angle)+z*Math.cos(angle)+dz],rotation:[0,item.rotation[1]+angle,0]}];}));
}
