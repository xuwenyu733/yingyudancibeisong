const NS='http://www.w3.org/2000/svg';
const namespace=globalThis.crypto?.randomUUID?.().replaceAll('-','').slice(0,12)||Math.random().toString(16).slice(2,14);
let sequence=0;
const TITLES=Object.freeze({male:['星途罗盘','银隼守卫','曜金圣骑','苍雷龙翼','天穹执星者'],female:['晨露铃兰','蝶舞珍珠','蓝鸢花冕','月羽流晶','极光星后'],none:['启程徽章','探索徽章','荣光徽章','星辉徽章','典藏徽章']});
export function badgeProgressionTitle(gender,rank=1){return TITLES[gender==='female'?'female':gender==='male'?'male':'none'][Math.max(0,Math.min(4,(Number(rank)||1)-1))];}

/** Level heraldry is separate from the achievement keepsake collection. */
export function createBadgeEmblem(parent,tier,category='level',gender='none'){
  const doc=parent.ownerDocument,chosen=gender==='female'?'female':gender==='male'?'male':'none',rank=Math.max(1,Math.min(5,Number(tier?.rank)||1));
  const art=doc.createElementNS(NS,'svg'),id=`pet-badge-${namespace}-${++sequence}`;
  art.setAttribute('viewBox','0 0 120 132');art.setAttribute('aria-hidden','true');
  Object.assign(art.dataset,{tier:tier?.id||'bronze',gender:chosen,stage:String(rank),family:'level-crest',category,design:badgeProgressionTitle(chosen,rank)});
  const add=(tag,attrs={},to=art)=>{const node=doc.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));to.append(node);return node;};
  add('title').textContent=`${art.dataset.design} · ${tier?.minLevel||1}级起`;
  const defs=add('defs'),palettes={
    male:[['#b7793c','#ffe9b0','#263b4c','#58a7a5'],['#829bb0','#f4fbff','#203b57','#65c9e7'],['#b58936','#fff1ac','#1b3550','#e6bd53'],['#7985ad','#f0f8ff','#1e2f55','#79e2ef'],['#aa8030','#fff2b3','#152b48','#72c8eb']],
    female:[['#b48c56','#fff3ce','#426d67','#8ed5c5'],['#b99463','#fff5d8','#5a5d87','#c7b0ef'],['#b48d45','#fff3c2','#274b7c','#7baadf'],['#ad8dba','#fff4e3','#5b4c8d','#b8a0e6'],['#b09149','#fff6c9','#46658f','#91d7d5']],
    none:Array.from({length:5},()=>['#8e9a9e','#f6f8f6','#4f626a','#a7c2be']),
  };
  const [rim,shine,ink,jewel]=palettes[chosen][rank-1],pearl='#fffdf1';
  function gradient(name,colors){const g=add('linearGradient',{id:`${id}-${name}`,x1:'12%',y1:'0%',x2:'88%',y2:'100%'},defs);colors.forEach((color,i)=>add('stop',{offset:`${i/(colors.length-1)*100}%`,'stop-color':color},g));return `url(#${id}-${name})`;}
  const metal=gradient('metal',[shine,rim,shine,rim]),enamel=gradient('enamel',[jewel,ink]),crystal=gradient('crystal',[pearl,jewel,ink]),silk=gradient('silk',[jewel,ink]);
  const path=(d,fill='none',stroke=undefined,width=1)=>add('path',{d,fill,...(stroke?{stroke,'stroke-width':width,'stroke-linejoin':'round','stroke-linecap':'round'}:{})});
  const line=(d,stroke=shine,width=1)=>path(d,'none',stroke,width);
  const circle=(x,y,r,fill,stroke,width=.8)=>add('circle',{cx:x,cy:y,r,fill,...(stroke?{stroke,'stroke-width':width}:{})});
  const ellipse=(x,y,rx,ry,fill,rotate=0,stroke=undefined,width=.7)=>add('ellipse',{cx:x,cy:y,rx,ry,fill,...(rotate?{transform:`rotate(${rotate} ${x} ${y})`}:{}),...(stroke?{stroke,'stroke-width':width}:{})});
  function star(x,y,r,fill,points=4,inner=.35){return add('polygon',{points:Array.from({length:points*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/points,s=i%2?r*inner:r;return `${x+Math.cos(a)*s},${y+Math.sin(a)*s}`;}).join(' '),fill});}
  function gem(x,y,rx,ry=rx*1.35,color=crystal){path(`M${x} ${y-ry} ${x+rx} ${y-ry*.16} ${x+rx*.65} ${y+ry*.58} ${x} ${y+ry} ${x-rx*.65} ${y+ry*.58} ${x-rx} ${y-ry*.16}Z`,color,shine,.9);line(`M${x} ${y-ry} ${x-rx*.38} ${y} ${x} ${y+ry} ${x+rx*.38} ${y}Z`,pearl,.65);line(`M${x-rx} ${y-ry*.16}h${rx*2}`,pearl,.65);}
  function bead(x,y,r=1.8){circle(x,y,r,pearl,rim,.55);circle(x-r*.23,y-r*.28,r*.28,'#fff');}
  const flare=(x,y,r=3)=>star(x,y,r,shine);
  function wing(side,baseY=54){
    const mirror=add('g',{transform:side<0?'translate(120 0) scale(-1 1)':''});
    const p=(d,fill,stroke=ink,w=1)=>add('path',{d,fill,stroke,'stroke-width':w,'stroke-linejoin':'round'},mirror);
    p(`M76 ${baseY+25} 82 ${baseY-8} 116 ${baseY-30} 104 ${baseY-7} 115 ${baseY-12} 102 ${baseY+9} 111 ${baseY+8} 96 ${baseY+28}Z`,metal);
    p(`M83 ${baseY+20} 88 ${baseY-5} 107 ${baseY-21} 95 ${baseY+3} 104 ${baseY-1} 92 ${baseY+20}Z`,enamel,shine,.7);
    for(let i=0;i<4;i++)add('path',{d:`M${86+i*2} ${baseY+17-i*6} ${101+i*2} ${baseY-3-i*6}`,fill:'none',stroke:shine,'stroke-width':1},mirror);
  }
  ellipse(60,124,29+rank*3,3.2,ink).setAttribute('opacity','.11');
  if(chosen==='male'){
    if(rank===1){
      path('M60 14 70 29 93 29 91 48 107 62 91 77 93 97 71 97 60 113 49 97 27 97 29 77 13 62 29 48 27 29 49 29Z',metal,ink,1.5);
      circle(60,63,33,ink,shine,1.5);circle(60,63,28,'#314f5b',rim,1);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;line(`M${60+Math.sin(a)*30} ${63-Math.cos(a)*30} ${60+Math.sin(a)*26} ${63-Math.cos(a)*26}`,i%3?rim:shine,i%3?.8:1.5);}
      path('M60 30 72 66 60 95 48 60Z',shine,rim,1);path('M60 30 60 65 48 60Z',jewel);path('M60 65 72 66 60 95Z',rim);circle(60,63,5,metal,ink,1);circle(60,63,2,jewel);line('M33 35 38 35M82 91 87 91',shine,1.3);
    }else if(rank===2){
      path('M60 18 88 29 91 63Q89 91 60 112 31 91 29 63L32 29Z',metal,ink,1.8);
      path('M60 27 80 35 83 64Q80 84 60 100 40 84 37 64L40 35Z',enamel,shine,1);
      for(const side of [-1,1]){path(`M${60+side*4} 58 ${60+side*26} 38 ${60+side*49} 27 ${60+side*42} 45 ${60+side*34} 49 ${60+side*43} 45 ${60+side*33} 59 ${60+side*24} 62 ${60+side*30} 61 ${60+side*18} 73Z`,metal,ink,1);line(`M${60+side*12} 60 ${60+side*33} 45`,pearl,1.2);}
      path('M50 53 54 44 65 43 71 49 82 51 72 57 68 72 61 86 53 70Z',shine,ink,1.1);path('M62 50 69 51 65 54Z',ink);path('M60 62 67 60 61 76 56 67Z',rim);gem(60,91,4,5);
      for(const side of [-1,1])for(let i=0;i<3;i++)line(`M${60+side*(31-i*4)} ${43+i*6} ${60+side*(23-i*3)} ${50+i*5}`,jewel,.7);
      for(const [x,y]of [[40,35],[80,35],[38,66],[82,66],[49,89],[71,89]])circle(x,y,1.4,pearl,rim,.45);
      line('M45 97 50 101M70 101 75 97',shine,1.4);
    }else if(rank===3){
      star(60,63,53,metal,12,.80);star(60,63,44,ink,12,.84);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;line(`M${60+Math.sin(a)*45} ${63+Math.cos(a)*45} ${60+Math.sin(a)*50} ${63+Math.cos(a)*50}`,shine,1.4);}
      path('M38 90 25 111 48 108 60 120 72 108 95 111 82 90Z',silk,rim,1);
      path('M60 24 84 38 89 65 78 89 60 101 42 89 31 65 36 38Z',metal,ink,1.6);
      path('M60 30 77 41 80 64 72 83 60 94 48 83 40 64 43 41Z',enamel,shine,1);
      path('M42 50 47 35 60 29 73 35 78 50 72 53 71 73 60 87 49 73 48 53Z',metal,ink,1.3);
      path('M45 52 59 58 59 66 47 61ZM75 52 61 58 61 66 73 61Z',ink,shine,.7);
      path('M60 34 63 48 60 79 57 48Z',shine,rim,.8);line('M49 70 55 75M71 70 65 75M53 80 60 86 67 80',rim,1.2);
      gem(60,37,4,6);for(const side of [-1,1]){gem(60+side*36,65,3,5);path(`M${60+side*24} 90Q${60+side*38} 81 ${60+side*40} 67`,'none',shine,1);for(let i=0;i<4;i++)ellipse(60+side*(29+i*2.5),88-i*5,2,3.5,metal,side*35);}
      for(const [x,y]of [[42,43],[78,43],[46,82],[74,82]])circle(x,y,1.4,pearl,rim,.4);
    }else{
      wing(-1,rank===5?56:62);wing(1,rank===5?56:62);
      if(rank===5){
        ellipse(60,63,42,50,'none',-18,metal,2.1);ellipse(60,63,42,50,'none',18,rim,.8);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;gem(60+Math.sin(a)*41,63+Math.cos(a)*48,2.4,3.1,i%2?shine:jewel);}
        path('M32 35 28 14 45 23 60 4 75 23 92 14 88 35Z',metal,ink,1.3);path('M40 30 43 23 49 28 60 15 71 28 77 23 80 30Z',ink,shine,.7);gem(60,23,4,6);for(const [x,y]of [[28,14],[60,4],[92,14]])bead(x,y,2.5);
      }
      path('M60 27 85 43 91 73 79 99 60 116 41 99 29 73 35 43Z',metal,ink,1.6);
      path('M60 35 78 48 83 72 73 93 60 105 47 93 37 72 42 48Z',enamel,shine,1.1);
      path('M43 49 39 31 51 42 59 37 71 42 86 32 79 52 87 63 78 72 75 89 60 101 49 89 47 73 34 64Z',metal,ink,1.35);
      path('M49 51 43 43 47 60 56 62 54 55ZM71 51 79 43 75 60 64 62 66 55Z',ink,shine,.8);
      path('M60 45 67 60 63 76 71 87 60 94 49 87 57 76 53 60Z',crystal,shine,.9);
      path('M44 64 54 68 50 72 42 69ZM76 64 66 68 70 72 78 69Z',jewel,ink,.6);line('M50 84 55 87M70 84 65 87M55 93 60 98 65 93',ink,1.3);
      for(const side of [-1,1]){gem(60+side*29,80,3.2,6);line(`M${60+side*15} 102 ${60+side*11} 111`,shine,1.2);for(let i=0;i<5;i++)circle(60+side*(23-i*2),89+i*3,1.1,shine);}
      if(rank===4){path('M44 33 49 17 59 28 69 14 77 35Z',metal,ink,1);gem(61,27,4,6);for(const [x,y]of [[22,88],[97,88],[18,31],[102,31]])flare(x,y,2.2);}
      else{for(const side of [-1,1]){path(`M${60+side*15} 112 ${60+side*28} 120 ${60+side*12} 124 60 119Z`,metal,ink,.75);gem(60+side*38,99,3.2,5);for(let i=0;i<4;i++)bead(60+side*(28+i*3),111-i*4,1.2);}gem(60,118,4,6);for(const [x,y]of [[14,43],[106,43],[19,106],[101,106],[39,12],[81,12]])flare(x,y,2.6);}
    }
  }else if(chosen==='female'){
    if(rank===1){
      line('M59 108Q61 74 55 35M59 91Q38 76 34 57M59 81Q79 68 82 47',metal,3.2);
      path('M54 89Q26 90 27 65 50 65 54 89ZM62 77Q84 79 96 55 72 55 62 77Z',enamel,rim,1);line('M31 69 49 85M89 60 69 73',shine,.9);
      for(const [x,y,tilt]of [[48,40,-18],[67,57,14],[43,66,-12]]){const g=add('g',{transform:`rotate(${tilt} ${x} ${y})`});add('path',{d:`M${x-8} ${y-3}Q${x-8} ${y-14} ${x} ${y-16}Q${x+8} ${y-14} ${x+8} ${y-3}L${x+12} ${y+4}Q${x+6} ${y+9} ${x} ${y+4}Q${x-6} ${y+9} ${x-12} ${y+4}Z`,fill:pearl,stroke:rim,'stroke-width':1},g);add('path',{d:`M${x-5} ${y-9}Q${x-4} ${y-13} ${x} ${y-13}`,fill:'none',stroke:'#fff','stroke-width':2},g);}
      gem(59,109,5,8);bead(55,26,2);flare(83,29,2.6);
    }else if(rank===2){
      for(const side of [-1,1]){path(`M60 62Q${60+side*21} 16 ${60+side*47} 26Q${60+side*53} 58 ${60+side*29} 69Q${60+side*45} 75 ${60+side*33} 100Q${60+side*14} 104 60 71Z`,metal,ink,1);path(`M${60+side*6} 61Q${60+side*23} 26 ${60+side*39} 34Q${60+side*39} 54 ${60+side*22} 63ZM${60+side*7} 72Q${60+side*28} 72 ${60+side*27} 92Q${60+side*16} 92 ${60+side*7} 72Z`,enamel,shine,.9);line(`M${60+side*12} 56Q${60+side*22} 39 ${60+side*31} 38M${60+side*13} 77 ${60+side*23} 86`,pearl,.8);for(const [offset,y,r]of [[39,39,2],[38,49,1.7],[32,57,1.5],[28,84,1.8]])bead(60+side*offset,y,r);line(`M${60+side*2} 49Q${60+side*6} 35 ${60+side*12} 38`,rim,1.3);bead(60+side*12,38,1.8);}
      gem(60,60,5,14);line('M60 74v20',rim,1);for(const [y,r]of [[95,2],[101,2.5],[109,3.6]])bead(60,y,r);gem(60,121,3,5);for(const [x,y]of [[15,70],[105,70],[42,16],[78,16]])flare(x,y,2);
    }else if(rank===3){
      path('M22 82 16 42 34 57 42 25 60 46 78 25 86 57 104 42 98 82Q60 102 22 82Z',metal,ink,1.15);path('M30 79 28 60 39 68 46 43 60 59 74 43 81 68 92 60 90 79Q60 92 30 79Z',enamel,shine,1);
      for(const side of [-1,1]){path(`M60 70Q${60+side*38} 63 ${60+side*25} 36Q${60+side*5} 40 60 70Z`,crystal,shine,1);line(`M${60+side*21} 42Q${60+side*18} 57 60 70`,pearl,1);path(`M${60+side*8} 72Q${60+side*28} 70 ${60+side*32} 82Q${60+side*12} 88 60 78Z`,enamel,rim,.7);for(const [offset,y]of [[40,68],[29,79],[18,86],[9,90]])bead(60+side*offset,y,1.7);gem(60+side*29,99,3.5,6);line(`M${60+side*29} 87v6`,rim,1);}
      path('M60 28Q42 48 60 72Q78 48 60 28Z',crystal,shine,1.2);line('M60 35v29',pearl,.8);gem(60,75,6,9);gem(60,108,5,10);line('M60 87v10',rim,1.1);
      for(const [x,y]of [[16,42],[42,25],[78,25],[104,42]]){bead(x,y,2.4);flare(x,y-7,1.8);}for(let i=0;i<7;i++)bead(42+i*6,86+Math.sin(i/6*Math.PI)*6,1.1);
    }else{
      path('M83 17Q43 16 30 55 15 97 66 117 29 116 18 83 5 39 50 17 69 9 83 17Z',metal,ink,1);line('M55 22Q20 40 23 76',pearl,1.5);
      for(const side of [-1,1]){path(`M60 73Q${60+side*18} 32 ${60+side*48} 34Q${60+side*38} 47 ${60+side*31} 53L${60+side*47} 47Q${60+side*38} 64 ${60+side*23} 66L${60+side*40} 65Q${60+side*22} 85 60 82Z`,metal,ink,.9);for(let i=0;i<4;i++)path(`M${60+side*(9+i*4)} ${67-i*5}Q${60+side*(27+i*3)} ${52-i*4} ${60+side*(37+i*2)} ${41-i*2}`,'none',i%2?jewel:shine,1.2);path(`M${60+side*5} 81Q${60+side*29} 78 ${60+side*31} 101Q${60+side*13} 105 60 89Z`,enamel,rim,.8);for(let i=0;i<6;i++)bead(60+side*(17+i*3),96-i*3,1.2+i*.05);gem(60+side*29,106,3.4,6);line(`M${60+side*29} 97v3`,rim,.8);}
      path('M56 74Q46 56 53 43 57 35 65 39L72 44 65 49 65 63 72 75 66 89 56 88Z',crystal,shine,1);path('M62 43 68 44 65 46Z',ink);path('M59 49Q54 61 61 76','none',pearl,1);
      gem(60,91,6,10);line('M60 102v8',rim,1.1);gem(60,119,4.4,8);for(const [x,y]of [[42,30],[25,52],[25,80],[39,103],[88,25],[105,82]]){bead(x,y,1.6);flare(x+4,y-4,1.7);}
      if(rank===5){path('M29 34 25 15 40 24 47 8 60 24 73 8 80 24 95 15 91 34Q60 42 29 34Z',metal,ink,1);path('M36 31 40 27 47 17 60 31 73 17 80 27 84 31Q60 36 36 31Z',enamel,shine,.6);for(const [x,y,r]of [[25,15,2.4],[47,8,2.4],[60,24,2],[73,8,2.4],[95,15,2.4]])bead(x,y,r);gem(60,30,4,6);for(const side of [-1,1]){path(`M${60+side*35} 38Q${60+side*50} 18 ${60+side*52} 48Q${60+side*43} 39 ${60+side*35} 38Z`,crystal,shine,.8);for(let i=0;i<5;i++){const a=(i*72-90)*Math.PI/180,px=60+side*39+Math.cos(a)*5.5,py=90+Math.sin(a)*5.5;ellipse(px,py,2.5,4,pearl,i*72,rim,.5);}gem(60+side*39,90,2,2.6);line(`M${60+side*39} 98v9`,metal,1);gem(60+side*39,114,2.8,5.3);}for(let i=0;i<9;i++)bead(35+i*6.2,34+Math.sin(i/8*Math.PI)*4,1.1);for(const [x,y]of [[14,18],[106,18],[18,113],[100,114]])flare(x,y,2.3);}
      else{gem(84,23,4,6);for(let i=0;i<5;i++)bead(35+i*6,116+Math.sin(i/4*Math.PI)*4,1.2);}
    }
  }else{
    star(60,63,42+rank,metal,4+rank,.72);star(60,63,34,ink,4+rank,.77);gem(60,63,12,21);for(let i=0;i<rank+3;i++){const a=i*Math.PI*2/(rank+3);bead(60+Math.sin(a)*29,63+Math.cos(a)*29,1.5);}line('M52 103h16',rim,1);for(let i=0;i<rank;i++)circle(52+i*4,109,1,ink);
  }
  // Compatibility category seals are subordinate level details, not achievement art.
  if(category!=='level'){
    const g=add('g',{'data-level-seal':category}),seal=d=>add('path',{d,fill:'none',stroke:ink,'stroke-width':1.4,'stroke-linecap':'round','stroke-linejoin':'round'},g);
    if(category==='checkin')seal('M54 121 58 125 66 117');
    else if(category==='study')seal('M60 126v-8M60 120Q55 117 53 120v6Q57 123 60 126Q63 123 67 126v-6Q64 117 60 120');
    else if(category==='growth')seal('M60 127v-9M60 122Q54 121 55 117Q61 117 60 122M60 124Q65 124 66 120Q61 120 60 124');
  }
  parent.append(art);return art;
}
