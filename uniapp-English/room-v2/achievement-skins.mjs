import {BADGES} from './profile.mjs';
const names=['晨光初印','三朵小花','七星一周','双蔓约定','月相长卷','七日邮票','花格月历','百日烟火','书页初香','知识星图','书海长廊','青山启程','羽翼探索','十级宝冠','礼物丝带','新屋暖窗','蜂巢珍藏','金叶小铺','梦幻城堡'];
const palettes=[['#fff1c7','#e5a348'],['#ffe3ef','#dc82a4'],['#e0e5ff','#7778bf'],['#d9efe0','#6c9c7a'],['#e7e5ff','#9181be'],['#def2ef','#67a99f'],['#fff0db','#d79b6c'],['#e7e2f7','#977db9'],['#f5e8cd','#ab8d57'],['#dcecf9','#6c98bc'],['#e1efdc','#7c9d6d'],['#e7f0dc','#8caa73'],['#e5e6ff','#9991c3'],['#f5e9b9','#c7a448'],['#ffe2de','#d88b80'],['#e1efe9','#80ad9b'],['#fff1c9','#c9a45d'],['#e7edcb','#a6af67'],['#f5dfee','#b483a9']];
export const ACHIEVEMENT_SKINS=Object.freeze(BADGES.map((badge,index)=>Object.freeze({id:badge.id,badgeId:badge.id,name:names[index],motif:index,colors:Object.freeze(palettes[index])})));
export const skinForAchievement=id=>ACHIEVEMENT_SKINS.find(skin=>skin.id===id)||null;
/** Each achievement has its own procedural motif, in addition to a different palette. */
export function drawAchievementSkin(ctx,skin,size=256){
  if(!ctx||!skin)return false;const index=skin.motif,[base,ink]=skin.colors;
  ctx.save();ctx.scale(size/256,size/256);ctx.fillStyle=base;ctx.fillRect(0,0,256,256);ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
  const line=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  const circle=(x,y,r,fill=true)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);fill?ctx.fill():ctx.stroke();};
  const star=(x,y,r=13)=>{ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rad=i%2?r*.42:r;const px=x+Math.cos(a)*rad,py=y+Math.sin(a)*rad;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();};
  const flower=(x,y,r=8)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;circle(x+Math.cos(a)*r,y+Math.sin(a)*r,r*.7);}ctx.fillStyle=base;circle(x,y,r*.45);ctx.fillStyle=ink;};
  const house=(x,y,s=1)=>{line([[x-16*s,y],[x,y-17*s],[x+16*s,y]]);ctx.strokeRect(x-12*s,y,24*s,22*s);ctx.fillRect(x-3*s,y+9*s,6*s,13*s);};
  const crown=(x,y,s=1)=>{line([[x-19*s,y+13*s],[x-22*s,y-12*s],[x-7*s,y-2*s],[x,y-21*s],[x+7*s,y-2*s],[x+22*s,y-12*s],[x+19*s,y+13*s],[x-19*s,y+13*s]]);};
  for(const y of [48,128,208])for(const x of [48,128,208]){
    switch(index){
      case 0:circle(x,y,13);for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[x+Math.cos(a)*20,y+Math.sin(a)*20],[x+Math.cos(a)*27,y+Math.sin(a)*27]]);}break;
      case 1:for(const dx of [-17,0,17])flower(x+dx,y+(dx===0?-10:9),6);break;
      case 2:for(let i=0;i<7;i++){const a=i*Math.PI*2/7;star(x+Math.cos(a)*22,y+Math.sin(a)*22,6);}break;
      case 3:for(const dx of [-8,8]){line([[x+dx,y-28],[x+dx,y+28]]);for(let i=-2;i<=2;i++){ctx.beginPath();ctx.ellipse(x+dx+(i%2?7:-7),y+i*10,9,4,i%2?.6:-.6,0,Math.PI*2);ctx.fill();}}break;
      case 4:circle(x,y,23);ctx.fillStyle=base;circle(x+10,y-6,21);ctx.fillStyle=ink;star(x-22,y-20,6);break;
      case 5:ctx.setLineDash([4,4]);ctx.strokeRect(x-25,y-27,50,54);ctx.setLineDash([]);star(x,y,17);break;
      case 6:for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){if((i+j)%2===0)ctx.fillRect(x+i*17-8,y+j*17-8,16,16);}flower(x,y,7);break;
      case 7:for(let i=0;i<12;i++){const a=i*Math.PI/6;line([[x+Math.cos(a)*9,y+Math.sin(a)*9],[x+Math.cos(a)*29,y+Math.sin(a)*29]]);}circle(x,y,4);break;
      case 8:line([[x-24,y-20],[x,y-13],[x+24,y-20],[x+24,y+20],[x,y+27],[x-24,y+20],[x-24,y-20]]);line([[x,y-13],[x,y+27]]);break;
      case 9:line([[x-24,y+17],[x-10,y-20],[x+15,y-10],[x+24,y+20],[x-24,y+17]]);for(const[p,q]of [[-24,17],[-10,-20],[15,-10],[24,20]])star(x+p,y+q,7);break;
      case 10:for(const dy of [-17,10]){line([[x-27,y+dy+15],[x+27,y+dy+15]]);for(let i=0;i<5;i++)ctx.strokeRect(x-23+i*10,y+dy-10,7,24);}break;
      case 11:line([[x-30,y+23],[x-8,y-24],[x+6,y+3],[x+20,y-10],[x+31,y+23]]);line([[x-15,y-9],[x-8,y-4],[x,y-7]]);break;
      case 12:for(const sign of [-1,1]){line([[x,y+20],[x+sign*27,y-18],[x+sign*22,y+8],[x+sign*13,y+5],[x+sign*9,y+15],[x,y+20]]);}break;
      case 13:crown(x,y,1);circle(x,y+2,4);break;
      case 14:ctx.strokeRect(x-21,y-17,42,38);line([[x,y-17],[x,y+21]]);line([[x-21,y-3],[x+21,y-3]]);ctx.beginPath();ctx.ellipse(x-10,y-22,11,6,-.5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(x+10,y-22,11,6,.5,0,Math.PI*2);ctx.stroke();break;
      case 15:house(x,y-4,1.3);ctx.strokeRect(x+6,y-4,9,10);break;
      case 16:for(const dx of [-17,17]){ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;const px=x+dx+Math.cos(a)*18,py=y+Math.sin(a)*18;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}break;
      case 17:for(const dx of [-15,0,15]){circle(x+dx,y+Math.abs(dx)*.5,10,false);line([[x+dx,y+Math.abs(dx)*.5-4],[x+dx,y+Math.abs(dx)*.5+4]]);}break;
      case 18:for(const dx of [-19,19]){ctx.strokeRect(x+dx-7,y-8,14,31);line([[x+dx-10,y-8],[x+dx,y-26],[x+dx+10,y-8]]);}ctx.strokeRect(x-12,y+1,24,22);crown(x,y-7,.5);break;
    }
  }
  ctx.restore();return true;
}
