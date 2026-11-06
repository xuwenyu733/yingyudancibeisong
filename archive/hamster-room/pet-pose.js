import {
  AnimationClip, AnimationMixer, BufferGeometry, Float32BufferAttribute,
  InterpolateLinear, LoopOnce, NumberKeyframeTrack,
} from './vendor/three/three.module.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t=clamp01(value); return t*t*(3-2*t); };
const range = (low, high, value) => smooth((value-low)/(high-low));
const radians = degrees => degrees*Math.PI/180;
const DURATION = Object.freeze({sit:1.45, stand:1.20});

// 静态 GLB 没有原生骨骼。这里用虚拟髋关节、膝关节和腰部枢轴，离线式生成
// 六个完整姿态，再由 AnimationMixer 混合播放；不是把整只仓鼠简单压扁。
// 参数依次是：前倾角、髋关节前后位移、髋高变化、大腿前屈角、小腿绝对角。
const POSES = Object.freeze([
  {name:'sit-anticipation', label:'前倾准备', lean:14, hipX:.012, hipY:0,     thigh:10, shin:-4},
  {name:'sit-lowering',    label:'屈髋屈膝', lean:22, hipX:-.025,hipY:-.018, thigh:46, shin:6},
  {name:'sit-contact',     label:'落臀缓冲', lean:14, hipX:-.045,hipY:-.043, thigh:78, shin:3},
  {name:'seated',          label:'坐稳',     lean:3,  hipX:-.035,hipY:-.032, thigh:74, shin:3},
  {name:'stand-anticipation',label:'起立前倾',lean:25, hipX:.010, hipY:-.032, thigh:74, shin:10},
  {name:'stand-push',      label:'蹬腿伸髋', lean:15, hipX:.022, hipY:-.009, thigh:34, shin:2},
]);

function rotate(x,y,angle) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return [c*x-s*y,s*x+c*y];
}

/**
 * 当前模型：Y 向上、前脸 +X、身高约 1，统一缩放交给外层。
 * 采用按坐标平滑分区的程序动作，保留原网格、索引和 UV，不替换脸或贴图。
 * y>=0.35H 的头脸在每个目标姿态中完全刚性转动，眼镜不会被压缩或剪切。
 * 这仍是静态模型的程序绑定示意，不等同于美术制作的专业骨骼和蒙皮。
 *
 * amount 是外部座面定位权重；起立准备阶段保持为 1，蹬腿后才逐渐归零。
 * 最终根高继续使用 seatY + clearance - contactY * petScale * amount。
 */
