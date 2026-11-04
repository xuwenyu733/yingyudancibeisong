export function createSocialClient({fetcher=globalThis.fetch}={}){
 let identity=null;
 async function request(path,{method='GET',data,signal}={}){
  let response;try{response=await fetcher('/api/v1/social/'+path,{method,credentials:'same-origin',cache:'no-store',signal:signal||AbortSignal.timeout(10000),headers:{Accept:'application/json',...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});}catch{throw new Error('朋友连接暂时不可用，请稍后重试');}
  let value;try{value=await response.json();}catch{throw new Error('服务器暂时没有响应，请稍后再试');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('服务器返回的内容无法读取，请稍后重试');
  if(!response.ok||value.ok===false){const error=new Error(value.message||'操作没有完成');error.status=response.status;error.code=value.code;throw error;}
  if(value.identity)identity=value.identity;return value;
 }
 const post=(path,data)=>request(path,{method:'POST',data});
 return {request,post,get identity(){return identity;},enter:options=>request('enter',{...options,method:'POST',data:{}}),overview:()=>request('overview'),search:id=>request('search?'+new URLSearchParams({id})),messages:(peerId,after)=>request('messages?'+new URLSearchParams({peerId,...(after?{after}:{})})),send:(peerId,text,clientId)=>post('messages',{peerId,text,clientId}),visit:id=>request('visit?'+new URLSearchParams({id}))};
}
