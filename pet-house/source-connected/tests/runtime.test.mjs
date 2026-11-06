import test from 'node:test';import assert from 'node:assert/strict';
import {resolveQuality,resolveAssetURL,createDisposer} from '../runtime.mjs';
test('quality profiles bound mobile resolution and shadows without assuming desktop hardware',()=>{
  assert.equal(resolveQuality('auto',{coarsePointer:true}).profile,'low');
  assert.equal(resolveQuality('auto',{deviceMemory:2}).shadowSize,512);
  assert.equal(resolveQuality('auto',{}).maxPixelRatio,1.5);
  assert.equal(resolveQuality('high',{}).maxPixelRatio,2);
  assert.throws(()=>resolveQuality('wrong'));
});
test('asset directory can be relocated while unsafe resource names are rejected',()=>{
  assert.equal(resolveAssetURL('optimized/sofa.glb','https://example.test/mobile/assets'),'https://example.test/mobile/assets/optimized/sofa.glb');
  for(const name of ['../pet.glb','/pet.glb','https://x.test/pet.glb',''])assert.throws(()=>resolveAssetURL(name,'https://example.test/assets/'));
});
test('shared GPU resources and repeated cleanup are released only once',()=>{
  let count=0;const shared={dispose(){count++;}},texture={isTexture:true,dispose(){count++;}};
  const material={map:texture,dispose(){count++;}};
  const objects=[{geometry:shared,material},{geometry:shared,material:[material]}];
  const root={traverse(callback){objects.forEach(callback);}},disposer=createDisposer();
  disposer.tree(root);disposer.tree(root);assert.equal(count,3);
});
test('one failing resource finalizer does not prevent the remaining GPU objects from being released',()=>{
  let released=0;const disposer=createDisposer();disposer.release({dispose(){throw new Error('host finalizer');}});disposer.release({dispose(){released++;}});
  assert.equal(released,1);assert.equal(disposer.errors.length,1);
});
