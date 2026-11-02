import {
  CylinderGeometry,ExtrudeGeometry,Group,Mesh,Shape,SphereGeometry,
} from './vendor/three/three.module.js';
import {RoundedBoxGeometry} from './vendor/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from './vendor/addons/utils/BufferGeometryUtils.js';

const C=Object.freeze({cream:0xfff1d1,wood:0xd3ab78,woodLight:0xe9ca99,mint:0x88b9a0,
  leaf:0x78a884,leafLight:0xa3c38f,soil:0x957158,clay:0xdba88a,gold:0xe8c471,
  blue:0x94b8c1,lilac:0xb8a5c7,coral:0xe5aa8e});
const CATALOG=Object.freeze({
  'clover-planter':{label:'四叶草盆栽',size:[.82,.97,.82]},
  'reading-shelf':{label:'小小阅读架',size:[1.07,1.51,.47]},
  'cloud-table':{label:'云朵矮桌',size:[.98,.65,.76]},
  'moon-ornament':{label:'月牙摆饰',size:[.70,1.01,.60]},
});

/** 原创程序家具，无贴图、外部模型或全局场景状态。materials 的所有权属于调用方。 */
export function createShopFurniture(sku,materials) {
  if(!Object.hasOwn(CATALOG,sku))throw new RangeError(`未知商店家具：${sku}`);
  if(typeof materials!=='function')throw new TypeError('materials 必须是颜色到材质的函数');
  const root=new Group();root.name=`shop-${sku}`;root.userData.furnitureId=root.name;root.userData.shopSku=sku;
  const parts=[],sourceGeometries=new Set(),cache=new Map();
  function geometry(key,create){if(!cache.has(key)){const value=create();cache.set(key,value);sourceGeometries.add(value);}return cache.get(key);}
  function part(geometry,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]) {
    const mesh=new Mesh(geometry,materials(color));mesh.position.fromArray(position);mesh.scale.fromArray(scale);
    mesh.rotation.fromArray(rotation);mesh.updateMatrix();parts.push(mesh);return mesh;
  }
  function box(size,position,color,radius=.025,rotation=[0,0,0]) {
    const key=`box:${size}:${radius}`;
    return part(geometry(key,()=>new RoundedBoxGeometry(...size,1,Math.min(radius,...size.map(v=>v/2)))),color,position,[1,1,1],rotation);
  }
  function cylinder(rTop,rBottom,height,position,color,segments=16) {
    return part(geometry(`cylinder:${rTop}:${rBottom}:${height}:${segments}`,()=>new CylinderGeometry(rTop,rBottom,height,segments)),color,position);
  }
  function oval(position,scale,color,rotation=[0,0,0]) {
    return part(geometry('sphere',()=>new SphereGeometry(1,12,8)),color,position,scale,rotation);
  }
  if(sku==='clover-planter') {
    cylinder(.245,.190,.31,[0,.165,0],C.clay,20);
    cylinder(.264,.264,.065,[0,.325,0],C.cream,24);
    cylinder(.230,.230,.015,[0,.363,0],C.soil,20);
    cylinder(.197,.197,.025,[0,.020,0],C.wood,20);
    for(const [cx,cz,height,turn]of [[-.10,-.06,.91,.2],[.12,.06,.77,-.5],[.04,-.15,.62,.9]]) {
      cylinder(.011,.014,height-.36,[cx,(height+.36)/2,cz],C.leaf,8);
      for(let k=0;k<4;k++) {
        const angle=turn+k*Math.PI/2;
        oval([cx+Math.cos(angle)*.076,height,cz+Math.sin(angle)*.076],[.094,.025,.063],k%2?C.leafLight:C.leaf,[0,-angle,0]);
      }
      oval([cx,height+.006,cz],[.023,.016,.023],C.gold);
    }
    // 一圈浅色小扣点，只有几何细节，没有字样或图案素材。
    for(const x of [-.10,0,.10])oval([x,.19,.219],[.018,.018,.009],C.cream);
  } else if(sku==='reading-shelf') {
    for(const x of [-.485,.485])box([.065,1.46,.43],[x,.77,0],C.wood,.024);
    for(const y of [.09,.54,.99,1.455])box([1.05,.065,.45],[0,y,0],C.woodLight,.022);
    box([.94,1.36,.045],[0,.775,-.193],C.cream,.016);
    for(const x of [-.42,.42])for(const z of [-.15,.15])cylinder(.037,.041,.095,[x,.0475,z],C.wood,10);
    const books=[[-.36,.135,.12,.30,C.mint],[-.20,.135,.14,.25,C.coral],[-.02,.135,.11,.33,C.blue],
      [.22,.135,.12,.29,C.lilac],[-.34,.585,.13,.27,C.lilac],[-.16,.585,.12,.32,C.mint],[.05,.585,.14,.29,C.blue]];
    for(const [x,baseY,width,height,color]of books) {
      box([width,height,.235],[x,baseY+height/2,.017],color,.014);
      for(const dy of [-.07,.06])box([width*.62,.012,.009],[x,baseY+height/2+dy,.139],C.cream,.003);
    }
    // 顶层横放的小书与一只素色杯，平衡陈列，不增加互动类型。
    box([.32,.065,.23],[-.20,1.055,.017],C.coral,.015);
    box([.30,.045,.21],[-.18,1.110,.025],C.cream,.010);
    cylinder(.066,.052,.14,[.24,1.09,.01],C.mint,14);
    cylinder(.050,.050,.008,[.24,1.164,.01],C.cream,14);
  } else if(sku==='cloud-table') {
    for(const [x,z]of [[-.28,-.18],[.28,-.18],[0,.23]]) {
      cylinder(.035,.046,.51,[x,.285,z],C.mint,12);
      cylinder(.065,.059,.035,[x,.026,z],C.wood,12);
    }
    box([.69,.095,.51],[0,.585,0],C.cream,.047);
    for(const [x,z,sx,sz]of [[-.29,-.11,.18,.20],[.28,-.10,.18,.20],[-.23,.16,.20,.18],[.23,.16,.20,.18]]) {
      oval([x,.585,z],[sx,.060,sz],C.cream);
    }
    box([.57,.035,.40],[0,.535,0],C.gold,.018);
  } else if(sku==='moon-ornament') {
    cylinder(.235,.225,.10,[0,.06,0],C.woodLight,24);
    cylinder(.200,.200,.023,[0,.017,0],C.wood,24);
    cylinder(.016,.021,.38,[-.035,.29,0],C.gold,10);
    const R=.285,r=.250,d=.12,x=(R*R-r*r+d*d)/(2*d),y=Math.sqrt(R*R-x*x);
    const outerAngle=Math.atan2(y,x),innerAngle=Math.atan2(y,x-d),moon=new Shape();
    moon.moveTo(x,y);moon.absarc(0,0,R,outerAngle,2*Math.PI-outerAngle,false);
    moon.absarc(d,0,r,-innerAngle,innerAngle,true);moon.closePath();
    const moonGeometry=geometry('moon',()=>new ExtrudeGeometry(moon,{depth:.060,steps:1,curveSegments:18,bevelEnabled:true,bevelSize:.009,bevelThickness:.008,bevelSegments:2}));
    part(moonGeometry,C.gold,[-.035,.69,-.030]);
    for(const [sx,sy,radius]of [[.22,.85,.057],[.255,.56,.038]]) {
      const star=new Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,rr=i%2?radius*.48:radius;const px=Math.cos(a)*rr,py=Math.sin(a)*rr;i===0?star.moveTo(px,py):star.lineTo(px,py);}star.closePath();
      const starGeometry=geometry(`star:${radius}`,()=>new ExtrudeGeometry(star,{depth:.018,steps:1,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1}));
      part(starGeometry,C.cream,[sx,sy,-.009]);
      cylinder(.006,.006,sy-.15,[sx,(sy+.15)/2,0],C.gold,6);
    }
  }

  // 按实际共享材质合并静态部件，材料缓存由宿主提供，一件家具通常只有4–8次绘制。
  const batches=new Map();
  for(const mesh of parts) {
    let transformed=mesh.geometry.clone().applyMatrix4(mesh.matrix);
    if(transformed.index){const nonIndexed=transformed.toNonIndexed();transformed.dispose();transformed=nonIndexed;}
    if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(transformed);
  }
  let batch=0;
  for(const [material,geometries]of batches) {
    const merged=mergeGeometries(geometries,false);geometries.forEach(value=>value.dispose());
    if(!merged)throw new Error('商店家具几何合并失败');
    const compact=mergeVertices(merged);merged.dispose();
    const mesh=new Mesh(compact,material);mesh.name=`${root.name}-batch-${++batch}`;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(1);root.add(mesh);
  }
  sourceGeometries.forEach(value=>value.dispose());
  const entry=CATALOG[sku];
  return {root,definition:{label:entry.label,draggable:true,blocksNavigation:true,blocksPlacement:true,
    boxes:[{center:[0,entry.size[1]/2,0],size:[...entry.size]}]}};
}

/** 绝对尺寸更新，重复调用不累乘；不改人物、家具位置、家具缩放或任何Y缩放。 */
export function applyRoomTier({furniture,width,depth,bounds,placementBounds}={}) {
  if(!(furniture instanceof Map)||!Number.isFinite(width)||width<=0||!Number.isFinite(depth)||depth<=0)throw new TypeError('需要家具Map和有效的房间宽深');
  const shell=furniture.get('room-shell'),window=furniture.get('arched-window'),pictures=furniture.get('wall-pictures');
  if(shell){shell.scale.x=width/8.8;shell.scale.z=depth/8.2;shell.updateMatrixWorld(true);}
  if(window){window.position.z=-depth/2+.10;window.updateMatrixWorld(true);}
  if(pictures){pictures.position.z=(8.2-depth)/2;pictures.updateMatrixWorld(true);}
  const rect={minX:-width/2+.04,maxX:width/2-.04,minZ:-depth/2+.04,maxZ:depth/2-.04};
  if(bounds)Object.assign(bounds,rect);if(placementBounds)Object.assign(placementBounds,rect);
  return {width,depth,bounds:{...rect},placementBounds:{...rect}};
}
