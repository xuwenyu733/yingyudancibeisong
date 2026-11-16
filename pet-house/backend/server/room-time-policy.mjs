// Statistics only: there is no daily allowance, mandatory break, or timed lockout.
export const ROOM_TIME_POLICY=Object.freeze({leaseMs:15_000});
const DAY=86_400_000;
// Preserve the historical Beijing 08:00 reporting boundary; it no longer unlocks access.
export function roomDay(now){const start=Math.floor(now/DAY)*DAY;return {key:new Date(start).toISOString().slice(0,10),start,end:start+DAY};}
export function settleRoomTime(state,leases,now){
 const out={...state,continuous:0,restUntil:0},day=roomDay(now),segments=[];
 for(const lease of leases){const from=Math.max(Number(lease.from),Number(out.settled),day.start),to=Math.min(Number(lease.until),now,day.end);if(to>from)segments.push([from,to]);}
 segments.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const segment of segments){const last=merged.at(-1);if(last&&segment[0]<=last[1])last[1]=Math.max(last[1],segment[1]);else merged.push([...segment]);}
 for(const [from,to] of merged){out.used+=to-from;out.lastActive=to;}
 out.settled=Math.max(Number(out.settled),now);return out;
}
export function roomTimeStatus(state,now){
 const day=roomDay(now);
 return {ok:true,allowed:true,limitsEnabled:false,reason:null,serverNow:now,period:day.key,periodEndsAt:day.end,usedMs:state.used,limitMs:null,remainingMs:null,continuousRemainingMs:null,restUntil:0,nextAllowedAt:now};
}
