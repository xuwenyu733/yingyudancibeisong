/** Render shop portraits from the same runtime model factory used by the room.
 * Run: node tools/render-pet-thumbnails.mjs
 * Optional: PET_ROOM_PLAYWRIGHT_MODULE / PET_ROOM_CHROMIUM_EXECUTABLE.
 * Each image is generated locally; no remote image or common character drawing is used.
 */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'assets','pets','previews'),size=512;
const {chromium}=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}canvas{display:block;width:${size}px;height:${size}px}</style></head><body><script type="module">
import * as THREE from '/vendor/three/three.module.js';
import {createPetCharacter} from '/characters/pet-models.js';
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(${size},${size});renderer.setClearColor(0,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.66,.66,.66,-.66,.1,20);
camera.position.set(1.25,.87,3.2);camera.lookAt(0,.52,0);
scene.add(new THREE.HemisphereLight(0xfff7e8,0x9eb5c3,1.15));
const key=new THREE.DirectionalLight(0xfff1d9,1.7);key.position.set(-3,5,5);scene.add(key);
const fill=new THREE.DirectionalLight(0xe5f5ff,.45);fill.position.set(3,2,-3);scene.add(fill);
let current=null;
window.renderPet=sku=>{
 if(current){current.model.removeFromParent();current.dispose();current=null;}
 current=createPetCharacter(sku);current.pose.update(0);scene.add(current.model);
 const box=new THREE.Box3().setFromObject(current.model),center=box.getCenter(new THREE.Vector3());
 current.model.position.x=-center.x;current.model.position.z=-center.z;current.model.updateMatrixWorld(true);
 renderer.render(scene,camera);
 return {sku,name:current.metadata.displayName,modelId:current.metadata.id,triangles:current.metadata.triangles,bounds:{min:box.min.toArray(),max:box.max.toArray()}};
};
window.portraitReady=true;
</script></body></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  const file=resolve(root,`.${decodeURIComponent(new URL(req.url,'http://localhost').pathname)}`);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(accept=>server.listen(0,'127.0.0.1',accept));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.portraitReady);
 await mkdir(output,{recursive:true});const entries=[];
 for(const sku of ['apricot-fox','cloud-bunny','mint-cat','cocoa-bear','starlight-penguin']){
  const model=await page.evaluate(sku=>window.renderPet(sku),sku),png=await page.locator('canvas').screenshot({omitBackground:true});
  await writeFile(resolve(output,`${sku}.png`),png);
  entries.push({...model,file:`${sku}.png`,width:size,height:size,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 const sourceSha256=createHash('sha256').update(await readFile(resolve(root,'characters','pet-models.js'))).digest('hex');
 await writeFile(resolve(output,'metadata.json'),JSON.stringify({version:2,source:'characters/pet-models.js',sourceSha256,kind:'runtime-model-studio-render',transparent:true,entries},null,2)+'\n');
 console.log(JSON.stringify(entries.map(({sku,bytes,triangles})=>({sku,bytes,triangles})),null,2));
}finally{await browser?.close();await new Promise(accept=>server.close(accept));}
