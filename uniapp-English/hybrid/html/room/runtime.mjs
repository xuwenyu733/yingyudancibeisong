/** 无DOM副作用的运行参数与资源管理，可在Node中单独验证。 */
export function resolveQuality(request='auto',environment={}) {
  if(!['auto','low','balanced','high'].includes(request))throw new TypeError('未知画质档位');
  const profile=request==='auto'?(environment.coarsePointer||environment.deviceMemory<=4?'low':'balanced'):request;
  const profiles={low:{maxPixelRatio:1.25,shadowSize:512,maxFPS:30},balanced:{maxPixelRatio:1.5,shadowSize:1024,maxFPS:60},high:{maxPixelRatio:2,shadowSize:2048,maxFPS:60}};
  return Object.freeze({profile,...profiles[profile]});
}
/** canvas 可能属于另一个 iframe；默认存储必须来自它的窗口。 */
export function resolveRoomStorage(explicit,ownerWindow){
  if(explicit!==undefined)return explicit;
  try{
    const storage=ownerWindow.localStorage;
    if(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function')return storage;
  }catch{/* 无权限的 iframe 应显示存储错误，不借用外层账户存储。 */}
  const unavailable=()=>{throw new Error('当前页面不能访问本地存储，请传入同步 storageAdapter');};
  return {getItem:unavailable,setItem:unavailable};
}
export function resolveAssetURL(filename,baseURL) {
  if(typeof filename!=='string'||!filename||filename.includes('..')||filename.startsWith('/')||filename.includes(':'))throw new TypeError('资源名必须为目录内的相对路径');
  const base=new URL(baseURL);
  if(!base.pathname.endsWith('/'))base.pathname+='/';
  return new URL(filename,base).href;
}
export function createDisposer() {
  const released=new WeakSet(),errors=[];
  const once=resource=>{if(resource&&typeof resource.dispose==='function'&&!released.has(resource)){released.add(resource);try{resource.dispose();}catch(error){errors.push(error);}}};
  return {release:once,errors,tree(root){
    root?.traverse(object=>{
      once(object.geometry);
      for(const material of (Array.isArray(object.material)?object.material:[object.material]))if(material){
        for(const value of Object.values(material))if(value?.isTexture)once(value);
        once(material);
      }
      once(object.shadow?.map);once(object.shadow?.mapPass);
    });
  }};
}
export function roomError(code,message,cause) {
  const error=new Error(message,{cause});error.code=code;return error;
}
