import {drawFurnitureDrawing} from './drawing.mjs';
/** Drawings own their textures; account furniture transforms stay intact. */
export function createCreativeScene({THREE,scene,doc,getSize}){
  const root=new THREE.Group();root.name='creative-wall';scene.add(root);let signature='',disposed=false;
  function release(){for(const child of [...root.children]){child.geometry?.dispose();child.material?.map?.dispose();child.material?.dispose();root.remove(child);}}
  function sync(state){
    if(disposed)return;const size=getSize(),next=JSON.stringify([state.wallDrawing,size]);if(next===signature)return;signature=next;release();
    if(!state.wallDrawing?.strokes?.length)return;
    const canvas=doc.createElement('canvas');canvas.width=512;canvas.height=320;const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#fff5df';ctx.fillRect(0,0,512,320);const ink=doc.createElement('canvas');ink.width=512;ink.height=320;drawFurnitureDrawing(ink.getContext('2d'),state.wallDrawing,512,320);ctx.drawImage(ink,0,0);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.5),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(-size.width/2+1.7,3.1,-size.depth/2+.25);mesh.layers.enable(1);root.add(mesh);
  }
  return {sync,dispose(){disposed=true;release();root.removeFromParent();}};
}
