import * as THREE from './vendor/three/three.module.js';
import { RoundedBoxGeometry } from './vendor/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries,mergeVertices } from './vendor/addons/utils/BufferGeometryUtils.js';
import { ROOM as DEFAULT_ROOM, PALETTE as DEFAULT_PALETTE } from './layout.js';

// 轻量几何体补充原图中的窗、花架、地毯等。每件装饰仍是独立Group，方便替换GLB。
// 地面盆栽：浇水交互的固定目标。位置须避开所有家具的“碰撞盒半深+宠物半径”膨胀区，
// 否则角色走不到（原位置 z=-1.30 落在沙发膨胀碰撞盒内，已在 v2.4 迁到前侧开阔处）。
export const FLOOR_POT = Object.freeze({ id: 'floor-pot', position: [1.85, 0, 1.60] });
export function buildDecor(scene, materials, {room=DEFAULT_ROOM,palette=DEFAULT_PALETTE}={}) {
  const ROOM=room,P=palette;
  const items = new Map();
  const geometryCache=new Map();
  const mat = (color) => materials(color);
  function group(id, position=[0,0,0]) {
    const root = new THREE.Group(); root.name=id; root.position.fromArray(position);
    root.userData.furnitureId=id; scene.add(root); items.set(id,root); return root;
  }
  function box(parent, size, position, color, radius=0.04) {
    const key=[...size,radius].join(',');
    if(!geometryCache.has(key))geometryCache.set(key,new RoundedBoxGeometry(...size,1,Math.min(radius,...size.map(v=>v/2))));
    const mesh = new THREE.Mesh(geometryCache.get(key),mat(color));
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
  // 朝向房间的正面加抽屉把手与细踢脚线，让柜子更像真实家具。
  for(const x of [-.42,.42]) cylinder(cabinet,.026,.026,.05,[x,.59,.50],0x8f6a3f,12);
  box(cabinet,[1.24,.05,1.06],[0,.06,0],P.wood,.02);

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
  // 中层搁板放两本书，让花架更像生活角落。
  box(shelf,[.14,.22,.32],[.30,1.31,0],0x9d7bb0,.035);
  box(shelf,[.11,.16,.28],[.26,1.40,0],0xe8b7c2,.03);

  // 后墙装饰画：两幅低多边形小画，挂在窗左侧空墙上。
  const pictures=group('wall-pictures');
  const frameArt=[0x7fb8c8,0xd7a86b];
  for(let i=0;i<2;i++) {
    const fx=-1.35+i*.72;
    box(pictures,[.62,.80,.05],[fx,3.30,-d/2+.12],P.wood,.035);
    box(pictures,[.50,.68,.03],[fx,3.30,-d/2+.145],0xfff6e2,.02);
    box(pictures,[.34,.30,.015],[fx,3.30,-d/2+.158],frameArt[i],.01);
  }

  // 地面盆栽：浇水交互目标（位置见 FLOOR_POT）；可装修拖动，寻路不挡、摆放参与碰撞（见 layout.js COLLIDERS）。
  const pot=group(FLOOR_POT.id,FLOOR_POT.position);
  cylinder(pot,.24,.19,.34,[0,.165,0],0xc5a088,16);
  cylinder(pot,.26,.26,.06,[0,.33,0],0xd9b48f,16);
  for(let k=0;k<7;k++) {
    const angle=k*Math.PI*2/7;
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(.15,8,5),mat(k%2?0x8fb06b:0xa7c77b));
    leaf.scale.set(.42,2.1,.5); leaf.position.set(Math.sin(angle)*.11,.52+((k%3)*.05),Math.cos(angle)*.11);
    leaf.rotation.z=-Math.sin(angle)*.55; leaf.rotation.x=Math.cos(angle)*.55; pot.add(leaf);
  }

  // 窗两侧轻纱帘：与原图色块一致，只有外观。
  for(const s of [-1,1]) box(windowRoot,[.14,hh+.4,.05],[s*(radius+.16),hh/2-.05,.06],0xfff1d2,.025);

  // 原图前侧两只软凳；这些均是可单独移动/删除的独立家具，也是可坐家具（座面顶 y=.73）。
  for(const [id,x,z,color] of [['ottoman-a',-3.10,2.53,0xf6df90],['ottoman-b',-1.65,3.00,0xdce59b]]) {
    const ottoman=group(id,[x,0,z]);
    box(ottoman,[1.12,.40,.88],[0,.53,0],color,.18);
    box(ottoman,[1.02,.08,.78],[0,.69,0],0xfff2c4,.14);
    box(ottoman,[1.18,.10,.94],[0,.24,0],P.wood,.05);
    for(const xx of [-.46,.46]) for(const zz of [-.32,.32]) cylinder(ottoman,.05,.058,.22,[xx,.12,zz],P.wood,10);
  }
  // 前右侧矮围栏，留出主场景视线。
  const fence=group('front-fence',[3.76,0,1.35]);
  for(let z=-1.05;z<=2.30;z+=.38) box(fence,[.075,.89,.12],[0,.49,z],P.cream,.055);
  for(const y of [.28,.65]) box(fence,[.095,.085,3.69],[0,y,.60],P.cream,.03);
  // 同一家具内部按材质合并静态小零件。保留家具Group，减少地毯针脚等的draw call。
  const originalGeometries=new Set();
  for(const root of items.values()) {
    root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map();
    root.traverse(mesh=>{
      if(!mesh.isMesh||mesh===floor)return;
      originalGeometries.add(mesh.geometry);
      let geometry=mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
      if(geometry.index){const nonIndexed=geometry.toNonIndexed();geometry.dispose();geometry=nonIndexed;}
      if(!batches.has(mesh.material))batches.set(mesh.material,[]);
      batches.get(mesh.material).push(geometry);
    });
    root.clear();if(root.name==='room-shell')root.add(floor);
    for(const [material,geometries] of batches) {
      const combined=mergeGeometries(geometries,false);
      if(!combined)throw new Error('装饰几何合并失败');
      geometries.forEach(geometry=>geometry.dispose());
      const compact=mergeVertices(combined);combined.dispose();
      const mesh=new THREE.Mesh(compact,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    }
  }
  originalGeometries.forEach(geometry=>{if(geometry!==floor.geometry)geometry.dispose();});
  return { floor, items };
}
