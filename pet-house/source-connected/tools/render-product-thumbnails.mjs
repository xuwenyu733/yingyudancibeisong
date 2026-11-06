/** Generate static studio images from the same furniture/surface factories used by the room. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {PRODUCT_PREVIEW_ITEMS} from '../product-previews.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(root,'assets/products/previews');
const {chromium}=await import(process.env.PET_ROOM_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PET_ROOM_PLAYWRIGHT_MODULE)).href:'playwright');
const html=`<!doctype html><html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}canvas{display:block;width:512px;height:384px}</style><script type="module">
import * as THREE from '/vendor/three/three.module.js';
import {GLTFLoader} from '/vendor/addons/loaders/GLTFLoader.js';
import {createShopFurniture} from '/scene-economy.js';
import {createFloorFinish,createWallHanging} from '/surface-models.mjs';
import {buildDecorItem} from '/decor.js';
import {PRODUCT_PREVIEW_INFO} from '/product-previews.mjs';
import {FURNITURE} from '/layout.js';
import {DEFAULT_ASSET_URLS} from '/assets.mjs';
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(512,384);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,.75,-.75,.01,100);
scene.add(new THREE.HemisphereLight(0xfff8ec,0x9daaa4,1.35));const key=new THREE.DirectionalLight(0xfff1d9,2.3);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.normalBias=.025;scene.add(key);const fill=new THREE.DirectionalLight(0xe4f1ff,.65);fill.position.set(4,2,-2);scene.add(fill);
const gradient=new THREE.DataTexture(new Uint8Array([145,190,225,255]),4,1,THREE.RedFormat);gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
const stage=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({opacity:.15}));stage.rotation.x=-Math.PI/2;stage.position.y=-.008;stage.receiveShadow=true;scene.add(stage);
let current=null,ownedMaterials=new Set(),ownedTextures=new Set();
function clear(){if(current){current.removeFromParent();const gs=new Set();current.traverse(n=>{if(n.isMesh)gs.add(n.geometry);});gs.forEach(g=>g.dispose());current=null;}ownedMaterials.forEach(m=>m.dispose());ownedMaterials.clear();ownedTextures.forEach(t=>t.dispose());ownedTextures.clear();}
window.renderProduct=async sku=>{
 clear();const item=PRODUCT_PREVIEW_INFO.get(sku),cache=new Map(),materials=color=>{if(!cache.has(color)){const m=new THREE.MeshToonMaterial({color,gradientMap:gradient});ownedMaterials.add(m);cache.set(color,m);}return cache.get(color);};
 let model,category=item.category;
 if(FURNITURE[sku]){const gltf=await new GLTFLoader().loadAsync(DEFAULT_ASSET_URLS[sku]);model=gltf.scene;model.scale.setScalar(FURNITURE[sku].scale);model.rotation.fromArray(FURNITURE[sku].rotation);model.traverse(n=>{if(!n.isMesh)return;const old=n.material;const m=new THREE.MeshToonMaterial({color:old.color,map:old.map,gradientMap:gradient,side:old.side});ownedMaterials.add(m);if(old.map)ownedTextures.add(old.map);old.dispose();n.material=m;});}
 else if(category==='flooring'&&sku!=='rug')model=createFloorFinish(sku,4.8,4.6,materials);
 else if(category==='wall'&&sku!=='wall-pictures')model=createWallHanging(sku,materials).root;
 else if(item.category==='furniture')model=createShopFurniture(sku,materials).root;
 else model=buildDecorItem(sku,scene,materials);
 if(!model)throw new Error('No model '+sku);current=model;model.position.set(0,0,0);scene.add(model);model.updateMatrixWorld(true);
 let bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());model.position.sub(center);model.position.y+=size.y/2;model.updateMatrixWorld(true);
 const target=new THREE.Vector3(0,size.y*.48,0),span=Math.max(size.x,size.y,size.z,.1);
 const direction=category==='wall'?new THREE.Vector3(.12,.04,1):category==='flooring'?new THREE.Vector3(1.5,2.0,2.6):sku==='front-fence'?new THREE.Vector3(2.8,1.1,1.9):new THREE.Vector3(1.6,1.05,2.7);
 direction.normalize();camera.position.copy(target).addScaledVector(direction,span*4+4);camera.lookAt(target);camera.updateMatrixWorld(true);
 bounds=new THREE.Box3().setFromObject(model);const projected=new THREE.Box3(),view=camera.matrixWorld.clone().invert();for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(view));const pc=projected.getCenter(new THREE.Vector3()),ps=projected.getSize(new THREE.Vector3()),halfY=Math.max(ps.y/2,ps.x/(2*(4/3)))*1.16;camera.left=pc.x-halfY*4/3;camera.right=pc.x+halfY*4/3;camera.top=pc.y+halfY;camera.bottom=pc.y-halfY;camera.updateProjectionMatrix();stage.visible=category!=='wall';
 model.traverse(n=>{if(n.isMesh){n.castShadow=category!=='flooring';n.receiveShadow=true;}});renderer.render(scene,camera);
 let triangles=0,meshes=0;model.traverse(n=>{if(n.isMesh){meshes++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;}});return {sku,category,triangles,meshes,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
};window.previewReady=true;
</script></html>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const file=resolve(root,`.${decodeURIComponent(new URL(req.url,'http://localhost').pathname)}`);if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(accept=>server.listen(0,'127.0.0.1',accept));let browser;
try{browser=await chromium.launch({headless:true,...(process.env.PET_ROOM_CHROMIUM_EXECUTABLE?{executablePath:process.env.PET_ROOM_CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader']});const page=await browser.newPage({viewport:{width:512,height:384},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.previewReady);await mkdir(output,{recursive:true});const entries=[];
 for(const item of PRODUCT_PREVIEW_ITEMS){const model=await page.evaluate(sku=>window.renderProduct(sku),item.sku),png=await page.locator('canvas').screenshot({omitBackground:true});await writeFile(resolve(output,`${item.sku}.png`),png);entries.push({...model,name:item.name,file:`${item.sku}.png`,width:512,height:384,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')});}
 if(errors.length)throw new Error(errors.join('\n'));const sourceFiles=['scene-economy.js','surface-models.mjs','decor.js','layout.js','surface-catalog.mjs','product-previews.mjs'],sources=[];for(const file of sourceFiles)sources.push({file,sha256:createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')});await writeFile(resolve(output,'metadata.json'),JSON.stringify({version:1,kind:'runtime-product-studio-render',transparent:true,sources,entries},null,2)+'\n');console.log(JSON.stringify({rendered:entries.length,bytes:entries.reduce((sum,e)=>sum+e.bytes,0),largest:entries.reduce((a,e)=>e.triangles>a.triangles?e:a)}));
}finally{await browser?.close();await new Promise(accept=>server.close(accept));}
