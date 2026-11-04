/** Portable vector marks: no data URLs, executable content, or device pixel coordinates in saves. */
export const DRAWING_LIMITS=Object.freeze({strokes:64,points:2048,bytes:50000});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const round=value=>Math.round(value*10000)/10000;
function record(value,keys){
  if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('手绘内容格式有误');
  for(const key of Object.keys(value))if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))throw new TypeError('手绘内容不能包含访问器');
}
function list(value){if(!Array.isArray(value)||Object.keys(value).length!==value.length)throw new TypeError('手绘线条有空缺');for(let i=0;i<value.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))||{},'value'))throw new TypeError('手绘内容不能包含访问器');}
export function validateFurnitureDrawing(value){
  if(value===null||value===undefined)return null;
  record(value,['version','strokes']);if(value.version!==1)throw new TypeError('这个手绘版本还不能打开');
  list(value.strokes);if(value.strokes.length>DRAWING_LIMITS.strokes)throw new TypeError('这张画已经有64笔啦，先保存或撤销一笔');
  let count=0;
  const strokes=value.strokes.map(stroke=>{
    record(stroke,['tool','color','size','points']);
    if(!['brush','eraser'].includes(stroke.tool)||typeof stroke.color!=='string'||!/^#[0-9a-f]{6}$/i.test(stroke.color)||!Number.isFinite(stroke.size)||stroke.size<.002||stroke.size>.16)throw new TypeError('画笔设置有误');
    list(stroke.points);if(!stroke.points.length||(count+=stroke.points.length)>DRAWING_LIMITS.points)throw new TypeError('这张画的线条已经很丰富啦，先保存或撤销一笔');
    const points=stroke.points.map(point=>{list(point);if(point.length!==2||point.some(n=>!Number.isFinite(n)||n<0||n>1))throw new TypeError('手绘坐标需要留在画纸里');return point.map(round);});
    return {tool:stroke.tool,color:stroke.color.toLowerCase(),size:round(stroke.size),points};
  });
  const drawing={version:1,strokes};if(JSON.stringify(drawing).length>DRAWING_LIMITS.bytes)throw new TypeError('这张画太大啦，先撤销几笔');return drawing;
}
export function drawFurnitureDrawing(ctx,value,width,height){
  if(!ctx)return false;
  const drawing=validateFurnitureDrawing(value);
  ctx.save();
  try{
    ctx.clearRect(0,0,width,height);
    for(const stroke of drawing?.strokes||[]){
      ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.size*Math.min(width,height);ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();
      const [first,...rest]=stroke.points;ctx.moveTo(first[0]*width,first[1]*height);
      if(!rest.length){ctx.arc(first[0]*width,first[1]*height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
      else{for(const point of rest)ctx.lineTo(point[0]*width,point[1]*height);ctx.stroke();}
    }
  }finally{ctx.restore();}
  return true;
}
export function createDrawingHistory(initial=null){
  let current=validateFurnitureDrawing(initial)||{version:1,strokes:[]},undo=[],redo=[];
  const clone=()=>JSON.parse(JSON.stringify(current));
  function replace(next){next=validateFurnitureDrawing(next)||{version:1,strokes:[]};if(JSON.stringify(next)===JSON.stringify(current))return false;undo.push(current);if(undo.length>64)undo.shift();redo=[];current=next;return true;}
  return {get value(){return clone();},get canUndo(){return undo.length>0;},get canRedo(){return redo.length>0;},push(stroke){return replace({version:1,strokes:[...current.strokes,stroke]});},clear(){return replace(null);},undo(){if(!undo.length)return false;redo.push(current);current=undo.pop();return true;},redo(){if(!redo.length)return false;undo.push(current);current=redo.pop();return true;}};
}
