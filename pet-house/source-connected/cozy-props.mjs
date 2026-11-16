import * as T from './vendor/three/three.module.js';
import {RoundedBoxGeometry} from './vendor/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from './vendor/addons/utils/BufferGeometryUtils.js';

/** Small original props. Each instance owns its resources; none enter a saved furniture registry. */
function kit(name){
 const root=new T.Group();root.name=name;root.userData.temporaryActivity=true;const materials=new Map(),geometries=new Set();let disposed=false;
 function material(color){if(!materials.has(color))materials.set(color,new T.MeshToonMaterial({color}));return materials.get(color);}
 function mesh(g,color,x=0,y=0,z=0,parent=root){geometries.add(g);const n=new T.Mesh(g,material(color));n.position.set(x,y,z);n.layers.enable(1);parent.add(n);return n;}
 const box=(w,h,d,c,x=0,y=0,z=0,p=root)=>mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(.018,w/4,h/4,d/4)),c,x,y,z,p);
 const ball=(r,c,x=0,y=0,z=0,p=root)=>mesh(new T.SphereGeometry(r,10,7),c,x,y,z,p);
 const cylinder=(r1,r2,h,c,x=0,y=0,z=0,p=root)=>mesh(new T.CylinderGeometry(r1,r2,h,20),c,x,y,z,p);
 const ring=(r,t,c,x=0,y=0,z=0,p=root)=>mesh(new T.TorusGeometry(r,t,6,24),c,x,y,z,p);
 function bake(group=root){
  for(const child of [...group.children])if(child.isGroup)bake(child);
  const batches=new Map();for(const child of group.children){if(!child.isMesh||child.userData.ownSteamMaterial)continue;if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(child);}
  for(const [material,nodes] of batches){if(nodes.length<2)continue;const copies=nodes.map(n=>{n.updateMatrix();const original=n.geometry.clone().applyMatrix4(n.matrix);if(!original.index)return original;const copy=original.toNonIndexed();original.dispose();return copy;});const geometry=mergeGeometries(copies);copies.forEach(g=>g.dispose());if(!geometry)throw new Error('Activity geometry merge failed');geometries.add(geometry);for(const n of nodes){n.removeFromParent();geometries.delete(n.geometry);n.geometry.dispose();}const merged=new T.Mesh(geometry,material);merged.layers.enable(1);group.add(merged);}
 }
 function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();geometries.clear();materials.clear();}
 return {root,mesh,box,ball,cylinder,ring,bake,dispose,get disposed(){return disposed;}};
}
const smooth=n=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n);};

export function createStoryBook({color='#839e89'}={}){
 const k=kit('activity-storybook'),{root,box,ball}=k;const left=new T.Group(),right=new T.Group();root.add(left,right);
 for(const [side,sign] of [[left,-1],[right,1]]){
  box(.40,.026,.53,color,sign*.205,.014,0,side);box(.375,.045,.49,'#fff3d8',sign*.20,.05,0,side);
  for(const y of [.035,.046,.057])box(.35,.003,.465,'#e7d6b8',sign*.20,y,.002,side);
  for(let i=0;i<4;i++)box(.19-i*.014,.004,.009,'#b9b597',sign*.20,.076,.045+i*.043,side);
  const picture=ball(.063,sign<0?'#e9c273':'#a5bba5',sign*.20,.083,-.12,side);picture.scale.set(1,.07,1);
  for(let i=0;i<3;i++){const dot=ball(.013,'#839e89',sign*.20+(i-1)*.04,.086,-.13,side);dot.scale.y=.1;}
 }
 box(.027,.06,.54,'#658171',0,.034,0);box(.024,.006,.17,'#c98778',.024,.079,.22);
 const turning=new T.Group();turning.name='storybook-turning-page';root.add(turning);box(.37,.008,.48,'#fff8e6',.193,.09,0,turning);
 for(let i=0;i<4;i++)box(.18,.004,.008,'#b8bea6',.20,.096,.03+i*.046,turning);
 k.bake();
 return {...k,animate(seconds,reduced=false){if(k.disposed)return;const opening=reduced?1:smooth(seconds/.65);left.rotation.z=-.20*opening;right.rotation.z=.20*opening;const cycle=((Math.max(0,seconds-.8))%2.6)/2.6;turning.rotation.z=reduced?.20:.20+smooth(Math.min(1,cycle*1.6))*Math.PI;turning.visible=reduced||seconds>.7;}};
}

