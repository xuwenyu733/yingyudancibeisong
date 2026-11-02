import {
  Box3, Color, DataTexture, ExtrudeGeometry, Group, Mesh, MeshToonMaterial,
  NearestFilter, RedFormat, Shape, SphereGeometry, TubeGeometry, QuadraticBezierCurve3,
  Vector3,
} from '../vendor/three/three.module.js';

/**
 * 完全由程序几何构建的原创「杏橘狐」，面向 6–14 岁儿童目标人群。
 * 设计依据来自文策院《臺灣圖像角色消費與市場研究報告》(2025) 与日本
 * CHARACTER DATABANK《CharaBiz DATA 2025》等儿童角色偏好调研：
 * 儿童普遍偏爱「圆润轮廓 / 动物类 / 高辨识度 / 五官与情绪清晰 / 高饱和暖色」，
 * 幼态图式（大头、大眼、小鼻、圆颊、短肢）是跨文化通用的可爱要素。
 *
 * 本角色纯粹为程序几何原创，没有导入旧宠物、外部模型或外部贴图，
 * 也没有以任何现有品牌 / 动画角色 / 吉祥物作为设计模板（只采用上述通用原则）。
 *
 * 各部位是独立刚性网格，真实挂在髋/膝/脚、肩/肘、颈/头、耳/尾关节下。
 * 头脸不做 morph 或缩放；行走、坐起都直接转动这些关节。
 *
 * 外观预设：
 *   appearance: 'kid'（默认，幼态化：大头大眼圆颊、腮红、高饱和配色）
 *               'classic'（接近 v2 的经典比例与配色，便于 A/B 对比）
 * 可在 makeOptions 时用 palette 覆盖任一颜色，host 端可借此做换肤。
 */

const KID_PALETTE = Object.freeze({
  fur: '#eda95e', furShade: '#d18a4c', cream: '#fff3da', ear: '#f6cba8',
  shirt: '#8fc4b4', shirtShade: '#6fae9e', shorts: '#7e93a0', eye: '#293739',
  nose: '#584337', blush: '#ff9fb0', pupil: '#201c22',
});
const CLASSIC_PALETTE = Object.freeze({
  fur: '#e9a15f', furShade: '#cf8045', cream: '#fff0d4', ear: '#f4c8a6',
  shirt: '#81b4a6', shirtShade: '#639c8f', shorts: '#71818a', eye: '#293739',
  nose: '#584337',
});
const LOOKS = Object.freeze({
  kid: Object.freeze({
    head: [.231, .203, .177], eye: [.029, .039, .017], eyeY: .016, eyeZ: .160,
    cheek: [.101, .071, .055], earW: .165, earH: .250, plume: [.094, .092, .136],
    blush: true, pupil: true, belly: true, shirt: [.170, .167, .122],
  }),
  classic: Object.freeze({
    head: [.205, .180, .165], eye: [.021, .029, .012], eyeY: .014, eyeZ: .157,
    cheek: [.087, .060, .049], earW: .145, earH: .215, plume: [.082, .080, .121],
    blush: false, pupil: false, belly: false, shirt: [.158, .158, .117],
  }),
});
const DURATION = Object.freeze({ sit: 1.45, stand: 1.20 });
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rad = degrees => degrees * Math.PI / 180;
const STANDING = Object.freeze({ amount: 0, hipY: .255, hipZ: 0, lean: 0, thigh: 0, shin: 0, arm: 4, elbow: 12, head: 0, tail: 0 });
// 关键帧 at/amount/标签构成对外动画契约（runtime 与 GLB 均以此为锚点）：
// 在锚点之间额外插入的阶段只丰富动作细节，不改动锚点数值，保证既有测试与宿主状态机连续。
const SIT_FRAMES = [
  { at: .27, label: '前倾准备', value: { amount: .05, hipY: .260, hipZ: -.008, lean: 17, thigh: 14, shin: -4, arm: 22, elbow: 30, head: -6, tail: .20 } },
  { at: .50, label: '沉髋蓄力', value: { amount: .24, hipY: .254, hipZ: -.030, lean: 26, thigh: 34, shin: -8, arm: 28, elbow: 36, head: -9, tail: .34 } },
  { at: .73, label: '屈髋屈膝', value: { amount: .45, hipY: .250, hipZ: -.045, lean: 23, thigh: 58, shin: -6, arm: 32, elbow: 42, head: -10, tail: .48 } },
  { at: .93, label: '抱膝收敛', value: { amount: .70, hipY: .214, hipZ: -.048, lean: 19, thigh: 92, shin: 4, arm: 38, elbow: 52, head: -9, tail: .57 } },
  { at: 1.12, label: '落臀缓冲', value: { amount: .94, hipY: .182, hipZ: -.040, lean: 13, thigh: 115, shin: 20, arm: 12, elbow: 65, head: -8, tail: .66 } },
  { at: 1.30, label: '落座回稳', value: { amount: 1, hipY: .190, hipZ: -.034, lean: 7, thigh: 113, shin: 20, arm: 8, elbow: 70, head: -3, tail: .61 } },
  { at: DURATION.sit, label: '坐稳', value: { amount: 1, hipY: .190, hipZ: -.030, lean: 3, thigh: 113, shin: 20, arm: 6, elbow: 70, head: -2, tail: .60 } },
];
const SEATED = SIT_FRAMES.at(-1).value;
const STAND_FRAMES = [
  { at: .32, label: '起立前倾', value: { ...SEATED, hipZ: .005, lean: 24, arm: 30, elbow: 46, head: -10, tail: .58 } },
  { at: .56, label: '撑膝发力', value: { amount: .82, hipY: .222, hipZ: .006, lean: 28, thigh: 74, shin: -2, arm: 32, elbow: 52, head: -9, tail: .50 } },
  { at: .83, label: '蹬腿伸髋', value: { amount: .38, hipY: .254, hipZ: .008, lean: 15, thigh: 49, shin: -3, arm: 20, elbow: 30, head: -7, tail: .30 } },
  { at: 1.02, label: '起身回正', value: { amount: .12, hipY: .256, hipZ: .004, lean: 6, thigh: 18, shin: 0, arm: 8, elbow: 16, head: -2, tail: .10 } },
  { at: DURATION.stand, label: '挺身站稳', value: STANDING },
];

