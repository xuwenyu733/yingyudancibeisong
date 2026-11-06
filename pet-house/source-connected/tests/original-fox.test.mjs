import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnimationMixer,Box3,LoopOnce,Vector3,Quaternion} from '../vendor/three/three.module.js';
import {GLTFLoader} from '../vendor/addons/loaders/GLTFLoader.js';
import {createOriginalFox} from '../characters/original-fox.js';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function fixture(t,options){const character=createOriginalFox(options);t.after(()=>character.pose.dispose());return character;}
function advance(pose,seconds,step=1/120){for(let remaining=seconds;remaining>1e-9;){const dt=Math.min(step,remaining);pose.update(dt);remaining-=dt;}}
function transformSnapshot(model){const values=[];model.traverse(node=>values.push(...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()));return values;}

test('original fox is normalized, faces +Z, stays under 12k triangles and uses no external texture',t=>{
  const {model,metadata}=fixture(t);const box=new Box3().setFromObject(model);
  near(box.max.y-box.min.y,1);near(box.min.y,0);assert.equal(metadata.forwardAxis,'+Z');
  assert.equal(metadata.source,'original-procedural-geometry');assert.ok(metadata.triangles>3000&&metadata.triangles<=12000);
  let triangles=0;const names=new Set();
  model.traverse(node=>{
    assert.ok(!names.has(node.name),`duplicate name: ${node.name}`);names.add(node.name);
    if(!node.isMesh)return;
    triangles+=(node.geometry.index?.count??node.geometry.getAttribute('position').count)/3;
    assert.ok(node.material.isMeshToonMaterial);assert.equal(node.material.map,null);
    assert.ok(node.material.gradientMap.isDataTexture);assert.equal(node.material.gradientMap.image.data.byteLength,4);
    assert.ok(node.layers.isEnabled(1));assert.equal(node.geometry.morphAttributes.position,undefined);
  });
  assert.equal(triangles,metadata.triangles);
  assert.ok(model.getObjectByName('Fox_Nose').position.z>model.getObjectByName('Fox_HeadShell').position.z);
  assert.ok(model.getObjectByName('Fox_Tail_Base').position.z<0);
});

test('limbs, neck, ears and tail are actual named Object3D joint chains',t=>{
  const {model}=fixture(t);
  for(const side of ['L','R']) {
    const hip=model.getObjectByName(`Fox_Hip_${side}`),knee=model.getObjectByName(`Fox_Knee_${side}`),foot=model.getObjectByName(`Fox_Foot_${side}`);
    assert.equal(knee.parent,hip);assert.equal(foot.parent,knee);assert.equal(hip.parent.name,'Fox_Pelvis');
    assert.equal(hip.userData.joint,'hip');assert.ok(Math.abs(knee.position.y)>.1&&Math.abs(foot.position.y)>.08);
    const shoulder=model.getObjectByName(`Fox_Shoulder_${side}`),elbow=model.getObjectByName(`Fox_Elbow_${side}`);
    assert.equal(elbow.parent,shoulder);assert.equal(model.getObjectByName(`Fox_Hand_${side}`).parent,elbow);
    assert.equal(model.getObjectByName(`Fox_Ear_${side}`).parent.name,'Fox_Head');
  }
  assert.equal(model.getObjectByName('Fox_Head').parent.name,'Fox_Neck');
  assert.equal(model.getObjectByName('Fox_Tail_Tip').parent.name,'Fox_Tail_Mid');
});

