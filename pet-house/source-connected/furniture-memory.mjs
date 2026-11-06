/** Calendar days, rather than 24-hour chunks, keep a birthday purchase readable across DST. */
export function furnitureMemoryAge(memory,{now=new Date(),timeZone}={}){
  if(typeof memory?.at!=='string'||!memory.at.trim())return {acquiredAt:null,acquiredDate:null,daysHeld:null,elapsedDays:null};
  const acquired=new Date(memory.at);if(!Number.isFinite(acquired.getTime())||!Number.isFinite(now.getTime()))return {acquiredAt:null,acquiredDate:null,daysHeld:null,elapsedDays:null};
  const parts=date=>{if(timeZone){try{const fields=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(item=>[item.type,item.value]));return [Number(fields.year),Number(fields.month),Number(fields.day)];}catch{}}
    return [date.getFullYear(),date.getMonth()+1,date.getDate()];};
  const start=parts(acquired),today=parts(now),elapsedDays=Math.max(0,Math.floor((Date.UTC(...[today[0],today[1]-1,today[2]])-Date.UTC(...[start[0],start[1]-1,start[2]]))/86400000));
  return {acquiredAt:acquired.toISOString(),acquiredDate:`${start[0]}-${String(start[1]).padStart(2,'0')}-${String(start[2]).padStart(2,'0')}`,daysHeld:elapsedDays+1,elapsedDays};
}
