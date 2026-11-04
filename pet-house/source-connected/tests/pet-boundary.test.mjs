import test from 'node:test';import assert from 'node:assert/strict';
import {PET_BODY_RADIUS,PET_EDGE_GAP,petNavigationBounds,insidePetBounds} from '../pet-boundary.mjs';
import {ROOM_TIERS} from '../economy.mjs';
import {MovementController} from '../movement.mjs';
import {createPath} from '../navigation.mjs';
for(const tier of ROOM_TIERS){
 test(`${tier.name}: every edge and corner keeps the whole pet inside the physical room`,()=>{
  const bounds=petNavigationBounds(tier.width,tier.depth);
  for(const axis of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1},{x:1,z:1},{x:-1,z:1},{x:1,z:-1},{x:-1,z:-1}]){
   const pet=new MovementController({bounds});pet.x=0;pet.z=0;
   for(let frame=0;frame<1000;frame++){pet.update(1/30,axis);assert.ok(insidePetBounds(pet,bounds));assert.ok(Math.abs(pet.x)+PET_BODY_RADIUS<=tier.width/2-PET_EDGE_GAP+1e-8);assert.ok(Math.abs(pet.z)+PET_BODY_RADIUS<=tier.depth/2-PET_EDGE_GAP+1e-8);}
   const target={x:axis.x<0?bounds.minX:bounds.maxX,z:axis.z<0?bounds.minZ:bounds.maxZ};
   if(axis.x)assert.ok(Math.abs(pet.x-target.x)<1e-6);if(axis.z)assert.ok(Math.abs(pet.z-target.z)<1e-6);
  }
 });
 test(`${tier.name}: click paths and every returned segment reject the four forbidden edge strips`,()=>{
  const bounds=petNavigationBounds(tier.width,tier.depth),start={x:0,z:0};
  for(const point of [{x:-tier.width/2+.04,z:0},{x:tier.width/2-.04,z:0},{x:0,z:-tier.depth/2+.04},{x:0,z:tier.depth/2-.04},{x:bounds.minX-.001,z:bounds.minZ-.001},{x:bounds.maxX+.001,z:bounds.maxZ+.001}]){
   assert.equal(insidePetBounds(point,bounds),false);assert.equal(createPath(start,point,{bounds}),null);
  }
  for(const x of [bounds.minX,bounds.maxX])for(const z of [bounds.minZ,bounds.maxZ]){const route=createPath(start,{x,z},{bounds,obstacles:[{minX:.3,maxX:.8,minZ:.3,maxZ:.8}]});assert.ok(route);let previous=start;for(const point of route){for(let sample=0;sample<=100;sample++){const t=sample/100;assert.ok(insidePetBounds({x:previous.x+(point.x-previous.x)*t,z:previous.z+(point.z-previous.z)*t},bounds));}previous=point;}}
 });
}
test('invalid room dimensions and nonfinite destinations never create permissive boundaries',()=>{
 for(const size of [NaN,Infinity,0,1,-8])assert.throws(()=>petNavigationBounds(size,8));
 const bounds=petNavigationBounds(8.8,8.2);for(const point of [null,{x:NaN,z:0},{x:0,z:Infinity},{}])assert.equal(insidePetBounds(point,bounds),false);
});
