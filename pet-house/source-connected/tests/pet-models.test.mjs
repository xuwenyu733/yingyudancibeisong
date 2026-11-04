import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Box3,Vector3} from '../vendor/three/three.module.js';
import {GLTFLoader} from '../vendor/addons/loaders/GLTFLoader.js';
import {PET_MODELS,createPetCharacter} from '../characters/pet-models.js';
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const prefix=sku=>sku.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('');
const advance=(pose,seconds)=>{for(let remaining=seconds;remaining>1e-9;){const step=Math.min(1/120,remaining);pose.update(step);remaining-=step;}};

test('pet catalog has four distinct species and preserves the starter fox',()=>{
  assert.deepEqual(PET_MODELS.map(p=>p.sku),['cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']);
  assert.equal(new Set(PET_MODELS.map(p=>p.silhouette)).size,4);
  const fox=createPetCharacter();assert.equal(fox.metadata.displayName,'杏橘狐');fox.dispose();
  assert.throws(()=>createPetCharacter('missing'),RangeError);
});
test('species retain distinct body geometry when every animal uses the same monochrome palette',()=>{
  const fingerprints=[],bodyRatios=[];
  function fingerprint(model){
    model.updateMatrixWorld(true);const points=[],v=new Vector3();let meshes=0;
    model.traverse(node=>{if(!node.isMesh||!node.visible)return;meshes++;const positions=node.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);points.push(v.toArray().map(value=>Math.round(value*10000)).join(','));}
    });
    points.sort();return createHash('sha256').update(`${meshes}|${points.join(';')}`).digest('hex');
  }
  for(const entry of PET_MODELS){
    const normal=createPetCharacter(entry.sku),palette=Object.fromEntries(normal.metadata.design.paletteKeys.map(key=>[key,'#aaaaaa'])),mono=createPetCharacter(entry.sku,{palette});
    try{
      assert.equal(normal.metadata.source,'original-independent-species-geometry');
      const colored=fingerprint(normal.model),uncolored=fingerprint(mono.model);assert.equal(uncolored,colored,'palette changes must preserve the actual species mesh');fingerprints.push(uncolored);
      const p=prefix(entry.sku),bodyName={'cloud-bunny':'PearBody','mint-cat':'CompactBody','cocoa-bear':'BroadBody','starlight-penguin':'HeadShell'}[entry.sku];
      const body=normal.model.getObjectByName(`${p}_${bodyName}`),bounds=new Box3().setFromObject(body),size=bounds.getSize(new Vector3());
      assert.ok(size.x>0&&size.y>0&&size.z>0);bodyRatios.push((size.x/size.y).toFixed(2));
      normal.model.traverse(node=>assert.ok(!/Fox_|OriginalFox|_MintShirt$|_Shorts$/.test(node.name),'non-fox animals must not contain a disguised starter-fox body'));
    }finally{normal.dispose();mono.dispose();}
  }
  assert.equal(new Set(fingerprints).size,PET_MODELS.length,'all four monochrome animals must have different geometry');
  assert.equal(new Set(bodyRatios).size,PET_MODELS.length,'species need distinct torso proportions as well as ears and colors');
});
test('shop thumbnails are distinct, current renders of each runtime species model',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/pets/previews/metadata.json',import.meta.url),'utf8'));
  assert.equal(manifest.kind,'runtime-model-studio-render');assert.equal(manifest.source,'characters/pet-models.js');
  const source=readFileSync(new URL('../characters/pet-models.js',import.meta.url));assert.equal(manifest.sourceSha256,createHash('sha256').update(source).digest('hex'),'model geometry changes require regenerated previews');
  assert.deepEqual(manifest.entries.map(entry=>entry.sku),['apricot-fox',...PET_MODELS.map(entry=>entry.sku)]);
  const hashes=[];
  for(const entry of manifest.entries){
    const bytes=readFileSync(new URL(`../assets/pets/previews/${entry.file}`,import.meta.url)),pet=createPetCharacter(entry.sku);
    try{assert.equal(entry.modelId,pet.metadata.id);assert.equal(entry.triangles,pet.metadata.triangles);}finally{pet.dispose();}
    assert.equal(entry.file,`${entry.sku}.png`);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);assert.equal(bytes.length,entry.bytes);
    const sha=createHash('sha256').update(bytes).digest('hex');assert.equal(sha,entry.sha256);hashes.push(sha);
  }
  assert.equal(new Set(hashes).size,manifest.entries.length,'pet cards must not reuse one generic portrait');
});
for(const entry of PET_MODELS){
  test(`${entry.sku}: normalized, distinct geometry and no external texture`,t=>{
    const pet=createPetCharacter(entry.sku);t.after(pet.dispose);
    const bounds=new Box3().setFromObject(pet.model);near(bounds.min.y,0);near(bounds.max.y,1);
    assert.equal(pet.metadata.sku,entry.sku);assert.equal(pet.metadata.displayName,entry.name);
    assert.ok(pet.pose.contactY>0&&pet.pose.contactY<.2);assert.ok(pet.metadata.triangles<12000);
    let triangles=0;const names=new Set();
    pet.model.traverse(node=>{assert.ok(!names.has(node.name),`duplicate: ${node.name}`);names.add(node.name);
      if(!node.isMesh)return;assert.ok(node.layers.isEnabled(1));assert.equal(node.material.map,null);
      if(node.visible)triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
      assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));
    });
    assert.equal(triangles,pet.metadata.triangles);
    assert.ok(names.has(`${prefix(entry.sku)}_HeadShell`));
    const distinctive={
      'cloud-bunny':'CloudBunny_Bunny_OuterEar_-1','mint-cat':'MintCat_Cat_CurledTail',
      'cocoa-bear':'CocoaBear_Bear_OuterEar_-1','starlight-penguin':'StarlightPenguin_Penguin_Star',
    };
    assert.ok(names.has(distinctive[entry.sku]));
  });
  test(`${entry.sku}: feet clear the floor and seat while walking/sitting/standing`,t=>{
    const pet=createPetCharacter(entry.sku);t.after(pet.dispose);const p=prefix(entry.sku);
    for(let i=0;i<=60;i++){
      pet.pose.setLocomotion({speed:1.5,phase:i/60*Math.PI*2,weight:1});
      for(const side of ['L','R'])assert.ok(new Box3().setFromObject(pet.model.getObjectByName(`${p}_Paw_${side}`)).min.y>-1e-5);
    }
    pet.pose.setLocomotion({speed:0,weight:0});
    for(const action of ['sit','stand']){
      pet.pose[action]();
      for(let i=0;i<190;i++){
        pet.pose.update(1/120);
        for(const side of ['L','R']){
          const bottom=new Box3().setFromObject(pet.model.getObjectByName(`${p}_Paw_${side}`)).min.y;
          assert.ok(bottom-pet.pose.contactY*pet.pose.amount>-1e-5,`${action}: paw ${bottom} below seat ${pet.pose.contactY*pet.pose.amount}`);
        }
      }
      near(pet.pose.amount,action==='sit'?1:0);
    }
    pet.pose.setWatering(1);pet.pose.setCelebrate(1);advance(pet.pose,1);pet.pose.setWatering(0);
    pet.model.traverse(node=>assert.ok([...node.position.toArray(),...node.rotation.toArray().slice(0,3),...node.scale.toArray()].every(Number.isFinite)));
  });
  test(`${entry.sku}: all attached GPU resources dispose once`,()=>{
    const pet=createPetCharacter(entry.sku),resources=new Set(),counts=new Map();
    pet.model.traverse(node=>{if(!node.isMesh)return;resources.add(node.geometry);resources.add(node.material);if(node.material.gradientMap)resources.add(node.material.gradientMap);});
    for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
    pet.pose.dispose();pet.dispose();
    for(const count of counts.values())assert.equal(count,1);
    pet.pose.update(1);pet.pose.sit();pet.pose.stand();pet.pose.setLocomotion({speed:1,phase:1,weight:1});
  });
  test(`${entry.sku}: standalone GLB loads with all four named animation clips`,async()=>{
    const bytes=readFileSync(new URL(`../assets/pets/${entry.sku}.glb`,import.meta.url));
    assert.ok(bytes.length<500000);assert.equal(bytes.readUInt32LE(0),0x46546c67);
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const gltf=await new GLTFLoader().parseAsync(buffer,'');
    assert.deepEqual(gltf.animations.map(clip=>clip.name),['idle','walk','sit','stand']);
    assert.ok(gltf.animations.every(clip=>clip.tracks.length>0));
    const bounds=new Box3().setFromObject(gltf.scene);near(bounds.min.y,0,1e-4);near(bounds.max.y,1,1e-4);
    gltf.scene.traverse(node=>{if(!node.isMesh)return;node.geometry.dispose();node.material.dispose();});
  });
}
