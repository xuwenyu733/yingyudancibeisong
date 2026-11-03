import * as THREE from './vendor/three/three.module.js';
import { RoundedBoxGeometry } from './vendor/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries,mergeVertices } from './vendor/addons/utils/BufferGeometryUtils.js';
import { ROOM as DEFAULT_ROOM, PALETTE as DEFAULT_PALETTE } from './layout.js';

// 轻量几何体补充原图中的窗、花架、地毯等。每件装饰仍是独立Group，方便替换GLB。
// 地面盆栽：浇水交互的固定目标。位置须避开所有家具的“碰撞盒半深+宠物半径”膨胀区，
// 否则角色走不到（原位置 z=-1.30 落在沙发膨胀碰撞盒内，已在 v2.4 迁到前侧开阔处）。
export const FLOOR_POT = Object.freeze({ id: 'floor-pot', position: [1.85, 0, 1.60] });
// 可收回仓库的固有装饰根（房间结构 room-shell/arched-window 除外）。
export const STORABLE_DECOR = Object.freeze([
  Object.freeze({id:'rug',name:'大地毯',position:[.32,.047,-.03]}),
  Object.freeze({id:'lamp-cabinet',name:'小柜子',position:[-2.37,0,-2.45]}),
  Object.freeze({id:'plant-shelf',name:'花架',position:[-3.67,0,-2.54]}),
  Object.freeze({id:'wall-pictures',name:'装饰画',position:[0,0,0]}),
  Object.freeze({id:'floor-pot',name:'地面盆栽',position:FLOOR_POT.position.slice()}),
  Object.freeze({id:'ottoman-a',name:'软凳A',position:[-3.10,0,2.53]}),
  Object.freeze({id:'ottoman-b',name:'软凳B',position:[-1.65,0,3.00]}),
  Object.freeze({id:'front-fence',name:'前栅栏',position:[3.76,0,1.35]}),
]);
function decorCtx(scene,materials,room,palette){
  const geometryCache=new Map();
  const mat=color=>materials(color);
  function group(id,position=[0,0,0]){
    const root=new THREE.Group();root.name=id;root.position.fromArray(position);
    root.userData.furnitureId=id;scene.add(root);return root;
  }
  function box(parent,size,position,color,radius=0.04){
    const key=[...size,radius].join(',');
    if(!geometryCache.has(key))geometryCache.set(key,new RoundedBoxGeometry(...size,1,Math.min(radius,...size.map(v=>v/2))));
    const mesh=new THREE.Mesh(geometryCache.get(key),mat(color));
    mesh.position.fromArray(position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function cylinder(parent,r1,r2,height,position,color,segments=20){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,height,segments),mat(color));
    mesh.position.fromArray(position);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  return {room,palette,mat,group,box,cylinder,geometryCache};
}
function buildRug(ctx){const r=ctx.group('rug',[.32,.047,-.03]),box=ctx.box;const l=box.bind(null,r);
  l([5.32,.045,5.22],[0,0,0],ctx.palette.rug,.22);
  for(let i=0;i<19;i++){const v=-2.38+i*.263;l([.13,.01,.026],[v,.027,-2.40],ctx.palette.rugLine,.012);l([.13,.01,.026],[v,.027,2.40],ctx.palette.rugLine,.012);l([.026,.01,.13],[-2.44,.027,v],ctx.palette.rugLine,.012);l([.026,.01,.13],[2.44,.027,v],ctx.palette.rugLine,.012);}
  for(const [x,z,angle] of [[-2.05,1.95,.5],[2.06,1.95,-.5],[-2.05,-1.95,2.6],[2.05,-1.95,-2.6]]){
    const sprig=new THREE.Group();sprig.position.set(x,.032,z);sprig.rotation.y=angle;r.add(sprig);
    l([.025,.008,.75],[0,0,0],ctx.palette.rugLine,.003);
    for(let j=0;j<3;j++)for(const s of [-1,1]){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.10,8,4),ctx.mat(ctx.palette.rugLine));leaf.scale.set(.65,.08,1.3);leaf.position.set(.09*s,.005,-.22+j*.22);leaf.rotation.y=s*.6;sprig.add(leaf);}
  }
  return r;
}
function buildCabinet(ctx){const c=ctx.group('lamp-cabinet',[-2.37,0,-2.45]),box=ctx.box,l=box.bind(null,c);
  l([1.27,.13,1.14],[0,1.055,0],ctx.palette.wood,.045);l([1.18,.10,1.02],[0,.12,0],ctx.palette.cream,.035);
  for(const x of [-.54,.54])l([.10,.87,1.02],[x,.58,0],ctx.palette.cream,.025);
  l([1.10,.85,.07],[0,.59,-.46],0xf1ce91,.025);l([.07,.85,.98],[0,.58,-.01],0xe3bd83,.01);
  for(const x of [-.42,.42])ctx.cylinder(c,.026,.026,.05,[x,.59,.50],0x8f6a3f,12);
  l([1.24,.05,1.06],[0,.06,0],ctx.palette.wood,.02);
  return c;
}
function buildShelf(ctx){const s=ctx.group('plant-shelf',[-3.67,0,-2.54]),box=ctx.box,l=box.bind(null,s);
  for(const y of [.30,1.25,2.17])l([.94,.09,.75],[0,y,0],0xe8c38b,.035);
  for(const x of [-.39,.39])for(const z of [-.30,.30])ctx.cylinder(s,.042,.042,2.43,[x,1.24,z],ctx.palette.wood,10);
  function plant(base,scale=1){const g=new THREE.Group();g.position.fromArray(base);g.scale.setScalar(scale);s.add(g);
    ctx.cylinder(g,.23,.16,.33,[0,.17,0],0xb49075,16);ctx.cylinder(g,.24,.24,.065,[0,.33,0],0xc5a088,16);
    for(let k=0;k<9;k++){const angle=k*Math.PI*2/9;const leaf=new THREE.Mesh(new THREE.SphereGeometry(.18,8,5),ctx.mat(k%2?0x88ad68:0xa7c77b));leaf.scale.set(.40,2.2,.52);leaf.position.set(Math.sin(angle)*.14,.58+((k%3)*.06),Math.cos(angle)*.14);leaf.rotation.z=-Math.sin(angle)*.55;leaf.rotation.x=Math.cos(angle)*.55;g.add(leaf);}
  }
  plant([0,2.20,0],1.10);
  ctx.cylinder(s,.10,.17,.33,[.12,1.46,0],ctx.palette.cream,14);
  const stem=ctx.cylinder(s,.015,.015,.37,[.12,1.77,0],0x90a66b,7);
  const blossom=new THREE.Mesh(new THREE.SphereGeometry(.095,8,6),ctx.mat(0xf2bf68));blossom.position.set(.12,1.99,0);s.add(blossom);
  l([.14,.22,.32],[.30,1.31,0],0x9d7bb0,.035);l([.11,.16,.28],[.26,1.40,0],0xe8b7c2,.03);
  return s;
}
function buildPictures(ctx){const p=ctx.group('wall-pictures'),box=ctx.box,l=box.bind(null,p);const d=ctx.room.depth;
  for(const [i,color] of [[0,0x7fb8c8],[1,0xd7a86b]]){const fx=-1.35+i*.72;
    l([.62,.80,.05],[fx,3.30,-d/2+.12],ctx.palette.wood,.035);l([.50,.68,.03],[fx,3.30,-d/2+.145],0xfff6e2,.02);l([.34,.30,.015],[fx,3.30,-d/2+.158],color,.01);
  }
  return p;
}
function buildPot(ctx){const p=ctx.group(FLOOR_POT.id,FLOOR_POT.position);
  ctx.cylinder(p,.24,.19,.34,[0,.165,0],0xc5a088,16);ctx.cylinder(p,.26,.26,.06,[0,.33,0],0xd9b48f,16);
  for(let k=0;k<7;k++){const angle=k*Math.PI*2/7;
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(.15,8,5),ctx.mat(k%2?0x8fb06b:0xa7c77b));
    leaf.scale.set(.42,2.1,.5);leaf.position.set(Math.sin(angle)*.11,.52+((k%3)*.05),Math.cos(angle)*.11);
    leaf.rotation.z=-Math.sin(angle)*.55;leaf.rotation.x=Math.cos(angle)*.55;p.add(leaf);
  }
  return p;
}
function buildOttoman(ctx,id,x,z,color){const o=ctx.group(id,[x,0,z]),box=ctx.box,l=box.bind(null,o);
  l([1.12,.40,.88],[0,.53,0],color,.18);l([1.02,.08,.78],[0,.69,0],0xfff2c4,.14);l([1.18,.10,.94],[0,.24,0],ctx.palette.wood,.05);
  for(const xx of [-.46,.46])for(const zz of [-.32,.32])ctx.cylinder(o,.05,.058,.22,[xx,.12,zz],ctx.palette.wood,10);
  return o;
}
function buildFence(ctx){const f=ctx.group('front-fence',[3.76,0,1.35]),box=ctx.box,l=box.bind(null,f);
  for(let z=-1.05;z<=2.30;z+=.38)l([.075,.89,.12],[0,.49,z],ctx.palette.cream,.055);
  for(const y of [.28,.65])l([.095,.085,3.69],[0,y,.60],ctx.palette.cream,.03);
  return f;
}
const BUILTIN_BUILDERS={rug:buildRug,'lamp-cabinet':buildCabinet,'plant-shelf':buildShelf,'wall-pictures':buildPictures,'floor-pot':buildPot,'ottoman-a':ctx=>buildOttoman(ctx,'ottoman-a',-3.10,2.53,0xf6df90),'ottoman-b':ctx=>buildOttoman(ctx,'ottoman-b',-1.65,3.00,0xdce59b),'front-fence':buildFence};
// 把单个根的零件按材质合并（与 buildDecor 尾部相同），返回根已更新世界矩阵。
function mergeRoot(root){
  const meshes=[];root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map();
  root.traverse(mesh=>{if(!mesh.isMesh)return;let geometry=mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));if(geometry.index){const nonIndexed=geometry.toNonIndexed();geometry.dispose();geometry=nonIndexed;}if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(geometry);});
  root.clear();
  for(const [material,geometries] of batches){const combined=mergeGeometries(geometries,false);if(!combined)throw new Error('装饰几何合并失败');geometries.forEach(geometry=>geometry.dispose());const compact=mergeVertices(combined);combined.dispose();const mesh=new THREE.Mesh(compact,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
  return root;
}
/** v2.8.2：单独构建一件可收回的固有装饰根（已合并材质、已 add 到 scene）。
 * 返回 null 表示该 id 不是可收回固有装饰（商店/结构件请走各自路径）。 */
export function buildDecorItem(id,scene,materials,{room=DEFAULT_ROOM,palette=DEFAULT_PALETTE}={}){
  const builder=BUILTIN_BUILDERS[id];if(!builder)return null;
  const ctx=decorCtx(scene,materials,room,palette);
  const root=builder(ctx);return mergeRoot(root);
}
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
  shell.userData.wallSides=['back','left'];shell.userData.openSides=['right','front'];
  const {width:w, depth:d, wallHeight:h}=ROOM;
  box(shell,[w+.22,.30,d+.22],[0,-.18,0],P.floorEdge,.10);
  const floor=box(shell,[w,.10,d],[0,-.015,0],P.floor,.04); floor.name='walkable-floor'; floor.castShadow=false;
  // 双面开放：后墙与左墙围出温馨转角，右侧和靠近镜头的一侧保持开放。
  box(shell,[w,.18+h,.14],[0,h/2-.03,-d/2],P.wall,.04);
  for(let x=-w/2+.28;x<w/2;x+=.7) box(shell,[.32,h-.12,.012],[x,h/2,-d/2+.079],P.stripe,.002);
  box(shell,[w,.24,.10],[0,.15,-d/2+.12],P.trim,.025);
  box(shell,[w,.06,.12],[0,.30,-d/2+.13],0xe9c79a,.02);
  box(shell,[.14,.18+h,d],[-w/2,h/2-.03,0],P.wall,.04);
  for(let z=-d/2+.28;z<d/2;z+=.7)box(shell,[.012,h-.12,.32],[-w/2+.079,h/2,z],P.stripe,.002);
  box(shell,[.10,.24,d],[-w/2+.12,.15,0],P.trim,.025);
  box(shell,[.12,.06,d],[-w/2+.13,.30,0],0xe9c79a,.02);
  box(shell,[.17,.10,d+.05],[-w/2,h+.025,0],P.trim,.025);
  box(shell,[w+.05,.10,.17],[0,h+.025,-d/2],P.trim,.025);
  // v2.8.2：可收回装饰件（地毯/柜子/花架/装饰画/花盆/软凳/栅栏）统一构建，
  // 与 buildDecorItem 共用同一套 builder，保证回收后可从仓库原样摆回。
  const storableCtx=decorCtx(scene,materials,ROOM,P);
  for(const def of STORABLE_DECOR)items.set(def.id,BUILTIN_BUILDERS[def.id](storableCtx));

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
  const shelf=items.get('plant-shelf'); // 花架由 storable 统一构建（含其上的盆栽/书本）

  // 窗两侧轻纱帘：与原图色块一致，只有外观。
  for(const s of [-1,1]) box(windowRoot,[.14,hh+.4,.05],[s*(radius+.16),hh/2-.05,.06],0xfff1d2,.025);

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
      const mesh=new THREE.Mesh(compact,material);mesh.castShadow=true;mesh.receiveShadow=true;
      if(root===shell){const color=material.color?.getHex();if(color===P.wall)mesh.userData.wallPaintRole='wall';if(color===P.stripe)mesh.userData.wallPaintRole='stripe';}
      root.add(mesh);
    }
  }
  originalGeometries.forEach(geometry=>{if(geometry!==floor.geometry)geometry.dispose();});
  return { floor, items };
}
