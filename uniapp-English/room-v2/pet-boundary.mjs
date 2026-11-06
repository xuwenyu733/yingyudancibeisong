// Furniture may reach the room perimeter; the pet's centre must stay a body radius
// plus a visible gap away from all four physical edges, including the open front.
export const PET_BODY_RADIUS=.48;
export const PET_EDGE_GAP=.18;
export function petNavigationBounds(width,depth){
  const inset=PET_BODY_RADIUS+PET_EDGE_GAP;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=inset*2||depth<=inset*2)throw new RangeError('房间太小，无法为伙伴保留安全边距');
  return {minX:-width/2+inset,maxX:width/2-inset,minZ:-depth/2+inset,maxZ:depth/2-inset};
}
export function insidePetBounds(point,bounds){
  return !!point&&Number.isFinite(point.x)&&Number.isFinite(point.z)&&point.x>=bounds.minX&&point.x<=bounds.maxX&&point.z>=bounds.minZ&&point.z<=bounds.maxZ;
}
