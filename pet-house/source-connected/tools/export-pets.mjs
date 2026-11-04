import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AnimationClip,MeshStandardMaterial,QuaternionKeyframeTrack,VectorKeyframeTrack} from '../vendor/three/three.module.js';
import {GLTFExporter} from '../vendor/addons/exporters/GLTFExporter.js';
import {createPetCharacter,PET_MODELS} from '../characters/pet-models.js';
// Install the exporter's Blob adapter, without running the fox exporter.
import './export-character.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const same=(a,b)=>a.every((value,i)=>Math.abs(value-b[i])<1e-6);
function bakeClip(sku,name,duration,sampleRate=24){
  const pet=createPetCharacter(sku),{model,pose}=pet;
  if(name==='sit')pose.sit();
  if(name==='stand'){pose.sit();pose.update(pose.duration.sit);pose.stand();}
  const nodes=[];model.traverse(node=>nodes.push(node));
  const samples=new Map(nodes.map(node=>[node.name,{position:[],quaternion:[],scale:[]}]));
  const frames=Math.ceil(duration*sampleRate),times=[];let previous=0;
  for(let i=0;i<=frames;i++){
    const time=duration*i/frames;
    if(name==='walk')pose.setLocomotion({speed:1.5,phase:2*Math.PI*time/duration,weight:1});
    pose.update(time-previous);previous=time;
    if(name==='sit'||name==='stand')model.position.y=-pose.contactY*pose.amount;
    times.push(time);
    for(const node of nodes){const sample=samples.get(node.name);sample.position.push(node.position.toArray());sample.quaternion.push(node.quaternion.toArray());sample.scale.push(node.scale.toArray());}
  }
  const loop=name==='idle'||name==='walk',tracks=[];
  for(const [nodeName,properties]of samples)for(const [property,values]of Object.entries(properties)){
    if(loop)values[values.length-1]=values[0].slice();
    if(values.every(value=>same(value,values[0])))continue;
    const Track=property==='quaternion'?QuaternionKeyframeTrack:VectorKeyframeTrack;
    tracks.push(new Track(`${nodeName}.${property}`,times,values.flat()));
  }
  pet.dispose();return new AnimationClip(name,duration,tracks);
}
export async function exportPetModels({directory=resolve(root,'assets','pets')}={}){
  await mkdir(directory,{recursive:true});const entries=[];
  for(const entry of PET_MODELS){
    const pet=createPetCharacter(entry.sku),{model,pose}=pet,converted=new Map();
    const clips=[bakeClip(entry.sku,'idle',3),bakeClip(entry.sku,'walk',1),bakeClip(entry.sku,'sit',pose.duration.sit),bakeClip(entry.sku,'stand',pose.duration.stand)];
    const clone=model.clone(true);
    clone.traverse(node=>{if(!node.isMesh)return;if(!converted.has(node.material))converted.set(node.material,new MeshStandardMaterial({color:node.material.color.clone(),roughness:.88}));node.material=converted.get(node.material);});
    try{
      const result=await new GLTFExporter().parseAsync(clone,{binary:true,trs:true,onlyVisible:true,animations:clips});
      const bytes=Buffer.from(result);if(bytes.length>500000)throw new Error(`${entry.sku} exceeds 500 KB`);
      const metadata={...pet.metadata,file:`${entry.sku}.glb`,format:'glTF 2.0 binary',bytes:bytes.length,contactY:pose.contactY,externalTextures:false,
        animations:clips.map(clip=>({name:clip.name,duration:clip.duration,channels:clip.tracks.length,loop:['idle','walk'].includes(clip.name)})),
        animationPlacement:{sitAndStandIncludeRootSeatOffset:true,runtimeFactoryUsesExternalSeatOffset:true}};
      await writeFile(resolve(directory,metadata.file),bytes);entries.push(metadata);
    }finally{converted.forEach(mat=>mat.dispose());pet.dispose();}
  }
  await writeFile(resolve(directory,'metadata.json'),JSON.stringify(entries,null,2)+'\n');return entries;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const entries=await exportPetModels();process.stdout.write(JSON.stringify(entries.map(({sku,bytes,triangles})=>({sku,bytes,triangles})),null,2)+'\n');
}
