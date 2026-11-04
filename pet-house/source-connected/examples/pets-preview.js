import * as THREE from '../vendor/three/three.module.js';
import {createPetCharacter,PET_MODELS} from '../characters/pet-models.js';
const previews=[];
for(const item of PET_MODELS){
  const card=document.createElement('article'),canvas=document.createElement('canvas');card.append(canvas);
  const title=document.createElement('h2');title.textContent=item.name;card.append(title);
  const description=document.createElement('p');description.textContent=item.description;card.append(description);
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='坐下';card.append(toggle);
  const download=document.createElement('a');download.href=`../assets/pets/${item.sku}.glb`;download.download=`${item.sku}.glb`;download.textContent='下载 GLB';card.append(download);
  document.getElementById('pets').append(card);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xfffcf0,0x7d8f89,2.6));
  const light=new THREE.DirectionalLight(0xfff0cf,2.5);light.position.set(-2,3,4);scene.add(light);
  const camera=new THREE.PerspectiveCamera(30,1,.01,20);camera.position.set(1.1,.92,2.3);camera.lookAt(0,.48,0);
  const pet=createPetCharacter(item.sku);scene.add(pet.model);
  const ground=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.018,40),new THREE.MeshStandardMaterial({color:0xe5dfc9,roughness:1}));ground.position.y=-.014;scene.add(ground);
  let seated=false;toggle.addEventListener('click',()=>{seated=!seated;pet.pose[seated?'sit':'stand']();toggle.textContent=seated?'起立':'坐下';});
  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(canvas);resize();
  previews.push({renderer,scene,camera,pet});
}
let previous=performance.now();function frame(now){const dt=Math.min(.05,(now-previous)/1000);previous=now;for(const preview of previews){preview.pet.pose.update(dt);preview.pet.model.position.y=-preview.pet.pose.contactY*preview.pet.pose.amount;preview.renderer.render(preview.scene,preview.camera);}requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.addEventListener('pagehide',event=>{if(event.persisted)return;for(const preview of previews){preview.pet.dispose();preview.renderer.dispose();}},{once:true});