export function createDish(recipe='cookies',{plate=true}={}){
 if(!['cookies','juice','tea'].includes(recipe))throw new RangeError('Unknown dish');
 const k=kit('activity-dish-'+recipe),{root,box,ball,cylinder,ring}=k;root.userData.recipe=recipe;
 if(plate){cylinder(.42,.38,.038,'#fff6e2',0,.022,0);const rim=ring(.37,.012,'#dac29a',0,.046,0);rim.rotation.x=Math.PI/2;}
 const food=new T.Group();food.name='activity-food';root.add(food);const steam=[];
 if(recipe==='cookies'){
  for(const [i,x,z]of [[0,-.14,-.09],[1,.14,-.07],[2,0,.16]]){
   cylinder(.13,.125,.058,'#d5a36c',x,.075,z,food);cylinder(.11,.11,.014,'#e5bd88',x,.11,z,food);
   for(let j=0;j<6;j++){const a=j*Math.PI/3+i*.5;ball(.012,'#a57853',x+Math.cos(a)*.075,.121,z+Math.sin(a)*.075,food);}
   const carrot=box(.035,.009,.063,'#e4a261',x,.123,z,food);carrot.rotation.y=.35;
   for(const sign of [-1,1]){const leaf=ball(.018,'#91ac7d',x+sign*.011,.125,z-.037,food);leaf.scale.set(.5,.3,1);}
  }
 }else{
  const juice=recipe==='juice';cylinder(.15,.12,juice?.39:.26,juice?'#f0d6d1':'#b7c9a8',0,juice?.24:.18,0,food);
  cylinder(.128,.128,.012,juice?'#d9909b':'#9baa78',0,juice?.439:.315,0,food);
  const rim=ring(.145,.012,'#fff5df',0,juice?.445:.322,0,food);rim.rotation.x=Math.PI/2;
  if(juice){const straw=cylinder(.013,.013,.29,'#e8b2a8',.055,.53,0,food);straw.rotation.z=-.22;const berry=ball(.045,'#d97f92',-.11,.45,.01,food);berry.scale.y=1.1;ball(.018,'#7ca588',-.11,.497,.01,food);}
  else{ring(.075,.022,'#b7c9a8',.17,.20,0,food);for(const sign of [-1,1]){const leaf=ball(.042,'#78976e',sign*.025,.328,0,food);leaf.scale.set(.55,.1,1);leaf.rotation.y=sign*.4;}
   for(let i=0;i<5;i++){const puff=ball(.019,'#fff4df',0,.36,0);puff.material=puff.material.clone();puff.material.transparent=true;puff.material.opacity=.35;puff.material.depthWrite=false;puff.userData.ownSteamMaterial=true;steam.push(puff);}}
 }
 k.bake();const originalDispose=k.dispose;
 return {...k,food,animate(seconds,reduced=false){if(k.disposed)return;for(let i=0;i<steam.length;i++){const puff=steam[i],phase=reduced?.35:(seconds*.45+i/steam.length)%1;puff.position.set(Math.sin(phase*5+i)*.035,.36+phase*.38,Math.cos(i*2.4)*.025);puff.scale.setScalar(.7+phase*.8);puff.material.opacity=(1-phase)*.40;}},dispose(){if(k.disposed)return;for(const p of steam)p.material.dispose();originalDispose();}};
}

export function createTeaSet(recipe='tea'){
 const k=kit('activity-teatime'),book=createStoryBook(),dish=createDish(recipe);k.root.add(book.root,dish.root);book.root.scale.setScalar(.63);book.root.position.set(-.25,.02,0);dish.root.scale.setScalar(.67);dish.root.position.set(.24,0,.05);
 return {...k,animate(t,reduced=false){book.animate(t,reduced);dish.animate(t,reduced);},dispose(){book.dispose();dish.dispose();k.dispose();}};
}