test('walking alternates real hips and knees with diagonal front-limb coupling and level feet',t=>{
  const {model,pose}=fixture(t);
  pose.setLocomotion({speed:1.5,phase:Math.PI/2,weight:1});
  const left=model.getObjectByName('Fox_Hip_L'),right=model.getObjectByName('Fox_Hip_R');
  assert.ok(left.rotation.x<-.35&&right.rotation.x>.35);
  assert.ok(model.getObjectByName('Fox_Knee_L').rotation.x>.5);
  assert.ok(Math.abs(model.getObjectByName('Fox_Knee_R').rotation.x)<1e-6);
  // 真实狐狸是四足对角步态：前肢与对侧后腿同相。π/2 相位时左后腿后蹬（很负），右前肢也同向后摆。
  const shoulderL=model.getObjectByName('Fox_Shoulder_L'),shoulderR=model.getObjectByName('Fox_Shoulder_R');
  assert.ok(shoulderR.rotation.x>shoulderL.rotation.x,'front limbs swing opposite to the same-side hind limb (diagonal trot)');
  const q=new Quaternion();model.getObjectByName('Fox_Foot_L').getWorldQuaternion(q);near(q.angleTo(new Quaternion()),0);
  pose.setLocomotion({speed:1.5,phase:Math.PI*1.5,weight:1});assert.ok(left.rotation.x>.35&&right.rotation.x<-.35);
  assert.ok(shoulderL.rotation.x>shoulderR.rotation.x,'diagonal coupling mirrors on the other half cycle');
  pose.setLocomotion({speed:0,phase:0,weight:1});near(left.rotation.x,0);near(right.rotation.x,0);
});

test('sitting visibly goes through lean, hip and knee flexion, landing, then stable support',t=>{
  const {model,pose}=fixture(t);pose.sit();assert.equal(pose.stage,'前倾准备');
  advance(pose,.27);assert.ok(model.getObjectByName('Fox_Spine').rotation.x>.25);near(pose.amount,.05);
  advance(pose,.46);assert.equal(pose.stage,'屈髋屈膝');assert.ok(model.getObjectByName('Fox_Hip_L').rotation.x<-1);near(pose.amount,.45);
  advance(pose,.39);assert.equal(pose.stage,'落臀缓冲');assert.ok(model.getObjectByName('Fox_Knee_L').rotation.x>1.5);
  advance(pose,.34);assert.equal(pose.stage,'坐稳');near(pose.amount,1);
  assert.ok(pose.contactY>.08&&pose.contactY<.14);
  const pelvis=model.getObjectByName('Fox_Pelvis'),rig=model.getObjectByName('Fox_NormalizedRig');
  const buttBottom=rig.position.y+(pelvis.position.y-.085)*rig.scale.y;near(buttBottom,pose.contactY);
  for(const side of ['L','R']) {
    const footBox=new Box3().setFromObject(model.getObjectByName(`Fox_Paw_${side}`));
    assert.ok(footBox.min.y>=pose.contactY-1e-5,'feet must remain above the cushion contact plane');
  }
  pose.setLocomotion({speed:2,phase:Math.PI/2,weight:1});near(pose.amount,1);
  near(model.getObjectByName('Fox_Hip_L').rotation.x,model.getObjectByName('Fox_Hip_R').rotation.x);
});

test('standing coordinates forward lean, leg extension and upright recovery',t=>{
  const {model,pose}=fixture(t);pose.sit();advance(pose,pose.duration.sit);pose.stand();
  advance(pose,.32);assert.equal(pose.stage,'起立前倾');near(pose.amount,1);
  assert.ok(model.getObjectByName('Fox_Spine').rotation.x>.40);
  advance(pose,.51);assert.equal(pose.stage,'蹬腿伸髋');near(pose.amount,.38);
  advance(pose,.38);assert.equal(pose.stage,'站立');near(pose.amount,0);
  near(model.getObjectByName('Fox_Hip_L').rotation.x,0);near(model.getObjectByName('Fox_Knee_L').rotation.x,0);
});

test('feet remain on or above seat support through the complete sit and stand animation',t=>{
  const {model,pose}=fixture(t);
  for(const command of ['sit','stand']) {
    pose[command]();
    for(let i=0;i<190;i++) {
      pose.update(1/120);
      for(const side of ['L','R']) {
        const box=new Box3().setFromObject(model.getObjectByName(`Fox_Paw_${side}`));
        assert.ok(box.min.y-pose.contactY*pose.amount>=-1e-5,`${command} foot penetrates support`);
      }
    }
  }
});

