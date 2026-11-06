// 商品插画只用本地矢量几何，和房间中的配色、花纹一一对应。
let artSequence=0;
const artNamespace=`shop-art-${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const hex=value=>`#${Number(value??0xe8d4b3).toString(16).padStart(6,'0')}`;
function starPoints(cx,cy,r,inner=.45,count=5){return Array.from({length:count*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/count,s=i%2?r*inner:r;return `${cx+Math.cos(a)*s},${cy+Math.sin(a)*s}`;}).join(' ');}
export function decorateShopIllustration(svg,art,sku,product={}){
  const id=`${artNamespace}-${++artSequence}`,premium=Number(product.price)>=700,colors=product.colors||[];
  const defs=svg(art,'defs'),gradient=svg(defs,'linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'100%'});
  svg(gradient,'stop',{offset:0,'stop-color':premium?'#eee5cf':'#faf4e5'});svg(gradient,'stop',{offset:1,'stop-color':colors[1]?hex(colors[1]):'#dce9dc','stop-opacity':.45});
  svg(art,'rect',{x:4,y:3,width:120,height:102,rx:18,fill:`url(#${id})`});
  svg(art,'path',{d:'M12 85Q64 65 116 85v14H12Z',fill:'#fffdf3',opacity:.55});
  svg(art,'ellipse',{cx:64,cy:91,rx:43,ry:8,fill:premium?'#bca378':'#adba9e',opacity:.15});
  svg(art,'ellipse',{cx:64,cy:88,rx:40,ry:6,fill:'#fff9e9',stroke:premium?'#d4b773':'#e3d7bd','stroke-width':.8});
  for(const [x,y,r]of [[18,26,3.4],[106,17,2.8],[113,68,2.2]])svg(art,'polygon',{points:starPoints(x,y,r),fill:premium?'#c9a24f':'#b9c9ad',opacity:.85});
  if(premium){svg(art,'path',{d:'M12 35V23q0-12 12-12h12m56 0h12q12 0 12 12v12M12 75v9q0 12 12 12h12m56 0h12q12 0 12-12v-9',stroke:'#d8bb79','stroke-width':.7,opacity:.75});}
}
export function drawSurfaceIllustration(svg,art,product){
  const c=product.colors.map(hex),motif=product.motif,premium=product.price>=700;
  const rect=(parent,x,y,w,h,fill,rx=2,stroke)=>svg(parent,'rect',{x,y,width:w,height:h,rx,fill,...(stroke?{stroke,'stroke-width':1.2}:{})});
  const path=(parent,d,stroke,width=1.5,fill='none')=>svg(parent,'path',{d,stroke,'stroke-width':width,fill,'stroke-linecap':'round','stroke-linejoin':'round'});
  const circle=(parent,x,y,r,fill,stroke)=>svg(parent,'circle',{cx:x,cy:y,r,fill,...(stroke?{stroke,'stroke-width':1}:{})});
  const star=(parent,x,y,r,fill,inner=.45)=>svg(parent,'polygon',{points:starPoints(x,y,r,inner),fill});
  if(product.category==='flooring'){
    const g=svg(art,'g',{transform:'translate(64 53) scale(1 .58) rotate(-35)'});
    rect(g,-37,-31,78,78,'#b39c79',3);rect(g,-39,-35,78,78,c[0],3,c[1]);
    if(['honey','checker','diamond','mosaic'].includes(motif)){
      for(let y=0;y<4;y++)for(let x=0;x<4;x++){
        rect(g,-37+x*18,-33+y*18,17.5,17.5,motif==='checker'&&(x+y)%2?c[1]:c[0],1);
        if(motif==='honey')circle(g,-28+x*18,-24+y*18,2.4,c[2]);
        if(motif==='diamond')svg(g,'polygon',{points:`${-28+x*18},${-31+y*18} ${-21+x*18},${-24+y*18} ${-28+x*18},${-17+y*18} ${-35+x*18},${-24+y*18}`,fill:c[1]});
        if(motif==='mosaic')star(g,-28+x*18,-24+y*18,6,(x+y)%2?c[1]:c[2],.32);
      }
    }else if(motif==='terrazzo'){
      for(let i=0;i<44;i++){const x=-34+(i*29%66),y=-30+(i*17%66);svg(g,'polygon',{points:`${x},${y} ${x+3+(i%3)},${y+2} ${x+1},${y+5}`,fill:c[1+i%3],opacity:.9});}
      for(const x of [-15,9,33])path(g,`M${x} -33v72`,'#e5c6c8',.7);for(const y of [-9,15])path(g,`M-37 ${y}h72`,'#e5c6c8',.7);
    }else if(motif==='parquet'){
      for(let y=0;y<6;y++)for(let x=0;x<4;x++){const px=-37+x*18,py=-32+y*12;svg(g,'polygon',{points:`${px},${py+6} ${px+9},${py} ${px+18},${py+6} ${px+9},${py+12}`,fill:c[(x+y)%2],stroke:'#896449','stroke-width':.5});}
      rect(g,-36,-32,70,70,'none',1,c[3]);
    }else if(motif==='marble'){
      for(let i=0;i<5;i++)path(g,`M${-37+i*17} -34q-15 22 4 39t-7 34`,i%2?c[2]:c[1],i%2?.7:1.3);
      for(const [x,y]of [[-28,-24],[26,-24],[-28,30],[26,30]]){path(g,`M${x-5} ${y+5}q6-12 12-10`,c[2],1);for(let i=0;i<3;i++)svg(g,'ellipse',{cx:x-3+i*3,cy:y+2-i*3,rx:3,ry:1.4,fill:c[2],transform:`rotate(-30 ${x} ${y})`});}
    }else{
      rect(g,-35,-31,70,70,c[1],1,c[2]);rect(g,-31,-27,62,62,c[0],1,c[2]);
      svg(g,'polygon',{points:'0,-23 27,4 0,31 -27,4',fill:c[1],stroke:c[2],'stroke-width':1.3});
      star(g,0,4,23,c[2],.48);star(g,0,4,15,c[0],.45);star(g,0,4,8,c[3],.45);
      for(const [x,y]of [[-26,-23],[26,-23],[-26,31],[26,31]]){star(g,x,y,5,c[2]);circle(g,x,y,1.5,c[3]);}
      for(let i=0;i<4;i++){const x=-21+i*14;circle(g,x,-27,1.2,c[2]);circle(g,x,35,1.2,c[2]);}
    }
    if(premium){rect(g,-38,-34,76,76,'none',2,c[2]);rect(g,-34,-30,68,68,'none',1,c[2]);}
    return;
  }
  const g=svg(art,'g',{}),frame=(x,y,w,h,fill=c[1],border=c[0])=>{rect(g,x-2,y+2,w+4,h+3,'#7c684b',3);rect(g,x,y,w,h,border,3);rect(g,x+4,y+4,w-8,h-8,fill,1);};
  if(motif==='botanical'){
    frame(37,15,54,68);path(g,'M63 71q-9-23 5-42',c[2],2);
    for(let i=0;i<5;i++){const x=i%2?64:57,y=37+i*6;svg(g,'ellipse',{cx:x,cy:y,rx:8,ry:3.5,fill:c[2+i%2],transform:`rotate(${i%2?-32:30} ${x} ${y})`});}
    path(g,'M45 76h38',c[0],.7);
  }else if(motif==='daisy'){
    circle(g,64,48,27,'none',c[0]);circle(g,64,48,24,'none',c[3]);
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7,x=64+Math.cos(a)*25,y=48+Math.sin(a)*25;for(let k=0;k<6;k++){const t=k*Math.PI/3;svg(g,'ellipse',{cx:x+Math.cos(t)*4,cy:y+Math.sin(t)*4,rx:4.4,ry:2.4,fill:c[1],transform:`rotate(${k*60} ${x} ${y})`});}circle(g,x,y,2.7,c[2]);}
    path(g,'m56 75 8 5 8-5-3 13-5-6-5 6Z',c[0],1,c[0]);
  }else if(motif==='rainbow'){
    for(let i=0;i<5;i++)path(g,`M${33+i*6} 61a${31-i*6} ${31-i*6} 0 0 1 ${62-i*12} 0`,c[i],5);
    for(const x of [32,96]){circle(g,x,63,9,c[5]);circle(g,x-7,66,7,c[5]);circle(g,x+7,66,7,c[5]);}
    for(const [x,y]of [[45,79],[64,88],[84,79]]){path(g,`M${x} 69v${y-69}`,c[1],1);svg(g,'path',{d:`M${x} ${y-4}q-7 9 0 10 7-1 0-10Z`,fill:c[4]});}
  }else if(motif==='butterfly'){
    frame(28,15,72,69,c[2],c[3]);
    for(const [x,y,s,color]of [[50,42,1,c[0]],[77,58,.72,c[1]]]){const b=svg(g,'g',{transform:`translate(${x} ${y}) scale(${s})`});for(const k of [-1,1]){svg(b,'ellipse',{cx:k*8,cy:-4,rx:9,ry:12,fill:color,transform:`rotate(${k*25} 0 0)`});svg(b,'ellipse',{cx:k*6,cy:8,rx:6,ry:7,fill:color});circle(b,k*8,-6,2.5,c[2]);}path(b,'M0-12v29m0-25-4-5m4 5 4-5',c[4],1.5);}
  }else if(motif==='moon'){
    path(g,'M39 22Q64 3 89 22',c[0],2);svg(g,'path',{d:'M68 19c-24-5-33 24-14 35 11 6 23 1 29-7-19 6-32-10-15-28Z',fill:c[0],stroke:c[1],'stroke-width':.8});
    for(const [x,y,r]of [[39,67,8],[65,85,7],[88,67,9]]){path(g,`M${x} 25V${y-8}`,c[0],1);star(g,x,y,r,c[1]);for(let yy=34;yy<y-12;yy+=9)circle(g,x,yy,1.8,c[3]);}
  }else if(motif==='clock'){
    path(g,'m36 40 28-25 28 25Z',c[4],1,c[1]);rect(g,40,39,48,39,c[0],3,c[4]);circle(g,64,56,16,c[2],c[3]);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;circle(g,64+Math.sin(a)*12,56-Math.cos(a)*12,1,c[4]);}path(g,'M64 46v10l7 4',c[4],1.5);path(g,'M50 79v10m28-10v10',c[4],1);svg(g,'ellipse',{cx:50,cy:91,rx:3,ry:5,fill:c[3]});svg(g,'ellipse',{cx:78,cy:91,rx:3,ry:5,fill:c[3]});circle(g,64,31,4,c[2]);
  }else if(motif==='ocean'){
    for(const [x,y,h]of [[19,26,51],[49,18,63],[79,29,47]]){frame(x,y,27,h,c[4],c[0]);circle(g,x+13,y+15,5,c[3]);path(g,`M${x+4} ${y+h-16}q8-12 19 0v10H${x+4}Z`,c[1],0,c[1]);path(g,`M${x+4} ${y+h-10}q8-10 19-2`,c[2],3);}
    for(const x of [23,99])star(g,x,87,4,c[3]);
  }else if(motif==='sakura'){
    svg(g,'path',{d:'M64 77 22 43A56 56 0 0 1 106 43Z',fill:c[0],stroke:c[2],'stroke-width':2});for(let i=0;i<9;i++){const a=(-137+i*11.75)*Math.PI/180;path(g,`M64 77l${Math.cos(a)*53} ${Math.sin(a)*53}`,c[2],.7);}
    for(const [x,y]of [[43,44],[63,36],[80,46]]){for(let i=0;i<5;i++){const a=i*Math.PI/2.5;circle(g,x+Math.cos(a)*4,y+Math.sin(a)*4,3.4,c[1]);}circle(g,x,y,2,c[4]);}path(g,'M64 78v13',c[2],1);for(const x of [61,64,67])path(g,`M${x} 87v8`,c[3],1);
  }else if(motif==='mirror'){
    for(let i=0;i<16;i++){const a=i*Math.PI/8;path(g,`M${64+Math.cos(a)*23} ${51+Math.sin(a)*23} ${64+Math.cos(a)*35} ${51+Math.sin(a)*35}`,c[2],i%2?2:3);}
    circle(g,64,51,27,c[2]);circle(g,64,51,22,c[0],c[3]);path(g,'m50 54 21-19m-17 26 23-21',c[3],2);for(let i=0;i<12;i++){const a=i*Math.PI/6;circle(g,64+Math.cos(a)*25,51+Math.sin(a)*25,1.6,c[3]);}
  }else if(motif==='crystal'){
    path(g,'M32 45Q64-9 96 45M40 47Q64 13 88 47M48 49Q64 29 80 49',c[0],2);for(let row=0;row<3;row++)for(let i=0;i<5-row;i++){const x=36+row*7+i*14,y=48+row*13;path(g,`M${x} ${y}v10`,c[0],.6);svg(g,'polygon',{points:`${x},${y+8} ${x+4},${y+14} ${x},${y+22} ${x-4},${y+14}`,fill:i%2?c[1]:c[2],stroke:c[3],'stroke-width':.6});}circle(g,64,42,6,c[3]);
  }else if(motif==='celestial'){
    circle(g,64,51,34,c[0],c[1]);for(const r of [16,25,31])svg(g,'ellipse',{cx:64,cy:51,rx:r,ry:r*.65,fill:'none',stroke:c[1],'stroke-width':.8,transform:`rotate(${r*3} 64 51)`});star(g,64,51,10,c[4]);for(const [x,y,r,color]of [[42,35,5,c[2]],[85,43,4,c[3]],[53,76,3,c[4]]])circle(g,x,y,r,color,c[1]);for(const [x,y]of [[48,53],[76,28],[78,74]])star(g,x,y,2.4,c[4]);
  }else{
    for(let i=0;i<6;i++){const x=28+i*12,h=56+Math.sin(i*Math.PI/5)*10;rect(g,x,20,11,h,c[i%3],3,c[3]);path(g,`M${x+5} ${h+13}q-8-23 2-43`,c[3],.8);for(let k=0;k<4;k++){svg(g,'ellipse',{cx:x+5+(k%2?2:-2),cy:34+k*8,rx:3,ry:7,fill:c[(i+1)%3],stroke:c[3],'stroke-width':.5,transform:`rotate(${k%2?30:-30} ${x+5} ${34+k*8})`});}path(g,`M${x+5} ${20+h}v8`,c[3],.7);circle(g,x+5,29+h,2,c[4]);}
    star(g,64,50,10,c[3]);circle(g,64,50,4,c[5]);
  }
  if(premium)for(const [x,y]of [[19,20],[110,32],[22,83]])star(g,x,y,3,c[2]);
}

