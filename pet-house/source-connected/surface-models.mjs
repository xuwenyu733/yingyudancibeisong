import * as THREE from './vendor/three/three.module.js';
import {RoundedBoxGeometry} from './vendor/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from './vendor/addons/utils/BufferGeometryUtils.js';
import {FLOOR_CATALOG,WALL_CATALOG,WALL_PAINTS} from './surface-catalog.mjs';

function geometryBuilder(materials){
  if(typeof materials!=='function')throw new TypeError('需要颜色到材质的函数');
  const parts=[],sources=new Set(),cache=new Map();
  const primitive=(key,create)=>{if(!cache.has(key)){const value=create();cache.set(key,value);sources.add(value);}return cache.get(key);};
  function part(geometry,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
    const mesh=new THREE.Mesh(geometry,materials(color));mesh.position.fromArray(position);mesh.scale.fromArray(scale);mesh.rotation.fromArray(rotation);mesh.updateMatrix();parts.push(mesh);return mesh;
  }
  const box=(size,position,color,radius=.02,rotation=[0,0,0])=>part(primitive(`box:${size}:${radius}`,()=>radius?new RoundedBoxGeometry(...size,1,Math.min(radius,...size.map(v=>v/2))):new THREE.BoxGeometry(...size)),color,position,[1,1,1],rotation);
  const oval=(position,scale,color,rotation=[0,0,0])=>part(primitive('sphere',()=>new THREE.SphereGeometry(1,12,8)),color,position,scale,rotation);
  const disc=(r,position,color,depth=.025)=>part(primitive(`disc:${r}:${depth}`,()=>new THREE.CylinderGeometry(r,r,depth,32)),color,position,[1,1,1],[Math.PI/2,0,0]);
  const ring=(r,t,position,color,arc=Math.PI*2,rotation=[0,0,0])=>part(primitive(`ring:${r}:${t}:${arc}`,()=>new THREE.TorusGeometry(r,t,6,48,arc)),color,position,[1,1,1],rotation);
  function shapePart(key,shape,color,position,depth=.025){return part(primitive(`shape:${key}:${depth}`,()=>new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.006,bevelThickness:.004,bevelSegments:1,steps:1,curveSegments:20})),color,position);}
  function star(radius,position,color,depth=.03,points=5){const s=new THREE.Shape();for(let i=0;i<points*2;i++){const a=Math.PI/2+i*Math.PI/points,r=i%2?radius*.45:radius;i?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}s.closePath();return shapePart(`star:${radius}:${points}`,s,color,position,depth);}
  function leaf(position,size,color,angle=0){return oval(position,[size*.38,size,.025],color,[0,0,angle]);}
  function line(from,to,color,width=.018){const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);const p=part(primitive('line-cylinder',()=>new THREE.CylinderGeometry(1,1,1,8)),color,a.clone().add(b).multiplyScalar(.5).toArray(),[width,delta.length(),width]);p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());p.updateMatrix();return p;}
  function pearlRow(radius,count,color,z=.1,phase=0){for(let i=0;i<count;i++){const a=phase+i*Math.PI*2/count;oval([Math.cos(a)*radius,Math.sin(a)*radius,z],[.022,.022,.017],color);}}
  function finish(root){
    const batches=new Map();for(const mesh of parts){let g=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(g.index){const plain=g.toNonIndexed();g.dispose();g=plain;}if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(g);}
    for(const [material,geometries] of batches){const joined=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!joined)throw new Error('饰面几何合并失败');const compact=mergeVertices(joined);joined.dispose();const mesh=new THREE.Mesh(compact,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(1);root.add(mesh);}
    sources.forEach(g=>g.dispose());root.updateMatrixWorld(true);return root;
  }
  return {part,primitive,box,oval,disc,ring,star,shapePart,leaf,line,pearlRow,finish};
}

