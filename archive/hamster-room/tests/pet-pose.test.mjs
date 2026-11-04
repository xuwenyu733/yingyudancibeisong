import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import {createPetPose} from '../pet-pose.js';

// 直接读取实际交付 GLB，检查真实的短腿、衣服和头部网格，而非替代测试方块。
const glb=readFileSync(new URL('../assets/pet.glb',import.meta.url));
const jsonLength=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonLength));
const binary=glb.subarray(28+jsonLength),primitive=json.meshes[0].primitives[0];
function attribute(index) {
  const a=json.accessors[index],v=json.bufferViews[a.bufferView];
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
  const stride=v.byteStride||components*size,start=(v.byteOffset||0)+(a.byteOffset||0);
  const result=a.componentType===5126?new Float32Array(a.count*components):new Uint32Array(a.count*components);
  for(let i=0;i<a.count;i++)for(let j=0;j<components;j++) {
    const offset=start+i*stride+j*size;
    result[i*components+j]=a.componentType===5126?binary.readFloatLE(offset):a.componentType===5125?binary.readUInt32LE(offset):a.componentType===5123?binary.readUInt16LE(offset):binary.readUInt8(offset);
  }
  return new THREE.BufferAttribute(result,components);
}
function createActualPet(t) {
  const original=new THREE.BufferGeometry();original.setAttribute('position',attribute(primitive.attributes.POSITION));
  original.setAttribute('normal',attribute(primitive.attributes.NORMAL));original.setAttribute('uv',attribute(primitive.attributes.TEXCOORD_0));
  original.setIndex(attribute(primitive.indices));original.computeBoundingBox();
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(original,material),pose=createPetPose(mesh);
  t.after(()=>{pose.dispose();original.dispose();material.dispose();});
  return {mesh,pose,original};
}
function advance(pose,seconds,step=1/120) {
  let remaining=seconds;while(remaining>1e-10){const dt=Math.min(step,remaining);pose.update(dt);remaining-=dt;}
}
const near=(actual,expected,epsilon=1e-6)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
function vertex(attribute,index){return new THREE.Vector3().fromBufferAttribute(attribute,index);}
function currentVertex(mesh,index) {
  const geometry=mesh.geometry,base=vertex(geometry.getAttribute('position'),index),result=base.clone();
  geometry.morphAttributes.position.forEach((target,j)=>result.addScaledVector(vertex(target,index).sub(base),mesh.morphTargetInfluences[j]));
  return result;
}
function mean(attribute,indices) {
  const result=new THREE.Vector3();for(const i of indices)result.add(vertex(attribute,i));return result.divideScalar(indices.length);
}
function select(attribute,predicate) {
  const indices=[];for(let i=0;i<attribute.count;i++)if(predicate(attribute.getX(i),attribute.getY(i),attribute.getZ(i)))indices.push(i);return indices;
}

test('real GLB gains six finite joint-based poses while preserving topology, UV and source geometry',t=>{
  const {mesh,pose,original}=createActualPet(t),geometry=mesh.geometry,base=original.getAttribute('position');
  assert.ok(base.count>40000);assert.notEqual(geometry,original);assert.equal(original.morphAttributes.position,undefined);
  assert.equal(geometry.morphAttributes.position.length,6);assert.equal(geometry.morphTargetsRelative,false);
  assert.equal(geometry.index.count,original.index.count);assert.deepEqual(geometry.getAttribute('uv').array,original.getAttribute('uv').array);
  for(let j=0;j<6;j++) {
    assert.equal(geometry.morphAttributes.position[j].count,base.count);
    for(const value of geometry.morphAttributes.position[j].array)assert.ok(Number.isFinite(value));
    for(const value of geometry.morphAttributes.normal[j].array)assert.ok(Number.isFinite(value));
  }
  assert.ok(pose.contactY>.04&&pose.contactY<.12);
  assert.ok(pose.duration.sit>1&&pose.duration.stand>1);
});

test('sitting visibly leans forward, bends knees, lands and settles instead of uniformly squashing',t=>{
  const {mesh,pose,original}=createActualPet(t),base=original.getAttribute('position'),targets=mesh.geometry.morphAttributes.position;
  const head=select(base,(_x,y)=>y>.55),feet=select(base,(_x,y)=>y<.075);
  const leanHead=mean(targets[1],head),seatedHead=mean(targets[3],head);
  assert.ok(leanHead.x-seatedHead.x>.10,'head must visibly lean toward +X before settling');
  assert.ok(mean(targets[3],feet).x-mean(base,feet).x>.035,'folded short legs must move forward');
  pose.sit();near(pose.amount,0);assert.equal(pose.stage,'前倾准备');
  advance(pose,.28);near(mesh.morphTargetInfluences[0],1);near(pose.amount,.08);
  advance(pose,.50);near(mesh.morphTargetInfluences[1],1);near(pose.amount,.58);
  advance(pose,.34);near(mesh.morphTargetInfluences[2],1);near(pose.amount,.94);
  advance(pose,.34);near(mesh.morphTargetInfluences[3],1);near(pose.amount,1);assert.equal(pose.stage,'坐稳');
  advance(pose,1);near(mesh.morphTargetInfluences[3],1);
});

