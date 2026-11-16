import {Box3,Mesh,PlaneGeometry,MeshBasicMaterial} from './vendor/three/three.module.js';
/** Search is a preview transaction: every candidate is restored before yielding. */
export async function findPlacementSuggestion({manager,id,width,depth,cancelled=()=>false,yieldTask=()=>new Promise(r=>setTimeout(r,0))}){
 const before=manager.snapshot(),original=before.furniture[id];if(!original)return null;const candidates=[];
 for(let x=-width/2+.55;x<width/2-.4;x+=.55)for(let z=-depth/2+.55;z<depth/2-.4;z+=.55){const d=Math.hypot(x-original.position[0],z-original.position[2]);if(d>.65)candidates.push({position:[x,original.position[1],z],d});}
 candidates.sort((a,b)=>a.d-b.d);let count=0;
 for(const candidate of candidates.slice(0,180)){
  if(cancelled())return null;let valid=false;
  try{valid=manager.previewTransform(id,{position:candidate.position})&&manager.validate().valid;}finally{if(!manager.restore(before))throw new Error('原位置恢复失败，请结束装修后重试');}
  if(valid)return {position:candidate.position};
  if(++count%8===0)await yieldTask();
 }return null;
}
export function createPlacementMarkers(scene,furniture){
 const marks=[];function clear(){for(const n of marks){n.removeFromParent();n.geometry.dispose();n.material.dispose();}marks.length=0;}
 function mark(id,color,patch){const root=furniture.get(id);if(!root)return;const box=new Box3().setFromObject(root),dx=patch?patch.position[0]-root.position.x:0,dz=patch?patch.position[2]-root.position.z:0;
  const n=new Mesh(new PlaneGeometry(Math.max(.25,box.max.x-box.min.x)+.18,Math.max(.25,box.max.z-box.min.z)+.18),new MeshBasicMaterial({color,transparent:true,opacity:.32,depthWrite:false,depthTest:false}));n.rotation.x=-Math.PI/2;n.position.set((box.min.x+box.max.x)/2+dx,.12,(box.min.z+box.max.z)/2+dz);n.renderOrder=23;n.userData.placementMarker=true;scene.add(n);marks.push(n);
 }
 return {clear,blocked(ids){clear();for(const id of new Set(ids))mark(id,0xce8070);},suggest(id,patch){clear();mark(id,0x79ac8f,patch);},dispose:clear};
}
