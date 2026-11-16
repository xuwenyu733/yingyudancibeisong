const busy=(message,retryAfter=1)=>Object.assign(new Error(message),{status:429,code:'RATE_LIMIT',retryAfter});
/** In-process limits complement the supported single-instance reverse proxy. */
export function createRequestAdmission({now=Date.now,maxKeys=20000}={}){
 const windows=new Map(),active=new Map();
 function rate(key,max,windowMs=60000){
  const time=now();let bucket=windows.get(key);
  if(!bucket||bucket.until<=time){
   if(windows.size>=maxKeys){for(const [id,row]of windows)if(row.until<=time)windows.delete(id);if(windows.size>=maxKeys&&!windows.has(key))throw busy('请求繁忙，请稍后重试');}
   bucket={count:0,until:time+windowMs};windows.set(key,bucket);
  }
  if(++bucket.count>max)throw busy('操作太频繁，请稍后重试',Math.max(1,Math.ceil((bucket.until-time)/1000)));
 }
 function enter(key,{max=120,windowMs=60000,concurrency=4}={}){
  rate(key,max,windowMs);const count=active.get(key)||0;if(count>=concurrency)throw busy('还有操作正在处理，请稍后重试');active.set(key,count+1);let released=false;
  return ()=>{if(released)return;released=true;const remaining=(active.get(key)||1)-1;if(remaining)active.set(key,remaining);else active.delete(key);};
 }
 return {rate,enter};
}

export function requestAddress(req,{trustProxy=false}={}){
 const forwarded=trustProxy?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';
 return (forwarded||req.socket?.remoteAddress||'unknown').slice(0,128);
}
