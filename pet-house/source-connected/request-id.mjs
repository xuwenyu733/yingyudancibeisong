/** UUID v4 for request deduplication, including local HTTP and older WebViews. */
export function createRequestId(source=globalThis.crypto){
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw new Error('浏览器暂不支持安全随机编号，请用更新的浏览器重试');
 const bytes=new Uint8Array(16);source.getRandomValues(bytes);
 bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
