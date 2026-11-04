import {growthFor} from './growth.mjs';
import {skinForAchievement,drawAchievementSkin} from './achievement-skins.mjs';
import {drawFurnitureDrawing} from './drawing.mjs';
/** Cosmetic meshes live outside the layout registry: animations never change saved transforms. */
export function createCompanionScene({THREE,scene,doc,getActor,getFurniture,getSize,canVisit=()=>true,reducedMotion=false}){
  let disposed=false,signature='',outfitRoot=null,worldRoot=null,stylesSignature='',reaction=null,walkRitual=null,night=false;
  const motions=new Map(),cosmetics=new Map(),ownedResources=new Set(),pivots=new Map();
  let scaledModel=null,modelBaseScale=null,currentActor=null,gaitBase=null,elapsed=0,hatAttachment=null,hatAnchor=null;
  const blinkRest=new Map(),jointRest=new Map();
  const growthRest=new Map(),sleepEyes=new Map(),sleepJoints=new Map();let fetching=null,sleeping=false;
  function track(object){object.traverse(node=>{node.layers.enable(1);if(node.geometry)ownedResources.add(node.geometry);for(const mat of Array.isArray(node.material)?node.material:[node.material])if(mat){ownedResources.add(mat);if(mat.map)ownedResources.add(mat.map);}});return object;}
  function releaseResource(resource){if(resource&&ownedResources.delete(resource))resource.dispose();}
  function release(object){if(!object)return;object.removeFromParent();object.traverse(node=>{releaseResource(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){if(material&&ownedResources.has(material)){releaseResource(material.map);releaseResource(material);}}});}
  function restoreBlink(){for(const [node,scale]of blinkRest)node.scale.copy(scale);blinkRest.clear();}
  function restoreJoints(){for(const [node,rotation]of jointRest)node.rotation.copy(rotation);jointRest.clear();}
  function wake(){for(const[node,scale]of sleepEyes)node.scale.copy(scale);for(const[node,rotation]of sleepJoints)node.rotation.copy(rotation);sleepEyes.clear();sleepJoints.clear();sleeping=false;resetGait();}
  function restoreGrowth(){for(const[node,scale]of growthRest)node.scale.copy(scale);growthRest.clear();}
  function cancelFetch(){if(fetching?.prop)release(fetching.prop);fetching=null;}
  function resetGait(){if(currentActor?.gait&&gaitBase){currentActor.gait.position.copy(gaitBase.position);currentActor.gait.rotation.copy(gaitBase.rotation);}}
  function adoptActor(actor){
    const model=actor?.character?.model;if(model===scaledModel&&actor===currentActor)return;
    wake();cancelFetch();restoreGrowth();restoreBlink();restoreJoints();resetGait();if(scaledModel&&modelBaseScale)scaledModel.scale.copy(modelBaseScale);
    currentActor=actor;scaledModel=model;modelBaseScale=model?.scale.clone()||null;
    gaitBase=actor?.gait?{position:actor.gait.position.clone(),rotation:actor.gait.rotation.clone()}:null;
    reaction=null;walkRitual=null;signature='';
  }
  function resetPivot(pivot){pivot.position.set(0,0,0);pivot.rotation.set(0,0,0);pivot.scale.set(1,1,1);}
  function unwrapPivot(root){const pivot=pivots.get(root);if(!pivot)return;resetPivot(pivot);for(const child of [...pivot.children])root.add(child);pivot.removeFromParent();if(root.userData.feelPivot===pivot)delete root.userData.feelPivot;pivots.delete(root);}
  function restoreMaterials(data){
    release(data.decal);data.decal=null;
    for(const [node,original]of data.base){if(node.material!==original){for(const material of Array.isArray(node.material)?node.material:[node.material]){releaseResource(material.map);releaseResource(material);}node.material=original;}}
  }
  const mat=color=>new THREE.MeshLambertMaterial({color});
  const mesh=(geometry,color,x=0,y=0,z=0)=>{const node=new THREE.Mesh(geometry,mat(color));node.position.set(x,y,z);return node;};
  function label(text,width=2.7,height=.6){const c=doc.createElement('canvas');c.width=768;c.height=192;const ctx=c.getContext('2d');if(!ctx)return null;ctx.fillStyle='#fff6dc';ctx.beginPath();ctx.roundRect?.(6,6,756,180,42);if(!ctx.roundRect)ctx.rect(6,6,756,180);ctx.fill();ctx.strokeStyle='#b58c57';ctx.lineWidth=12;ctx.stroke();ctx.fillStyle='#665139';ctx.font='bold 57px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(text).slice(0,20),384,100,700);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const node=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));return node;}
  function star(color=0xf6cf65,size=.16){const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?size*.44:size;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();return new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));}
  function decoration(kind){const root=new THREE.Group();if(kind==='pumpkin'){for(let i=0;i<7;i++){const a=i/7*Math.PI*2;const lobe=mesh(new THREE.SphereGeometry(.15,10,8),0xf3a74c,Math.sin(a)*.10,.19,Math.cos(a)*.1);lobe.scale.y=1.1;root.add(lobe);}root.add(mesh(new THREE.CylinderGeometry(.025,.04,.12,8),0x7a985a,0,.39,0));for(const x of [-.08,.08])root.add(mesh(new THREE.SphereGeometry(.025,8,6),0xffed99,x,.22,.23));}
    else if(kind==='lantern'){root.add(mesh(new THREE.SphereGeometry(.2,12,10),0xf38e89,0,.3,0));root.add(mesh(new THREE.CylinderGeometry(.1,.1,.04,10),0xffd377,0,.5,0));root.add(mesh(new THREE.CylinderGeometry(.02,.02,.17,6),0xffd377,0,.05,0));}
    else if(kind==='flower'){root.add(mesh(new THREE.CylinderGeometry(.018,.018,.43,7),0x7eac7c,0,.22,0));for(let i=0;i<6;i++){const a=i*Math.PI/3;root.add(mesh(new THREE.SphereGeometry(.07,9,7),[0xffa6b7,0xb2b1ec,0xfbd88a][i%3],Math.cos(a)*.10,.46+Math.sin(a)*.10,0));}root.add(mesh(new THREE.SphereGeometry(.065,9,7),0xffe49e,0,.46,.04));}
    else {const s=star();s.position.y=.35;root.add(s);root.add(mesh(new THREE.CylinderGeometry(.018,.018,.28,7),0xd7b16b,0,.14,0));}return root;}
  function sync(companion,profile={}){
    if(disposed)return;const actor=getActor(),size=getSize();adoptActor(actor);
    const now=Date.now(),activeRewards=(companion.rewards||[]).filter(item=>!item.sku&&(!item.expiresAt||Date.parse(item.expiresAt)>now)).slice(-6),growth=growthFor(companion);
    // Include currently visible rewards, so a time boundary invalidates an otherwise unchanged state.
    const next=JSON.stringify([companion.petName,companion.roomName,companion.outfit,activeRewards,companion.garden,growth.id,size,night]);
    if(next!==signature||outfitRoot?.parent!==actor?.facing){signature=next;release(worldRoot);release(outfitRoot);worldRoot=new THREE.Group();scene.add(worldRoot);
      const plate=label(`⌂ ${companion.roomName}`);if(plate){plate.position.set(-size.width/2+1.5,1.25,size.depth/2-.16);worldRoot.add(plate);worldRoot.add(mesh(new THREE.CylinderGeometry(.035,.035,1.2,8),0xc0a276,plate.position.x,.6,plate.position.z));}
      const garden=new THREE.Group();garden.position.set(size.width/2-.9,.03,size.depth/2-1.15);garden.add(mesh(new THREE.CylinderGeometry(.48,.36,.25,16),0xd8a882,0,.125,0));garden.add(mesh(new THREE.CylinderGeometry(.45,.45,.025,16),0x8d7056,0,.26,0));
      const flowers=Math.min(7,companion.garden?.flowers||0);for(let i=0;i<Math.max(1,flowers);i++){const f=decoration('flower');f.position.set(Math.cos(i*2.4)*.27,.27,Math.sin(i*2.4)*.24);f.scale.setScalar(flowers?(.65+Math.min(.4,flowers*.05)):.35);garden.add(f);}worldRoot.add(garden);
      activeRewards.forEach((item,i)=>{const r=decoration(item.kind);r.name=`companion-reward-${item.id}`;r.userData.companionRewardId=item.id;r.position.set(size.width/2-.75-(i%3)*.65,.04,size.depth/2-2.2-Math.floor(i/3)*.7);worldRoot.add(r);});
      if(night){for(let i=0;i<17;i++){const s=star(0xffe8a4,.035+(i%3)*.014);s.position.set(-size.width/2+.5+(i*.91)%(size.width-1),2.8+(i%4)*.28,-size.depth/2+.23);worldRoot.add(s);}const z=label('z Z z',.8,.25);if(z){z.position.set(1,2.1,0);worldRoot.add(z);}}
      track(worldRoot);
      hatAttachment=null;hatAnchor=null;
      if(actor){
        restoreGrowth();const growthFactor=growth.id==='adult'?1.13:growth.id==='young'?1.07:1;
        actor.character.model.scale.copy(modelBaseScale).multiplyScalar(growthFactor);
        actor.character.model.traverse(node=>{if(/(?:^|_)(Head|Torso|Spine)$/.test(node.name)){growthRest.set(node,node.scale.clone());if(/Head$/.test(node.name))node.scale.multiplyScalar(growth.id==='adult'?.91:growth.id==='young'?.96:1);else if(growth.id==='adult')node.scale.multiply(new THREE.Vector3(1.03,1.06,1.01));}});
        outfitRoot=new THREE.Group();outfitRoot.name='companion-outfit';outfitRoot.scale.copy(modelBaseScale).multiplyScalar(growthFactor);
        const o=companion.outfit||{},species=actor.character.metadata?.sku||actor.character.metadata?.id||'';
        const stageArt=new THREE.Group();stageArt.name=`growth-stage-${growth.id}`;stageArt.userData.growthStage=growth.id;outfitRoot.add(stageArt);
        if(growth.id==='baby'){
          const bib=mesh(new THREE.SphereGeometry(.12,14,10),0xffd6b6,0,.38,.15);bib.scale.set(1,.72,.12);bib.name='growth-baby-bib';stageArt.add(bib);
          const button=star(0xfff1c8,.032);button.position.set(0,.39,.172);stageArt.add(button);
        }else{
          const shape=new THREE.Shape();shape.moveTo(-.18,.49);shape.lineTo(.18,.49);shape.lineTo(.25,.11);shape.quadraticCurveTo(0,.02,-.25,.11);shape.closePath();
          const cape=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshLambertMaterial({color:growth.id==='adult'?0x9c89c3:0x8fbfc1,side:THREE.DoubleSide}));cape.position.z=-.22;cape.name=`growth-${growth.id}-cape`;stageArt.add(cape);
          const chest=star(growth.id==='adult'?0xffd779:0xdff2ec,growth.id==='adult'?.07:.05);chest.position.set(0,.40,.19);stageArt.add(chest);
          if(growth.id==='young'){const satchel=mesh(new THREE.BoxGeometry(.14,.13,.06),0xcda377,.16,.24,.08);satchel.name='growth-young-satchel';stageArt.add(satchel);}
          else {const crown=new THREE.Group();crown.name='growth-adult-crest';crown.position.set(0,.64,.19);for(const x of [-.05,0,.05])crown.add(mesh(new THREE.ConeGeometry(.027,x===0?.095:.07,4),0xffd577,x,Math.abs(x)?0:.012,0));stageArt.add(crown);}
        }
        const longEars=/fox|bunny/.test(species),hatFront=longEars?.11:.035,hatRadius=longEars?.12:.16;
        if(o.hat&&o.hat!=='none'){
          hatAttachment=new THREE.Group();hatAttachment.name='companion-hat';
          actor.character.model.traverse(node=>{if(!hatAnchor&&node.isMesh&&/HeadShell$/.test(node.name))hatAnchor=node;});
          if(hatAnchor)hatAnchor.geometry.computeBoundingBox();
          if(o.hat==='star'){hatAttachment.add(mesh(new THREE.ConeGeometry(hatRadius,.19,16),0xb2a6dd,0,.105,hatFront));const s=star(0xffdf82,.075);s.position.set(0,.145,hatFront+.105);hatAttachment.add(s);}
          else if(o.hat==='unicorn'){hatAttachment.add(mesh(new THREE.ConeGeometry(.06,.26,12),0xeac6f3,0,.14,hatFront));const ring=mesh(new THREE.TorusGeometry(hatRadius,.025,7,20),0xf2c9df,0,.025,hatFront);ring.rotation.x=Math.PI/2;hatAttachment.add(ring);}
          else if(o.hat==='ears')for(const x of [-.10,.10])hatAttachment.add(mesh(new THREE.ConeGeometry(.065,.16,3),0x97c7bd,x,.09,hatFront+.04));
          outfitRoot.add(hatAttachment);
        }
        if(o.scarf&&o.scarf!=='none'){const scarf=mesh(new THREE.TorusGeometry(.155,.045,7,18),o.scarf==='rose'?0xeaa3b5:0x91c8b8,0,.42,.01);scarf.rotation.x=Math.PI/2;outfitRoot.add(scarf);outfitRoot.add(mesh(new THREE.BoxGeometry(.07,.18,.04),o.scarf==='rose'?0xeaa3b5:0x91c8b8,.1,.31,.16));}
        if(o.backpack==='school'){outfitRoot.add(mesh(new THREE.BoxGeometry(.26,.28,.13),0xc6b7df,0,.35,-.21));for(const x of [-.1,.1])outfitRoot.add(mesh(new THREE.BoxGeometry(.025,.32,.025),0xf0cc91,x,.37,0));}
        const name=label(companion.petName,1.15,.25);if(name){name.position.set(0,1.45,0);outfitRoot.add(name);}actor.facing.add(outfitRoot);track(outfitRoot);updateHat();}
    }
    const furniture=getFurniture();
    const styleNext=JSON.stringify([companion.furnitureStyles,profile.badges,[...furniture].map(([id,root])=>[id,root.uuid])]);
    if(styleNext!==stylesSignature){
      stylesSignature=styleNext;
      for(const [id,data]of cosmetics)if(furniture.get(id)!==data.root){restoreMaterials(data);cosmetics.delete(id);motions.delete(id);unwrapPivot(data.root);}
      for(const [id,root]of furniture){
        if(id==='pet')continue;
        const style=companion.furnitureStyles?.[id]||{};let data=cosmetics.get(id);
        if(!data){data={root,base:new Map(),decal:null};root.traverse(node=>{if(node.isMesh&&node.material&&!node.userData.companionCosmetic)data.base.set(node,node.material);});cosmetics.set(id,data);}
        restoreMaterials(data);
        const skin=skinForAchievement(style.skinId||(style.achievementSkin?(profile.badges||[])[0]:'')),skinOwned=skin&&(profile.badges||[]).includes(skin.badgeId);
        let skinTexture=null;if(skinOwned){const c=doc.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');if(ctx&&drawAchievementSkin(ctx,skin)){skinTexture=new THREE.CanvasTexture(c);skinTexture.colorSpace=THREE.SRGBColorSpace;skinTexture.wrapS=skinTexture.wrapT=THREE.RepeatWrapping;skinTexture.repeat.set(2,2);ownedResources.add(skinTexture);}}
        for(const [node,original]of data.base)if(style.color||style.achievementSkin||skinTexture){
          const paint=material=>{const clone=material.clone();if(style.color)clone.color?.set(style.color);if(skinTexture){clone.map=skinTexture;clone.color?.set(0xffffff);clone.needsUpdate=true;}else if(style.achievementSkin){clone.color?.lerp(new THREE.Color(0xffd883),.45);clone.emissive?.set(0x332000);}ownedResources.add(clone);return clone;};
          node.material=Array.isArray(original)?original.map(paint):paint(original);
        }
        const marks=[];
        if(style.sticker&&style.sticker!=='none')marks.push({kind:'sticker',text:style.sticker==='heart'?'♥':style.sticker==='flower'?'✿':'★'});
        if(style.doodle&&style.doodle!=='none')marks.push({kind:'doodle',text:style.doodle==='rainbow'?'🌈':'☺'});
        if(marks.length||style.drawing?.strokes?.length){
          const pivot=visualRoot(root),saved={position:pivot.position.clone(),rotation:pivot.rotation.clone(),scale:pivot.scale.clone()};resetPivot(pivot);root.updateMatrixWorld(true);
          const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),group=new THREE.Group();group.userData.companionCosmetic=true;
          marks.forEach((mark,index)=>{const decal=label(mark.text,.40,.26);if(!decal)return;
            const dx=marks.length===1?0:(index-.5)*.44;
            decal.position.copy(root.worldToLocal(new THREE.Vector3(center.x+dx,box.max.y+.06,center.z)));
            decal.scale.set(1/Math.max(.01,root.scale.x),1/Math.max(.01,root.scale.y),1/Math.max(.01,root.scale.z));
            decal.quaternion.copy(root.getWorldQuaternion(new THREE.Quaternion()).invert());decal.userData.companionCosmetic=true;decal.userData.companionMark=mark.kind;group.add(decal);
          });
          if(style.drawing?.strokes?.length){
            const c=doc.createElement('canvas');c.width=512;c.height=320;const ctx=c.getContext('2d');if(ctx){
              drawFurnitureDrawing(ctx,style.drawing,512,320);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
              const extent=box.getSize(new THREE.Vector3()),aspect=c.width/c.height,maxWidth=Math.max(.02,Math.min(2,extent.x*.8)),maxHeight=Math.max(.02,Math.min(1.5,extent.z*.8)),h=Math.min(maxHeight,maxWidth/aspect),w=h*aspect;
              const decal=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}));
              const world=new THREE.Matrix4().compose(new THREE.Vector3(center.x,box.max.y+.012,center.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),new THREE.Vector3(1,1,1));
              // Preserve the editor's aspect even when the furniture has nonuniform scale or yaw.
              decal.matrixAutoUpdate=false;decal.matrix.copy(root.matrixWorld).invert().multiply(world);decal.userData.companionCosmetic=true;decal.userData.companionMark='freehand';group.add(decal);
            }
          }
          pivot.add(group);track(group);data.decal=group;pivot.position.copy(saved.position);pivot.rotation.copy(saved.rotation);pivot.scale.copy(saved.scale);
        }
      }
    }
  }
  function updateHat(){if(!hatAttachment||!outfitRoot)return;if(hatAnchor?.geometry.boundingBox){const point=hatAnchor.localToWorld(new THREE.Vector3(0,hatAnchor.geometry.boundingBox.max.y,0));hatAttachment.position.copy(outfitRoot.worldToLocal(point));}else hatAttachment.position.set(0,1,0);}
  function visualRoot(root){if(pivots.has(root))return pivots.get(root);const pivot=new THREE.Group();pivot.name='cosmetic-animation';for(const child of [...root.children])pivot.add(child);root.add(pivot);root.userData.feelPivot=pivot;pivots.set(root,pivot);return pivot;}
  function land(id){const root=getFurniture().get(id);if(!root||reducedMotion||disposed)return;const pivot=visualRoot(root);resetPivot(pivot);motions.set(id,{pivot,t:0,kind:'land'});}
  function transition(before){if(reducedMotion||disposed)return;for(const [id,old]of Object.entries(before?.furniture||{})){const root=getFurniture().get(id);if(!root||!Array.isArray(old.position))continue;const offset=new THREE.Vector3(...old.position).sub(root.position).applyQuaternion(root.quaternion.clone().invert()).divide(root.scale);const yaw=Math.atan2(Math.sin((old.rotation?.[1]||0)-root.rotation.y),Math.cos((old.rotation?.[1]||0)-root.rotation.y));const pivot=visualRoot(root);resetPivot(pivot);motions.set(id,{pivot,t:0,kind:'move',offset,yaw});}}
  function react(kind='cheer'){const actor=getActor();if(disposed||reducedMotion||!actor)return;wake();cancelFetch();restoreBlink();restoreJoints();reaction={kind,t:0};actor.pose?.setCelebrate?.(1);}
  function ritual(){if(disposed||reducedMotion||!getActor())return;react('cheer');walkRitual={t:0};}
  function setNight(value){night=!!value;if(!night)wake();signature='';}
  function fetchGift(gift={}){
    const actor=getActor();if(disposed||reducedMotion||!actor||actor.state!=='idle'||typeof actor.walkTo!=='function')return false;
    wake();cancelFetch();restoreBlink();restoreJoints();reaction=null;walkRitual=null;
    const home={x:actor.root.position.x,z:actor.root.position.z},size=getSize(),directions=[[.8,0],[0,-.8],[-.8,0],[0,.8],[.55,.55],[-.55,-.55]];
    const away=directions.map(([x,z])=>({x:home.x+x,z:home.z+z})).find(point=>Math.abs(point.x)<size.width/2-.65&&Math.abs(point.z)<size.depth/2-.65&&canVisit(point));
    if(!away||actor.walkTo(away)===false)return false;
    fetching={phase:'outbound',t:0,home,away,gift,prop:null};return true;
  }
  function fetchFrame(actor,dt){
    const f=fetching;if(!f)return;f.t+=dt;if(f.t>18||!['idle','walking'].includes(actor.state)){cancelFetch();return;}
    if(f.phase==='outbound'&&actor.state==='idle'){
      const prop=decoration(f.gift.kind||'star');prop.name='pet-treasure-in-mouth';prop.userData.temporaryTreasure=true;prop.scale.setScalar(.25);track(prop);actor.facing.add(prop);f.prop=prop;f.phase='carrying';f.t=0;
      if(actor.walkTo(f.home)===false){f.phase='dropping';f.t=0;}
    }
    if(f.prop&&f.phase!=='dropping'){
      let head;actor.character.model.traverse(node=>{if(!head&&node.isMesh&&/HeadShell$/.test(node.name))head=node;});
      if(head){head.geometry.computeBoundingBox();head.updateWorldMatrix(true,false);const box=head.geometry.boundingBox,point=head.localToWorld(new THREE.Vector3(0,box.min.y+(box.max.y-box.min.y)*.27,box.max.z+.025));f.prop.position.copy(actor.facing.worldToLocal(point));f.prop.rotation.y=-actor.facing.getWorldQuaternion(new THREE.Quaternion()).y*.15;}
      else f.prop.position.set(0,.65,.23);
    }
    if(f.phase==='carrying'&&actor.state==='idle'&&f.t>.12){f.phase='dropping';f.t=0;}
    if(f.phase==='dropping'){
      if(f.prop){actor.facing.updateWorldMatrix(true,true);const p=f.prop.getWorldPosition(new THREE.Vector3());scene.attach(f.prop);f.prop.position.copy(p);f.prop.position.y=Math.max(.06,f.prop.position.y-dt*.7);f.prop.scale.multiplyScalar(Math.max(0,1-dt*2));}
      if(f.t>.65){cancelFetch();react('cheer');}
    }
  }
  function sleepPose(actor){
    sleeping=true;actor.gait.rotation.z=gaitBase.rotation.z+1.05;actor.gait.rotation.y=gaitBase.rotation.y-.22;actor.gait.position.y=gaitBase.position.y+.22;actor.gait.position.x=gaitBase.position.x-.12;
    if(!reducedMotion)actor.gait.position.y+=Math.sin(elapsed*1.6)*.008;
    actor.character.model.traverse(node=>{
      if(/EyeBlink_[LR]$/.test(node.name)){if(!sleepEyes.has(node))sleepEyes.set(node,node.scale.clone());node.scale.y=sleepEyes.get(node).y*.06;}
      if(/(?:Head|Hip_[LR]|Shoulder_[LR]|Tail)$/.test(node.name)){if(!sleepJoints.has(node))sleepJoints.set(node,node.rotation.clone());const rest=sleepJoints.get(node);node.rotation.copy(rest);if(/Head$/.test(node.name)){node.rotation.x+=.35;node.rotation.z-=.2;}else if(/Hip_/.test(node.name))node.rotation.x-=.85;else if(/Shoulder_/.test(node.name)){node.rotation.x-=.9;node.rotation.z+=node.name.endsWith('_L')?.5:-.5;}else if(/Tail$/.test(node.name))node.rotation.y+=.6;}
    });
  }
  function frame(dt){if(disposed||!Number.isFinite(dt)||dt<0)return;elapsed+=dt;for(const [id,m]of motions){m.t+=dt;if(m.kind==='move'){const t=Math.min(1,m.t/.3),k=1-(t*t*(3-2*t));m.pivot.position.copy(m.offset).multiplyScalar(k);m.pivot.rotation.y=m.yaw*k;if(t===1){resetPivot(m.pivot);motions.delete(id);}}else{const t=Math.min(1,m.t/.6);m.pivot.position.y=Math.abs(Math.sin(t*Math.PI*2))*Math.exp(-t*4)*.18;m.pivot.scale.set(1+Math.sin(t*Math.PI*3)*.025,1-Math.sin(t*Math.PI*3)*.035,1+Math.sin(t*Math.PI*3)*.025);if(t===1){resetPivot(m.pivot);motions.delete(id);}}}
    const actor=getActor();adoptActor(actor);if(!actor)return;resetGait();updateHat();
    if(night&&!reaction&&!fetching&&['idle','seated'].includes(actor.state))sleepPose(actor);else if(sleeping)wake();
    if(fetching)fetchFrame(actor,dt);
    if(reaction){reaction.t+=dt;const t=reaction.t;
      if(reaction.kind==='nuzzle'){actor.gait.rotation.z=gaitBase.rotation.z+Math.sin(t*7)*.12;actor.gait.position.x=gaitBase.position.x+Math.sin(t*4)*.065;actor.character.model.traverse(node=>{if(/Head$/.test(node.name)){if(!jointRest.has(node))jointRest.set(node,node.rotation.clone());node.rotation.z=jointRest.get(node).z+Math.sin(t*5)*.18;}});}
      else if(reaction.kind==='clap')actor.character.model.traverse(node=>{if(/Shoulder_[LR]$/.test(node.name)){if(!jointRest.has(node))jointRest.set(node,node.rotation.clone());const left=node.name.endsWith('_L');node.rotation.x=-1.2;node.rotation.z=(left?1:-1)*(.65+Math.abs(Math.sin(t*13))*.50);}});
      else if(actor.state==='idle'){actor.gait.position.y=gaitBase.position.y+Math.max(0,Math.sin(t*Math.PI*2.4))*.24*Math.max(0,1-t/1.3);actor.character.model.traverse(node=>{if(/Shoulder_[LR]$/.test(node.name)){if(!jointRest.has(node))jointRest.set(node,node.rotation.clone());node.rotation.x=-1.5+Math.sin(t*7)*.12;node.rotation.z=(node.name.endsWith('_L')?1:-1)*.4;}});}
      if(t>=.10&&t<=.48)actor.character.model.traverse(node=>{if(/EyeBlink_L$/.test(node.name)){if(!blinkRest.has(node))blinkRest.set(node,node.scale.clone());node.scale.y=blinkRest.get(node).y*(1-.88*Math.sin((t-.1)/.38*Math.PI));}});
      else if(blinkRest.size)restoreBlink();
      if(t>1.5){reaction=null;restoreBlink();restoreJoints();resetGait();}
    }
    if(walkRitual){walkRitual.t+=dt;if(actor.state==='idle')actor.gait.rotation.y=gaitBase.rotation.y+Math.sin(Math.min(1,walkRitual.t/1.8)*Math.PI*2)*.45;if(walkRitual.t>1.8){actor.gait.rotation.y=gaitBase.rotation.y;walkRitual=null;}}
  }
  return {sync,land,transition,react,ritual,setNight,fetchGift,frame,interrupt(){wake();cancelFetch();restoreBlink();restoreJoints();reaction=walkRitual=null;},get sleeping(){return sleeping;},get active(){return !disposed&&(!!reaction||!!walkRitual||!!fetching||motions.size>0);},dispose(){if(disposed)return;disposed=true;wake();cancelFetch();restoreGrowth();restoreBlink();restoreJoints();resetGait();if(scaledModel&&modelBaseScale)scaledModel.scale.copy(modelBaseScale);release(worldRoot);release(outfitRoot);for(const data of cosmetics.values())restoreMaterials(data);for(const root of [...pivots.keys()])unwrapPivot(root);for(const resource of [...ownedResources]){try{releaseResource(resource);}catch{}}ownedResources.clear();motions.clear();cosmetics.clear();reaction=walkRitual=null;hatAttachment=hatAnchor=scaledModel=currentActor=null;}};
}
