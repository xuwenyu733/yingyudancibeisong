/** Original low-poly garden scenery. Decorative only; never changes crop state. */
export function buildGardenScenery({THREE,props,box,sphere,add,label,mat,doc}){
 const wood='#d5ae7b',cream='#fff6df',leaf='#7eab76';
 box(7.9,.34,5.55,'#b89c74',0,-.2,0);box(7.82,.12,5.48,'#e5d5ac',0,.015,0);box(7.65,.11,5.3,'#a9c291',0,.12,0);
 // A warm gravel terrace and a stepping-stone path give the plots a home.
 box(6.55,.045,3.05,'#e8ddba',0,.195,0);
 for(let i=0;i<9;i++){const stone=box(.56,.07,.39,i%2?'#f5e7c7':'#eadab7',(i-4)*.72,.2,2.04+(i%2)*.07);stone.rotation.y=(i%3-1)*.12;}
 for(let x=-3.6;x<=3.6;x+=.6){box(.13,1.02,.13,cream,x,.68,-2.43);sphere(.09,'#e8d8b5',x,1.21,-2.43);}
 box(7.4,.14,.11,cream,0,.47,-2.44);box(7.4,.14,.11,cream,0,.91,-2.44);
 for(const side of [-1,1]){for(let z=-1.9;z<=1.5;z+=.65)box(.12,.67,.12,cream,side*3.72,.54,z);box(.10,.12,3.9,cream,side*3.72,.60,-.3);}
 function flower(x,y,z,color,parent=props,scale=1){
  const stem=box(.025,.28*scale,.025,leaf,x,y+.12*scale,z,parent);
  for(let i=0;i<5;i++){const petal=sphere(.075*scale,color,x+Math.sin(i*1.257)*.09*scale,y+.29*scale,z+Math.cos(i*1.257)*.09*scale,parent);petal.scale.y=.52;}
  sphere(.048*scale,'#eac878',x,y+.31*scale,z,parent);return stem;
 }
 function pot(x,z,color){
  add(new THREE.CylinderGeometry(.27,.19,.36,12),color,x,.38,z);add(new THREE.TorusGeometry(.26,.035,6,20),color,x,.57,z).rotation.x=Math.PI/2;
  for(let i=0;i<4;i++)flower(x+Math.sin(i*2.4)*.16,.58,z+Math.cos(i*2.4)*.16,i%2?'#e4a3ac':'#fff1bd',props,.9+(i%2)*.22);
 }
 pot(-3.2,1.4,'#c99372');pot(3.25,1.4,'#d9b68b');
 // A little arbour with a striped canvas roof, vine and garden sign.
 for(const x of [-3.55,-2.4])box(.10,1.6,.10,wood,x,1.0,-1.96);
 box(1.5,.13,.14,wood,-2.98,1.86,-1.96);
 for(let i=0;i<5;i++){const roof=box(.31,.07,.88,i%2?'#f9ebc7':'#93b39a',-3.6+i*.31,1.96,-1.96);roof.rotation.x=.15;}
 for(let i=0;i<5;i++){const foliage=sphere(.14,i%2?'#92b97e':'#70956e',-3.52+Math.sin(i*1.7)*.1,.68+i*.24,-1.88);foliage.scale.set(.8,1,.4);if(i%2)flower(-3.42,.5+i*.23,-1.85,'#f1c2a7',props,.55);}
 label('阳光花园',-2.95,1.51,-1.8);
 // Watering can and folded seed packets: readable objects without extra pets.
 add(new THREE.CylinderGeometry(.23,.26,.36,16),'#83b6af',3.18,.43,-1.6);
 const handle=add(new THREE.TorusGeometry(.25,.035,6,20),'#67978e',3.43,.52,-1.6);handle.rotation.y=Math.PI/2;
 const spout=add(new THREE.CylinderGeometry(.06,.10,.5,10),'#83b6af',2.93,.61,-1.6);spout.rotation.z=-.85;
 const rose=add(new THREE.CylinderGeometry(.13,.10,.08,12),'#d6dcb7',2.73,.79,-1.6);rose.rotation.z=-.85;
 for(let i=0;i<2;i++){const packet=box(.27,.42,.08,i?'#eed2b5':'#e4e8c6',3.15+i*.32,.41,-2.12);packet.rotation.z=i?.12:-.1;}
 for(let i=0;i<12;i++){const x=-3.35+(i%6)*1.32,z=i<6?-2.05:2.43;for(let j=0;j<2;j++){const tuft=sphere(.09,j?'#8caf78':'#bed09b',x+j*.08,.22,z);tuft.scale.set(.35,1.7,.6);}if(i%3===0)flower(x,.22,z,'#fff3d7',props,.65);}
 // One shared soft contact-shadow texture for the entire scene.
 const canvas=doc.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(69,78,47,.24)');g.addColorStop(1,'rgba(69,78,47,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
 const texture=new THREE.CanvasTexture(canvas),shadowMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
 const shadows=new THREE.Group();props.add(shadows);for(const x of [-2.05,0,2.05]){const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.5,3.25),shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.224,0);shadows.add(shadow);}
 return {dispose(){texture.dispose();shadowMaterial.dispose();}};
}