/** Wall art uses local X/Y coordinates and faces +Z. The room mounts it to a wall. */
export function createWallHanging(sku,materials){
  const item=WALL_CATALOG.find(p=>p.sku===sku);if(!item)throw new RangeError(`未知墙上挂件：${sku}`);
  const b=geometryBuilder(materials),{box,oval,disc,ring,star,leaf,line,pearlRow}=b,c=item.colors;
  const root=new THREE.Group();root.name=`shop-${sku}`;Object.assign(root.userData,{furnitureId:root.name,shopSku:sku,wallHanging:true,hangingWidth:item.width,hangingHeight:item.height});
  const frame=(w,h,color,inner)=>{box([w,h,.075],[0,0,.035],color,.045);box([w-.10,h-.10,.04],[0,0,.085],inner,.035);};
  if(item.motif==='botanical'){
    frame(.95,1.2,c[0],c[1]);box([.79,1.04,.015],[0,0,.114],0xe8e4c8,.02);line([0,-.40,.14],[.035,.40,.14],c[2],.013);
    for(let i=0;i<5;i++){const y=-.28+i*.14;for(const side of [-1,1])leaf([side*.12,y+.05,.151],.12,i%2?c[2]:c[3],side*-.85);}
    box([.28,.025,.008],[0,-.49,.14],c[0],.004);
  }else if(item.motif==='daisy'){
    ring(.43,.040,[0,.07,.04],c[0]);ring(.39,.014,[0,.07,.07],c[3]);
    for(let i=0;i<9;i++){const a=i*Math.PI*2/9,x=Math.cos(a)*.42,y=.07+Math.sin(a)*.42;leaf([x*1.05,y,.075],.10,c[3],a);for(let j=0;j<6;j++){const t=j*Math.PI/3;oval([x+Math.cos(t)*.06,y+Math.sin(t)*.06,.10],[.044,.025,.015],c[1],[0,0,t]);}disc(.031,[x,y,.124],c[2],.018);}
    oval([-.09,-.45,.07],[.10,.065,.025],c[2],[0,0,-.4]);oval([.09,-.45,.07],[.10,.065,.025],c[2],[0,0,.4]);disc(.035,[0,-.45,.1],c[0]);box([.04,.21,.025],[-.04,-.58,.08],c[2],.01,[0,0,-.2]);box([.04,.17,.025],[.05,-.56,.08],c[2],.01,[0,0,.22]);
  }else if(item.motif==='rainbow'){
    for(let i=0;i<5;i++)ring(.57-i*.075,.033,[0,-.08,.03+i*.008],c[i],Math.PI);
    for(const x of [-.55,.55])for(const [dx,dy,s]of [[0,0,.15],[-.10,-.02,.12],[.10,-.02,.12]])oval([x+dx,-.10+dy,.10],[s,s*.6,.055],c[5]);
    for(const [x,y,color]of [[-.40,-.46,c[1]],[0,-.62,c[3]],[.40,-.42,c[4]]]){line([x,-.17,.06],[x,y,.06],c[5],.009);oval([x,y,.08],[.040,.075,.022],color);}
  }else if(item.motif==='butterfly'){
    frame(1.22,1.32,c[3],c[2]);box([1.04,1.14,.018],[0,0,.12],0xeee8df,.03);
    for(const [x,y,color,s]of [[-.23,.20,c[0],1],[.25,-.22,c[1],.72]]){
      for(const side of [-1,1]){oval([x+side*.15*s,y+.09*s,.15],[.16*s,.20*s,.035],color,[0,0,side*.35]);oval([x+side*.12*s,y-.11*s,.15],[.11*s,.14*s,.03],color,[0,0,-side*.25]);oval([x+side*.17*s,y+.10*s,.188],[.07*s,.10*s,.010],c[2],[0,0,side*.3]);line([x,y+.10*s,.17],[x+side*.045*s,y+.22*s,.18],c[3],.007);}
      oval([x,y,.18],[.022,.17*s,.025],c[4]);
    }for(const x of [-.5,.5])for(const y of [-.54,.54])disc(.018,[x,y,.15],c[3]);
  }else if(item.motif==='moon'){
    const s=new THREE.Shape(),R=.40,r=.34,d=.16,xx=(R*R-r*r+d*d)/(2*d),yy=Math.sqrt(R*R-xx*xx),outer=Math.atan2(yy,xx),inner=Math.atan2(yy,xx-d);
    s.moveTo(xx,yy);s.absarc(0,0,R,outer,Math.PI*2-outer,false);s.absarc(d,0,r,-inner,inner,true);s.closePath();b.shapePart('mobile-moon',s,c[0],[-.04,.40,.03],.065);
    for(const [x,y,k]of [[-.34,-.48,0],[0,-.74,1],[.34,-.40,2]]){line([x,.03,.04],[x,y,.04],c[0],.007);for(let j=0;j<3;j++)oval([x,.02-(.02-y)*(j+1)/4,.075],[.022,.022,.014],c[3]);star(.105,[x,y,.08],k===1?c[0]:c[2]);}
    star(.09,[.32,.60,.10],c[1]);
  }else if(item.motif==='clock'){
    frame(.89,1.10,c[0],c[2]);box([.95,.12,.10],[-.24,.65,.06],c[1],.025,[0,0,.65]);box([.95,.12,.10],[.24,.65,.06],c[1],.025,[0,0,-.65]);
    disc(.30,[0,.08,.13],c[4],.045);disc(.266,[0,.08,.16],c[2],.025);for(let i=0;i<12;i++){const a=i*Math.PI/6;disc(i%3?.009:.018,[Math.sin(a)*.222,.08+Math.cos(a)*.222,.18],c[3],.01);}
    line([0,.08,.19],[0,.25,.19],c[4],.015);line([0,.08,.19],[.14,.02,.19],c[4],.013);disc(.026,[0,.08,.20],c[3]);
    disc(.08,[0,.47,.13],c[4]);oval([0,.47,.16],[.065,.043,.035],c[1]);oval([.06,.49,.17],[.03,.025,.025],c[3]);
    for(const x of [-.25,.25]){line([x,-.53,.06],[x,-.85,.06],c[3],.01);oval([x,-.91,.08],[.07,.12,.04],c[0]);}line([0,-.53,.06],[0,-1.0,.06],c[3],.012);disc(.10,[0,-.99,.09],c[3]);
  }else if(item.motif==='ocean'){
    for(let i=0;i<3;i++){const x=(i-1)*.61,y=i===1?.07:-.05;box([.57,.94,.06],[x,y,.035],c[0],.02);box([.49,.86,.025],[x,y,.08],c[4],.018);disc(.10,[x+.08,y+.22,.105],c[3],.012);
      for(let j=0;j<3;j++)for(let k=0;k<3;k++)oval([x-.17+k*.17,y-.19+j*.085,.11+j*.012],[.13,.07,.015],j%2?c[1]:c[2]);
      for(const dx of [-.14,.14])disc(.011,[x+dx,y-.34,.15],c[3],.01);
    }for(const x of [-.61,.61]){line([x,.40,.02],[x,.62,.02],c[0],.009);disc(.025,[x,.62,.03],c[3]);}
  }else if(item.motif==='sakura'){
    for(let i=0;i<11;i++){const a=.08+i*(Math.PI-.16)/10;line([0,-.48,.03],[Math.cos(a)*.88,-.48+Math.sin(a)*.88,.04],c[2],.010);const r=.74;oval([Math.cos(a)*r*.68,-.48+Math.sin(a)*r*.68,.065],[.10,.37,.02],i%2?c[0]:c[4],[0,0,a-Math.PI/2]);}
    ring(.89,.018,[0,-.48,.08],c[2],Math.PI);for(const [x,y,s]of [[-.37,.03,.10],[.27,.08,.12],[0,.31,.08],[.55,-.15,.065],[-.59,-.20,.07]]){for(let k=0;k<5;k++){const a=k*Math.PI*2/5;oval([x+Math.cos(a)*s*.55,y+Math.sin(a)*s*.55,.12],[s*.50,s*.32,.017],c[1],[0,0,a]);}disc(s*.17,[x,y,.145],c[2]);}
    for(const x of [-.10,0,.10]){line([x,-.48,.06],[x,-.81,.06],c[2],.006);for(let j=0;j<3;j++)oval([x,-.62-j*.075,.10],[.020,.024,.018],c[4]);}oval([0,-.94,.08],[.08,.14,.03],c[3]);
  }else if(item.motif==='mirror'){
    disc(.54,[0,0,.025],c[2],.05);disc(.46,[0,0,.065],c[1],.028);disc(.41,[0,0,.089],c[0],.022);ring(.49,.025,[0,0,.11],c[3]);
    for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?.68:.77;line([Math.cos(a)*.52,Math.sin(a)*.52,.04],[Math.cos(a)*r,Math.sin(a)*r,.05],c[2],i%2?.016:.025);oval([Math.cos(a)*r,Math.sin(a)*r,.075],[.034,.034,.022],i%2?c[4]:c[3]);}
    pearlRow(.52,24,c[3],.115);box([.025,.43,.009],[-.17,.04,.115],c[3],.006,[0,0,-.6]);box([.015,.25,.009],[-.08,.12,.115],c[3],.004,[0,0,-.6]);
  }else if(item.motif==='crystal'){
    for(const [r,y]of [[.64,.40],[.46,.10],[.28,-.20]]){ring(r,.018,[0,y,.035],c[0],Math.PI);line([-r,y,.035],[r,y,.035],c[0],.012);}
    for(let i=0;i<9;i++){const x=(i-4)*.14,y=.40-Math.abs(i-4)*.08;line([x,.42,.05],[x,y-.58,.05],c[0],.006);for(let j=0;j<3;j++)oval([x,.33-j*.12,.08],[.018,.026,.014],c[3]);const s=.06+(4-Math.abs(i-4))*.007;const g=b.primitive('crystal-drop',()=>new THREE.OctahedronGeometry(1,0));b.part(g,i%2?c[1]:c[2],[x,y-.64,.08],[s,s*2.3,s*.48]);}
    for(const x of [-.43,0,.43]){oval([x,.45,.06],[.045,.11,.035],c[3]);disc(.065,[x,.36,.06],c[0],.04);}disc(.09,[0,.82,.04],c[4]);star(.055,[0,.82,.10],c[3]);
  }else if(item.motif==='celestial'){
    disc(.75,[0,0,.025],c[0],.045);ring(.73,.020,[0,0,.065],c[1]);ring(.65,.008,[0,0,.073],c[1]);
    for(const [r,angle]of [[.29,.3],[.46,-.55],[.60,.9]]){const orbit=ring(r,.011,[0,0,.11],c[1]);orbit.scale.x=1.10;orbit.rotation.z=angle;orbit.updateMatrix();}
    star(.19,[0,0,.12],c[1],.04,8);disc(.095,[0,0,.17],c[4],.025);
    for(const [a,r,size,col]of [[.3,.46,.075,c[2]],[2.8,.60,.09,c[3]],[4.4,.30,.05,c[4]],[5.1,.60,.06,c[2]]]){const x=Math.cos(a)*r,y=Math.sin(a)*r;disc(size,[x,y,.14],col,.045);ring(size+.018,.006,[x,y,.17],c[1]);}
    for(let i=0;i<18;i++){const a=i*Math.PI*2/18;star(i%3?.022:.035,[Math.cos(a)*.62,Math.sin(a)*.62,.13],c[4],.010);}
    pearlRow(.80,24,c[1],.04);for(const x of [-.35,0,.35]){line([x,-.7,.04],[x,-.92,.04],c[1],.006);star(.035,[x,-.94,.08],c[3]);}
  }else if(item.motif==='phoenix'){
    for(let i=0;i<6;i++){const x=(i-2.5)*.28,y=.07-Math.abs(i-2.5)*.08;box([.265,1.48,.06],[x,y,.035],c[3],.025);box([.222,1.42,.025],[x,y,.08],i%2?c[0]:c[1],.02);}
    for(let i=0;i<11;i++){const a=-1.0+i*.20;const x=Math.sin(a)*.65,y=.42-Math.cos(a)*.48;leaf([x,y,.12],.39,i%3===0?c[2]:c[1],-a);leaf([x,y,.15],.28,c[3],-a);leaf([x,y,.175],.22,i%2?c[0]:c[5],-a);oval([x,y+.04,.195],[.035,.07,.010],c[4]);}
    line([0,-.25,.12],[0,.58,.12],c[3],.020);oval([0,.39,.15],[.12,.23,.035],c[4],[0,0,-.25]);oval([.11,.60,.17],[.07,.07,.025],c[3]);star(.055,[.11,.73,.14],c[3]);
    for(let i=0;i<9;i++){const x=(i-4)*.19,y=-.84-Math.abs(i-4)*.03;line([x,-.70,.07],[x,y,.07],c[3],.006);oval([x,y-.035,.10],[.023,.035,.016],i%2?c[4]:c[2]);}
    for(const side of [-1,1])for(let i=0;i<3;i++)ring(.13+i*.07,.008,[side*.56,.42-i*.06,.13],c[3],Math.PI);
  }
  // Fine relief belongs to each motif rather than a generic decorative badge.
  if(item.motif==='botanical'){
    for(const x of [-.405,.405])for(const y of [-.53,.53]){line([x,y,.13],[x+Math.sign(-x)*.07,y,.13],c[0],.006);line([x,y,.13],[x,y+Math.sign(-y)*.07,.13],c[0],.006);}
    for(const x of [-.07,0,.07])box([.038,.006,.004],[x,-.45,.14],c[2],0);
  }else if(item.motif==='daisy'){
    for(let i=0;i<18;i++){const a=i*Math.PI/9;line([Math.cos(a)*.375,.07+Math.sin(a)*.375,.084],[Math.cos(a+.045)*.415,.07+Math.sin(a+.045)*.415,.085],c[2],.004);}
  }else if(item.motif==='rainbow'){
    for(let i=0;i<11;i++){const a=.16+i*(Math.PI-.32)/10;oval([Math.cos(a)*.57,-.08+Math.sin(a)*.57,.069],[.006,.006,.003],c[5]);}
    for(const x of [-.40,0,.40])oval([x,-.30,.073],[.011,.011,.007],c[2]);
  }else if(item.motif==='butterfly'){
    box([.31,.10,.014],[0,-.49,.143],c[3],.008);box([.26,.066,.008],[0,-.49,.155],c[2],.005);
    for(const x of [-.07,0,.07])box([.038,.005,.003],[x,-.49,.161],c[4],0);
  }else if(item.motif==='moon'){
    for(let i=0;i<7;i++){const a=1.95+i*.33;oval([-.04+Math.cos(a)*.36,.40+Math.sin(a)*.36,.108],[.010,.010,.007],c[3]);}
  }else if(item.motif==='clock'){
    for(const side of [-1,1])for(let i=0;i<4;i++)leaf([side*(.24+i*.10),.57-i*.08,.12],.045,c[1],side*-.6);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;line([Math.sin(a)*.235,.08+Math.cos(a)*.235,.198],[Math.sin(a)*.250,.08+Math.cos(a)*.250,.198],c[4],.003);}
  }else if(item.motif==='ocean'){
    for(let i=0;i<3;i++){const x=(i-1)*.61,y=i===1?.07:-.05;for(let j=0;j<5;j++)oval([x-.18+j*.09,y-.08,.156],[.021,.007,.004],c[4]);line([x-.15,y-.38,.13],[x+.15,y-.38,.13],c[3],.003);}
  }else if(item.motif==='sakura'){
    for(let i=0;i<15;i++){const a=.10+i*(Math.PI-.20)/14;oval([Math.cos(a)*.854,-.48+Math.sin(a)*.854,.105],[.010,.010,.006],c[4]);}
  }else if(item.motif==='mirror'){
    for(let i=0;i<8;i++){const a=i*Math.PI/4;box([.024,.024,.014],[Math.cos(a)*.57,Math.sin(a)*.57,.09],c[4],0,[0,0,Math.PI/4]);}
  }else if(item.motif==='crystal'){
    for(let i=0;i<9;i++){const x=(i-4)*.14;ring(.025,.004,[x,.42,.06],c[0]);}
  }else if(item.motif==='celestial'){
    for(let i=0;i<24;i++){const a=i*Math.PI/12;line([Math.cos(a)*.675,Math.sin(a)*.675,.087],[Math.cos(a)*.703,Math.sin(a)*.703,.087],c[1],.003);}
  }else if(item.motif==='phoenix'){
    for(let i=0;i<6;i++){const x=(i-2.5)*.28;for(const y of [-.49,.52])star(.026,[x,y,.115],c[4],.009);}
  }
  b.finish(root);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const transform=new THREE.Matrix4().makeTranslation(-center.x,-center.y,-bounds.min.z);
  const scaling=new THREE.Matrix4().makeScale(item.width/size.x,item.height/size.y,Math.min(1,.20/size.z));transform.premultiply(scaling);
  root.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.applyMatrix4(transform);mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();}});root.updateMatrixWorld(true);
  return {root,definition:{label:item.name,draggable:true,blocksNavigation:false,blocksPlacement:false,boxes:[{center:[0,0,.11],size:[item.width+.02,item.height+.02,.24]}]}};
}

