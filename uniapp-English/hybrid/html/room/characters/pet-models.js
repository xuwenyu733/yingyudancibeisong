import {
  Box3, CatmullRomCurve3, Color, ConeGeometry, DataTexture, ExtrudeGeometry,
  Group, Mesh, MeshToonMaterial, NearestFilter, RedFormat, Shape, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector3,
} from '../vendor/three/three.module.js';
import {createOriginalFox} from './original-fox.js';

/** Each animal owns an original species-specific body. Only the motion contract is shared. */
export const PET_MODELS=Object.freeze([
  Object.freeze({sku:'cloud-bunny',name:'云朵兔',description:'修长软耳、梨形绒绒身体、宽大后脚与棉花尾。',color:'#f8f2e9',accent:'#adcddd',silhouette:'long-round-ears-pear-body-hind-feet'}),
  Object.freeze({sku:'mint-cat',name:'薄荷猫',description:'圆润猫脸、短胖身形、细胡须与弯弯长尾。',color:'#a2cbbb',accent:'#f5d898',silhouette:'cat-muzzle-pointed-ears-curled-tail'}),
  Object.freeze({sku:'cocoa-bear',name:'可可熊',description:'宽圆身体、厚厚熊掌、圆耳朵和蜂蜜围巾。',color:'#aa795c',accent:'#e5b864',silhouette:'broad-body-round-ears-thick-paws'}),
  Object.freeze({sku:'starlight-penguin',name:'星光企鹅',description:'蛋形身体、短喙、扁鳍与橙色蹼足，胸前一枚小星星。',color:'#526d88',accent:'#eac56c',silhouette:'egg-body-flippers-beak-webbed-feet'}),
]);
const PALETTES={
  'cloud-bunny':{fur:'#f8f2e9',shade:'#dfcfc8',cream:'#fffdf7',ear:'#eab5c0',accent:'#9dbfce',gold:'#e3c17d',eye:'#3b414a',blush:'#eec1c6',nose:'#bb8491'},
  'mint-cat':{fur:'#a2cbbb',shade:'#659d8a',cream:'#fff4dc',ear:'#eab8b6',accent:'#e5c77d',gold:'#d0aa60',eye:'#354a42',blush:'#e6b8ab',nose:'#a97678'},
  'cocoa-bear':{fur:'#aa795c',shade:'#78513d',cream:'#efd3ad',ear:'#d3a183',accent:'#ddb46a',gold:'#b98543',eye:'#342d2a',blush:'#cb927e',nose:'#50372f'},
  'starlight-penguin':{fur:'#526d88',shade:'#354b64',cream:'#fff6e0',ear:'#a3bfd1',accent:'#9dbdce',gold:'#e7b865',eye:'#243b4a',blush:'#e7b2a4',nose:'#e5a354'},
};
const DURATION=Object.freeze({sit:1.3,stand:1.1});
/** v2.24 · 物种真实步态：猫/熊=四足对角步态（身体放平）、云朵兔=蹦跳、星光企鹅=摇摆直立（企鹅本就直立行走）。 */
const GAIT=Object.freeze({'cloud-bunny':'hop','mint-cat':'quad','cocoa-bear':'quad','starlight-penguin':'waddle'});
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const prefixFor=sku=>sku.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join('');

