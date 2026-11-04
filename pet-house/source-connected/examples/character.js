import {
  ACESFilmicToneMapping,AmbientLight,CanvasTexture,CircleGeometry,Color,CylinderGeometry,
  DirectionalLight,HemisphereLight,Mesh,MeshBasicMaterial,MeshStandardMaterial,OrthographicCamera,
  PCFShadowMap,PlaneGeometry,Scene,SRGBColorSpace,WebGLRenderer,
} from '../vendor/three/three.module.js';
import {createOriginalFox} from '../characters/original-fox.js';

const canvas=document.querySelector('#character'),container=document.querySelector('#stage');
const status=document.querySelector('#stage-status'),buttons=[...document.querySelectorAll('[data-action]')];
const events=new AbortController(),eventOptions={signal:events.signal};
const renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;
const scene=new Scene();scene.background=new Color('#f8f2e6');
const camera=new OrthographicCamera(-1,1,.72,-.72,.01,20);
camera.position.set(1.7,1.10,3);camera.lookAt(0,.48,-.04);
camera.layers.enable(1);
scene.add(new HemisphereLight('#fff9e7','#c7d1b5',2.0));
scene.add(new AmbientLight('#fff5df',.20));
const key=new DirectionalLight('#fff3da',2.3);key.position.set(-1.8,3.6,3.8);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1.4;key.shadow.camera.right=1.4;
key.shadow.camera.top=1.7;key.shadow.camera.bottom=-1;key.shadow.normalBias=.012;key.shadow.bias=-.0002;key.shadow.radius=4;
scene.add(key);
const rim=new DirectionalLight('#dfece4',.8);rim.position.set(2,1,-2);scene.add(rim);
const ownGeometries=new Set(),ownMaterials=new Set(),ownTextures=new Set();
function addMesh(geometry,material){ownGeometries.add(geometry);ownMaterials.add(material);const mesh=new Mesh(geometry,material);scene.add(mesh);return mesh;}
const ground=addMesh(new CircleGeometry(2.5,64),new MeshStandardMaterial({color:'#f8f2e6',roughness:1}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.004;ground.receiveShadow=true;

// 独立原创软凳。站立时在脚后方；落座时角色后移少量，臀部承托于顶面。
const seatTop=.10;
const stool=addMesh(new CylinderGeometry(.225,.210,.09,32),new MeshStandardMaterial({color:'#c7d8c1',roughness:1}));
stool.position.set(0,seatTop-.045,-.24);stool.scale.z=.85;stool.castShadow=true;stool.receiveShadow=true;
const stoolBase=addMesh(new CylinderGeometry(.198,.190,.02,32),new MeshStandardMaterial({color:'#91aa95',roughness:1}));
stoolBase.position.set(0,.012,-.24);stoolBase.scale.z=.85;stoolBase.receiveShadow=true;

const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(64,64,7,64,64,63);
gradient.addColorStop(0,'rgba(78,85,55,0.19)');gradient.addColorStop(1,'rgba(78,85,55,0)');
context.fillStyle=gradient;context.fillRect(0,0,128,128);
const shadowTexture=new CanvasTexture(shadowCanvas);ownTextures.add(shadowTexture);
const softShadow=addMesh(new PlaneGeometry(.7,.58),new MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
softShadow.rotation.x=-Math.PI/2;softShadow.position.y=.002;
const character=createOriginalFox();scene.add(character.model);
document.querySelector('#mesh-facts').textContent=`${character.metadata.triangles.toLocaleString()} 三角面 · 身高归一为 1`;
let mode='idle',phase=0,lastTime=performance.now(),frameId=0,disposed=false,lastStatus='';

function play(action){
  if(disposed)return;mode=action;
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.action===mode)));
  if(action==='sit')character.pose.sit();else character.pose.stand();
  character.pose.setLocomotion({speed:0,phase,weight:0});
}
for(const button of buttons)button.addEventListener('click',()=>play(button.dataset.action),eventOptions);
function resize(){
  if(disposed)return;const width=container.clientWidth,height=container.clientHeight,aspect=width/height;
  const halfHeight=Math.max(.70,.48/aspect);camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;
  camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();renderer.setSize(width,height,false);
}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();},eventOptions);
function tick(now){
  if(disposed)return;frameId=requestAnimationFrame(tick);
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  const walking=mode==='walk';phase+=walking?dt*Math.PI*2*1.8:0;
  character.pose.setLocomotion({speed:walking?1.15:0,phase,weight:walking?1:0});
  character.pose.update(dt);
  // JS factory 的补偿合同：baseHeight 是逐渐接管的凳面高度，contactY 是角色承托点。
  const amount=character.pose.amount,baseHeight=seatTop*amount;
  character.model.position.y=baseHeight-character.pose.contactY*amount;
  character.model.position.z=-.12*amount;
  softShadow.position.z=-.12*amount;softShadow.scale.setScalar(1-.12*amount);
  const text=`${character.pose.stage}${walking&&amount<.01?' · 原地行走':mode==='idle'?' · 待机':''}`;
  if(text!==lastStatus){status.textContent=text;lastStatus=text;}
  renderer.render(scene,camera);
}
function dispose(){
  if(disposed)return;disposed=true;events.abort();resizeObserver.disconnect();cancelAnimationFrame(frameId);
  character.dispose();ownGeometries.forEach(geometry=>geometry.dispose());ownMaterials.forEach(material=>material.dispose());
  ownTextures.forEach(texture=>texture.dispose());renderer.dispose();delete window.OriginalFoxPreview;
}
window.addEventListener('pagehide',dispose,eventOptions);
window.OriginalFoxPreview={play,dispose,metadata:character.metadata,get mode(){return mode;},get stage(){return character.pose.stage;}};
frameId=requestAnimationFrame(tick);
