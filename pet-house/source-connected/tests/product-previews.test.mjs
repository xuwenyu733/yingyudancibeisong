import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SHOP_CATALOG,BUILTIN_STORAGE} from '../economy.mjs';
import {PRODUCT_PREVIEW_ITEMS} from '../product-previews.mjs';
const root=new URL('../',import.meta.url),directory=new URL('assets/products/previews/',root);
const manifest=JSON.parse(readFileSync(new URL('metadata.json',directory),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('actual product portraits cover every shop item and room/storage builtin',()=>{
 const expected=[...SHOP_CATALOG.map(item=>item.sku),...BUILTIN_STORAGE.map(item=>item.id)].sort();
 assert.deepEqual(PRODUCT_PREVIEW_ITEMS.map(item=>item.sku).sort(),expected);
 assert.deepEqual(manifest.entries.map(item=>item.sku).sort(),expected);
 assert.equal(new Set(expected).size,41);
});
test('portrait source hashes track the current runtime geometry and material definitions',()=>{
 assert.equal(manifest.kind,'runtime-product-studio-render');assert.equal(manifest.transparent,true);
 for(const source of manifest.sources)assert.equal(hash(readFileSync(new URL(source.file,root))),source.sha256,`Regenerate actual product pictures after changing ${source.file}`);
});
test('all product images are distinct valid 512 by 384 PNGs matching their manifest',()=>{
 const fingerprints=[];
 for(const item of manifest.entries){const png=readFileSync(new URL(item.file,directory));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),384);assert.equal(png.length,item.bytes);assert.equal(hash(png),item.sha256);fingerprints.push(item.sha256);for(const corner of ['min','max'])assert.ok(item.bounds[corner].every(Number.isFinite));}
 assert.equal(new Set(fingerprints).size,41);
});
