/** Ephemeral presence for the supported single-server deployment.
 * Invitations remain authoritative in MySQL. Presence never enters a save. */
export function createVisitPresence({now=Date.now,ttl=15000,retention=60000}={}){
 const sessions=new Map();
 function prune(){for(const [key,row]of sessions)if(now()-row.at>retention)sessions.delete(key);}
 return {
  update({guestKey,sessionId,sequence,active,...value}){
   prune();const key=guestKey+':'+sessionId,old=sessions.get(key);if(old&&old.sequence>=sequence)return false;
   if(!old&&sessions.size>=10000)throw Object.assign(Error('来访连接繁忙，请稍后再试'),{status:503});
   sessions.set(key,{...value,guestKey,sessionId,sequence,active,at:now()});return true;
  },
  list(hostKey){prune();const latest=new Map();for(const row of sessions.values())if(row.hostKey===hostKey&&row.active&&now()-row.at<ttl){const old=latest.get(row.guestKey);if(!old||row.at>old.at||row.at===old.at&&row.sequence>old.sequence)latest.set(row.guestKey,row);}return [...latest.values()].sort((a,b)=>b.at-a.at).slice(0,12);},
  removeInvitation(id){for(const row of sessions.values())if(row.id===id)row.active=false;},
 };
}
