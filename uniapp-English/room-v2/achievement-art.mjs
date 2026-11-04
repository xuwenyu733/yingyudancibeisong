const NS='http://www.w3.org/2000/svg';
const namespace=globalThis.crypto?.randomUUID?.().replaceAll('-','').slice(0,12)||Math.random().toString(16).slice(2,14);
let serial=0;

/** Achievement collectibles are objects with their own silhouette, never level medals. */
export const ACHIEVEMENT_DESIGNS=Object.freeze({
  'first-checkin':Object.freeze({male:'启程明灯',female:'晨露花灯',motif:'lantern'}),
  'streak-3':Object.freeze({male:'三日烈焰',female:'三日铃兰',motif:'flame-chime'}),
  'streak-7':Object.freeze({male:'逐日远峰',female:'一周花绣',motif:'mountain-embroidery'}),
  'streak-14':Object.freeze({male:'疾风远航',female:'双蝶花境',motif:'airship-butterfly'}),
  'streak-30':Object.freeze({male:'月轨守望',female:'月下紫藤',motif:'observatory-wisteria'}),
  'checkin-7':Object.freeze({male:'七星行图',female:'七日花笺',motif:'map-journal'}),
  'checkin-30':Object.freeze({male:'碧海航迹',female:'天鹅轻舟',motif:'galleon-swan'}),
  'checkin-100':Object.freeze({male:'百日星仪',female:'百日星苑',motif:'orrery-terrarium'}),
  'study-1h':Object.freeze({male:'时光砂漏',female:'茶香书时',motif:'hourglass-tea'}),
  'study-10h':Object.freeze({male:'知识引擎',female:'羽墨琉璃',motif:'book-inkwell'}),
  'study-50h':Object.freeze({male:'群星瞭望',female:'星语诗卷',motif:'telescope-poetry'}),
  'level-3':Object.freeze({male:'学宫之钥',female:'花笺之钥',motif:'academy-key'}),
  'level-5':Object.freeze({male:'墨羽学士',female:'玉兰书信',motif:'quill-scroll'}),
  'level-10':Object.freeze({male:'苍穹书塔',female:'流光书阁',motif:'knowledge-tower'}),
  'first-purchase':Object.freeze({male:'匠心初作',female:'花椅初遇',motif:'designer-chair'}),
  'expand-1':Object.freeze({male:'筑梦蓝图',female:'蔷薇小筑',motif:'architect-cottage'}),
  'collector':Object.freeze({male:'四珍陈列',female:'珠光珍匣',motif:'display-jewelbox'}),
  'spend-500':Object.freeze({male:'鎏金商衡',female:'金穗绮囊',motif:'balance-purse'}),
  'expand-2':Object.freeze({male:'天空工坊',female:'水晶花房',motif:'villa-conservatory'}),
});
const genderOf=gender=>gender==='female'?'female':gender==='male'?'male':'none';
export function achievementTitle(badge,gender='none'){
  const id=typeof badge==='string'?badge:badge?.id,design=ACHIEVEMENT_DESIGNS[id];
  return design?.[genderOf(gender)]||(typeof badge==='object'&&badge?.name)||id||'成长成就';
}

