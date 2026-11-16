export const REQUEST_WINDOW_MS=5*60*1000;
export function requestWindow(input,now,{legacy=false}={}){
 const id=input.requestId;
 if(typeof id!=='string'||!/^[a-zA-Z0-9:_-]{1,64}$/.test(id))throw Object.assign(new Error('操作编号无效'),{status:400});
 if(legacy&&input.issuedAt===undefined)return null;
 const time=input.issuedAt;
 if(!Number.isSafeInteger(time)||id.split('_')[0]!==time.toString(36)||time>now+30000||time<now-REQUEST_WINDOW_MS)throw Object.assign(new Error('操作已过期，请刷新后重新确认；过期请求不会重复扣款或发奖'),{status:409,code:'REQUEST_EXPIRED'});
 return time;
}