test('head shape stays rigid; reversing and repeating commands is continuous and frame-rate independent',t=>{
  const a=fixture(t),b=fixture(t),head=a.model.getObjectByName('Fox_HeadShell');
  const originalPositions=head.geometry.getAttribute('position').array.slice(),originalScale=head.scale.clone();
  a.pose.sit();b.pose.sit();advance(a.pose,.90,1/120);advance(b.pose,.90,1/24);
  near(a.pose.amount,b.pose.amount);near(a.model.getObjectByName('Fox_Hip_L').rotation.x,b.model.getObjectByName('Fox_Hip_L').rotation.x);
  const before=transformSnapshot(a.model),amount=a.pose.amount;a.pose.stand();assert.deepEqual(transformSnapshot(a.model),before);near(a.pose.amount,amount);
  advance(a.pose,.1);const middle=transformSnapshot(a.model);a.pose.sit();assert.deepEqual(transformSnapshot(a.model),middle);
  advance(a.pose,2);a.pose.stand();advance(a.pose,2);a.pose.sit();advance(a.pose,.70);a.pose.sit();advance(a.pose,.76);near(a.pose.amount,1);
  assert.deepEqual(head.geometry.getAttribute('position').array,originalPositions);assert.ok(head.scale.equals(originalScale));
  const scale=head.getWorldScale(new Vector3());near(scale.x/originalScale.x,scale.y/originalScale.y);
});

test('seven-stage sitting stays finite when reversing from either middle or near-seated progress',t=>{
  for(const sitTime of [.8,1.13,1.34])for(const appearance of ['kid','classic']) {
    const {model,pose}=fixture(t,{appearance});pose.sit();advance(pose,sitTime);
    pose.stand();advance(pose,.1);const before=transformSnapshot(model),amount=pose.amount;
    pose.sit();assert.deepEqual(transformSnapshot(model),before);near(pose.amount,amount);
    for(let frame=0;frame<240;frame++) {
      pose.update(1/120);assert.ok(Number.isFinite(pose.amount));assert.ok(pose.amount>=0&&pose.amount<=1);
      assert.ok(transformSnapshot(model).every(Number.isFinite),`${appearance}, reversed at ${sitTime}s`);
    }
    near(pose.amount,1);assert.equal(pose.stage,'坐稳');
  }
});

test('rapid repeated sit/stand reversals never poison articulated transforms',t=>{
  const {model,pose}=fixture(t);
  for(let iteration=0;iteration<40;iteration++) {
    pose.sit();advance(pose,.08+(iteration%5)*.17);pose.stand();advance(pose,.025+(iteration%3)*.035);
    assert.ok(transformSnapshot(model).every(Number.isFinite));assert.ok(Number.isFinite(pose.amount));
  }
  pose.sit();advance(pose,2);near(pose.amount,1);pose.stand();advance(pose,2);near(pose.amount,0);
});

test('palette overrides are local and resource disposal happens once',t=>{
  const {model,pose}=fixture(t,{palette:{fur:'#da985a'}});
  assert.equal(model.getObjectByName('Fox_HeadShell').material.color.getHexString(),'da985a');
  const resources=new Set();model.traverse(node=>{if(node.isMesh){resources.add(node.geometry);resources.add(node.material);resources.add(node.material.gradientMap);}});
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  pose.dispose();pose.dispose();pose.update(1);pose.sit();pose.setLocomotion({speed:2,phase:1,weight:1});
  assert.equal(counts.size,resources.size);for(const count of counts.values())assert.equal(count,1);
});

