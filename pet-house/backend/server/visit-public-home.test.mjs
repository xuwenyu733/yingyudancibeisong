import test from 'node:test';
import assert from 'node:assert/strict';
import {displayedVisitItems} from './visit-public-home.mjs';
test('legacy automatic layout shares only visible placed products, never hidden stock or flooring',()=>{
 const owned=['reading-shelf','star-lamp','rocket-toy','moon-ornament','wood-floor'],scene={layout:null,stored:['moon-ornament']};
 assert.deepEqual(displayedVisitItems(scene,owned,sku=>sku!=='wood-floor'),['reading-shelf','star-lamp','rocket-toy']);assert.deepEqual(scene.stored,['moon-ornament']);
});
test('explicit layout shares only held present products and preserves individual copy SKUs',()=>{
 const owned=['reading-shelf','reading-shelf--copy-2','star-lamp','rocket-toy'],scene={layout:{furniture:{sofa:{},'shop-reading-shelf--copy-2':{},'shop-star-lamp':{},'shop-unowned':{}}},stored:['star-lamp']};
 assert.deepEqual(displayedVisitItems(scene,owned),['reading-shelf--copy-2']);assert.deepEqual(displayedVisitItems({...scene,layout:{furniture:{}}},owned),[]);
});
