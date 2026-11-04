import test from 'node:test';import assert from 'node:assert/strict';
import {Scene,Group,Mesh,BoxGeometry,MeshLambertMaterial,OrthographicCamera} from '../vendor/three/three.module.js';
import {createMovingCeremony} from '../moving-ceremony.js';
function fixture(reducedMotion=false){const scene=new Scene(),shell=new Group(),geometry=new BoxGeometry(1,1,1),material=new MeshLambertMaterial(),child=new Mesh(geometry,material),camera=new OrthographicCamera(-5,5,5,-5,.1,80);shell.scale.set(1.5,1,1.5);shell.add(child);scene.add(shell);camera.position.set(9,11.8,17);camera.lookAt(0,1.35,0);const furniture=new Map([['room-shell',shell]]),film=createMovingCeremony({scene,camera,root:null,getFurniture:()=>furniture,reducedMotion});return{scene,shell,child,camera,film,dispose(){film.dispose();geometry.dispose();material.dispose();}};}
test('wall expansion, camera travel and unpacking finish without changing saved shell transforms',()=>{
 const f=fixture(),scale=f.shell.scale.toArray(),position=f.camera.position.toArray(),quaternion=f.camera.quaternion.toArray();assert.equal(f.film.start({fromWidth:8.8,fromDepth:8.2,toWidth:12.8,toDepth:12.2}),true);
 const pivot=f.shell.getObjectByName('moving-wall-visual');assert.ok(pivot.scale.x<1);assert.deepEqual(f.shell.scale.toArray(),scale);f.film.frame(.1);assert.notEqual(f.camera.zoom,1);
 for(let i=0;i<25;i++)f.film.frame(.1);assert.equal(f.film.active,false);assert.deepEqual(pivot.scale.toArray(),[1,1,1]);assert.deepEqual(f.camera.position.toArray(),position);assert.deepEqual(f.camera.quaternion.toArray(),quaternion);assert.deepEqual(f.shell.scale.toArray(),scale);assert.equal(f.scene.children.length,1);f.dispose();assert.equal(f.child.parent,f.shell);
});
test('interruption, restart, disposal and reduced motion always restore the camera and visual hierarchy',()=>{
 const f=fixture();f.film.start();f.film.frame(.1);f.film.cancel();assert.equal(f.camera.zoom,1);assert.equal(f.film.active,false);f.film.start();f.film.frame(.1);f.film.start();f.dispose();assert.equal(f.camera.zoom,1);assert.equal(f.child.parent,f.shell);
 const calm=fixture(true);assert.equal(calm.film.start(),false);assert.equal(calm.scene.children.length,1);calm.dispose();
});
