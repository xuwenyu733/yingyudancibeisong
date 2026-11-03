/** Acquisition timestamps are stored facts: this module never substitutes the viewing time. */
function calendarDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split('-').map(Number),date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?{year,month,day}:null;
}
const dayText=parts=>`${parts.year}年${Number(parts.month)}月${Number(parts.day)}日`;

export function formatAcquisitionTime(value,{timeZone}={}){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!calendarDate(value.slice(0,10)))return null;
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  try{
    const options={year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'};if(timeZone)options.timeZone=timeZone;
    const parts=Object.fromEntries(new Intl.DateTimeFormat('zh-CN',options).formatToParts(date).map(part=>[part.type,part.value]));
    return `${dayText(parts)} ${parts.hour}:${parts.minute}:${parts.second}`;
  }catch{return null;}
}

export function acquisitionCaption(record={},options={}){
  if(record?.owned===false||record?.unlocked===false)return '尚未解锁';
  const timestamp=formatAcquisitionTime(record?.acquiredAt,options);
  if(timestamp)return `获得时间：${timestamp}`;
  const date=calendarDate(record?.unlockedAt)||calendarDate(record?.acquiredAt);
  if(date)return `获得日期：${dayText(date)}（具体时间未记录）`;
  return '获得时间未记录';
}
