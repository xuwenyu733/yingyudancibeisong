import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AnimationClip,MeshStandardMaterial,QuaternionKeyframeTrack,VectorKeyframeTrack} from '../vendor/three/three.module.js';
import {GLTFExporter} from '../vendor/addons/exporters/GLTFExporter.js';
import {createOriginalFox} from '../characters/original-fox.js';

// 官方 Three.js r186 GLTFExporter，仅把 bare three 导入改成本地路径。
// https://github.com/mrdoob/three.js/blob/r186/examples/jsm/exporters/GLTFExporter.js
// Node 没有浏览器 FileReader；二进制导出只需这个 Blob.arrayBuffer 适配。
if(typeof globalThis.FileReader==='undefined')globalThis.FileReader=class {
  readAsArrayBuffer(blob){
    blob.arrayBuffer().then(result=>{this.result=result;this.onload?.({target:this});this.onloadend?.({target:this});})
      .catch(error=>{this.error=error;this.onerror?.({target:this,error});this.onloadend?.({target:this});});
  }
  readAsDataURL(blob){
    blob.arrayBuffer().then(result=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.({target:this});})
      .catch(error=>{this.error=error;this.onerror?.({target:this,error});});
  }
};

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const same=(a,b,epsilon=1e-6)=>a.every((value,i)=>Math.abs(value-b[i])<epsilon);

function bakeClip(name,duration,sampleRate) {
  const character=createOriginalFox();const {model,pose}=character;
  if(name==='sit')pose.sit();
  if(name==='stand'){pose.sit();pose.update(pose.duration.sit);pose.stand();}
  const nodes=[];model.traverse(node=>nodes.push(node));
  const samples=new Map(nodes.map(node=>[node.name,{position:[],quaternion:[],scale:[]}]))
  const frames=Math.ceil(duration*sampleRate),times=[];
  let previous=0;
  for(let i=0;i<=frames;i++) {
    const time=duration*i/frames,dt=time-previous;previous=time;
    if(name==='walk')pose.setLocomotion({speed:1.5,phase:2*Math.PI*time/duration,weight:1});
    pose.update(dt);
    // GLB 的坐起包含这条位移轨道，导入其他引擎后不用重复做坐垫根补偿。
    if(name==='sit'||name==='stand')model.position.y=-pose.contactY*pose.amount;
    times.push(time);
    for(const node of nodes) {
      const sample=samples.get(node.name);sample.position.push(node.position.toArray());
      sample.quaternion.push(node.quaternion.toArray());sample.scale.push(node.scale.toArray());
    }
  }
  const loop=name==='idle'||name==='walk',tracks=[];
  for(const [name,properties]of samples)for(const [property,values]of Object.entries(properties)) {
    if(loop)values[values.length-1]=values[0].slice();
    if(values.every(value=>same(value,values[0])))continue;
    const Track=property==='quaternion'?QuaternionKeyframeTrack:VectorKeyframeTrack;
    tracks.push(new Track(`${name}.${property}`,times,values.flat()));
  }
  pose.dispose();return new AnimationClip(name,duration,tracks);
}

export async function exportOriginalFox({directory=resolve(root,'assets'),sampleRate=30}={}) {
  const character=createOriginalFox();
  const clips=[bakeClip('idle',3,sampleRate),bakeClip('walk',1,sampleRate),
    bakeClip('sit',character.pose.duration.sit,sampleRate),bakeClip('stand',character.pose.duration.stand,sampleRate)];
  const clone=character.model.clone(true),converted=new Map();
  clone.traverse(node=>{
    if(!node.isMesh)return;
    if(!converted.has(node.material))converted.set(node.material,new MeshStandardMaterial({color:node.material.color.clone(),roughness:.88,metalness:0}));
    node.material=converted.get(node.material);
  });
  clone.animations=clips;
  let result;
  try {
    result=await new GLTFExporter().parseAsync(clone,{binary:true,trs:true,onlyVisible:true,animations:clips});
    const bytes=Buffer.from(result);
    if(bytes.length>500_000)throw new Error(`原创狐 GLB 超过 500KB：${bytes.length} bytes`);
    const metadata={...character.metadata,format:'glTF 2.0 binary',file:'original-fox.glb',bytes:bytes.length,
      contactY:character.pose.contactY,sampleRate,externalTextures:false,
      animationPlacement:{sitAndStandIncludeRootSeatOffset:true,runtimeFactoryUsesExternalSeatOffset:true},
      animations:clips.map(clip=>({name:clip.name,duration:clip.duration,channels:clip.tracks.length,loop:['idle','walk'].includes(clip.name)})),
      notes:['原创程序几何，未使用旧仓鼠模型、贴图或形状。','刚性分部关节动画，无蒙皮；具名节点可在其他程序中编辑。','GLB转为纯色PBR材质；Three.js运行时仍使用卡通材质。','idle/walk首尾闭合，sit/stand播一次并保持末帧。']};
    await mkdir(directory,{recursive:true});
    await writeFile(resolve(directory,'original-fox.glb'),bytes);
    await writeFile(resolve(directory,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
    return metadata;
  } finally {
    converted.forEach(material=>material.dispose());character.pose.dispose();
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const metadata=await exportOriginalFox();
  process.stdout.write(JSON.stringify({file:metadata.file,bytes:metadata.bytes,triangles:metadata.triangles,animations:metadata.animations},null,2)+'\n');
}