test('portable GLB is self-contained under 500KB with four meaningful animation clips',()=>{
  const bytes=readFileSync(new URL('../assets/original-fox.glb',import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.ok(bytes.length<500000);
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
  assert.deepEqual(gltf.animations.map(clip=>clip.name),['idle','walk','sit','stand']);
  assert.equal(gltf.images?.length??0,0);assert.equal(gltf.textures?.length??0,0);
  for(const buffer of gltf.buffers)assert.equal(buffer.uri,undefined);
  for(const animation of gltf.animations)assert.ok(animation.channels.length>0);
  assert.ok(gltf.nodes.some(node=>node.name==='Fox_Hip_L'));
  assert.ok(gltf.nodes.some(node=>node.name==='Fox_Elbow_R'));
});

test('exported GLB reloads and replays articulated walk/sit/stand with seat offset baked once',async()=>{
  const bytes=readFileSync(new URL('../assets/original-fox.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const model=gltf.scene,mixer=new AnimationMixer(model),box=new Box3().setFromObject(model);
  near(box.max.y-box.min.y,1);near(box.min.y,0);
  const walk=mixer.clipAction(gltf.animations.find(clip=>clip.name==='walk'));walk.play();mixer.update(.25);
  assert.ok(model.getObjectByName('Fox_Hip_L').rotation.x<-.3);
  assert.ok(model.getObjectByName('Fox_Hip_R').rotation.x>.3);mixer.stopAllAction();
  const sit=mixer.clipAction(gltf.animations.find(clip=>clip.name==='sit'));sit.setLoop(LoopOnce,1);sit.clampWhenFinished=true;sit.play();mixer.update(1.46);model.updateMatrixWorld(true);
  assert.ok(model.getObjectByName('OriginalFox').position.y<-.09);
  assert.ok(model.getObjectByName('Fox_Knee_L').rotation.x>1.5);
  near(new Box3().setFromObject(model.getObjectByName('Fox_Shorts')).min.y,0,2e-5);
  assert.ok(new Box3().setFromObject(model.getObjectByName('Fox_Paw_L')).min.y>=-1e-5);mixer.stopAllAction();
  const stand=mixer.clipAction(gltf.animations.find(clip=>clip.name==='stand'));stand.setLoop(LoopOnce,1);stand.clampWhenFinished=true;stand.play();mixer.update(1.21);
  near(model.getObjectByName('OriginalFox').position.y,0);near(model.getObjectByName('Fox_Hip_L').rotation.x,0);
  for(const clip of gltf.animations.filter(clip=>['idle','walk'].includes(clip.name)))for(const track of clip.tracks) {
    const n=track.getValueSize();for(let j=0;j<n;j++)near(track.values[j],track.values[track.values.length-n+j]);
  }
  mixer.stopAllAction();mixer.uncacheRoot(model);
  const geometries=new Set(),materials=new Set();model.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);materials.add(node.material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
});

test('kid appearance adds blush, pupils and a belly patch; classic keeps the v2 minimal look',t=>{
  const kid=fixture(t);
  for(const name of ['Fox_Blush_L','Fox_Blush_R','Fox_Pupil_L','Fox_Pupil_R','Fox_BellyPatch']) {
    const node=kid.model.getObjectByName(name);assert.ok(node,`missing ${name}`);
    assert.ok(node.material.isMeshToonMaterial);assert.ok(node.material.gradientMap.isDataTexture);
  }
  assert.equal(kid.metadata.design.appearance,'kid');
  assert.ok(kid.metadata.design.paletteKeys.includes('blush')&&kid.metadata.design.paletteKeys.includes('pupil'));
  assert.ok(kid.metadata.animations.some(clip=>clip.name==='sit'&&clip.loop===false));
  const kidScale=kid.model.getObjectByName('Fox_HeadShell').scale.x;
  const classic=fixture(t,{appearance:'classic'});
  assert.ok(!classic.model.getObjectByName('Fox_Blush_L'));
  assert.ok(!classic.model.getObjectByName('Fox_Pupil_L'));
  assert.ok(!classic.model.getObjectByName('Fox_BellyPatch'));
  assert.ok(classic.model.getObjectByName('Fox_HeadShell').scale.x<kidScale);
  assert.equal(classic.metadata.design.appearance,'classic');
  // classic 配色不含新增键，但 palette 覆盖仍生效
  const tinted=fixture(t,{appearance:'classic',palette:{fur:'#da985a'}});
  assert.equal(tinted.model.getObjectByName('Fox_HeadShell').material.color.getHexString(),'da985a');
});

test('quadruped trot adds a small vertical bob and forward body pitch while paws stay above the floor for a full cycle',t=>{
  const {model,pose}=fixture(t);
  const pelvis=model.getObjectByName('Fox_Pelvis');
  const at=phase=>{pose.setLocomotion({speed:1.5,phase,weight:1});return model.position.y;};
  const low=at(0),high=at(Math.PI/2);
  assert.ok(high-low>0.015,`expect a visible bob, got ${high-low}`);
  for(let i=0;i<=120;i++) {
    const phase=i/120*Math.PI*2;
    pose.setLocomotion({speed:1.5,phase,weight:1});
    const feetBottom=Math.min(...['L','R'].map(side=>new Box3().setFromObject(model.getObjectByName(`Fox_Paw_${side}`)).min.y));
    assert.ok(feetBottom>=-1e-5,`paw dips below floor at phase ${phase}`);
  }
  pose.setLocomotion({speed:1.5,phase:Math.PI/2,weight:1});
  assert.ok(Math.abs(pelvis.position.x)>0.01,'pelvis should shift sideways for weight transfer');
  pose.setLocomotion({speed:1.5,phase:0,weight:1});
  assert.ok(model.getObjectByName('Fox_Spine').rotation.x<-0.25,'quadruped trot pitches the body forward toward horizontal');
});

test('setWatering raises both arms forward like holding a can and resets cleanly',t=>{
  const {model,pose}=fixture(t);
  const shoulderL=model.getObjectByName('Fox_Shoulder_L'),shoulderR=model.getObjectByName('Fox_Shoulder_R'),
        elbowL=model.getObjectByName('Fox_Elbow_L'),neck=model.getObjectByName('Fox_Neck');
  const restShoulder=shoulderL.rotation.x,restElbow=elbowL.rotation.x,restNeck=neck.rotation.x;
  pose.setWatering(1);
  assert.ok(shoulderL.rotation.x<restShoulder-.5,'shoulder should swing forward while watering');
  near(shoulderL.rotation.x,shoulderR.rotation.x,1e-9,'both arms stay symmetric');
  assert.ok(elbowL.rotation.x<restElbow-.05,'elbow should bend a little');
  assert.ok(neck.rotation.x>restNeck+.02,'neck should tilt down a touch');
  pose.setWatering(0);
  near(shoulderL.rotation.x,restShoulder);near(elbowL.rotation.x,restElbow);near(neck.rotation.x,restNeck);
  // 与坐/立无关：浇水姿势叠加在站姿之上，amount 不受影响。
  pose.setWatering(1);near(pose.amount,0);
});

test('sit and stand include the extra anticipation, gather and settle stages at expected times',t=>{
  const {model,pose}=fixture(t);
  pose.sit();
  advance(pose,.50);assert.equal(pose.stage,'沉髋蓄力');near(pose.amount,.24);
  advance(pose,.43);assert.equal(pose.stage,'抱膝收敛');near(pose.amount,.70);
  advance(pose,.38);assert.equal(pose.stage,'坐稳');near(pose.amount,1);
  pose.stand();
  advance(pose,.56);assert.equal(pose.stage,'撑膝发力');assert.ok(pose.amount>.80&&pose.amount<.92);
  advance(pose,.46);assert.equal(pose.stage,'起身回正');near(pose.amount,.12);
  advance(pose,.2);assert.equal(pose.stage,'站立');near(pose.amount,0);
});