export function createOriginalFox({ palette = {}, appearance = 'kid' } = {}) {
  const look = LOOKS[appearance] || LOOKS.kid;
  const basePalette = appearance === 'classic' ? CLASSIC_PALETTE : KID_PALETTE;
  const colors = { ...basePalette, ...palette };
  const geometries = new Set(), materials = new Set();
  const model = new Group(); model.name = 'OriginalFox';
  const rig = new Group(); rig.name = 'Fox_NormalizedRig'; model.add(rig);
  const gradient = new DataTexture(new Uint8Array([104, 169, 220, 255]), 4, 1, RedFormat);
  gradient.name = 'Fox_InternalToonGradient'; gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false; gradient.needsUpdate = true;
  const mat = {};
  for (const [key, color] of Object.entries(colors)) {
    mat[key] = new MeshToonMaterial({ color: new Color(color), gradientMap: gradient });
    mat[key].name = `Fox_Material_${key}`; materials.add(mat[key]);
  }
  const sphere = new SphereGeometry(1, 14, 10); geometries.add(sphere);
  const smallSphere = new SphereGeometry(1, 10, 8); geometries.add(smallSphere);
  function joint(name, parent, position = [0, 0, 0], kind = name) {
    const object = new Group(); object.name = name; object.position.fromArray(position);
    object.userData.joint = kind; parent.add(object); return object;
  }
  function ellipsoid(name, parent, material, position, scale, small = false) {
    const mesh = new Mesh(small ? smallSphere : sphere, material); mesh.name = name;
    mesh.position.fromArray(position); mesh.scale.fromArray(scale);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(1); parent.add(mesh); return mesh;
  }
  function earGeometry(width, height, depth) {
    const shape = new Shape();
    shape.moveTo(-width * .43, .010);
    shape.quadraticCurveTo(-width * .55, height * .25, -width * .11, height * .94);
    shape.quadraticCurveTo(0, height * 1.06, width * .11, height * .94);
    shape.quadraticCurveTo(width * .55, height * .25, width * .43, .010);
    shape.quadraticCurveTo(0, -0.014, -width * .43, .010);
    const geometry = new ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 5, bevelEnabled: true, bevelSegments: 2, bevelSize: .006, bevelThickness: .005 });
    geometry.translate(0, 0, -depth / 2); geometries.add(geometry); return geometry;
  }
  function shapeMesh(name, parent, geometry, material, position) {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.fromArray(position);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(1); parent.add(mesh); return mesh;
  }

  const pelvis = joint('Fox_Pelvis', rig, [0, STANDING.hipY, 0], 'pelvis');
  ellipsoid('Fox_Shorts', pelvis, mat.shorts, [0, 0, -.005], [.145, .085, .105]);
  const spine = joint('Fox_Spine', pelvis, [0, .055, 0], 'spine');
  ellipsoid('Fox_MintShirt', spine, mat.shirt, [0, .085, 0], look.shirt);
  // 纯色领口、细下摆与奶油肚皮：让衣服可辨认，没有图案、品牌或标识。
  ellipsoid('Fox_ShirtHem', spine, mat.shirtShade, [0, -.023, .002], [.150, .023, .111], true);
  ellipsoid('Fox_Collar', spine, mat.cream, [0, .211, .011], [.071, .023, .061], true);
  if (look.belly) ellipsoid('Fox_BellyPatch', spine, mat.cream, [0, .045, .114], [.088, .062, .016], true);
  const neck = joint('Fox_Neck', spine, [0, .235, .015], 'neck');
  ellipsoid('Fox_NeckFur', neck, mat.cream, [0, .014, .005], [.059, .056, .057], true);
  const head = joint('Fox_Head', neck, [0, .100, .025], 'head');
  ellipsoid('Fox_HeadShell', head, mat.fur, [0, 0, 0], look.head);
  ellipsoid('Fox_Cheek_L', head, mat.cream, [-.066, -.056, .122], look.cheek);
  ellipsoid('Fox_Cheek_R', head, mat.cream, [.066, -.056, .122], look.cheek);
  ellipsoid('Fox_Chin', head, mat.cream, [0, -.096, .115], [.102, .036, .046], true);
  ellipsoid('Fox_Nose', head, mat.nose, [0, -.037, .183], [.022, .016, .016], true);
  if (look.blush) {
    ellipsoid('Fox_Blush_L', head, mat.blush, [-.088, -.058, .132], [.052, .026, .020], true);
    ellipsoid('Fox_Blush_R', head, mat.blush, [.088, -.058, .132], [.052, .026, .020], true);
  }
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    ellipsoid(`Fox_Eye_${suffix}`, head, mat.eye, [side * .070, look.eyeY, look.eyeZ], look.eye, true);
    if (look.pupil) ellipsoid(`Fox_Pupil_${suffix}`, head, mat.pupil, [side * .070, look.eyeY, look.eyeZ + .007], [.011, .017, .004], true);
    ellipsoid(`Fox_EyeGlint_${suffix}`, head, mat.cream, [side * .070 - .005, look.eyeY + .008, look.eyeZ + .012], [.0060, .0085, .0035], true);
    const brow = ellipsoid(`Fox_Brow_${suffix}`, head, mat.furShade, [side * .070, .060, .152], [.030, .0075, .007], true);
    brow.rotation.z = side * .10;
  }
  const smile = new QuadraticBezierCurve3(new Vector3(-.023, -.065, .171), new Vector3(0, -.080, .179), new Vector3(.023, -.065, .171));
  const smileGeometry = new TubeGeometry(smile, 8, .0022, 4, false); geometries.add(smileGeometry);
  shapeMesh('Fox_Smile', head, smileGeometry, mat.nose, [0, 0, 0]);
  const ears = [];
  const outerEar = earGeometry(look.earW, look.earH, .034), innerEar = earGeometry(look.earW * .64, look.earH * .70, .008);
  for (const side of [-1, 1]) {
    const ear = joint(`Fox_Ear_${side < 0 ? 'L' : 'R'}`, head, [side * .141, .125, -.010], 'ear');
    shapeMesh(`Fox_OuterEar_${side}`, ear, outerEar, mat.fur, [0, 0, 0]);
    shapeMesh(`Fox_InnerEar_${side}`, ear, innerEar, mat.cream, [0, .022, .025]);
    ear.rotation.z = -side * .15; ear.rotation.x = .065; ears.push({ joint: ear, side });
  }

  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    const hip = joint(`Fox_Hip_${suffix}`, pelvis, [side * .084, 0, .003], 'hip');
    ellipsoid(`Fox_Thigh_${suffix}`, hip, mat.shorts, [0, -.054, 0], [.050, .069, .051]);
    const knee = joint(`Fox_Knee_${suffix}`, hip, [0, -.115, 0], 'knee');
    ellipsoid(`Fox_Shin_${suffix}`, knee, mat.fur, [0, -.044, 0], [.038, .057, .039], true);
    const foot = joint(`Fox_Foot_${suffix}`, knee, [0, -.090, 0], 'foot');
    ellipsoid(`Fox_Paw_${suffix}`, foot, mat.cream, [0, -.012, .032], [.049, .033, .071], true);
    legs.push({ hip, knee, foot, side });
    const shoulder = joint(`Fox_Shoulder_${suffix}`, spine, [side * .158, .150, .002], 'shoulder');
    ellipsoid(`Fox_Sleeve_${suffix}`, shoulder, mat.shirt, [0, -.043, 0], [.047, .063, .045], true);
    const elbow = joint(`Fox_Elbow_${suffix}`, shoulder, [0, -.100, 0], 'elbow');
    ellipsoid(`Fox_Forearm_${suffix}`, elbow, mat.fur, [0, -.040, 0], [.033, .052, .034], true);
    const hand = joint(`Fox_Hand_${suffix}`, elbow, [0, -.083, .006], 'hand');
    ellipsoid(`Fox_HandPaw_${suffix}`, hand, mat.cream, [0, -.008, .008], [.037, .041, .037], true);
    arms.push({ shoulder, elbow, hand, side });
  }
  const tail = joint('Fox_Tail_Base', pelvis, [0, -.008, -.077], 'tail');
  tail.rotation.y = -.72; tail.rotation.x = .40;
  ellipsoid('Fox_TailOrangeBase', tail, mat.furShade, [0, 0, -.075], [.055, .057, .102]);
  const tailMid = joint('Fox_Tail_Mid', tail, [0, 0, -.128], 'tail');
  tailMid.rotation.x = -.28;
  ellipsoid('Fox_TailOrangePlume', tailMid, mat.fur, [0, 0, -.052], look.plume);
  const tailTip = joint('Fox_Tail_Tip', tailMid, [0, 0, -.135], 'tail');
  ellipsoid('Fox_TailCreamTip', tailTip, mat.cream, [0, 0, -.033], [.061, .059, .082]);

  // 静止状态真实足底与耳尖测量后统一为 1 高，前向不做隐含旋转。
  for (const arm of arms) { arm.shoulder.rotation.z = arm.side * .11; arm.shoulder.rotation.x = -rad(STANDING.arm); arm.elbow.rotation.x = -rad(STANDING.elbow); }
  model.updateMatrixWorld(true); const bounds = new Box3().setFromObject(model);
  const rawFloor = bounds.min.y, rawHeight = bounds.max.y - rawFloor;
  rig.scale.setScalar(1 / rawHeight); rig.position.y = -rawFloor / rawHeight;
  // 坐稳时臀部椭球最低点的承托高。脚通过双关节屈曲伸到前方，并保留在垫面上。
  const rawContact = SEATED.hipY - .085 - rawFloor;
  const contactY = rawContact / rawHeight;
  const values = { ...STANDING }; let transition = null, elapsed = 0, disposed = false, target = 0;
  const locomotion = { speed: 0, phase: 0, weight: 0 };
  let stage = '站立', waterWeight = 0, celebrateWeight = 0, celebrateTime = 0;

  function applyRig() {
    const w = locomotion.weight * (1 - values.amount), phase = locomotion.phase;
    // 步伐幅度随实际速度轻微缩放：快走大步、慢走小步，慢走更接近待机姿态。
    const speedBias = clamp(locomotion.speed / 1.5, .35, 1.2);
    // 竖直起伏放在角色根节点：脚步交换(支撑点交替)时重心最低，迈步中段最高，
    // 两次起伏/步幅周期，与真实双足行走的相位一致。GLB walk 段会一并烘焙。
    model.position.y = (1 - Math.abs(Math.cos(phase))) * .024 * w * speedBias;
    // 骨盆随迈步做横向重心位移（不用 z 轴旋转，保证脚掌始终水平）。
    const swayX = Math.sin(phase) * .022 * w;
    let hipY = values.hipY;
    const thigh = rad(values.thigh), shin = rad(values.shin);
    // 支撑弯膝：双脚交换时两膝轻微弯曲卸力，迈步中段支撑腿伸直，让起伏更自然。
    const stanceFlex = Math.abs(Math.cos(phase)) * .30 * w * speedBias;
    // 足底支撑约束：坐起过渡时不能随根补偿一起压进坐垫。
    const footBottom = hipY - .115 * Math.cos(thigh) - .090 * Math.cos(shin) - .045;
    const support = rawFloor + rawContact * values.amount;
    hipY += Math.max(0, support - footBottom);
    if (w > 0) {
      const bottoms = legs.map(({ side }) => {
        const wave = Math.sin(phase + (side < 0 ? 0 : Math.PI)), swing = wave * .43 * w * speedBias, flex = Math.max(0, wave) * .62 * w * speedBias + stanceFlex;
        return hipY - .115 * Math.cos(thigh + swing) - .09 * Math.cos(-shin - swing + flex) - .045;
      });
      hipY -= (Math.min(...bottoms) - rawFloor) * w;
    }
    pelvis.position.set(swayX, hipY, values.hipZ);
    spine.rotation.x = rad(values.lean) + (Math.cos(phase * 2) * .018 + .05) * w;
    spine.rotation.z = Math.sin(phase) * .016 * w;
    neck.rotation.x = rad(values.head) + Math.abs(Math.sin(phase)) * .018 * w * speedBias;
    head.rotation.y = Math.sin(phase) * .015 * w;
    // 庆祝（签到/勋章解锁）：点头两次、耳朵扇动、尾巴轻摇，权重由 setCelebrate 外部驱动，结束后自动归零。
    if (celebrateWeight > 0) {
      const c = celebrateWeight, wave = Math.sin(celebrateTime * 24);
      neck.rotation.x += rad(11 * c) * Math.max(0, wave);
      head.rotation.y += rad(4 * c) * Math.sin(celebrateTime * 19);
      tail.rotation.y += rad(14 * c) * Math.max(0, Math.sin(celebrateTime * 22));
      for (const ear of ears) ear.joint.rotation.z += ear.side * rad(6 * c) * Math.max(0, wave);
    }
    for (const leg of legs) {
      const wave = Math.sin(phase + (leg.side < 0 ? 0 : Math.PI)), swing = wave * .43 * w * speedBias, flex = Math.max(0, wave) * .62 * w * speedBias + stanceFlex;
      leg.hip.rotation.x = -thigh - swing; leg.knee.rotation.x = thigh - shin + flex;
      leg.foot.rotation.x = shin + swing - flex;
    }
    for (const arm of arms) {
      const wave = Math.sin(phase + (arm.side < 0 ? 0 : Math.PI));
      arm.shoulder.rotation.x = -rad(values.arm) + wave * .34 * w * speedBias;
      arm.shoulder.rotation.z = arm.side * (.11 + .035 * values.amount);
      arm.elbow.rotation.x = -rad(values.elbow) - Math.max(0, -wave) * .10 * w * speedBias;
    }
    for (const ear of ears) {
      ear.joint.rotation.z = -ear.side * (.15 + .045 * values.amount) + Math.sin(phase + ear.side) * .024 * w;
      ear.joint.rotation.x = .065 + values.amount * .035;
    }
    tail.rotation.y = -.72 + Math.sin(phase) * .15 * w * speedBias + Math.sin(elapsed * 1.7) * .025 * (1 - w);
    tail.rotation.x = .40 + values.tail * .32; tailMid.rotation.x = -.28 - values.tail * .13;
    tailTip.rotation.y = Math.sin(elapsed * 1.9) * .035;
    if (waterWeight > 0) {
      // 浇水姿势：双臂前伸微垂（像端水壶）、肘微屈、肩略收拢、头微低、尾巴微翘。
      // 只叠加在站立/走路姿态之上，重量随 setWatering 平滑进出，不影响坐/立关键帧契约。
      const reach = -rad(44 + 26 * waterWeight);
      const bend = -rad(16 + 20 * waterWeight);
      for (const arm of arms) {
        arm.shoulder.rotation.x = reach;
        arm.shoulder.rotation.z = arm.side * (.05 - .03 * waterWeight);
        arm.elbow.rotation.x = bend;
      }
      neck.rotation.x = rad(values.head) + rad(9 * waterWeight);
      tail.rotation.x = .40 + values.tail * .32 + rad(5 * waterWeight);
    }
    model.updateMatrixWorld(true);
  }
  function start(seated) {
    if (disposed || (transition && target === Number(seated))) return;
    if (!transition && Math.abs(values.amount - Number(seated)) < 1e-6) return;
    target = Number(seated); const current = { ...values };
    let frames = (seated ? SIT_FRAMES : STAND_FRAMES).map(frame => ({ ...frame, value: { ...frame.value } }));
    if (seated && values.amount > .25) {
      // 阶段数可增加，不能再用固定2/3项时间数组，否则新增阶段会得到undefined→NaN。
      // 保留当前落座进度之后的阶段，并按原有相对时长统一压缩，时间始终严格递增。
      const remaining = frames.filter(frame => frame.value.amount >= values.amount - 1e-6);
      const firstIndex = frames.indexOf(remaining[0]);
      const startAt = firstIndex > 0 ? frames[firstIndex - 1].at : 0;
      const span = frames.at(-1).at - startAt;
      const resumeDuration = values.amount > .75 ? .60 : 1;
      frames = remaining.map(frame => ({ ...frame, at: (frame.at - startAt) / span * resumeDuration }));
    } else if (!seated && values.amount < .20) frames = [{ at: .40, label: '挺身站稳', value: { ...STANDING } }];
    transition = { time: 0, frames: [{ at: 0, value: current, label: frames[0].label }, ...frames] }; stage = frames[0].label;
  }
  function update(dt) {
    if (disposed || !Number.isFinite(dt) || dt < 0) return; elapsed += dt;
    // 庆祝权重自衰减：约 1 秒内从 1 平滑回到 0（外部只需 setCelebrate(1) 触发一次）。
    if (celebrateWeight > 0) { celebrateTime += dt; celebrateWeight = Math.max(0, celebrateWeight - dt * 1.6); if (celebrateWeight === 0) celebrateTime = 0; }
    if (transition) {
      transition.time += dt; const frames = transition.frames;
      let i = 1; while (i < frames.length - 1 && transition.time > frames[i].at) i++;
      const from = frames[i - 1], to = frames[i], alpha = smooth((transition.time - from.at) / (to.at - from.at));
      for (const key of Object.keys(STANDING)) values[key] = from.value[key] + (to.value[key] - from.value[key]) * alpha;
      stage = to.label;
      if (transition.time >= frames.at(-1).at) { Object.assign(values, frames.at(-1).value); transition = null; stage = target ? '坐稳' : '站立'; }
    }
    applyRig();
  }
  applyRig(); let triangles = 0;
  model.traverse(object => { if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3; });
  const metadata = Object.freeze({
    id: 'original-apricot-fox-v2', displayName: '杏橘狐', forwardAxis: '+Z', height: 1, triangles,
    source: 'original-procedural-geometry', rigType: 'articulated-object-joints',
    design: Object.freeze({
      targetAudience: '6-14岁儿童', appeal: ['round-silhouette', 'large-eyes', 'clear-facial-signals', 'high-saturation', 'animal-type'],
      appearance, paletteKeys: Object.keys(colors),
    }),
    animations: Object.freeze([
      { name: 'idle', duration: 3, loop: true }, { name: 'walk', duration: 1, loop: true },
      { name: 'sit', duration: DURATION.sit, loop: false }, { name: 'stand', duration: DURATION.stand, loop: false },
    ]),
  });
  model.userData.character = metadata;
  const pose = {
    update, sit() { start(true); }, stand() { start(false); },
    get amount() { return values.amount; }, get stage() { return stage; }, contactY, duration: DURATION,
    setLocomotion({ speed = 0, phase = 0, weight = 0 } = {}) {
      if (disposed) return; locomotion.speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      locomotion.phase = Number.isFinite(phase) ? phase : 0;
      locomotion.weight = clamp(Number.isFinite(weight) ? weight : 0, 0, 1) * (locomotion.speed > 0 ? 1 : 0); applyRig();
    },
    // 浇水手臂姿势强度（0–1）：会随既有关键帧一起应用，0 时与原本完全一致。
    setWatering(weight = 0) {
      if (disposed) return; waterWeight = clamp(Number.isFinite(weight) ? weight : 0, 0, 1); applyRig();
    },
    // 庆祝（签到/徽章解锁）：设为 1 触发约 1 秒的点头+摇尾+扇耳，随后自动衰减到 0。
    setCelebrate(weight = 0) {
      if (disposed) return; celebrateWeight = clamp(Number.isFinite(weight) ? weight : 0, 0, 1); if (celebrateWeight > 0) celebrateTime = 0; applyRig();
    },
    dispose() {
      if (disposed) return; disposed = true; transition = null;
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); gradient.dispose();
    },
  };
  return { model, pose, metadata, dispose: pose.dispose };
}