export function drawBuiltinIllustration(svg,art,sku){
  const ids=['sofa','table','lamp','rug','lamp-cabinet','plant-shelf','wall-pictures','floor-pot','ottoman-a','ottoman-b','front-fence'];if(!ids.includes(sku))return false;
  const s=(tag,attrs)=>svg(art,tag,attrs),r=(x,y,w,h,c,rx=3)=>s('rect',{x,y,width:w,height:h,rx,fill:c}),p=(d,c,w=2)=>s('path',{d,fill:'none',stroke:c,'stroke-width':w,'stroke-linecap':'round'});
  if(sku==='sofa'){r(30,35,68,43,'#dfb477',12);r(26,55,76,29,'#e9c58e',8);r(34,55,28,18,'#f5dba7',6);r(66,55,28,18,'#f5dba7',6);r(24,51,12,34,'#e4bd83',6);r(92,51,12,34,'#e4bd83',6);for(const x of [34,87])r(x,83,6,7,'#9e7650',2);r(39,40,16,16,'#bd9270',4);r(74,40,16,16,'#f0dda9',4);p('M40 45h12m26 3h8','#d9b78b',1);}
  else if(sku==='table'){for(const x of [34,88])r(x,62,6,28,'#a9805c',2);r(26,42,77,27,'#d2a979',10);r(28,41,73,18,'#f2d5a7',8);p('M37 48h49','#e4be8b',1);}
  else if(sku==='lamp'){s('ellipse',{cx:64,cy:85,rx:23,ry:6,fill:'#c8a87f'});r(61,50,6,33,'#d9b875',2);s('path',{d:'M46 28h36l13 30q-30 9-62 0Z',fill:'#fff3ca',stroke:'#dfc283','stroke-width':1.3});s('ellipse',{cx:64,cy:57,rx:29,ry:5,fill:'#f7dfa7'});r(58,23,12,7,'#d1b371',3);}
  else if(sku==='rug'){const g=s('g',{transform:'translate(64 53) scale(1 .65) rotate(-25)'});svg(g,'rect',{x:-39,y:-32,width:78,height:64,rx:6,fill:'#dce6b5',stroke:'#a6b77d','stroke-width':2});svg(g,'rect',{x:-33,y:-26,width:66,height:52,rx:4,fill:'none',stroke:'#a6b77d','stroke-width':1.1,'stroke-dasharray':'4 3'});for(const [x,y]of [[-23,-16],[23,16]])svg(g,'path',{d:`M${x-6} ${y+7}q6-10 12-14m-9 7 4 0m1-4 4 1`,stroke:'#a6b77d','stroke-width':2,fill:'none'});}
  else if(sku==='lamp-cabinet'){r(31,30,66,55,'#f3dfba',6);r(28,26,72,9,'#d7ae77',4);r(37,38,23,37,'#e8cba0',3);r(66,38,23,37,'#e8cba0',3);s('circle',{cx:55,cy:56,r:2,fill:'#a9895b'});s('circle',{cx:71,cy:56,r:2,fill:'#a9895b'});for(const x of [37,85])r(x,82,6,7,'#a9895b',2);}
  else if(sku==='plant-shelf'){for(const x of [36,86])r(x,25,5,64,'#bc966c',2);for(const y of [39,61,83])r(31,y,66,5,'#dec092',2);for(const [x,y]of [[49,28],[76,50]]){r(x-6,y,12,10,'#d5a88e',2);p(`M${x} ${y}v-16`,'#8ba878',2);for(const k of [-1,1])s('ellipse',{cx:x+k*5,cy:y-8,rx:4,ry:7,fill:k<0?'#a1bf8f':'#7e9d75',transform:`rotate(${k*30} ${x} ${y-8})`});}r(45,70,9,13,'#b7acc8',1);r(57,70,9,13,'#a4bdc3',1);}
  else if(sku==='wall-pictures'){for(const [x,y,c]of [[27,27,'#91b8bc'],[65,35,'#dcb273']]){r(x,y,35,43,'#cfa66f',3);r(x+4,y+4,27,35,'#fff4db',1);r(x+8,y+13,19,15,c,1);}}
  else if(sku==='floor-pot'){s('path',{d:'m44 63 5 24h30l5-24Z',fill:'#c49d82'});r(41,61,46,7,'#d8b69d',3);for(let i=0;i<7;i++){const x=43+i*7;s('ellipse',{cx:x,cy:44-Math.sin(i)*5,rx:5,ry:19,fill:i%2?'#9dbb80':'#80a371',transform:`rotate(${-35+i*11} ${x} 54)`});}}
  else if(sku.startsWith('ottoman')){for(const x of [36,87])r(x,74,5,13,'#ae875e',2);r(28,48,74,31,sku==='ottoman-a'?'#ead08e':'#cbd798',8);r(30,43,70,22,'#f5e7bd',7);p('M37 49h55','#e6d5a9',1);}
  else{for(let x=31;x<101;x+=14)r(x,30,5,56,'#f4e8c9',3);r(27,45,80,6,'#e4d3ae',2);r(27,68,80,6,'#e4d3ae',2);}
  return true;
}
