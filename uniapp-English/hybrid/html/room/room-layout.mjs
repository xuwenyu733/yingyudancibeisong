/** Preserve the snapshot envelope while reconciling a saved room with today's inventory. */
export function compatibleRoomLayout(target,current){
  if(!target||target.version!==3||!target.furniture||!target.definitions)throw new TypeError('这个房型的布局格式暂时无法恢复');
  const result=JSON.parse(JSON.stringify(current));
  for(const id of Object.keys(result.furniture))if(Object.hasOwn(target.furniture,id)&&Object.hasOwn(target.definitions,id)){result.furniture[id]=JSON.parse(JSON.stringify(target.furniture[id]));result.definitions[id]=JSON.parse(JSON.stringify(target.definitions[id]));}
  result.lampSupport=target.lampSupport&&Object.hasOwn(result.furniture,target.lampSupport)&&Object.hasOwn(result.furniture,'lamp')?target.lampSupport:null;
  return result;
}
