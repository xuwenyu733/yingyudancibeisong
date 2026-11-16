// External script keeps registration compatible with script-src 'self'.
if('serviceWorker' in navigator){
 const register=()=>navigator.serviceWorker.register(new URL('./sw.js',import.meta.url)).catch(()=>{});
 if(document.readyState==='complete')void register();
 else window.addEventListener('load',register,{once:true});
}
