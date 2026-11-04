/** Ball uses swept, short substeps so fast kicks cannot tunnel through furniture. */
export const BALL_RADIUS=.22;
export function advanceBall(ball,dt,{bounds,blocked=()=>false}={}){
  if(!bounds||!Number.isFinite(dt)||dt<=0)return ball;
  dt=Math.min(dt,.12);const steps=Math.max(1,Math.ceil(dt*Math.max(1,Math.hypot(ball.vx,ball.vz))/.05)),h=dt/steps;
  for(let n=0;n<steps;n++){
    const x=ball.x+ball.vx*h,z=ball.z+ball.vz*h;
    if(x<bounds.minX||x>bounds.maxX||blocked(x,ball.z)){ball.vx*=-.68;}else ball.x=x;
    if(z<bounds.minZ||z>bounds.maxZ||blocked(ball.x,z)){ball.vz*=-.68;}else ball.z=z;
    if(ball.y>BALL_RADIUS+.09+.00001||ball.vy>0){
      ball.vy-=7.5*h;ball.y+=ball.vy*h;
      if(ball.y<BALL_RADIUS+.09){ball.y=BALL_RADIUS+.09;ball.vy=Math.abs(ball.vy)>.35?Math.abs(ball.vy)*.48:0;}
    }else{ball.y=BALL_RADIUS+.09;ball.vy=0;}
    const friction=Math.exp(-1.4*h);ball.vx*=friction;ball.vz*=friction;
  }
  if(Math.hypot(ball.vx,ball.vz)<.015){ball.vx=0;ball.vz=0;}return ball;
}
export function petRegionFor(object,model){
  for(let node=object;node&&node!==model;node=node.parent){
    if(/Tail/i.test(node.name))return 'tail';
    if(/Head|Neck|Ear|Eye|Muzzle|Nose|Beak|Face/i.test(node.name))return 'head';
    if(/Paw|Hand|Foot|Knee|Hip|Shoulder|Arm|Flipper/i.test(node.name))return 'paws';
  }
  return 'body';
}