/** A complete tiled surface. Material batches keep large rooms inexpensive. */
export function createFloorFinish(sku,width,depth,materials){
  const item=FLOOR_CATALOG.find(p=>p.sku===sku);if(!item)throw new RangeError(`未知地砖：${sku}`);
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0||width>80||depth>80)throw new TypeError('地砖需要有效的房间宽深');
  const b=geometryBuilder(materials),{box,oval,line,star}=b,c=item.colors,root=new THREE.Group();root.name='room-floor-finish';Object.assign(root.userData,{floorFinish:true,sku,width,depth});
  box([width,.008,depth],[0,.039,0],c[1],0);
  const countX=Math.max(1,Math.ceil(width/.95)),countZ=Math.max(1,Math.ceil(depth/.95)),sx=width/countX,sz=depth/countZ;
  for(let ix=0;ix<countX;ix++)for(let iz=0;iz<countZ;iz++){
    const x=-width/2+sx*(ix+.5),z=-depth/2+sz*(iz+.5),alternate=(ix+iz)%2;
    const color=item.motif==='checker'?c[alternate?1:0]:item.motif==='parquet'?c[alternate?1:0]:c[0];box([sx-.018,.008,sz-.018],[x,.045,z],color,0);
    if(item.motif==='honey'){if(!alternate)box([.07,.002,.07],[x,.051,z],c[2],.01,[0,Math.PI/4,0]);}
    if(item.motif==='diamond'){box([sx*.45,.002,sz*.45],[x,.051,z],c[1],0,[0,Math.PI/4,0]);box([.06,.002,.06],[x+sx*.45,.052,z+sz*.45],c[2],0,[0,Math.PI/4,0]);}
    if(item.motif==='mosaic'){for(const side of [-1,1]){box([sx*.50,.002,.045],[x,.051,z],c[1],0,[0,side*Math.PI/4,0]);}box([.10,.003,.10],[x,.052,z],c[2],0,[0,Math.PI/4,0]);}
    // Terrazzo chips are flat stone cuts. Plain boxes preserve the angular
    // inlay silhouette without tessellating invisible sub-millimetre bevels.
    if(item.motif==='terrazzo')for(let j=0;j<5;j++){const a=(ix*13+iz*7+j*2.4),dx=Math.sin(a)*sx*.32,dz=Math.cos(a*1.7)*sz*.32;box([.055+(j%2)*.04,.002,.04],[x+dx,.051,z+dz],c[1+j%3],0,[0,a,0]);}
    if(item.motif==='parquet'){for(let j=-1;j<=1;j++){box([sx*.46,.002,.025],[x+j*sx*.25,.051,z],c[2],0,[0,alternate?Math.PI/4:-Math.PI/4,0]);}}
    if(item.motif==='marble'){for(let j=0;j<2;j++){box([sx*.78,.002,.012],[x,.051,z+(j-.5)*sz*.28],c[j?2:1],0,[0,(alternate?.5:-.35)+j*.15,0]);}if((ix+iz)%3===0)box([.08,.003,.08],[x,.053,z],c[3],0,[0,Math.PI/4,0]);}
    if(item.motif==='royal'){box([sx*.55,.002,sz*.55],[x,.051,z],alternate?c[1]:c[3],0,[0,Math.PI/4,0]);box([sx*.27,.002,sz*.27],[x,.053,z],c[2],0,[0,Math.PI/4,0]);box([sx*.13,.002,sz*.13],[x,.055,z],c[4],0,[0,Math.PI/4,0]);}
  }
  if(['checker','diamond','mosaic','terrazzo','parquet','marble','royal'].includes(item.motif)){
    const border=item.motif==='royal'?.16:.08,gold=c[item.motif==='royal'?2:Math.min(2,c.length-1)];
    for(const side of [-1,1]){box([width-.06,.002,border],[0,.055,side*(depth/2-border/2-.03)],gold,0);box([border,.002,depth-.06],[side*(width/2-border/2-.03),.055,0],gold,0);}
    if(item.motif==='royal'){
      for(const side of [-1,1]){box([width-.46,.002,.025],[0,.057,side*(depth/2-.26)],c[1],0);box([.025,.002,depth-.46],[side*(width/2-.26),.057,0],c[1],0);}
      for(const x of [-width/2+.48,width/2-.48])for(const z of [-depth/2+.48,depth/2-.48]){box([.27,.003,.27],[x,.059,z],c[1],0,[0,Math.PI/4,0]);box([.13,.003,.13],[x,.061,z],c[3],0,[0,Math.PI/4,0]);}
      const medallion=star(Math.min(width,depth)*.17,[0,.056,0],c[1],.004,8);medallion.rotation.x=-Math.PI/2;medallion.updateMatrix();
      const inner=star(Math.min(width,depth)*.13,[0,.060,0],c[2],.003,8);inner.rotation.x=-Math.PI/2;inner.updateMatrix();
    }
  }
  // Crisp inset edges and corners keep every finish finished at room scale.
  const trim=c[Math.min(2,c.length-1)];
  for(const side of [-1,1]){box([width-.12,.001,.009],[0,.064,side*(depth/2-.065)],trim,0);box([.009,.001,depth-.12],[side*(width/2-.065),.064,0],trim,0);}
  for(const x of [-width/2+.22,width/2-.22])for(const z of [-depth/2+.22,depth/2-.22]){
    if(['honey','checker','diamond'].includes(item.motif)){box([.11,.002,.11],[x,.065,z],trim,0,[0,Math.PI/4,0]);box([.065,.001,.065],[x,.067,z],c[0],0,[0,Math.PI/4,0]);}
    else if(item.motif==='mosaic'){const point=star(.10,[x,.064,z],trim,.002,8);point.rotation.x=-Math.PI/2;point.updateMatrix();}
    else if(item.motif==='terrazzo'){for(let i=0;i<3;i++)box([.045,.001,.025],[x+(i-1)*.05,.065,z],c[1+i%3],0,[0,(i-1)*.4,0]);}
    else if(item.motif==='parquet'){for(let i=0;i<3;i++)box([.13,.001,.012],[x,.065,z+(i-1)*.035],c[3],0,[0,Math.PI/4,0]);}
    else if(item.motif==='marble'){for(let i=0;i<3;i++){box([.08,.001,.018],[x+(i-1)*.035,.065,z+(i-1)*.035],c[2],0,[0,Math.PI/4,0]);}}
    else{box([.055,.002,.055],[x,.065,z],c[2],0,[0,Math.PI/4,0]);}
  }
  b.finish(root);root.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=false;});return root;
}

export function resolveWallPaint(value='cream'){
  const preset=WALL_PAINTS.find(p=>p.id===value);if(preset)return {...preset};
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))return null;
  const color=new THREE.Color(value),stripe=color.clone().lerp(new THREE.Color(0x334455),.09);
  return {id:value.toLowerCase(),name:'自选墙色',color:color.getHex(),stripe:stripe.getHex()};
}
/** Clones only wall materials once; furniture materials remain shared and intact. */
export function applyWallPaint(furniture,value='cream'){
  const paint=resolveWallPaint(value),shell=furniture?.get?.('room-shell');if(!paint||!shell)return false;
  shell.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const role=mesh.userData.wallPaintRole||(mesh.material?.color?.getHex()===0xffedc2?'wall':mesh.material?.color?.getHex()===0xffe3aa?'stripe':null);
    if(!role)return;
    mesh.userData.wallPaintRole=role;if(!mesh.userData.wallPaintOwnMaterial){mesh.material=mesh.material.clone();mesh.userData.wallPaintOwnMaterial=true;}
    mesh.material.color.setHex(role==='wall'?paint.color:paint.stripe);
  });
  shell.userData.wallColor=paint.id;return paint;
}
