export const ACTIVITY_CHOICES=Object.freeze({
 read:[
  {id:'forest',name:'森林邮局',color:'#83a58e',pages:['小松鼠捡到一片写着名字的叶子。','它沿着小溪，把叶子送到朋友的树屋。','原来那是一封邀请：一起喝杯茶吧。']},
  {id:'stars',name:'星星修理铺',color:'#8d9cbe',pages:['一颗小星星觉得自己的光有些暗。','修理师擦掉尘埃，发现它一直在发光。','今晚，它照亮了回家的那条路。']},
  {id:'ocean',name:'贝壳里的海',color:'#75afad',pages:['小伙伴把一枚空贝壳放在耳边。','沙沙声像潮水，也像朋友轻轻说话。','它把贝壳留在窗边，等下一次海风。']}
 ],
 tea:[{id:'garden',name:'花园茶会',color:'#8dac87',recipe:'tea',line:'薄荷的清香，配一会儿安静的陪伴。'},
  {id:'berry',name:'莓果午后',color:'#c88d97',recipe:'juice',line:'莓果色的小杯子，装下今天的好心情。'},
  {id:'picnic',name:'饼干野餐',color:'#d3af78',recipe:'cookies',line:'把点心摆整齐，一起想个周末的小故事。'}]
});
export function activityChoice(kind,id){const rows=ACTIVITY_CHOICES[kind];return rows?.find(x=>x.id===id)||rows?.[0]||null;}
