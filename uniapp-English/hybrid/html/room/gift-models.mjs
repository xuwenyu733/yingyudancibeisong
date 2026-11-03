import {Group,Mesh,SphereGeometry,CylinderGeometry,TorusGeometry,ExtrudeGeometry,Shape} from './vendor/three/three.module.js';
import {giftProduct} from './gift-catalog.mjs';
export function createGiftFurniture(sku,materials){
  const product=giftProduct(sku);if(!product)throw new RangeError('未知礼物');
  const root=new Group();root.name=`shop-${sku}`;root.userData.furnitureId=root.name;root.userData.shopSku=sku;root.userData.giftKind=product.giftKind;
  function mesh(geometry,color,x=0,y=0,z=0){const part=new Mesh(geometry,materials(color));part.position.set(x,y,z);part.castShadow=true;part.receiveShadow=true;part.layers.enable(1);root.add(part);return part;}
  const kind=product.giftKind;
  mesh(new CylinderGeometry(.30,.34,.08,16),0xd4af80,0,.04);
  if(kind==='pumpkin'){
    for(let i=0;i<8;i++){const a=i*Math.PI/4,p=mesh(new SphereGeometry(.19,12,9),0xeda54a,Math.cos(a)*.10,.29,Math.sin(a)*.10);p.scale.y=1.12;}
    mesh(new CylinderGeometry(.035,.05,.13,8),0x7b975b,0,.54);
    for(const x of [-.09,.09])mesh(new SphereGeometry(.035,8,6),0xffedb2,x,.34,.265);
    const mouth=mesh(new TorusGeometry(.075,.014,6,12,Math.PI),0xffedb2,0,.225,.278);mouth.rotation.z=Math.PI;
  }else if(kind==='lantern'){
    const light=mesh(new SphereGeometry(.24,16,12),0xf29e8b,0,.40);light.scale.y=1.15;
    for(const y of [.15,.66])mesh(new CylinderGeometry(.13,.13,.045,14),0xe6c574,0,y);
    const loop=mesh(new TorusGeometry(.11,.017,6,18),0xd9b06b,0,.75);loop.scale.y=.8;
    for(const x of [-.07,0,.07])mesh(new CylinderGeometry(.008,.008,.12,6),0xe6c574,x,.14,.18);
  }else if(kind==='flower'){
    mesh(new CylinderGeometry(.18,.14,.22,16),0xd9a0a0,0,.19);mesh(new CylinderGeometry(.012,.012,.35,8),0x7ca575,0,.46);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,p=mesh(new SphereGeometry(.078,10,8),[0xf3acbf,0xb6addf,0xf0ce7e][i%3],Math.cos(a)*.12,.65+Math.sin(a)*.12,.03);p.scale.z=.4;}
    mesh(new SphereGeometry(.07,10,8),0xffde7f,0,.65,.065);
    const leaf=mesh(new SphereGeometry(.07,9,6),0x9cbf83,.055,.43);leaf.scale.set(1,.45,.35);leaf.rotation.z=.6;
  }else{
    mesh(new CylinderGeometry(.018,.018,.24,8),0xcead6b,0,.2);
    const shape=new Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.11:.25;i?shape.lineTo(Math.cos(a)*r,Math.sin(a)*r):shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);}shape.closePath();
    mesh(new ExtrudeGeometry(shape,{depth:.065,bevelEnabled:true,bevelSize:.015,bevelThickness:.012,bevelSegments:1,steps:1}),0xf1ce72,0,.48,-.035);
    for(const x of [-.065,.065])mesh(new SphereGeometry(.015,7,6),0x77583a,x,.50,.06);
  }
  return {root,definition:{label:product.name,draggable:true,blocksNavigation:true,blocksPlacement:true,boxes:[{center:[0,.43,0],size:[.68,.86,.68]}]}};
}
