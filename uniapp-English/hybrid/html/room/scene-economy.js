import {
  CylinderGeometry,ExtrudeGeometry,Group,Mesh,Shape,SphereGeometry,TorusGeometry,
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
  'star-lamp':{label:'星星夜灯',size:[.66,1.14,.66]},
  'mushroom-stool':{label:'蘑菇小凳',size:[.74,1.04,.74]},
  'beehive-ornament':{label:'蜂巢摆件',size:[.82,1.00,.82]},
  'rocket-toy':{label:'小火箭摆件',size:[.66,1.24,.66]},
  'rainbow-arch':{label:'彩虹拱门',size:[1.36,1.34,.48]},
  'candy-tree':{label:'糖果小树',size:[.86,1.08,.86]},
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
  function cylinder(rTop,rBottom,height,position,color,segments=16,rotation=[0,0,0]) {
    return part(geometry(`cylinder:${rTop}:${rBottom}:${height}:${segments}`,()=>new CylinderGeometry(rTop,rBottom,height,segments)),color,position,[1,1,1],rotation);
  }
  function oval(position,scale,color,rotation=[0,0,0]) {
    return part(geometry('sphere',()=>new SphereGeometry(1,12,8)),color,position,scale,rotation);
  }
  function ring(radius,tube,position,color,rotation=[0,0,0],arc=Math.PI*2) {
    return part(geometry(`ring:${radius}:${tube}:${arc}`,()=>new TorusGeometry(radius,tube,6,36,arc)),color,position,[1,1,1],rotation);
  }
  function flower(position,radius,color,center=C.gold) {
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;oval([position[0]+Math.cos(a)*radius*.62,position[1]+Math.sin(a)*radius*.62,position[2]],[radius*.44,radius*.44,radius*.18],color);}
    oval(position,[radius*.30,radius*.30,radius*.22],center);
  }
  // 卡通小星星：十角星平面挤压，缓存同半径同深度的几何，避免重复创建。
  function starPart(color,radius,depth,position,scale=1) {
    const key=`star:${radius}:${depth}`;
    let value=cache.get(key);
    if(!value) {
      const shape=new Shape();
      for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,rr=i%2?radius*.55:radius;const px=Math.cos(a)*rr,py=Math.sin(a)*rr;i===0?shape.moveTo(px,py):shape.lineTo(px,py);}
      shape.closePath();
      value=new ExtrudeGeometry(shape,{depth,steps:1,curveSegments:8,bevelEnabled:true,bevelSize:.008,bevelThickness:.007,bevelSegments:1});
      cache.set(key,value);sourceGeometries.add(value);
    }
    return part(value,color,position,[scale,scale,scale]);
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
    // 陶盆釉边与手作花纹，低价款仍有完整的材质层次。
    ring(.205,.009,[0,.055,0],C.wood,[Math.PI/2,0,0]);
    for(const x of [-.10,0,.10])oval([x,.19,.219],[.018,.018,.009],C.cream);
    for(const s of [-1,1])oval([.051*s,.205,.230],[.044,.025,.010],C.cream,[0,0,s*.45]);
    oval([0,.205,.24],[.018,.021,.013],C.gold);
    for(const [x,y,z]of [[-.10,.91,-.06],[.12,.77,.06]])oval([x,y+.02,z],[.014,.010,.014],C.cream);
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
    // 黄铜包角、抽屉铭牌和逐本书脊，让较高积分的书架更精致。
    for(const x of [-.485,.485])for(const y of [.10,1.46])box([.080,.045,.045],[x,y,.210],C.gold,.012);
    box([.19,.07,.012],[.23,.81,.225],C.woodLight,.01);
    box([.08,.012,.014],[.23,.81,.226],C.gold,.005);
    for(const [x,baseY,width,height]of books){box([width*.78,.010,.008],[x,baseY+height-.037,.140],C.gold,.003);}
    flower([-.28,1.32,.220],.067,C.mint,C.gold);
    for(const x of [-.08,.08])oval([x,1.32,.223],[.033,.012,.010],C.gold);
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
    // 桌沿镶边和云朵浮雕不占桌面活动空间。
    box([.55,.012,.018],[0,.573,.254],C.woodLight,.005);
    for(const x of [-.18,.18])oval([x,.589,.258],[.037,.018,.013],C.gold);
    for(const [x,z]of [[-.28,-.18],[.28,-.18],[0,.23]])cylinder(.043,.043,.025,[x,.105,z],C.gold,12);
    for(const x of [-.045,0,.045])oval([x,.637,.10],[.029,.005,.028],C.gold);
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
    // 双层月弧、蓝色宝石底座与悬垂星尘。
    ring(.188,.008,[0,.115,0],C.gold,[Math.PI/2,0,0]);
    for(const [x,y,r]of [[-.21,.72,.016],[-.18,.82,.011],[-.18,.54,.014],[-.27,.62,.010]])oval([x,y,.014],[r,r,.009],C.cream);
    oval([0,.135,.12],[.047,.025,.035],C.lilac);
    for(const x of [-.13,.13])oval([x,.125,.10],[.014,.014,.014],C.cream);
  } else if(sku==='star-lamp') {
    // 星星夜灯：木底板 + 金属细杆 + 发光的星星灯罩 + 小星星与光晕
    cylinder(.26,.28,.05,[0,.025,0],C.wood,20);
    cylinder(.20,.20,.02,[0,.065,0],C.woodLight,20);
    for(const [x,z]of [[.13,.10],[-.13,.10],[.13,-.10],[-.13,-.10]])oval([x,.075,z],[.03,.012,.03],C.gold);
    cylinder(.018,.024,.42,[0,.34,0],C.gold,10);
    box([.05,.05,.05],[0,.55,0],C.cream,.015);
    starPart(C.gold,.26,.10,[0,.82,0]);
    starPart(C.cream,.20,.025,[0,.82,.108],.85);
    // 灯罩内的小月亮与光点
    cylinder(.30,.30,.012,[0,.70,0],C.woodLight,24);
    oval([-.055,.83,.143],[.012,.018,.008],C.wood);
    oval([.055,.83,.143],[.012,.018,.008],C.wood);
    starPart(C.cream,.06,.03,[.24,.94,0],.8);
    starPart(C.cream,.045,.025,[-.22,1.06,0]);
    starPart(C.wood,.035,.018,[.18,1.055,0]);
    // 细杆上的云朵小装饰
    oval([.13,.44,0],[.055,.03,.05],C.cream);
    oval([.05,.45,0],[.04,.025,.045],C.cream);
    ring(.235,.010,[0,.077,0],C.gold,[Math.PI/2,0,0]);
    for(const [x,y]of [[-.24,.67],[.24,.69],[-.18,.99]])starPart(C.cream,.025,.015,[x,y,.035]);
    for(const s of [-1,1])oval([s*.04,.20,.018],[.048,.020,.014],C.lilac,[0,0,s*.45]);
    oval([0,.20,.035],[.018,.020,.015],C.gold);
  } else if(sku==='mushroom-stool') {
    // 蘑菇小凳：圆凳腿 + 蘑菇伞盖 + 白点 + 伞下小栅栏与蝴蝶结
    cylinder(.10,.11,.18,[0,.09,0],C.wood,12);
    cylinder(.13,.13,.03,[0,.20,0],C.woodLight,14);
    for(const [x,z]of [[.07,.07],[-.07,.07],[.07,-.07],[-.07,-.07]])cylinder(.018,.02,.10,[x,.05,z],C.wood,8);
    // 饱满坐垫、奶油色裙边与表面白点，白点沿弧面而非埋在伞盖里。
    oval([0,.44,0],[.35,.24,.35],C.coral);
    cylinder(.31,.32,.045,[0,.405,0],C.cream,24);
    for(const [x,z]of [[.12,.05],[-.14,.02],[.04,.16],[-.06,-.15],[.16,-.10],[-.19,-.08]]){
      const y=.44+.245*Math.sqrt(1-(x*x+z*z)/(.35*.35));oval([x,y,z],[.042,.012,.042],C.cream);
    }
    // 伞盖顶
    oval([0,.665,0],[.10,.018,.10],C.clay);
    // 伞下的小白点裙边
    for(const [x,z]of [[.20,.08],[-.20,.08],[.20,-.08],[-.20,-.08],[0,.22],[-.06,-.21]])oval([x,.345,z],[.022,.02,.022],C.cream);
    // 凳面一圈小扣点与蝴蝶结
    for(const [x,z]of [[.15,.15],[-.15,.15],[.15,-.15],[-.15,-.15]])oval([x,.665,z],[.02,.016,.02],C.woodLight);
    for(const s of [-1,1])oval([s*.045,.37,.307],[.048,.024,.018],C.gold,[0,0,s*.4]);
    oval([0,.37,.322],[.018,.020,.015],C.clay);
    flower([0,.15,.105],.04,C.cream);
  } else if(sku==='beehive-ornament') {
    // 蜂巢摆件：三层蜂房 + 飞舞的小蜜蜂 + 蜂蜜滴
    cylinder(.24,.30,.20,[0,.10,0],C.wood,16);
    cylinder(.30,.32,.04,[0,.02,0],C.woodLight,16);
    for(const [x,z]of [[.14,0],[-.14,0],[0,.14],[0,-.14],[.10,.10],[-.10,-.10],[.10,-.10],[-.10,.10]])oval([x,.21,z],[.028,.022,.028],C.gold);
    // 三层蜂房
    for(const [rTop,rBottom,height,index]of [[.34,.30,.24,0],[.28,.24,.20,1],[.22,.19,.18,2]]) {
      const y=.42+index*.19;
      cylinder(rTop,rBottom,height,[0,y,0],C.gold,20);
      for(const [x,z]of [[.12,.14],[-.12,.14],[.12,-.14],[-.12,-.14],[0,.20],[0,-.20]])oval([x,y,z],[.02,.02,.02],C.cream);
    }
    // 蜂窝小门
    oval([.05,.36,.29],[.07,.09,.02],C.wood);
    oval([0,.36,.30],[.05,.07,.02],C.soil);
    // 顶部小蜜蜂：身体+翅膀（扁圆柱）+眼睛
    oval([.15,.88,.10],[.055,.045,.055],C.gold);
    oval([.19,.925,.085],[.053,.018,.038],C.cream,[0,0,-.45]);
    oval([.10,.925,.085],[.053,.018,.038],C.cream,[0,0,.45]);
    oval([.175,.90,.10],[.012,.010,.012],C.soil);
    for(const y of [.36,.55,.73])ring(y>.7?.21:y>.5?.27:.32,.011,[0,y,0],C.woodLight,[Math.PI/2,0,0]);
    for(const [x,z]of [[-.24,.12],[.24,.12]])flower([x,.17,z],.065,C.cream);
    oval([.15,.865,.105],[.012,.032,.042],C.soil);
  } else if(sku==='rocket-toy') {
    // 小火箭摆件：箭体 + 舷窗 + 尾翼 + 火焰 + 星星
    cylinder(.13,.13,.46,[0,.31,0],C.cream,16);
    cylinder(.13,.13,.02,[0,.55,0],C.wood,16);
    cylinder(0,.14,.25,[0,.68,0],C.coral,20);
    ring(.064,.014,[0,.44,.133],C.gold);
    cylinder(.055,.055,.017,[0,.44,.14],C.blue,20,[Math.PI/2,0,0]);
    oval([-.017,.46,.154],[.012,.017,.004],C.cream);
    for(const [x,z]of [[.10,.06],[-.10,.06],[.10,-.06],[-.10,-.06],[-.06,.11],[-.06,-.11],[.06,.11],[.06,-.11]])oval([x,.20,z],[.014,.012,.014],C.coral);
    // 尾翼
    for(const [x,z,rot]of [[.155,0,Math.PI/2],[0,.155,0],[-.155,0,-Math.PI/2],[0,-.155,Math.PI]]) {
      box([.07,.20,.10],[x*.9,.15,z*.9],C.mint,.025,[0,0,rot]);
    }
    // 火焰
    oval([0,.085,0],[.09,.08,.09],C.gold);
    oval([0,.10,0],[.05,.06,.05],C.clay);
    // 喷口
    cylinder(.06,.08,.05,[0,.055,0],C.soil,12);
    starPart(C.gold,.05,.02,[.22,.58,.12],.9);
    starPart(C.cream,.035,.015,[-.20,.36,-.10]);
    for(const y of [.27,.535])ring(.132,.007,[0,y,0],C.gold,[Math.PI/2,0,0]);
    for(const x of [-.035,.035])oval([x,.63,.116],[.012,.012,.008],C.cream);
  } else if(sku==='rainbow-arch') {
    // 彩虹拱门：七彩半圆拱 + 两端云朵基座 + 顶部小太阳
    const archCenter=.29;
    const colors=[C.coral,C.clay,C.gold,C.mint,C.blue,C.lilac];
    for(let i=0;i<colors.length;i++) {
      const rOuter=.56-i*.045,rInner=rOuter-.038,key=`arch:${rOuter}:${rInner}:${archCenter}`;
      const shape=new Shape();
      shape.absarc(0,archCenter,rOuter,0,Math.PI,false);
      shape.absarc(0,archCenter,rInner,Math.PI,0,true);
      shape.closePath();
      const geom=geometry(key,()=>new ExtrudeGeometry(shape,{depth:.15,steps:1,curveSegments:20,bevelEnabled:true,bevelSize:.007,bevelThickness:.005,bevelSegments:1}));
      part(geom,colors[i],[0,0,-.075]);
      // 直立拱脚：弧带延伸到云朵底座。
      for(const s of [-1,1])box([.038,.25,.15],[s*(rInner+.019),.165,0],colors[i],.010);
    }
    // 两端云朵基座
    for(const [x,z]of [[.48,0],[-.48,0]]) {
      oval([x,.065,z],[.17,.06,.18],C.cream);
      oval([x-.08,.095,z],[.09,.065,.12],C.cream);
      oval([x+.08,.095,z],[.09,.065,.12],C.cream);
      oval([x,.13,z],[.10,.075,.12],C.cream);
    }
    // 顶部小太阳
    starPart(C.gold,.11,.07,[0,1.00,0],1.1);
    starPart(C.coral,.065,.025,[0,1.00,.075],.6);
    oval([0,1.00,.105],[.025,.025,.012],C.cream);
    // 拱内两只小云
    oval([.16,.50,.16],[.075,.04,.075],C.cream);
    oval([.24,.52,.16],[.05,.035,.05],C.cream);
    oval([-.22,.42,-.14],[.07,.035,.07],C.cream);
    for(const [x,y]of [[-.32,.66],[.32,.66],[-.18,.77],[.18,.77]])oval([x,y,.09],[.010,.010,.007],C.gold);
    for(const s of [-1,1])starPart(C.gold,.043,.022,[s*.43,.33,.12]);
  } else if(sku==='candy-tree') {
    // 糖果修剪树：奶油陶盆、糖纸丝带和层层圆润树冠。
    cylinder(.15,.115,.17,[0,.095,0],C.woodLight,20);
    cylinder(.16,.16,.035,[0,.185,0],C.cream,20);
    cylinder(.035,.045,.32,[0,.28,0],C.wood,12);
    for(const y of [.23,.29,.35])ring(.038,.008,[0,y,0],C.cream,[Math.PI/2,0,0]);
    for(const [x,y,z,s]of [[0,.57,0,.25],[-.15,.50,.02,.18],[.15,.50,.02,.18],[0,.71,-.01,.18]])oval([x,y,z],[s,s*.88,s*.82],C.mint);
    cylinder(.11,.11,.035,[0,.62,.225],C.cream,24,[Math.PI/2,0,0]);
    ring(.075,.018,[0,.62,.251],C.coral);
    ring(.035,.012,[0,.62,.255],C.coral);
    oval([0,.62,.26],[.013,.013,.007],C.coral);
    for(const [x,y,z,c]of [[.24,.48,.10,C.coral],[-.24,.48,.10,C.gold],[.16,.70,.09,C.gold],[-.15,.66,.15,C.lilac],[.05,.78,.10,C.coral],[-.04,.43,.20,C.lilac]]){
      oval([x,y,z],[.036,.036,.03],c);
      for(const s of [-1,1])oval([x+s*.043,y,z],[.022,.020,.015],C.cream,[0,0,s*.45]);
    }
    starPart(C.gold,.074,.025,[0,.93,0]);
    for(const s of [-1,1])oval([s*.042,.13,.135],[.045,.023,.013],C.coral,[0,0,s*.42]);
    oval([0,.13,.15],[.018,.020,.012],C.gold);
    ring(.125,.008,[0,.025,0],C.wood,[Math.PI/2,0,0]);
  }

  // Small construction details remain inside the existing collision envelope.
  // They use the same palette so refinement does not add material draw calls.
  if(sku==='clover-planter'){
    for(const angle of [-.65,-.32,0,.32,.65]){const x=Math.sin(angle)*.215,z=Math.cos(angle)*.215;oval([x,.105,z],[.009,.021,.005],C.cream,[0,-angle,0]);}
    for(const y of [.244,.270])ring(.233,.004,[0,y,0],C.woodLight,[Math.PI/2,0,0]);
  }else if(sku==='reading-shelf'){
    for(const [x,y,w]of [[-.36,.27,.12],[-.20,.25,.14],[-.02,.30,.11],[.22,.27,.12],[-.34,.71,.13],[-.16,.75,.12],[.05,.72,.14]]){
      box([w*.62,.043,.006],[x,y,.143],C.cream,.002);box([w*.35,.006,.007],[x,y,.148],C.woodLight,.001);
    }
    for(const x of [-.482,.482])for(const y of [.37,.82,1.27])oval([x,y,.223],[.008,.008,.004],C.gold);
  }else if(sku==='cloud-table'){
    for(const x of [-.18,-.09,0,.09,.18])oval([x,.645,-.075],[.010,.002,.010],C.woodLight);
    for(const [x,z]of [[-.28,-.18],[.28,-.18],[0,.23]])cylinder(.037,.037,.012,[x,.47,z],C.gold,12);
  }else if(sku==='moon-ornament'){
    for(let i=0;i<7;i++){const a=2.0+i*.30;oval([-.035+Math.cos(a)*.259,.69+Math.sin(a)*.259,.040],[.009,.009,.006],C.cream);}
    for(const x of [-.15,-.075,.075,.15])oval([x,.113,.13],[.009,.006,.008],C.gold);
  }else if(sku==='star-lamp'){
    for(const x of [-.12,-.06,0,.06,.12])oval([x,.081,.155],[.009,.005,.009],C.cream);
    for(const y of [.28,.36,.48])cylinder(.021,.021,.012,[0,y,0],C.woodLight,10);
  }else if(sku==='mushroom-stool'){
    for(let i=0;i<16;i++){const a=i*Math.PI/8;oval([Math.cos(a)*.303,.412,Math.sin(a)*.303],[.011,.013,.007],C.woodLight,[0,-a,0]);}
    for(const x of [-.035,.035])oval([x,.153,.112],[.005,.007,.005],C.gold);
  }else if(sku==='beehive-ornament'){
    for(const [x,y]of [[-.13,.46],[.12,.57],[-.10,.70]]){cylinder(.035,.035,.008,[x,y,.283],C.woodLight,6,[Math.PI/2,0,0]);cylinder(.022,.022,.009,[x,y,.290],C.gold,6,[Math.PI/2,0,0]);}
    for(const side of [-1,1])oval([.145+side*.045,.919,.098],[.003,.013,.020],C.woodLight,[0,0,side*.45]);
  }else if(sku==='rocket-toy'){
    for(let i=0;i<8;i++){const a=i*Math.PI/4;oval([Math.cos(a)*.068,.44+Math.sin(a)*.068,.151],[.005,.005,.004],C.cream);}
    box([.040,.046,.007],[0,.326,.137],C.coral,.004);box([.028,.008,.008],[0,.328,.143],C.cream,.001);
  }else if(sku==='rainbow-arch'){
    for(let i=0;i<11;i++){const a=.25+i*(Math.PI-.50)/10;oval([Math.cos(a)*.53,.29+Math.sin(a)*.53,.086],[.008,.008,.004],C.cream);}
    for(const side of [-1,1])oval([side*.48,.10,.164],[.045,.009,.006],C.gold);
  }else if(sku==='candy-tree'){
    for(let i=0;i<8;i++){const a=i*Math.PI/4;oval([Math.cos(a)*.087,.62+Math.sin(a)*.087,.257],[.006,.006,.004],C.gold);}
    for(const x of [-.07,0,.07])oval([x,.061,.137],[.007,.017,.005],C.cream);
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