export function createPetCharacter(sku='apricot-fox',options={}){
  if(sku==='apricot-fox')return createOriginalFox(options);
  const entry=PET_MODELS.find(item=>item.sku===sku);if(!entry)throw new RangeError(`未知宠物模型：${sku}`);
  const prefix=prefixFor(sku),colors={...PALETTES[sku],...options.palette};
  const geometries=new Set(),materials=new Set(),mat={};
  const gradient=new DataTexture(new Uint8Array([125,178,222,255]),4,1,RedFormat);
  gradient.name=`${prefix}_ToonGradient`;gradient.minFilter=gradient.magFilter=NearestFilter;gradient.generateMipmaps=false;gradient.needsUpdate=true;
  for(const [key,value]of Object.entries(colors)){mat[key]=new MeshToonMaterial({color:new Color(value),gradientMap:gradient});mat[key].name=`${prefix}_Material_${key}`;materials.add(mat[key]);}
  const model=new Group();model.name=`Pet_${sku.replaceAll('-','_')}`;
  const normalized=new Group();normalized.name=`${prefix}_Normalized`;model.add(normalized);
  const rig=new Group();rig.name=`${prefix}_IndependentRig`;normalized.add(rig);
  const sphere=new SphereGeometry(1,12,8),detailSphere=new SphereGeometry(1,10,6);geometries.add(sphere);geometries.add(detailSphere);
  function joint(name,parent,position=[0,0,0]){const node=new Group();node.name=`${prefix}_${name}`;node.position.fromArray(position);parent.add(node);return node;}
  function mesh(name,parent,geometry,material,position=[0,0,0],scale=[1,1,1]){const node=new Mesh(geometry,material);node.name=`${prefix}_${name}`;node.position.fromArray(position);node.scale.fromArray(scale);node.castShadow=true;node.receiveShadow=true;node.layers.enable(1);parent.add(node);return node;}
  const oval=(name,parent,material,position,scale,detail=false)=>mesh(name,parent,detail?detailSphere:sphere,material,position,scale);
  function line(name,parent,points,radius,material){const geometry=new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),12,radius,5,false);geometries.add(geometry);return mesh(name,parent,geometry,material);}
  function shape(name,parent,points,depth,material,position=[0,0,0]){const outline=new Shape();points.forEach(([x,y],i)=>i?outline.lineTo(x,y):outline.moveTo(x,y));outline.closePath();const geometry=new ExtrudeGeometry(outline,{depth,bevelEnabled:false,curveSegments:8});geometries.add(geometry);return mesh(name,parent,geometry,material,position);}
  function star(name,parent,radius,material,position){const points=Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,r=i%2?radius*.47:radius;return [Math.cos(a)*r,Math.sin(a)*r];});return shape(name,parent,points,.012,material,position);}
  const torso=joint('Torso',rig),head=joint('Head',torso),arms=[],ears=[],feet=[],eyeLids=[];
  let tail=null,footHeight=.055,bodyLean=0;
  function makeFoot(side,position,scale,material=mat.fur){const suffix=side<0?'L':'R',pivot=joint(`FootJoint_${suffix}`,rig,position),paw=oval(`Paw_${suffix}`,pivot,material,[0,0,0],scale);feet.push({side,pivot,base:position.slice(),half:scale[1],paw});return pivot;}
  function makeArm(side,position,scale,material=mat.fur){const suffix=side<0?'L':'R',pivot=joint(`Shoulder_${suffix}`,torso,position);oval(`ForePaw_${suffix}`,pivot,material,[0,-scale[1]*.65,0],scale);arms.push({side,pivot,base:position.slice()});return pivot;}
  function eye(name,parent,x,y,z,size=.025){
    const lid=joint(`EyeBlink_${name}`,parent,[x,y,z]);
    oval(`Eye_${name}`,lid,mat.eye,[0,0,0],[size,size*1.20,.014],true);
    const glint=oval(`EyeLight_${name}`,lid,mat.cream,[-size*.24,size*.35,.011],[size*.21,size*.24,.004],true);
    eyeLids.push({lid,glint,glintScale:glint.scale.clone()});
  }
  function blush(side,parent,position,scale=[.035,.018,.008]){oval(`Blush_${side}`,parent,mat.blush,position,scale,true);}
  function relaxedMouth(parent,y,z,width=.035){
    line('RelaxedMouth_L',parent,[[0,y+.002,z],[-width*.35,y-.003,z+.002],[-width*.72,y-.002,z]],.0019,mat.nose);
    line('RelaxedMouth_R',parent,[[0,y+.002,z],[width*.35,y-.003,z+.002],[width*.72,y-.002,z]],.0019,mat.nose);
  }

  if(sku==='cloud-bunny'){
    // Long-eared rabbit: soft pear torso, narrow face and oversized hind feet.
    oval('PearBody',torso,mat.fur,[0,.335,-.008],[.188,.235,.150]);
    oval('ChestFluff',torso,mat.cream,[0,.363,.131],[.129,.155,.030]);
    head.position.set(0,.642,.012);oval('HeadShell',head,mat.fur,[0,0,0],[.193,.187,.167]);
    for(const side of [-1,1]){
      const ear=joint(`EarJoint_${side}`,head,[side*.094,.125,-.008]);ear.rotation.z=-side*.12;ears.push({side,pivot:ear,angle:-side*.12});
      oval(`Bunny_OuterEar_${side}`,ear,mat.fur,[0,.156,0],[.058,.196,.038]);
      oval(`Bunny_InnerEar_${side}`,ear,mat.ear,[0,.166,.031],[.032,.149,.012]);
      eye(side<0?'L':'R',head,side*.070,.014,.151,.022);
      oval(`Muzzle_${side}`,head,mat.cream,[side*.042,-.047,.154],[.052,.037,.026]);blush(side,head,[side*.112,-.039,.151],[.031,.017,.007]);
      const foot=makeFoot(side,[side*.109,.055,.066],[.081,.055,.139]);
      for(let i=-1;i<=1;i++)oval(`Bunny_Toe_${side}_${i}`,foot,mat.shade,[i*.024,-.003,.118],[.002,.010,.012],true);
      makeArm(side,[side*.162,.423,.025],[.053,.104,.052]);
    }
    oval('Nose',head,mat.nose,[0,-.027,.178],[.017,.013,.012],true);relaxedMouth(head,-.057,.179,.025);
    tail=joint('Tail',torso,[0,.248,-.153]);oval('Bunny_CottonTail',tail,mat.cream,[0,0,-.021],[.077,.077,.073]);
    for(const [i,x]of [-.04,0,.04].entries())oval(`CloudPendant_${i}`,torso,mat.cream,[x,.456,.151],[i===1?.035:.029,.024,.015],true);
    line('RibbonCollar',torso,[[-.122,.471,.089],[0,.452,.150],[.122,.471,.089]],.013,mat.accent);
    oval('RibbonKnot',torso,mat.accent,[.094,.455,.130],[.025,.028,.019],true);
  }else if(sku==='mint-cat'){
    // Compact cat: wide cat muzzle, short body, tabby marks, curled tail and small front paws.
    oval('CompactBody',torso,mat.fur,[0,.324,-.009],[.226,.221,.164]);oval('Belly',torso,mat.cream,[0,.305,.143],[.145,.132,.026]);
    head.position.set(0,.662,.017);oval('HeadShell',head,mat.fur,[0,0,0],[.244,.205,.183]);
    for(const side of [-1,1]){
      const ear=joint(`EarJoint_${side}`,head,[side*.144,.115,-.007]);ears.push({side,pivot:ear,angle:0});
      shape(`Cat_PointEar_${side}`,ear,[[side<0?-.078:-.066,-.025],[side<0?-.057:.058,.170],[.075,-.010]],.057,mat.fur,[0,0,-.025]);
      shape(`Cat_InnerEar_${side}`,ear,[[-.042,.014],[side*.035,.127],[.040,.014]],.009,mat.ear,[0,0,.032]);
      oval(`Muzzle_${side}`,head,mat.cream,[side*.055,-.051,.172],[.068,.045,.032]);eye(side<0?'L':'R',head,side*.086,.028,.172,.025);
      blush(side,head,[side*.149,-.040,.153]);
      for(let i=0;i<2;i++)line(`Cat_Whisker_${side}_${i}`,head,[[side*.104,-.055+i*.022,.187],[side*.181,-.053+i*.024,.202],[side*.245,-.037+i*.024,.185]],.0023,mat.shade);
      const foot=makeFoot(side,[side*.120,.049,.053],[.077,.049,.095]);for(let i=-1;i<=1;i++)oval(`Cat_Toe_${side}_${i}`,foot,mat.shade,[i*.022,.001,.077],[.002,.007,.009],true);
      const arm=makeArm(side,[side*.199,.410,.028],[.065,.092,.059]);oval(`CreamForePaw_${side}`,arm,mat.cream,[0,-.096,.008],[.053,.043,.049]);
    }
    for(const [i,x]of [-.040,0,.040].entries())oval(`ForeheadStripe_${i}`,head,mat.shade,[x,.132,.130],[.010,i===1?.041:.028,.008],true);
    oval('Nose',head,mat.nose,[0,-.030,.207],[.019,.015,.013],true);relaxedMouth(head,-.069,.207,.031);
    tail=joint('Tail',torso,[0,.217,-.156]);line('Cat_CurledTail',tail,[[0,0,0],[.061,-.015,-.103],[.157,.065,-.224],[.198,.192,-.221],[.145,.260,-.158]],.037,mat.fur);oval('Cat_TailTip',tail,mat.cream,[.145,.260,-.158],[.038,.038,.038],true);
    line('Collar',torso,[[-.145,.481,.090],[0,.452,.162],[.145,.481,.090]],.014,mat.accent);oval('Bell',torso,mat.gold,[0,.426,.168],[.031,.033,.022],true);line('BellSlit',torso,[[0,.410,.190],[0,.425,.191]],.0025,mat.shade);
  }else if(sku==='cocoa-bear'){
    // Broad bear: full round torso and head, heavy short paws and separate cream muzzle.
    footHeight=.064;oval('BroadBody',torso,mat.fur,[0,.344,-.012],[.277,.266,.194]);oval('Belly',torso,mat.cream,[0,.317,.166],[.166,.167,.032]);
    head.position.set(0,.716,.010);oval('HeadShell',head,mat.fur,[0,0,0],[.271,.244,.204]);
    for(const side of [-1,1]){
      const ear=joint(`EarJoint_${side}`,head,[side*.201,.160,-.012]);ears.push({side,pivot:ear,angle:0});oval(`Bear_OuterEar_${side}`,ear,mat.fur,[0,0,0],[.090,.091,.055]);oval(`Bear_InnerEar_${side}`,ear,mat.ear,[0,0,.047],[.052,.054,.013]);
      eye(side<0?'L':'R',head,side*.092,.026,.187,.023);blush(side,head,[side*.170,-.053,.168],[.035,.019,.009]);
      const foot=makeFoot(side,[side*.139,.064,.059],[.107,.064,.122]);oval(`Bear_FootPad_${side}`,foot,mat.ear,[0,.003,.114],[.054,.037,.010],true);
      const arm=makeArm(side,[side*.248,.430,.020],[.082,.118,.077]);oval(`Bear_Palm_${side}`,arm,mat.ear,[0,-.104,.061],[.040,.034,.013],true);
    }
    oval('CreamMuzzle',head,mat.cream,[0,-.057,.191],[.125,.084,.047]);oval('Nose',head,mat.nose,[0,-.028,.236],[.039,.026,.019],true);relaxedMouth(head,-.090,.235,.038);
    tail=joint('Tail',torso,[0,.218,-.193]);oval('Bear_RoundTail',tail,mat.fur,[0,0,-.015],[.052,.053,.052]);
    const scarfGeometry=new TorusGeometry(.167,.026,6,24);geometries.add(scarfGeometry);const scarf=mesh('HoneyScarf',torso,scarfGeometry,mat.accent,[0,.518,.005]);scarf.rotation.x=Math.PI/2;
    oval('ScarfDrape',torso,mat.accent,[.111,.420,.171],[.044,.104,.021]);oval('ScarfStitch',torso,mat.gold,[.111,.349,.190],[.028,.006,.004],true);
  }else{
    // Penguin: a single egg body, integrated white facial bib, flat flippers and true webbed feet.
    footHeight=.039;bodyLean=.02;oval('HeadShell',torso,mat.fur,[0,.463,-.005],[.279,.437,.223]);
    oval('WhiteBelly',torso,mat.cream,[0,.367,.191],[.193,.264,.037]);
    for(const side of [-1,1]){
      oval(`FaceBib_${side}`,torso,mat.cream,[side*.084,.680,.184],[.128,.159,.042]);eye(side<0?'L':'R',torso,side*.089,.695,.224,.024);blush(side,torso,[side*.148,.627,.213],[.034,.018,.008]);
      const arm=joint(`Shoulder_${side<0?'L':'R'}`,torso,[side*.237,.569,-.003]);
      const flipper=shape(`Penguin_Flipper_${side}`,arm,[[0,.037],[side*.080,-.023],[side*.099,-.164],[side*.054,-.238],[side*.002,-.171]],.051,mat.shade,[0,0,-.025]);arms.push({side,pivot:arm,base:arm.position.toArray()});
      const pivot=joint(`FootJoint_${side<0?'L':'R'}`,rig,[side*.123,.039,.080]);
      const web=shape(`Paw_${side<0?'L':'R'}`,pivot,[[-.086,-.076],[-.091,.077],[-.037,.060],[0,.095],[.040,.062],[.090,.079],[.080,-.075]],.030,mat.nose,[0,-.039,0]);web.rotation.x=-Math.PI/2;
      feet.push({side,pivot,base:pivot.position.toArray(),half:.039,paw:web});
      line(`Penguin_WebLine_${side}_L`,pivot,[[-.027,-.004,-.048],[-.035,-.004,.067]],.0024,mat.gold);
      line(`Penguin_WebLine_${side}_R`,pivot,[[.026,-.004,-.048],[.037,-.004,.067]],.0024,mat.gold);
    }
    const beakGeometry=new ConeGeometry(.061,.123,6);geometries.add(beakGeometry);const beak=mesh('Penguin_Beak',torso,beakGeometry,mat.nose,[0,.644,.250]);beak.rotation.x=Math.PI/2;beak.scale.set(1,.85,.58);
    star('Penguin_Star',torso,.051,mat.gold,[0,.494,.238]);oval('StarCenter',torso,mat.cream,[0,.495,.250],[.012,.012,.004],true);
    head.position.set(0,0,0); // The face belongs to the egg torso rather than a mammal head.
  }

  rig.updateMatrixWorld(true);const initialBounds=new Box3().setFromObject(rig),rawHeight=initialBounds.max.y-initialBounds.min.y,normalization=1/rawHeight,rawFloor=initialBounds.min.y,rawContact=.090;
  normalized.scale.setScalar(normalization);normalized.position.y=-rawFloor*normalization;model.updateMatrixWorld(true);
  let disposed=false,elapsed=0,amount=0,target=0,transition=null,stage='站立',water=0,celebrate=0,celebrateTime=0;
  let locomotion={speed:0,phase:0,weight:0};
  const gait=GAIT[sku]||'quad';
  function apply(){
    if(disposed)return;const w=locomotion.weight,phase=locomotion.phase,a=amount,bob=Math.sin(elapsed*2.3)*.004*(1-w);
    const blinkPhase=elapsed%(4.6+PET_MODELS.indexOf(entry)*.21),blink=smooth(Math.max(0,1-Math.abs(blinkPhase-(2.6+PET_MODELS.indexOf(entry)*.18))/.13));
    for(const {lid,glint,glintScale}of eyeLids){lid.scale.y=1-.95*blink;glint.scale.copy(glintScale).multiplyScalar(1-.95*blink);}
    if(gait==='hop'){
      // 云朵兔 · 真实蹦跳：蓄力压身→蹬地腾空→落地缓冲，双脚同进同退，耳朵随跳起伏。
      const hopPhase=phase*2,air=Math.max(0,Math.sin(hopPhase)),squat=Math.max(0,-Math.sin(hopPhase)),push=Math.cos(hopPhase);
      torso.position.set(Math.sin(phase)*.008*w,.015*a+bob+air*.060*w,-.042*a);
      torso.rotation.x=bodyLean+.085*a+water*.11-squat*.14*w;torso.rotation.z=0;
      head.rotation.x=-.060*a+water*.045+air*.06*w;
      head.rotation.y=Math.sin(elapsed*1.2)*.018;
      for(const foot of feet){foot.pivot.position.set(foot.base[0],foot.base[1]+rawContact*a+air*.02*w+Math.max(0,push)*.018*w,foot.base[2]+push*.055*w+.085*a);foot.pivot.rotation.x=0;foot.pivot.rotation.z=0;}
      for(const arm of arms){const wave=Math.sin(hopPhase+Math.PI/2);arm.pivot.rotation.x=-.12-.70*water-.48*a+Math.max(0,wave)*.34*w;arm.pivot.rotation.z=arm.side*(.055+.05*a+Math.sin(celebrateTime*15)*.08*celebrate);}
      for(const ear of ears){ear.pivot.rotation.z=ear.angle+ear.side*(Math.sin(elapsed*1.7)*.012+air*.12*w+Math.sin(celebrateTime*20)*.045*celebrate);ear.pivot.rotation.x=.035*a;}
      if(tail){tail.rotation.y=Math.sin(elapsed*1.7)*.11+Math.sin(hopPhase)*.16*w;tail.rotation.x=-.15*a-air*.14*w;}
    }else if(gait==='waddle'){
      // 星光企鹅 · 真实摇摆直立：企鹅不会像人一样迈大步——小幅快走、身体左右摇摆、鳍微张保持平衡。
      torso.position.set(Math.sin(phase)*.014*w,.015*a+bob,.002*w);
      torso.rotation.x=bodyLean+.085*a+water*.11;torso.rotation.z=Math.sin(phase)*.095*w;
      head.rotation.x=-.060*a+water*.045+Math.max(0,Math.sin(celebrateTime*20))*.09*celebrate;
      head.rotation.y=Math.sin(elapsed*1.2)*.012+Math.sin(phase)*.010*w;
      for(const foot of feet){const wave=Math.sin(phase+(foot.side<0?0:Math.PI)),lift=Math.max(0,wave)*.030*w;
        foot.pivot.position.set(foot.base[0],foot.base[1]+rawContact*a+lift,foot.base[2]+Math.cos(phase+(foot.side<0?0:Math.PI))*.040*w+.085*a);
        foot.pivot.rotation.x=0;foot.pivot.rotation.z=0;
      }
      for(const arm of arms){const wave=Math.sin(phase+(arm.side<0?0:Math.PI));arm.pivot.rotation.x=-.12-.70*water-.48*a+wave*.10*w;arm.pivot.rotation.z=arm.side*(.16+.02*a+Math.sin(celebrateTime*15)*.05*celebrate);}
      for(const ear of ears){ear.pivot.rotation.z=ear.angle+ear.side*(Math.sin(elapsed*1.7)*.012+Math.sin(phase)*.015*w+Math.sin(celebrateTime*20)*.045*celebrate);ear.pivot.rotation.x=.035*a;}
      if(tail){tail.rotation.y=Math.sin(elapsed*1.7)*.11+Math.sin(phase)*.08*w;tail.rotation.x=-.15*a;}
    }else{
      // 猫/熊 · 真实四足：身体放平前倾（猫更灵巧、熊更笨重），前后肢对角交替爬行，头保持前视。
      const lean=sku==='cocoa-bear'?.40:.46;
      torso.position.set(Math.sin(phase)*.012*w,.015*a+bob-(sku==='cocoa-bear'?.025:.030)*w,-.042*a);
      torso.rotation.x=bodyLean+.085*a+water*.11+lean*w;
      torso.rotation.z=Math.sin(phase)*.045*w;
      head.rotation.x=-.060*a+water*.045+.10*w+Math.max(0,Math.sin(celebrateTime*20))*.09*celebrate;
      head.rotation.y=Math.sin(elapsed*1.2)*.018+Math.sin(phase)*.012*w;
      for(const foot of feet){const wave=Math.sin(phase+(foot.side<0?0:Math.PI)),lift=Math.max(0,wave)*.075*w;
        foot.pivot.position.set(foot.base[0],foot.base[1]+rawContact*a+lift,foot.base[2]+Math.cos(phase+(foot.side<0?0:Math.PI))*.085*w+.085*a);
        foot.pivot.rotation.x=0;foot.pivot.rotation.z=0;
      }
      for(const arm of arms){const wave=Math.sin(phase+(arm.side<0?Math.PI:0)); // 前肢与对侧后腿同相，真正的对角步态
        arm.pivot.rotation.x=-.12-.70*water-.48*a+wave*.52*w;
        arm.pivot.position.set(arm.base[0]+wave*.030*w,arm.base[1],arm.base[2]);
        arm.pivot.rotation.z=arm.side*(.055+.05*a+Math.sin(celebrateTime*15)*.08*celebrate);}
      for(const ear of ears){ear.pivot.rotation.z=ear.angle+ear.side*(Math.sin(elapsed*1.7)*.012+Math.sin(phase)*.030*w+Math.sin(celebrateTime*20)*.045*celebrate);ear.pivot.rotation.x=.035*a;}
      if(tail){tail.rotation.y=Math.sin(elapsed*1.7)*.11+Math.sin(phase)*.14*w;tail.rotation.x=-.15*a+(sku==='cocoa-bear'?.12:-.10)*w;}
    }
    model.updateMatrixWorld(true);
  }
  function start(seated){if(disposed)return;const next=Number(seated);if(next===target&&(transition||Math.abs(amount-next)<1e-8))return;target=next;transition={from:amount,to:target,time:0,duration:(seated?DURATION.sit:DURATION.stand)*Math.max(.25,Math.abs(target-amount))};stage=seated?'屈身落座':'挺身起立';}
  function update(dt){if(disposed||!Number.isFinite(dt)||dt<0)return;elapsed+=dt;if(transition){transition.time+=dt;amount=transition.from+(transition.to-transition.from)*smooth(transition.time/transition.duration);if(transition.time>=transition.duration){amount=target;transition=null;stage=target?'坐稳':'站立';}}if(celebrate>0){celebrateTime+=dt;celebrate=Math.max(0,celebrate-dt*1.25);}apply();}
  let triangles=0;model.traverse(node=>{if(node.isMesh)triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;});
  const metadata=Object.freeze({id:`original-${sku}-v2`,sku,displayName:entry.name,height:1,forwardAxis:'+Z',triangles,source:'original-independent-species-geometry',rigType:'species-specific-object-joints',design:Object.freeze({species:sku,silhouette:entry.silhouette,gait,targetAudience:'6-14岁儿童',appeal:['distinct-animal-silhouette','soft-plush-volume','clear-species-features'],paletteKeys:Object.keys(colors)}),animations:Object.freeze([{name:'idle',duration:3,loop:true},{name:'walk',duration:1,loop:true},{name:'sit',duration:DURATION.sit,loop:false},{name:'stand',duration:DURATION.stand,loop:false}])});
  model.userData.character=metadata;
  function dispose(){if(disposed)return;disposed=true;transition=null;geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());gradient.dispose();model.removeFromParent();}
  const pose={update,sit:()=>start(true),stand:()=>start(false),get amount(){return amount;},get stage(){return stage;},contactY:rawContact*normalization,duration:DURATION,
    setLocomotion({speed=0,phase=0,weight=0}={}){if(disposed)return;locomotion={speed:Number.isFinite(speed)?Math.max(0,speed):0,phase:Number.isFinite(phase)?phase:0,weight:clamp(weight)*(speed>0?1:0)};apply();},
    setWatering(value=0){if(disposed)return;water=clamp(value);apply();},setCelebrate(value=0){if(disposed)return;celebrate=clamp(value);celebrateTime=0;apply();},dispose};
  return {model,pose,metadata,dispose};
}
