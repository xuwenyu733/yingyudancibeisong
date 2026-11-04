import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOM, PALETTE as P } from './layout.js';

// 轻量几何体补充原图中的窗、花架、地毯等。每件装饰仍是独立Group，方便替换GLB。
export function buildDecor(scene, materials) {
  const items = new Map();
  const mat = (color) => materials(color);
  function group(id, position=[0,0,0]) {
    const root = new THREE.Group(); root.name=id; root.position.fromArray(position);
    root.userData.furnitureId=id; scene.add(root); items.set(id,root); return root;
  }
  function box(parent, size, position, color, radius=0.04) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, Math.min(radius,...size.map(v=>v/2))),mat(color));
    mesh.position.fromArray(position); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
  }
  function cylinder(parent,r1,r2,height,position,color,segments=20) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,height,segments),mat(color));
    mesh.position.fromArray(position); mesh.castShadow=true; parent.add(mesh); return mesh;
  }
  const shell=group('room-shell');
  const {width:w, depth:d, wallHeight:h}=ROOM;
  box(shell,[w+.22,.30,d+.22],[0,-.18,0],P.floorEdge,.10);
  const floor=box(shell,[w,.10,d],[0,-.015,0],P.floor,.04); floor.name='walkable-floor'; floor.castShadow=false;
  // 单面后墙保持原图的开放切面；固定镜头不需要拖动墙体。
  box(shell,[w,.18+h,.14],[0,h/2-.03,-d/2],P.wall,.04);
  for(let x=-w/2+.28;x<w/2;x+=.7) box(shell,[.32,h-.12,.012],[x,h/2,-d/2+.079],P.stripe,.002);
  box(shell,[w,.24,.10],[0,.15,-d/2+.12],P.trim,.025);
  box(shell,[w,.06,.12],[0,.30,-d/2+.13],0xe9c79a,.02);
  const rug=group('rug',[.32,.047,-.03]);
  box(rug,[5.32,.045,5.22],[0,0,0],P.rug,.22);
  // 虚线边框，长条和小片都使用低面数几何体。
  for(let i=0;i<19;i++) {
    const v=-2.38+i*.263;
    box(rug,[.13,.01,.026],[v,.027,-2.40],P.rugLine,.012);
    box(rug,[.13,.01,.026],[v,.027,2.40],P.rugLine,.012);
    box(rug,[.026,.01,.13],[-2.44,.027,v],P.rugLine,.012);
    box(rug,[.026,.01,.13],[2.44,.027,v],P.rugLine,.012);
  }
  // 花叶纹只在地毯边角，避免遮挡行走路径。
  for(const [x,z,angle] of [[-2.05,1.95,.5],[2.06,1.95,-.5],[-2.05,-1.95,2.6],[2.05,-1.95,-2.6]]) {
    const sprig=new THREE.Group(); sprig.position.set(x,.032,z); sprig.rotation.y=angle; rug.add(sprig);
    box(sprig,[.025,.008,.75],[0,0,0],P.rugLine,.003);
    for(let j=0;j<3;j++) for(const s of [-1,1]) {
      const leaf=new THREE.Mesh(new THREE.SphereGeometry(.10,8,4),mat(P.rugLine));
      leaf.scale.set(.65,.08,1.3); leaf.position.set(.09*s,.005,-.22+j*.22); leaf.rotation.y=s*.6; sprig.add(leaf);
    }
  }
  const cabinet=group('lamp-cabinet',[-2.37,0,-2.45]);
  box(cabinet,[1.27,.13,1.14],[0,1.055,0],P.wood,.045);
  box(cabinet,[1.18,.10,1.02],[0,.12,0],P.cream,.035);
  for(const x of [-.54,.54]) box(cabinet,[.10,.87,1.02],[x,.58,0],P.cream,.025);
  box(cabinet,[1.10,.85,.07],[0,.59,-.46],0xf1ce91,.025);
  box(cabinet,[.07,.85,.98],[0,.58,-.01],0xe3bd83,.01);

  // 拱形窗：Shape内轮廓和圆角木框均是场景几何体，不依赖贴图。
  const windowRoot=group('arched-window',[1.20,2.18,-d/2+.10]);
  const ww=2.75, hh=2.45, radius=ww/2, archY=hh-radius;
  const shape=new THREE.Shape(); shape.moveTo(-radius,0); shape.lineTo(radius,0); shape.lineTo(radius,archY);
  shape.absarc(0,archY,radius,0,Math.PI,false); shape.lineTo(-radius,0);
  const sky=new THREE.Mesh(new THREE.ShapeGeometry(shape,32),new THREE.MeshBasicMaterial({color:0xe3f4ed}));
  sky.position.z=.015; windowRoot.add(sky);
  box(windowRoot,[ww+.20,.14,.14],[0,0,.08],P.wood,.03);
  for(const x of [-radius,radius]) box(windowRoot,[.14,archY+.06,.14],[x,archY/2,.08],P.wood,.03);
  const arc=new THREE.Mesh(new THREE.TorusGeometry(radius,.075,8,48,Math.PI),mat(P.wood));
  arc.position.set(0,archY,.08); windowRoot.add(arc);
  box(windowRoot,[ww,.12,.13],[0,archY,.09],P.wood,.025);
  box(windowRoot,[.09,radius,.12],[0,archY+radius/2,.09],P.wood,.02);
  for(const angle of [Math.PI/4,Math.PI*3/4]) {
    const bar=box(windowRoot,[radius,.075,.12],[Math.cos(angle)*radius/2,archY+Math.sin(angle)*radius/2,.09],P.wood,.025);
    bar.rotation.z=angle;
  }
  // 百叶遮阳帘与窗外灌木对应原图的主要色块。
  box(windowRoot,[ww-.18,.91,.035],[0,archY-.49,.06],0xfff5d7,.015);
  for(let y=archY-.92;y<archY-.06;y+=.14) box(windowRoot,[ww-.18,.018,.04],[0,y,.085],0xe9dcb8,.004);
  box(windowRoot,[ww,.07,.13],[0,archY-.97,.09],P.wood,.02);
  for(let j=0;j<7;j++) {
    const bush=new THREE.Mesh(new THREE.SphereGeometry(.27+Math.sin(j)*.05,12,8),mat(j%2?0xb7ce7b:0xa4bd6b));
    bush.scale.set(1,.8,.14); bush.position.set(-1.05+j*.35,.20+Math.sin(j*2)*.08,.045); windowRoot.add(bush);
  }
  const shelf=group('plant-shelf',[-3.67,0,-2.54]);
  for(const y of [.30,1.25,2.17]) box(shelf,[.94,.09,.75],[0,y,0],0xe8c38b,.035);
  for(const x of [-.39,.39]) for(const z of [-.30,.30]) cylinder(shelf,.042,.042,2.43,[x,1.24,z],P.wood,10);
  function plant(parent,base,scale=1) {
    const g=new THREE.Group(); g.position.fromArray(base); g.scale.setScalar(scale); parent.add(g);
    cylinder(g,.23,.16,.33,[0,.17,0],0xb49075,16);
    cylinder(g,.24,.24,.065,[0,.33,0],0xc5a088,16);
    for(let k=0;k<9;k++) {
      const angle=k*Math.PI*2/9;
      const leaf=new THREE.Mesh(new THREE.SphereGeometry(.18,8,5),mat(k%2?0x88ad68:0xa7c77b));
      leaf.scale.set(.40,2.2,.52); leaf.position.set(Math.sin(angle)*.14,.58+((k%3)*.06),Math.cos(angle)*.14);
      leaf.rotation.z=-Math.sin(angle)*.55; leaf.rotation.x=Math.cos(angle)*.55; g.add(leaf);
    }
  }
  plant(shelf,[0,2.20,0],1.10);
  cylinder(shelf,.10,.17,.33,[.12,1.46,0],P.cream,14);
  const flowerStem=cylinder(shelf,.015,.015,.37,[.12,1.77,0],0x90a66b,7);
  const blossom=new THREE.Mesh(new THREE.SphereGeometry(.095,8,6),mat(0xf2bf68));blossom.position.set(.12,1.99,0);shelf.add(blossom);

  // 原图前侧两只软凳；这些均是可单独移动/删除的独立家具。
  for(const [id,x,z,color] of [['ottoman-a',-3.10,2.53,0xf6df90],['ottoman-b',-1.65,3.00,0xdce59b]]) {
    const ottoman=group(id,[x,0,z]);
    box(ottoman,[1.16,.46,.92],[0,.48,0],color,.14);
    box(ottoman,[1.24,.10,.99],[0,.23,0],P.wood,.035);
    for(const xx of [-.54,.54]) for(const zz of [-.39,.39]) cylinder(ottoman,.044,.052,.36,[xx,.20,zz],P.wood,8);
  }
  // 前右侧矮围栏，留出主场景视线。
  const fence=group('front-fence',[3.76,0,1.35]);
  for(let z=-1.05;z<=2.30;z+=.38) box(fence,[.075,.89,.12],[0,.49,z],P.cream,.055);
  for(const y of [.28,.65]) box(fence,[.095,.085,3.69],[0,y,.60],P.cream,.03);
  return { floor, items };
}
