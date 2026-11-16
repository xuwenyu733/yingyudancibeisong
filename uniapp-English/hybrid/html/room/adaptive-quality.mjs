/** Sample only active frames. Slow rendering lowers resolution; sustained headroom restores it. */
export function applySceneQuality({renderer,light,scene,next}){
 const shadowChanged=renderer.shadowMap.enabled!==next.shadows;
 renderer.shadowMap.enabled=next.shadows;light.shadow.mapSize.set(next.shadowSize,next.shadowSize);light.shadow.map?.dispose();light.shadow.map=null;
 // Toon programs compiled with shadows must be rebuilt when the feature changes.
 // Otherwise some drivers keep the old shadow sampler after its target is freed.
 if(shadowChanged)scene.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[])material.needsUpdate=true;});
}
export function createAdaptiveQuality({enabled=true,pixelRatio=1.5,shadowSize=1024,maxFPS=60,onChange=()=>{}}={}){
 let level=0,slow=0,fast=0,lastChange=-Infinity,started=null;
 const settings=()=>({level,maxPixelRatio:Math.max(.65,pixelRatio*[1,.78,.58][level]),shadowSize:Math.min(shadowSize,[shadowSize,512,256][level]),shadows:level<2});
 function sample({now,interval,cost=0,active=true}){
  if(!enabled||!active||!Number.isFinite(now)||!Number.isFinite(interval)||interval<=0||interval>250){slow=fast=0;started=null;return;}
  if(started===null)started=now;if(now-started<2000)return;
  const budget=1000/maxFPS,dt=Math.min(interval,100),over=interval>budget*1.45||cost>budget*.85,under=interval<budget*1.18&&cost<budget*.55;
  slow=over?slow+dt:0;fast=under?fast+dt:0;
  if(now-lastChange<10000)return;
  const next=slow>=3000?Math.min(2,level+1):fast>=15000?Math.max(0,level-1):level;
  if(next!==level){level=next;slow=fast=0;lastChange=now;onChange(settings());}
 }
 return {sample,getState:settings,reset(){slow=fast=0;started=null;}};
}
