import test from 'node:test';
import assert from 'node:assert/strict';
import {createPetCharacter,PET_MODELS} from '../characters/pet-models.js';

const entries=[{sku:'apricot-fox',prefix:'Fox',peak:2.6},...PET_MODELS.map((entry,index)=>({sku:entry.sku,prefix:entry.sku.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join(''),peak:2.6+index*.18}))];
for(const {sku,prefix,peak}of entries)test(`${sku}: brief blink closes both eyes and restores the attentive resting face`,t=>{
  const pet=createPetCharacter(sku);t.after(pet.dispose);
  const lids=['L','R'].map(side=>pet.model.getObjectByName(`${prefix}_EyeBlink_${side}`));
  assert.ok(lids.every(Boolean));
  const head=pet.model.getObjectByName(`${prefix}_Head`),headScale=head.scale.clone();
  assert.ok(lids.every(lid=>lid.scale.y===1));
  pet.pose.update(peak-.13);
  assert.ok(lids.every(lid=>Math.abs(lid.scale.y-1)<1e-6));
  pet.pose.update(.13);
  assert.ok(lids.every(lid=>lid.scale.y<.06&&lid.scale.y>0));
  pet.pose.update(.14);
  assert.ok(lids.every(lid=>Math.abs(lid.scale.y-1)<1e-6));
  assert.deepEqual(head.scale.toArray(),headScale.toArray(),'blinking must not squash the whole head');
  pet.pose.setCelebrate(1);pet.pose.update(.1);
  pet.model.traverse(node=>assert.ok(!/Smile/.test(node.name),'a fixed exaggerated smile is no longer part of the model'));
  if(sku!=='starlight-penguin')assert.ok(pet.model.getObjectByName(`${prefix}_${sku==='apricot-fox'?'RelaxedMouth':'RelaxedMouth_L'}`));
});
