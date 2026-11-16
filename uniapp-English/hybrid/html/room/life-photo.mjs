import {createRequestId} from './request-id.mjs';
export async function drawLifePhoto(canvas,{image,title='',caption='',frame='cream',sticker='⭐',zoom=1}={}){
 const win=canvas.ownerDocument.defaultView,picture=new win.Image();await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(new Error('照片无法打开，请重新拍摄'));picture.src=image;});
 canvas.width=960;canvas.height=600;const c=canvas.getContext('2d'),colors={cream:['#faf3df','#756248'],forest:['#e6efdc','#506c42'],stars:['#e6e7f3','#5b5c8c'],candy:['#fae3e8','#985b73']},palette=colors[frame]||colors.cream;
 c.fillStyle=palette[0];c.fillRect(0,0,960,600);c.save();c.beginPath();c.rect(24,24,912,480);c.clip();
 const scale=Math.max(912/picture.width,480/picture.height)*Math.max(1,Math.min(1.5,Number(zoom)||1)),w=picture.width*scale,h=picture.height*scale;c.drawImage(picture,24+(912-w)/2,24+(480-h)/2,w,h);c.restore();
 c.fillStyle=palette[1];c.textAlign='left';c.font='bold 27px system-ui';c.fillText([...title].slice(0,26).join(''),30,544,850);c.font='19px system-ui';c.fillText([...caption].slice(0,40).join(''),30,577,850);
 if(sticker){c.font='56px system-ui';c.textAlign='right';c.fillText(sticker,920,83);}return canvas;
}
export function photoJpeg(canvas){let quality=.78,image=canvas.toDataURL('image/jpeg',quality);while(image.length>175000&&quality>.30){quality-=.10;image=canvas.toDataURL('image/jpeg',quality);}if(image.length>180000)throw new Error('这张照片太大，试试降低缩放或重新拍摄');return image;}
export async function exportLifePhoto({image,title='我的小屋作品',doc=document}={}){
 const win=doc.defaultView,plus=win.plus;
 if(plus?.nativeObj?.Bitmap&&plus?.gallery?.save){
  const id='room-photo-'+createRequestId(win.crypto),bitmap=new plus.nativeObj.Bitmap(id);
  try{await new Promise((resolve,reject)=>bitmap.loadBase64Data(image,resolve,reject));const saved=await new Promise((resolve,reject)=>bitmap.save('_doc/'+id+'.jpg',{overwrite:false,format:'jpg',quality:90},resolve,reject));await new Promise((resolve,reject)=>plus.gallery.save(saved.target,resolve,reject));return {ok:true,message:'作品已保存到手机相册'};}
  catch{throw new Error('手机相册保存未完成，请确认相册权限；作品仍保留在小屋相册中');}finally{bitmap.clear();}
 }
 const link=doc.createElement('a');link.href=image;link.download=title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').slice(0,40)+'.jpg';doc.body.append(link);link.click();link.remove();return {ok:true,message:'已开始下载作品；若浏览器显示图片，可长按或右键保存'};
}