export function createAchievementEmblem(parent,badge,gender='none'){
  const doc=parent.ownerDocument,id=typeof badge==='string'?badge:badge?.id||'unknown',chosen=genderOf(gender),female=chosen==='female';
  const svg=doc.createElementNS(NS,'svg'),uid=`pet-achievement-${namespace}-${++serial}`;
  svg.setAttribute('viewBox','0 0 120 132');svg.setAttribute('aria-hidden','true');
  svg.dataset.kind='achievement';svg.dataset.achievementId=id;svg.dataset.gender=chosen;svg.dataset.design=`${id}:${chosen}:${ACHIEVEMENT_DESIGNS[id]?.motif||'keepsake'}`;
  const add=(tag,attrs={},to=svg)=>{const n=doc.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));to.append(n);return n;};
  add('title').textContent=`${achievementTitle(badge,chosen)} · ${typeof badge==='object'?badge?.description||'成长成就':'成长成就'}`;
  const palettes={male:['#243e55','#426b82','#9fc7d0','#d0a04f','#f4dfaa','#f5f2de','#bd704b'],female:['#6d536d','#a47b9a','#d7c4e1','#c29c55','#f6e5bd','#fcf5e8','#95bcb2'],none:['#465a57','#718d7b','#bfd3bf','#b59b63','#ece1bd','#f6f4e4','#aa8270']};
  const [ink,color,pale,gold,light,paper,accent]=palettes[chosen];
  const defs=add('defs');
  function grad(name,colors,x2='90%',y2='100%'){const g=add('linearGradient',{id:`${uid}-${name}`,x1:'10%',y1:'0%',x2,y2},defs);colors.forEach((c,i)=>add('stop',{offset:`${100*i/(colors.length-1)}%`,'stop-color':c},g));return `url(#${uid}-${name})`;}
  const metal=grad('metal',[paper,light,gold,light,gold]),enamel=grad('enamel',[pale,color,ink]),glass=grad('glass',[paper,pale,accent]),rose=grad('rose',[paper,pale,color]),warm=grad('warm',['#fff1b0','#edb656','#bd704b']);
  const path=(d,fill='none',stroke=ink,width=1.2,extra={})=>add('path',{d,fill,stroke,'stroke-width':width,'stroke-linejoin':'round','stroke-linecap':'round',...extra});
  const rect=(x,y,w,h,fill,rx=2,stroke=ink,width=1)=>add('rect',{x,y,width:w,height:h,rx,fill,stroke,'stroke-width':width});
  const oval=(cx,cy,rx,ry,fill,stroke='none',width=1)=>add('ellipse',{cx,cy,rx,ry,fill,stroke,'stroke-width':width});
  const circle=(cx,cy,r,fill,stroke='none',width=1)=>add('circle',{cx,cy,r,fill,stroke,'stroke-width':width});
  function star(x,y,r,fill=metal,points=4,inner=.32){const p=Array.from({length:points*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/points,rr=i%2?r*inner:r;return `${x+Math.cos(a)*rr},${y+Math.sin(a)*rr}`;}).join(' ');return add('polygon',{points:p,fill,stroke:gold,'stroke-width':.55,'stroke-linejoin':'round'});}
  function gem(x,y,w=9,h=13,fill=glass){path(`M${x} ${y-h/2} ${x+w/2} ${y-h*.2} ${x+w*.36} ${y+h*.34} ${x} ${y+h/2} ${x-w*.36} ${y+h*.34} ${x-w/2} ${y-h*.2}Z`,fill,gold,.7);path(`M${x-w/2} ${y-h*.2}H${x+w/2}M${x} ${y-h/2} ${x-w*.18} ${y+h*.34} ${x} ${y+h/2} ${x+w*.18} ${y+h*.34}Z`,'none',paper,.7);}
  function leaf(x,y,size=8,angle=0,fill=accent){return path(`M${x} ${y}Q${x-size*.85} ${y-size*.75} ${x} ${y-size*1.65}Q${x+size*.85} ${y-size*.75} ${x} ${y}Z`,fill,gold,.55,{transform:`rotate(${angle} ${x} ${y})`});}
  function flower(x,y,r=8,fill=pale,petals=5){for(let i=0;i<petals;i++)add('ellipse',{cx:x,cy:y-r*.55,rx:r*.3,ry:r*.59,fill,stroke:paper,'stroke-width':.55,transform:`rotate(${360*i/petals} ${x} ${y})`});circle(x,y,r*.22,metal,gold,.6);}
  function pearl(x,y,r=1.8){circle(x,y,r,paper,gold,.55);circle(x-r*.27,y-r*.27,r*.25,'#fff');}
  function book(x,y,w=60,h=35,fill=paper){path(`M${x} ${y+3}Q${x+w*.25} ${y-6} ${x+w/2} ${y+3}Q${x+w*.75} ${y-6} ${x+w} ${y+3}V${y+h}Q${x+w*.75} ${y+h-8} ${x+w/2} ${y+h}Q${x+w*.25} ${y+h-8} ${x} ${y+h}Z`,fill,ink,1.3);path(`M${x+w/2} ${y+3}V${y+h}`,'none',gold,1.4);for(let i=0;i<3;i++){const yy=y+11+i*6;path(`M${x+6} ${yy}q${w*.15} -3 ${w*.31} 0M${x+w*.6} ${yy}q${w*.15} -3 ${w*.31} 0`,'none',color,.75);}}
  function quill(x,y,angle=0){path(`M${x} ${y}Q${x+11} ${y-39} ${x+34} ${y-52}Q${x+37} ${y-28} ${x+18} ${y-13}Z`,female?rose:glass,gold,.9,{transform:`rotate(${angle} ${x} ${y})`});path(`M${x} ${y} ${x+27} ${y-42}M${x+10} ${y-16} ${x+24} ${y-19}M${x+17} ${y-28} ${x+30} ${y-30}`,'none',paper,1,{transform:`rotate(${angle} ${x} ${y})`});}
  function waves(y,width=82){for(let i=0;i<3;i++)path(`M${60-width/2+i*5} ${y+i*5}q9 -4 18 0t18 0t18 0t18 0`,'none',i===1?gold:color,i===1?.8:1.4);}
  function butterfly(x,y,s=1,fill=rose){const g=add('g',{transform:`translate(${x} ${y}) scale(${s})`});add('path',{d:'M0 1C-19-27-31-20-25-3-21 8-10 10 0 2C19-27 31-20 25-3 21 8 10 10 0 2M0 2C-22 2-20 22-8 15L0 5C22 2 20 22 8 15L0 5',fill,stroke:gold,'stroke-width':1.1},g);add('path',{d:'M0 9V-7M0-6-4-12M0-6 4-12',fill:'none',stroke:ink,'stroke-width':1.3,'stroke-linecap':'round'},g);for(const side of [-1,1])add('path',{d:`M${side*4} 0 ${side*18} -11M${side*4} 5 ${side*11} 11`,fill:'none',stroke:paper,'stroke-width':1},g);}
  oval(60,121,35,3.3,ink,'none').setAttribute('opacity','.09');

  if(id==='first-checkin'){
    if(!female){
      path('M43 32Q42 12 60 12T77 32','none',metal,5);path('M37 42 45 29H75L83 42Z',enamel,ink,1.3);
      path('M38 44 34 104 60 116 86 104 82 44Z',glass,ink,1.8);path('M46 46 44 100 60 107 76 100 74 46',paper,gold,1.2);
      path('M59 58C42 77 46 86 59 91 76 87 76 73 65 65 66 78 59 79 59 58Z',warm,gold,.8);
      path('M38 44 43 104M82 44 77 104M60 44v9M35 104l25 12 25-12',metal,ink,2.4);rect(43,109,34,6,metal,2);star(60,35,4,light);
    }else{
      path('M40 39Q39 16 60 16T80 39','none',metal,2.4);path('M36 39Q60 30 84 39L80 107Q60 119 40 107Z',glass,gold,1.2);
      path('M41 44Q60 36 79 44L76 104Q60 111 44 104Z',paper,accent,.8);path('M60 99V58M60 81Q43 76 45 65M60 74Q76 70 76 59','none',accent,2);
      leaf(59,84,7,-45);leaf(61,80,7,45);flower(59,56,13,pale,6);circle(60,56,4,metal);rect(51,94,18,10,light,3,gold,.6);path('M60 91Q55 87 60 81Q65 87 60 91Z',warm,gold,.5);
      for(const [x,y]of [[41,42],[79,42],[43,105],[77,105]])pearl(x,y,2);path('M39 109Q60 120 81 109','none',metal,3);star(88,27,4.5,metal);
    }
  }else if(id==='streak-3'){
    if(!female){
      path('M30 104 82 118 89 110 39 97Z',enamel,ink,1.4);path('M34 115 88 101 82 94 29 108Z',metal,ink,1.2);path('M60 18C63 40 85 41 86 65 87 88 77 101 60 105 41 102 29 86 35 69 37 61 44 53 43 40 53 45 48 62 55 66 68 51 56 43 60 18Z',warm,ink,1.2);
      path('M60 58C50 74 44 79 51 91 58 101 72 91 69 81 64 73 61 72 60 58Z',light,gold,.9);for(const [x,y]of [[28,48],[88,39],[76,19]])gem(x,y,4,7,warm);
      path('M31 113 43 110M75 112 85 109','none',paper,1);star(91,74,4,metal);
    }else{
      path('M25 30Q60 14 95 30M60 23v79','none',metal,2.2);path('M30 28v36M60 23v29M90 28v39','none',gold,1.1);
      for(const [x,y,size]of [[30,68,13],[60,56,16],[90,71,12]]){path(`M${x-size*.65} ${y+5}Q${x-size*.75} ${y-size} ${x} ${y-size}Q${x+size*.75} ${y-size} ${x+size*.65} ${y+5}Q${x} ${y-1} ${x-size*.65} ${y+5}Z`,rose,gold,1);pearl(x,y+6,2.1);path(`M${x} ${y+10}v14`,'none',gold,.8);gem(x,y+27,5,8,glass);}
      for(const [x,y,a]of [[37,25,-40],[49,20,-30],[73,20,30],[84,25,40]])leaf(x,y,6,a);flower(60,23,6,accent);path('M52 103Q60 110 68 103','none',metal,2);gem(60,113,8,13,rose);
    }
  }else if(id==='streak-7'){
    if(!female){
      circle(78,34,17,metal,gold,.8);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;path(`M${78+Math.cos(a)*21} ${34+Math.sin(a)*21}l${Math.cos(a)*5} ${Math.sin(a)*5}`,'none',gold,1.2);}
      path('M13 108 43 48 58 76 72 56 109 108Z',enamel,ink,1.4);path('M43 48 31 76 42 71 50 80 52 66ZM72 56 62 76 72 72 84 81Z',paper,gold,.6);path('M26 107 46 87 66 101 80 91 99 108',pale,ink,1.1);
      path('M43 48V17M44 18 65 23 44 31','none',gold,2.2);path('M45 18 64 23 45 30Z',accent,gold,.6);path('M25 115h73','none',metal,3);star(21,42,4,metal);
    }else{
      circle(60,63,43,metal,gold,1.2);circle(60,63,38,paper,color,.9);rect(54,14,12,12,metal,2);rect(58,9,4,9,gold,1);path('M38 88Q61 70 75 37M55 85Q76 86 84 72','none',accent,1.8);
      for(let i=0;i<7;i++){const a=-Math.PI*.85+i*.75,x=60+Math.cos(a)*24,y=64+Math.sin(a)*24;flower(x,y,7.2,i%2?pale:'#efc4b6',5);}
      for(const [x,y,a]of [[42,86,-50],[57,75,-45],[72,53,40]])leaf(x,y,7,a);path('M25 69Q23 43 40 32','none',paper,2.4);path('M84 98 98 115 91 118 76 102Z',rose,gold,.8);gem(95,113,5,7,glass);
    }
  }else if(id==='streak-14'){
    if(!female){
      path('M14 53Q24 22 67 23 94 23 108 45L98 65Q52 80 14 53Z',enamel,ink,1.5);path('M14 53Q49 38 108 45M32 34Q39 53 29 61M60 25Q69 46 63 69M88 29Q94 47 87 68','none',metal,1.5);
      path('M23 41Q55 21 84 31','none',paper,1.4);path('M29 65 43 89M84 71 72 89','none',gold,1.3);path('M40 88H77L70 104H47Z',metal,ink,1.2);rect(47,92,23,5,paper,1,color,.7);path('M95 46 108 34 111 51 101 59Z',metal,ink,.9);star(25,87,5,metal);path('M19 113h53M10 104h21M82 95h21','none',pale,1.4);
    }else{
      path('M22 112V61Q22 17 60 17T98 61v51','none',metal,4);path('M30 112V61Q30 26 60 26T90 61v51','none',accent,1.1);
      for(const [x,y,a]of [[25,71,-35],[29,53,-40],[39,35,-35],[77,31,30],[90,51,35],[95,80,40]])leaf(x,y,7,a);flower(27,84,7,pale);flower(92,66,8,'#efc4b6');butterfly(45,63,.72,rose);butterfly(76,83,.6,glass);
      rect(15,111,90,6,metal,2,gold,.8);for(const [x,y]of [[39,104],[78,109],[59,35]])pearl(x,y,2);star(103,35,4,metal);
    }
  }else if(id==='streak-30'){
    if(!female){
      path('M28 68V52a32 32 0 0 1 64 0v16Z',enamel,ink,1.5);path('M29 52Q60 40 91 52M60 21v44','none',metal,1.3);path('M62 24Q82 38 79 65','none',pale,1.5);rect(25,65,70,9,metal,2);path('M33 75H87V112H33Z',enamel,ink,1.2);
      for(const x of [42,60,78])path(`M${x-4} 98V82a4 4 0 0 1 8 0v16Z`,glass,gold,.8);rect(26,111,68,8,metal,2);path('M23 53 13 44 27 38Z',metal,ink,.8);path('M60 21V11M56 11h8','none',gold,1.6);path('M91 14A14 14 0 1 0 106 30 15 15 0 0 1 91 14Z',metal,gold,.6);star(104,47,4,paper);
    }else{
      path('M85 18A32 32 0 1 0 100 66 34 34 0 0 1 85 18Z',metal,gold,1.1);path('M24 51Q56 34 91 54M38 47Q45 75 37 108M56 43v73M76 48Q83 80 76 110','none',accent,1.7);
      for(const [x,y,n]of [[37,63,6],[55,58,8],[76,67,6]])for(let i=0;i<n;i++){const yy=y+i*6,w=(n-i)*.8+1;oval(x+(i%2?2:-2),yy,w,3.5,i%2?rose:pale,gold,.25);}
      for(const [x,y,a]of [[33,49,-48],[46,45,-42],[67,44,45],[87,52,50]])leaf(x,y,8,a);gem(55,117,7,11,glass);star(99,20,4.5,metal);star(20,88,3.4,metal);
    }
  }else if(id==='checkin-7'){
    if(!female){
      path('M15 35 44 25 76 35 105 25V101L76 112 44 102 15 112Z',metal,ink,1.3);path('M19 39 44 31 76 41 101 32V97L76 106 44 96 19 106Z',enamel,gold,.8);path('M44 31v65M76 41v65','none',pale,1);path('M26 88Q24 58 51 72 82 89 88 49','none',paper,1.4,{'stroke-dasharray':'3 3'});
      for(const [x,y,r]of [[28,47,3],[37,62,2.7],[48,53,3.4],[62,72,3],[78,85,2.6],[88,50,4],[90,98,2.5]])star(x,y,r,metal);path('M25 91 29 102 21 100Z',accent,gold,.6);gem(96,28,7,10,glass);
    }else{
      path('M25 29 88 20 99 100 36 113Z',rose,gold,1.2);path('M21 25 82 18 93 99 32 108Z',paper,color,1.2);path('M31 25 41 101','none',gold,1.4);path('M34 30 79 25 87 92 42 99Z',glass,accent,.5);path('M52 87Q70 66 69 41M60 76 47 61M66 58l14-12','none',accent,1.3);
      for(const [x,y]of [[65,44],[49,60],[76,55],[57,72],[70,77],[49,85],[78,87]])flower(x,y,5.5,x<60?pale:'#efc9bf',5);path('M83 19 98 12 94 34 87 31Z',metal,gold,.8);for(const y of [37,53,69,85])pearl(30+(y-37)*.12,y,1.8);
    }
  }else if(id==='checkin-30'){
    if(!female){
      path('M18 88 106 88 91 107H36Z',enamel,ink,1.5);path('M27 92H97M35 102h54','none',metal,1.3);path('M56 86V22M82 85V37','none',gold,2.3);path('M52 29 28 75H52ZM61 29V75H87Z',paper,gold,1);path('M86 42 103 73H86Z',glass,ink,.9);path('M57 21 76 25 57 33Z',accent,gold,.7);
      for(const x of [42,56,70,84])circle(x,97,2.2,metal,ink,.5);waves(114,86);star(22,28,4,metal);path('M52 37 23 85M82 47 105 86','none',pale,.9);
    }else{
      path('M21 91Q32 76 60 82 80 69 88 58 83 47 84 37 85 28 93 32 102 38 97 46 94 51 92 56 107 78 95 94 77 106 41 107 21 91Z',paper,gold,1.2);path('M87 39Q91 35 95 41L91 45Z',metal,ink,.5);circle(91,37,1.2,ink);path('M34 89Q52 58 77 68 78 87 59 97 45 98 34 89Z',rose,gold,1.1);path('M43 88 63 75M49 94 70 80','none',paper,1.2);
      flower(34,91,7,pale);path('M30 93Q45 105 67 102','none',metal,1.2);for(const [x,y]of [[41,99],[51,101],[61,101]])pearl(x,y,1.5);waves(114,85);star(29,53,4,metal);
    }
  }else if(id==='checkin-100'){
    if(!female){
      oval(60,57,35,20,'none',metal,2).setAttribute('transform','rotate(-29 60 57)');oval(60,57,34,18,'none',color,1.4).setAttribute('transform','rotate(38 60 57)');circle(60,57,18,enamel,gold,1);path('M60 39v36M43 52q17-8 34 0M44 63q16 7 32 0','none',pale,.7);path('M29 73 60 40 92 73','none',gold,1.2);
      circle(26,54,5,metal,ink,.7);circle(86,34,4,accent,gold,.7);circle(88,76,6,glass,ink,.6);path('M60 78v25M49 86h22','none',metal,5);path('M43 107 60 99 77 107V116H43Z',enamel,ink,1.3);rect(37,114,46,5,metal,2);star(41,19,4,metal);star(99,26,3,paper);
    }else{
      path('M25 102V51L60 16 95 51v51L60 119Z',glass,gold,1.4);path('M25 51 60 61 95 51M60 16v103M25 102 60 87 95 102','none',paper,1.1);path('M30 100V54L60 25 90 54V100L60 112Z','none',accent,.8);path('M40 98 48 70 58 90 72 55 84 99Z',rose,gold,.8);for(const [x,y]of [[48,71],[72,56],[59,92]])gem(x,y,7,12,glass);
      path('M35 103Q55 93 85 104','none',accent,2);for(const [x,y,a]of [[40,105,-30],[53,103,-10],[78,106,35]])leaf(x,y,6,a);star(45,49,5,metal);star(76,40,3,metal);pearl(60,17,3);path('M60 10V6','none',gold,1.4);
    }
  }else if(id==='study-1h'){
    if(!female){
      rect(31,24,58,8,metal,3);rect(31,107,58,8,metal,3);path('M40 33Q41 59 55 68 41 79 40 106H80Q79 79 65 68 79 59 80 33Z',glass,ink,1.1);path('M43 45Q60 49 77 45 75 60 61 67 60 76 74 98H46L59 72 59 66Q46 59 43 45Z',warm,gold,.7);path('M37 34v72M83 34v72','none',enamel,4);path('M46 36v8M45 80l-1 14','none',paper,1.6);star(91,52,4,metal);gem(60,17,7,10,glass);
    }else{
      book(18,93,68,24,rose);path('M35 68H87Q88 94 62 97 36 94 35 68Z',paper,gold,1.2);path('M86 72Q109 69 98 84 91 93 83 86','none',metal,3);oval(61,69,26,7,glass,gold,.8);oval(61,70,20,4.7,'#c79b70',gold,.5);path('M48 59Q40 51 49 43T49 29M64 57Q57 46 67 36M77 57Q84 48 78 40','none',pale,1.8);
      flower(61,83,7,pale);oval(61,98,36,4,metal,gold,.8);path('M97 101 105 116','none',gold,2);oval(100,105,3.3,5,metal);star(27,38,4,metal);
    }
  }else if(id==='study-10h'){
    if(!female){
      for(let i=0;i<12;i++){const a=i*Math.PI/6;path(`M${60+Math.cos(a)*35} ${54+Math.sin(a)*35}l${Math.cos(a)*7} ${Math.sin(a)*7}`,'none',gold,5);}
      circle(60,54,34,enamel,gold,2);circle(60,54,25,'none',pale,1);book(20,75,80,36,paper);path('M19 111Q40 103 60 113 80 103 101 111','none',metal,4);path('M60 74V45','none',gold,2);star(60,44,13,metal,6,.47);path('M34 57 39 43M82 50l5 12','none',paper,1.2);for(const [x,y]of [[41,21],[87,30],[22,49]])circle(x,y,1.5,light);
    }else{
      path('M34 91 45 74H77L88 91V111Q60 121 34 111Z',glass,gold,1.2);oval(60,92,27,6,rose,gold,.8);rect(44,74,33,7,metal,3);rect(49,69,23,7,color,2,gold,.8);quill(61,79,-18);path('M43 98Q60 92 79 98V109Q60 115 43 109Z',paper,gold,.6);flower(60,103,7,pale);for(const [x,y]of [[38,91],[83,92],[42,113],[79,113]])pearl(x,y,1.4);path('M19 115Q30 110 41 114','none',color,1.2);star(27,61,4,metal);
    }
  }else if(id==='study-50h'){
    if(!female){
      path('M28 49 87 26 98 50 38 72Z',enamel,ink,1.5);path('M31 48 39 71M81 29 91 53','none',metal,5);oval(93,38,8,14,glass,ink,1.2).setAttribute('transform','rotate(-23 93 38)');path('M33 53 25 56 28 64 37 61Z',metal,ink,.8);path('M60 66v17M60 83 37 117M60 83 84 117M60 84v33','none',metal,3);path('M45 103h29','none',pale,1);circle(60,79,5,enamel,gold,1);
      star(28,23,6,metal);star(104,15,4,metal);star(108,78,4,pale);path('M32 26 46 31 62 19','none',pale,.8,{'stroke-dasharray':'2 3'});circle(47,31,1.6,metal);circle(62,19,1.7,metal);
    }else{
      book(15,79,90,33,paper);path('M15 112Q38 105 60 116 82 105 105 112','none',metal,3);path('M60 76Q47 54 49 26M60 70Q78 61 88 35','none',gold,1.5);for(const [x,y,a]of [[51,56,-50],[51,42,-40],[75,59,35],[84,45,40]])leaf(x,y,7,a);star(49,27,8,metal);star(88,35,6,metal);star(65,42,4,rose);star(32,52,4,glass);path('M32 52 49 27 65 42 88 35','none',color,.8,{'stroke-dasharray':'2 3'});flower(50,73,8,pale);gem(60,116,6,9,glass);path('M92 90q5 0 7 3','none',gold,.7);
    }
  }else if(id==='level-3'){
    if(!female){
      path('M34 52 22 40 28 24 45 20 58 32 54 48Z',enamel,ink,1.5);path('M32 35 37 28 45 32 45 41 37 45 31 40Z',glass,gold,1);path('M49 47 93 97 87 103 77 93 70 100 63 93 70 86 43 54Z',metal,ink,1.2);path('M51 54 83 91','none',paper,1.2);gem(39,35,8,12,glass);path('M28 58 19 66M17 49h9','none',gold,1.4);rect(74,108,28,5,enamel,2,gold,.8);star(91,36,5,metal);
    }else{
      path('M32 54Q11 43 25 26 35 17 47 30 62 20 69 35 72 48 52 57L39 60Z',rose,gold,1.2);path('M34 48Q24 43 29 35 36 30 42 38 49 30 56 35 62 42 48 50','none',paper,1.3);path('M43 57 76 110 84 105 78 96 88 90 84 82 74 88 51 53Z',metal,gold,1);path('M48 61 75 101','none',paper,1.2);flower(41,38,7,pale);path('M26 60Q10 67 15 83L34 68 36 86 46 60Z',glass,gold,.8);gem(96,106,5,9,glass);star(85,24,4,metal);
    }
  }else if(id==='level-5'){
    if(!female){
      path('M23 75 79 63 94 108 38 119Z',paper,ink,1.2);path('M22 75Q12 79 18 88 25 92 30 86M80 64Q83 53 91 58 99 64 90 68M38 118Q31 112 38 105L88 95','none',metal,3);path('M32 84 71 76M35 91 75 83M39 98l23-5','none',color,1);quill(53,82,4);path('M65 99 78 97 86 113 77 111 73 119Z',enamel,gold,.8);star(72,100,5,metal,5,.55);gem(25,38,6,10,glass);
    }else{
      path('M20 76 90 63 104 105 34 119Z',rose,gold,1.1);path('M20 76 64 92 90 63M34 119 56 93M104 105 75 88','none',paper,1.3);path('M43 71Q42 51 55 30M55 57Q66 47 75 34','none',accent,1.6);path('M53 39Q29 25 45 13 58 13 55 31 70 12 82 26 80 42 59 42Z',paper,gold,.8);gem(59,33,7,11,glass);leaf(44,60,8,-45);leaf(66,51,7,45);flower(65,91,9,pale,6);path('M57 95 52 112 65 106 72 117 72 98',metal,gold,.6);star(99,42,4,metal);
    }
  }else if(id==='level-10'){
    if(!female){
      path('M20 114 31 106V54L42 44V93L50 89V31L61 15 74 31V84L84 78V49L98 59V106L107 114Z',enamel,ink,1.4);path('M50 31 61 15 74 31M31 54 42 44M84 49 98 59','none',metal,3);for(const [x,y]of [[36,63],[36,77],[36,91],[58,40],[67,40],[58,54],[67,54],[58,68],[67,68],[88,68],[93,81]])rect(x,y,3,7,glass,1,gold,.5);path('M55 111V92Q62 83 69 92v19Z',metal,gold,.8);path('M16 115h94','none',metal,4);star(61,10,4,metal);path('M15 85Q6 53 30 28','none',pale,.8,{'stroke-dasharray':'2 3'});star(21,35,3,light);
    }else{
      path('M22 111V71L60 52 98 71v40Z',rose,gold,1.1);path('M18 71 60 44 102 71Z',glass,gold,1.1);path('M36 53V37L60 18 84 37v16Z',paper,gold,1);path('M31 37 60 12 89 37Z',rose,gold,1);for(const x of [34,51,69,86])path(`M${x-3} 109V80a3 3 0 0 1 6 0v29Z`,paper,gold,.7);path('M52 111V87Q60 78 68 87v24Z',glass,gold,.8);rect(18,111,84,7,metal,2);for(const [x,y]of [[31,36],[60,12],[89,36],[18,70],[102,70]])pearl(x,y,2.4);flower(60,39,9,pale,6);path('M24 104q6-21 14-4M82 102q7-21 14 2','none',accent,1.4);star(95,19,4,metal);
    }
  }else if(id==='first-purchase'){
    if(!female){
      path('M32 75V36Q32 27 42 27H78Q88 27 88 36V75Z',enamel,ink,1.4);rect(37,35,46,35,glass,4,gold,.8);path('M38 81 32 116M82 81 88 116M29 78h62','none',metal,4);path('M25 73 35 65 87 65 96 73 87 87H35Z',enamel,ink,1.4);path('M36 76H86M40 42v18M50 42v18M60 42v18M70 42v18M80 42v18','none',pale,.9);path('M24 75V59h11M96 75V59H85','none',gold,4);gem(60,51,10,14,metal);star(97,32,4,metal);
    }else{
      path('M34 75V54Q21 40 35 32 37 17 51 25 60 11 69 25 84 17 86 33 101 43 86 54v21Z',rose,gold,1.2);path('M45 67V49Q60 34 75 49v18Z',paper,gold,.8);flower(60,43,11,pale,6);path('M32 77Q60 64 88 77V87H32Z',glass,gold,1.1);path('M38 86Q42 103 32 116M82 86Q78 103 88 116','none',metal,3.5);path('M28 79V65Q28 57 35 57M92 79V65Q92 57 85 57','none',gold,3);for(const x of [43,51,60,69,77])pearl(x,79,1.6);star(98,31,4,metal);
    }
  }else if(id==='expand-1'){
    if(!female){
      path('M15 57 78 47 97 108 33 120Z',enamel,ink,1.3);path('M24 62 73 55 87 104 38 112Z','none',pale,.8);for(let i=0;i<4;i++){path(`M${32+i*11} ${61-i*1.6}l14 47`,'none',paper,.4);path(`M${27+i*3} ${70+i*10}l49-8`,'none',paper,.4);}
      path('M42 87V76L56 64 75 73V96L60 101 42 94ZM39 76 56 61 79 71M60 83v18M42 77l18 6 15-10','none',metal,1.8);path('M82 23 105 89 99 91 76 25Z',metal,ink,.8);path('M76 25 77 13 82 23Z',paper,ink,.8);path('M17 42 48 30 51 38 20 50Z',glass,gold,.8);for(const x of [24,31,38,45])path(`M${x} ${46-(x-24)*.38}l-1-4`,'none',ink,.7);star(54,26,4,metal);
    }else{
      path('M28 70 58 47 91 70V109H28Z',paper,gold,1.2);path('M19 72 58 37 101 72 94 77 58 48 25 78Z',rose,gold,1.1);path('M69 48V30h12v29',glass,gold,1);path('M49 110V84Q59 72 69 84v26Z',glass,gold,.9);rect(32,80,12,15,rose,3);rect(75,80,12,15,rose,3);path('M20 114H100M28 103Q14 82 30 68M91 101q14-22-2-35','none',accent,2);for(const [x,y]of [[27,85],[29,69],[93,82],[89,66]])flower(x,y,6.2,pale);pearl(64,96,1.4);star(32,33,4,metal);path('M82 18q-6-10 4-13','none',pale,1.3);
    }
  }else if(id==='collector'){
    if(!female){
      path('M23 33 88 24 98 109 33 119Z',metal,ink,1.3);path('M29 38 83 31 91 105 38 113Z',enamel,ink,1);path('M57 34 66 109M33 75 87 67','none',metal,3);path('M34 43 52 40 54 67 36 69ZM63 39 79 37 82 63 66 65ZM39 81 57 78 60 104 42 107ZM69 77 84 74 87 99 72 103Z',glass,pale,.6);
      star(44,55,7,metal,5,.48);gem(72,51,11,18,accent);path('M44 99V89h11v10Z',metal,gold,.5);circle(49,87,4,enamel,gold,.6);path('M72 94 78 81 84 94Z',paper,gold,.6);path('M31 119v5M94 110v10','none',ink,3);star(101,29,4,metal);
    }else{
      path('M23 78 71 62 104 79 57 96Z',glass,gold,1.2);path('M23 78v29l34 14 47-16V79L57 96Z',rose,gold,1.2);path('M57 96v25M23 107l34 14 47-16','none',metal,1.5);path('M25 76V41L71 25V61Z',metal,gold,1.1);path('M31 66V45L65 33V56Z',glass,paper,.9);flower(48,49,8,pale);path('M34 81 58 73 88 83 58 92Z',paper,gold,.6);for(const [x,y,c]of [[44,81,glass],[57,77,rose],[70,82,enamel],[58,87,metal]])gem(x,y,6,9,c);path('M54 105h9v6h-9Z',metal,gold,.7);for(const [x,y]of [[31,108],[95,105]])pearl(x,y,2);star(89,33,4,metal);
    }
  }else if(id==='spend-500'){
    if(!female){
      path('M60 35v70M30 49 90 49M60 36 52 45 60 51 68 45Z','none',metal,3);path('M31 49 20 79M31 49 42 79M90 49 79 79M90 49 102 79','none',gold,1.2);path('M15 80H47Q44 95 31 95T15 80ZM75 80H107Q104 95 91 95T75 80Z',enamel,gold,1.3);path('M43 108 60 101 77 108v9H43Z',enamel,ink,1.2);rect(36,115,48,5,metal,2);gem(60,29,13,19,glass);for(const [x,y]of [[29,78],[33,73],[88,78],[93,76]]){circle(x,y,5,metal,ink,.6);path(`M${x-2} ${y}h4`,'none',paper,.6);}star(24,27,4,metal);
    }else{
      path('M39 43Q34 33 41 26 51 20 60 33 70 19 80 26 87 34 81 43Z',rose,gold,1.2);path('M42 42Q27 63 26 94 27 113 60 117 93 113 94 94 93 64 78 42Z',enamel,gold,1.3);path('M44 49Q60 57 76 49M35 85q-1-19 10-29M83 85q0-16-9-29','none',pale,1.3);path('M39 44Q60 50 81 44','none',metal,4);for(const [x,y]of [[43,28],[78,28]])pearl(x,y,2.2);flower(60,85,14,light,6);gem(60,85,8,12,rose);path('M35 107Q60 119 86 105','none',metal,1.3);for(const x of [35,43,51,59,67,75,83])pearl(x,106+Math.sin((x-35)/48*Math.PI)*6,1.4);star(101,52,4,metal);
    }
  }else if(id==='expand-2'){
    if(!female){
      path('M16 107V63L43 49 70 62V107Z',enamel,ink,1.2);path('M43 49V30L72 16 103 33V105L70 118Z',glass,ink,1.2);path('M12 64 42 46 74 62 67 70 42 56 20 71Z',metal,ink,1);path('M37 31 72 12 110 32 102 39 72 22 45 39Z',enamel,gold,1.2);path('M70 41v77M43 49l27 13 33-17','none',metal,1.5);for(const [x,y,w,h]of [[25,77,11,19],[48,74,11,17],[78,46,10,17],[91,40,6,14],[78,74,10,17],[91,69,6,14]])rect(x,y,w,h,paper,1,gold,.7);path('M24 116 69 127 111 110M30 107 70 118 103 105','none',metal,2);path('M20 42 30 31M22 31l8 11','none',accent,3);star(24,21,4,metal);
    }else{
      path('M18 64 59 29 103 63V108L60 124 18 108Z',glass,gold,1.4);path('M18 64 60 79 103 63M60 30v94M18 108l42-16 43 16M38 49v65M82 48v67','none',paper,1.2);path('M14 62 59 23 108 62 103 68 59 34 20 70Z',metal,gold,.8);path('M23 105Q31 89 40 102M72 105Q88 83 98 101M42 112Q54 101 65 113','none',accent,2);for(const [x,y,r]of [[31,98,6],[85,98,7],[52,108,5]])flower(x,y,r,pale);path('M49 119V90Q60 76 71 90v30Z',rose,gold,1);path('M59 83v39','none',metal,1.4);pearl(55,103,1.4);pearl(65,103,1.4);path('M60 23V14M55 14h10','none',gold,1.8);gem(60,9,8,11,glass);star(101,25,4,metal);
    }
  }else{
    book(22,62,76,42,paper);star(60,40,14,metal,6,.52);path('M60 54v9','none',gold,1.5);
  }
  parent.append(svg);return svg;
}
