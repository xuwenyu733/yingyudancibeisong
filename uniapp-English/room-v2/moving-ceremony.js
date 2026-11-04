import {Group,Mesh,BoxGeometry,MeshLambertMaterial} from './vendor/three/three.module.js';
/** Visual children and camera only: collider roots and persisted transforms remain final. */
export function createMovingCeremony({scene,camera,root,getFurniture,reducedMotion=false,onFinish=()=>{}}){
  let current=null,disposed=false,panel=null;const pivots=new Map();
  const doc=root?.ownerDocument;
  function finish(){
    const old=current;if(!old)return;current=null;
    old.pivot?.scale.set(1,1,1);camera.position.copy(old.position);camera.quaternion.copy(old.quaternion);camera.zoom=old.zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    old.boxes.removeFromParent();for(const value of old.resources)value.dispose();panel?.remove();panel=null;onFinish();
  }
  function start({fromWidth=8.8,fromDepth=8.2,toWidth=fromWidth,toDepth=fromDepth,roomName='新的小屋'}={}){
    if(disposed)return false;finish();if(reducedMotion)return false;
    const shell=getFurniture().get('room-shell');let pivot=pivots.get(shell);
    if(shell&&!pivot){pivot=new Group();pivot.name='moving-wall-visual';for(const child of [...shell.children])pivot.add(child);shell.add(pivot);pivots.set(shell,pivot);}
    const boxes=new Group(),resources=[],small=new BoxGeometry(.48,.44,.48),large=new BoxGeometry(.62,.50,.55),ribbon=new BoxGeometry(.065,.51,.57);resources.push(small,large,ribbon);
    const colors=[0xc89e79,0xe4bd93,0x95b7a1],materials=colors.map(color=>new MeshLambertMaterial({color}));resources.push(...materials);
    for(let i=0;i<3;i++){const box=new Group();box.userData.index=i;const body=new Mesh(i===1?large:small,materials[i]),band=new Mesh(ribbon,materials[(i+1)%3]);body.position.y=.24;band.position.y=.25;box.add(body,band);box.traverse(part=>{part.layers.enable(1);if(part.isMesh)part.castShadow=true;});boxes.add(box);}scene.add(boxes);
    current={t:0,pivot,ratioX:fromWidth/toWidth,ratioZ:fromDepth/toDepth,position:camera.position.clone(),quaternion:camera.quaternion.clone(),zoom:camera.zoom,boxes,resources};
    if(doc){panel=doc.createElement('aside');panel.className='moving-ceremony';panel.setAttribute('role','status');const title=doc.createElement('strong');title.textContent=`搬进「${roomName}」啦`;const copy=doc.createElement('span');copy.textContent='搭好墙壁，打开纸箱，伙伴陪你认识新家～';const skip=doc.createElement('button');skip.type='button';skip.textContent='收好纸箱，开始布置';skip.addEventListener('click',finish);panel.append(title,copy,skip);root.append(panel);}
    frame(0);return true;
  }
  function frame(dt){
    if(!current||disposed)return;const c=current;c.t+=Math.max(0,Math.min(dt,.1));const p=Math.min(1,c.t/2.4),ease=1-(1-p)**3;
    if(c.pivot)c.pivot.scale.set(c.ratioX+(1-c.ratioX)*ease,1,c.ratioZ+(1-c.ratioZ)*ease);
    camera.zoom=c.zoom*(.91+.09*ease+.035*Math.sin(p*Math.PI));camera.position.x=c.position.x+Math.sin(p*Math.PI*2)*.22;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    c.boxes.children.forEach((box,i)=>{const delay=i*.16,travel=Math.max(0,Math.min(1,(p-delay)/.64));box.position.set(-1.1+i*.7,-Math.min(1,Math.max(0,(p-.76)*5))*.9,3.1-travel*(1.5+i*.12));box.rotation.y=Math.sin(travel*Math.PI)*.22;box.scale.setScalar(1-Math.min(.99,Math.max(0,(p-.76)*5)));});
    if(p>=1)finish();
  }
  return {start,frame,cancel:finish,get active(){return !!current;},dispose(){if(disposed)return;finish();disposed=true;for(const [shell,pivot]of pivots){if(!shell)continue;for(const child of [...pivot.children])shell.add(child);pivot.removeFromParent();}pivots.clear();}};
}

export function createTravelCurtain({container,source,roomName='新楼层',reducedMotion=false}){
  const doc=container.ownerDocument,win=doc.defaultView,node=doc.createElement('div');node.className='estate-travel-curtain';node.setAttribute('role','status');
  const copy=doc.createElement('div');copy.className='estate-travel-copy';const mascot=doc.createElement('span');mascot.className='estate-travel-pet';mascot.textContent='🦊 📦';const title=doc.createElement('strong');title.textContent=`伙伴正在搬去「${roomName}」`;const hint=doc.createElement('span');hint.textContent='把喜欢装进纸箱，再一起推开新门～';copy.append(mascot,title,hint);
  if(source)try{const snapshot=doc.createElement('canvas');snapshot.width=source.width;snapshot.height=source.height;snapshot.getContext('2d').drawImage(source,0,0);node.append(snapshot);}catch{}
  node.append(copy);container.append(node);let done=false,timer=0,resolveFinish;
  function dispose(){if(done)return;done=true;win.clearTimeout(timer);node.remove();resolveFinish?.();}
  return {dispose,finish(){if(done)return Promise.resolve();node.classList.add('arrived');return new Promise(resolve=>{resolveFinish=resolve;timer=win.setTimeout(dispose,reducedMotion?0:380);});}};
}
