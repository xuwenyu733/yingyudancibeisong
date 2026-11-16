import * as THREE from './vendor/three/three.module.js';
import {createPetCharacter,PET_MODELS} from './characters/pet-models.js';
import {createCompanionScene} from './companion-scene.js';
import {createDish,createStoryBook} from './cozy-props.mjs';
import {ROOM} from './layout.js';

const SKUS=new Set(['apricot-fox',...PET_MODELS.map(p=>p.sku)]);
const choice=(value,allowed,fallback='none')=>allowed.includes(value)?value:fallback;
/** Public cosmetics only: never infer growth from, or expose, learning history. */
export function visitorPet(input={}){
 return {sku:SKUS.has(input.sku)?input.sku:'apricot-fox',petName:Array.from(String(input.petName||'小伙伴')).slice(0,16).join(''),
  outfit:{hat:choice(input.outfit?.hat,['none','star','unicorn','ears','gardener','chef','designer']),scarf:choice(input.outfit?.scarf,['none','rose','mint']),backpack:choice(input.outfit?.backpack,['none','school'])},
  growthStage:choice(input.growthStage,['baby','young','adult'],'baby')};
}

/** An independently owned visual pet, never added to the layout/save registry. */
export function createVisitorAvatar({root,scene,doc,pet,reducedMotion=false}){
 const character=createPetCharacter(pet.sku),gait=new THREE.Group(),facing=new THREE.Group();
 root.add(gait);gait.add(facing);facing.scale.setScalar(ROOM.petHeight);facing.add(character.model);
 const actor={root,gait,facing,character,pose:character.pose,state:'idle'};
 const appearance=createCompanionScene({THREE,scene,doc,getActor:()=>actor,getFurniture:()=>new Map(),getSize:()=>({width:8,depth:8}),reducedMotion,appearanceOnly:true});
 let disposed=false,activity=null,prop=null,time=0,walkPhase=0;
 appearance.sync(pet);
 function clear(){prop?.dispose();prop=null;activity=null;character.pose.setWatering?.(0);character.pose.setCelebrate?.(0);character.pose.stand?.();appearance.interrupt();}
 function sparkles(kind){
  const group=new THREE.Group(),geometry=new THREE.SphereGeometry(.035,6,4),material=new THREE.MeshBasicMaterial({color:kind==='rocket'?0xffd17d:0xffef9f,transparent:true,opacity:.85});
  for(let i=0;i<7;i++){const p=new THREE.Mesh(geometry,material);p.position.set(Math.sin(i*2.4)*.35,.55+(i%3)*.13,Math.cos(i*2.4)*.30);group.add(p);}
  facing.add(group);let released=false;return {root:group,animate(t){if(!reducedMotion){group.rotation.y=t*.7;group.children.forEach((p,i)=>p.scale.setScalar(.75+Math.sin(t*3+i)*.25));}},dispose(){if(released)return;released=true;group.removeFromParent();geometry.dispose();material.dispose();}};
 }
 function wateringCan(){
  const group=new THREE.Group(),bodyGeo=new THREE.CylinderGeometry(.10,.13,.19,10),spoutGeo=new THREE.CylinderGeometry(.025,.035,.23,7),material=new THREE.MeshLambertMaterial({color:0x8ebdb2});
  const body=new THREE.Mesh(bodyGeo,material),spout=new THREE.Mesh(spoutGeo,material);spout.rotation.z=-.9;spout.position.set(.13,.03,0);group.add(body,spout);group.position.set(.15,.38,.25);group.rotation.z=-.35;facing.add(group);let released=false;
  return {root:group,animate(){},dispose(){if(released)return;released=true;group.removeFromParent();bodyGeo.dispose();spoutGeo.dispose();material.dispose();}};
 }
 function play(kind){clear();activity=kind;time=0;
  if(kind==='seat'||kind==='sit')character.pose.sit?.();
  else if(kind==='water'){character.pose.setWatering?.(1);prop=wateringCan();}
  else if(kind==='read'||kind==='tea'){
   prop=kind==='read'?createStoryBook():createDish('tea',{plate:false});prop.root.name='visitor-activity-prop';prop.root.scale.setScalar(.50);prop.root.position.set(0,.48,.30);if(kind==='read')prop.root.rotation.x=.55;facing.add(prop.root);
  }else if(['light','lamp','rocket','star-lamp'].includes(kind)){prop=sparkles(kind);character.pose.setCelebrate?.(reducedMotion?0:.6);}
  else if(kind==='greet')character.pose.setCelebrate?.(reducedMotion?0:1);
 }
 return {actor,play,clear,get contactOffset(){return (character.pose.contactY||0)*ROOM.petHeight*(character.pose.amount||0);},
  frame(dt,{walking=false,speed=0}={}){if(disposed)return;time+=dt;walkPhase+=dt*7;actor.state=walking?'walking':activity==='seat'||activity==='sit'?'seated':'idle';character.pose.setLocomotion?.({speed:reducedMotion?0:speed,phase:walkPhase,weight:walking&&!reducedMotion?1:0});character.pose.update?.(dt);appearance.frame(dt);prop?.animate(time,reducedMotion);},
  dispose(){if(disposed)return;disposed=true;clear();appearance.dispose();character.dispose();gait.removeFromParent();}};
}