test('glasses and head retain rigid shape at every pose and stay within 3% during blended motion',t=>{
  const {mesh,pose,original}=createActualPet(t),base=original.getAttribute('position');
  const head=select(base,(_x,y)=>y>.55);
  const top=head.reduce((a,b)=>base.getY(a)>base.getY(b)?a:b);
  const front=head.reduce((a,b)=>base.getX(a)>base.getX(b)?a:b);
  const side=head.reduce((a,b)=>base.getZ(a)>base.getZ(b)?a:b);
  const pairs=[[top,front],[front,side],[top,side]];
  for(const target of mesh.geometry.morphAttributes.position)for(const [a,b]of pairs) {
    near(vertex(target,a).distanceTo(vertex(target,b)),vertex(base,a).distanceTo(vertex(base,b)),2e-6);
  }
  pose.sit();
  for(let step=0;step<190;step++) {
    pose.update(1/120);
    for(const [a,b]of pairs) {
      const ratio=currentVertex(mesh,a).distanceTo(currentVertex(mesh,b))/vertex(base,a).distanceTo(vertex(base,b));
      assert.ok(ratio>.97&&ratio<1.001,`head distance ratio ${ratio}`);
    }
  }
});

test('standing first leans forward at seat height, then pushes through legs and straightens',t=>{
  const {mesh,pose}=createActualPet(t);pose.sit();advance(pose,pose.duration.sit+.01);
  pose.stand();assert.equal(pose.stage,'起立前倾');advance(pose,.32);
  near(mesh.morphTargetInfluences[4],1);near(pose.amount,1);
  advance(pose,.50);near(mesh.morphTargetInfluences[5],1);near(pose.amount,.38);
  advance(pose,.39);near(pose.amount,0);assert.equal(pose.stage,'站立');
  for(const weight of mesh.morphTargetInfluences)near(weight,0);
});

test('reversing or repeating commands preserves all current pose weights and placement amount',t=>{
  const {mesh,pose}=createActualPet(t);
  pose.sit();pose.stand();advance(pose,2);near(pose.amount,0);
  pose.sit();advance(pose,.9);
  let before=mesh.morphTargetInfluences.slice(),amount=pose.amount;pose.stand();
  before.forEach((weight,i)=>near(mesh.morphTargetInfluences[i],weight));near(pose.amount,amount);
  advance(pose,.18);before=mesh.morphTargetInfluences.slice();amount=pose.amount;pose.sit();
  before.forEach((weight,i)=>near(mesh.morphTargetInfluences[i],weight));near(pose.amount,amount);
  advance(pose,2);near(pose.amount,1);
  pose.stand();advance(pose,2);pose.sit();advance(pose,.70);pose.sit();advance(pose,.76);near(pose.amount,1);
});

test('all phase blends remain convex and seat support matches the measured contact plane',t=>{
  const {mesh,pose,original}=createActualPet(t),base=original.getAttribute('position'),normal=original.getAttribute('normal');
  let support=Infinity;
  const height=original.boundingBox.max.y-original.boundingBox.min.y,minY=original.boundingBox.min.y;
  const centerZ=(original.boundingBox.max.z+original.boundingBox.min.z)/2;
  const seated=mesh.geometry.morphAttributes.position[3];
  for(let i=0;i<base.count;i++) {
    const h=(base.getY(i)-minY)/height;
    if(base.getX(i)<-.105*height&&h>.075&&h<.21&&Math.abs(base.getZ(i)-centerZ)<.18*height&&normal.getY(i)<-.2)support=Math.min(support,seated.getY(i));
  }
  near(support,pose.contactY);
  const seatY=1.4,scale=1.18,rootY=seatY+.008-pose.contactY*scale;
  near(rootY+support*scale,seatY+.008);
  pose.sit();
  for(let step=0;step<400;step++) {
    if(step===200)pose.stand();pose.update(1/120);
    let sum=0;for(const weight of mesh.morphTargetInfluences){assert.ok(weight>=-1e-6&&weight<=1+1e-6);sum+=weight;}
    assert.ok(sum<=1+1e-6);assert.ok(pose.amount>=0&&pose.amount<=1);
  }
});

test('frame-rate changes preserve the same pose and dispose restores the original static model',t=>{
  const a=createActualPet(t),b=createActualPet(t);a.pose.sit();b.pose.sit();
  advance(a.pose,.91,1/120);advance(b.pose,.91,1/24);
  near(a.pose.amount,b.pose.amount);a.mesh.morphTargetInfluences.forEach((value,i)=>near(value,b.mesh.morphTargetInfluences[i]));
  const weights=a.mesh.morphTargetInfluences.slice();a.pose.update(NaN);a.pose.update(-1);assert.deepEqual(a.mesh.morphTargetInfluences,weights);
  a.pose.dispose();assert.equal(a.mesh.geometry,a.original);assert.equal(a.original.morphAttributes.position,undefined);
  assert.equal(a.mesh.morphTargetInfluences,undefined);assert.equal(a.mesh.morphTargetDictionary,undefined);
  a.pose.dispose();a.pose.sit();a.pose.update(1);assert.equal(a.mesh.geometry,a.original);
});