export function createPetPose(model) {
  let mesh=null;
  model.traverse(object=>{if(!mesh&&object.isMesh&&object.geometry?.getAttribute('position'))mesh=object;});
  if(!mesh)throw new Error('程序动作需要包含 POSITION 的仓鼠网格。');
  if(mesh.isSkinnedMesh)throw new Error('该程序绑定只用于当前无骨骼的静态仓鼠。');

  const originalGeometry=mesh.geometry;
  const originalMorphInfluences=mesh.morphTargetInfluences,originalMorphDictionary=mesh.morphTargetDictionary;
  const geometry=originalGeometry.clone();
  geometry.computeBoundingBox();
  const base=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
  const box=geometry.boundingBox,height=Math.max(box.max.y-box.min.y,1e-6);
  const originY=box.min.y,centerZ=(box.min.z+box.max.z)/2;
  const targetPositions=[],targetNormals=[];

  for(const pose of POSES) {
    const output=new Float32Array(base.count*3);
    const lean=-radians(pose.lean),thighAngle=radians(pose.thigh),shinAngle=radians(pose.shin);
    const hip={x:-.025,y:.205},knee={x:.015,y:.095};
    const rotatedKnee=rotate(knee.x-hip.x,knee.y-hip.y,thighAngle);
    const kneeX=hip.x+rotatedKnee[0],kneeY=hip.y+rotatedKnee[1];

    for(let i=0;i<base.count;i++) {
      const x=base.getX(i)/height,y=(base.getY(i)-originY)/height,z=base.getZ(i);

      // 腰部上方按同一刚体转动，完整保留眼镜、脸颊、耳朵的相对形状。
      const torsoRotation=rotate(x+.035,y-.245,lean);
      const torsoWeight=range(.17,.35,y);
      const torsoX=x+(torsoRotation[0]-.035-x)*torsoWeight;
      const torsoY=y+(torsoRotation[1]+.245-y)*torsoWeight;

      // 两腿朝 +X 弯曲。大腿绕髋旋转；小腿绕随动膝关节旋转，鞋面不被拉长。
      const upper=rotate(x-hip.x,y-hip.y,thighAngle);
      const lower=rotate(x-knee.x,y-knee.y,shinAngle);
      const shinWeight=1-range(.072,.135,y);
      const legX=(hip.x+upper[0])*(1-shinWeight)+(kneeX+lower[0])*shinWeight;
      const legY=(hip.y+upper[1])*(1-shinWeight)+(kneeY+lower[1])*shinWeight;

      // 最低的脚完整跟随腿；后侧臀部保留在髋上，避免把衣摆和臀部一起甩到前方。
      const lowLeg=1-range(.08,.14,y);
      const frontLeg=(1-range(.13,.235,y))*range(-.19,-.035,x);
      const legWeight=Math.max(lowLeg,frontLeg);
      output[i*3]=((1-legWeight)*torsoX+legWeight*legX+pose.hipX)*height;
      output[i*3+1]=originY+((1-legWeight)*torsoY+legWeight*legY+pose.hipY)*height;
      output[i*3+2]=z; // 不压缩横向体积，也不挤瘦脸部。
    }

    const position=new Float32BufferAttribute(output,3);position.name=pose.name;
    const normalGeometry=new BufferGeometry();
    if(geometry.index)normalGeometry.setIndex(geometry.index);
    normalGeometry.setAttribute('position',position);normalGeometry.computeVertexNormals();
    const poseNormal=normalGeometry.getAttribute('normal');poseNormal.name=pose.name;
    targetPositions.push(position);targetNormals.push(poseNormal);normalGeometry.dispose();
  }

  // 用真实交付网格的后下方承托点估算臀部接触高；不是取向前伸出的脚底。
  const seated=targetPositions[3];let contactY=Infinity;
  for(let i=0;i<base.count;i++) {
    const h=(base.getY(i)-originY)/height;
    if(base.getX(i)<-.105*height&&h>.075&&h<.21&&Math.abs(base.getZ(i)-centerZ)<.18*height&&(!normal||normal.getY(i)<-.2)) {
      contactY=Math.min(contactY,seated.getY(i));
    }
  }
  if(!Number.isFinite(contactY))contactY=originY+.065*height;

  geometry.morphTargetsRelative=false;
  geometry.morphAttributes.position=targetPositions;geometry.morphAttributes.normal=targetNormals;
  mesh.geometry=geometry;mesh.updateMorphTargets();mesh.morphTargetInfluences.fill(0);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();

  const stateKey='proceduralSitAmount',previousState=mesh.userData[stateKey];
  mesh.userData[stateKey]=0;
  const mixer=new AnimationMixer(mesh);
  let activeAction=null,activeClip=null,activeSchedule=[],desiredAmount=0,clipNumber=0,disposed=false;
  const readAmount=()=>clamp01(mesh.userData[stateKey]??0);
  const snapshot=()=>({weights:mesh.morphTargetInfluences.slice(),amount:readAmount()});
  const poseFrame=(index,amount,label)=>({weights:POSES.map((_,i)=>Number(i===index)),amount,label});
  const standingFrame=()=>({weights:POSES.map(()=>0),amount:0,label:'挺身站稳'});

  function transition(target) {
    if(disposed||(desiredAmount===target&&activeAction))return;
    const current=snapshot();desiredAmount=target;
    if(activeAction) {
      // stop 会恢复绑定初值，先缓存当前所有姿态权重，再完整恢复，反向点击不会闪回。
      activeAction.stop();mixer.uncacheAction(activeClip,mesh);mixer.uncacheClip(activeClip);
      mesh.morphTargetInfluences.splice(0,current.weights.length,...current.weights);
      mesh.userData[stateKey]=current.amount;activeAction=null;activeClip=null;
    }
    const alreadyAtTarget=target===0?current.weights.every(value=>Math.abs(value)<1e-6):Math.abs(current.weights[3]-1)<1e-6;
    if(alreadyAtTarget){mesh.userData[stateKey]=target;return;}

    let frames;
    if(target===1) {
      frames=[
        {at:.28,...poseFrame(0,.08,'前倾准备')},
        {at:.78,...poseFrame(1,.58,'屈髋屈膝')},
        {at:1.12,...poseFrame(2,.94,'落臀缓冲')},
        {at:DURATION.sit,...poseFrame(3,1,'坐稳')},
      ];
      // 中途从起立切回坐下时不先重新站直，直接接上相应的落座阶段。
      if(current.amount>.75)frames=frames.slice(2).map((frame,i)=>({...frame,at:i===0?.24:.58}));
      else if(current.amount>.30)frames=frames.slice(1).map((frame,i)=>({...frame,at:[.28,.60,.90][i]}));
    } else {
      frames=[
        {at:.32,...poseFrame(4,1,'起立前倾')},
        {at:.82,...poseFrame(5,.38,'蹬腿伸髋')},
        {at:DURATION.stand,...standingFrame()},
      ];
      if(current.amount<.20)frames=[{at:.38,...standingFrame()}];
    }

    // 每段用密集 smoothstep 关键帧做缓入缓出，始终保持非负且总和<=1的形态权重。
    // 不使用可能越界的三次样条，避免过冲造成眼镜/衣服短暂翻折。
    const times=[0],weightSamples=current.weights.map(value=>[value]),amountSamples=[current.amount];
    let from={...current,at:0};activeSchedule=[];
    for(const frame of frames) {
      activeSchedule.push({end:frame.at,label:frame.label});
      for(let step=1;step<=10;step++) {
        const alpha=step/10,eased=smooth(alpha);times.push(from.at+(frame.at-from.at)*alpha);
        for(let j=0;j<POSES.length;j++)weightSamples[j].push(from.weights[j]+(frame.weights[j]-from.weights[j])*eased);
        amountSamples.push(from.amount+(frame.amount-from.amount)*eased);
      }
      from=frame;
    }
    const tracks=weightSamples.map((values,i)=>new NumberKeyframeTrack(`.morphTargetInfluences[${i}]`,times,values,InterpolateLinear));
    tracks.push(new NumberKeyframeTrack(`.userData[${stateKey}]`,times,amountSamples,InterpolateLinear));
    activeClip=new AnimationClip(`程序${target?'坐下':'起立'}-${++clipNumber}`,frames.at(-1).at,tracks);
    activeAction=mixer.clipAction(activeClip).reset().setLoop(LoopOnce,1);
    activeAction.clampWhenFinished=true;activeAction.setEffectiveWeight(1);activeAction.play();mixer.update(0);
  }

  return {
    update(dt){if(!disposed&&Number.isFinite(dt)&&dt>=0)mixer.update(dt);},
    sit(){transition(1);},stand(){transition(0);},
    get amount(){return readAmount();},
    get stage(){
      if(!activeAction||activeAction.paused)return readAmount()>.99?'坐稳':'站立';
      return activeSchedule.find(phase=>activeAction.time<phase.end)?.label??(desiredAmount?'坐稳':'站立');
    },
    duration:DURATION,contactY,
    dispose(){
      if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(mesh);
      mesh.geometry=originalGeometry;mesh.morphTargetInfluences=originalMorphInfluences;
      mesh.morphTargetDictionary=originalMorphDictionary;geometry.dispose();
      if(previousState===undefined)delete mesh.userData[stateKey];else mesh.userData[stateKey]=previousState;
    },
  };
}
